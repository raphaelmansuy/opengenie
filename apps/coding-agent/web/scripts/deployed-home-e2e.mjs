/** The deployed app: the identity, the home screen, and the folder tree picker against the real workspace.
 *   DATABRICKS_TOKEN=... APP_URL=... node scripts/deployed-home-e2e.mjs */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const APP = process.env.APP_URL, TOKEN = process.env.DATABRICKS_TOKEN;
const out = process.env.OUT ?? "../../../specs/006-databricks/e2e/home";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
let failed = 0;
const check = (n, ok, d = "") => { if (!ok) failed++; console.log(`  ${ok ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`); };
for (const w of [1440, 800]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2, extraHTTPHeaders: { Authorization: `Bearer ${TOKEN}` } });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(APP, { waitUntil: "load" });
  await p.locator(".home").waitFor({ timeout: 60000 });
  await p.waitForTimeout(2000);
  console.log(`\n--- deployed ${w}px`);
  check(`${w}: OpenGenie in the brand`, /OpenGenie/.test((await p.locator(".brand").innerText()).replace(/\n/g, "")));
  check(`${w}: the tab is OpenGenie`, (await p.title()) === "OpenGenie");
  check(`${w}: favicon served`, (await p.request.get(`${APP}/favicon.svg`)).status() === 200);
  check(`${w}: the folder picker is there`, (await p.locator(".fp-trigger").count()) === 1);
  await p.screenshot({ path: `${out}/deployed-${w}-home.png` });
  if (w === 1440) {
    await p.locator(".fp-trigger").click();
    await p.locator(".fp-pop").waitFor({ timeout: 15000 });
    await p.waitForFunction(() => [...document.querySelectorAll(".fp-pop .fp-row")].length > 2, null, { timeout: 30000 }).catch(() => {});
    check("the picker lists real workspace folders", (await p.locator(".fp-pop .fp-row").count()) > 2);
    await p.screenshot({ path: `${out}/deployed-${w}-picker.png` });
    const home = p.locator(".fp-pop .fp-row").filter({hasText:"My home"});
    await home.click();
    await p.getByRole("button", {name:"Back to previous location"}).waitFor();
    check("home opens for browsing", (await p.locator(".fp-location strong").innerText()).startsWith("/Users/"));
    await p.screenshot({ path: `${out}/deployed-${w}-tree.png` });
    await p.keyboard.press("Escape");
  }
  check(`${w}: no page errors`, errors.length === 0, errors.join(" | "));
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} failed` : "\nall passed");
