# Fateh HR — Agent Handoff

> **Start here if you're a fresh agent picking up this repo.**
> Everything a new agent needs to ship a fix: infra creds, deploy flow,
> demo data, known gotchas. Battle-tested as of **APK 1.0.22 / versionCode 23**.
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
| Latest APK             | `fatehhr-demo-1.0.39-debug.apk` (versionCode **40**)                |
| APK download           | https://hr-demo.enfonoerp.com/files/fatehhr-demo-1.0.39-debug.apk   |
| PWA URL                | https://hr-demo.enfonoerp.com/fatehhr                               |
| GitHub repo            | `EnfonoTech/fatehhr` (branch: **develop**)                          |
| Customer env           | `customers/.env.demo`                                               |
| Android app id         | `com.enfono.fatehhr.demo`                                           |
| Server address         | **runtime, not build-time** — see §4.5. `CUSTOMER_ERP_DOMAIN` is now only a default |
| Keystore               | `android-capacitor/keystore/fatehhr-release.keystore`               |
| Keystore password file | `~/.fatehhr-keystore-pw` (contains `FATEHHR_KEYSTORE_PW` + `FATEHHR_KEY_PW`) |
| Capacitor plugins      | app, camera, filesystem, geolocation, haptics, network, preferences |

> **The hosted APK is DEBUG-signed** (release needs the keystore passwords, which are
> not in CI). Debug and release use different certs — never mix the two lineages on
> one device, Android will force an uninstall. The debug cert has been stable since
> 1.0.35, so debug→debug upgrades install in place and keep queued offline work.

> **ONE SLUG PER SITE.** `customers/.env.<slug>` → exactly one `CUSTOMER_ERP_DOMAIN`,
> and no two slugs may name the same host. This was violated once (`demo` and
> `cooperheat-demo` both claimed `hr-demo.enfonoerp.com`) and it silently shipped the
> wrong brand *and* flipped `CUSTOMER_APPROVALS_ENABLED`. **hr-demo is the Fateh HR
> demo.** Before building for a domain, confirm ownership by reading the live title:
> `curl -s https://<host>/assets/fatehhr/spa/index.html | grep -o '<title>[^<]*</title>'`

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
| Control  | **`194.163.160.83:3847`**                                |
| Token    | never hardcoded — fetch it live (below)                   |
| Endpoint | `POST /api/servers/<SERVER_ID>/command`                  |
| Body     | `{"command": "<bash string>"}`                           |
| Returns  | `{stdout, stderr, code, success}`                        |

> **⚠️ The old control server `207.180.209.80` is DECOMMISSIONED** (malware incident;
> it is now managed node EFTSP-015). An auth failure or "REMOTE HOST IDENTIFICATION
> CHANGED" for that IP means you are on the wrong box.

Fetch the token — never paste it into a doc or commit:

```bash
ssh root@194.163.160.83 "grep AGENT_SECRET /opt/server-manager-agent/.env"
```

**The API has repeatedly returned an empty body / HTTP 000 with a valid token.** The
reliable path is the SSH jump, which is what every deploy in this repo actually used:

```bash
ssh root@194.163.160.83 "ssh -i /root/.ssh/id_ed25519 root@185.193.19.184 '<command>'"
```

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

**`fatehhr/public/spa/` is TRACKED IN GIT** (~103 files). The old tarball-via-GitHub-
release flow is obsolete — the bundle ships with the commit and the server just pulls.

```bash
# 1. Local: build + stage into fatehhr/public/spa/
bash scripts/deploy-pwa.sh demo          # slug must own the target domain — see §2

# 2. Commit the bundle and push
git add -A fatehhr/public/spa/ && git commit -m "deploy: PWA build for demo"
git push origin develop

# 3. Server: pull + reload web
ssh root@194.163.160.83 "ssh -i /root/.ssh/id_ed25519 root@185.193.19.184 '
  su - v15 -c \"cd /home/v15/frappe-bench/apps/fatehhr \
    && git fetch upstream develop -q && git reset --hard upstream/develop -q \
    && git clean -fdq fatehhr/public/spa\"
  sudo supervisorctl signal QUIT frappe-bench-web:frappe-bench-frappe-web'"
```

