import { chromium } from "playwright";

const URL = "https://hr-demo.enfonoerp.com/fatehhr";
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
    await page.waitForTimeout(50);
  }
}

async function waitForAppScreen(page) {
  await page.waitForSelector(
    "input[type=email], .keypad, .dashboard__greeting",
    { timeout: 10000 },
  );
}

async function currentScreen(page) {
  if (await page.$(".dashboard__greeting")) return "dashboard";
  if (await page.$(".keypad")) {
    return (await page.$(".pin__hint")) ? "pin_setup" : "pin_verify";
  }
  if (await page.$("input[type=email]")) return "login";
  return "unknown";
}

async function clickSubmit(page) {
  const btn = await page.waitForSelector(".pin__submit-btn", { timeout: 3000 });
  const label = (await btn.textContent())?.trim() ?? "";
  await btn.click();
  return label;
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  page.on("response", async (r) => {
    if (r.url().includes("/api/method/") && !r.ok()) {
      const text = await r.text().catch(() => "");
      errors.push(`${r.status()} ${r.url().split("/api/method/")[1]?.split("?")[0]}: ${text.slice(0, 150)}`);
    }
  });

  // ---- GATE 1: fresh visit → login
  await page.goto(URL, { waitUntil: "networkidle" });
  await waitForAppScreen(page);
  let screen = await currentScreen(page);
  check("Fresh visit (no session) lands on LOGIN", screen === "login", `screen=${screen}`);

  // ---- GATE 2: login email/pwd → PIN setup (PIN was cleared server-side)
  await page.fill("input[type=email]", EMAIL);
  await page.fill("input[type=password]", PASSWORD);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("fatehhr.api.auth.login")),
    page.click("button[type=submit]"),
  ]);
  await page.waitForSelector(".keypad", { timeout: 10000 });
  screen = await currentScreen(page);
  check("After login → PIN SETUP (PIN cleared server-side)", screen === "pin_setup", `screen=${screen}`);

  // ---- GATE 3: 4 dots default
  const initialDots = await page.$$eval(".pin__dot", (els) => els.length);
  check("PIN setup shows 4 dots by default", initialDots === 4, `dots=${initialDots}`);

  // ---- GATE 4: enter PIN → counter shows 4, EXACTLY 4 dots visible (no phantom dots)
  await typePin(page, PIN);
  const counter = (await page.textContent(".pin__count"))?.trim() ?? "";
  check("PIN counter shows '4 / 4–6'", /^4\s*\/\s*4.6$/.test(counter), `counter="${counter}"`);
  const dotsAfter4 = await page.$$eval(".pin__dot", (els) => els.length);
  check("At 4 digits: exactly 4 dots visible (no phantom 5th/6th)", dotsAfter4 === 4, `dots=${dotsAfter4}`);
  const saveLabel = await clickSubmit(page);
  check("Submit button on setup is labeled 'Save PIN'", /Save PIN/i.test(saveLabel), `label="${saveLabel}"`);

  // ---- GATE 5: → Dashboard (wait for profile to resolve and render name)
  await page.waitForSelector(".dashboard__greeting", { timeout: 10000 });
  await page.waitForFunction(
    () => /Demo Tester/.test(document.querySelector(".dashboard__greeting")?.textContent ?? ""),
    { timeout: 10000 },
  );
  const greeting = (await page.textContent(".dashboard__greeting"))?.trim() ?? "";
  check("After Save PIN → dashboard w/ name rendered", /Demo Tester/.test(greeting), `greeting="${greeting.slice(0, 80)}"`);

  // snapshot localStorage state after PIN set
  const ls = await page.evaluate(() => {
    const out = {};
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("fatehhr.")) out[k] = localStorage.getItem(k).length > 40 ? "<hash>" : localStorage.getItem(k);
    }
    return out;
  });
  check(
    "localStorage has pin_present='1' after Save PIN (regression guard for reported bug)",
    ls["fatehhr.pin_present"] === "1",
    JSON.stringify(ls),
  );

  // ---- GATE 6: simulate close + reopen — use a FRESH page so no in-memory state carries
  await page.close();
  const page2 = await context.newPage();
  const errors2 = [];
  page2.on("pageerror", (e) => errors2.push(`pageerror: ${e.message}`));
  page2.on("console", (m) => { if (m.type() === "error") errors2.push(`console.error: ${m.text()}`); });
  page2.on("response", async (r) => {
    if (r.url().includes("/api/method/") && !r.ok()) {
      const text = await r.text().catch(() => "");
      errors2.push(`${r.status()} ${r.url().split("/api/method/")[1]?.split("?")[0]}: ${text.slice(0, 150)}`);
    }
  });

  await page2.goto(URL, { waitUntil: "networkidle" });
  await waitForAppScreen(page2);
  screen = await currentScreen(page2);
  check("Reopen within 2h session → skips PIN, lands on dashboard", screen === "dashboard", `screen=${screen}`);

  // ---- GATE 7: simulate session expiry → reopen → PIN verify screen
  await page2.evaluate(() => {
    localStorage.setItem("fatehhr.pin_verified_at", String(Date.now() - 3 * 60 * 60 * 1000));
    location.reload();
  });
  await waitForAppScreen(page2);
  screen = await currentScreen(page2);
  check("After 2h expiry → PIN verify screen", screen === "pin_verify", `screen=${screen}`);

  // ---- GATE 8: Unlock with PIN → Dashboard
  await typePin(page2, PIN);
  const unlockLabel = await clickSubmit(page2);
  check("Submit on expired-session reopen labeled 'Unlock'", /Unlock|فتح/.test(unlockLabel), `label="${unlockLabel}"`);
  await page2.waitForSelector(".dashboard__greeting", { timeout: 10000 });
  check("Unlock → dashboard", true);

  // ---- GATE 9: OFFLINE PIN unlock (regression guard for reported bug)
  // Expire session, stay offline, correct PIN should unlock via local hash.
  await page2.evaluate(() => {
    localStorage.setItem("fatehhr.pin_verified_at", String(Date.now() - 3 * 60 * 60 * 1000));
    location.reload();
  });
  await waitForAppScreen(page2);
  await context.setOffline(true);
  await typePin(page2, PIN);
  await clickSubmit(page2);
  await page2.waitForSelector(".dashboard__greeting", { timeout: 5000 });
  check("Offline PIN unlock via local hash → dashboard", true);
  await context.setOffline(false);

  // ---- GATE 10: wrong PIN rejected (online, no local hash so server is the verifier)
  await page2.evaluate(() => {
    localStorage.setItem("fatehhr.pin_verified_at", String(Date.now() - 3 * 60 * 60 * 1000));
    localStorage.removeItem("fatehhr.pin_hash_local");
    location.reload();
  });
  await waitForAppScreen(page2);
  await typePin(page2, "9999");
  await clickSubmit(page2);
  await page2.waitForTimeout(1500);
  const errText = await page2.textContent(".pin__error").catch(() => null);
  check("Wrong PIN shows error", !!errText && errText.length > 0, `err="${(errText||"").trim().slice(0,60)}"`);

  if (errors.length || errors2.length) {
    console.log("\n--- errors captured ---");
    [...errors, ...errors2].slice(0, 30).forEach((e) => console.log("   •", e));
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} gates passed ===`);
if (failed.length) {
  console.log("\nFAILED:");
  failed.forEach((r) => console.log(`   ❌ ${r.name} — ${r.details}`));
  process.exit(1);
}
