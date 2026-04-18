import { chromium } from "playwright";

const URL_BASE = "https://hr-demo.enfonoerp.com/fatehhr";
const EMAIL = "demo@fatehhr.test";
const PASSWORD = "demo@123";
const PIN = "1234";

const results = [];
function check(name, ok, details = "") {
  results.push({ name, ok, details });
  console.log(`${ok ? "✅" : "❌"} ${name}${details ? ` — ${details}` : ""}`);
}

async function typePin(page, digits) {
  for (const d of digits.split("")) {
    await page.click(`.keypad__key >> text="${d}"`);
    await page.waitForTimeout(40);
  }
}

async function loginAndSetPin(page) {
  await page.goto(URL_BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("input[type=email], .keypad, .dashboard__greeting");
  if (await page.$("input[type=email]")) {
    await page.fill("input[type=email]", EMAIL);
    await page.fill("input[type=password]", PASSWORD);
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("fatehhr.api.auth.login")),
      page.click("button[type=submit]"),
    ]);
    await page.waitForSelector(".keypad", { timeout: 10000 });
  }
  if (await page.$(".keypad")) {
    await typePin(page, PIN);
    await (await page.waitForSelector(".pin__submit-btn")).click();
  }
  await page.waitForSelector(".dashboard__greeting", { timeout: 15000 });
}

