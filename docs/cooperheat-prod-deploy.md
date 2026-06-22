# Cooperheat Attendance-Approval — Production Deploy Runbook

Hand-off for deploying the **mobile attendance-approval** feature to the live
Cooperheat site. The feature is on branch **`feature/cooperheat-approvals`**
(`EnfonoTech/fatehhr`, pushed). It is **flag-gated + dark** — other customers are
unaffected.

> Target site: `cooperheat.enfonoerp.com` (confirm exact site/bench).
> Tested end-to-end on `hr_demo` (AQRAR) before hand-off.

---

## 0. What this feature is (so you know what you're deploying)

Mobile UI in the Fateh HR app that consumes the **existing `cooperheat` backend**
(the 3-level "Attendance Approval" workflow + Department Approval Matrix + Project
window hours + `Employee Checkin.activity_log`). The `fatehhr` app adds the mobile
**API + screens only** — it declares **no DocTypes/custom fields of its own**; all
attendance/approval fields belong to the `cooperheat` app.

Changes in this branch are **Python API + Vue frontend + a build flag** — no new
fatehhr fixtures or DocTypes, so **no fatehhr migration** is required.

---

## 1. Prerequisites on the Cooperheat site

Confirm **both apps** are installed on the site:

```bash
bench --site cooperheat.enfonoerp.com list-apps   # must show: cooperheat AND fatehhr
```

- **`cooperheat`** — the approval backend (workflow "Attendance Approval", custom
  fields, Department Approval Matrix). Should already be there (it's the client app).
- **`fatehhr`** — the mobile API/SPA. If missing:
  ```bash
  cd /home/<benchuser>/frappe-bench
  bench get-app git@github.com:EnfonoTech/fatehhr.git --branch feature/cooperheat-approvals
  bench --site cooperheat.enfonoerp.com install-app fatehhr
  ```

---

## 2. Backend deploy (fatehhr app code)

```bash
cd /home/<benchuser>/frappe-bench/apps/fatehhr
git fetch origin
# Either deploy the branch directly, or merge it into the branch this bench tracks:
git checkout feature/cooperheat-approvals && git pull --ff-only
#   (or: git checkout develop && git merge --no-ff feature/cooperheat-approvals && git push)

cd /home/<benchuser>/frappe-bench
bench --site cooperheat.enfonoerp.com migrate        # harmless; no fatehhr fixtures, but safe
bench --site cooperheat.enfonoerp.com clear-cache
# Reload Python workers so the new whitelisted methods register (graceful):
sudo supervisorctl signal HUP <bench>-web:   # or: bench restart  (off-hours)
```

New/changed whitelisted endpoints that go live: `fatehhr.api.approvals.*`
(summary/list_pending/list_done/detail/approve/reject), `fatehhr.api.auth.forgot_pin`,
plus `me.profile.is_approver`, `attendance.month` (pending state), and
`checkin.create` / `task.stop_timer` activity-log passthrough.

---

## 3. Config — CORS (REQUIRED for the native APK)

The native app calls the site from a Capacitor origin. Without this the APK's API
calls are blocked:

```bash
bench --site cooperheat.enfonoerp.com set-config -p allow_cors '["capacitor://localhost","https://localhost"]'
```
(or add `"allow_cors"` to the site's `site_config.json`). The web PWA on the same
origin doesn't need it; the APK does.

---

## 4. Frontend builds

`customers/.env.cooperheat` already targets `cooperheat.enfonoerp.com` with
`CUSTOMER_APPROVALS_ENABLED="true"`.

### 4a. Signed APK (production — NOT the `-demo` build)
```bash
git checkout feature/cooperheat-approvals
source <(grep ^FATEHHR ~/.fatehhr-keystore-pw | sed 's/^/export /')   # keystore pw
export ANDROID_HOME="$HOME/Library/Android/sdk"
bash scripts/build-customer.sh cooperheat
# → dist/fatehhr-cooperheat-X.Y.Z.apk  (signed, app id com.enfono.fatehhr.cooperheat)
```
Distribute that APK to staff (the `-demo` variant points at hr-demo — do not ship it).

### 4b. Web PWA (only if you serve the SPA on the cooperheat site)
```bash
cd frontend && rm -f src/app/frappe.js
CUSTOMER_BUILD_TARGET=web pnpm exec vite build   # with the cooperheat env loaded
# tar dist/ → deploy to the site's fatehhr/public/spa per the standard fatehhr deploy
# (see fatehhr skill §4.1), then signal workers.
```

---

## 5. Data setup (HR/client configures; dev verifies)

The approval chain is **data-driven**. For each Department that should route
approvals:

- **Department → Approval Matrix**: add rows for Level 1, 2, 3 — each with an
  **Approver (Employee)** who has a **linked User account**. (Up to 3 levels; the
  workflow always runs L1→L2→L3→Approved.)
- **Project**: set per-level window hours — `Supervisor Approval Window` (L1),
  `Level 2 Approval Window`, `Manager/Payroll Final Approval Window` (L3). Falls
  back to the matrix's `Approval Window (Hours)` if unset.
- **Employees** need a `department`; their active **Shift Assignment** should link
  the `Project` (custom_project_) for project-window override.

Without an Approval Matrix on the department, the workflow can't route and
`validate` will throw "No Level N approver configured".

---

## 6. Verify on production

1. An **approver** logs into the APK (their email/password → set a PIN).
2. Home shows the **Approvals** tile with a pending-count badge.
3. Open a pending record → optionally correct IN/OUT → **Approve**. It advances one
   level ("Level n of 3"); after the final level it shows **Fully approved** and
   moves to the **Done** tab. **Reject** → Rejected.
4. Check-**OUT** shows the **Activity Log** field; the note lands on the Employee
   Checkin.
5. Calendar shows unapproved days as **Pending Approval** (orange).
6. **Forgot PIN** → re-enter password → set a new PIN (recovery works).

---

## 7. Gotchas / notes

- **3-level chain:** a record needs approval at **every configured level** to reach
  Approved. An hourly scheduler auto-approves a record left at **Level 3** once its
  window lapses (this is cooperheat backend behaviour).
- **Approve/Reject are online-only** (never queued) — by design; approval windows
  expire. Activity-log on check-out *does* ride the offline queue.
- **Build flag:** the whole feature is gated by `CUSTOMER_APPROVALS_ENABLED`
  (true only in `.env.cooperheat`) + a runtime `is_approver` check. Safe for other
  customer builds.
- **Stale compiled JS:** `scripts/build-customer.sh` runs `vue-tsc -b` (emits `.js`
  next to `.ts`); if you ever edit a `.ts` and see old behaviour, `rm` the matching
  stale `.js` (Vite resolves `.js` before `.ts`). The build script handles the
  normal case.
- **Rollback:** `git checkout <prev-ref>` in apps/fatehhr + clear-cache + reload
  workers. No schema was changed by fatehhr, so rollback is code-only.

---

## 8. Reference

- Branch: `feature/cooperheat-approvals` (8 commits) on `EnfonoTech/fatehhr`.
- Design + verified contract: `docs/cooperheat-approval-ui-plan.md`.
- Demo APK (points at hr-demo, for QA only): `fatehhr-cooperheat-demo-1.0.32.apk`
  on the `frontend-dev` release.
