"""Tests for Spec 017 backend improvements: compaction parity, per-session outbox locking,
O(C + O + I) observation_proof, O(1) approval lookup, and single-query Postgres storage."""

from __future__ import annotations

import asyncio
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from api.adapters.durable.agent_postgres import KINDS, PostgresAgentLedgers
from api.domain.events import session_compacted
from api.services.agent_work import AgentWork
from api.services.work_events import WorkEvents


# ------------------------------------------------------------------ T08: Compaction parity
def test_session_compacted_emits_compaction_id_and_status():
    plan = {
        "kept": ["t1", "t10"],
        "summarised": ["t2", "t3", "t4"],
        "reason": "tokens exceeded budget",
        "tokensBefore": 18000,
        "tokensAfter": 6000,
    }
    ev = session_compacted("s1", plan, summary="Summarised 3 turns")
    assert ev.type == "session.compacted"
    assert ev.payload["compactionId"].startswith("cmp_")
    assert ev.payload["status"] == "completed"
    assert ev.payload["summary"] == "Summarised 3 turns"
    assert ev.payload["tokensBefore"] == 18000
    assert ev.payload["tokensAfter"] == 6000


def test_session_compacted_preserves_explicit_compaction_id():
    ev = session_compacted("s1", {"kept": [], "summarised": []}, compaction_id="cmp_custom_1")
    assert ev.payload["compactionId"] == "cmp_custom_1"
    assert ev.payload["status"] == "completed"


# ------------------------------------------------------------------ T09: Per-session outbox lock
class _FakeOutboxStore:
    def __init__(self, rows: list[dict]):
        self.rows = {r["id"]: dict(r) for r in rows}

    async def page(self, kind, *, session_id="", cursor="", states=(), limit=100):
        items = [
            dict(r)
            for r in self.rows.values()
            if (not session_id or r["sessionId"] == session_id)
            and (not states or r["state"] in states)
        ]
        return {"items": items[:limit], "nextCursor": ""}

    async def put(self, kind, row, version):
        self.rows[row["id"]] = dict(row, version=version + 1)
        return self.rows[row["id"]]


@pytest.mark.asyncio
async def test_work_events_flush_does_not_block_across_sessions():
    """E27: A slow emit for session A must never block flushing session B."""
    store = _FakeOutboxStore(
        [
            {
                "id": "e_a",
                "sessionId": "s_a",
                "type": "change.applied",
                "payload": {},
                "state": "pending",
                "createdAt": 1.0,
                "version": 1,
            },
            {
                "id": "e_b",
                "sessionId": "s_b",
                "type": "change.applied",
                "payload": {},
                "state": "pending",
                "createdAt": 1.0,
                "version": 1,
            },
        ]
    )
    a_entered = asyncio.Event()
    release_a = asyncio.Event()
    delivered: list[str] = []

    async def emit(event):
        if event.session_id == "s_a":
            a_entered.set()
            await release_a.wait()
        delivered.append(event.session_id)

    events = WorkEvents(store, emit)
    task_a = asyncio.create_task(events.flush("s_a"))
    await a_entered.wait()

    # While s_a is blocked inside emit(), s_b must finish immediately.
    await asyncio.wait_for(events.flush("s_b"), timeout=1.0)
    assert delivered == ["s_b"]

    release_a.set()
    await task_a
    assert delivered == ["s_b", "s_a"]
    # Idle session locks are cleaned up to prevent unbounded growth.
    assert events._locks == {}


@pytest.mark.asyncio
async def test_work_events_global_flush_drains_all_sessions():
    """E28: Global flush(sid='') drains every pending session in deterministic order."""
    store = _FakeOutboxStore(
        [
            {
                "id": "e2",
                "sessionId": "s_2",
                "type": "change.applied",
                "payload": {},
                "state": "pending",
                "createdAt": 1.0,
                "version": 1,
            },
            {
                "id": "e1",
                "sessionId": "s_1",
                "type": "change.applied",
                "payload": {},
                "state": "pending",
                "createdAt": 1.0,
                "version": 1,
            },
        ]
    )
    order: list[str] = []

    async def emit(event):
        order.append(event.session_id)

    events = WorkEvents(store, emit)
    await events.flush("")
    assert order == ["s_1", "s_2"]
    assert all(r["state"] == "delivered" for r in store.rows.values())


# ------------------------------------------------------------------ T10: O(C + O + I) observation_proof
class _MemLedger:
    def __init__(self, tables: dict[str, list[dict]]):
        self.tables = tables

    async def page(self, kind, *, session_id="", cursor="", states=(), limit=100):
        start = int(cursor) if cursor else 0
        rows = [
            r
            for r in self.tables.get(kind, [])
            if (not session_id or r.get("sessionId") == session_id)
            and (not states or r.get("state") in states)
        ]
        chunk = rows[start : start + limit]
        nxt = str(start + limit) if start + limit < len(rows) else ""
        return {"items": chunk, "nextCursor": nxt}