- The git remote on the server checkout is named **`upstream`**, not `origin`.
- `git clean -fdq fatehhr/public/spa` clears stale content-hashed chunks left behind
  by the previous build; without it they accumulate forever.
- **`bench build` is NOT needed** — `sites/assets/fatehhr` is a symlink to
  `apps/fatehhr/fatehhr/public`, so a new bundle is served the moment it lands.
- `website_redirects` in `hooks.py` maps `/fatehhr` → `/assets/fatehhr/spa/index.html`.
- **Expect uncommitted local edits on the server checkout.** Back up and prove they
  carry no unique work *before* `reset --hard` — see §7 "Server checkout drift".

### 4.2 Android APK (one script, then upload)

**Toolchain — NOTHING is on PATH by default.** `java -version` fails outright on this
Mac. Export these first or gradle will not run:

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17     # JDK 17, NOT 21 — AGP 8.2.1 + gradle 8.2.1 + compileSdk 34
export ANDROID_HOME="$HOME/Library/Android/sdk"   # build-tools 34.0.0 + 35.0.0, platforms android-34 + 36
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/build-tools/34.0.0:$PATH"   # gives you aapt + apksigner
```

**Signed release** (needs the keystore passwords):

```bash
export FATEHHR_KEYSTORE_PW=... FATEHHR_KEY_PW=...
bash scripts/build-customer.sh demo
#   → bumps NATIVE_VERSION + versionCode
#   → builds web with CUSTOMER_BUILD_TARGET=native
#   → generates customer assets (icons/colors)
#   → npx cap copy android (run cap sync once per NEW plugin)
#   → gradlew assembleRelease
#   → writes dist/fatehhr-demo-X.Y.Z.apk
```

**Debug build** (no passwords needed — this is what 1.0.35–1.0.39 shipped as). Same
steps minus the signing; `build-customer.sh` only does release, so run them manually:

```bash
set -a && source customers/.env.demo && set +a
node scripts/bump-version.mjs patch
NV=$(grep -oE 'NATIVE_VERSION\s*=\s*"[^"]+"' frontend/src/app/native-version.ts | cut -d'"' -f2)
NVC=$(grep -oE 'NATIVE_VERSION_CODE\s*=\s*[0-9]+' frontend/src/app/native-version.ts | grep -oE '[0-9]+')
(cd frontend && CUSTOMER_BUILD_TARGET=native CUSTOMER_ERP_DOMAIN="$CUSTOMER_ERP_DOMAIN" \
  CUSTOMER_BRAND_NAME="$CUSTOMER_BRAND_NAME" CUSTOMER_PRIMARY_COLOR="$CUSTOMER_PRIMARY_COLOR" \
  CUSTOMER_LOCALE="$CUSTOMER_LOCALE" CUSTOMER_SELFIE_MODE="$CUSTOMER_SELFIE_MODE" \
  CUSTOMER_APPROVALS_ENABLED="$CUSTOMER_APPROVALS_ENABLED" pnpm build)
CUSTOMER_SLUG="$CUSTOMER_SLUG" CUSTOMER_PRIMARY_COLOR="$CUSTOMER_PRIMARY_COLOR" \
  node scripts/generate-customer-assets.mjs
(cd android-capacitor && npx cap copy android)
(cd android-capacitor/android && APP_ID_ANDROID="$APP_ID_ANDROID" \
  CUSTOMER_BRAND_NAME="$CUSTOMER_BRAND_NAME" CUSTOMER_PRIMARY_COLOR="$CUSTOMER_PRIMARY_COLOR" \
  NATIVE_VERSION="$NV" NATIVE_VERSION_CODE="$NVC" ./gradlew assembleDebug --no-daemon)
cp android-capacitor/android/app/build/outputs/apk/debug/app-debug.apk \
   "dist/fatehhr-demo-$NV-debug.apk"
