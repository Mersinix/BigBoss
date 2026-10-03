import { chromium } from "playwright";

const BASE = "http://localhost:5000";
const OUT = "C:/Users/DELL/AppData/Local/Temp/claude/c--Users-DELL-Desktop-CLAUDE-BigBossCoffee/0ce1bef8-54d9-4c49-bf4d-ad47f3a44249/scratchpad";
const SID_ADMIN = "s%3AtuHjyhnaGjZVoDW94EVsJa9dk6NOy8gx.EwWbkcMFyKdenIph4iifgBihAD99NCQN%2BqiNYj%2Fhs8g";
const SID_BARISTA = "s%3AL0tmBqYomjm3-tmPIqtNKPzBDG02Nw2d.1vMfqJ54Q%2Flg0V4c4mSy6ltNUymIp2AIO%2BWRotAbO3c";
const SID_OWNER = "s%3AOoxDMCyJNV2772x43zPhUIE5xwTSgktW.QMsg5Edxt3DynspnEgvWIXetY4Pk72B3F7L9HbltsTw";

async function withSession(sid, fn) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([{ name: "connect.sid", value: sid, domain: "localhost", path: "/", httpOnly: true }]);
  const page = await context.newPage();
  try { await fn(page); } catch (e) { console.error("ERROR:", e.message); }
  await browser.close();
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("saved", name);
}

// 1. Admin Competences switcher
await withSession(SID_ADMIN, async (page) => {
  await page.goto(`${BASE}/admin/barista`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const skillsTab = page.locator('[data-testid="tab-skills"], button:has-text("Compétences")').first();
  if (await skillsTab.count() > 0) { await skillsTab.click(); await page.waitForTimeout(800); }
  await shot(page, "30-admin-competences-skills");
  const eduTab = page.locator('[data-testid="tab-barista-competences-education"]');
  if (await eduTab.count() > 0) { await eduTab.click(); await page.waitForTimeout(500); await shot(page, "31-admin-competences-education"); }
  const langTab = page.locator('[data-testid="tab-barista-competences-language"]');
  if (await langTab.count() > 0) { await langTab.click(); await page.waitForTimeout(500); await shot(page, "32-admin-competences-language"); }
});

// 2. Barista profile page
await withSession(SID_BARISTA, async (page) => {
  await page.goto(`${BASE}/barista-marketplace/business?tab=profile`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  await shot(page, "33-barista-profile-top");
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(400);
  await shot(page, "34-barista-profile-scrolled");
});

// 3. Coffee Owner /barista filters
await withSession(SID_OWNER, async (page) => {
  await page.goto(`${BASE}/barista`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  await shot(page, "35-cafe-owner-barista-filters");
});
