# Fateh HR v1 — Design Spec

**Date:** 2026-04-18
**Status:** Draft — for review before writing the implementation plan
**Companion:** [2026-04-17-fatehhr-visual-direction.md](./2026-04-17-fatehhr-visual-direction.md)
**Source brief:** `/Users/sayanthns/Downloads/fatehhr-claude-code-prompt.md`
**Architecture skill:** `frappe-vue-pwa` (non-negotiable; rules not re-stated here)

---

## 1. What Fateh HR is

A white-label HR PWA for Frappe v15, built as a Vue 3 SPA that ships as
both a web PWA and a Capacitor Android APK from a single source.
**Field-team first.** Offline-first with a hardened sync architecture.
Integrates with ERPNext + Frappe HRMS; wraps HRMS logic, never bypasses
it.

Per-customer deployment: one env switch sets `CUSTOMER_ERP_DOMAIN`,
`CUSTOMER_BRAND_NAME`, `CUSTOMER_PRIMARY_COLOR`, `CUSTOMER_LOCALE`, and
`CUSTOMER_SELFIE_MODE`, and the same codebase ships to any customer.

### Why field-team first

Fateh HR is not a desk HR app. Primary users are field workers moving
between task sites throughout the day. That reframes three things in
the v1 design:

1. **Check-in/out is task-scoped, not office-scoped.** Multiple
   check-in/out pairs per day is the norm. Daily attendance hours =
   sum of pair durations.
2. **Geofencing is soft and task-owned.** Coords + radius live on the
   Task, not on a global office registry. Outside-radius check-ins are
   recorded with a flag, not blocked.
3. **Speed beats ceremony.** The happy-path check-in is one tap. The
   selfie, GPS, task link, and timestamp all flow behind the tap.

---

## 2. v1 Scope (10 modules + offline engine)

The brief defined 11 modules. After the brainstorm (see §12 for the
decisions), v1 ships **10**. Manager-facing Leave Approvals moves to
v1.1. Push notifications also move to v1.1 in favour of an in-app
notification feed.

### 2.1 Modules shipped in v1

| # | Module | One-line shape |
|---|--------|----------------|
| 1 | Login & PIN | Email+password first-time login (cookie session) sets a 4–6 digit PIN; PIN exchanges for stable `api_secret` on subsequent opens. |
| 2 | Dashboard | Greeting, today's check-in status, quick actions, leave-balance peek, latest announcement, notification bell. |
| 3 | Task/site Check-in & Check-out | One-tap per task; GPS + reverse-geocoded address + optional selfie (configurable) + geofence flag. Location history view. |
| 4 | Attendance Calendar | Monthly view; day hours = sum of all task-pair durations; tap day → full breakdown. |
| 5 | Leave Application | Apply + view own leaves. Live balance per type. Employee-only. |
| 6 | Expense Claims | Multi-line claim with required receipt photo per line; offline ONE-uploader contract. |
| 7 | Payslip | List + detail + PDF download + native share; last 3 months cached offline. |
| 8 | Tasks & Timer | Task list by project; Start/Stop timer creates paired Employee Checkin (`custom_task` linked) + Timesheet detail. |
| 9 | Announcements | Markdown body, pinned top, local-device read state. |
| 10 | Profile & Settings | Self-profile (edit emergency contact + bank), Change PIN, Language (EN/AR+RTL), Theme, Force sync, Discard pending (destructive w/ confirm), Version, Logout. |

### 2.2 Deferred to v1.1 (explicitly out of v1)

- **Leave Approvals (manager screen).** Managers use ERPNext desk in v1.
- **Push notifications.** v1 uses an in-app notification bell on the
  dashboard that refreshes on app open and pull-to-refresh. The bell
  reads existing ERPNext **Notification Log** entries for the user —
  no new DocType, no FCM, no relay config required.
