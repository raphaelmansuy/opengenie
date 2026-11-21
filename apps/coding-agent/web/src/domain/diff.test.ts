import { describe, expect, it } from "vitest";
import { parseUnifiedDiff, toSplitRows } from "./diff";

const SAMPLE = [
  "--- a/revenue.py",
  "+++ b/revenue.py",
  "@@ -10,4 +10,5 @@ Cell 2",
  " SELECT",
  "-  date_trunc('month', pickup_datetime) AS month,",
  "+  date_trunc('month', tpep_pickup_datetime) AS month,",
  "+  COUNT(*) AS trips,",
  "   SUM(fare_amount) AS total",
].join("\n");

describe("parseUnifiedDiff & toSplitRows", () => {
  it("parses hunks, line numbers, and +added/-removed stats cleanly", () => {
    const parsed = parseUnifiedDiff(SAMPLE);
    expect(parsed.empty).toBe(false);
    expect(parsed.added).toBe(2);
    expect(parsed.removed).toBe(1);
    expect(parsed.truncated).toBe(false);
    const delLine = parsed.lines.find((l) => l.kind === "del");
    const addLines = parsed.lines.filter((l) => l.kind === "add");
    expect(delLine?.oldNum).toBe(11);
    expect(delLine?.newNum).toBeNull();
    expect(addLines.map((l) => l.newNum)).toEqual([11, 12]);
  });

  it("aligns contiguous deletions and additions in split rows", () => {
    const parsed = parseUnifiedDiff(SAMPLE);
    const rows = toSplitRows(parsed.lines);
    const pairRows = rows.filter((r) => r.kind === "pair");
    expect(pairRows[1].left?.kind).toBe("del");
    expect(pairRows[1].right?.kind).toBe("add");
    expect(pairRows[2].left).toBeNull();
    expect(pairRows[2].right?.kind).toBe("add");
  });

  it("handles empty, whitespace, and non-unified CRLF diffs gracefully (E01, E05)", () => {
    expect(parseUnifiedDiff("").empty).toBe(true);
    expect(parseUnifiedDiff("   \n\t ").empty).toBe(true);
    expect(parseUnifiedDiff(undefined).empty).toBe(true);
    const adhoc = parseUnifiedDiff("-old line\r\n+new line\r\n same");
    expect(adhoc.added).toBe(1);
    expect(adhoc.removed).toBe(1);
    expect(adhoc.lines[0].oldNum).toBe(1);
    expect(adhoc.lines[1].newNum).toBe(1);
  });

  it("bounds giant diffs to maxLines while keeping exact counts (E02)", () => {
    const big = Array.from({ length: 2000 }, (_, i) => `+line ${i}`).join("\n");
    const parsed = parseUnifiedDiff(big, 100);
    expect(parsed.lines).toHaveLength(100);
    expect(parsed.truncated).toBe(true);
    expect(parsed.omittedLines).toBe(1900);
    expect(parsed.added).toBe(2000);
  });
});
