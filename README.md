# Fateh HR

Field-team HR PWA on top of Frappe HRMS. Vue 3 SPA that ships as a
web PWA + a Capacitor Android APK from a single codebase. Offline-first
with a hardened sync engine.

## Repo layout

- `fatehhr/` — Frappe v15 app (Python)
- `frontend/` — Vue 3 SPA (Vite + Pinia + vue-i18n + idb)
- `android-capacitor/` — Capacitor wrapper (native Android build)
- `customers/` — per-customer env files (`.env.demo`, …)
- `scripts/` — version bump, build-customer, keystore, asset gen
- `docs/` — specs, plans, lessons learned, **agent handoff**

## Current state (2026-04-19)

✅ **All 5 phases shipped.** Latest APK: `fatehhr-demo-1.0.14.apk` (versionCode 15).

- Foundation, Offline engine, Attendance/Leave/Expense, Tasks/Payslip/Announcements/Profile, Capacitor APK — all done.
- 56/56 E2E gates passing.
- PWA live at https://hr-demo.enfonoerp.com/fatehhr
- APK on [`frontend-dev` GitHub release](https://github.com/EnfonoTech/fatehhr/releases/tag/frontend-dev)

### 👉 Handing off to another agent?

Read **[`docs/AGENT_HANDOFF.md`](docs/AGENT_HANDOFF.md)** first. It has the full deploy
pipeline, server creds, demo data, APK signing, and the gotcha list. Then skim
**[`docs/LESSONS_LEARNED.md`](docs/LESSONS_LEARNED.md)** for the running diary of
"we tried this, it broke, here's why."

## Phase 1 + 2 status (2026-04-18)

✅ Backend
- `fatehhr` Frappe app installed on the `hr_demo` site at AQRAR
  (**https://hr-demo.enfonoerp.com**) alongside `erpnext` + `hrms`.
- Custom fields applied (Employee PIN hash + api_secret, Employee Checkin
  GPS + task + selfie + geofence status, Task geofence coords + radius).
- Whitelisted API endpoints:
  - `fatehhr.api.auth.login` — email+password → stable api_key/secret
  - `fatehhr.api.auth.set_pin` / `verify_pin` / `change_pin` (w/ lockout)
  - `fatehhr.api.me.profile` / `update_profile` (allowlisted fields)
  - `fatehhr.api.util.version_compat` / `reverse_geocode`
- `ensure_capacitor_cors()` runs on every `bench migrate` and writes
  the Capacitor origins to `site_config.json`.

✅ Frontend
- Vite + Vue 3 + Pinia + vue-router + vue-i18n scaffold builds clean.
- Theme plugin reads `CUSTOMER_*` env vars → CSS accent vars +
  `manifest.json` + `theme-color` meta.
- Login / PIN / Dashboard views with EN + AR (RTL) locales.
- Session store with api_secret SecureStorage + offline PIN hash cache
  + 15-minute inactivity re-prompt.
- 401 silent-retry in the API client.
- Version-compat probe on boot.

✅ Phase 2 — Offline engine + Check-in
- `idb` bootstrap with 4 stores (queue, photos, cache, meta).
- `offline/queue.ts` — `saveItem(kind, logicalKey, payload, effectiveImages)`
  with `(kind, logicalKey)` dedup; insertion-order preservation.
- `offline/drain.ts` — drain engine; narrow-regex `isUnrecoverable`;
  task-timer `start`→`stop` prerequisite gating.
- `offline/photos.ts` — the **ONE uploader** (skill §4.3): memoises
  `serverUrl` after first upload so drain-time retries never re-upload.
- `offline/orphans.ts` — marks queue rows whose photo blobs are
  missing; **never deletes** user work.
- `SyncBar` (4 states) + `PhotoSlot` (auto-clears when blob missing)
  + `BottomNav` + `ListRow` + `MapPreview` (Leaflet/OSM).
- `fatehhr.api.checkin.create` + `list_mine` endpoints:
  verified end-to-end with geofence classification.
- Check-in view with GPS + reverse-geocode + geofence chip +
  selfie-mode-aware `PhotoSlot` + online→queue fallback.
- Check-in history view.

### Not here yet

Phase 3 (Attendance calendar + Leave + Expense), Phase 4 (Tasks timer
+ Payslip + Announcements + Notifications + Profile + full Dashboard),
Phase 5 (Capacitor wrap + APK + per-customer build + rollout).
Plans for each at `docs/superpowers/plans/`.

## Testing Phase 1 locally

1. Clone and install deps:

   ```bash
   git clone https://github.com/EnfonoTech/fatehhr.git
   cd fatehhr/frontend
   pnpm install
   ```

2. Copy env template and run dev server:

   ```bash
   cp .env.example .env
   pnpm dev
   ```

   Vite proxies `/api`, `/assets`, `/files` → `https://hr-demo.enfonoerp.com`.
   The public domain has real SSL, so no Host-header gymnastics needed.

3. Open http://localhost:5173/fatehhr/

### Test accounts

- Admin: `Administrator` / `admin@123` — no linked Employee, so first
  login will show a bare dashboard. Fine for smoke-testing the auth
  flow but can't exercise the profile endpoint.
- Demo employee: `demo@fatehhr.test` / `demo@123` with a linked
  `Demo Tester` Employee record. Use this to exercise PIN set +
  profile display. (Seeded automatically — see Task 14 of the Phase 1
  plan.)

### Test flow — Phase 1 auth

- [ ] Log in with `demo@fatehhr.test` / `demo@123` → redirected to PIN
      setup (4–6 digits). Pick `1234`.
- [ ] Dashboard loads with "Good <morning/afternoon/evening>, Demo Tester".
- [ ] Reload page → redirected to PIN entry → enter `1234` → back to
      dashboard.
- [ ] Wrong PIN 5× → "PIN locked" message → redirected to login.
- [ ] Toggle to Arabic via the link on login → labels flip + `dir="rtl"`.
- [ ] DevTools → Application → Manifest → `manifest.json` present with
      correct brand + theme color.

### Test flow — Phase 2 check-in

Manually navigate to http://localhost:5173/fatehhr/checkin (BottomNav
→ Attendance tab) after logging in.

- [ ] Online check-in: browser asks for GPS; map preview loads centered
      on your coords; "Check In" writes to the server. Verify via
      Desk: http://94.136.186.151/app/employee-checkin (open with Host
      header tool or just log in as Administrator) — row exists with
      timestamp + GPS coords.