- **HR Announcement Read DocType.** Read state is stored locally in
  IndexedDB, keyed by announcement `name` + user. No server chatter.
- **Rich text / attached images / targeting** on announcements.
- **Geofence hard-block.** v1 flags, v1.1 can add enforcement via a
  per-task or customer-level setting.

### 2.3 Out of scope entirely (brief reinforcement)

No iOS. No biometrics. No in-app chat. No video. No facial recognition.
No "AI" features. No bypass of HRMS workflow. No reuse of the Damage
PWA keystore / icons / colour.

---

## 3. Deployment & build-time configuration

All per-customer values are read at Vite build time. The codebase never
references a hard-coded customer value.

```env
# Per-customer (changes per build):
CUSTOMER_ERP_DOMAIN    = "hrms.acme.com"
CUSTOMER_BRAND_NAME    = "Acme HR"
CUSTOMER_PRIMARY_COLOR = "#2E5D5A"
CUSTOMER_LOCALE        = "en"                # en | ar
CUSTOMER_SELFIE_MODE   = "first"             # off | first | every

# Locked across customers:
APP_NAME       = "fatehhr"
APP_DISPLAY    = "Fateh HR"
APP_ID_ANDROID = "com.enfono.fatehhr"
REPO           = "github.com/EnfonoTech/fatehhr"
SITE_NAME      = "fatehhr_dev"               # fresh Frappe site
```

A Vite plugin (`fatehhr-theme-plugin`) computes derived accent tokens
(see visual direction §2.2), injects them into `:root`, generates the
Android adaptive icon / splash, writes `theme-color` meta, and writes
`manifest.json` with the right name / short_name / colours.

---

## 4. Server side — the `fatehhr` Frappe app

A single Frappe app `fatehhr` installed on a fresh site `fatehhr_dev`
alongside `erpnext` and `hrms`. The app:

1. Ships **custom fields** as fixtures, loaded via `bench migrate`.
2. Ships **one new DocType**: `HR Announcement`.
3. Provides the `fatehhr.api` Python module — a thin wrapper around
   HRMS that:
   - Handles PIN + `api_secret` auth (`auth.py`, per skill §3.5).
   - Exposes a small, stable REST surface the SPA calls.
   - **Never** reimplements HRMS workflow / permission logic.
4. Provides `install.py` with `after_migrate` hooks:
   - `ensure_capacitor_cors()` (skill §3.6).
   - Ensures `Notification Log` permissions are readable by
     non-System-User Employee roles.
5. Ships no custom UI on the Frappe desk — this is a headless API app
   from the backend's perspective.

### 4.1 DocType & field changes (fixtures)

#### New DocType: `HR Announcement`

| Field            | Type          | Notes                                    |
|------------------|---------------|------------------------------------------|
| `title`          | Data, reqd    | 140 char                                 |
| `body`           | Long Text     | Markdown; sanitised on render client-side |
| `pinned`         | Check         | Bubble to top                            |
| `published_on`   | Datetime      | Sort key                                 |
| `published_by`   | Link → User   | Auto-set on submit                       |

No child table, no "read by" tracking DocType. Client uses IndexedDB to
store `announcement_read_{user_id}_{name} = true`.

#### Custom fields on existing DocTypes

**Employee** (minimal; reused across sessions per skill §3.5):

| Fieldname           | Type     | Notes                                    |
|---------------------|----------|------------------------------------------|
| `custom_pin_hash`   | Password | Set/rotated via `Change PIN`             |
| `custom_api_secret` | Password | Stable; generated on first PIN set; reused on every re-login. NEVER regenerated per call. |

**Employee Checkin** (field-team location + linkage):

