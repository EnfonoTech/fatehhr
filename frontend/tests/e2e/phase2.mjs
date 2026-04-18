import { chromium } from "playwright";

const URL_BASE = "https://hr-demo.enfonoerp.com/fatehhr";
const EMAIL = "demo@fatehhr.test";
const PASSWORD = "demo@123";
const PIN = "1234";
const COORDS = { latitude: 24.7136, longitude: 46.6753 };  // matches seeded task radius

const results = [];
function check(name, ok, details = "") {
  results.push({ name, ok, details });
  console.log(`${ok ? "✅" : "❌"} ${name}${details ? ` — ${details}` : ""}`);
}

async function typePin(page, digits) {
  for (const d of digits.split("")) {
    await page.click(`.keypad__key >> text="${d}"`);
    await page.waitForTimeout(50);
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
    const btn = await page.waitForSelector(".pin__submit-btn", { timeout: 3000 });
    await btn.click();
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
        const queueStore = tx.objectStore("queue");
        const photoStore = tx.objectStore("photos");
        let queueCount = 0, photoCount = 0;
        queueStore.count().onsuccess = (e) => { queueCount = e.target.result; };
        photoStore.count().onsuccess = (e) => { photoCount = e.target.result; };
        tx.oncomplete = () => resolve({ queue: queueCount, photos: photoCount });
        tx.onerror = () => resolve({ queue: -1, photos: -1, error: tx.error?.message });
      };
      req.onerror = () => resolve({ queue: -1, photos: -1, error: "open failed" });
    });
  });
}

async function getServerCheckinCount(page) {
  return await page.evaluate(async () => {
    const apiKey = localStorage.getItem("fatehhr.api_key");
    const apiSecret = localStorage.getItem("fatehhr.api_secret");
    const r = await fetch("/api/method/fatehhr.api.checkin.list_mine", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `token ${apiKey}:${apiSecret}`,
      },
      body: JSON.stringify({ page: 1, page_size: 100 }),
    });
    const data = await r.json();
    return (data?.message ?? []).length;
  });
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    geolocation: COORDS,
    permissions: ["geolocation"],
    locale: "en-US",
  });
  const page = await context.newPage();
  const netErrors = [];
  page.on("response", async (r) => {
    if (r.url().includes("/api/method/") && !r.ok()) {
      const t = await r.text().catch(() => "");
      netErrors.push(`${r.status()} ${r.url().split("/api/method/")[1]?.split("?")[0]}: ${t.slice(0, 150)}`);
    }
  });

  // ---- Prerequisite: login + set PIN → dashboard
  await loginAndSetPin(page);
  check("Logged in and reached dashboard", true);

  // Baseline counts
  const baselineServer = await getServerCheckinCount(page);
  const baselineLocal = await getIndexedDbCounts(page);
  console.log(`   baseline: server=${baselineServer} checkins, local queue=${baselineLocal.queue}`);

  // ---- GATE 1: navigate to Check-in
  await page.click(".bnav__tab[href='/checkin'], [href='#/checkin']").catch(async () => {
    await page.evaluate(() => { location.hash = "#/checkin"; });
  });
  await page.waitForSelector(".checkin", { timeout: 10000 });
  check("Check-in screen loads", true, `url: ${page.url()}`);

  // ---- GATE 2: map preview + geofence chip render
  await page.waitForSelector(".mapprev", { timeout: 10000 });
  await page.waitForSelector(".checkin__geofence", { timeout: 5000 });
  const gfText = (await page.textContent(".checkin__geofence"))?.trim();
  check("Geofence chip renders", !!gfText, `"${gfText}"`);

  // ---- GATE 3: ONLINE check-in writes to server, queue stays empty
  const checkInBtn = await page.waitForSelector(
    ".checkin button >> text=/Check In|Check Out/", { timeout: 5000 },
  );
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("fatehhr.api.checkin.create") && r.status() === 200),
    checkInBtn.click(),
  ]);
  await page.waitForTimeout(500);
  const afterOnline = await getIndexedDbCounts(page);
  const serverAfterOnline = await getServerCheckinCount(page);
  check(
    "Online check-in: server row created",
    serverAfterOnline === baselineServer + 1,
    `server went ${baselineServer} → ${serverAfterOnline}`,
  );
  check(
    "Online check-in: local queue stays empty (no double-write)",
    afterOnline.queue === baselineLocal.queue,
    `queue=${afterOnline.queue}`,
  );

  // ---- GATE 4: OFFLINE check-in queues locally
  await context.setOffline(true);
  // Force UI to notice offline (some browsers fire 'offline' event on setOffline, some don't)
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.waitForTimeout(300);

  const nextBtn = await page.waitForSelector(
    ".checkin button >> text=/Check In|Check Out/", { timeout: 5000 },
  );
  await nextBtn.click();
  await page.waitForTimeout(1500);
  const afterOffline = await getIndexedDbCounts(page);
  check(
    "Offline check-in: queued locally (+1 entry)",
    afterOffline.queue === baselineLocal.queue + 1,
    `queue=${afterOffline.queue} (expected ${baselineLocal.queue + 1})`,
  );

  // ---- GATE 5: SyncBar reflects pending count
  const syncLabel = (await page.textContent(".sync-bar__label"))?.trim() ?? "";
  check(
    "SyncBar shows pending/offline state",
    /pending|offline|غير متصل|بانتظار/i.test(syncLabel),
    `label: "${syncLabel}"`,
  );

  // ---- GATE 6: go back online → drain empties the queue and server receives the queued check-in
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  // drain is kicked off from SyncBar's onOnline; wait for POST then queue to drain
  await page.waitForResponse(
    (r) => r.url().includes("fatehhr.api.checkin.create") && r.request().method() === "POST",
    { timeout: 15000 },
  );
  await page.waitForTimeout(1000);
  const afterDrain = await getIndexedDbCounts(page);
  const serverAfterDrain = await getServerCheckinCount(page);
  check(
    "Online again: queue drained to 0",
    afterDrain.queue === baselineLocal.queue,
    `queue=${afterDrain.queue}`,
  );
  check(
    "Online again: server row recorded from queue (total +2)",
    serverAfterDrain === baselineServer + 2,
    `server went ${baselineServer} → ${serverAfterDrain}`,
  );

  // ---- GATE 7: History view lists today's check-ins
  await page.evaluate(() => { location.hash = "#/checkin/history"; });
  await page.waitForSelector(".hist, .row", { timeout: 5000 });
  const rowCount = await page.$$eval(".row", (els) => els.length);
  check(
    "History view renders at least the 2 new check-ins",
    rowCount >= 2,
    `rendered rows=${rowCount}`,
  );

  if (netErrors.length) {
    console.log("\n--- network errors ---");
    netErrors.slice(0, 10).forEach((e) => console.log("   •", e));
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} Phase 2 gates passed ===`);
if (failed.length) {
  console.log("\nFAILED:");
  failed.forEach((r) => console.log(`   ❌ ${r.name} — ${r.details}`));
  process.exit(1);
}
