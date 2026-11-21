/** ACP reports cumulative session cost; never add cumulative updates as turn spend. */
import { useMemo, useState } from "react";
import { contextMeterState } from "../domain/contextmeter";
import type { SessionView } from "../domain/events";

export interface CompactResult {
  changed: boolean;
  reason?: string;
  tokensBefore?: number;
  tokensAfter?: number;
  summarised?: string[];
}

export function AgentMeter({
  session,
  running = false,
  onCompact,
  notice,
}: {
  session: SessionView;
  running?: boolean;
  onCompact?: () => Promise<CompactResult | void>;
  notice?: { tone: "ok" | "info" | "error"; text: string } | null;
}) {
  const m = session.meter;
  const [compacting, setCompacting] = useState(false);
  const [localNotice, setLocalNotice] = useState<{ tone: "ok" | "info" | "error"; text: string } | null>(null);

  const view = useMemo(
    () =>
      contextMeterState({
        usage: m
          ? {
              contextUsedTokens: m.used,
              contextWindow: m.size,
              costUsd: m.cost?.amount,
              costStatus: m.cost ? "known" : "unknown",
            }
          : null,
        turns: session.turns,
        running,
        hasSession: Boolean(session.id),
      }),
    [m, session.turns, session.id, running],
  );

  const activeNotice = notice ?? localNotice;
  if (!m && !activeNotice) return null;

  const triggerCompact = async () => {
    if (!onCompact || compacting || running) return;
    setCompacting(true);
    setLocalNotice(null);
    try {
      const res = await onCompact();
      if (res && res.changed) {
        const count = res.summarised?.length ?? 0;
        setLocalNotice({
          tone: "ok",
          text: count > 0 ? `Compacted ${count} turn${count === 1 ? "" : "s"}` : "Context compacted",
        });
      } else if (res && res.changed === false) {
        setLocalNotice({ tone: "info", text: "Already compact — nothing needed shedding." });
      }
    } catch (e) {
      setLocalNotice({
        tone: "error",
        text: e instanceof Error ? e.message : "Compaction failed.",
      });
    } finally {
      setCompacting(false);
    }
  };

  const costText = m?.cost ? `${m.cost.currency} ${m.cost.amount.toFixed(4)} session` : "Cost unknown";

  return (
    <div className={`agent-meter is-${view.tone}`} aria-label="Context and session cost">
      {m && (
        <div className="agent-meter-row">
          <span
            className="agent-meter-pct"
            title={`${m.used.toLocaleString()} of ${m.size.toLocaleString()} context tokens`}
          >
            Context {view.percent === null ? "unknown" : `${view.percent}%`}
          </span>
          {view.percent !== null && (
            <meter
              className={`agent-meter-bar is-${view.tone}`}
              min={0}
              max={100}
              low={69}
              high={89}
              optimum={30}
              value={view.percent}
              aria-label="Context used"
            />
          )}
          {view.tokenSummary && <span className="agent-meter-tokens">{view.tokenSummary}</span>}
          {view.cacheHitRate !== null && (
            <span
              className="agent-meter-cache"
              title="Prompt tokens served from provider cache across this session"
            >
              {view.cacheHitRate}% cached
            </span>
          )}
          <span className="agent-meter-cost">{costText}</span>
          {onCompact && view.canCompact && (
            <button
              type="button"
              className={`agent-compact-btn${view.suggestCompact ? " is-suggested" : ""}`}
              disabled={compacting || running}
              onClick={() => void triggerCompact()}
              title="Summarise middle turns to free context window (/compact)"
            >
              {compacting ? "Compacting…" : "Compact"}
            </button>
          )}
        </div>
      )}
      {activeNotice && (
        <p className={`agent-meter-notice is-${activeNotice.tone}`} role="status">
          {activeNotice.text}
        </p>
      )}
    </div>
  );
}