| Fieldname                  | Type               | Notes                                         |
|----------------------------|--------------------|-----------------------------------------------|
| `custom_latitude`          | Float              | Captured at tap                               |
| `custom_longitude`         | Float              | Captured at tap                               |
| `custom_location_address`  | Small Text         | Reverse-geocoded via OSM Nominatim, cached    |
| `custom_task`              | Link → Task        | Optional — present when check-in is task-scoped |
| `custom_selfie`            | Attach Image       | Optional; per customer's `SELFIE_MODE`        |
| `custom_geofence_status`   | Select             | `inside` \| `outside` \| `unknown` \| `disabled` |

**Task** (field-team geofence):

| Fieldname                    | Type   | Notes                                    |
|------------------------------|--------|------------------------------------------|
| `custom_latitude`            | Float  | Optional                                 |
| `custom_longitude`           | Float  | Optional                                 |
| `custom_geofence_radius_m`   | Int    | Optional; if any of the three is null → geofence disabled for this task |

### 4.2 API surface (the `fatehhr.api` module)

Kept small. Every endpoint wraps HRMS / ERPNext primitives. Endpoints
are whitelisted via `@frappe.whitelist()` where they are user-callable.

| Endpoint                                 | Purpose                                                      |
|------------------------------------------|--------------------------------------------------------------|
| `fatehhr.api.auth.login`                 | Email+password → returns `{api_key, api_secret}` (skill §3.5). |
| `fatehhr.api.auth.set_pin`               | First-time PIN set after credential login.                  |
| `fatehhr.api.auth.verify_pin`            | PIN → `{api_key, api_secret}` (reuses existing secret).    |
| `fatehhr.api.auth.change_pin`            | Authenticated PIN rotation.                                 |
| `fatehhr.api.me.profile`                 | Current employee profile + allowed fields.                  |
| `fatehhr.api.me.update_profile`          | Emergency contact + bank details only.                      |
| `fatehhr.api.checkin.create`             | Create Employee Checkin (IN/OUT); accepts optional `task`, `latitude`, `longitude`, `address`, `selfie_file_url`. Computes `custom_geofence_status` server-side. |
| `fatehhr.api.checkin.list`               | Paginated history, filterable by date range.                |
| `fatehhr.api.attendance.month`           | Calendar data for month — daily status + sum of pair durations. |
| `fatehhr.api.leave.types_with_balance`   | Wraps `get_leave_balance_on` per leave type.                |
| `fatehhr.api.leave.apply`                | Creates a Leave Application (Draft → Applied per HRMS).     |
| `fatehhr.api.leave.cancel`               | Cancels a pending own leave.                                |
| `fatehhr.api.leave.list_mine`            | Own leave history.                                          |
| `fatehhr.api.expense.submit_claim`       | Creates Expense Claim with child rows + attached File refs. |
| `fatehhr.api.expense.list_mine`          | Own expense claims.                                         |
| `fatehhr.api.payslip.list_mine`          | Salary Slip list (own).                                     |
| `fatehhr.api.payslip.pdf`                | PDF bytes for a Salary Slip.                                |
| `fatehhr.api.task.list_mine`             | Assigned tasks grouped by project.                          |
| `fatehhr.api.task.start_timer`           | Opens Timesheet detail + creates task Employee Checkin.     |
| `fatehhr.api.task.stop_timer`            | Closes Timesheet detail + creates paired checkout.          |
| `fatehhr.api.announcement.feed`          | List published HR Announcements.                            |
| `fatehhr.api.notifications.feed`         | Wraps `Notification Log` for current user + unread count.   |
| `fatehhr.api.notifications.mark_read`    | Marks a notification log row read.                          |
| `fatehhr.api.util.reverse_geocode`       | Server-side proxy to OSM Nominatim (rate-limited, cached in Redis). Keeps the public OSM endpoint from hitting client-side CORS + rate-limit walls. |

### 4.3 Attendance computation

`fatehhr.api.attendance.month` returns per-day:

- `status`: `Present` | `Absent` | `Half Day` | `On Leave` | `Holiday` | `Weekend`
  - Pulled from the `Attendance` DocType where one exists, else
    computed from Employee Checkin + Leave Application + Holiday List.
