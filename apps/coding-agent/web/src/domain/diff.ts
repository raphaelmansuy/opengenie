/** Single-pass O(n) unified diff parser and side-by-side split row aligner. Pure, no React/DOM. */

export type DiffLineKind = "meta" | "hunk" | "add" | "del" | "ctx";

export interface DiffLine {
  kind: DiffLineKind;
  oldNum: number | null;
  newNum: number | null;
  text: string;
}

export interface SplitRow {
  kind: "hunk" | "meta" | "pair";
  hunkText?: string;
  left: DiffLine | null;
  right: DiffLine | null;
}

export interface ParsedDiff {
  lines: DiffLine[];
  added: number;
  removed: number;
  totalLines: number;
  truncated: boolean;
  omittedLines: number;
  empty: boolean;
}

export const MAX_DIFF_LINES = 1200;

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Parse unified or ad-hoc +/- diff text in O(min(L, maxLines)) time. */
export function parseUnifiedDiff(raw: string | null | undefined, maxLines = MAX_DIFF_LINES): ParsedDiff {
  if (!raw || !raw.trim()) {
    return { lines: [], added: 0, removed: 0, totalLines: 0, truncated: false, omittedLines: 0, empty: true };
  }
  const normalized = raw.replace(/\r\n?/g, "\n");
  const rawLines = normalized.split("\n");
  // Drop a single trailing empty line produced by trailing newline
  if (rawLines.length > 1 && rawLines[rawLines.length - 1] === "") {
    rawLines.pop();
  }
  const totalLines = rawLines.length;
  const limit = Math.min(totalLines, Math.max(1, maxLines));
  const lines: DiffLine[] = [];
  let oldNum = 1;
  let newNum = 1;
  let added = 0;
  let removed = 0;

  for (let i = 0; i < totalLines; i++) {
    const line = rawLines[i];
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff --git") || line.startsWith("index ")) {
      if (i < limit) lines.push({ kind: "meta", oldNum: null, newNum: null, text: line });
      continue;
    }
    const hunk = HUNK_RE.exec(line);
    if (hunk) {
      oldNum = Number(hunk[1]);
      newNum = Number(hunk[2]);
      if (i < limit) lines.push({ kind: "hunk", oldNum: null, newNum: null, text: line });
      continue;
    }
    if (line.startsWith("+")) {
      added += 1;
      if (i < limit) lines.push({ kind: "add", oldNum: null, newNum: newNum, text: line.slice(1) });
      newNum += 1;
      continue;
    }
    if (line.startsWith("-")) {
      removed += 1;
      if (i < limit) lines.push({ kind: "del", oldNum: oldNum, newNum: null, text: line.slice(1) });
      oldNum += 1;
      continue;
    }
    const body = line.startsWith(" ") ? line.slice(1) : line;
    if (i < limit) lines.push({ kind: "ctx", oldNum, newNum, text: body });
    oldNum += 1;
    newNum += 1;
  }

  const truncated = totalLines > limit;
  return {
    lines,
    added,
    removed,
    totalLines,
    truncated,
    omittedLines: truncated ? totalLines - limit : 0,
    empty: lines.length === 0,
  };
}

/** Convert parsed unified diff lines into aligned side-by-side rows in a single O(n) pass. */
export function toSplitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let i = 0;
  while (i < lines.length) {
    const cur = lines[i];
    if (cur.kind === "hunk" || cur.kind === "meta") {
      rows.push({ kind: cur.kind, hunkText: cur.text, left: null, right: null });
      i += 1;
      continue;
    }
    if (cur.kind === "ctx") {
      rows.push({ kind: "pair", left: cur, right: cur });
      i += 1;
      continue;
    }
    // Pair contiguous deletions with contiguous additions so replacements align horizontally.
    const dels: DiffLine[] = [];
    while (i < lines.length && lines[i].kind === "del") {
      dels.push(lines[i]);
      i += 1;
    }
    const adds: DiffLine[] = [];
    while (i < lines.length && lines[i].kind === "add") {
      adds.push(lines[i]);
      i += 1;
    }
    const span = Math.max(dels.length, adds.length);
    for (let k = 0; k < span; k++) {
      rows.push({ kind: "pair", left: dels[k] ?? null, right: adds[k] ?? null });
    }
  }
  return rows;
}
