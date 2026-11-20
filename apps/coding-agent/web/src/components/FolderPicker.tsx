import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/client";
import { canonicalPath } from "../domain/docs";
import { isFolder } from "../domain/workspaceMenu";
import { useResource } from "../hooks/useResource";
import { useReturnFocus } from "../hooks/useReturnFocus";
import { Check, ChevronLeft, ChevronRight, Folder, Lock, Refresh, Search } from "./Icons";

export function FolderTrigger({ value, onOpen }: { value: string; onOpen: () => void }) {
  return <button type="button" className="fp-trigger" aria-haspopup="dialog" onClick={onOpen}
    aria-label={`Change working folder, ${value || "none selected"}`}>
    <span className="fp-trigger-ico"><Folder size={18} /></span>
    <span className="fp-trigger-text"><strong className="fp-trigger-name">{value.split("/").filter(Boolean).pop() || "Choose a folder"}</strong>
      <span className="fp-trigger-path">{value}</span></span>
    <span className="fp-change">Change <ChevronRight size={14} /></span>
  </button>;
}

/** Remounted per location/query so old results can never be selected in a new listing. */
function FolderList({ location, query, current, onOpen }: {
  location: string; query: string; current: string; onOpen: (path: string) => void;
}) {
  const listing = useResource("listing", async signal => {
    if (query.length >= 2) {
      await new Promise<void>(resolve => {
        const timer = window.setTimeout(resolve, 280);
        signal.addEventListener("abort", () => { window.clearTimeout(timer); resolve(); }, { once: true });
      });
      signal.throwIfAborted();
      return api.search(query, location || "/", signal);
    }
    const results = location ? await api.folderChildren(location, signal) : await api.folderRoots(signal);
    return { results, complete: true };
  });
  const folders = listing.data?.results.filter(item => isFolder(item.kind)) ?? [];
  if (listing.state === "loading") return <p className="fp-note" role="status">Loading folders…</p>;
  if (listing.state === "error") return <div className="fp-note" role="alert">{listing.error}
    <button type="button" className="btn sm" onClick={listing.reload}>Retry listing</button></div>;
  return <>
    {folders.map(item => <button type="button" className="fp-row" key={item.path} onClick={() => onOpen(item.path)}>
      <span className="fp-folder-icon"><Folder size={16} /></span>
      <span className="fp-row-text"><strong>{item.name}</strong><small>{item.path}</small></span>
      {canonicalPath(item.path) === current && <span className="fp-current"><Check size={12} /> Current</span>}
      <ChevronRight size={14} />
    </button>)}
    {!folders.length && <p className="fp-note" role="status">{query.length >= 2 ? "No matching folders in these results." : "No subfolders here."}</p>}
    {listing.data?.complete === false && <p className="fp-note" role="status">Partial results. Open a folder to narrow your search.</p>}
  </>;
}

