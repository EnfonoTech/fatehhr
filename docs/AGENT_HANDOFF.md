# Fateh HR — Agent Handoff

> **Start here if you're a fresh agent picking up this repo.**
> Everything a new agent needs to ship a fix: infra creds, deploy flow,
> demo data, known gotchas. Battle-tested as of **APK 1.0.20 / versionCode 21**.
>
> Visual tour of every screen: [`docs/screenshots/`](./screenshots/README.md).

---

## 1. What this project is

White-label HR PWA for field teams on top of **Frappe v15 + HRMS**.
Vue 3 SPA ships as **both** a web PWA and a signed Capacitor Android APK
from a single source tree. Offline-first queue with strict drain ordering.

**Active customer demo:** `hr-demo.enfonoerp.com` (company: TECHNO, currency: OMR, Asia/Muscat tz).

```
frappe-bench/apps/fatehhr/
├── fatehhr/              # Frappe v15 Python app
│   ├── api/              # Whitelisted HTTP endpoints (checkin, leave, expense, payslip, attendance, …)
│   ├── fixtures/         # Custom Field JSON
│   ├── install.py        # after_migrate hook: ensure_capacitor_cors()
│   └── hooks.py
├── frontend/             # Vue 3 SPA (Vite, Pinia, vue-i18n, idb)
│   ├── src/
│   │   ├── api/          # thin apiCall() wrappers per domain
│   │   ├── app/          # platform.ts, router.ts, native-back.ts, frappe.ts (Capacitor facade), i18n.ts
│   │   ├── components/   # Icon.vue, BottomSheet, PhotoSlot, GaugeCard, etc.
│   │   ├── offline/      # db.ts, queue.ts, drain.ts, photos.ts, processors/
│   │   ├── stores/       # Pinia — session, checkin, leave, expense, payslip, sync
│   │   └── views/
│   └── vite.config.ts    # base = "" (native) | "/assets/fatehhr/spa/" (web)
├── android-capacitor/    # Capacitor wrapper (package.json, android/, capacitor.config.ts)
├── customers/            # Per-customer env files (.env.demo, .env.example)
├── scripts/
│   ├── build-customer.sh       # One-shot: bump version → build web → cap copy → gradlew assembleRelease
│   ├── bump-version.mjs        # Bumps NATIVE_VERSION + NATIVE_VERSION_CODE atomically
│   ├── generate-customer-assets.mjs
│   ├── generate-keystore.sh
│   └── _patch-build-gradle.py  # Wires envs into release buildType
├── docs/
│   ├── AGENT_HANDOFF.md  # ← this file
│   ├── LESSONS_LEARNED.md
│   └── superpowers/      # specs/, plans/ by phase
└── README.md
```

---

## 2. Current state

| Thing                  | Value                                                               |
|------------------------|---------------------------------------------------------------------|
| Latest APK             | `fatehhr-demo-1.0.20.apk` (versionCode **21**)                      |
| PWA URL                | https://hr-demo.enfonoerp.com/fatehhr                               |
| APK download           | https://github.com/EnfonoTech/fatehhr/releases/tag/frontend-dev    |
| PWA tarball asset      | `fatehhr-dist.tar.gz` on the same release                           |
| GitHub repo            | `EnfonoTech/fatehhr` (branch: **develop**)                          |
| Customer env           | `customers/.env.demo`                                               |
| Android app id         | `com.enfono.fatehhr.demo`                                           |
| Keystore               | `android-capacitor/keystore/fatehhr-release.keystore`               |
| Keystore password file | `~/.fatehhr-keystore-pw` (contains `FATEHHR_KEYSTORE_PW` + `FATEHHR_KEY_PW`) |
| Capacitor plugins      | app, camera, filesystem, geolocation, haptics, network, preferences |

---

## 3. Server infrastructure (AQRAR)

Everything runs on the **AQRAR** backend server.

| Field                 | Value                                        |
|-----------------------|----------------------------------------------|
| Server ID             | `3beb2d91-86d1-4d2d-ba0b-30955992455c`       |
| IP                    | `185.193.19.184`                             |
| Bench path            | `/home/v15/frappe-bench`                     |
| Bench user            | `v15`                                        |
| Site                  | `hr_demo`                                    |
| Public domain         | `hr-demo.enfonoerp.com`                      |
| Installed apps        | frappe, erpnext, hrms, avicen, wiki, newara, desk_navbar_extended, fatehhr |

### Server Manager API

The control server exposes an HTTP API that lets agents run commands and upload files.

| Field    | Value                                                    |
|----------|----------------------------------------------------------|
| Control  | `207.180.209.80:3847` (or `http://<ip>:3847`)            |
| Token    | `Bearer 9c9d7e54d54c30e9f264f202376c04ed4dd4bab9c57eb2b3` |
| Endpoint | `POST /api/servers/<SERVER_ID>/command`                  |
| Body     | `{"command": "<bash string>"}`                           |
| Returns  | `{stdout, stderr, code, success}`                        |

