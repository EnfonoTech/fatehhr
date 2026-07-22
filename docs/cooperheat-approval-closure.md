# Cooperheat — Attendance Approval: Implementation & Deploy Closure

**Date:** 2026-07-22
**Site:** `cooperheat.enfonoerp.com` → Caddy (control `194.163.160.83`) → **New Server `94.72.99.148`**, bench `/home/frappe/frappe-bench` (user `frappe`)
**Apps:** `cooperheat` (schema + workflow + scheduler owner) · `fatehhr` (mobile PWA/APK consumer)
**Spec source:** `docs/cooperheat-approval-feature-flow.md` (FINAL)

---

## 1. Starting point

The approval feature was ~95% already built (site picker, OUT carry, activity log,
approvals list/detail, multi-pair time edit, consumer API, guard tests). Two gaps from
spec §8 required work; everything else matched.

## 2. What changed

### Gap B — scheduler escalation (`cooperheat`, `main` → `fe4e69c`)
`cooperheat/cooperheat/api/tasks.py :: process_attendance_approval_windows`

- **Before:** only records already at *Pending Level 3* with a lapsed window were
  auto-approved (raw `workflow_state` write). Records stuck at L1/L2 with a lapsed
  window never advanced.
- **After:** any pending record whose `window_expires_at` has passed advances **one
  level per run** via `apply_workflow("Level N Approve")`:
  `Pending L1 →(lapse)→ Pending L2 →(lapse)→ Pending L3 →(lapse)→ Approved`.
  A lapsed window is treated as an **approval, never a rejection**. Once both the L1
  and L2 windows lapse, the record reaches L3 (payroll) and finalises to Approved when
  the L3 window lapses (or immediately if no L3 approver — existing
  `_auto_approve_if_no_level3`). Status stays **threshold-computed** (Present / Half
  Day / Absent) — escalation never forces a status.
- Applies the workflow transition (not a raw state write) so
  `on_update_after_submit` re-stamps the next level's approver + window, notifies
  them, and recomputes hours.
- Runs as Administrator with `ignore_permissions` → a missing mid-level approver
  doesn't stall the cascade. Idempotent, per-record `try/except` + commit.
- **`limit` (default 200, oldest-window first)** caps work + queued approver emails
  per hourly run, so a backlog drains over a few ticks rather than in one burst.

### Gap A — 24h employee time-adjust (`fatehhr`, `feature/cooperheat-approvals` → `a832ad9`)
- `frontend/src/views/CheckinView.vue`: `datetime-local` picker on check-in/out,
  `min = now−24h`, `max = now`, default now. Sends the chosen time only when the
  employee actually backdated (>1 min from now); client-side range check.
- `stores/checkin.ts` / `api/checkin.ts`: `adjusted_time` → becomes the queued
  `timestamp`, so the **offline drain replays the same intended time** (drain-safe).
- `fatehhr/api/checkin.py`: `_guard_not_future()` — server rejects a **future-dated**
  punch only (upper bound). The past is intentionally unbounded so an offline
  check-in draining hours/days late still lands with its real (older) time. The 24h
  lower bound is enforced client-side (where the tap moment is known), never
  re-clamped server-side against `now`. Tests in `fatehhr/api/test_checkin.py`.
- i18n: `checkin.time` / `time_hint` / `time_out_of_range` (en + ar).

### Rebrand → Cooperheat APK (`fatehhr`)
- `customers/.env.cooperheat`: `CUSTOMER_BRAND_NAME="Cooperheat"`,
  `CUSTOMER_PRIMARY_COLOR="#CE0A0D"` (brand red, sampled from the supplied icon —
  drives icon/splash **and** app accent). `APP_ID_ANDROID`, `CUSTOMER_APPROVALS_ENABLED=true` unchanged.
- `customers/logo.cooperheat.png`: the designer's safe-zoned adaptive-foreground art.
- `scripts/generate-customer-assets.mjs`: uses `customers/logo.<slug>.png` when
  present (full-canvas, pre-safe-zoned), else the generated khatam glyph fallback.

## 3. Deploy record

No hard-blocked maintenance-window ops were needed (no `bench migrate`/`build`):
the SPA is served via symlink `sites/assets/fatehhr → app/…/public`, so a git pull +
worker reload is sufficient.

1. Pushed `cooperheat@fe4e69c` (main), `fatehhr@a832ad9` (feature/cooperheat-approvals).
2. On bench: `git pull --ff-only upstream <branch>` for both (remote is **`upstream`**, not origin; repos are public → anonymous fetch).
3. `supervisorctl signal QUIT` on web / long-worker / short-worker / **schedule**
   (business-hours-safe restart; reloads the new Python).
4. Rebuilt + committed the cooperheat PWA (`fatehhr/public/spa`) with red theme + name.

### Post-deploy verification
- `GET /` 200, `/login` 200, `/assets/fatehhr/spa/index.html` 200,
  `POST …/approvals.summary` **403** (auth-gated, healthy — not a 500).
- Live SPA serves `<title>Cooperheat</title>` + `theme-color #CE0A0D`; manifest
  `name: Cooperheat`, `theme_color #CE0A0D`.
- New scheduler code confirmed live on bench; workflow transitions present
  (`allowed = All`); server future-guard confirmed rejecting future punches.

## 4. Open items / follow-ups

1. **274 records have NULL `window_expires_at`** (272 Pending L1 + 2 Pending L2) — their
   level's window hours are **unconfigured** (0 on both the Department Approval Matrix
   and the linked Project). The scheduler **correctly skips** these (no defined window =
   no lapse; treating NULL as "lapsed" would wrongly auto-approve them past all
   approval). **Action:** either set `approval_window_hours` on the Department Approval
   Matrix / the per-level Project windows so they auto-escalate, or clear them via
   manual approval. This is a **data/config gap, not a code bug**.
2. **Backlog drain** — 56 records had genuinely-expired windows on deploy. The manual
   one-shot drain was deferred (control SSH was intermittently timing out on long
   nested calls); the **hourly scheduler runs the identical call** and will drain them
   (≤200/run). Watch the first tick's approver-notification volume.
3. **APK build — handed to the user** (see §5). The signed release needs the keystore
   password (`FATEHHR_KEYSTORE_PW`/`FATEHHR_KEY_PW`), which is the user's secret; the
   automation shell also lacked a JDK.

## 5. Building the Cooperheat APK

Everything is prepped (brand, red, logo, `CUSTOMER_APPROVALS_ENABLED=true`). From a
shell with the Android toolchain (JDK 17 + SDK) and the keystore passwords:

```bash
export FATEHHR_KEYSTORE_PW=...   # your release keystore password
export FATEHHR_KEY_PW=...        # your key password
bash scripts/build-customer.sh cooperheat
```

Output: `dist/fatehhr-cooperheat-<version>.apk` (the script bumps the version + code,
builds the native web target, regenerates the Cooperheat icon/splash from the logo,
`cap copy`, then `assembleRelease`). App label = **Cooperheat**, package
`com.enfono.fatehhr.cooperheat`, red launcher icon.
