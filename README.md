# Fateh HR

Field-team HR PWA on top of Frappe HRMS. Vue 3 SPA that ships as a
web PWA + a Capacitor Android APK from a single codebase. Offline-first
with a hardened sync engine.

## Repo layout

- `fatehhr/` — Frappe v15 app (Python)
- `frontend/` — Vue 3 SPA (Vite + Pinia + vue-i18n + idb)
- `docs/` — specs, implementation plans, lessons learned
- `android-capacitor/` — Capacitor wrapper (Phase 5, not yet present)

## Phase 1 status (2026-04-18)

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

### Not here yet

All of Phase 2+ (offline engine, check-in, calendar, leave, expense,
tasks, payslip, announcements, notifications, profile edit, full
dashboard, Capacitor wrap). See `docs/superpowers/plans/`.

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

### Test flow

- [ ] Log in with `demo@fatehhr.test` / `demo@123` → redirected to PIN
      setup (4–6 digits). Pick `1234`.
- [ ] Dashboard loads with "Good <morning/afternoon/evening>, Demo Tester".
- [ ] Reload page → redirected to PIN entry → enter `1234` → back to
      dashboard.
- [ ] Wrong PIN 5× → "PIN locked" message → redirected to login.
- [ ] Toggle to Arabic via the link on login → labels flip + `dir="rtl"`.
- [ ] DevTools → Application → Manifest → `manifest.json` present with
      correct brand + theme color.

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