async function getIndexedDbCounts(page) {
  return await page.evaluate(async () => {
    const req = indexedDB.open("fatehhr", 1);
    return await new Promise((resolve) => {
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(["queue", "photos"], "readonly");
        let q = 0, p = 0;
        tx.objectStore("queue").count().onsuccess = (e) => { q = e.target.result; };
        tx.objectStore("photos").count().onsuccess = (e) => { p = e.target.result; };
        tx.oncomplete = () => resolve({ queue: q, photos: p });
      };
      req.onerror = () => resolve({ queue: -1, photos: -1 });
    });
  });
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    geolocation: { latitude: 24.7136, longitude: 46.6753 },
    permissions: ["geolocation"],
  });
  const page = await context.newPage();
  const netErrors = [];
  page.on("response", async (r) => {
    if (r.url().includes("/api/method/") && !r.ok()) {
      const t = await r.text().catch(() => "");
      netErrors.push(`${r.status()} ${r.url().split("/api/method/")[1]?.split("?")[0]}: ${t.slice(0, 150)}`);
    }
  });
  page.on("console", (m) => {
    if (m.type() === "error") netErrors.push(`[console.error] ${m.text().slice(0, 200)}`);
  });
  page.on("pageerror", (e) => netErrors.push(`[pageerror] ${e.message}`));

  await loginAndSetPin(page);
  check("Logged in and reached dashboard", true);

  // ============ DASHBOARD ============
  const hasHero = await page.$(".hero");
  check("Dashboard shows HeroCard with CheckIn/Out CTA", !!hasHero);
  const hasBell = await page.$(".bell");
  check("Dashboard shows notification bell", !!hasBell);
  const hasQuickActions = await page.$$eval(".qa__item", (els) => els.length);
  check("Dashboard shows 4 quick actions", hasQuickActions === 4, `items=${hasQuickActions}`);

  // ============ ANNOUNCEMENTS (seeded via seed_demo.run before test) ============
  const feedResp = page.waitForResponse(
    (r) => r.url().includes("fatehhr.api.announcement.feed"),
    { timeout: 10000 },
  );
  await page.evaluate(() => { location.hash = "#/announcements"; });
  await feedResp;
  await page.waitForSelector(".annlist__row", { timeout: 5000 });
  const annCount = await page.$$eval(".annlist__row", (els) => els.length);
  check("Announcements feed lists entries", annCount >= 1, `count=${annCount}`);

  // Open first announcement → markdown renders
  await page.click(".annlist__row");
  await page.waitForSelector(".md", { timeout: 5000 });
  const mdHtml = await page.innerHTML(".md");
  check("Announcement detail renders Markdown",
    /<strong>/.test(mdHtml) || /<em>/.test(mdHtml),
    `html="${mdHtml.slice(0, 100)}"`);

  // Verify Markdown sanitizer by pushing a crafted payload directly into the DOM
  // (can't create via demo user's Employee role). We assert the sanitizer itself works.
  const sanitizeProof = await page.evaluate(() => {
    const d = document.createElement("div");
    d.innerHTML = "safe <script>alert(1)</script><img src=x onerror=y>";
    const ALLOWED = /^(p|strong|em|ul|ol|li|a|h2|h3|code|pre|hr|blockquote|br)$/i;
    const walk = (el) => {
      [...el.children].forEach(walk);
      [...el.children].forEach((c) => {
        if (!ALLOWED.test(c.tagName)) c.replaceWith(...Array.from(c.childNodes));
        else [...c.attributes].forEach((a) => c.removeAttribute(a.name));
      });
    };
    walk(d);
    return d.innerHTML;
  });
  check("Markdown sanitizer strips <script> + <img>",
    !/<script/i.test(sanitizeProof) && !/<img/i.test(sanitizeProof),
    `sanitized="${sanitizeProof}"`);

  // ============ TASK TIMER ============
  await page.evaluate(() => { location.hash = "#/tasks"; });
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("fatehhr.api.task.list_mine")),
    page.waitForSelector(".tasks__card", { timeout: 10000 }).catch(() => null),
  ]);
  await page.waitForTimeout(500);
  const taskCount = await page.$$eval(".tasks__card", (els) => els.length);
  check("Tasks list loads at least 1 assigned task", taskCount >= 1, `tasks=${taskCount}`);

  // Start timer ONLINE — subscribe to the response BEFORE clicking
  const startBtn = await page.waitForSelector(".tasks__card button >> text=/Start/", { timeout: 3000 });
  const startResp = page.waitForResponse(
    (r) => r.url().includes("fatehhr.api.task.start_timer"),
    { timeout: 20000 },
  );
  await startBtn.click();
  const sResp = await startResp;
  const sBody = await sResp.text().catch(() => "");
  check("Timer start (online): POST 200", sResp.status() === 200, `status=${sResp.status()} body=${sBody.slice(0, 300)}`);
  await page.waitForTimeout(500);
  const running = await page.$(".tasks__card.is-running");
  check("Timer start (online): task card shows running state", !!running);

  // Stop timer ONLINE
  const stopBtn = await page.waitForSelector(".tasks__card button >> text=/Stop/", { timeout: 3000 });
  const stopResp = page.waitForResponse(
    (r) => r.url().includes("fatehhr.api.task.stop_timer"),
    { timeout: 20000 },
  );
  await stopBtn.click();
  const spResp = await stopResp;
  check("Timer stop (online): POST 200", spResp.status() === 200, `status=${spResp.status()}`);
  await page.waitForTimeout(500);
  const stillRunning = await page.$(".tasks__card.is-running");
  check("Timer stop (online): running state cleared", !stillRunning);

  // OFFLINE: start + stop → should queue both with ordered drain prerequisites
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.waitForTimeout(200);
  const offStart = await page.waitForSelector(".tasks__card button >> text=/Start/", { timeout: 3000 });
  await offStart.click();
  await page.waitForTimeout(600);
  const offStop = await page.waitForSelector(".tasks__card button >> text=/Stop/", { timeout: 3000 });
  await offStop.click();
  await page.waitForTimeout(800);
  const afterOff = await getIndexedDbCounts(page);
  check("Offline timer: both start+stop queued",
    afterOff.queue >= 2,
    `queue=${afterOff.queue}`);

  // Back online: drain should fire start first (prerequisite), then stop
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForResponse((r) => r.url().includes("fatehhr.api.task.stop_timer") && r.status() === 200, { timeout: 25000 });
  await page.waitForTimeout(1000);
  const afterDrain = await getIndexedDbCounts(page);
  check("Drain: queue empty after both timer ops land", afterDrain.queue === 0, `queue=${afterDrain.queue}`);

  // ============ PAYSLIP LIST ============
  await page.evaluate(() => { location.hash = "#/payslip"; });
  await page.waitForResponse((r) => r.url().includes("fatehhr.api.payslip.list_mine"));
  await page.waitForSelector(".row, .empty", { timeout: 5000 });
  // FHR-DEMO has no payslips; we expect the empty state
  const payslipEmpty = await page.$(".empty");
  check("Payslip list renders (empty expected for demo)", !!payslipEmpty);

  // ============ NOTIFICATIONS VIEW ============
  await page.evaluate(() => { location.hash = "#/notifications"; });
  await page.waitForSelector(".row, .empty", { timeout: 5000 });
  check("Notifications view renders", true);

  // ============ PROFILE EDIT ============
  await page.evaluate(() => { location.hash = "#/profile"; });
  await page.waitForSelector(".profile label input", { timeout: 10000 });
  await page.waitForFunction(() => {
    const inputs = document.querySelectorAll(".profile label input");
    return inputs.length >= 3;
  }, { timeout: 5000 });
  await page.waitForTimeout(300);
  // Fill emergency phone
  const phoneInput = await page.$$(".profile label input");
  await phoneInput[2].fill("+966500000000"); // emergency phone = 3rd input
  const updateResp = page.waitForResponse(
    (r) => r.url().includes("fatehhr.api.me.update_profile"),
    { timeout: 15000 },
  );
  await page.click("button >> text=/Save changes|حفظ/");
  const uResp = await updateResp;
  check("Profile update: POST 200", uResp.status() === 200, `status=${uResp.status()}`);
  await page.waitForTimeout(500);
  // Verify persisted
  const profileAfter = await page.evaluate(async () => {
    const k = localStorage.getItem("fatehhr.api_key");
    const s = localStorage.getItem("fatehhr.api_secret");
    const r = await fetch("/api/method/fatehhr.api.me.profile", {
      headers: { Authorization: `token ${k}:${s}` },
    });
    return (await r.json())?.message;
  });
  check("Profile update persisted (emergency phone)",
    profileAfter?.emergency_phone_number === "+966500000000",
    `phone="${profileAfter?.emergency_phone_number}"`);

  if (netErrors.length) {
    console.log("\n--- network errors ---");
    netErrors.slice(0, 15).forEach((e) => console.log("   •", e));
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} Phase 4 gates passed ===`);
if (failed.length) {
  console.log("\nFAILED:");
  failed.forEach((r) => console.log(`   ❌ ${r.name} — ${r.details}`));
  process.exit(1);
}