@pytest.mark.asyncio
async def test_observation_proof_indexed_handles_scale_and_edge_cases():
    """E29: 200 changes + 400 invocations (including noise/incomplete/wrong rev) match accurately & quickly."""
    changes = []
    invocations = []
    for i in range(200):
        asset = {"kind": "notebook", "id": f"/Shared/nb_{i}.py"}
        changes.append(
            {
                "id": f"chg_{i}",
                "sessionId": "s1",
                "turnId": "t1",
                "state": "applied",
                "asset": asset,
                "appliedAt": 10.0,
                "createdAt": 9.0,
                "newRevision": f"rev_{i}",
            }
        )
        # Noise invocation without asset / incomplete state must be ignored cleanly
        invocations.append(
            {
                "id": f"inv_noise_{i}",
                "sessionId": "s1",
                "turnId": "t1",
                "tool": "dbx_read",
                "state": "failed",
                "createdAt": 12.0,
            }
        )
        if i % 2 == 0:
            invocations.append(
                {
                    "id": f"inv_ok_{i}",
                    "sessionId": "s1",
                    "turnId": "t1",
                    "tool": "dbx_read",
                    "state": "completed",
                    "asset": asset,
                    "createdAt": 15.0,
                    "observedRevision": f"rev_{i}",
                }
            )
    operations = [
        {
            "id": "op_1",
            "sessionId": "s1",
            "turnId": "t1",
            "asset": {"kind": "job", "id": "job_42"},
            "createdAt": 10.0,
        }
    ]
    invocations.append(
        {
            "id": "inv_op_1",
            "sessionId": "s1",
            "turnId": "t1",
            "tool": "dbx_operation",
            "state": "completed",
            "effectState": "succeeded",
            "asset": {"kind": "job", "id": "job_42"},
            "createdAt": 20.0,
        }
    )

    work = AgentWork.__new__(AgentWork)
    work.store = _MemLedger({"change": changes, "operation": operations, "invocation": invocations})
    work.changes = SimpleNamespace(mark_observed=AsyncMock())

    t0 = time.perf_counter()
    res = await work.observation_proof("s1", "t1")
    elapsed = time.perf_counter() - t0

    assert res["effects"] == 201
    # Odd-numbered 100 changes have no matching observation; even 100 + op_1 are observed
    assert len(res["missing"]) == 100
    assert work.changes.mark_observed.await_count == 100
    assert elapsed < 1.0


# ------------------------------------------------------------------ T12: Single UNION ALL storage query
@pytest.mark.asyncio
async def test_postgres_storage_uses_single_union_all_query():
    """E31: PostgresAgentLedgers.storage() executes exactly 1 SQL query and returns 0 for missing kinds."""
    executed: list[tuple[str, list]] = []

    class _FakeCursor:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def execute(self, sql, params):
            executed.append((sql, list(params)))

        async def fetchall(self):
            return [("change", 3, 512), ("outbox", 0, 0)]

    class _FakeTx:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

    class _FakeConn:
        def transaction(self):
            return _FakeTx()

        def cursor(self):
            return _FakeCursor()

    class _FakeJournal:
        async def read_operation(self, fn):
            return await fn(_FakeConn())

    import base64

    ledgers = PostgresAgentLedgers(_FakeJournal(), base64.urlsafe_b64encode(b"k" * 32).decode())
    stats = await ledgers.storage("sess_1")

    assert len(executed) == 1
    sql, params = executed[0]
    assert sql.count("UNION ALL") == len(KINDS) - 1
    assert len(params) == len(KINDS) * 2
    assert set(stats) == set(KINDS)
    assert stats["change"] == {"rows": 3, "payloadBytes": 512}
    assert stats["outbox"] == {"rows": 0, "payloadBytes": 0}
    assert stats["invocation"] == {"rows": 0, "payloadBytes": 0}


# ------------------------------------------------------------------ T08b: SessionService.compact()
@pytest.mark.asyncio
async def test_session_service_compact_emits_id_and_auto_summary():
    """IMP-03: SessionService.compact() produces a non-empty summary and compactionId when shedding."""
    from api.services.session_service import SessionService

    svc = SessionService.__new__(SessionService)
    turns = [
        SimpleNamespace(
            id=f"t{i}",
            index=i,
            prompt=f"Analyse revenue table step {i}",
            input_tokens=1500,
            output_tokens=500,
        )
        for i in range(1, 9)
    ]
    live = SimpleNamespace(
        state=SimpleNamespace(turns=turns),
        resolved=SimpleNamespace(context=8000),
        extra={},
    )
    emitted = []

    svc.get = lambda sid: live
    svc._emit = AsyncMock(side_effect=lambda ev: emitted.append(ev))

    res = await svc.compact("s1", budget=8000)
    assert res["changed"] is True
    assert res["compactionId"].startswith("cmp_")
    assert res["status"] == "completed"
    assert "Summarised" in res["summary"]
    assert len(emitted) == 1
    assert emitted[0].type == "session.compacted"
    assert emitted[0].payload["compactionId"] == res["compactionId"]
    assert emitted[0].payload["status"] == "completed"

    # When budget is ample, returns changed=False cleanly without emitting (E09)
    res_noop = await svc.compact("s1", budget=200_000)
    assert res_noop == {"changed": False, "reason": "nothing needs shedding"}
    assert len(emitted) == 1
