/** Bounded ID-addressed protocol projections, independent of transcript length. */
export interface AgentNotice { type: string; text: string; description?: string; severity?: string }
export interface Compaction {
  id: string; status: string; summary: unknown[]; error?: string | null; firstSequence: number; turnId?: string;
  meta?: unknown; truncated: boolean;
}
const MAX_BLOCKS = 100, MAX_CHARS = 65536, MAX_COMPACTIONS = 20;
function bounded(blocks: unknown[]) {
  const summary: unknown[] = [];
  let size = 0;
  for (const block of blocks.slice(0, MAX_BLOCKS)) {
    const length = JSON.stringify(block)?.length ?? 0;
    if (size + length > MAX_CHARS) break;
    summary.push(block); size += length;
  }
  return { summary, truncated: summary.length < blocks.length };
}
export function patchCompaction(rows: Compaction[] = [], event: Record<string, unknown>): Compaction[] {
  const hasServerPlan = Array.isArray(event.summarised) || typeof event.tokensBefore === "number";
  const cid = typeof event.compactionId === "string" && event.compactionId
    ? event.compactionId
    : hasServerPlan
      ? `cmp_seq_${Number(event.seq ?? 0)}`
      : "";
  if (!cid) return rows;
  const index = rows.findIndex(r => r.id === cid);
  const prior: Compaction = index < 0
    ? {
        id: cid,
        status: hasServerPlan ? "completed" : "in_progress",
        summary: [],
        truncated: false,
        firstSequence: Number(event.seq ?? 0),
        turnId: typeof event.turnId === "string" ? event.turnId : undefined,
      }
    : rows[index];
  let next = { ...prior };
  if (typeof event.status === "string") next.status = event.status;
  if ("summary" in event) {
    if (Array.isArray(event.summary)) {
      next = { ...next, ...bounded(event.summary) };
    } else if (typeof event.summary === "string" && event.summary.trim()) {
      next = { ...next, ...bounded([{ type: "text", text: event.summary.trim() }]) };
    } else if (hasServerPlan && typeof event.tokensBefore === "number" && typeof event.tokensAfter === "number") {
      const count = Array.isArray(event.summarised) ? event.summarised.length : 0;
      const line = `Summarised ${count} turn(s) (${event.tokensBefore} -> ${event.tokensAfter} tokens).`;
      next = { ...next, ...bounded([{ type: "text", text: line }]) };
    } else {
      next = { ...next, ...bounded([]) };
    }
  } else if ("content" in event) {
    const value = bounded([...prior.summary, event.content]);
    next = { ...next, ...value, truncated: prior.truncated || value.truncated };
  }
  if ("error" in event) next.error = typeof event.error === "string" ? event.error.slice(0, 4096) : null;
  if (!("content" in event) && "_meta" in event) next.meta = event._meta === null ? null : bounded([event._meta]).summary[0] ?? null;
  return (index < 0 ? [...rows, next] : rows.map((r, i) => i === index ? next : r)).slice(-MAX_COMPACTIONS);
}
