/** Context pressure, prompt-cache observability, and compaction eligibility. Pure, no React/DOM. */

import type { Turn } from "./events";

export type PressureTone = "unknown" | "healthy" | "elevated" | "critical";

export interface ContextMeterView {
  percent: number | null;
  tone: PressureTone;
  usedTokens: number;
  contextWindow: number;
  tokenSummary: string;
  cacheHitRate: number | null;
  costLabel: string;
  canCompact: boolean;
  suggestCompact: boolean;
}

export interface ContextMeterInput {
  usage?: {
    contextUsedTokens?: number;
    contextWindow?: number;
    costUsd?: number;
    costStatus?: string;
  } | null;
  turns?: Turn[];
  running?: boolean;
  hasSession?: boolean;
}

export function formatCompactTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

/** Compute context pressure tone, cache hit-rate, and compaction eligibility in O(T). */
export function contextMeterState(input: ContextMeterInput): ContextMeterView {
  const usedRaw = Number(input.usage?.contextUsedTokens ?? 0);
  const winRaw = Number(input.usage?.contextWindow ?? 0);
  const usedTokens = Number.isFinite(usedRaw) && usedRaw > 0 ? usedRaw : 0;
  const contextWindow = Number.isFinite(winRaw) && winRaw > 0 ? winRaw : 0;

  let percent: number | null = null;
  let tone: PressureTone = "unknown";
  if (contextWindow > 0) {
    percent = Math.max(0, Math.min(100, Math.round((usedTokens / contextWindow) * 100)));
    tone = percent >= 90 ? "critical" : percent >= 70 ? "elevated" : "healthy";
  }

  let totalInput = 0;
  let totalCached = 0;
  for (const turn of input.turns ?? []) {
    const inp = Number(turn.usage?.input ?? 0);
    const cached = Number(turn.usage?.cached ?? 0);
    if (Number.isFinite(inp) && inp > 0) totalInput += inp;
    if (Number.isFinite(cached) && cached > 0) totalCached += cached;
  }
  const cacheHitRate =
    totalInput > 0 && totalCached > 0
      ? Math.max(0, Math.min(100, Math.round((totalCached / totalInput) * 100)))
      : null;

  const costUsd = Number(input.usage?.costUsd ?? 0);
  const costLabel =
    input.usage?.costStatus === "known" && Number.isFinite(costUsd)
      ? `$${costUsd.toFixed(4)}`
      : "Cost unknown";

  const tokenSummary =
    contextWindow > 0 ? `${formatCompactTokens(usedTokens)} / ${formatCompactTokens(contextWindow)}` : "";

  const completedTurns = (input.turns ?? []).filter((t) => t.status === "completed").length;
  const canCompact = Boolean(input.hasSession) && !input.running && completedTurns >= 1;
  const suggestCompact = tone === "elevated" || tone === "critical";

  return {
    percent,
    tone,
    usedTokens,
    contextWindow,
    tokenSummary,
    cacheHitRate,
    costLabel,
    canCompact,
    suggestCompact,
  };
}