export function FolderPicker({ current, initialPath, switching, onClose, onChoose }: {
  current: string; initialPath?: string; switching: boolean; onClose: () => void; onChoose: (path: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const locationLabel = useRef<HTMLElement>(null);
  const pending = useRef<AbortController | null>(null);
  const [trail, setTrail] = useState<string[]>(initialPath ? [initialPath] : []);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState(initialPath || current);
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [rejected, setRejected] = useState(false);
  const [future, setFuture] = useState("");
  const [checking, setChecking] = useState(false);
  const location = trail.at(-1) ?? "";
  const candidate = typing ? draft : location;
  const normalized = canonicalPath(candidate);
  const tooLong = [...candidate].length > 512;
  const changed = Boolean(normalized && normalized !== "/" && normalized !== canonicalPath(current));
  useReturnFocus("mount", { fallback: () => document.querySelector(".fp-trigger, .avatar-btn") });
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => { node.close(); pending.current?.abort(); };
  }, []);
  function resetCheck() {
    setFuture("");
    setError("");
    setRejected(false);
  }
  function navigate(next: string[]) {
    setTrail(next);
    requestAnimationFrame(() => locationLabel.current?.focus());
    setQuery("");
    resetCheck();
  }
  async function choose() {
    if (!changed || tooLong || rejected || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setChecking(true);
    setError("");
    try {
      const result = await api.inspectFolder(candidate, controller.signal);
      if (controller.signal.aborted) return;
      if (!result.exists && !(typing && future === result.path)) {
        if (typing) setFuture(result.path);
        else setError("This folder is no longer available. Choose another folder.");
        return;
      }
      onChoose(result.path);
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : "Could not check this folder.");
        setRejected(e instanceof ApiError && [401, 403, 422].includes(e.status));
      }
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setChecking(false);
    }
  }
  return <dialog className="fp-pop" ref={dialog} aria-labelledby="fp-title" aria-describedby="fp-description"
    onCancel={e => { e.preventDefault(); onClose(); }} onKeyDown={e => {
      e.stopPropagation();
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    }}>
    <header className="fp-heading">
      <span className="fp-symbol"><Folder size={23} /></span>
      <div><h2 id="fp-title">Choose a working folder</h2>
        <p id="fp-description">{switching ? "Your next message starts a new conversation here. Current work continues in its original folder." :
          "Choose where the coding agent can write workspace files."}</p></div>
    </header>
    <div className="fp-body">
      <div className="fp-tabs" role="group" aria-label="Selection method">
        <button type="button" disabled={checking} aria-pressed={!typing} onClick={() => { setTyping(false); resetCheck(); }}>Browse folders</button>
        <button type="button" disabled={checking} aria-pressed={typing} onClick={() => { if (typing) return; setTyping(true); setDraft(location || current); resetCheck(); }}>Enter a path</button>
      </div>
      {typing ? <label className="fp-field">Workspace path
        <input key="path" autoFocus disabled={checking} value={draft} spellCheck={false} onKeyDown={e => {
            if (e.key === "Enter" && !e.repeat && !e.nativeEvent.isComposing) { e.preventDefault(); void choose(); }
          }}
          placeholder="/Shared/project" aria-invalid={Boolean(error) || tooLong} aria-describedby={error || tooLong ? "fp-error" : undefined} onChange={e => { setDraft(e.target.value); resetCheck(); }} />
      </label> : <>
        <label className="fp-find"><Search size={16} /><input key="search" className="fp-search" disabled={checking}
          aria-label="Find a folder by name" placeholder={location ? "Search in this folder…" : "Search workspace folders…"}
          value={query} onChange={e => setQuery(e.target.value)} /></label>
        <div className="fp-location">
          {trail.length > 0 && <button type="button" className="icon-btn" disabled={checking} aria-label="Back to previous location"
            onClick={() => navigate(trail.slice(0, -1))}><ChevronLeft size={16} /></button>}
          <strong ref={locationLabel} tabIndex={-1}>{location || "Workspace locations"}</strong>
          <button type="button" className="icon-btn" disabled={checking} aria-label="Refresh folder list" onClick={() => setRevision(n => n + 1)}><Refresh size={15} /></button>
        </div>
        {query.trim().length === 1 && <p className="fp-search-hint">Enter two characters to search.</p>}
        <fieldset className="fp-list" disabled={checking} aria-label="Workspace folders">
          <FolderList key={JSON.stringify([location, query.trim().length >= 2 ? query.trim() : "", revision])}
            location={location} query={query.trim()} current={canonicalPath(current)} onOpen={path => navigate([...trail, path])} />
        </fieldset>
      </>}
      {(error || tooLong) && <p id="fp-error" className="fp-feedback" role="alert">{error || "Use a path with 512 characters or fewer."}</p>}
      {future && <p className="fp-feedback" role="status">This folder was not found. Use this path if you intend to write to a future folder.</p>}
      {typing && candidate && !changed && <p className="fp-search-hint" role="status">
        {normalized === canonicalPath(current) ? "This is the current working folder." : "Choose a folder below the workspace root."}</p>}
      <div className="fp-scope"><Lock size={16} /><div><strong>{!typing && candidate ? "Selected folder" : "Current folder"}</strong>
        <code>{(!typing && candidate) || current || "None selected"}</code></div>
        {!candidate && current && !typing && <button type="button" className="btn ghost sm" onClick={() => navigate([canonicalPath(current)])}>Open</button>}</div>
    </div>
    <footer className="fp-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button>
      <button type="button" className="btn primary" disabled={!changed || checking || tooLong || rejected || (!typing && Boolean(query.trim()))} onClick={() => void choose()}>
        {checking ? "Checking folder…" : future ? "Use future folder" : switching ? "Use for new conversation" : "Use this folder"}</button></footer>
  </dialog>;
}
