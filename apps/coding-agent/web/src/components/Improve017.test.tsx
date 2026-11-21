import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DiffView } from "./work/DiffView";
import { WorkComposerBar } from "./work/controls";
import { Context, type Model } from "./work/model";
import { AgentMeter } from "./AgentMeter";
import { CellOutput } from "./CellOutput";
import { Markdown } from "./Markdown";
import { InsertNotebookCell } from "./DocContext";
import { TurnView } from "./Transcript";
import type { SessionView, Turn } from "../domain/events";
import type { CellRun } from "../domain/cellrun";

const SAMPLE_DIFF = [
  "--- a/revenue.py",
  "+++ b/revenue.py",
  "@@ -10,3 +10,4 @@ Cell 2",
  " SELECT",
  "-  pickup_datetime,",
  "+  tpep_pickup_datetime,",
  "+  COUNT(*) AS trips,",
  "   SUM(fare_amount)",
].join("\n");

describe("Spec 017 UI components", () => {
  it("DiffView renders stats, toggles Unified/Split, and handles clipboard denial gracefully (E01, E04)", async () => {
    const { rerender } = render(<DiffView diff={SAMPLE_DIFF} />);
    expect(screen.getByText("+2")).toBeTruthy();
    expect(screen.getByText("−1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unified" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Split" }));
    expect(screen.getByRole("button", { name: "Split" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/tpep_pickup_datetime/)).toBeTruthy();

    // Clipboard failure shows honest feedback instead of throwing
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy diff" }));
    await waitFor(() => expect(screen.getByText("Copy unavailable")).toBeTruthy());

    rerender(<DiffView diff="   " />);
    expect(screen.getByText("No line diff attached.")).toBeTruthy();
  });

  it("WorkComposerBar displays policy hint, pending badge, and Escape-dismissible tools popover (E18)", () => {
    const act = vi.fn().mockResolvedValue(undefined);
    const model: Model = {
      reviewing: false,
      setReviewing: vi.fn(),
      error: "",
      busy: false,
      act,
      reload: vi.fn().mockResolvedValue(undefined),
      data: {
        mode: "review",
        usedTokens: 0,
        usedCost: 0,
        currency: "USD",
        toolCount: 13,
        change: [{ id: "c1", state: "awaiting_review", asset: { kind: "notebook", id: "/Shared/a.py" } }],
        operation: [],
        resource: [],
        approval: [],
        capabilities: [
          { kind: "notebook", label: "Notebooks", tier: "A", read: true, change: true, run: true },
          { kind: "table", label: "Tables", tier: "A", read: true, change: false, run: false },
        ],
        fence: { folder: "/Shared/Analytics", schema: "main.dev" },
      },
    };
    render(
      <Context.Provider value={model}>
        <WorkComposerBar />
      </Context.Provider>,
    );
    expect(screen.getByText("Approve writes & runs")).toBeTruthy();
    expect(screen.getByText("1 pending")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /13 tools available/i }));
    expect(screen.getByRole("dialog", { name: /Active session tools/i })).toBeTruthy();
    expect(screen.getByText("/Shared/Analytics")).toBeTruthy();
    expect(screen.getByText("Notebooks")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /Active session tools/i })).toBeNull();
  });

  it("AgentMeter shows pressure tone, prompt-cache hit-rate, and invokes Compact safely (E06, E09)", async () => {
    const onCompact = vi.fn().mockResolvedValue({ changed: true, summarised: ["t2", "t3"] });
    const session: SessionView = {
      id: "s1",
      title: "Test",
      status: "idle",
      model: "fake/model",
      folder: "/Shared",
      schema: null,
      tools: 0,
      agent: "opencode",
      agentVersion: "1.0",
      turns: [
        {
          id: "t1",
          index: 1,
          prompt: "p",
          model: "fake/model",
          status: "completed",
          thought: "",
          answer: "ok",
          tools: [],
          evidence: [],
          auditPasses: 0,
          usage: { input: 10000, output: 500, cached: 7000 },
        },
      ],
      approvals: [],
      meter: { used: 105_000, size: 128_000, cost: { amount: 0.0185, currency: "USD" } },
    };
    render(<AgentMeter session={session} onCompact={onCompact} />);
    expect(screen.getByText("Context 82%")).toBeTruthy();
    expect(screen.getByText("70% cached")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Compact" }));
    await waitFor(() => expect(screen.getByText("Compacted 2 turns")).toBeTruthy());
    expect(onCompact).toHaveBeenCalledTimes(1);
  });

  it("CellOutput classifies failed Databricks cell and separates Diagnose error from Fix with agent (E15, E16)", () => {
    const onFix = vi.fn();
    const onDiagnose = vi.fn();
    const run: CellRun = {
      state: "failed",
      seconds: 0.42,
      outputs: [],
      error: "[UNRESOLVED_COLUMN.WITH_SUGGESTION] `pickup_datetime` cannot be resolved <script>x</script>",
    };
    const { rerender } = render(<CellOutput run={run} onClear={vi.fn()} onFix={onFix} onDiagnose={onDiagnose} />);
    expect(screen.getByText("Missing table or column")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Diagnose error" }));
    expect(onDiagnose).toHaveBeenCalledWith("Missing table or column");
    fireEvent.click(screen.getByRole("button", { name: /Fix with agent/i }));
    expect(onFix).toHaveBeenCalledTimes(1);

    // Read-only omits action buttons while keeping classification pill (E15)
    rerender(<CellOutput run={run} onClear={vi.fn()} />);
    expect(screen.getByText("Missing table or column")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Diagnose error" })).toBeNull();
  });

  it("Markdown shows Insert cell only when writable notebook context is active (E19, E21)", () => {
    const onInsert = vi.fn().mockReturnValue(true);
    const md = "Try this:\n\n```python\ndf.groupBy('month').sum('fare_amount')\n```";
    const { rerender } = render(
      <InsertNotebookCell.Provider value={null}>
        <Markdown text={md} surface="answer" />
      </InsertNotebookCell.Provider>,
    );
    expect(screen.queryByRole("button", { name: "Insert cell" })).toBeNull();

    rerender(
      <InsertNotebookCell.Provider value={onInsert}>
        <Markdown text={md} surface="answer" />
      </InsertNotebookCell.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Insert cell" }));
    expect(onInsert).toHaveBeenCalledWith("df.groupBy('month').sum('fare_amount')", "python");
    expect(screen.getByText("Inserted")).toBeTruthy();
  });

  it("Transcript displays explicit evidence grade pills and contradiction reasons inline (E25, E26)", () => {
    const turn: Turn = {
      id: "t1",
      index: 1,
      prompt: "Check revenue",
      model: "fake/model",
      status: "completed",
      thought: "",
      answer: "Checked.",
      tools: [{ callId: "c1", name: "dbx_run_sql", status: "completed", summary: "ok" }],
      evidence: [
        { requirement: "Query returned monthly revenue", tool: "dbx_run_sql", toolCallId: "c1", summary: "ok", verified: true, grade: "verified" },
        { requirement: "Notebook saved", tool: "dbx_edit", toolCallId: "c2", summary: "missing", verified: false, grade: "contradicted", reason: "No matching write invocation found" },
      ],
      auditPasses: 1,
    };
    render(<TurnView turn={turn} />);
    expect(screen.getByText("Verified")).toBeTruthy();
    expect(screen.getByText("Contradicted")).toBeTruthy();
    expect(screen.getByText("No matching write invocation found")).toBeTruthy();
  });
});
