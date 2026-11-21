import { AgentUpdates } from "../AgentUpdates";
import { useContext, useEffect, useRef, useState } from "react";
import { Context, SessionFeatures } from "./model";
import { ChangeCard } from "./ChangeCard";
import { QuestionCard } from "./QuestionCard";
import { Status } from "./Status";

const MODE_HINT: Record<"plan" | "review" | "auto", string> = {
  plan: "Read-only",
  review: "Approve writes & runs",
  auto: "Auto in folder",
};

export function WorkComposerBar() {
  const { data, busy, act, error } = useContext(Context);
  const [toolsOpen, setToolsOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!toolsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setToolsOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setToolsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [toolsOpen]);

  if (!data) return null;

  const pendingChanges = (data.change ?? []).filter((r) => r.state === "awaiting_review").length;
  const pendingRuns = (data.approval ?? []).filter((r) => r.state === "pending" && r.action === "run").length;
  const pendingTotal = pendingChanges + pendingRuns;
  const modeHint = MODE_HINT[data.mode] ?? "Approve writes & runs";

  return (
    <div className="work-composer-bar" data-mode={data.mode}>
      <div className="work-mode-group">
        <label className={`work-mode-pill is-${data.mode}`}>
          <span className="work-mode-dot" aria-hidden />
          <span className="sr-only">Autonomy</span>
          <select
            aria-label="Autonomy mode"
            value={data.mode}
            disabled={busy}
            onChange={(e) => void act("mode", { mode: e.target.value })}
          >
            <option value="plan">Plan</option>
            <option value="review">Review</option>
            <option value="auto">Auto</option>
          </select>
        </label>
        <span className="work-mode-hint" title={modeHint}>{modeHint}</span>
      </div>

      <div className="work-meta-group" ref={popRef}>
        {pendingTotal > 0 && (
          <span className="work-pending-badge" role="status">
            {pendingTotal} pending
          </span>
        )}
        <button
          type="button"
          className="work-tools-trigger"
          aria-label={`${data.toolCount} tools available`}
          title={`${data.toolCount} tools available — inspect capabilities and fence`}
          aria-expanded={toolsOpen}
          aria-haspopup="dialog"
          onClick={() => setToolsOpen((o) => !o)}
        >
          {data.toolCount} tools
        </button>

        {toolsOpen && (
          <div className="work-tools-popover" role="dialog" aria-label="Active session tools and fence">
            <div className="work-tools-pop-head">
              <strong>Session capabilities &amp; fence</strong>
              <button
                type="button"
                className="work-tools-close"
                aria-label="Close tools inspector"
                onClick={() => setToolsOpen(false)}
              >
                ×
              </button>
            </div>
            <dl className="work-tools-fence">
              <div>
                <dt>Mode</dt>
                <dd>{data.mode[0].toUpperCase() + data.mode.slice(1)} · {modeHint}</dd>
              </div>
              {data.fence?.folder && (
                <div>
                  <dt>Folder fence</dt>
                  <dd title={data.fence.folder}><code>{data.fence.folder}</code></dd>
                </div>
              )}
              {data.fence?.schema && (
                <div>
                  <dt>Schema fence</dt>
                  <dd title={data.fence.schema}><code>{data.fence.schema}</code></dd>
                </div>
              )}
            </dl>
            {data.capabilities?.length > 0 && (
              <ul className="work-cap-list">
                {data.capabilities.map((cap) => (
                  <li key={cap.kind}>
                    <span className="work-cap-name">{cap.label}</span>
                    <span className="work-cap-flags">
                      <span className={cap.read ? "is-on" : "is-off"}>Read</span>
                      <span className={cap.change ? "is-on" : "is-off"}>Edit</span>
                      <span className={cap.run ? "is-on" : "is-off"}>Run</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {error && <p className="work-bar-error" role="alert">{error}</p>}
    </div>
  );
}

export function PendingWork() {
  const { data, busy, act, reviewing } = useContext(Context);
  const session = useContext(SessionFeatures);
  const questions = (session.questions ?? []).filter(
    (q) => q.state === "pending" || q.state === "expired",
  );
  const changes = (reviewing ? [] : (data?.change ?? [])).filter(
    (r) => r.state === "awaiting_review",
  );
  const reviews = (data?.approval ?? []).filter(
    (r) => r.state === "pending" && r.action === "run",
  );
  return (
    <div className="work-pending">
      {questions.map((q) => (
        <QuestionCard key={q.id} question={q} />
      ))}
      <AgentUpdates notices={session.notices} compactions={session.compactions} />
      {changes.map((r) => (
        <ChangeCard key={r.id} row={r} />
      ))}
      {reviews.map((r) => (
        <article className="work-card" key={r.id}>
          <header>
            Run requires review
            <Status state={r.state} />
          </header>
          <h3>{r.asset.kind}</h3>
          <p className="work-path">{r.asset.id}</p>
          {r.arguments && (
            <details open>
              <summary>Run inputs</summary>
              <pre className="work-diff" tabIndex={0}>
                {JSON.stringify(r.arguments, null, 2)}
              </pre>
            </details>
          )}
          <div className="work-actions">
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => void act(`run-reviews/${r.id}`, { confirm: true })}
            >
              Run as me
            </button>
            <button
              className="btn ghost"
              disabled={busy}
              onClick={() =>
                void act(`run-reviews/${r.id}`, { confirm: false })
              }
            >
              Reject run
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
