import { describe, expect, it } from "vitest";
import { classifyCellError } from "./cellerror";
import { diagnosePrompt } from "./cellprompt";

describe("classifyCellError & diagnosePrompt", () => {
  it("classifies Databricks UC permission, missing object, SQL syntax, timeout, and Python errors", () => {
    expect(classifyCellError("[PERMISSION_DENIED] User does not have SELECT on main.sales").kind).toBe("permission");
    expect(classifyCellError("[UNRESOLVED_COLUMN.WITH_SUGGESTION] `pickup_datetime` cannot be resolved").kind).toBe("missing_object");
    expect(classifyCellError("[PARSE_SYNTAX_ERROR] Syntax error at or near 'FROM'").kind).toBe("sql_syntax");
    expect(classifyCellError("STATEMENT_TIMEOUT: warehouse query timed out after 300s").kind).toBe("timeout");
    expect(classifyCellError("Traceback (most recent call last):\nKeyError: 'amount'").kind).toBe("python_error");
  });

  it("handles empty or unknown errors gracefully (E13)", () => {
    expect(classifyCellError("")).toEqual({ kind: "runtime", label: "Execution error", tone: "danger" });
    expect(classifyCellError(null)).toEqual({ kind: "runtime", label: "Execution error", tone: "danger" });
  });

  it("diagnosePrompt forbids edits/runs and trims massive stack traces (E14)", () => {
    const huge = "UNRESOLVED_COLUMN: " + "x".repeat(5000);
    const p = diagnosePrompt(2, huge, "Missing table or column");
    expect(p).toContain("Cell 2 failed (Missing table or column).");
    expect(p).toContain("Do not modify any cell or run code.");
    expect(p.length).toBeLessThan(900);
  });
});