- [ ] Geofence chip: amber "Outside task radius" is the default when no
      task is picked (task-picker UI lands in Phase 4; for Phase 2 you
      can test the endpoint directly — see curl examples below).
- [ ] Offline check-in: DevTools → Network → Throttle = Offline; tap
      "Check In" → SyncBar flips to "1 change pending" → set online →
      SyncBar flips to "Syncing" → "Synced now". Verify row appears on
      the server.
- [ ] Selfie mode: `CUSTOMER_SELFIE_MODE=every` in `.env` → PhotoSlot
      required before Check In submits.

### curl sanity checks

```bash
# Login to get api_key:api_secret
curl -X POST https://hr-demo.enfonoerp.com/api/method/fatehhr.api.auth.login \
  -H "Content-Type: application/json" \
  -d '{"usr":"demo@fatehhr.test","pwd":"demo@123"}'

# With the returned token:
AUTH="token <api_key>:<api_secret>"

# Profile
curl -H "Authorization: $AUTH" \
  https://hr-demo.enfonoerp.com/api/method/fatehhr.api.me.profile

# List my check-ins
curl -X POST -H "Authorization: $AUTH" \
  -H "Content-Type: application/json" -d '{}' \
  https://hr-demo.enfonoerp.com/api/method/fatehhr.api.checkin.list_mine

# Check in with GPS
curl -X POST -H "Authorization: $AUTH" \
  -H "Content-Type: application/json" \
  -d '{"log_type":"IN","latitude":24.7136,"longitude":46.6753,"task":null,"timestamp":null}' \
  https://hr-demo.enfonoerp.com/api/method/fatehhr.api.checkin.create
```

## Server quick reference

- Server: **AQRAR** (ID `3beb2d91-86d1-4d2d-ba0b-30955992455c`) at `185.193.19.184`
- Site: `hr_demo`
- Public domain: **https://hr-demo.enfonoerp.com**
- Admin Desk: https://hr-demo.enfonoerp.com/app
- Bench path: `/home/v15/frappe-bench` (user `v15`)
- Deploys from: `develop` branch of this repo
- Control server: `207.180.209.80` (Server Manager API on port 3847)

All bench ops go through the Server Manager API — see the
`enfono-servers` skill.

## Architecture reference

All architectural rules come from the `frappe-vue-pwa` skill and are
summarised in [`docs/LESSONS_LEARNED.md`](docs/LESSONS_LEARNED.md).

## License

MIT
