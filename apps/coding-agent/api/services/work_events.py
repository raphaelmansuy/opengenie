"""Atomic ledger changes plus a durable event outbox; replay never repeats a workspace effect."""

import asyncio
import time
from uuid import uuid4
from ..domain.events import Event


class WorkEvents:
    def __init__(self, store, emit):
        self.store, self.emit = store, emit
        self._locks: dict[str, asyncio.Lock] = {}

    def _lock_for(self, sid: str) -> asyncio.Lock:
        lock = self._locks.get(sid)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[sid] = lock
        return lock

    async def commit(self, writes, sid, tid, kind, payload, owner):
        event = {
            "id": "event_" + uuid4().hex,
            "sessionId": sid,
            "owner": owner,
            "turnId": tid,
            "type": kind,
            "payload": payload,
            "state": "pending",
            "createdAt": time.time(),
        }
        rows = await self.store.batch([*writes, ("outbox", event, None)])
        await self.flush(sid)
        return rows[:-1]

    async def _flush_session(self, sid: str):
        lock = self._lock_for(sid)
        async with lock:
            cursor = ""
            pending = []
            while True:
                page = await self.store.page(
                    "outbox", session_id=sid, cursor=cursor, states=("pending",), limit=100
                )
                pending.extend(page["items"])
                cursor = page["nextCursor"]
                if not cursor:
                    break
            # Chronological order per session, including when more than one page was pending.
            for row in sorted(pending, key=lambda r: (r["createdAt"], r["id"])):
                try:
                    await self.emit(
                        Event(
                            row["sessionId"],
                            row["type"],
                            {**row["payload"], "eventId": row["id"]},
                            turn_id=row.get("turnId"),
                        )
                    )
                except KeyError:
                    continue  # archived sessions are hydrated on demand
                await self.store.put("outbox", {**row, "state": "delivered"}, row["version"])
        if not lock.locked() and self._locks.get(sid) is lock:
            self._locks.pop(sid, None)

    async def flush(self, sid=""):
        if sid:
            await self._flush_session(sid)
            return
        # Global flush: discover distinct pending session IDs and drain each under its own lock
        # in deterministic sorted order so concurrent session flushes never deadlock or block others.
        cursor = ""
        sids: set[str] = set()
        while True:
            page = await self.store.page(
                "outbox", session_id="", cursor=cursor, states=("pending",), limit=100
            )
            for row in page["items"]:
                if row.get("sessionId"):
                    sids.add(row["sessionId"])
            cursor = page["nextCursor"]
            if not cursor:
                break
        for target in sorted(sids):
            await self._flush_session(target)