- `hours_worked`: sum of all checkin→checkout pair durations for that
  day. Unclosed pairs (still IN at midnight) are closed at end-of-day
  with a `flag: "open_pair_autoclosed"` marker — not silently dropped.
- `pairs`: array of `{in: ts, out: ts, task: name, location: str}` for
  the detail sheet.

---

## 5. Client — Vue 3 SPA

### 5.1 Stack

Locked by the brief:
- Vue 3 + Pinia + vue-router + idb
- Capacitor 6 (matches tested baseline in the skill)
- Vite 5, Node 20+, JDK 17, Android SDK 34
- Leaflet + OpenStreetMap (no Google)
- vue-i18n (EN + AR bundles; `dir="rtl"` toggling)

Styling uses the tokens established in the visual direction doc —
consumed via CSS custom properties set by `fatehhr-theme-plugin`.

### 5.2 Directory shape

```
frontend/
  src/
    app/
      router.ts           # hash on native, base path on web (skill §3.7)
      platform.ts         # isNative() + API_BASE (skill §3.3)
      frappe.ts           # static imports for @capacitor/* (skill §3.4)
      i18n.ts             # EN + AR, dir toggling
    stores/
      session.ts          # auth state, api_secret, PIN gate
      sync.ts             # queue, drain engine, status
      attendance.ts       # today state + calendar cache
      tasks.ts            # tasks + running timer
      leave.ts            # balances + applications
      expense.ts          # drafts + claims
      payslip.ts          # list + cached PDFs
      announcement.ts     # feed + local read state
      notification.ts     # bell feed
      profile.ts          # employee profile
    offline/
      db.ts               # idb bootstrap; versioned migrations
      queue.ts            # saveItem, dedup, effectiveImages (skill §4.2)
      drain.ts            # drain engine (skill §4.5)
      photos.ts           # capturePhoto ONE uploader (skill §4.3)
      orphans.ts          # flagOrphans — marks with lastError (skill §4.6)
    api/
      client.ts           # request wrapper; absolute URLs on native (§4.8)
      auth.ts, checkin.ts, attendance.ts, leave.ts, expense.ts,
      payslip.ts, task.ts, announcement.ts, notification.ts
    components/
      SyncBar.vue
      BottomNav.vue
      TopAppBar.vue
      PhotoSlot.vue       # auto-clears when blob missing (§4.7)
      ListRow.vue, Card.vue, HeroCard.vue, Button.vue, Chip.vue,
      SegmentedControl.vue, DateRangePicker.vue, BottomSheet.vue,
      MapPreview.vue, AmountDisplay.vue, SkeletonBlock.vue, ...
    views/
      LoginView.vue, PinView.vue,
      DashboardView.vue,
      CheckinView.vue, CheckinHistoryView.vue,
      AttendanceCalendarView.vue,
      LeaveApplyView.vue, LeaveListView.vue,
      ExpenseClaimView.vue, ExpenseListView.vue,
      PayslipListView.vue, PayslipDetailView.vue,
      TaskListView.vue,
      AnnouncementListView.vue, AnnouncementDetailView.vue,
      ProfileView.vue, SettingsView.vue, SyncErrorsView.vue,
      NotificationView.vue
    main.ts
  vite.config.ts
  package.json
  capacitor.config.ts
android-capacitor/
  ...                     # Capacitor wrapper; keystore NOT in repo
```

### 5.3 Sync engine — applies skill §4 literally

No overrides. For each feature:

- **Online path is synchronous, direct to API** (skill §4.1).
- **Queue only for offline** (skill §4.1).
- **`saveItem` dedups** queue entries by logical key (e.g., one
  draft-claim id) and tracks `effectiveImages` (skill §4.2).
- **`capturePhoto` is ONE uploader** (skill §4.3). No fire-and-forget.
  Expense receipts and (optional) selfies both use this.
