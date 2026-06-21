# Cooperheat Attendance-Approval UI — Implementation Plan

**Project:** Fateh HR PWA (`/Users/sayanthns/Documents/fatehhr`)
**Branch:** `develop` (single trunk — NO separate branch; feature ships dark behind a flag)
**Backend it consumes:** `cooperheat` custom Frappe app (already built — two-level Attendance approval)
**Source specs:** `Downloads/fatehhr_ui_changes.pdf` (mobile UI) + `Downloads/coopeheatss documentation.pdf` (backend contract)
**Plan authored:** 2026-06-15

---

## Scope — 6 mobile features

1. **Activity Log** on check-OUT (rides existing offline check-in queue).
2. **Pending Approvals** quick-action tile on Home (badge count; approver-only).
3. **Attendance Approvals** list screen (Pending / Done tabs).
4. **Attendance Approval** detail + action screen (edit IN/OUT, Approve / Reject).
5. **Calendar** "Pending Approval" orange state (overrides green Present until approved).
6. **Calendar day-detail** approval rows (status + current approver).

---

## Decisions (locked — rationale baked in)

| # | Decision | Why |
|---|----------|-----|
| D1 | **Custom whitelisted endpoints** `fatehhr.api.approvals.*` — NOT generic `/api/resource`. | App's entire data layer hits `/api/method/` via `apiCall()` ([client.ts:16](frontend/src/api/client.ts)). Permission + field-shaping + UTC handling belong server-side. The PDF's `/api/resource` snippets are illustrative of *data*, not the call style. |
| D2 | **Approve / Reject are ONLINE-ONLY.** Never queued offline. | Approval windows expire (`window_expires_at`); a stale queued approval could fire after auto-approval or against a changed record. Re-throw `ApiError`/network error (gotcha #4), show "connection needed". |
| D3 | **Activity Log DOES ride the offline check-in queue.** | It is one field on the existing `checkin` payload — the queue is already generic ([queue.ts](frontend/src/offline/queue.ts), [drain.ts](frontend/src/offline/drain.ts)). |
| D4 | **Gate = build flag `CUSTOMER_APPROVALS_ENABLED` + runtime approver check.** | White-label: flag keeps it dark in non-cooperheat builds. Runtime check hides it from cooperheat non-approvers. |
| D5 | **`fatehhr` only READS/WRITES cooperheat fields — never declares them.** | Cooperheat doc rule §11: all custom fields live in the `cooperheat` app. `fatehhr` adding them as fixtures = duplicate/ownership conflict. |
| D6 | **All shared backend code degrades safely when cooperheat app is absent (demo site).** | `fatehhr` is installed on BOTH demo and cooperheat sites. Guard every cooperheat-field access with `frappe.get_meta("Attendance").has_field(...)`. Demo must keep working unchanged. |

---

## Backend contract (from PDFs — AUTHORITATIVE for planning, VERIFY on bench in Phase 0)

**Attendance** (cooperheat app, DocType is submittable, all states `docstatus=1`):
- `workflow_state` · `current_approval_level` (Int) · `current_approver` (Link→Employee) · `current_approver_name` (Data) · `approval_window_hours` (Float) · `level_assigned_at` (Datetime) · `window_expires_at` (Datetime) · `window_reminder_sent` (Check)
- `in_time` / `out_time` / `working_hours` — have Property Setters `allow_on_submit=1`, `read_only=0`.
- Workflow name **"Shift Assignment Approval"**. States: `Draft`, `Pending Level 1 Approval`, `Pending Level 2 Approval`, `Approved`, `Rejected`.
- Logic hooks (cooperheat `overrides/attendance.py`): `validate` (blocks wrong-approver / expired-window edits, recalcs `working_hours`), `on_update_after_submit` (advances to L2, emails). HR Manager bypasses.

**Employee Checkin** (cooperheat app): field **`activity_log`** (Long Text) — name has **NO `custom_` prefix** (⚠ discovery agents wrongly assumed `custom_activity_log`). Section visible only when `log_type = OUT`.

---

## PHASE 0 — Discovery + Bench Verification

Discovery (frontend) is **DONE** — findings embedded below as `file:line` refs. Residual **bench** facts must be confirmed before backend coding, because the PDF is documentation, not the live schema.

### 0.1 Verify on the cooperheat bench (blocking for Phase 1)
Run against the cooperheat site (site/bench TBD — see 0.2). Read-only:

```python
# bench --site <cooperheat-site> console
import frappe, json
m = frappe.get_meta("Attendance")
print("workflow_state", m.has_field("workflow_state"))
for f in ["current_approval_level","current_approver","current_approver_name",
          "approval_window_hours","window_expires_at","level_assigned_at"]:
    print(f, m.has_field(f))
ec = frappe.get_meta("Employee Checkin")
print("activity_log", ec.has_field("activity_log"))         # confirm exact fieldname
print(frappe.db.get_value("Workflow", {"document_type":"Attendance"}, "name"))
# workflow actions (decides apply_workflow vs direct set):
print(frappe.get_all("Workflow Transition",
      filters={"parent":"Shift Assignment Approval"},
      fields=["state","action","next_state","allowed"]))
# child table doctype name for the approver matrix:
print([f.options for f in frappe.get_meta("Department").fields if f.fieldtype=="Table"])
```

**Must answer:**
- Exact fieldnames (confirm `activity_log`, `current_approver`, `current_approver_name`, `window_expires_at`).
- Does Workflow "Shift Assignment Approval" define **Transitions/Actions**? → if yes, Phase 1 uses `frappe.model.workflow.apply_workflow(doc, action)`; if states are set directly by cooperheat code, Phase 1 sets `doc.workflow_state` directly and `doc.save()`.
- Child-table DocType name behind Department → Approval Matrix (for `is_approver`).
- **"Done" tab data source**: there is no single "actioned-by-me" field. Decide MVP — Done = terminal-state (`Approved`/`Rejected`) Attendance for employees in my matrix scope, last 30 days. Confirm a queryable path; if none clean, ship **Pending tab fully, Done tab best-effort** and log the limitation.

### 0.2 Confirm site / bench
- `customers/.env.cooperheat` → `CUSTOMER_ERP_DOMAIN="cooperheat.enfonoerp.com"`, but PDF test cmd uses `bench --site cooperheats.new`. Resolve which site is live and whether **both** `fatehhr` AND `cooperheat` apps are installed on it (`bench --site <s> list-apps`). The mobile app needs both.
- Server Manager API (`194.163.160.83:3847`) was **unreachable from a non-allowlisted IP** during planning — get IP `157.51.208.136` (or current) whitelisted, or use the documented Tailscale path, before Phase 6 deploy.

**Anti-pattern guard:** Do NOT start Phase 1 assuming `custom_activity_log` or assuming a Workflow-action API exists. Confirm first.

---

## PHASE 1 — Backend (`fatehhr` app)

All edits in `/Users/sayanthns/Documents/fatehhr/fatehhr/api/`. Follow `frappe-erpnext-expert` rules: `@frappe.whitelist()` with type hints + in-method permission check, `frappe.qb`/`get_all` with explicit fields, `_()` on user strings, `cint`/`flt`/`getdate` for coercion, no f-string SQL.

### 1.1 Shared time helpers
`fatehhr/api/checkin.py` already has `_naive_site_to_utc_iso` ([checkin.py:38-56](fatehhr/api/checkin.py)) and `_parse_client_ts`. **Extract** both to `fatehhr/api/_time.py` and import from checkin.py + approvals.py. (Keeps gotcha #1/#2 handling in one place: emit UTC-ISO-`Z`; parse incoming with `dateutil.isoparse`, NOT `get_datetime`.)

**Verify:** `grep -r "_naive_site_to_utc_iso" fatehhr/api` → only the new module defines it.

### 1.2 NEW `fatehhr/api/approvals.py`
Clone the structure/permission idiom from [expense.py](fatehhr/api/expense.py) + [attendance.py](fatehhr/api/attendance.py). Every function starts with a meta guard:

```python
# fatehhr/api/approvals.py
import frappe
from frappe import _
from frappe.utils import flt, cint
from fatehhr.api._time import naive_site_to_utc_iso, parse_client_ts

PENDING_STATES = ("Pending Level 1 Approval", "Pending Level 2 Approval")

def _approvals_available() -> bool:
    return frappe.get_meta("Attendance").has_field("workflow_state")

def _my_employee() -> str | None:
    return frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
```

Functions:
- `summary() -> dict` → `{"enabled": bool, "is_approver": bool, "pending_count": int}`. If not available → all false/0. `is_approver` = membership in any Department Approval Matrix row (child DocType from 0.1) OR `pending_count>0`. Drives the Home tile + badge.
- `list_pending(limit:int=50) -> list[dict]` → Attendance where `docstatus=1`, `current_approver = _my_employee()`, `workflow_state in PENDING_STATES`. Fields: name, employee, employee_name, attendance_date, status, `in_time`/`out_time` (→ UTC-ISO), working_hours, current_approval_level, workflow_state, `window_expires_at` (→ UTC-ISO). HR Manager: return all pending.
- `list_done(limit:int=30) -> list[dict]` → per 0.1 decision (best-effort terminal states in scope, last 30d). Log if limited.
- `detail(name:str) -> dict` → full record; **permission check**: `frappe.has_permission("Attendance", "read", doc=name)` AND (`current_approver == _my_employee()` OR HR Manager) else `frappe.throw(_("Not your approval."))`. Datetimes → UTC-ISO.
- `approve(name:str, in_time:str|None=None, out_time:str|None=None) -> dict` → load `doc=frappe.get_doc("Attendance", name)`; permission check; if in_time/out_time supplied, set on the **in-memory doc** (`doc.in_time = parse_client_ts(...)`) — never `db.set_value`+`save` mix (gotcha: TimestampMismatch / submittable rules from skill §1). Then advance: `apply_workflow(doc, <approve action>)` if actions exist (0.1), else `doc.workflow_state = <next>` + `doc.save()`. Let cooperheat `validate`/`on_update_after_submit` fire. Return new state.
- `reject(name:str, reason:str|None=None) -> dict` → same guards; set Rejected via the workflow.

**Anti-pattern guards:** ❌ no `frappe.db.set_value(...)` on a doc you also `save()`. ❌ no `parent.save()` to mutate child rows. ❌ no `allow_guest`. ❌ don't bypass `current_approver` check "for convenience". ✅ wrap external nothing here, but catch + `frappe.throw(_())` on workflow errors so the app shows cooperheat's validation message.

**Tests** — `fatehhr/api/test_approvals.py` (`FrappeTestCase`): (a) meta-guard returns disabled when field absent; (b) non-approver `detail()` throws; (c) approver sees only own pending; (d) approve advances state. Skip live-workflow tests if run on a bench without cooperheat (guard with `_approvals_available()`).

### 1.3 `me.profile()` — add approver flag
[me.py](fatehhr/api/me.py) + [me.ts](frontend/src/api/me.ts). Append `"is_approver": approvals.summary()["is_approver"]` (reuse 1.2, guarded → False on demo). Add `is_approver?: boolean` to the `Profile` TS interface.

### 1.4 `attendance.month()` — pending state + approver
[attendance.py:44-80](fatehhr/api/attendance.py). Guarded:
- If `workflow_state` field exists, add `workflow_state`, `current_approver` to the `frappe.get_all("Attendance", ...)` fields.
- In `_derive_status` ([attendance.py:148](fatehhr/api/attendance.py)): if `status=="Present"` AND `workflow_state in PENDING_STATES` → return `"Pending Approval"`.
- Add to each day dict: `workflow_state`, `current_approver_name` (resolve via `Employee`→ name). Add `pending_approval` to `_summarize`.
- Extend `DayRec` ([attendance.ts:3](frontend/src/api/attendance.ts)) with `workflow_state?`, `current_approver_name?`.

**Verify demo unchanged:** run `attendance.month` on demo (no cooperheat) → identical output to before (guards skip new fields).

### 1.5 `checkin.create()` — activity_log passthrough
[checkin.py:60-179](fatehhr/api/checkin.py). Add param `activity_log: str | None = None`; write **only if field exists**: `if frappe.get_meta("Employee Checkin").has_field("activity_log"): doc.activity_log = activity_log or None` (D5/D6 — field owned by cooperheat). Add to response + `_row_as_response` fields list (guarded). Use exact fieldname confirmed in 0.1.

**Semgrep:** `bash ~/.claude/skills/frappe-erpnext-expert/scripts/semgrep_check.sh fatehhr` → zero blockers.

---

## PHASE 2 — Frontend scaffolding (flag + i18n)

### 2.1 Build flag `CUSTOMER_APPROVALS_ENABLED`
Copy the `CUSTOMER_SELFIE_MODE` pattern exactly:
- [frontend/plugins/vite-theme-plugin.ts](frontend/plugins/vite-theme-plugin.ts): add to `CustomerEnv` interface + emit `export const CUSTOMER_APPROVALS_ENABLED = ${JSON.stringify(env.CUSTOMER_APPROVALS_ENABLED === "true")};`
- [frontend/src/vite-env.d.ts](frontend/src/vite-env.d.ts): `export const CUSTOMER_APPROVALS_ENABLED: boolean;`
- [customers/.env.cooperheat](customers/.env.cooperheat): `CUSTOMER_APPROVALS_ENABLED="true"`
- `.env.demo` + `.env.example`: `CUSTOMER_APPROVALS_ENABLED="false"` (explicit, documents the flag).

**Verify:** `CUSTOMER_BUILD_TARGET=web pnpm exec vite build` for demo → grep bundle: no approvals routes referenced at runtime (flag false short-circuits). Build cooperheat → flag true.

### 2.2 i18n strings (en + ar)
[locales/en.json](frontend/src/locales/en.json) + [ar.json](frontend/src/locales/ar.json). Add `approvals.*` (title, pending, done, empty, approve, reject, confirm_*, window_left, level, edit_times, online_only) and `attendance.approval_status` / `attendance.current_approver` / `attendance.pending_approval`. **Both locales** (ar.json is partial — add keys, fall back is en).

---

## PHASE 3 — Activity Log on check-OUT (frontend)

End-to-end `activity_log` (string) wiring — 6 frontend points (backend done in 1.5):
1. [CheckinView.vue](frontend/src/views/CheckinView.vue): add `const activityLog = ref<string|null>(null)`; textarea `v-if="nextLogType==='OUT'"` inserted after the geofence chip (~line 198), before task picker; clear after submit.
2. `CheckinSubmit` interface + `store.submit()` online + offline paths ([stores/checkin.ts:8,132,152](frontend/src/stores/checkin.ts)).
3. `checkinApi.create` param ([api/checkin.ts:25](frontend/src/api/checkin.ts)) + `CheckinRow` field.
4. Offline drain processor ([offline/processors/checkin.ts:26](frontend/src/offline/processors/checkin.ts)) — pass `p.activity_log`.

**Verify:** check-OUT offline → reconnect → drained checkin includes activity_log on the server record; check-IN shows no textarea.

**Anti-pattern guard:** textarea must NOT appear on IN; field optional (never block submit on empty).

---

## PHASE 4 — Approvals list + detail + nav + tile

Follow the **new-screen recipe** (discovery agent 2). Clone [LeaveListView.vue](frontend/src/views/LeaveListView.vue) (list) + [PayslipDetailView.vue](frontend/src/views/PayslipDetailView.vue) (detail) + [stores/announcement.ts](frontend/src/stores/announcement.ts) + [api/announcement.ts](frontend/src/api/announcement.ts).

1. **API** `frontend/src/api/approvals.ts`: `summary/listPending/listDone/detail/approve/reject` → `apiCall(..., "fatehhr.api.approvals.*")`. Types incl. `window_expires_at: string` (UTC-ISO).
2. **Store** `frontend/src/stores/approvals.ts`: state (pending, done, detail, count), actions. Approve/Reject: on `ApiError`/network → surface message, **do NOT queue** (D2).
3. **List view** `AttendanceApprovalsView.vue`: Pending/Done tabs; cards (employee, date, status `Chip`, IN/OUT, level, **time-left chip** computed from `window_expires_at - now`, recomputed on render). Tap → detail.
4. **Detail view** `AttendanceApprovalDetailView.vue`: editable IN/OUT time pickers (only if not window-expired), working-hours live recompute (display only), Approve / Reject (two-tap confirm — match [sync-errors pattern, commit c771f18]). Hide actions if not current approver or window expired (mirror cooperheat client-script logic, PDF §2.5).
5. **Routes** [router.ts](frontend/src/app/router.ts): `approvals` + `approvals.detail` (`:name`).
6. **Back map** [native-back.ts](frontend/src/app/native-back.ts): `"approvals":"/"`, `"approvals.detail":"/approvals"`.
7. **More menu** [MoreView.vue](frontend/src/views/MoreView.vue): conditional link `v-if="CUSTOMER_APPROVALS_ENABLED && profile.is_approver"`.
8. **Home tile** [DashboardView.vue:108](frontend/src/views/DashboardView.vue): conditionally push `{to:"/approvals", label:t("approvals.title"), icon, badge: pendingCount}` — `QuickActionGrid` already renders `badge` ([QuickActionGrid.vue:43](frontend/src/components/QuickActionGrid.vue)). Fetch `summary()` on dashboard mount.

**Gate everywhere:** `CUSTOMER_APPROVALS_ENABLED && profile.is_approver`. Routes themselves can stay registered (flag-guarded entry points keep them unreachable in other builds).

**Verify:** cooperheat approver build → tile + badge + list + approve flow works online; offline approve → blocked with message. Non-approver / demo build → no tile, no More entry.

---

## PHASE 5 — Calendar pending state + day-detail

[AttendanceCalendarView.vue](frontend/src/views/AttendanceCalendarView.vue):
1. `statusClass` map (~line 49): add `"Pending Approval": "is-pending"`.
2. CSS (~line 156): `.cal__cell.is-pending { background: var(--warning-soft); color: var(--warning); }` (orange tokens exist in [tokens.css](frontend/src/styles/tokens.css)).
3. Summary card (~line 104): add pending count row.
4. Day-detail bottom sheet (~line 113): add approval rows — `Approval Status` (`Chip` variant via `pending/approved/rejected`) + `Current Approver` when pending. Import `Chip`.
5. Backend already supplies `workflow_state` + `current_approver_name` (Phase 1.4).

Orange overrides green because `_derive_status` returns `"Pending Approval"` instead of `"Present"` while pending (Phase 1.4) — single source of truth, no client-side override race.

**Verify:** pending day = orange cell + sheet shows level/approver; after approval → green + ✓; demo site → no pending state ever (guard).

---

## PHASE 6 — Verification & Deploy

1. **Types/build:** `rm -f frontend/src/app/frappe.js; pnpm exec vue-tsc --noEmit` → clean. Build both: `CUSTOMER_BUILD_TARGET=web pnpm exec vite build` for demo AND cooperheat env.
2. **Backend:** semgrep clean (1.5); `bench --site <cooperheat> run-tests --module fatehhr.api.test_approvals`.
3. **Manual matrix** (adapt PDF §9 to mobile): submit Attendance → L1 approver sees tile+badge → opens detail → edits IN time (hours recompute) → Approve → moves to L2 → L2 approves → Approved + calendar green. Reject path. Window-expired → actions hidden. Activity Log on OUT (online + offline-drain). Non-approver sees nothing. **Demo tenant regression:** calendar/checkin unchanged.
4. **Deploy** (skill §4, after 0.2 access fixed): PWA tarball + signed APK. Cooperheat build uses `bash scripts/build-customer.sh cooperheat` (confirm script handles the cooperheat env). Bump `NATIVE_VERSION` via `bump-version.mjs` only.
5. **Commit to `develop`** (no PR, solo dev). Update [LESSONS_LEARNED.md](docs/LESSONS_LEARNED.md) + skill changelog with any new gotchas.

---

## Open items to confirm before / during execution
- [ ] **0.1 bench verification** of all fieldnames + Workflow actions + matrix child-DocType (blocks Phase 1).
- [ ] **0.2** which cooperheat site is live + both apps installed + SM API/Tailscale access.
- [ ] **Done-tab** data source (MVP: Pending full, Done best-effort).
- [ ] `build-customer.sh` supports a `cooperheat` target (or add it).
- [ ] Whether `apply_workflow` (actions defined) vs direct `workflow_state` set is correct for approve/reject.

## Anti-pattern guards (global)
- No `custom_activity_log` — field is `activity_log` (verify).
- `fatehhr` declares ZERO cooperheat custom fields (D5).
- Every cooperheat-field access guarded by `has_field` (D6) — demo must not break.
- Approve/Reject never queued (D2).
- Submittable-doc rules: set fields on in-memory doc, single `save()`, no `db_set`+`save` mix, no `parent.save()` for child rows.
- All datetimes to client = UTC-ISO-`Z`; parse incoming with `dateutil.isoparse`.