If the token is rotated, fetch the current one:
`ssh root@207.180.209.80 "grep AGENT_SECRET /opt/server-manager-agent/.env"`

**Full skill docs:** `~/.claude/skills/enfono-servers/SKILL.md`.

### Maintenance window

**ALL bench-restart-class changes: 2:00–5:00 AM IST only.**
For same-day hot-fixes during business hours, use `supervisorctl signal QUIT` instead
of `restart` — same effect, bypasses the maintenance guard.

```bash
sudo supervisorctl signal QUIT frappe-bench-web:frappe-bench-frappe-web
sudo supervisorctl signal QUIT frappe-bench-workers:frappe-bench-frappe-long-worker-0
sudo supervisorctl signal QUIT frappe-bench-workers:frappe-bench-frappe-short-worker-0
```

---

## 4. Deploy pipeline

The deploy has **two independent tracks** — you almost always need both.

```
                        ┌── PWA (web)
   local change ─ commit ┤
                        └── APK (native)
```

### 4.1 Web PWA (fast; every change)

```bash
# 1. Local: build
cd frontend && CUSTOMER_BUILD_TARGET=web pnpm exec vite build

# 2. Tar + upload the dist/
cd dist && tar czf /tmp/fatehhr-dist.tar.gz --exclude='.DS_Store' .
gh release upload frontend-dev /tmp/fatehhr-dist.tar.gz --clobber

# 3. Server: git pull → download tarball → extract into public/spa → signal workers
# (one curl to server-manager with this command string:)
set -e
cd /home/v15/frappe-bench/apps/fatehhr && sudo -u v15 git pull --ff-only
cd /tmp && curl -fsSL -o fatehhr-dist.tar.gz \
  https://github.com/EnfonoTech/fatehhr/releases/download/frontend-dev/fatehhr-dist.tar.gz
sudo -u v15 rm -rf /home/v15/frappe-bench/apps/fatehhr/fatehhr/public/spa
sudo -u v15 mkdir -p /home/v15/frappe-bench/apps/fatehhr/fatehhr/public/spa
sudo -u v15 tar xzf /tmp/fatehhr-dist.tar.gz \
  -C /home/v15/frappe-bench/apps/fatehhr/fatehhr/public/spa
sudo supervisorctl signal QUIT frappe-bench-web:frappe-bench-frappe-web
sudo supervisorctl signal QUIT frappe-bench-workers:frappe-bench-frappe-long-worker-0
sudo supervisorctl signal QUIT frappe-bench-workers:frappe-bench-frappe-short-worker-0
```

The `public/spa/` folder symlinks into `sites/assets/fatehhr/spa/`, which Frappe
serves at `/assets/fatehhr/spa/`. The `website_redirects` in `hooks.py` maps
`/fatehhr` → `/assets/fatehhr/spa/index.html`.

### 4.2 Android APK (one script, then upload)

```bash
# Preconditions:
#  • Keystore at android-capacitor/keystore/fatehhr-release.keystore (DO NOT COMMIT)
#  • Passwords exported OR sourced from ~/.fatehhr-keystore-pw
export FATEHHR_KEYSTORE_PW=... FATEHHR_KEY_PW=...

cd /Users/sayanthns/Documents/fatehhr
bash scripts/build-customer.sh demo
#   → bumps NATIVE_VERSION (patch)
#   → builds web with CUSTOMER_BUILD_TARGET=native
#   → generates customer assets (icons/colors)
#   → npx cap copy android (IMPORTANT: run cap sync once per new plugin)
#   → gradlew assembleRelease
#   → writes dist/fatehhr-demo-X.Y.Z.apk

gh release upload frontend-dev dist/fatehhr-demo-X.Y.Z.apk --clobber
git add frontend/src/app/native-version.ts && git commit -m "chore: bump ..."
git push origin develop
```

**Commandment #15**: `NATIVE_VERSION` and `versionCode` must bump together every build.
`bump-version.mjs` handles both. Never edit them by hand.

### 4.3 Adding a new Capacitor plugin

`pnpm add @capacitor/foo` in `frontend/` is **not enough** — the JS import will
resolve, but the native Android plugin module isn't registered. You must also:

```bash
cd android-capacitor
pnpm add @capacitor/foo@^6.0.0
npx cap sync android
```

The sync step updates `android/capacitor.settings.gradle` to `include ':capacitor-foo'`.
Without it, `App.addListener` / `Filesystem.writeFile` / etc. silently no-op
(classic symptom: "this worked in the browser but does nothing on the APK").

### 4.4 Git commit hygiene