- **Drain engine never sends `client_modified`** on drain-time calls
  (skill §4.5). `isUnrecoverable` uses narrow regex (skill §4.5).
- **`flagOrphans` marks with `lastError` — never auto-deletes user
  work** (skill §4.6). Settings → "Discard pending" is the ONLY path
  that deletes queue entries, and it requires typed confirmation.
- **`PhotoSlot` auto-clears** when the referenced blob is missing
  (skill §4.7).
- **Absolute URLs on native** for stored `/files/...` (skill §4.8).

### 5.4 Queue item shape

```ts
type QueueEntry = {
  id: string;                // uuid
  logicalKey: string;        // e.g., "checkin:{draftId}" | "leave:{draftId}"
  kind: "checkin" | "leave" | "expense" | "task_timer_start"
      | "task_timer_stop" | "profile_update";
  payload: unknown;          // feature-specific
  effectiveImages: string[]; // photo ids needed by this op (skill §4.2)
  createdAt: string;         // ISO — NEVER sent as client_modified
  attempts: number;
  lastError?: {              // set by flagOrphans — never auto-cleared
    at: string;
    code: string;
    message: string;
  };
};
```

**Dedup + ordering rules:**
- Dedup collapses on `(kind, logicalKey)`. A newer entry with the
  same pair replaces the older one.
- Timer start + stop therefore MUST use distinct logicalKeys. Shape:
  `task_timer_start:{taskId}:{sessionId}` and
  `task_timer_stop:{taskId}:{sessionId}`. The drain engine guarantees
  `start` before `stop` for the same `sessionId` by processing the
  queue in insertion order and short-circuiting if a prerequisite has
  not yet drained.
- Change PIN is NOT queueable — it requires an online round-trip and
  fails cleanly if offline.

### 5.5 Auth flow

```
First launch (online):
  Email+Password → /auth/login → {api_key, api_secret, require_pin_setup: true}
  User sets 4–6 digit PIN → /auth/set_pin → stored server-side as hashed password
  Client persists {api_key, api_secret} in Capacitor SecureStorage / browser IndexedDB (encrypted where possible)

Subsequent launches:
  PIN entry → /auth/verify_pin → {api_key, api_secret}
  Server REUSES the existing api_secret — never regenerates (skill §3.5)
  5 wrong attempts → forces full credential re-login
  15 min inactivity → PIN re-prompt
  App resume from background → PIN re-prompt

Offline launch:
  No PIN verification against server → cached session hydrates
  PIN is validated against a cached hash (same algorithm server uses)
  App usable with last-known cached data
```

### 5.6 Offline behaviour by feature

| Feature         | Offline behaviour                                                   |
|-----------------|---------------------------------------------------------------------|
| Login/PIN       | Cached session + cached PIN hash; app usable read-only              |
| Dashboard       | Cached data, `SYNCED X AGO` bar                                     |
| Check-in/out    | Queued with captured timestamp + GPS + (optional) selfie blob        |
| Calendar        | Cached month; read-only when stale                                  |
| Leave apply     | Queued; row shown as "Pending sync" in My Leaves                    |
| Expense claim   | Queued; receipt photo via ONE uploader (§4.3)                       |
| Payslip         | Last 3 months' PDFs cached as blobs in IndexedDB                    |
| Tasks           | Timer state persisted locally; start/stop queued                    |
| Announcements   | Cached feed; read state always local                                |
| Profile edit    | Queued; server conflict → Sync Errors row                           |

---

## 6. Screens — per-module hit list

Companion doc (visual direction §8) covers compositions. This section
captures the **functional** behaviour of each screen for the plan.

### 6.1 Login (LoginView) + PIN (PinView)

- Locale toggle on login (EN/AR) sets `CUSTOMER_LOCALE` override stored
  locally.
- "Forgot PIN" on PinView → clears local api_secret, routes to Login.
- Biometric CTA stub is present but **disabled** in v1 (visual only).

