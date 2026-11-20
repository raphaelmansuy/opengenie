/** Real browser, app, workspace HTTP adapter and SQLite journal. Only the upstream workspace and agent are doubles. */
import { chromium, expect } from '@playwright/test';
import { once } from 'node:events';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { localApp } from './mission-test-server.mjs';

const out = resolve('../../../specs/016-choose-folder/e2e/screenshots');
mkdirSync(out, { recursive: true });
const home = '/Users/mission@example.test';
const project = '/Shared/Analytics';
const second = '/Repos/forecast';
const paths = new Map([
  ['/', 'DIRECTORY'], ['/Users', 'DIRECTORY'], [home, 'DIRECTORY'], [home + '/agent_scratch', 'DIRECTORY'],
  ['/Shared', 'DIRECTORY'], [project, 'DIRECTORY'], [project + '/Forecasts', 'DIRECTORY'],
  [project + '/Monthly reporting', 'DIRECTORY'], [project + '/notes', 'FILE'],
  ['/Shared/Design systems', 'DIRECTORY'], ['/Shared/Finance', 'DIRECTORY'],
  ['/Repos', 'DIRECTORY'], [second, 'REPO'], [second + '/Forecasts','DIRECTORY'],
]);
let metadataFailure = false;
let listingFailure = false;
let holdStatus;
const workspace = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.searchParams.get('path');
  const answer = (status, data) => { res.writeHead(status, {'Content-Type':'application/json'}); res.end(JSON.stringify(data)); };
  if (req.headers.authorization !== 'Bearer local-workspace-fixture') return answer(401, {});
  if (!url.pathname.startsWith('/api/2.0/workspace/')) return answer(200, {});
  if (path === '/Shared/Private') return answer(403, {});
  if (!paths.has(path)) return answer(404, {});
  if (url.pathname.endsWith('/get-status')) {
    const reply = () => answer(metadataFailure ? 503 : 200, { path, object_type: paths.get(path) });
    if (holdStatus) holdStatus(reply);
    else reply();
    return;
  }
  if (url.pathname.endsWith('/list')) {
    if (listingFailure && path === project) return answer(503, {});
    return answer(200, { objects: [...paths].filter(([p]) => p !== '/' && (p.slice(0,p.lastIndexOf('/')) || '/') === path)
      .map(([p,kind]) => ({path:p, object_type:kind})) });
  }
  answer(405, {});
});
workspace.listen(0, '127.0.0.1');
await once(workspace, 'listening');
let app, browser;
try {
  app = await localApp({ workspacePort: workspace.address().port });
  browser = await chromium.launch();
  const page = await browser.newPage({viewport:{width:1360,height:900}, reducedMotion:'reduce', colorScheme:'light'});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const dialog = page.getByRole('dialog', {name:'Choose a working folder'});
  const action = name => dialog.getByRole('button', {name, exact:true});
  const trigger = page.getByRole('button', {name:/^Change working folder,/});
  const shot = async name => {
    await expect(dialog).toBeInViewport({ratio:1});
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({path: resolve(out, name + '.png')});
  };
  const openRow = path => dialog.locator('.fp-row').filter({has:page.getByText(path, {exact:true})}).click();
  const field = dialog.getByLabel('Workspace path', {exact:true});
  const choose = action('Use this folder');
  await page.goto(app.url);
  await expect(trigger).toContainText(home + '/agent_scratch');
  await trigger.click();
  await expect(dialog.locator('.fp-row')).toHaveCount(3);
  await expect(choose).toBeDisabled();
  await shot('01-workspace-locations');
  await openRow('/Shared');
  await openRow(project);
  await expect(dialog.getByText('Monthly reporting', {exact:true})).toBeVisible();
  await expect(dialog.getByText('notes', {exact:true})).toHaveCount(0);
  await shot('02-project-selection');
  await openRow(project + '/Forecasts');
  await expect(dialog.getByText('No subfolders here.')).toBeVisible();
  listingFailure = true;
  await action('Back to previous location').click();
  await expect(action('Retry listing')).toBeVisible();
  listingFailure = false;
  await action('Retry listing').click();
  await expect(dialog.getByText('Forecasts', {exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(trigger).toContainText(home);
  await trigger.click();
  const search = dialog.getByRole('textbox', {name:'Find a folder by name'});
  await search.fill('Q');
  await expect(dialog.getByText('Enter two characters to search.')).toBeVisible();
  await search.fill('unlisted');
  await expect(dialog.getByText('No matching folders in these results.')).toBeVisible();
  await search.fill('Forecasts');
  await expect(dialog.locator('.fp-row')).toHaveCount(2);
  // Two same-named folders must be distinguishable by their parent paths.
  await expect(dialog.getByText(project + '/Forecasts', {exact:true})).toBeVisible();
  await expect(dialog.getByText(second + '/Forecasts', {exact:true})).toBeVisible();
  await search.fill('Analyt');
  await openRow(project);
  await choose.click();
  await expect(trigger).toContainText(project);
  await page.screenshot({path: resolve(out, '05-confirmed-working-folder.png')});
  await trigger.click();
  await action('Open').click();
  await expect(choose).toBeDisabled();
  const many = Array.from({length:42}, (_,i) => project + '/Archive ' + i);
  many.forEach(path => paths.set(path,'DIRECTORY'));
  await search.fill('Archive');
  await expect(dialog.getByText(/Partial results/)).toBeVisible();
  await expect(dialog.locator('.fp-row')).toHaveCount(40);
  await openRow(many[0]);
  many.forEach(path => paths.delete(path));
  await choose.click();
  await expect(dialog.getByRole('alert')).toContainText('no longer available');
  await action('Cancel').click();
  expect((await app.json('/api/sessions')).sessions).toHaveLength(0);
  console.log('PASS browse, scoped search, cancellation, focus and selection without allocation');

  await trigger.click();
  await action('Enter a path').click();
  await field.fill('/Shared/' + 'a'.repeat(510));
  await expect(dialog.getByRole('alert')).toContainText('512');
  await expect(choose).toBeDisabled();
  await field.fill('/Workspace/');
  await expect(choose).toBeDisabled();
  await field.fill(project + '/notes');
  await choose.click();
  await expect(dialog.getByRole('alert')).toContainText('Choose a folder');
  await field.fill('/Shared/Private');
  await choose.click();
  await expect(dialog.getByRole('alert')).toContainText('do not have access');
  await shot('03-permission-denied');
  await field.fill('/Shared/Planned');
  await choose.click();
  await expect(action('Use future folder')).toBeVisible();
  await field.fill('/Shared/Design systems');
  await expect(action('Use future folder')).toHaveCount(0);
  metadataFailure = true;
  await choose.click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  metadataFailure = false;
  await expect(choose).toBeEnabled();
  // Hold a real metadata response until the chooser has already been dismissed.
  let received, release;
  const waiting = new Promise(resolve => { received = resolve; });
  holdStatus = reply => { release = reply; received(); };
  await choose.click();
  await waiting;
  await expect(action('Checking folder…')).toBeDisabled();
  await action('Cancel').click();
  holdStatus = undefined;
  release();
  await expect(trigger).toContainText(project);
  console.log('PASS root, file, denied, missing and transient error states');

  async function sendMission() {
    const created = page.waitForResponse(r => new URL(r.url()).pathname === '/api/sessions' && r.request().method() === 'POST');
    await page.getByRole('button', {name:/Create a notebook Build with your assistant/}).click();
    const response = await created;
    expect(response.status()).toBe(201);
    return (await response.json()).id;
  }
  const first = await sendMission();
  const change = page.getByRole('button', {name:'Change folder', exact:true});
  await expect(change).toBeVisible();
  await change.click();
  await action('Enter a path').click();
  await field.fill('/Workspace' + second + '/');
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({colorScheme:'dark'});
  await shot('04-new-conversation-mobile-dark');
  await action('Use for new conversation').click();
  await expect(trigger).toContainText(second);
  await page.setViewportSize({width:1360,height:900});
  const next = await sendMission();
  expect(next).not.toBe(first);
  const post = body => ({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  async function fence(id,path) { return (await app.json('/api/workspace/fence',post({sessionId:id,path}))).verdict; }
  for (const [id, inside, outside] of [[first,project,second],[next,second,project]]) {
    expect((await app.json('/api/sessions/' + id)).folder).toBe(inside);
    expect(await fence(id, inside + '/note')).toBe('allow');
    expect(await fence(id, outside + '/note')).toBe('ask');
    expect(await fence(id, inside + '-archive/note')).toBe('ask');
  }
  await page.goto(app.url + '/#/session/' + first);
  await page.reload();
  await expect(page.locator('.mission-footer code')).toContainText(project);
  await page.getByRole('button',{name:/^Account:/}).click();
  await page.getByRole('menuitem',{name:'Change working folder'}).click();
  await expect(dialog.locator('.fp-scope code')).toHaveText(project);
  await action('Cancel').click();
  console.log('PASS real session creation, independent fences, reload and account entry');

  await page.getByRole('tab', {name:'Files', exact:true}).click();
  await page.getByRole('button', {name:'Tree view'}).click();
  const sharedRow = page.getByRole('treeitem').filter({has:page.getByText('Shared', {exact:true})}).first();
  await sharedRow.hover();
  await sharedRow.getByRole('button', {name:'Work in Shared',exact:true}).click();
  await expect(dialog.locator('.fp-scope code')).toHaveText('/Shared');
  await action('Cancel').click();
  await page.getByRole('button', {name:'List view'}).click();
  await page.getByRole('row').filter({hasText:'agent_scratch'}).click({button:'right'});
  await page.getByRole('menuitem',{name:'Use as working folder'}).click();
  await expect(dialog.locator('.fp-scope code')).toHaveText(home + '/agent_scratch');
  await action('Cancel').click();
  await page.getByRole('button',{name:/^Account:/}).click();
  await page.getByRole('menuitem',{name:'Change working folder'}).click();
  await action('Enter a path').click();
  await field.fill('/Shared/新项目, FY27');
  await field.press('Enter');
  await action('Use future folder').click();
  await expect(trigger).toContainText('/Shared/新项目, FY27');
  expect((await app.json('/api/sessions')).sessions).toHaveLength(2);
  const invalid = await page.request.post(app.url + '/api/sessions', {data:{folder:'relative'}});
  expect(invalid.status()).toBe(422);
  expect(errors).toEqual([]);
  console.log('PASS Files entry uses the same confirmation');
} finally {
  await browser?.close();
  await app?.stop();
  workspace.close();
}
