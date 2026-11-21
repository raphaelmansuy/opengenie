# 04 — UX & ASCII wireframes

[Index](README.md) · Previous: [03 — Requirements](03-requirements.md) · Next: [05 — Architecture](05-architecture.md)

All wireframes use printable fixed-width ASCII boxes and respect OpenGenie's three-column shell
(left navigator, centre document/mission stage, right 380px assistant dock) plus narrow/mobile
layouts (`390px`).

## W01 — Desktop shell overview (1360×900)

```text
+------------------------------------------------------------------------------------------------------+
| [OG] OpenGenie v1.2  [Model v] [ready] [Search or run a command  Cmd+K]  [|L][R|][<] [Theme] [User]  |
+------------------+------------------------------------------------+----------------------------------+
| NAVIGATOR (248px)| CENTRE STAGE (Mission or Notebook Editor)      | ASSISTANT DOCK (380px)           |
| [Queries]    [+] | [Mission overview] [revenue_nb.py *] [x]       | [ready] in context: revenue_nb   |
| Sessions|Files|  |------------------------------------------------|----------------------------------|
| Catalog |Data    | DocumentBar: /Shared/Analytics/revenue_nb.py   | Turn 1: Fix pickup column bug    |
|                  | [In folder] [Ask v] [Reload] [Save]            |  +----------------------------+  |
| > Session 1      |------------------------------------------------|  | Evidence   2 of 2 proven   |  |
|   revenue_nb.py  | Cell 1 [sql]                [Ask] [Run] [+] [x]|  | [Verified] dbx_describe    |  |
|   sales_etl.py   |   SELECT tpep_pickup_datetime, fare_amount     |  | [Verified] dbx_edit        |  |
|                  |   FROM samples.nyctaxi.trips LIMIT 20          |  +----------------------------+  |
|                  |------------------------------------------------|  Code block in answer:           |
|                  | Cell 2 [py]                 [Ask] [Run] [+] [x]|  [python] [Insert cell] [Copy]   |
|                  |   df.groupBy("pickup_month").sum("fare")       |  +----------------------------+  |
|                  |   +-- Output [Failed] [Missing column] ------+ |  | df.withColumn(...)         |  |
|                  |   | [Diagnose error] [Fix with agent] [v][x] | |  +----------------------------+  |
|                  |   | AnalysisException: UNRESOLVED_COLUMN ... | |  [Run it] [Review for bugs]      |
|                  |   +------------------------------------------+ |----------------------------------|
|                  |                                                | [PendingWork: ChangeCard W02]    |
|                  |                                                |----------------------------------|
|                  |                                                | [Review v] Approve writes [13 v] |
|                  |                                                | Context 78% [====--] 64% cached  |
|                  |                                                |                   [Compact]      |
|                  |                                                |----------------------------------|
|                  |                                                | [+] [@] [/]  Ask about rev...    |
|                  |                                                | [Model v]               [Send]   |
+------------------+------------------------------------------------+----------------------------------+
```

## W02 — Structured diff viewer in `ChangeCard` (Unified mode, IMP-01/IMP-02)

```text
+-------------------------------------------------------------------------+
| NOTEBOOK CHANGE                                     [ Awaiting review ] |
| revenue_by_month.py                                                     |
| /Shared/Analytics/revenue_by_month.py                                   |
|                                                                         |
| Base revision: 9f4c12a8e01b    Fence: Review    Undo: Revision guarded  |
|                                                                         |
| v Inspect proposed diff     [+3  -2]    [Unified*| Split]   [Copy diff] |
| +---------------------------------------------------------------------+ |
| | @@ -12,4 +12,5 @@ Cell 2: monthly aggregation                       | |
| |  12  12 |   SELECT                                                  | |
| |  13     | -   date_trunc('month', pickup_datetime) AS month,        | |
| |     13  | +   date_trunc('month', tpep_pickup_datetime) AS month,   | |
| |  14     | -   SUM(fare) AS total_revenue                            | |
| |     14  | +   ROUND(SUM(fare_amount), 2) AS total_revenue,          | |
| |     15  | +   COUNT(*) AS trip_count                                | |
| |  15  16 |   FROM samples.nyctaxi.trips                              | |
| +---------------------------------------------------------------------+ |
|                                                                         |
| [ Apply change ]   [ Apply and run ]   [ Reject ]                       |
+-------------------------------------------------------------------------+
```

## W03 — Structured diff viewer (Side-by-Side Split mode, desktop >= 680px)