### 6.2 Dashboard (DashboardView)

- Greeting strip.
- HeroCard "Today" — shows current IN state (task name if linked) and
  a primary Check-In/Check-Out action.
- Notification bell (top-right of TopAppBar) with unread dot — routes
  to NotificationView.
- Quick actions: Apply Leave / Add Expense / Start Timer (routes to
  tasks) / Announcements.
- Latest announcement card.
- Pull-to-refresh hits: today's state, leave balance, announcements,
  notification feed.

### 6.3 Check-in (CheckinView) + History (CheckinHistoryView)

- Default flow: pick task (or no-task generic check-in) → map preview
  + geocoded address → selfie (per `SELFIE_MODE`) → big Check-In
  button.
- Geofence status chip:
  - green "Within task radius" — `custom_geofence_status = inside`
  - amber "Outside task radius — will be flagged" — `outside`
  - neutral "No task radius set" — `disabled`
  - amber "Location unavailable" — `unknown`
- Offline: tap → queues a `checkin` op with captured ts + GPS +
  optional selfie blob; UI shows "Queued check-in" toast.
- History: filter by date range; infinite scroll pagination.

### 6.4 Attendance Calendar (AttendanceCalendarView)

- Month grid with state-coloured cells (visual direction §2.4).
- Tap a day → BottomSheet with:
  - `status` chip
  - `hours_worked`
  - Pair list: `HH:MM → HH:MM · task · location`
  - `open_pair_autoclosed` flag if present
- Month summary at bottom: Present / Absent / Leaves / Total hours.
- Swipe to navigate months.
- Arabic locale shows Hijri subscript under Gregorian day number.

### 6.5 Leave (LeaveApplyView, LeaveListView)

- Apply form: leave type (with live balance), date range, half-day
  toggle, reason, optional attachment.
- Balance widget updates as leave type changes.
- Submit: online → direct POST; offline → queued, row appears in
  LeaveListView with `Pending sync` chip.
- Cancel button on pending server-side leaves.

### 6.6 Expense (ExpenseClaimView, ExpenseListView)

- Multi-line form. Required receipt photo per line.
- Auto total.
- **Photo uploader is ONE uploader** — same code path as Damage PWA
  expense claims (skill §4.3). Photo id flows through `effectiveImages`
  to the online path; drain re-uses the same uploader, never re-uploads
  a server-known photo.
- List view shows chips: Draft / Submitted / Approved / Paid / Rejected.

### 6.7 Payslip (PayslipListView, PayslipDetailView)

- List: rows per month with status chip + net pay.
- Detail: earnings / deductions / tax / net pay cards; Download PDF
  (opens via Capacitor Filesystem on native or browser download on
  web), Share via Web Share API.
- PDF cache: when a payslip detail is viewed online, its PDF bytes are
  fetched once and stored in IndexedDB. Up to 3 most-recent slips
  retained (FIFO eviction).

### 6.8 Tasks & Timer (TaskListView)

- List grouped by project; priority dot + due chip + today's elapsed.
- Start button:
  - Online: POST `/task/start_timer` → opens Timesheet detail +
    Employee Checkin with `custom_task` linked.
  - Offline: queues `task_timer_start` with captured ts + GPS. Local
    state flips running immediately; UI shows "Pending sync".
- Stop button:
  - Online: POST `/task/stop_timer` → closes detail + creates paired
    checkout.
  - Offline: queues `task_timer_stop` with captured ts.
- Manual edit of logged hours before submitting the timesheet happens
  in a task-detail BottomSheet opened from the list row (not a
  separate route).
- Daily/weekly summary via segmented control on list header.

### 6.9 Announcements (AnnouncementListView, AnnouncementDetailView)

- List: pinned first, then reverse-chronological.
- Detail: Markdown body rendered client-side via a sanitiser
  (allowlist: `p, strong, em, ul, ol, li, a, h2, h3, code, pre, hr`).
