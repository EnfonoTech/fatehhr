# Lessons Learned

A running diary of what broke, why, and the fix. Read this before
making similar changes — almost every entry here cost hours the first
time around.

For quick orientation + deploy commands, see **[AGENT_HANDOFF.md](./AGENT_HANDOFF.md)**.

---

## Source of truth: `frappe-vue-pwa` skill

Every architectural rule for this codebase lives in the
`frappe-vue-pwa` skill:

- §3.3 `platform.ts` shape — `isNative()` + `API_BASE()`
- §3.4 Static imports of `@capacitor/*`
- §3.5 `doc.get_password()` + stable `api_secret` reuse (never regenerate per call)
- §3.6 `ensure_capacitor_cors()` via `after_migrate`
- §3.7 Router — `createWebHashHistory()` on native, `createWebHistory("/fatehhr/")` on web
- §4.1–§4.8 Sync engine: online = synchronous, queue = offline-only;
  `saveItem` dedups, `effectiveImages` threads through; ONE photo
  uploader; drain never sends `client_modified`; `flagOrphans` marks
  rather than deletes; `PhotoSlot` auto-clears missing blobs;
  absolute URLs on native
- §5 Commandments, especially #15 (bump `versionCode` AND
  `NATIVE_VERSION` every build) and #17 (fresh keystore backed up
  twice)
- §6 Forensic debug loop — always check server state and Frappe
  Error Log before a client-side fix

When a rule conflicts with what seems obvious, the skill wins.

---

## Phase 1 — foundation (2026-04-18)

- **CORS in Frappe v15 is in `site_config.json`**, key `allow_cors`, as a
  **JSON list**. NOT System Settings, NOT a comma string.
  `ensure_capacitor_cors()` writes there.
- **Module name** in `modules.txt` is `Fatehhr` (single token); module
  dir is `fatehhr/fatehhr/fatehhr/`. Fixtures use `"module": "Fatehhr"`.
- `bench new-app` on GS DEV failed its `bench build` step because an
  unrelated app (`management_reports`) on that shared bench was broken.
  The scaffold itself was fine. Production benches won't have this.
- GS DEV's bench has a `custom` app whose Python package is `develop`.
  Workaround: symlink the site-package:
  `ln -sf .../apps/custom/develop .../env/lib/python3.10/site-packages/custom`.
- **Offline PIN verification** uses a client-side hash
  (sha256 of `${api_secret}:${pin}`) stored in SecureStorage /
  localStorage. Server's hash is never exposed.

---

## Phase 5 — Capacitor APK (2026-04-18 / 04-19)

### 5.1 Keystore + signing

- PKCS12 keystore uses a **single password** for both store and key.
  Originally tried two separate env vars → Gradle complained about
  PKCS12 limitation. Fixed by having `signingConfigs.release` use
  one shared `pw = System.getenv("FATEHHR_KEYSTORE_PW")`.
- `_patch-build-gradle.py` initially **appended** `buildTypes` blocks
  producing a duplicate. Fixed to **replace** the default config and
  merge the signing into the existing `release` block.
- Custom colours (`ic_launcher_background`) initially emitted a new
  `colors_customer.xml` → duplicate resource error against Capacitor's
  default. Fix: overwrite the existing `colors.xml` directly.

### 5.2 CORS / login "Failed to fetch" on APK

`allow_cors` was being written as a comma string `"capacitor://localhost, http://localhost"`
on legacy installs; Frappe v15 requires a JSON list. `install.py::ensure_capacitor_cors()`
now overwrites with a list every `after_migrate`.

### 5.3 Session / PIN UX

- Phantom PIN dots when typing digit 4: `visibleDots` was an unbounded
  count. Clamp: `Math.max(MIN, Math.min(MAX, pin.value.length))`.
- PIN session was too short (single request). Store `pinVerifiedAt` in
  localStorage and accept within a 2-hour window.
- Offline unlock was failing because `navigator.onLine` isn't reliable
  → "Failed to fetch" was being treated as a wrong PIN. Fix: try the
  local hash **first**, only fall back to server verification.

---

## 1.0.7 → 1.0.8 — Frappe-HR visual refresh (2026-04-19)

- **Leave Hub** with gauge cards per leave type (half-arc SVG).
  `fatehhr.api.leave.types_with_balance` now includes `total` from
  Leave Allocation aggregation.
- **Expense totals** — new `fatehhr.api.expense.summary` endpoint
  powers the Claimed / Pending / Approved / Paid tiles.