```text
+-------------------------------------------------------------------------+
| v Inspect proposed diff     [+3  -2]    [Unified | Split*]  [Copy diff] |
| +-----------------------------------+---------------------------------+ |
| | @@ -12,4 +12,5 @@ Cell 2: monthly aggregation                       | |
| +-----------------------------------+---------------------------------+ |
| |  12 |   SELECT                    |  12 |   SELECT                  | |
| |  13 | - date_trunc(..., pickup..) |  13 | + date_trunc(..., tpep..) | |
| |  14 | - SUM(fare) AS total_rev    |  14 | + ROUND(SUM(fare_amt), 2) | |
| |     |                             |  15 | + COUNT(*) AS trip_count  | |
| |  15 |   FROM samples.nyctaxi...   |  16 |   FROM samples.nyctaxi... | |
| +-----------------------------------+---------------------------------+ |
+-------------------------------------------------------------------------+
```

On viewports narrower than `640px` (or inside the 380px dock), Split mode automatically switches to
horizontal-scroll-safe unified lines or stacked pairs so the container never overflows horizontally
(`scrollWidth <= clientWidth`, [E03](09-edge-cases.md#register)).

## W04 — Autonomy bar, policy cue & Active Tools popover (IMP-06/IMP-07)

```text
+-------------------------------------------------------------------------+
| (o) [Review v]  Approve writes & runs     [2 pending]   [13 tools v]    |
+-------------------------------------------------------------------------+
                                                  |
                  (on click of "13 tools v")      v
                  +--------------------------------------------------+
                  | Active session capabilities & fence          [x] |
                  | Mode:   Review (approve every write and run)     |
                  | Folder: /Shared/Analytics                        |
                  | Schema: main.analytics_dev                       |
                  |--------------------------------------------------|
                  | Notebooks    Read [ok]  Change [ok]  Run [ok]    |
                  | Tables       Read [ok]  Change [--]  Run [--]    |
                  | SQL          Read [ok]  Change [--]  Run [ok]    |
                  | Jobs         Read [ok]  Change [ok]  Run [ok]    |
                  +--------------------------------------------------+
```

## W05 — Context pressure meter, cache hit-rate & compaction action (IMP-03/IMP-04/IMP-05)

```text
Healthy (< 70%):
+-------------------------------------------------------------------------+
| Context 34%  [===-------]  43.5k / 128k  |  72% cached  |  $0.0142      |
+-------------------------------------------------------------------------+

Elevated (70% - 89%) or Critical (>= 90%):
+-------------------------------------------------------------------------+
| Context 86%  [=========-]  110.1k / 128k |  61% cached  | [Compact]     |
+-------------------------------------------------------------------------+

After clicking [Compact] (or typing /compact):
+-------------------------------------------------------------------------+
| Context 41%  [====------]  52.4k / 128k  |  Compacted 6 turns           |
+-------------------------------------------------------------------------+
| > Context compaction · completed (turns 2-7 summarised, 110k -> 52k)    |
+-------------------------------------------------------------------------+
```

## W06 — Failed cell diagnostics & error classification (IMP-08)

```text
+-------------------------------------------------------------------------+
| [!] Failed  [Missing column]  0.4s  SQL Warehouse   [Diagnose] [Fix] v x|
|-------------------------------------------------------------------------|
| [UNRESOLVED_COLUMN.WITH_SUGGESTION] A column or function parameter with |
| name `pickup_datetime` cannot be resolved. Did you mean one of the      |
| following? [`tpep_pickup_datetime`, `tpep_dropoff_datetime`]            |
+-------------------------------------------------------------------------+

  Click [Diagnose] -> sends read-only cell-bound prompt:
      "Cell 2 failed (Missing column). Explain the root cause and likely
       fix in plain English. Do not modify any cell or run code."

  Click [Fix]      -> sends targeted repair prompt:
      "Cell 2 failed. The engine said: ... Find the cause, fix this cell
       only, and run it again to prove it works."
```

## W07 — Mobile / narrow viewport (390×844, dark theme)

```text
+-----------------------------------+
| [OG] [Model v] [Search] [=] [D]   |
+-----------------------------------+
| Mission overview / revenue_nb.py  |
+-----------------------------------+
| NOTEBOOK CHANGE     [Awaiting rev]|
| revenue_by_month.py               |
| [+3 -2] [Unified*|Split] [Copy]   |
| +-------------------------------+ |
| | @@ -12,4 +12,5 @@             | |
| | 13  | - pickup_datetime       | |
| |  13 | + tpep_pickup_datetime  | |
| +-------------------------------+ |
| [ Apply change ] [ Reject ]       |
+-----------------------------------+
| (o)[Review v] Approve writes [13v]|
| Context 84% [========-] [Compact] |
| [@][/] Ask about revenue_nb...    |
| [Model v]                 [Send]  |
+-----------------------------------+
```