- Read state local: on detail view, record
  `announcement_read_{user_id}_{name} = true` in IndexedDB. List shows
  unread styling based on local state.

### 6.10 Profile & Settings (ProfileView, SettingsView, SyncErrorsView)

- Profile: read-only info + editable Emergency Contact and Bank
  Details (masked display, unmask-on-edit gesture).
- Settings groups:
  - **Security** — Change PIN.
  - **Language** — EN / AR (toggles `dir` + font stack).
  - **Appearance** — Light / Dark / System.
  - **Sync** — Force sync button, Sync Errors link (badge with count),
    Discard pending (destructive; requires typing `DISCARD` to confirm).
  - **About** — Version (`NATIVE_VERSION` per skill §5 rule 15), build
    number, khatam hero mark.
  - **Logout** — destructive, full-width button at bottom.
- SyncErrorsView: list of queue entries with `lastError` set.
  Actions per row: Retry / View payload / Delete-this-one (typed
  confirm).

---

## 7. Error handling & edge cases

- **Token expiry / 401** during an online call → one silent retry with
  cached `api_secret`; if still 401, log user out with a toast
  ("Session expired. Please sign in.").
- **403** on a whitelisted endpoint → surface as "You don't have
  permission to do this." Don't swallow.
- **Network error** during online call → write the op to the queue
  with `attempts=1` and return the optimistic local state; sync bar
  flips to "Pending".
- **Server rejects a queued op** on drain → mark with `lastError`,
  leave in queue, surface in Sync Errors. NEVER auto-delete.
- **Blob missing** when a PhotoSlot mounts → clear the slot; show a
  "Re-attach photo" inline prompt (skill §4.7).
- **Geofence & GPS failure** → status = `unknown`; check-in still
  allowed; flagged server-side.
- **PIN lockout** — 5 failed attempts in PinView → clears local
  api_secret, forces full credential re-login.
- **Inactivity lock** — 15 minutes idle → PIN re-prompt on next
  interaction; pending queue **stays** (not discarded).
- **App version mismatch** with server API version → "Please update
  the app" blocker screen. Version surfaced from a tiny
  `/api/method/fatehhr.api.util.version_compat` probe on launch.

---

## 8. Testing strategy

v1 does not ship a full test suite — but each module carries:

### 8.1 Backend (Python)

- Unit tests for `fatehhr.api.auth` (PIN hashing, api_secret reuse,
  lockout counter).
- Unit tests for `fatehhr.api.attendance.month` (pair summation,
  open-pair auto-close).
- Unit tests for `checkin.create` geofence computation.
- Integration tests for `leave.apply` + `leave.cancel` wrapping HRMS
  workflow (mocks only at the transport boundary).

### 8.2 Frontend (Vitest + Vue Test Utils)

- Store-level tests for the sync queue (`saveItem`, dedup,
  `effectiveImages`) — mirrors Damage PWA's existing suite.
- Component test for PhotoSlot auto-clear behaviour (skill §4.7).
- Snapshot tests for locale switching (EN/AR) on key screens.

### 8.3 E2E / rollout (manual, on device)

The brief's **§12 verification gates** are the ship gates. The plan
will enumerate each as a dedicated verification task with a tester
checklist. No gate may be skipped to call v1 done.

---

## 9. Observability

- Server: Frappe Error Log is source of truth (skill §6 forensic loop).
- Client: a lightweight `fatehhr.api.util.report_client_error`
  endpoint captures `{op_kind, logicalKey, message, stack}` for queue
  drain failures so we can diagnose offline → online edge cases
  without waiting for user complaints.
- Client: sync bar state and queue counts are logged to the in-app
  Sync Errors view — no external telemetry service in v1.

---

## 10. Branching, repo, and deployment