- `GaugeCard.vue` half-arc math:
  ```ts
  const C = Math.PI * R;
  filled = (pct * C);        // remaining = ((1 - pct) * C)
  ```

---

## 1.0.7-bugs → 1.0.9 (2026-04-19)

### 1. Offline check-in state lost on app kill

**Symptom:** User checks IN offline → app killed → reopens still offline
→ button reads "Check In" (default) → user taps → queue gets a duplicate IN.

**Cause:** Pinia state was in-memory only. Offline state never persisted.

**Fix (`src/stores/checkin.ts`):**
- Persist `{currentStatus, currentTask, lastRow}` to localStorage on every mutation.
- Hydrate on store creation.
- Add `applyQueuedState()` that overrides stale server snapshot with the latest
  queued check-in so the UI reflects the user's actual last action.

### 2. Leave/Expense: API validation errors queued as "pending sync"

**Symptom:** Online submit of leave fails server-side (e.g. allocation
exhausted), UI shows "Queued — will sync when online." The drain then
errors with the same validation failure forever.

**Cause:** `try { online } catch { queue }` swallowed ALL errors.

**Fix:** In `stores/leave.ts` and `stores/expense.ts`:
```ts
} catch (err) {
  if (err instanceof ApiError) throw err;  // server validation — surface to user
  /* network failure — queue below */
}
```

### 3. Expense claim detail sheet blank with "detail() missing 'name'"

**Symptom:** Tap a claim → bottom sheet opens → error about missing argument.

**Cause:** `apiCall("GET", "…detail", { name })` puts `name` in the body.
For GET, the body is silently dropped by `apiCall`.

**Fix:** Put the param in the URL query string:
```ts
detail: (name: string) =>
  apiCall<ExpenseClaimDetail>("GET",
    `fatehhr.api.expense.detail?name=${encodeURIComponent(name)}`)
```

### 4. Expense type field rejected as LinkValidationError

**Symptom:** Free-text "Tre" → LinkValidationError on submit
(no such Expense Claim Type).

**Fix:** New `fatehhr.api.expense.expense_types` endpoint. Swap the
free-text `<input>` for a `<select>` populated from the server.

### 5. Android back button exits immediately

**Symptom:** User taps any section, hits Android back → app exits
directly (skipping home screen + confirmation).

**Cause:** `@capacitor/app` was in the frontend `package.json` but **not
in `android-capacitor/package.json`**, so the native plugin was never
synced. `App.addListener("backButton")` silently didn't fire; default
behaviour (exit) took over.

**Fix:**
```bash
cd android-capacitor
pnpm add @capacitor/app@^6.0.0
npx cap sync android
```

Then implemented `src/app/native-back.ts`:
- **Route-hierarchy** based (not `window.history`!). Each route maps to
  a parent path. `router.back()` cycled every visited screen; users
  expect "one level up".
- Home tap → toast "Press back again to exit" + double-tap within 2s exits.

---

## 1.0.9-bugs → 1.0.10 / 1.0.11 / 1.0.12 (2026-04-19)

### 6. Auto-return after check-in/out

**Request:** After a successful IN/OUT, user shouldn't have to manually tap back.

**Fix:** 800ms delay (to flash the success message), then `router.replace("/")`.
Check that the route is still `/checkin` before replacing in case the user
navigated away.

### 7. Offline timestamps showed sync time (round 1)

**Cause:** Frappe's `get_datetime("2026-04-19T06:00:00.000Z")` was
dropping the tzinfo on newer installs. Downstream `if ts.tzinfo is
not None:` check was false → naive UTC datetime stored as if site-local.

**Fix (`fatehhr/api/checkin.py`):** use `dateutil.parser.isoparse`
which always preserves tz, convert to site tz, strip.
```python
def _parse_client_ts(ts_str):
    dt = isoparse(ts_str)
    if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(ZoneInfo(get_system_timezone())).replace(tzinfo=None)
```

### 8. Icon refresh + new Saudi Riyal symbol

**Request:** Replace all emoji/unicode icons with clean SVG set; swap
rupee `₹` for the new SAMA Saudi Riyal glyph.

**Fix:** Single `src/components/Icon.vue` with 17 icons at 24×24 /
1.75-stroke currentColor. Replaced across BottomNav, QuickActionGrid,
LeaveHubView, MoreView, DashboardView, CheckinHistoryView,
AmountDisplay (SR glyph for currency === "SAR").

---

## 1.0.12-bugs → 1.0.13 / 1.0.14 (2026-04-19)