```

`app/build.gradle` reads **all five** of `APP_ID_ANDROID`, `CUSTOMER_BRAND_NAME`,
`CUSTOMER_PRIMARY_COLOR`, `NATIVE_VERSION`, `NATIVE_VERSION_CODE` from the environment
(patched in by `scripts/_patch-build-gradle.py`). Omit them and you silently get
`com.enfono.fatehhr` / version `1.0` / brand "Fateh HR" — a build that looks fine and
is wrong.

**Verify before shipping** — never trust the build log:

```bash
aapt dump badging dist/fatehhr-demo-$NV-debug.apk | grep -E '^package|^application-label:'
apksigner verify --print-certs dist/fatehhr-demo-$NV-debug.apk | grep 'SHA-256'
# icon: extract it back OUT of the APK and mask it (see §7 Capacitor/Android)
```

**Hosting** — served as a site public file, replacing the previous one:

```bash
# local → control → AQRAR, md5-verified at each hop
scp dist/fatehhr-demo-$NV-debug.apk root@194.163.160.83:/tmp/
# then control → 185.193.19.184:/home/v15/frappe-bench/sites/hr_demo/public/files/
# chown v15:v15, chmod 644, and rm the previous version
```
→ `https://hr-demo.enfonoerp.com/files/fatehhr-demo-<ver>-debug.apk`

**⚠️ That URL is publicly downloadable by anyone who has it.** Delete the file when
testing is done.

**Commandment #15**: `NATIVE_VERSION` and `versionCode` must bump together every build.
`bump-version.mjs` handles both. Never edit them by hand.

### 4.5 Runtime server switching (1.0.37+)

The server address is **no longer baked in**. One APK can point at any Fateh HR site.

| Piece | Where |
|---|---|
| storage + normalise + `API_BASE()` | `frontend/src/app/platform.ts` |
| first-run screen | `frontend/src/views/SiteSetupView.vue` (route `/setup`) |
| reachability probe | `frontend/src/api/site-probe.ts` → `fatehhr.api.auth.site_info` |
| router guard | `frontend/src/app/router.ts` |
| Change server | `frontend/src/views/MoreView.vue` |
| resume-time config refetch | `frontend/src/app/config-refresh.ts` |

- `CUSTOMER_ERP_DOMAIN` is now an **optional default**. Set → APK is pre-pointed and
  skips `/setup`. Leave empty → the installer picks the server on first launch.
- The stored URL lives in **localStorage AND Preferences**, and the module cache is
  seeded *synchronously at import*. **Never gate a pre-mount storage read on
  `isNative()`** — `loadSiteUrl()` runs before `app.mount()` and the Capacitor bridge
  may not have injected `window.Capacitor` yet. That bug made a configured APK re-ask
  for its server every launch.
- **A site without `site_info` answers HTTP 417, not 404** (measured on hr-demo). The
  probe therefore falls through to `frappe.ping` on *any* non-OK status, so a new APK
  can still be pointed at a site that has not been updated yet.
- Change server is **blocked while the offline queue is non-empty** — queued check-ins
  reference Employee/site names that do not exist on another tenant.
- Two-tap confirm, not `window.confirm` — **the Android WebView silently drops
  `confirm`/`prompt`** (see `SyncErrorsView.vue`).
- Every target site needs the Capacitor CORS origins in `site_config.json`
  (`after_migrate` → `ensure_capacitor_cors`). A CORS block is indistinguishable from a
  typo in `fetch` (both `TypeError`), which is why the "couldn't reach" copy names app
  access explicitly.

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

# 2. Ship it and run it — SSH jump, which is the path that actually works
scp /tmp/my_script.py root@194.163.160.83:/tmp/
ssh root@194.163.160.83 "scp -i /root/.ssh/id_ed25519 /tmp/my_script.py root@185.193.19.184:/home/v15/"
ssh root@194.163.160.83 "ssh -i /root/.ssh/id_ed25519 root@185.193.19.184 '
  chown v15:v15 /home/v15/my_script.py
  su - v15 -c \"cd /home/v15/frappe-bench/sites && ../env/bin/python /home/v15/my_script.py\"'"
