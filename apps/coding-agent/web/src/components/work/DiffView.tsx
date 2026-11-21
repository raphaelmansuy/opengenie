/** Structured Unified & Split diff viewer for ChangeCard. Pure rendering over domain/diff.ts. */

import { useMemo, useState } from "react";
import { MAX_DIFF_LINES, parseUnifiedDiff, toSplitRows } from "../../domain/diff";

export interface DiffViewProps {
  diff: string;
  defaultMode?: "unified" | "split";
}

export function DiffView({ diff, defaultMode = "unified" }: DiffViewProps) {
  const [mode, setMode] = useState<"unified" | "split">(defaultMode);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const parsed = useMemo(() => parseUnifiedDiff(diff, MAX_DIFF_LINES), [diff]);
  const splitRows = useMemo(
    () => (mode === "split" ? toSplitRows(parsed.lines) : []),
    [mode, parsed.lines],
  );

  if (parsed.empty) {
    return <p className="diff-empty">No line diff attached.</p>;
  }

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("unavailable");
      await navigator.clipboard.writeText(diff);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1600);
    } catch {
      setCopyState("failed");
      window.setTimeout(() => setCopyState("idle"), 2000);
    }
  };

  return (
    <div className="diff-viewer" data-mode={mode}>
      <div className="diff-toolbar">
        <div className="diff-stats" aria-label={`Diff summary: ${parsed.added} added, ${parsed.removed} removed`}>
          <span className="diff-stat is-add">+{parsed.added}</span>
          <span className="diff-stat is-del">−{parsed.removed}</span>
        </div>
        <div className="diff-controls">
          <div className="diff-mode-toggle" role="group" aria-label="Diff layout">
            <button
              type="button"
              className={`diff-mode-btn${mode === "unified" ? " is-active" : ""}`}
              aria-pressed={mode === "unified"}
              onClick={() => setMode("unified")}
            >
              Unified
            </button>
            <button
              type="button"
              className={`diff-mode-btn${mode === "split" ? " is-active" : ""}`}
              aria-pressed={mode === "split"}
              onClick={() => setMode("split")}
            >
              Split
            </button>
          </div>
          <button type="button" className="diff-copy-btn" onClick={() => void copy()}>
            {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy unavailable" : "Copy diff"}
          </button>
        </div>
      </div>

      {parsed.truncated && (
        <p className="diff-truncated" role="status">
          Showing first {parsed.lines.length.toLocaleString()} lines ({parsed.omittedLines.toLocaleString()} more lines omitted).
        </p>
      )}

      <div className="diff-scroll" tabIndex={0} role="region" aria-label="Proposed code diff">
        {mode === "unified" ? (
          <table className="diff-table diff-unified">
            <tbody>
              {parsed.lines.map((line, i) => (
                <tr key={i} className={`diff-row is-${line.kind}`}>
                  <td className="diff-num" aria-hidden>{line.oldNum ?? ""}</td>
                  <td className="diff-num" aria-hidden>{line.newNum ?? ""}</td>
                  <td className="diff-sigil" aria-hidden>
                    {line.kind === "add" ? "+" : line.kind === "del" ? "−" : line.kind === "ctx" ? " " : ""}
                  </td>
                  <td className="diff-code">{line.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="diff-table diff-split">
            <tbody>
              {splitRows.map((row, i) =>
                row.kind === "hunk" || row.kind === "meta" ? (
                  <tr key={i} className={`diff-row is-${row.kind}`}>
                    <td className="diff-code" colSpan={6}>{row.hunkText}</td>
                  </tr>
                ) : (
                  <tr key={i} className="diff-split-row">
                    <td className={`diff-num${row.left ? ` is-${row.left.kind}` : " is-empty"}`} aria-hidden>
                      {row.left?.oldNum ?? ""}
                    </td>
                    <td className={`diff-sigil${row.left ? ` is-${row.left.kind}` : " is-empty"}`} aria-hidden>
                      {row.left?.kind === "del" ? "−" : row.left ? " " : ""}
                    </td>
                    <td className={`diff-code${row.left ? ` is-${row.left.kind}` : " is-empty"}`}>
                      {row.left?.text ?? ""}
                    </td>
                    <td className={`diff-num diff-split-mid${row.right ? ` is-${row.right.kind}` : " is-empty"}`} aria-hidden>
                      {row.right?.newNum ?? ""}
                    </td>
                    <td className={`diff-sigil${row.right ? ` is-${row.right.kind}` : " is-empty"}`} aria-hidden>
                      {row.right?.kind === "add" ? "+" : row.right ? " " : ""}
                    </td>
                    <td className={`diff-code${row.right ? ` is-${row.right.kind}` : " is-empty"}`}>
                      {row.right?.text ?? ""}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
