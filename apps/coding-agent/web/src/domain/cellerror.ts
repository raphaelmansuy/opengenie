/** Deterministic Databricks cell error classifier. Pure, no React/DOM. */

export type CellErrorKind =
  | "missing_object"
  | "permission"
  | "sql_syntax"
  | "python_error"
  | "timeout"
  | "runtime";

export interface CellErrorClassification {
  kind: CellErrorKind;
  label: string;
  tone: "warn" | "danger" | "info";
}

interface ErrorRule {
  kind: CellErrorKind;
  label: string;
  tone: "warn" | "danger" | "info";
  pattern: RegExp;
}

const RULES: ErrorRule[] = [
  {
    kind: "permission",
    label: "Permission denied",
    tone: "danger",
    pattern: /PERMISSION_DENIED|INSUFFICIENT_PERMISSIONS|Unity Catalog.*privilege|AccessDenied|not authorized|USER_DOES_NOT_HAVE/i,
  },
  {
    kind: "missing_object",
    label: "Missing table or column",
    tone: "warn",
    pattern: /UNRESOLVED_COLUMN|TABLE_OR_VIEW_NOT_FOUND|SCHEMA_NOT_FOUND|CATALOG_NOT_FOUND|FIELD_NOT_FOUND|AnalysisException:.*(cannot be resolved|not found|does not exist)/i,
  },
  {
    kind: "sql_syntax",
    label: "SQL syntax error",
    tone: "warn",
    pattern: /PARSE_SYNTAX_ERROR|ParseException|Syntax error at or near|INVALID_SQL_SYNTAX|DATATYPE_MISMATCH|CAST_INVALID_INPUT/i,
  },
  {
    kind: "timeout",
    label: "Execution timeout",
    tone: "info",
    pattern: /Timed? ?out|DEADLINE_EXCEEDED|STATEMENT_TIMEOUT|warehouse.*stopped|cancelled due to timeout/i,
  },
  {
    kind: "python_error",
    label: "Python exception",
    tone: "danger",
    pattern: /Traceback \(most recent call last\)|(?:NameError|TypeError|ValueError|KeyError|AttributeError|ModuleNotFoundError|ImportError|ZeroDivisionError|SyntaxError):/i,
  },
];

export function classifyCellError(error: string | null | undefined): CellErrorClassification {
  const text = (error ?? "").trim();
  if (!text) return { kind: "runtime", label: "Execution error", tone: "danger" };
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      return { kind: rule.kind, label: rule.label, tone: rule.tone };
    }
  }
  return { kind: "runtime", label: "Execution error", tone: "danger" };
}