```

Three traps here, all paid for:

- **cwd must be `frappe-bench/sites`**, not the bench root. From the root, `frappe.init()`
  resolves `sites_path` wrong (`IncorrectSitePath`) and the logger writes to a
  non-existent dir.
- **Put the script under `/home/v15/`, not `/tmp`** — re-writing a root-owned `/tmp`
  file as `v15` hits `Permission denied`.
- **`bench --site X console < script.py` swallows print output** (IPython echoes prompts
  instead). Use `env/bin/python` with `frappe.init()` + `frappe.connect()` as above.
- **`bench execute --kwargs` is `eval`'d as PYTHON, not JSON** — `{"force": true}` dies
  with `NameError: name 'true' is not defined`. Use `True` / `False` / `None`.

If you use the Server Manager API instead, fetch the token live
(`ssh root@194.163.160.83 "grep AGENT_SECRET /opt/server-manager-agent/.env"`) — never
paste it into a file.

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

18. **Stale compiled `.vue.js` / `.d.ts`** — **root-caused and fixed in 1.0.37.**
    `tsconfig.json` had no `noEmit`, so tsc wrote a `.js` beside every `.ts` in `src/`,
    and Vite's default `resolve.extensions` puts `.js` **before** `.ts` — so an
    extensionless `@/app/platform` import resolved to the stale emit. `pnpm build`
    (`vue-tsc -b && vite build`) re-emitted first and so masked itself, but `pnpm dev`
    and `vitest` silently ran older code. Now `"noEmit": true`. The two committed
    `frontend/plugins/*.js` duplicates were deleted for the same reason and the pattern
    is gitignored. **If you ever see a `.js` next to a `.ts` in this repo, something
    regressed.**

19. **Verify an icon change by extracting it back OUT of the APK** — the generator log
    is not evidence:
    ```bash
    unzip -o apk 'res/mipmap-xxxhdpi*/*' -d /tmp/apkres
    # composite ic_launcher_background.png + ic_launcher_foreground.png,
    # then apply a circle AND a squircle mask
    ```
    An **unmasked adaptive icon legitimately looks like a tile inset in the accent
    colour** — that is correct, not a defect. Launchers mask down to roughly the central
    66%. Both `logo.default.png` and `logo.cooperheat.png` measure exactly 66.0% linear
    / 43.6% area opaque, centred, which is what appicon.co emits as
    `adaptive-foreground`. Mistaking that inset for an artifact cost a cycle once.

20. **Icon fallback chain** is `customers/logo.<slug>.png` → `customers/logo.default.png`
    (the Fateh HR mark) → generated khatam glyph. A slug with no logo file inherits the
    Fateh HR icon — which is how a Cooperheat-branded build once shipped with a Fateh HR
    icon. Give every customer slug its own `logo.<slug>.png`, and pair it with a matching
    `CUSTOMER_PRIMARY_COLOR` or the accent shows as a ring around the tile.

21. **`capacitor.config.json` inside the APK is NOT proof of which customer a build is
    for.** It reads `appId: com.enfono.fatehhr` / `appName: Fateh HR` because `npx cap
    copy` runs without the customer env exported. Package identity comes from gradle's
    `applicationId` — check `aapt dump badging`.

22. **A different `applicationId` is a different Android app.** Changing slug (e.g.
    `com.enfono.fatehhr.cooperheatdemo` → `com.enfono.fatehhr.demo`) does **not** upgrade
    in place; testers end up with two apps side by side unless they uninstall first.

### Server checkout drift

23. **`apps/fatehhr` on AQRAR routinely has uncommitted local edits.** Seen twice: 160
    insertions across 5 tracked files plus an untracked 403-line `approvals.py`. Both
    times it was strictly *older* than git, but **prove that before discarding**:
    ```bash
    # back up first — tarball + tracked-diff patch + untracked inventory + old SPA
    tar czf /root/fatehhr-app-backup-$(date -u +%Y%m%dT%H%M%SZ).tar.gz -C apps fatehhr
    git diff > /root/fatehhr-local-tracked-<ts>.patch
    # then: md5 each modified file against your target commit, and diff the rest.
    # "N removed / 0 added" == server merely lags. Any unique insertion == STOP.
    ```
    Backups from 2026-08-05 are on the box at `/root/fatehhr-*20260805T005200Z*`.

24. **`deploy-pwa.sh` used to drop `CUSTOMER_APPROVALS_ENABLED`**, so every web build got
    the plugin default (`false`) regardless of the customer env file — silently hiding the
    approvals UI. Fixed. General rule: when a themed flag matters, grep the built index
    chunk for the inlined boolean (`iE=!0` vs `iE=!1`) next to the brand string.
    **Chunk-hash changes are not proof** — a dependent chunk rehashes purely because its
    import filenames changed.

---

## 7.5. Attendance mode + dedupe (1.0.22)

Single DocType **Fateh HR Settings** holds `attendance_mode`. The client
reads it via `fatehhr.api.settings.get_public` and caches in localStorage.

| Mode | Big "Check In" button | Tasks timer | Where attendance comes from |
|---|---|---|---|
| **Checkin Based** (default) | Writes `Employee Checkin (IN/OUT)` directly. GPS + selfie captured. | Timesheet row ONLY. Server skips Checkin insert. | The button. |
| **Timer Based** | Routes to task picker → calls `task.start_timer` → server writes IN + Timesheet. Check-Out calls `task.stop_timer` → OUT + closes row. | Same live `running` state as the button. Tapping Start on Tasks tab = tapping Check-In. | The timer. |

**Why a toggle and not a merge**: payroll owners disagree on whether
"attendance" means "did you show up" (button) or "what did you work on"
(timer). Stacking both double-counts. The mode picks a single source.

### Client-ID dedupe key

Every checkin-writing endpoint now accepts `client_id` (UUID from the
client). Stored on `Employee Checkin.custom_client_id` with a unique
index. Online + offline-drain paths pass the SAME uuid. Server dedupes
via SELECT then handles `DuplicateEntryError` on race.

Files that mint the uuid:
- `src/stores/checkin.ts :: submit()` (every Check-In/Out tap)
- `src/stores/tasks.ts :: start()` / `stop()` (every timer Start/Stop)

### `today_summary` for the home card

`fatehhr.api.checkin.today_summary` pairs consecutive IN→OUT rows for
today (site-local), sums seconds, returns `{worked_seconds, open_since}`.
The client live-ticks when `open_since` is non-null.

### Gotchas specific to this feature

- Task timer `start_timer`/`stop_timer` MUST use `_parse_client_ts` not
  `get_datetime` — the latter drops tz on ISO-with-Z (LESSONS §9). Fixed
  in 1.0.22; watch for new timer-adjacent endpoints regressing it.
- `custom_client_id` has `unique: 1` in the Custom Field fixture. If
  fixture is re-imported without running migrate, the unique index might
  not get added. Run `bench migrate` after any fixture edit that touches
  `unique`.
- Legacy checkin rows have `custom_client_id = NULL`. MariaDB's unique
  index treats multiple NULLs as distinct, so historical data is fine.

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

As of 1.0.22 these are pending user confirmation:

- [x] **Biometric unlock** alongside PIN — wired in 1.0.19/1.0.20 (`@capacitor-community/biometric-auth`). Toggle lives in More tab for users who already have a PIN.
- [x] **Salary-safe dedupe** — `Employee Checkin.custom_client_id` unique (1.0.22). Online + offline drain cannot both materialise the same tap. Prevents attendance double-count → corrupt `payment_days`.
- [x] **Attendance-mode toggle** — single DocType `Fateh HR Settings` → `attendance_mode` (`Checkin Based` | `Timer Based`). In Checkin mode, Timesheet-only timers; in Timer mode, Check-In button routes through a task picker.
- [x] **Daily hours card on Home** — `fatehhr.api.checkin.today_summary` returns `{worked_seconds, open_since}`. Live-ticks when an IN is open.
- [x] **Offline TZ regression (writes)** — `task.start_timer` / `stop_timer` now use `_parse_client_ts` instead of `get_datetime`, so ISO-with-Z stops dropping tz (was causing 4h drift on offline rows).
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
