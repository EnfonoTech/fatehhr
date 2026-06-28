# Cooperheat Mobile — Phase 2 (multi-site check-in + approval improvements)

Spec for the second round of Cooperheat mobile work, from `Cooperheat_App_Issues (15).xlsx`
+ the "approvers edit multiple check-in/out pairs" requirement.

**Locked decisions:** backend (cooperheat app) is the **client dev's** scope; I build the
**fatehhr mobile** slice against the contract below. Approver time-corrections edit the
**raw `Employee Checkin` logs** (source of truth) → existing overlap-validation + auto
re-derive of `Attendance.custom_site_hours`.

**Repos:** `fatehhr` (mobile — me) · `EnfonoTech/cooperheat` (backend — dev).
**Branch base:** `feature/cooperheat-approvals` (phase-1).

---

## A. Backend contract — for the cooperheat developer (BLOCKER for mobile)

Some already exist in the repo (✅); the rest are new (🆕).

1. **🆕 Shift Assignment — multiple sites.** Today it's a single `custom_project_`.
   Add a child table (e.g. `custom_allocated_sites`: `project` Link→Project, `project_name`).
   This is the source list for the check-in picker.
2. **🆕 List allocated sites endpoint.** `@whitelist get_allocated_sites(date=today)` →
   `[{project, project_name}]` for the logged-in employee's **active Shift Assignment**
   on `date`. (If absent, the mobile can't populate the picker.)
3. **🆕 Check-in carries a site.** `Employee Checkin` needs a site field
   (e.g. `custom_project_site` Link→Project). The mobile sends it; cooperheat links it
   into `custom_site_hours` (issue #4). Must be one of the employee's allocated sites.
4. **🆕 Check-out site is derived.** On OUT, the site = the matching open IN's site
   (read-only on mobile). Provide it via the open-checkin lookup (or `today_summary`
   could return the open IN's site).
5. **✅ Overlap validation** — already in `overrides/employee_checkin.py` (site+time no
   overlap). Confirm it also blocks same-time across **different** sites per the rule.
6. **🆕 Multi-pair approver edit endpoint.**
   `update_attendance_checkins(attendance_name, edits=[{checkin, time}], )`:
   - Auth: the **current-level approver** (L1/L2/L3) of the record **or HR Manager**,
     within the approval **window** (reuse `_get_matrix`/`_row_for_level`/window check).
   - Edits the underlying **Employee Checkin `time`** values (raw logs) → existing
     `validate` (overlap) + `_populate_site_hours` re-derive the pairs.
   - Returns the refreshed pairs. Does NOT itself advance the workflow.
7. **✅ Per-level dept-scoped pending list** — `get_pending_level3_records` exists for L3;
   generalise to L1/L2 (current `current_approver`-stamping already scopes correctly).

> Mobile is built to this contract. If the dev's field/endpoint names differ, only the
> thin `fatehhr.api` wrappers change.

---

## B. Mobile (fatehhr) — my build

### B1. Check-in: project-site picker (issues #3, W2)
- `CheckinView.vue`: when checking **IN**, a **required site dropdown** populated from a new
  `fatehhr.api.checkin.allocated_sites()` (wraps backend #2, or queries the active Shift
  Assignment's `custom_allocated_sites`). Block IN submit if no site chosen (when sites exist).
- `checkin.create` (api + store + offline processor + backend handler): add `project_site`
  param → written to the checkin's site field (#3), guarded by `has_field`.

### B2. Check-out: read-only site (W3)
- On **OUT**, fetch + show the **open check-in's site**, read-only (from backend #4 /
  `today_summary`). No picker on OUT.

### B3. Approvals list: employee search + scope (issues #5, #1)
- `AttendanceApprovalsView.vue`: add a **search box** filtering the Pending/Done lists by
  employee name/id (client-side filter over the loaded rows; or pass a `q` to `list_pending`).
- Confirm list is **already department-scoped** (it filters `current_approver == me`), which is
  per-approver = per their matrix department. Add a visible department label per card.

### B4. Approval detail: multi-pair editor (the core change)
- Replace the single IN/OUT editor with a **list of editable pairs** — one row per site/pair:
  site/project label, **IN datetime picker**, **OUT datetime picker**, per-row hours; a running
  **total**; read-only when the window is expired or the user isn't the current approver.
- Source the pairs from the record's `custom_site_hours` (display) but **edit maps back to the
  raw checkin** rows (backend #6 takes `{checkin, time}` edits).
- On **Approve**: send changed times → `update_attendance_checkins` → then the existing
  two-step workflow advance (`approvals.approve`). Keep the level-progress UX from phase-1.

### B5. Non-approver gating (issue #2)
- Belt-and-suspenders on the client: never render Approve/Reject unless
  `is_approver && current_approver == me` (backend already enforces). Verify no action leaks.

### B6. fatehhr API wrappers (Python)
- `checkin.allocated_sites()`, `checkin.create(project_site=…)`,
  `approvals.update_checkins(name, edits)` (proxy to cooperheat #6),
  `approvals.list_pending(q=…)` employee filter. All `has_field`/has-method guarded so the
  demo tenant + non-cooperheat builds stay safe.

---

## C. Verification
- `vue-tsc --noEmit` + `vite build` (cooperheat env). No Vue unit runner → tsc/build + on-bench.
- Backend `test_*` for the new endpoints = **dev's** responsibility.
- End-to-end on hr_demo once the dev's endpoints are installed there (as in phase-1): set up
  Shift-Assignment sites → check in at site A, out, in at site B → approver edits a pair → approve.

## D. Open questions / gate (why the build loop waits)
1. **Backend endpoints A1–A4, A6 don't exist yet** — mobile B1/B2/B4 can't integrate or be
   verified until the dev builds + confirms them. ← primary blocker.
2. Confirm backend **field/endpoint names** (so the `fatehhr.api` wrappers match).
3. Employee search — client-side filter vs server `q` param (depends on expected volume).
4. Does multi-site change the **3-level workflow**? (Assumed no — approval is per-Attendance-day,
   regardless of how many site pairs it contains.)

---

## E. Sequencing
1. Dev builds backend A1–A6 (this spec is the contract) → installs on hr_demo.
2. I build mobile B1–B6 via the pipeline (TDD where testable; tsc/build + on-bench verify).
3. Integration test on hr_demo → prod APK → dev deploys (per `cooperheat-prod-deploy.md`).