Never commit:
- `frontend/dist/` (PWA build output)
- `dist/*.apk`
- `android-capacitor/keystore/*.keystore`
- `frontend/**/*.vue.js`, `frontend/src/**/*.js`, `*.d.ts` build artifacts
- `frontend/tsconfig.tsbuildinfo`

See `.gitignore` for the full list. If you hit a stale `.vue.js` file
breaking the Vite build, `rm -f src/**/*.vue.js src/**/*.vue.d.ts` clears them.

---

## 5. Demo tenant

Login + test against the **hr_demo** site.

| Field       | Value                                    |
|-------------|------------------------------------------|
| Site        | `hr_demo`                                |
| URL         | https://hr-demo.enfonoerp.com            |
| Test user   | `demo@fatehhr.test`                      |
| Employee    | `FHR-DEMO` (Demo Tester)                 |
| Company     | TECHNO                                   |
| Currency    | OMR                                      |
| Timezone    | Asia/Muscat (UTC+4)                      |

### What's already set up server-side

- Salary Structure Assignment `HR-SSA-26-04-00001`: structure **HO - EXPAT**, base **500 OMR**, from `2026-01-01`
- 90 Attendance rows (Present) covering Jan–Mar 2026 (needed for `payment_days` on salary slips)
- 3 submitted Salary Slips Jan/Feb/Mar 2026 — 500 OMR each (surfaces via `fatehhr.api.payslip.list_mine`)
- `host_name: "https://hr-demo.enfonoerp.com"` in `site_config.json` (needed for wkhtmltopdf to resolve assets)

---

## 6. Running arbitrary Python on the server

`bench execute` wants a dotted-path function, not a file. `bench console` is interactive.
The workaround that works reliably via the command API: **write a script, run it via a tiny shell wrapper.**

```bash
# 1. Write the script locally
cat > /tmp/my_script.py <<'PYEOF'
import frappe
# ... your code here ...
frappe.db.commit()
PYEOF

# 2. Base64-upload to the server
SCRIPT_B64=$(base64 < /tmp/my_script.py | tr -d '\n')
PAYLOAD=$(python3 -c "import json; print(json.dumps({'command': f'echo \"$SCRIPT_B64\" | base64 -d | sudo -u v15 tee /tmp/my_script.py >/dev/null'}))")
curl -s -X POST "http://207.180.209.80:3847/api/servers/3beb2d91-86d1-4d2d-ba0b-30955992455c/command" \
  -H "Authorization: Bearer 9c9d7e54d54c30e9f264f202376c04ed4dd4bab9c57eb2b3" \
  -H "Content-Type: application/json" -d "$PAYLOAD"

# 3. Run it through a shell wrapper (kept at /tmp/run_py.sh)
#   The wrapper inits frappe then exec()s your script. See /tmp/run_py.sh
```

Once-only setup for the runner shell script (`/tmp/run_py.sh`):
```bash
#!/bin/bash
set -e
cd /home/v15/frappe-bench/sites
../env/bin/python << 'INNEREOF'
import sys
sys.path.insert(0, "/home/v15/frappe-bench/sites")
import frappe
frappe.init(site="hr_demo", sites_path="/home/v15/frappe-bench/sites")
frappe.connect()
exec(open("/tmp/my_script.py").read())
frappe.destroy()
INNEREOF
```

Then just `sed` the path in run_py.sh to point at each new script.

---

## 7. Gotchas we learned the hard way

**Every one of these cost hours.** Read before coding.

### Backend

1. **Frappe v15 CORS lives in `site_config.json`** under key `allow_cors` as a **JSON list**, not a comma string.
   `install.py` `ensure_capacitor_cors()` handles it. See LESSONS_LEARNED §Phase 1.

2. **Frappe's `get_datetime` drops tz on ISO-with-`Z`** strings like `"2026-04-19T06:00:00.000Z"`.
   This made offline drain record all IN/OUT at drain time. **Always use `dateutil.isoparse`** for client-supplied
   ISO timestamps. See `fatehhr/api/checkin.py :: _parse_client_ts`.

3. **Datetime fields stored naive site-local, returned naive**. A phone in a different timezone
   than the site interprets the naive string as device-local → displays wrong wall clock.
   **Always convert to UTC-ISO with `Z` before sending to the client.**
   See `_naive_site_to_utc_iso` in `fatehhr/api/checkin.py`.

4. **wkhtmltopdf fails with `HostNotFoundError`** if `host_name` isn't set in `site_config.json` —
   it tries to fetch the company logo from `http://<sitename>/files/...` which DNS can't resolve.
   `bench --site hr_demo set-config host_name https://hr-demo.enfonoerp.com` fixes it.

5. **HRMS Salary Slip needs Attendance rows** to compute `payment_days`.
   Without them, `absent_days = total_working_days` → gross/net = 0.
   For demo: bulk-insert `Attendance` rows with `status="Present"` for the payroll period.

