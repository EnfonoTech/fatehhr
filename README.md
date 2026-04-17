# Fateh HR

Field-team HR PWA on top of Frappe HRMS. Vue 3 SPA that ships as a
web PWA + a Capacitor Android APK from a single codebase. Offline-first
with a hardened sync engine.

## Repo layout

- `fatehhr/` — Frappe v15 app (Python)
- `frontend/` — Vue 3 SPA (Vite + Pinia + vue-i18n + idb)
- `docs/` — specs, implementation plans, lessons learned
- `android-capacitor/` — Capacitor wrapper (Phase 5, not yet present)

## Phase 1 + 2 status (2026-04-18)

✅ Backend
- `fatehhr` Frappe app installed on a fresh `fatehhr_dev` site at GS DEV
  (`94.136.186.151`) with `erpnext` + `hrms`.
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

   Vite proxies `/api`, `/assets`, `/files` → `http://94.136.186.151`
   with `Host: fatehhr_dev`, so the SPA hits the Frappe backend on
   GS DEV directly.

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

### curl sanity checks (uses the seeded demo token)

```bash
# After logging in once to get api_key:api_secret pair
AUTH="token <api_key>:<api_secret>"

# List my check-ins
curl -H "Host: fatehhr_dev" -H "Authorization: $AUTH" \
  http://94.136.186.151/api/method/fatehhr.api.checkin.list_mine

# Check in with task + GPS (expect custom_geofence_status: "inside"
# because task TASK-2026-00001 has radius 100m at these coords)
curl -X POST -H "Host: fatehhr_dev" -H "Authorization: $AUTH" \
  -H "Content-Type: application/json" \
  -d '{"log_type":"IN","latitude":24.7136,"longitude":46.6753,"task":"TASK-2026-00001","timestamp":null}' \
  http://94.136.186.151/api/method/fatehhr.api.checkin.create
```

## Server quick reference

- Server: GS DEV (ID `8d69b825-6148-4da6-817b-d079a37f422d`) at
  `94.136.186.151`
- Site: `fatehhr_dev`
- Bench path: `/home/v15/frappe-bench` (user `v15`)
- DB root password: `abc@123` (bench `common_site_config.json`)
- Admin password: `admin@123`
- Deploys from: `develop` branch of this repo
- Control server: `207.180.209.80` (Server Manager API on port 3847)

All bench ops go through the Server Manager API — see the
`enfono-servers` skill.

## Architecture reference

All architectural rules come from the `frappe-vue-pwa` skill and are
summarised in [`docs/LESSONS_LEARNED.md`](docs/LESSONS_LEARNED.md).

## License

MIT