### 9. Offline timestamps (round 2) — display off by TZ offset

**Symptom:** User in Riyadh (UTC+3), site in Muscat (UTC+4). Capture
at 15:10 Riyadh → shown as 16:25 on phone. Off by the TZ delta.

**Cause:** Server storage was correct — naive Muscat-local. API
returned `"2026-04-19 19:25:16"` with **no timezone tag**. Phone's
`new Date("2026-04-19T19:25:16")` parses naive ISO as **device-local**,
so the wall-clock shifts by (site_tz - device_tz).

**Fix:** Ship UTC-ISO (`"2026-04-19T15:25:16Z"`) from every datetime-
returning endpoint. Phone's `new Date()` converts correctly to device-local.

Helper in `fatehhr/api/checkin.py`:
```python
def _naive_site_to_utc_iso(dt):
    if dt is None: return None
    if dt.tzinfo is None: dt = dt.replace(tzinfo=ZoneInfo(get_system_timezone()))
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
```

Applied to:
- `fatehhr.api.checkin.create` response `time`
- `fatehhr.api.checkin.list_mine` rows `time`
- `fatehhr.api.attendance.month` pair `in`/`out`

Client:
- `AttendanceCalendarView` switched from raw string slicing (`p.in.slice(11,16)`)
  to `new Date().toLocaleTimeString()`.
- `CheckinHistoryView` + `DashboardView` show `HH:MM:SS` (users tap too fast
  for minute-precision to distinguish close IN/OUT).

**Rule:** Any datetime shipped to the client must be **UTC ISO with Z**, never naive.
Same rule for any future API adding datetime fields.

### 10. Payslip PDF download didn't work

Two separate bugs:

**Server:** `wkhtmltopdf` failed with `HostNotFoundError`. The PDF HTML
references the company logo at `/files/…`; wkhtmltopdf prepended the
base URL from `frappe.utils.get_url()` which returned `http://hr_demo`
(unresolvable). Fix:
```bash
bench --site hr_demo set-config host_name https://hr-demo.enfonoerp.com
```

**Client:** The download code did:
```ts
const a = document.createElement("a"); a.download = fname; a.click();
```
Android WebView **silently ignores** the download attribute. The click
fires but no file is saved — user sees nothing.

Fix: new `saveBlobToDevice()` helper in `src/app/frappe.ts`:
- **Native**: `Filesystem.writeFile` via `@capacitor/filesystem` →
  Documents/, shows "Saved to Documents."
- **Web**: keeps the anchor-click fallback.
- Sanitise filenames (Frappe doc names have slashes: `Sal Slip/None/00004`).

### 11. Payslip generation needed setup

When we tried to generate Jan/Feb/Mar 2026 slips for FHR-DEMO:
- No Salary Structure Assignment existed → created `HR-SSA-26-04-00001`
  against `HO - EXPAT` structure, base 500 OMR, from 2026-01-01.
- **First generation had gross=0.0** because `payment_days=0` — the
  Salary Structure uses formulas like `base * 0.6` multiplied by
  day fraction. With zero attendance rows for Jan–Mar 2026, every day
  was marked absent.
- Fix: bulk-created 90 Attendance rows (`status="Present"`) for the
  full quarter. Slips regenerated cleanly at 500 OMR each.

**For any future demo setup:** Attendance rows are a prerequisite for
non-zero salary slips.

---

## Standing rules derived from above

1. **Any datetime to the client → UTC-ISO with `Z`.** No naive strings, ever.
2. **Any new Capacitor plugin → `pnpm add` in `android-capacitor/` + `npx cap sync android`.** JS bundle alone is insufficient.
3. **Any queue processor → `timestamp: payload.timestamp` must pass through.** Never stamp with `now()` on drain.
4. **`apiCall("GET", ...)` body is silently dropped.** Params belong in the URL.
5. **`ApiError` ≠ network error.** Re-throw `ApiError`, only queue on network failures.
6. **Name sanitisation for any device filesystem / share sheet** — Frappe doc names contain `/` and spaces.
7. **Show seconds (`HH:MM:SS`) on check-in-class data.** Minute precision hides rapid taps.
8. **Never commit `dist/`, `*.apk`, `*.keystore`, or stale `.vue.js` artifacts.**
9. **`bump-version.mjs` is the only way to bump `NATIVE_VERSION` / `NATIVE_VERSION_CODE`.** They stay in lockstep.
10. **Maintenance window is 2:00–5:00 AM IST.** For same-day fixes, `supervisorctl signal QUIT` not `restart`.