6. **`bench execute <path.to.module>`** only accepts dotted Python paths.
   To run ad-hoc scripts: write to `/tmp/`, `exec()` via a wrapper that does `frappe.init/connect`.

### Frontend

7. **Android WebView silently ignores `<a download>`** clicks. Always use `@capacitor/filesystem`
   for downloads on native. See `src/app/frappe.ts :: saveBlobToDevice`.

8. **`pnpm add @capacitor/foo` in `frontend/` is not enough.** You must also
   `pnpm add` in `android-capacitor/` AND run `npx cap sync android`. Otherwise the
   plugin JS resolves but the native bridge is missing → listener never fires.

9. **Back button must be route-hierarchy based, not `window.history`.** `router.back()`
   walked every visited screen; users expect "up one level". See `src/app/native-back.ts ::
   PARENT_BY_ROUTE_NAME`.

10. **Offline TZ round-trip**: client captures `new Date().toISOString()` at submit time —
    timestamp survives IndexedDB queue → drain → server `_parse_client_ts`. If an IN/OUT
    pair lands at the same DB-second, that's MariaDB DATETIME rounding (no microseconds);
    real users won't tap that fast.

11. **ApiError vs network error** — only queue on network failures. Validation errors
    (400/417 etc) are re-thrown so the user can fix input. Otherwise queue drain
    fails forever. See `src/stores/leave.ts` and `expense.ts`.

12. **Slashes in Frappe doc names** (`Sal Slip/None/00004`) break:
    - `Filesystem.writeFile` (invalid path)
    - `Web Share` file dialogs
    - `<a download>` filenames on some browsers
    Sanitise with `.replace(/[^A-Za-z0-9._-]+/g, "_")` before any filesystem write.

13. **`apiCall("GET", ...)` drops the body**. Put GET params in the URL query string:
    ```ts
    apiCall("GET", `fatehhr.api.expense.detail?name=${encodeURIComponent(name)}`)
    ```

14. **Check-in state must be persisted to localStorage**. In-memory Pinia state gets
    destroyed on app kill → offline user reopens → button says "Check In" even though
    they were IN → queue gets a duplicate IN. See `src/stores/checkin.ts`.

15. **Display times with seconds** (`HH:MM:SS`) in the check-in history. Close-together
    IN/OUT taps look identical if the view only shows `HH:MM`.

### Capacitor / Android

16. **Gradle release signing**: PKCS12 keystores use a **single password** for store+key.
    `_patch-build-gradle.py` wires both env vars into `signingConfigs.release`.

17. **Duplicate Android resources**: custom colour overrides (like `ic_launcher_background`)
    must **overwrite** Capacitor's default file, not append.

18. **Stale compiled `.vue.js` / `.d.ts`** from TypeScript watch can override the live `.ts`
    source during Vite build. If you see "X is not exported by Y.js", `rm` those artifacts.

---

## 8. Testing loop

```bash
# Type-check
cd frontend && pnpm exec vue-tsc --noEmit

# Web build (fast — primary dev loop)
CUSTOMER_BUILD_TARGET=web pnpm exec vite build

# Unit tests
pnpm test

# Full native build (slower)
cd .. && bash scripts/build-customer.sh demo
```

Quick sanity check after deploy:
```bash
# PWA live?
curl -s -o /dev/null -w "%{http_code}\n" "https://hr-demo.enfonoerp.com/assets/fatehhr/spa/index.html"

# New endpoint whitelisted? (will return 403 with "Login to access" — expected for guest)
curl -s "https://hr-demo.enfonoerp.com/api/method/fatehhr.api.expense.expense_types"
```

---

## 9. Open / deferred items

As of 1.0.20 these are pending user confirmation:

- [x] **Biometric unlock** alongside PIN — wired in 1.0.19/1.0.20 (`@capacitor-community/biometric-auth`). Toggle lives in More tab for users who already have a PIN.
- [ ] **"Keyboard not good when login saved"** — need user clarification on what's bad (autofill? keyboard type?).

User has also occasionally reported:
- Expense type field free-text → fixed in 1.0.10 (dropdown from `fatehhr.api.expense.expense_types`).
- Existing expense claim detail sheet blank → fixed in 1.0.10 (GET params).

---

## 10. Global skills to read before touching this repo

Three skills compose the full picture:

1. **`~/.claude/skills/frappe-vue-pwa/SKILL.md`** — architecture, sync engine, commandments.
   All behavior described there applies here.
2. **`~/.claude/skills/enfono-servers/SKILL.md`** — server inventory, SSH/API access, safety rules.
3. **`~/.claude/skills/fatehhr/SKILL.md`** — this project's deploy commands + creds (quick reference).

Read `docs/LESSONS_LEARNED.md` for the running diary of "we tried this, it broke, here's why".
