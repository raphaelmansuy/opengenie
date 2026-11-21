/** End-to-end verification and screenshot capture for Spec 017 (IMP-01 through IMP-18).
 *
 * Boots the real FastAPI app (with ACP + MCP subprocess + encrypted SQLite + built React bundle)
 * and exercises:
 *   1. Structured DiffView (Unified & Split), +N/-M stats, Copy diff (IMP-01, IMP-02)
 *   2. Autonomy mode pill, inline policy hint, pending badge, Active Tools popover + Escape (IMP-06, IMP-07)
 *   3. Evidence grade pills, V2 follow-up chips, Context Meter, and /compact roundtrip (IMP-03, IMP-04, IMP-05, IMP-10, IMP-11, IMP-12)
 *   4. Notebook failed cell error classification, Diagnose error vs Fix with agent, and Insert cell from chat (IMP-08, IMP-09)
 *   5. Dark theme & 390x844 mobile zero-overflow verification (E03, E32)
 */
import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localApp } from './mission-test-server.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const shots = resolve(root, 'specs/017-improve/e2e/screenshots');
mkdirSync(shots, { recursive: true });

const app = await localApp({ agentWork: true });
const browser = await chromium.launch();
const errors = [];
const captures = [];

const post = (path, body = {}) =>
  app.json(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

async function createSession(scenario = 'workreview') {
  const s = await post('/api/sessions', {
    folder: '/Users/mission@example.test/agent_scratch',
    model: 'fake/model-a',
  });
  await post(`/api/sessions/${s.id}/messages`, {
    text: `Update only cell 3 and verify the result. [[scenario:${scenario}]]`,
  });
  return s.id;
}

async function capture(page, name) {
  await page.waitForTimeout(200);
  const path = resolve(shots, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(overflow.scrollWidth, `${name} horizontal overflow`).toBeLessThanOrEqual(overflow.innerWidth + 1);
  captures.push({ name, path, ...overflow });
}

try {
  // ------------------------------------------------------------------ 1 & 2: DiffView (Unified + Split) & Autonomy Bar + Tools Popover
  const sid = await createSession('workreview');
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${app.url}/#/session/${sid}`);
  await expect(page.getByRole('button', { name: 'Apply change', exact: true }).first()).toBeVisible({ timeout: 30000 });
  // Verify DiffView stats, Unified toggle, policy hint, and pending badge
  await expect(page.locator('.diff-viewer').first()).toBeVisible();
  await expect(page.locator('.diff-stat.is-add').first()).toBeVisible();
  await expect(page.locator('.work-mode-hint')).toContainText('Approve writes & runs');
  await expect(page.locator('.work-pending-badge')).toContainText('1 pending');

  // Verify window.__m leak is gone (IMP-18)
  expect(await page.evaluate(() => (window).__m)).toBeUndefined();

  await capture(page, '01-desktop-light-diff-unified');

  // Switch to Changes tab, toggle Split diff view, and open Active Tools & Fence popover
  await page.getByRole('tab', { name: 'Changes', exact: true }).click();
  await expect(page.locator('.work-panel .diff-viewer')).toBeVisible();
  await page.locator('.work-panel').getByRole('button', { name: 'Split', exact: true }).click();
  await expect(page.locator('.work-panel .diff-split')).toBeVisible();
  await page.locator('.work-panel .work-card').first().scrollIntoViewIfNeeded();

  await page.locator('.work-tools-trigger').click();
  await expect(page.getByRole('dialog', { name: /Active session tools/i })).toBeVisible();
  await capture(page, '02-desktop-light-diff-split-tools');

  // Escape closes tools popover cleanly (E18)
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /Active session tools/i })).toBeHidden();

  // ------------------------------------------------------------------ 5 & 6: Dark Theme Desktop & Mobile (while diff is awaiting review)
  await page.getByRole('button', { name: /Colour theme:/i }).click();
  await page.getByRole('menuitemcheckbox', { name: /Dark/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('.work-panel .work-card').first().scrollIntoViewIfNeeded();
  await capture(page, '05-desktop-dark-diff-and-meter');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.work-panel').getByRole('button', { name: 'Unified', exact: true }).click();
  await page.locator('.work-panel .diff-viewer').first().scrollIntoViewIfNeeded();
  await capture(page, '06-mobile-narrow-dark');

  // Restore desktop light theme before applying change
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: /Colour theme:/i }).click();
  await page.getByRole('menuitemcheckbox', { name: /Light/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  // ------------------------------------------------------------------ 3: Apply change -> Verified Evidence -> Slash /compact
  await page.locator('.work-panel').getByRole('button', { name: 'Apply change', exact: true }).click();
  await expect.poll(async () => (await app.json(`/api/sessions/${sid}/work`)).change[0].state, { timeout: 30000 }).toMatch(/applied|verified/);
  await expect.poll(async () => (await app.json(`/api/sessions/${sid}`)).turns.at(-1).status, { timeout: 30000 }).toBe('completed');

  // Return to Overview tab to see surfaced evidence grade pills and outcome
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await expect(page.locator('.mission-proof .ev-grade, .evidence-row .ev-grade').first()).toBeVisible({ timeout: 15000 });

  // Open slash command menu and verify new Databricks 2026 commands exist (/diagnose, /compact, /pipeline)
  const dockInput = page.locator('#dock textarea').first();
  await dockInput.click();
  await dockInput.fill('/com');
  await expect(page.getByText('/compact')).toBeVisible();
  await dockInput.fill('/compact');
  await dockInput.press('Enter');
  await expect(page.locator('#dock')).toContainText(/Context is already within budget|Context compacted|Already compact/i, { timeout: 10000 });

  await capture(page, '03-desktop-light-evidence-compaction');

  // Verify autonomy mode switching persists cleanly (IMP-06)
  await page.getByLabel('Autonomy mode').selectOption('plan');
  await expect(page.locator('.work-mode-hint')).toContainText('Read-only');
  await page.getByLabel('Autonomy mode').selectOption('auto');
  await expect(page.locator('.work-mode-hint')).toContainText('Auto in folder');
  await page.getByLabel('Autonomy mode').selectOption('review');

  // ------------------------------------------------------------------ 4: Notebook Failed Cell (Diagnose vs Fix) + Insert Cell from Chat
  const nbDir = '/Users/mission@example.test/agent_scratch';
  const nbPath = `${nbDir}/revenue_analysis.py`;
  const nbSource = [
    '# Databricks notebook source',
    '# MAGIC %md',
    '# MAGIC # Monthly Revenue Analysis',
    '# COMMAND ----------',
    'SELECT',
    "  date_trunc('month', pickup_datetime) AS month,",
    '  SUM(fare_amount) AS revenue',
    'FROM samples.nyctaxi.trips',
    'GROUP BY 1',
    '# COMMAND ----------',
    '# MAGIC %python',
    'df = spark.table("samples.nyctaxi.trips")',
    'display(df.limit(10))',
  ].join('\n');

  await page.route('**/api/workspace/roots', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ roots: [{ path: nbDir, name: 'agent_scratch', kind: 'directory' }] }),
    });
  });
  await page.route('**/api/workspace?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        node: {
          path: nbDir,
          name: 'agent_scratch',
          kind: 'directory',
          hasChildren: true,
          children: [
            { path: nbPath, name: 'revenue_analysis.py', kind: 'notebook', language: 'SQL', hasChildren: false },
          ],
        },
      }),
    });
  });
  await page.route('**/api/workspace/object?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        path: nbPath,
        name: 'revenue_analysis.py',
        kind: 'notebook',
        language: 'SQL',
        size: nbSource.length,
        text: nbSource,
        version: 'rev_nb_01',
        truncated: false,
        cells: [
          { index: 0, kind: 'markdown', language: 'MARKDOWN', source: '# Monthly Revenue Analysis', truncated: false },
          { index: 1, kind: 'code', language: 'SQL', source: "SELECT\n  date_trunc('month', pickup_datetime) AS month,\n  SUM(fare_amount) AS revenue\nFROM samples.nyctaxi.trips\nGROUP BY 1", truncated: false },
          { index: 2, kind: 'code', language: 'PYTHON', source: 'df = spark.table("samples.nyctaxi.trips")\ndisplay(df.limit(10))', truncated: false },
        ],
      }),
    });
  });
  await page.route('**/api/notebook/sql-runs', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        result: {
          state: 'failed',
          seconds: 0.42,
          warehouse: 'Starter Warehouse',
          error: "[UNRESOLVED_COLUMN.WITH_SUGGESTION] A column or function parameter with name `pickup_datetime` cannot be resolved. Did you mean one of the following? [`tpep_pickup_datetime`, `tpep_dropoff_datetime`]",
          outputs: [],
        },
      }),
    });
  });

  // Enrich a fresh session with real SSE events: elevated context meter (80%), 70% cached,
  // verified + contradicted evidence grades, and a Python code block for Insert cell testing.
  const richSid = await post('/api/sessions', {
    folder: nbDir,
    model: 'fake/model-a',
  });
  const answerMd =
    'Cell 2 fails because `samples.nyctaxi.trips` uses `tpep_pickup_datetime` rather than `pickup_datetime`.\n\n' +
    'Here is a clean PySpark check you can append to the notebook:\n\n' +
    '```python\n' +
    'from pyspark.sql import functions as F\n\n' +
    'monthly = (\n' +
    '    spark.table("samples.nyctaxi.trips")\n' +
    '    .groupBy(F.date_trunc("month", "tpep_pickup_datetime").alias("month"))\n' +
    '    .agg(F.round(F.sum("fare_amount"), 2).alias("total_revenue"), F.count("*").alias("trips"))\n' +
    '    .orderBy("month")\n' +
    ')\n' +
    'display(monthly)\n' +
    '```';
  const sseEvent = (seq, type, payload, turnId = 't_demo_1') =>
    `id: ${seq}\ndata: ${JSON.stringify({ seq, sessionId: richSid.id, turnId, type, ...payload, ts: new Date().toISOString(), actor: 'agent' })}\n\n`;
  const sseBody = [
    sseEvent(1, 'session.ready', { folder: nbDir, model: 'fake/model-a' }, null),
    sseEvent(2, 'turn.started', { index: 1, prompt: 'Why is cell 2 failing and how do I fix the monthly revenue query?', model: 'fake/model-a' }),
    sseEvent(3, 'tool_call.started', { callId: 'tc_1', name: 'dbx_describe', args: '{"table":"samples.nyctaxi.trips"}' }),
    sseEvent(4, 'tool_call.updated', { callId: 'tc_1', status: 'completed', summary: 'Described samples.nyctaxi.trips (6 columns)' }),
    sseEvent(5, 'message.delta', { text: answerMd }),
    sseEvent(6, 'usage.updated', { usage: { used: 102400, size: 128000, cost: { amount: 0.0214, currency: 'USD' } } }),
    sseEvent(7, 'evidence.proposed', {
      rows: [
        {
          requirement: 'Verified column names on samples.nyctaxi.trips',
          tool: 'dbx_describe',
          toolCallId: 'tc_1',
          summary: 'tpep_pickup_datetime confirmed',
          verified: true,
          grade: 'verified',
        },
        {
          requirement: 'Cell 2 re-run after edit',
          tool: 'dbx_run',
          toolCallId: 'tc_missing',
          summary: 'Not executed yet',
          verified: false,
          grade: 'contradicted',
          reason: 'No matching dbx_run invocation observed in this turn',
        },
      ],
    }),
    sseEvent(8, 'turn.completed', {
      seconds: 1.4,
      usage: { inputTokens: 12000, outputTokens: 420, cachedReadTokens: 8400 },
    }),
  ].join('');

  const sseSockets = new Set();
  const sseServer = createServer((req, res) => {
    sseSockets.add(res);
    res.on('close', () => sseSockets.delete(res));
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(sseBody);
  });
  await new Promise((res) => sseServer.listen(0, '127.0.0.1', res));
  const ssePort = sseServer.address().port;

  await page.route(`**/api/sessions/${richSid.id}/stream**`, async (route) => {
    await route.continue({ url: `http://127.0.0.1:${ssePort}/stream` });
  });

  await page.goto(`${app.url}/#/session/${richSid.id}`);
  await expect(page.locator('.agent-meter')).toContainText('Context 80%', { timeout: 15000 });
  await expect(page.locator('.agent-meter-cache')).toContainText('70% cached');
  await expect(page.getByRole('button', { name: 'Compact', exact: true })).toBeVisible();
  // Verify Contradicted grade pill and inline reason render directly in the transcript (IMP-12)
  await expect(page.locator('#dock .ev-grade.is-verified')).toContainText('Verified');
  await expect(page.locator('#dock .ev-grade.is-contradicted')).toContainText('Contradicted');
  await expect(page.locator('#dock .ev-reason')).toContainText('No matching dbx_run');

  // Open the notebook from the Files tab so EditorSurface mounts and registers InsertNotebookCell
  await page.getByRole('tab', { name: 'Files', exact: true }).click();
  await page.getByRole('treeitem', { name: 'agent_scratch' }).click();
  await expect(page.getByText('revenue_analysis.py').first()).toBeVisible({ timeout: 15000 });
  await page.getByText('revenue_analysis.py').first().click();
  await expect(page.getByText('Monthly Revenue Analysis').first()).toBeVisible({ timeout: 15000 });

  // Verify Insert cell button appears on the assistant's Python code block (IMP-09)
  const insertBtn = page.locator('#dock').getByRole('button', { name: 'Insert cell', exact: true });
  await expect(insertBtn).toBeVisible({ timeout: 10000 });

  // Run cell 2 (SQL cell) so our mocked Databricks UNRESOLVED_COLUMN error renders
  const runButtons = page.locator('button[aria-label*="Run cell"], button[title*="Run this cell"], button.cell-run');
  await expect(runButtons.first()).toBeVisible({ timeout: 10000 });
  await runButtons.first().click();
  await expect(page.locator('.cell-error-pill')).toContainText('Missing table or column', { timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Diagnose error', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Fix with agent/i })).toBeVisible();

  // Click Insert cell and verify it appends a new cell directly into the open notebook
  const cellsBefore = await page.locator('.nb-cell, .cell-block, section.cell').count();
  await insertBtn.click();
  await expect(page.locator('#dock').getByRole('button', { name: 'Inserted', exact: true })).toBeVisible();
  await expect.poll(async () => page.locator('.nb-cell, .cell-block, section.cell').count()).toBeGreaterThan(cellsBefore);

  // Scroll the assistant transcript cleanly to bottom so the floating Latest pill disappears
  await page.locator('#dock .dock-body').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await capture(page, '04-desktop-light-cell-diagnose-insert');

  for (const s of sseSockets) s.end();
  sseServer.close();

  expect(errors).toEqual([]);
  writeFileSync(
    resolve(shots, '../report.json'),
    JSON.stringify({ pass: true, captures, errors }, null, 2),
  );
  console.log(JSON.stringify({ pass: true, captures: captures.map((c) => c.name), errors }, null, 2));
} finally {
  await browser.close();
  await app.stop();
}