- Repo: `github.com/EnfonoTech/fatehhr`
- Long-lived branches: `develop` (default), `main` (tagged releases).
- Server deploy via the `enfono-servers` + `server-manager` skills —
  `bench get-app` on `develop`, `bench migrate`, `bench restart`.
- APK signed with a **newly generated** keystore (skill §5 rule 17),
  backed up to two locations before v1.0.0.
- `versionCode` and `NATIVE_VERSION` bump every build (skill §5
  rule 15).

---

## 11. Known risks

1. **OSM Nominatim rate limits.** Mitigation: server-side proxy with
   Redis cache keyed on rounded coords (5-decimal places). Fall back
   to "Location unavailable" silently.
2. **`api_secret` leakage** via device compromise. Mitigation: store
   in Capacitor SecureStorage on native; in browser, only in memory +
   HttpOnly cookies where possible; PIN lockout reduces blast radius.
3. **Timesheet workflow collision.** Users might edit a timesheet on
   the desk while the app has a running timer. Mitigation: on task
   detail open, check server-side state before letting the user edit;
   show "Timer running elsewhere" banner if a conflicting open
   detail exists.
4. **Payslip PDF size bloat** in IndexedDB. Mitigation: FIFO eviction
   at 3 slips; hard cap 5 MB per blob, refuse cache above.
5. **RTL regressions.** Mitigation: visual regression snapshot tests
   per major screen in AR locale; explicit "do-not-mirror" list in
   the i18n spec (clocks, media controls, map pins, checkmarks).
6. **Fresh site blindspot.** `fatehhr_dev` has no real employees / no
   real manager tree on day 1. Mitigation: seed script committed to
   `fatehhr/fixtures/seed_demo.py` that creates 2 employees + 2 tasks
   + 1 leave type assignment, run-once for developer bring-up.

---

## 12. Brainstorm decisions log (locked)

| # | Question                                                | Decision |
|---|---------------------------------------------------------|----------|
| 1 | Task-timer ⇄ checkin linkage                            | A + semantic: task/site-wise check-in/out pairs; daily hours = sum of pair durations |
| 2 | Geofencing hard-block?                                  | B — soft; record + flag; coords+radius on **Task** |
| 3 | Push notifications in v1?                               | B — deferred to v1.1; v1 uses in-app notification bell backed by ERPNext Notification Log |
| 4 | Selfie on check-in                                      | D — admin-configurable: `CUSTOMER_SELFIE_MODE = off \| first \| every` |
| 5 | Leave Approvals in v1?                                  | B — deferred to v1.1; managers use ERPNext desk |
| 6 | Announcements richness                                  | B — Markdown body, no image, local read state, all-hands only |

---

## 13. Deliverables gate

v1.0.0 ships only when ALL of the following are true:

1. `fatehhr` app on the server, committed on `develop`, pushed to
   `github.com/EnfonoTech/fatehhr`.
2. Fresh site `fatehhr_dev` created with `erpnext` + `hrms` + `fatehhr`
   installed; `ensure_capacitor_cors` runs clean.
3. Signed release APK at `android-capacitor/fatehhr-v1.0.0.apk`.
4. Keystore generated fresh and backed up to two locations.
5. `docs/LESSONS_LEARNED.md` points to `frappe-vue-pwa` skill.
6. Per-customer env switch demonstrably produces a build with
   different branding without code changes.
7. Rollout verification run on the user's test phone; every brief §12
   verification gate passed.
8. `design-review` skill pass on: dashboard, attendance calendar,
   check-in, leave application, expense claim with photo, payslip
   view, task timer, announcements. No blocker issues.

---

## 14. What comes next

After you approve this spec, I'll invoke `superpowers:writing-plans`
to produce a step-by-step implementation plan at
`docs/superpowers/plans/2026-04-18-fatehhr-v1.md`. The plan will
enumerate tasks small enough to verify one at a time, grouped into
phases that line up with the feature columns above.
