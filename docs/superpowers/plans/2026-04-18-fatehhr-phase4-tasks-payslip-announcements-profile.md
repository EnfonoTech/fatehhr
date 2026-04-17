# Fateh HR — Phase 4: Tasks & Timer + Payslip + Announcements + Notifications + Profile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill in the remaining six modules so every v1 feature is functional: (1) Tasks & Timer with paired Employee Checkin + Timesheet writes; (2) Payslip list + detail + PDF download + 3-month offline cache; (3) Announcements (Markdown body, local read state); (4) in-app Notification bell wrapping the ERPNext Notification Log; (5) Profile & Settings (view + edit emergency contact + bank, change PIN, language toggle, dark mode, force sync, discard pending, version, logout); (6) the full-fat Dashboard that ties it all together. Brief §12 verification gates rows 6–8 and 11–14 pass.

**Architecture:** Backend adds the `HR Announcement` DocType, `fatehhr.api.task.*` (start/stop timer that creates both a `Timesheet Detail` and a paired `Employee Checkin` with `custom_task` linked), `fatehhr.api.payslip.*` (list + PDF bytes), `fatehhr.api.announcement.feed`, `fatehhr.api.notifications.*` (read/mark), and `fatehhr.api.me.update_profile`. Frontend adds a start/stop timer processor pair (with ordered drain: `task_timer_start` before `task_timer_stop` for the same session id), a payslip PDF IndexedDB cache with FIFO eviction at 3 entries, a Markdown renderer with a strict tag allowlist, a local-only announcement-read store, and a full Dashboard.

**Tech Stack:** `micromark` for Markdown rendering with sanitization; `@capacitor/filesystem` for writing payslip PDFs on native; everything else reused from earlier phases.

**Companion docs:**
- Visual direction: [`docs/superpowers/specs/2026-04-17-fatehhr-visual-direction.md`](../specs/2026-04-17-fatehhr-visual-direction.md)
- v1 design spec: [`docs/superpowers/specs/2026-04-18-fatehhr-v1-design.md`](../specs/2026-04-18-fatehhr-v1-design.md)
- Previous phases: [Phase 1](./2026-04-18-fatehhr-phase1-foundation.md), [Phase 2](./2026-04-18-fatehhr-phase2-offline-checkin.md), [Phase 3](./2026-04-18-fatehhr-phase3-attendance-leave-expense.md)

---

## File structure added in Phase 4

```
apps/fatehhr/fatehhr/
  doctype/
    hr_announcement/
      __init__.py
      hr_announcement.json
      hr_announcement.py
  api/
    task.py
    payslip.py
    announcement.py
    notifications.py
    me.py                    # modified: adds update_profile
  tests/
    test_task_timer.py
    test_payslip.py
    test_announcement.py
    test_notifications.py
    test_me_update.py

frontend/
  src/
    offline/
      processors/
        task-timer.ts        # start + stop processors with ordered drain
        profile.ts           # modified: real impl
    stores/
      tasks.ts
      payslip.ts
      announcement.ts
      notification.ts
      profile.ts
    api/
      task.ts
      payslip.ts
      announcement.ts
      notifications.ts
      me.ts                  # modified: add update_profile
    components/
      HeroCard.vue
      QuickActionGrid.vue
      NotificationBell.vue
      Markdown.vue
    views/
      DashboardView.vue      # REPLACED (full version)
      TaskListView.vue
      PayslipListView.vue
      PayslipDetailView.vue
      AnnouncementListView.vue
      AnnouncementDetailView.vue
      NotificationView.vue
      ProfileView.vue
      SettingsView.vue
  tests/
    unit/
      task-timer-ordering.spec.ts
      announcement-read.spec.ts
      payslip-cache.spec.ts
      markdown.spec.ts
```

---

## Tasks

### Task 1: New DocType `HR Announcement`

**Files:**
- Create: `apps/fatehhr/fatehhr/doctype/hr_announcement/hr_announcement.json`
- Create: `apps/fatehhr/fatehhr/doctype/hr_announcement/hr_announcement.py`
- Create: `apps/fatehhr/fatehhr/doctype/hr_announcement/__init__.py` (empty)
- Modify: `apps/fatehhr/fatehhr/modules.txt` (ensure `Fatehhr` is listed)
- Create: `apps/fatehhr/fatehhr/tests/test_announcement.py`

- [ ] **Step 1: Write failing test**

```python
import frappe, unittest
from fatehhr.tests.test_auth import _make_user, TEST_PASSWORD


class TestAnnouncementDoctype(unittest.TestCase):
    def test_doctype_has_expected_fields(self):
        meta = frappe.get_meta("HR Announcement")
        for f in ("title", "body", "pinned", "published_on"):
            self.assertIsNotNone(meta.get_field(f), f"missing HR Announcement.{f}")
        self.assertEqual(meta.get_field("body").fieldtype, "Long Text")
        self.assertEqual(meta.get_field("pinned").fieldtype, "Check")

    def test_feed_returns_pinned_first(self):
        from fatehhr.api.announcement import feed
        # create two anns — one pinned
        a1 = frappe.get_doc({
            "doctype": "HR Announcement", "title": "regular",
            "body": "hello", "pinned": 0, "published_on": "2026-03-01 09:00",
        }).insert(ignore_permissions=True)
        a2 = frappe.get_doc({
            "doctype": "HR Announcement", "title": "pinned one",
            "body": "im **pinned**", "pinned": 1, "published_on": "2026-02-01 09:00",
        }).insert(ignore_permissions=True)
        frappe.db.commit()
        rows = feed()
        names = [r["name"] for r in rows]
        # pinned first even though its published_on is older
        self.assertEqual(names.index(a2.name) < names.index(a1.name), True)
```

- [ ] **Step 2: Write DocType JSON**

`apps/fatehhr/fatehhr/doctype/hr_announcement/hr_announcement.json`:

```json
{
  "doctype": "DocType",
  "name": "HR Announcement",
  "module": "Fatehhr",
  "custom": 0,
  "engine": "InnoDB",
  "naming_rule": "By fieldname",
  "autoname": "format:ANN-{YYYY}-{#####}",
  "title_field": "title",
  "is_submittable": 0,
  "track_changes": 1,
  "fields": [
    { "fieldname": "title", "label": "Title", "fieldtype": "Data", "reqd": 1, "in_list_view": 1, "in_global_search": 1 },
    { "fieldname": "pinned", "label": "Pinned", "fieldtype": "Check", "default": "0", "in_list_view": 1 },
    { "fieldname": "published_on", "label": "Published On", "fieldtype": "Datetime", "reqd": 1, "default": "Now", "in_list_view": 1 },
    { "fieldname": "body", "label": "Body (Markdown)", "fieldtype": "Long Text", "reqd": 1 },
    { "fieldname": "published_by", "label": "Published By", "fieldtype": "Link", "options": "User", "read_only": 1 }
  ],
  "permissions": [
    { "role": "HR Manager", "read": 1, "write": 1, "create": 1, "delete": 1, "report": 1, "export": 1, "share": 1, "email": 1, "print": 1 },
    { "role": "HR User",    "read": 1, "write": 1, "create": 1, "report": 1, "export": 1, "share": 1, "email": 1, "print": 1 },
    { "role": "Employee",   "read": 1 }
  ],
  "sort_field": "published_on",
  "sort_order": "DESC"
}
```

- [ ] **Step 3: Python controller**

```python
import frappe
from frappe.model.document import Document


class HRAnnouncement(Document):
    def before_insert(self):
        if not self.published_by:
            self.published_by = frappe.session.user
```

- [ ] **Step 4: Migrate**

```bash
bench --site fatehhr_dev migrate
```

- [ ] **Step 5: Commit (test will pass after Task 2 implements `feed`)**

```bash
git add fatehhr/doctype/hr_announcement/ fatehhr/tests/test_announcement.py
git commit -m "feat(doctype): HR Announcement with pinned + markdown body"
```

---

### Task 2: `fatehhr.api.announcement.feed` + `fatehhr.api.notifications.feed` + `mark_read`

**Files:**
- Create: `apps/fatehhr/fatehhr/api/announcement.py`
- Create: `apps/fatehhr/fatehhr/api/notifications.py`
- Create: `apps/fatehhr/fatehhr/tests/test_notifications.py`

- [ ] **Step 1: Write failing notifications test**

```python
import frappe, unittest
from fatehhr.tests.test_auth import _make_user


class TestNotifications(unittest.TestCase):
    def setUp(self):
        self.user = _make_user("notif-test@example.com")
        frappe.get_doc({
            "doctype": "Notification Log", "for_user": self.user.email,
            "type": "Alert", "subject": "pay day!", "email_content": "cash",
            "document_type": "Salary Slip", "document_name": "",
        }).insert(ignore_permissions=True)
        frappe.db.commit()
        frappe.set_user(self.user.email)

    def tearDown(self): frappe.set_user("Administrator")

    def test_feed_returns_my_logs(self):
        from fatehhr.api.notifications import feed
        rows = feed()
        self.assertTrue(any("pay day" in r["subject"] for r in rows))

    def test_mark_read_flips_flag(self):
        from fatehhr.api.notifications import feed, mark_read
        rows = feed()
        row = next(r for r in rows if "pay day" in r["subject"])
        mark_read(name=row["name"])
        self.assertTrue(frappe.db.get_value("Notification Log", row["name"], "read"))
```

- [ ] **Step 2: Implement `announcement.py`**

```python
import frappe


@frappe.whitelist()
def feed(limit: int = 50) -> list[dict]:
    return frappe.get_all(
        "HR Announcement",
        fields=["name", "title", "body", "pinned", "published_on", "published_by"],
        order_by="pinned desc, published_on desc",
        limit=int(limit),
    )
```

- [ ] **Step 3: Implement `notifications.py`**

```python
import frappe


@frappe.whitelist()
def feed(limit: int = 50) -> list[dict]:
    user = frappe.session.user
    return frappe.get_all(
        "Notification Log",
        filters={"for_user": user},
        fields=["name", "subject", "email_content", "type",
                "document_type", "document_name", "read", "creation"],
        order_by="creation desc",
        limit=int(limit),
    )


@frappe.whitelist()
def unread_count() -> int:
    return frappe.db.count("Notification Log",
        {"for_user": frappe.session.user, "read": 0})


@frappe.whitelist()
def mark_read(name: str) -> dict:
    doc = frappe.get_doc("Notification Log", name)
    if doc.for_user != frappe.session.user:
        frappe.throw(frappe._("Not yours."), frappe.PermissionError)
    doc.read = 1
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"name": name, "read": 1}
```

- [ ] **Step 4: Tests pass**

```bash
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_announcement
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_notifications
```

- [ ] **Step 5: Commit**

```bash
git add fatehhr/api/announcement.py fatehhr/api/notifications.py fatehhr/tests/test_notifications.py
git commit -m "feat(api): announcement.feed + notifications feed/unread_count/mark_read"
git push
```

---

### Task 3: `fatehhr.api.task.*` — list_mine + start_timer + stop_timer

**Files:**
- Create: `apps/fatehhr/fatehhr/api/task.py`
- Create: `apps/fatehhr/fatehhr/tests/test_task_timer.py`

- [ ] **Step 1: Write failing tests**

```python
import frappe, unittest
from frappe.utils import now_datetime, add_to_date

from fatehhr.tests.test_auth import _make_user
from fatehhr.tests.test_checkin import _ensure_employee, _ensure_task_with_geofence


class TestTaskTimer(unittest.TestCase):
    def setUp(self):
        self.user = _make_user("task-test@example.com")
        self.employee = _ensure_employee(self.user.email)
        self.task = _ensure_task_with_geofence()
        frappe.set_user(self.user.email)

    def tearDown(self): frappe.set_user("Administrator")

    def test_start_stop_creates_timesheet_detail_and_checkin_pair(self):
        from fatehhr.api.task import start_timer, stop_timer
        r1 = start_timer(task=self.task, latitude=24.7136, longitude=46.6753)
        self.assertIn("session_id", r1)
        self.assertIn("checkin_name", r1)
        r2 = stop_timer(session_id=r1["session_id"], latitude=24.7136, longitude=46.6753)
        self.assertIn("checkin_out_name", r2)
        self.assertIn("timesheet", r2)
        # IN + OUT pair recorded
        ins = frappe.db.count("Employee Checkin", {"employee": self.employee, "log_type": "IN", "custom_task": self.task})
        outs = frappe.db.count("Employee Checkin", {"employee": self.employee, "log_type": "OUT", "custom_task": self.task})
        self.assertGreaterEqual(ins, 1)
        self.assertGreaterEqual(outs, 1)
```

- [ ] **Step 2: Implement `task.py`**

```python
import frappe
from frappe.utils import now_datetime, get_datetime
from datetime import timedelta

from fatehhr.utils.geofence import classify


@frappe.whitelist()
def list_mine(limit: int = 100) -> list[dict]:
    employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if not employee:
        return []
    # Tasks assigned to the user via ToDo
    todos = frappe.get_all("ToDo",
        filters={"allocated_to": frappe.session.user, "reference_type": "Task", "status": "Open"},
        fields=["reference_name"], limit=int(limit))
    names = [t.reference_name for t in todos] or ["__none__"]
    rows = frappe.get_all("Task",
        filters={"name": ["in", names]},
        fields=["name", "subject", "project", "status", "priority", "exp_end_date",
                "custom_latitude", "custom_longitude", "custom_geofence_radius_m"],
        order_by="exp_end_date asc",
    )
    return rows


@frappe.whitelist()
def start_timer(task: str, latitude: float | None = None, longitude: float | None = None,
                address: str | None = None, timestamp: str | None = None) -> dict:
    """Create an open Timesheet detail AND a paired Employee Checkin (IN)."""
    employee = _my_employee()
    ts = get_datetime(timestamp) if timestamp else now_datetime()

    t_lat, t_lng, t_rad = frappe.db.get_value(
        "Task", task, ["custom_latitude", "custom_longitude", "custom_geofence_radius_m"]) or (None, None, None)
    gf = classify(_f(t_lat), _f(t_lng), _i(t_rad), _f(latitude), _f(longitude))

    checkin = frappe.get_doc({
        "doctype": "Employee Checkin", "employee": employee, "log_type": "IN",
        "time": ts, "custom_latitude": _f(latitude), "custom_longitude": _f(longitude),
        "custom_location_address": address, "custom_task": task,
        "custom_geofence_status": gf,
    }).insert()

    ts_doc = _get_or_create_open_timesheet(employee)
    ts_doc.append("time_logs", {
        "activity_type": _default_activity_type(),
        "task": task, "from_time": ts, "hours": 0,
    })
    ts_doc.save()
    frappe.db.commit()

    return {
        "session_id": f"{ts_doc.name}:{len(ts_doc.time_logs)-1}",
        "checkin_name": checkin.name,
        "timesheet": ts_doc.name,
        "custom_geofence_status": gf,
    }


@frappe.whitelist()
def stop_timer(session_id: str, latitude: float | None = None, longitude: float | None = None,
               address: str | None = None, timestamp: str | None = None) -> dict:
    employee = _my_employee()
    ts_name, row_idx_str = session_id.rsplit(":", 1)
    row_idx = int(row_idx_str)
    ts_doc = frappe.get_doc("Timesheet", ts_name)
    row = ts_doc.time_logs[row_idx]
    end_ts = get_datetime(timestamp) if timestamp else now_datetime()
    row.to_time = end_ts
    row.hours = max(0, (end_ts - get_datetime(row.from_time)).total_seconds() / 3600.0)
    ts_doc.save()

    checkin_out = frappe.get_doc({
        "doctype": "Employee Checkin", "employee": employee, "log_type": "OUT",
        "time": end_ts, "custom_latitude": _f(latitude), "custom_longitude": _f(longitude),
        "custom_location_address": address, "custom_task": row.task,
        "custom_geofence_status": "disabled",
    }).insert()
    frappe.db.commit()
    return {
        "session_id": session_id,
        "checkin_out_name": checkin_out.name,
        "timesheet": ts_doc.name,
        "hours": row.hours,
    }


def _my_employee():
    n = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if not n: frappe.throw(frappe._("No Employee linked."))
    return n


def _get_or_create_open_timesheet(employee):
    from frappe.utils import today
    name = frappe.db.get_value("Timesheet",
        {"employee": employee, "start_date": today(), "status": "Draft"}, "name")
    if name: return frappe.get_doc("Timesheet", name)
    return frappe.get_doc({
        "doctype": "Timesheet", "employee": employee,
        "start_date": today(),
    }).insert()


def _default_activity_type() -> str:
    row = frappe.db.get_value("Activity Type", {"disabled": 0}, "name")
    if row: return row
    frappe.get_doc({"doctype": "Activity Type", "activity_type": "Work-FHR"}
                   ).insert(ignore_permissions=True)
    return "Work-FHR"


def _f(v):
    try: return None if v in (None, "") else float(v)
    except Exception: return None


def _i(v):
    try: return None if v in (None, "") else int(v)
    except Exception: return None
```

- [ ] **Step 3: Run — pass**

- [ ] **Step 4: Commit**

```bash
git add fatehhr/api/task.py fatehhr/tests/test_task_timer.py
git commit -m "feat(api): task.list_mine + start_timer + stop_timer with paired checkin"
git push
```

---

### Task 4: `fatehhr.api.payslip.*` — list_mine + pdf

**Files:**
- Create: `apps/fatehhr/fatehhr/api/payslip.py`
- Create: `apps/fatehhr/fatehhr/tests/test_payslip.py`

- [ ] **Step 1: Write failing test**

```python
import frappe, unittest
from fatehhr.tests.test_auth import _make_user
from fatehhr.tests.test_checkin import _ensure_employee


class TestPayslip(unittest.TestCase):
    def setUp(self):
        self.user = _make_user("pay-test@example.com")
        self.employee = _ensure_employee(self.user.email)
        frappe.set_user(self.user.email)

    def tearDown(self): frappe.set_user("Administrator")

    def test_list_mine_empty_is_list(self):
        from fatehhr.api.payslip import list_mine
        self.assertIsInstance(list_mine(), list)
```

- [ ] **Step 2: Implement `payslip.py`**

```python
import frappe
from frappe.utils.print_format import download_pdf


@frappe.whitelist()
def list_mine(limit: int = 24) -> list[dict]:
    employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if not employee:
        return []
    return frappe.get_all(
        "Salary Slip",
        filters={"employee": employee, "docstatus": 1},
        fields=["name", "start_date", "end_date", "posting_date",
                "gross_pay", "total_deduction", "net_pay", "currency", "status"],
        order_by="end_date desc", limit=int(limit),
    )


@frappe.whitelist()
def detail(name: str) -> dict:
    employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    doc = frappe.get_doc("Salary Slip", name)
    if doc.employee != employee:
        frappe.throw(frappe._("Not your slip."), frappe.PermissionError)
    return {
        "name": doc.name, "posting_date": doc.posting_date,
        "start_date": doc.start_date, "end_date": doc.end_date,
        "gross_pay": doc.gross_pay, "net_pay": doc.net_pay,
        "total_deduction": doc.total_deduction,
        "currency": doc.currency,
        "earnings": [{"name": e.salary_component, "amount": e.amount} for e in doc.earnings],
        "deductions": [{"name": d.salary_component, "amount": d.amount} for d in doc.deductions],
    }


@frappe.whitelist()
def pdf(name: str) -> None:
    """Streams the PDF bytes in the HTTP response."""
    employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    doc = frappe.get_doc("Salary Slip", name)
    if doc.employee != employee:
        frappe.throw(frappe._("Not your slip."), frappe.PermissionError)
    download_pdf("Salary Slip", name, format=None)
```

- [ ] **Step 3: Commit**

```bash
git add fatehhr/api/payslip.py fatehhr/tests/test_payslip.py
git commit -m "feat(api): payslip.list_mine + detail + pdf"
git push
```

---

### Task 5: `fatehhr.api.me.update_profile`

**Files:**
- Modify: `apps/fatehhr/fatehhr/api/me.py`
- Create: `apps/fatehhr/fatehhr/tests/test_me_update.py`

- [ ] **Step 1: Write failing test**

```python
import frappe, unittest
from fatehhr.tests.test_auth import _make_user
from fatehhr.tests.test_checkin import _ensure_employee


class TestMeUpdate(unittest.TestCase):
    def setUp(self):
        self.user = _make_user("profile-test@example.com")
        self.employee = _ensure_employee(self.user.email)
        frappe.set_user(self.user.email)

    def tearDown(self): frappe.set_user("Administrator")

    def test_update_emergency_and_bank(self):
        from fatehhr.api.me import update_profile
        update_profile(emergency_phone_number="+966500000000",
                       bank_name="Al Rajhi", bank_ac_no="123456")
        e = frappe.get_doc("Employee", self.employee)
        self.assertEqual(e.emergency_phone_number, "+966500000000")
        self.assertEqual(e.bank_name, "Al Rajhi")
        self.assertEqual(e.bank_ac_no, "123456")

    def test_update_ignores_disallowed_fields(self):
        from fatehhr.api.me import update_profile
        before_salary = frappe.db.get_value("Employee", self.employee, "ctc")
        update_profile(ctc=999999)  # should be ignored
        after_salary = frappe.db.get_value("Employee", self.employee, "ctc")
        self.assertEqual(before_salary, after_salary)
```

- [ ] **Step 2: Implement — append to `me.py`**

```python
ALLOWED_UPDATE_FIELDS = (
    "emergency_phone_number",
    "person_to_be_contacted",
    "relation",
    "bank_name",
    "bank_ac_no",
    "iban",
)


@frappe.whitelist()
def update_profile(**kwargs) -> dict:
    user = frappe.session.user
    employee_name = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not employee_name:
        frappe.throw(frappe._("No Employee linked."))
    emp = frappe.get_doc("Employee", employee_name)
    applied = {}
    for f in ALLOWED_UPDATE_FIELDS:
        if f in kwargs and kwargs[f] is not None:
            setattr(emp, f, kwargs[f])
            applied[f] = kwargs[f]
    emp.flags.ignore_permissions = False
    emp.save()
    frappe.db.commit()
    return {"applied": applied}
```

- [ ] **Step 3: Run — pass; Commit**

```bash
git add fatehhr/api/me.py fatehhr/tests/test_me_update.py
git commit -m "feat(api): me.update_profile with field allowlist"
git push
```

---

### Task 6: Frontend — api client modules for Phase 4

**Files:**
- Create: `frontend/src/api/task.ts`
- Create: `frontend/src/api/payslip.ts`
- Create: `frontend/src/api/announcement.ts`
- Create: `frontend/src/api/notifications.ts`
- Modify: `frontend/src/api/me.ts`

- [ ] **Step 1: `api/task.ts`**

```typescript
import { apiCall } from "./client";

export interface TaskRow {
  name: string; subject: string; project: string | null;
  status: string; priority: string; exp_end_date: string | null;
  custom_latitude: number | null; custom_longitude: number | null;
  custom_geofence_radius_m: number | null;
}

export const taskApi = {
  list_mine: () => apiCall<TaskRow[]>("GET", "fatehhr.api.task.list_mine"),
  start_timer: (p: { task: string; latitude: number | null; longitude: number | null; address: string | null; timestamp: string }) =>
    apiCall<{ session_id: string; checkin_name: string; timesheet: string; custom_geofence_status: string }>(
      "POST", "fatehhr.api.task.start_timer", p),
  stop_timer: (p: { session_id: string; latitude: number | null; longitude: number | null; address: string | null; timestamp: string }) =>
    apiCall<{ session_id: string; checkin_out_name: string; timesheet: string; hours: number }>(
      "POST", "fatehhr.api.task.stop_timer", p),
};
```

- [ ] **Step 2: `api/payslip.ts`**

```typescript
import { apiCall } from "./client";
import { API_BASE } from "@/app/platform";
import { useSessionStore } from "@/stores/session";

export interface PayslipRow {
  name: string; start_date: string; end_date: string;
  posting_date: string; gross_pay: number; total_deduction: number;
  net_pay: number; currency: string; status: string;
}
export interface PayslipDetail {
  name: string; posting_date: string;
  start_date: string; end_date: string;
  gross_pay: number; net_pay: number; total_deduction: number; currency: string;
  earnings: { name: string; amount: number }[];
  deductions: { name: string; amount: number }[];
}

export const payslipApi = {
  list_mine: () => apiCall<PayslipRow[]>("GET", "fatehhr.api.payslip.list_mine"),
  detail: (name: string) => apiCall<PayslipDetail>("POST", "fatehhr.api.payslip.detail", { name }),
  async pdfBlob(name: string): Promise<Blob> {
    const s = useSessionStore();
    const r = await fetch(
      `${API_BASE()}/api/method/fatehhr.api.payslip.pdf?name=${encodeURIComponent(name)}`,
      {
        headers: s.apiKey && s.apiSecret
          ? { Authorization: `token ${s.apiKey}:${s.apiSecret}` } : {},
        credentials: API_BASE() ? "omit" : "include",
      },
    );
    if (!r.ok) throw new Error(`payslip pdf ${r.status}`);
    return await r.blob();
  },
};
```

- [ ] **Step 3: `api/announcement.ts`**

```typescript
import { apiCall } from "./client";

export interface AnnouncementRow {
  name: string; title: string; body: string;
  pinned: 0 | 1; published_on: string; published_by: string;
}

export const announcementApi = {
  feed: () => apiCall<AnnouncementRow[]>("GET", "fatehhr.api.announcement.feed"),
};
```

- [ ] **Step 4: `api/notifications.ts`**

```typescript
import { apiCall } from "./client";

export interface NotificationRow {
  name: string; subject: string; email_content: string; type: string;
  document_type: string | null; document_name: string | null;
  read: 0 | 1; creation: string;
}

export const notificationsApi = {
  feed: () => apiCall<NotificationRow[]>("GET", "fatehhr.api.notifications.feed"),
  unreadCount: () => apiCall<number>("GET", "fatehhr.api.notifications.unread_count"),
  markRead: (name: string) => apiCall<{ name: string; read: 1 }>(
    "POST", "fatehhr.api.notifications.mark_read", { name }),
};
```

- [ ] **Step 5: Extend `api/me.ts`**

```typescript
import { apiCall } from "./client";

export interface Profile {
  user: string; full_name: string; employee: string | null;
  designation: string | null; department: string | null;
  employee_id?: string; photo?: string | null;
  emergency_phone_number?: string; person_to_be_contacted?: string;
  relation?: string;
  bank_name?: string; bank_ac_no?: string; iban?: string;
}

export const meApi = {
  profile: () => apiCall<Profile>("GET", "fatehhr.api.me.profile"),
  updateProfile: (patch: Partial<Profile>) =>
    apiCall<{ applied: Partial<Profile> }>("POST", "fatehhr.api.me.update_profile", patch),
};
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/
git commit -m "feat(api): Phase 4 client modules (task, payslip, announcement, notifications, me)"
```

---

### Task 7: Markdown renderer component with allowlist

**Files:**
- Create: `frontend/src/components/Markdown.vue`
- Create: `frontend/tests/unit/markdown.spec.ts`

- [ ] **Step 1: Install micromark**

```bash
cd frontend && pnpm add micromark
```

- [ ] **Step 2: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import Markdown from "@/components/Markdown.vue";

describe("Markdown", () => {
  it("renders allowed tags", () => {
    const w = mount(Markdown, { props: { source: "**hi** and _there_\n\n- a\n- b" } });
    expect(w.html()).toContain("<strong>hi</strong>");
    expect(w.html()).toContain("<em>there</em>");
    expect(w.html()).toContain("<li>a</li>");
  });

  it("strips disallowed tags", () => {
    const w = mount(Markdown, { props: { source: "<script>alert(1)</script><img src=x onerror=y>" } });
    expect(w.html()).not.toContain("<script");
    expect(w.html()).not.toContain("<img");
  });
});
```

- [ ] **Step 3: Implement**

```vue
<script setup lang="ts">
import { computed } from "vue";
import { micromark } from "micromark";

const props = defineProps<{ source: string }>();

// Minimal allowlist sanitizer — micromark's HTML is well-formed; strip
// unknown tags/attrs. For v1 we accept only: p, strong, em, ul, ol, li,
// a[href], h2, h3, code, pre, hr, blockquote, br.
const ALLOWED_TAGS = /^(p|strong|em|ul|ol|li|a|h2|h3|code|pre|hr|blockquote|br)$/i;
const ALLOWED_ATTR: Record<string, RegExp> = { a: /^href$/i };

function sanitize(raw: string): string {
  if (typeof document === "undefined") return raw;
  const doc = new DOMParser().parseFromString(`<div>${raw}</div>`, "text/html");
  const root = doc.body.firstElementChild as HTMLElement;
  walk(root);
  return root.innerHTML;
}

function walk(el: Element) {
  [...el.children].forEach((c) => walk(c));
  [...el.children].forEach((c) => {
    if (!ALLOWED_TAGS.test(c.tagName)) {
      c.replaceWith(...Array.from(c.childNodes));
      return;
    }
    const allowed = ALLOWED_ATTR[c.tagName.toLowerCase()];
    [...c.attributes].forEach((a) => {
      const keep = allowed && allowed.test(a.name) && !/^javascript:/i.test(a.value);
      if (!keep) c.removeAttribute(a.name);
    });
    if (c.tagName.toLowerCase() === "a") c.setAttribute("rel", "noopener noreferrer");
  });
}

const html = computed(() => sanitize(micromark(props.source || "")));
</script>

<template><div class="md" v-html="html" /></template>

<style scoped>
.md :deep(p) { margin: 0 0 12px; }
.md :deep(ul), .md :deep(ol) { margin: 0 0 12px 20px; }
.md :deep(h2) { font-family: var(--font-display); font-weight: 400; font-size: 22px; margin: 16px 0 8px; }
.md :deep(h3) { font-family: var(--font-display); font-weight: 400; font-size: 18px; margin: 14px 0 6px; }
.md :deep(code) { font-family: var(--font-mono); background: var(--bg-sunk); padding: 0 4px; border-radius: 4px; }
.md :deep(pre) { background: var(--bg-sunk); padding: 10px; border-radius: var(--r-md); overflow: auto; }
.md :deep(a) { color: var(--accent); text-decoration: underline; }
</style>
```

- [ ] **Step 4: Run — pass; Commit**

```bash
git add frontend/src/components/Markdown.vue frontend/tests/unit/markdown.spec.ts frontend/package.json
git commit -m "feat(frontend): Markdown component with strict sanitization allowlist"
```

---

### Task 8: Task timer processors with ordered drain

**Files:**
- Create: `frontend/src/offline/processors/task-timer.ts`
- Create: `frontend/tests/unit/task-timer-ordering.spec.ts`
- Modify: `frontend/src/offline/drain.ts` (add prerequisite support)

- [ ] **Step 1: Write failing test**

```typescript
import "fake-indexeddb/auto";
import "@/offline/processors/task-timer";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetDb } from "@/offline/db";
import { saveItem, listPending } from "@/offline/queue";
import { drain } from "@/offline/drain";

describe("task-timer ordering", () => {
  beforeEach(async () => await resetDb());

  it("runs start before stop for the same sessionId", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("start_timer")) {
        calls.push("start");
        return new Response(JSON.stringify({ message: { session_id: "TS-001:0", checkin_name: "EC-1", timesheet: "TS-001", custom_geofence_status: "disabled" } }),
          { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("stop_timer")) {
        calls.push("stop");
        return new Response(JSON.stringify({ message: { session_id: "TS-001:0", checkin_out_name: "EC-2", timesheet: "TS-001", hours: 0.5 } }),
          { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error("unexpected: " + url);
    });
    vi.stubGlobal("fetch", fetchMock);

    const sessionId = "sess-123";
    // Insert STOP first (reverse order) to prove prerequisite logic works
    await saveItem("task_timer_stop", `stop:${sessionId}`, {
      clientSessionId: sessionId, latitude: null, longitude: null, address: null, timestamp: "2026-04-18T10:30:00Z",
    }, []);
    await saveItem("task_timer_start", `start:${sessionId}`, {
      clientSessionId: sessionId, task: "TK-1", latitude: null, longitude: null, address: null, timestamp: "2026-04-18T10:00:00Z",
    }, []);

    await drain();
    expect(calls).toEqual(["start", "stop"]);
    expect(await listPending()).toEqual([]);
  });
});
```

- [ ] **Step 2: Modify `drain.ts` — add insertion-order + prerequisite gating**

Edit the `drain` function body to respect prerequisite metadata:

Replace the `for (const row of rows)` loop with:

```typescript
const rows = await listPending();
// Sort by dependency: start ops before stop ops for the same session,
// otherwise preserve insertion order.
const sorted = [...rows].sort((a, b) => {
  const pa = prerequisiteOf(a);
  const pb = prerequisiteOf(b);
  if (pa && !pb) return 1;
  if (pb && !pa) return -1;
  return a.insertionOrder - b.insertionOrder;
});

const completed = new Set<string>();

for (const row of sorted) {
  const p = processors.get(row.kind);
  if (!p) continue;
  const prereq = prerequisiteOf(row);
  if (prereq && !completed.has(prereq) && rows.some((r) => r.logicalKey === prereq)) {
    // its prerequisite is still pending — skip this pass; will retry on next drain
    continue;
  }
  try {
    await p(row);
    await removeEntry(row.id);
    completed.add(row.logicalKey);
  } catch (e) {
    if (isUnrecoverable(e)) {
      await removeEntry(row.id);
    } else {
      await setError(row.id, {
        code: (e as any)?.name || "Error",
        message: (e as any)?.message || String(e),
      });
    }
  }
}
```

Add the helper at the bottom of `drain.ts`:

```typescript
function prerequisiteOf(entry: QueueRecord): string | null {
  if (entry.kind === "task_timer_stop") {
    const clientSessionId = (entry.payload as any)?.clientSessionId;
    return clientSessionId ? `start:${clientSessionId}` : null;
  }
  return null;
}
```

And add to imports: `import type { QueueRecord } from "./db";` (if not present).

- [ ] **Step 3: Implement `task-timer.ts`**

```typescript
import type { QueueRecord } from "@/offline/db";
import { registerProcessor } from "@/offline/drain";
import { apiCall } from "@/api/client";
import { openDb, STORE } from "@/offline/db";

// In-memory ephemeral map: clientSessionId → server sessionId after start
// Persisted in meta store so that a page reload doesn't lose the mapping
// between a queued start that drained and a still-pending stop.

async function setSessionMapping(clientId: string, serverId: string) {
  const db = await openDb();
  await db.put(STORE.meta, serverId, `session:${clientId}`);
}
async function getSessionMapping(clientId: string): Promise<string | null> {
  const db = await openDb();
  return (await db.get(STORE.meta, `session:${clientId}`)) ?? null;
}

registerProcessor("task_timer_start", async (entry: QueueRecord) => {
  const p = entry.payload as {
    clientSessionId: string; task: string;
    latitude: number | null; longitude: number | null;
    address: string | null; timestamp: string;
  };
  const r = await apiCall<{ session_id: string }>(
    "POST", "fatehhr.api.task.start_timer",
    { task: p.task, latitude: p.latitude, longitude: p.longitude, address: p.address, timestamp: p.timestamp },
  );
  await setSessionMapping(p.clientSessionId, r.session_id);
});

registerProcessor("task_timer_stop", async (entry: QueueRecord) => {
  const p = entry.payload as {
    clientSessionId: string;
    latitude: number | null; longitude: number | null;
    address: string | null; timestamp: string;
  };
  const serverId = await getSessionMapping(p.clientSessionId);
  if (!serverId) {
    throw new Error("Session start not yet drained; will retry next drain cycle.");
  }
  await apiCall("POST", "fatehhr.api.task.stop_timer", {
    session_id: serverId,
    latitude: p.latitude, longitude: p.longitude, address: p.address, timestamp: p.timestamp,
  });
});
```

- [ ] **Step 4: Register processor in `main.ts`**

Add: `import "@/offline/processors/task-timer";`

- [ ] **Step 5: Run — pass**

```bash
pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/offline/processors/task-timer.ts frontend/src/offline/drain.ts frontend/src/main.ts frontend/tests/unit/task-timer-ordering.spec.ts
git commit -m "feat(offline): task timer processors with ordered drain + session mapping"
```

---

### Task 9: `stores/tasks.ts` + `TaskListView.vue`

**Files:**
- Create: `frontend/src/stores/tasks.ts`
- Create: `frontend/src/views/TaskListView.vue`
- Modify: `frontend/src/app/router.ts`

- [ ] **Step 1: `stores/tasks.ts`**

```typescript
import { defineStore } from "pinia";
import { taskApi, type TaskRow } from "@/api/task";
import { saveItem } from "@/offline/queue";
import { useSyncStore } from "@/stores/sync";
import { v4 as uuid } from "uuid";
import { getCurrentCoords, hapticMedium } from "@/app/frappe";

interface RunningTimer {
  clientSessionId: string;
  serverSessionId: string | null;  // set after online start or drain
  task: string;
  startedAt: string;
}

const RUNNING_KEY = "fatehhr.runningTimer";

export const useTasksStore = defineStore("tasks", {
  state: () => ({
    tasks: [] as TaskRow[],
    running: null as RunningTimer | null,
  }),
  actions: {
    async load() {
      try { this.tasks = await taskApi.list_mine(); } catch {}
      const raw = localStorage.getItem(RUNNING_KEY);
      if (raw) this.running = JSON.parse(raw);
    },

    async start(task: string) {
      const sync = useSyncStore();
      const coords = await getCurrentCoords();
      const timestamp = new Date().toISOString();
      const clientSessionId = uuid();

      if (sync.isOnline) {
        try {
          const r = await taskApi.start_timer({
            task, latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null,
            address: null, timestamp,
          });
          this.running = { clientSessionId, serverSessionId: r.session_id, task, startedAt: timestamp };
          localStorage.setItem(RUNNING_KEY, JSON.stringify(this.running));
          await hapticMedium();
          return { mode: "online" as const };
        } catch { /* fall through */ }
      }

      await saveItem("task_timer_start", `start:${clientSessionId}`, {
        clientSessionId, task, latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null,
        address: null, timestamp,
      }, []);
      this.running = { clientSessionId, serverSessionId: null, task, startedAt: timestamp };
      localStorage.setItem(RUNNING_KEY, JSON.stringify(this.running));
      await hapticMedium();
      await sync.refresh();
      return { mode: "queued" as const };
    },

    async stop() {
      if (!this.running) return;
      const sync = useSyncStore();
      const coords = await getCurrentCoords();
      const timestamp = new Date().toISOString();

      if (sync.isOnline && this.running.serverSessionId) {
        try {
          await taskApi.stop_timer({
            session_id: this.running.serverSessionId,
            latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null,
            address: null, timestamp,
          });
          await this.clearRunning();
          await hapticMedium();
          return { mode: "online" as const };
        } catch { /* fall through */ }
      }

      await saveItem("task_timer_stop", `stop:${this.running.clientSessionId}`, {
        clientSessionId: this.running.clientSessionId,
        latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null,
        address: null, timestamp,
      }, []);
      await this.clearRunning();
      await sync.refresh();
      return { mode: "queued" as const };
    },

    async clearRunning() {
      this.running = null;
      localStorage.removeItem(RUNNING_KEY);
    },

    elapsed(): string {
      if (!this.running) return "0:00";
      const ms = Date.now() - Date.parse(this.running.startedAt);
      const m = Math.floor(ms / 60000);
      return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
    },
  },
});
```

- [ ] **Step 2: `TaskListView.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import Card from "@/components/Card.vue";
import Chip from "@/components/Chip.vue";
import AppButton from "@/components/Button.vue";
import { useTasksStore } from "@/stores/tasks";

const { t } = useI18n();
const router = useRouter();
const store = useTasksStore();
const tick = ref(0);
let interval: number | null = null;

onMounted(() => {
  store.load();
  interval = window.setInterval(() => (tick.value++), 1000);
});
onUnmounted(() => { if (interval) clearInterval(interval); });

function isRunning(name: string) { return store.running?.task === name; }
async function toggle(name: string) {
  if (isRunning(name)) await store.stop();
  else {
    if (store.running) await store.stop();  // stop previous
    await store.start(name);
  }
}
</script>

<template>
  <main class="tasks">
    <TopAppBar :title="t('tasks.title')" back @back="router.back()" />
    <SyncBar />

    <Card v-for="tk in store.tasks" :key="tk.name" class="tasks__card" :class="{ 'is-running': isRunning(tk.name) }">
      <div class="tasks__head">
        <h3>{{ tk.subject }}</h3>
        <Chip :variant="(tk.priority as any)?.toLowerCase() === 'high' ? 'rejected' : 'neutral'">{{ tk.priority || '—' }}</Chip>
      </div>
      <p class="tasks__meta">{{ tk.project ?? '' }} · {{ tk.exp_end_date ?? '' }}</p>
      <p v-if="isRunning(tk.name)" class="tasks__elapsed">{{ store.elapsed() }} <!-- reactive via tick --></p>
      <AppButton :variant="isRunning(tk.name) ? 'destructive' : 'primary'" block @click="toggle(tk.name)">
        {{ isRunning(tk.name) ? t('tasks.stop') : t('tasks.start') }}
      </AppButton>
    </Card>

    <p v-if="!store.tasks.length" class="tasks__empty">{{ t('tasks.empty') }}</p>

    <BottomNav />
  </main>
</template>

<style scoped>
.tasks { padding: 0 var(--page-gutter) 120px; display: flex; flex-direction: column; gap: 12px; }
.tasks__card.is-running { background: var(--accent-soft); }
.tasks__head { display: flex; justify-content: space-between; align-items: baseline; }
.tasks__head h3 { margin: 0; font-family: var(--font-display); font-weight: 400; font-size: 18px; }
.tasks__meta { color: var(--ink-secondary); font-size: 13px; margin: 4px 0; }
.tasks__elapsed { font-family: var(--font-mono); font-size: 24px; margin: 8px 0; }
.tasks__empty { padding: 40px var(--page-gutter); color: var(--ink-secondary); text-align: center; }
</style>
```

- [ ] **Step 3: Translations**

`en.json`:

```json
  ,"tasks": { "title": "Tasks", "start": "Start Timer", "stop": "Stop Timer", "empty": "No tasks assigned." }
```

`ar.json`:

```json
  ,"tasks": { "title": "المهام", "start": "بدء المؤقت", "stop": "إيقاف المؤقت", "empty": "لا توجد مهام مسندة." }
```

- [ ] **Step 4: Route**

```typescript
{ path: "tasks", name: "tasks", component: () => import("@/views/TaskListView.vue") },
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/tasks.ts frontend/src/views/TaskListView.vue frontend/src/app/router.ts frontend/src/locales/
git commit -m "feat(tasks): task list view with start/stop timer"
```

---

### Task 10: Payslip list + detail + PDF cache

**Files:**
- Create: `frontend/src/stores/payslip.ts`
- Create: `frontend/src/views/PayslipListView.vue`
- Create: `frontend/src/views/PayslipDetailView.vue`
- Create: `frontend/tests/unit/payslip-cache.spec.ts`
- Modify: `frontend/src/app/router.ts`

- [ ] **Step 1: Cache test**

```typescript
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, openDb, STORE } from "@/offline/db";
import { putPdfCache, getPdfCache, PDF_CACHE_LIMIT } from "@/stores/payslip";

describe("payslip pdf cache", () => {
  beforeEach(async () => await resetDb());

  it("stores and retrieves blobs", async () => {
    const blob = new Blob(["x"], { type: "application/pdf" });
    await putPdfCache("SS-001", blob);
    const got = await getPdfCache("SS-001");
    expect(got).toBeInstanceOf(Blob);
  });

  it("evicts FIFO beyond limit", async () => {
    for (let i = 1; i <= PDF_CACHE_LIMIT + 2; i++) {
      await putPdfCache(`SS-${i}`, new Blob([`${i}`], { type: "application/pdf" }));
    }
    const db = await openDb();
    const keys: string[] = [];
    for await (const k of db.transaction(STORE.cache).store.iterate(undefined, "next")) {
      if (typeof k.key === "string" && k.key.startsWith("payslip:pdf:")) keys.push(k.key);
    }
    expect(keys.length).toBeLessThanOrEqual(PDF_CACHE_LIMIT);
    expect(keys).not.toContain("payslip:pdf:SS-1");
  });
});
```

- [ ] **Step 2: Store**

`frontend/src/stores/payslip.ts`:

```typescript
import { defineStore } from "pinia";
import { payslipApi, type PayslipRow, type PayslipDetail } from "@/api/payslip";
import { openDb, STORE } from "@/offline/db";

export const PDF_CACHE_LIMIT = 3;
const PREFIX = "payslip:pdf:";
const ORDER_KEY = "payslip:pdf:order";
const MAX_BYTES = 5 * 1024 * 1024;

export async function putPdfCache(slipName: string, blob: Blob): Promise<void> {
  if (blob.size > MAX_BYTES) return;
  const db = await openDb();
  await db.put(STORE.cache, blob, `${PREFIX}${slipName}`);
  const order = ((await db.get(STORE.cache, ORDER_KEY)) as string[] | undefined) ?? [];
  const next = [slipName, ...order.filter((n) => n !== slipName)].slice(0, PDF_CACHE_LIMIT);
  // Evict surplus
  for (const o of order) if (!next.includes(o)) await db.delete(STORE.cache, `${PREFIX}${o}`);
  await db.put(STORE.cache, next, ORDER_KEY);
}

export async function getPdfCache(slipName: string): Promise<Blob | null> {
  const db = await openDb();
  return (await db.get(STORE.cache, `${PREFIX}${slipName}`)) as Blob | undefined ?? null;
}

export const usePayslipStore = defineStore("payslip", {
  state: () => ({
    list: [] as PayslipRow[],
    current: null as PayslipDetail | null,
  }),
  actions: {
    async loadList() { try { this.list = await payslipApi.list_mine(); } catch {} },
    async loadDetail(name: string) {
      try { this.current = await payslipApi.detail(name); } catch {}
    },
    async fetchPdf(name: string): Promise<Blob> {
      const cached = await getPdfCache(name);
      if (cached) return cached;
      const blob = await payslipApi.pdfBlob(name);
      await putPdfCache(name, blob);
      return blob;
    },
  },
});
```

- [ ] **Step 3: `PayslipListView.vue` + `PayslipDetailView.vue`**

`PayslipListView.vue`:

```vue
<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import SyncBar from "@/components/SyncBar.vue";
import ListRow from "@/components/ListRow.vue";
import Chip from "@/components/Chip.vue";
import { usePayslipStore } from "@/stores/payslip";

const { t } = useI18n();
const router = useRouter();
const store = usePayslipStore();

onMounted(() => store.loadList());
</script>

<template>
  <main>
    <TopAppBar :title="t('payslip.title')" back @back="router.back()" />
    <SyncBar />
    <ListRow v-for="r in store.list" :key="r.name"
      :title="`${r.start_date} – ${r.end_date}`"
      :subtitle="r.name"
      :trailing="r.net_pay.toFixed(2)"
      @click="router.push({ name: 'payslip.detail', params: { name: r.name } })" />
    <BottomNav />
  </main>
</template>
```

`PayslipDetailView.vue`:

```vue
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import Card from "@/components/Card.vue";
import AppButton from "@/components/Button.vue";
import AmountDisplay from "@/components/AmountDisplay.vue";
import { usePayslipStore } from "@/stores/payslip";
import { isNativePlatform } from "@/app/frappe";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const store = usePayslipStore();
const downloading = ref(false);

onMounted(() => store.loadDetail(String(route.params.name)));

async function download() {
  downloading.value = true;
  try {
    const blob = await store.fetchPdf(String(route.params.name));
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${route.params.name}.pdf`;
    a.click(); URL.revokeObjectURL(url);
  } finally { downloading.value = false; }
}

async function share() {
  const blob = await store.fetchPdf(String(route.params.name));
  const file = new File([blob], `${route.params.name}.pdf`, { type: "application/pdf" });
  if ((navigator as any).canShare?.({ files: [file] })) {
    await (navigator as any).share({ files: [file], title: "Payslip" });
  } else { await download(); }
}
</script>

<template>
  <main>
    <TopAppBar :title="t('payslip.detail')" back @back="router.back()" />
    <section v-if="store.current" class="ps-detail">
      <h2 class="ps-detail__hero">
        <AmountDisplay :amount="store.current.net_pay" :currency="store.current.currency" />
      </h2>
      <Card>
        <h3>{{ t('payslip.earnings') }}</h3>
        <div v-for="e in store.current.earnings" :key="e.name" class="ps-detail__line">
          <span>{{ e.name }}</span><span>{{ e.amount.toFixed(2) }}</span>
        </div>
      </Card>
      <Card>
        <h3>{{ t('payslip.deductions') }}</h3>
        <div v-for="d in store.current.deductions" :key="d.name" class="ps-detail__line">
          <span>{{ d.name }}</span><span>{{ d.amount.toFixed(2) }}</span>
        </div>
      </Card>
      <div class="ps-detail__actions">
        <AppButton @click="download" :disabled="downloading">{{ t('payslip.download') }}</AppButton>
        <AppButton variant="secondary" @click="share" v-if="!isNativePlatform()">{{ t('payslip.share') }}</AppButton>
      </div>
    </section>
    <BottomNav />
  </main>
</template>

<style scoped>
.ps-detail { padding: 16px var(--page-gutter); display: flex; flex-direction: column; gap: 12px; padding-bottom: 120px; }
.ps-detail__hero { text-align: center; margin: 8px 0 16px; }
.ps-detail__line { display: flex; justify-content: space-between; padding: 4px 0; }
.ps-detail__line:not(:last-child) { border-bottom: 1px solid var(--hairline); }
.ps-detail__actions { display: flex; gap: 12px; justify-content: center; }
</style>
```

- [ ] **Step 4: Translations**

`en.json`:

```json
  ,"payslip": {
    "title": "Payslips",
    "detail": "Payslip",
    "earnings": "Earnings",
    "deductions": "Deductions",
    "download": "Download PDF",
    "share": "Share"
  }
```

`ar.json`:

```json
  ,"payslip": {
    "title": "قسائم الراتب",
    "detail": "قسيمة الراتب",
    "earnings": "العوائد",
    "deductions": "الخصومات",
    "download": "تنزيل PDF",
    "share": "مشاركة"
  }
```

- [ ] **Step 5: Routes**

```typescript
{ path: "payslip", name: "payslip", component: () => import("@/views/PayslipListView.vue") },
{ path: "payslip/:name", name: "payslip.detail", component: () => import("@/views/PayslipDetailView.vue") },
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/payslip.ts frontend/src/views/PayslipListView.vue frontend/src/views/PayslipDetailView.vue frontend/tests/unit/payslip-cache.spec.ts frontend/src/app/router.ts frontend/src/locales/
git commit -m "feat(payslip): list + detail + FIFO PDF blob cache"
```

---

### Task 11: Announcements — list + detail with local read state

**Files:**
- Create: `frontend/src/stores/announcement.ts`
- Create: `frontend/src/views/AnnouncementListView.vue`
- Create: `frontend/src/views/AnnouncementDetailView.vue`
- Create: `frontend/tests/unit/announcement-read.spec.ts`
- Modify: `frontend/src/app/router.ts`

- [ ] **Step 1: Read-state test**

```typescript
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { resetDb } from "@/offline/db";
import { useAnnouncementStore } from "@/stores/announcement";

describe("announcement local read state", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    await resetDb();
  });

  it("marks and persists read state per (user, name)", async () => {
    const s = useAnnouncementStore();
    s.user = "a@b.com";
    await s.markRead("ANN-1");
    expect(await s.isRead("ANN-1")).toBe(true);
    expect(await s.isRead("ANN-2")).toBe(false);
  });
});
```

- [ ] **Step 2: Store**

```typescript
import { defineStore } from "pinia";
import { announcementApi, type AnnouncementRow } from "@/api/announcement";
import { openDb, STORE } from "@/offline/db";

const keyFor = (user: string, name: string) => `announcement:read:${user}:${name}`;

export const useAnnouncementStore = defineStore("announcement", {
  state: () => ({
    feed: [] as AnnouncementRow[],
    user: "" as string,
  }),
  actions: {
    async load(user: string) {
      this.user = user;
      try { this.feed = await announcementApi.feed(); } catch {}
    },
    async markRead(name: string) {
      const db = await openDb();
      await db.put(STORE.cache, true, keyFor(this.user, name));
    },
    async isRead(name: string): Promise<boolean> {
      const db = await openDb();
      return Boolean(await db.get(STORE.cache, keyFor(this.user, name)));
    },
  },
});
```

- [ ] **Step 3: Views**

`AnnouncementListView.vue`:

```vue
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import { useAnnouncementStore } from "@/stores/announcement";
import { useSessionStore } from "@/stores/session";

const { t } = useI18n();
const router = useRouter();
const store = useAnnouncementStore();
const session = useSessionStore();
const readMap = ref<Record<string, boolean>>({});

async function rehydrateReadMap() {
  const m: Record<string, boolean> = {};
  for (const r of store.feed) m[r.name] = await store.isRead(r.name);
  readMap.value = m;
}

onMounted(async () => {
  await store.load(session.user ?? "");
  await rehydrateReadMap();
});
</script>

<template>
  <main class="annlist">
    <TopAppBar :title="t('announce.title')" back @back="router.back()" />
    <SyncBar />
    <article v-for="a in store.feed" :key="a.name"
             :class="['annlist__row', { 'is-unread': !readMap[a.name] }]"
             @click="router.push({ name: 'announce.detail', params: { name: a.name } })">
      <span v-if="a.pinned" class="annlist__pin">📌</span>
      <h3>{{ a.title }}</h3>
      <p class="annlist__when">{{ new Date(a.published_on).toLocaleDateString() }}</p>
    </article>
    <BottomNav />
  </main>
</template>

<style scoped>
.annlist { padding: 0 var(--page-gutter) 120px; }
.annlist__row { padding: 14px 0; border-bottom: 1px solid var(--hairline); }
.annlist__row.is-unread h3 { font-weight: 600; }
.annlist__row h3 { margin: 2px 0; font-family: var(--font-display); font-weight: 400; font-size: 17px; }
.annlist__when { color: var(--ink-secondary); font-size: 12px; margin: 0; }
.annlist__pin { font-size: 12px; color: var(--accent); }
</style>
```

`AnnouncementDetailView.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import Markdown from "@/components/Markdown.vue";
import { useAnnouncementStore } from "@/stores/announcement";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useAnnouncementStore();
const item = computed(() => store.feed.find((a) => a.name === String(route.params.name)) ?? null);

onMounted(async () => {
  if (item.value) await store.markRead(item.value.name);
});
</script>

<template>
  <main class="anndet" v-if="item">
    <TopAppBar :title="t('announce.detail')" back @back="router.back()" />
    <article class="anndet__article">
      <h1>{{ item.title }}</h1>
      <p class="anndet__meta">{{ new Date(item.published_on).toLocaleString() }} · {{ item.published_by }}</p>
      <Markdown :source="item.body" />
    </article>
    <BottomNav />
  </main>
</template>

<style scoped>
.anndet__article { padding: 16px var(--page-gutter) 120px; }
.anndet__article h1 {
  font-family: var(--font-display); font-weight: 400; font-size: 28px;
  letter-spacing: -0.01em; margin: 4px 0 8px;
}
[dir="rtl"] .anndet__article h1 { font-family: var(--font-display-ar); font-weight: 500; }
.anndet__meta { color: var(--ink-secondary); font-size: 13px; margin: 0 0 16px; }
</style>
```

- [ ] **Step 4: Translations**

`en.json`:

```json
  ,"announce": { "title": "Announcements", "detail": "Announcement" }
```

`ar.json`:

```json
  ,"announce": { "title": "الإعلانات", "detail": "إعلان" }
```

- [ ] **Step 5: Routes**

```typescript
{ path: "announcements", name: "announce", component: () => import("@/views/AnnouncementListView.vue") },
{ path: "announcements/:name", name: "announce.detail", component: () => import("@/views/AnnouncementDetailView.vue") },
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/announcement.ts frontend/src/views/Announcement*.vue frontend/tests/unit/announcement-read.spec.ts frontend/src/app/router.ts frontend/src/locales/
git commit -m "feat(announce): list + detail + local read state"
```

---

### Task 12: Notification bell + view

**Files:**
- Create: `frontend/src/stores/notification.ts`
- Create: `frontend/src/components/NotificationBell.vue`
- Create: `frontend/src/views/NotificationView.vue`
- Modify: `frontend/src/app/router.ts`

- [ ] **Step 1: Store**

```typescript
import { defineStore } from "pinia";
import { notificationsApi, type NotificationRow } from "@/api/notifications";

export const useNotificationStore = defineStore("notification", {
  state: () => ({
    rows: [] as NotificationRow[],
    unread: 0,
  }),
  actions: {
    async load() {
      try {
        this.rows = await notificationsApi.feed();
        this.unread = await notificationsApi.unreadCount();
      } catch {}
    },
    async markRead(name: string) {
      try { await notificationsApi.markRead(name); } catch {}
      const r = this.rows.find((x) => x.name === name);
      if (r && !r.read) { r.read = 1; this.unread = Math.max(0, this.unread - 1); }
    },
  },
});
```

- [ ] **Step 2: `NotificationBell.vue`**

```vue
<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useNotificationStore } from "@/stores/notification";
const router = useRouter();
const store = useNotificationStore();
onMounted(() => store.load());
</script>

<template>
  <button class="bell" @click="router.push({ name: 'notifications' })" aria-label="Notifications">
    <span>🔔</span>
    <span v-if="store.unread > 0" class="bell__dot">{{ store.unread }}</span>
  </button>
</template>

<style scoped>
.bell { position: relative; width: 40px; height: 40px; border-radius: var(--r-full); color: var(--ink-primary); font-size: 18px; display: grid; place-items: center; }
.bell:active { background: var(--bg-sunk); }
.bell__dot {
  position: absolute; top: 4px; right: 4px; min-width: 18px; height: 18px;
  padding: 0 5px; border-radius: var(--r-full); background: var(--accent);
  color: var(--accent-ink); font-size: 11px; display: grid; place-items: center;
}
[dir="rtl"] .bell__dot { left: 4px; right: auto; }
</style>
```

- [ ] **Step 3: `NotificationView.vue`**

```vue
<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import ListRow from "@/components/ListRow.vue";
import { useNotificationStore } from "@/stores/notification";

const { t } = useI18n();
const router = useRouter();
const store = useNotificationStore();
onMounted(() => store.load());

async function open(name: string) {
  await store.markRead(name);
}
</script>

<template>
  <main>
    <TopAppBar :title="t('notifications.title')" back @back="router.back()" />
    <ListRow v-for="r in store.rows" :key="r.name"
      :title="r.subject"
      :subtitle="new Date(r.creation).toLocaleString()"
      :trailing="r.read ? '' : '●'"
      @click="open(r.name)" />
    <p v-if="!store.rows.length" class="empty">{{ t('notifications.empty') }}</p>
    <BottomNav />
  </main>
</template>

<style scoped>
.empty { padding: 40px var(--page-gutter); color: var(--ink-secondary); text-align: center; }
</style>
```

- [ ] **Step 4: Translations**

`en.json`:

```json
  ,"notifications": { "title": "Notifications", "empty": "You're all caught up." }
```

`ar.json`:

```json
  ,"notifications": { "title": "الإشعارات", "empty": "لا توجد إشعارات جديدة." }
```

- [ ] **Step 5: Route**

```typescript
{ path: "notifications", name: "notifications", component: () => import("@/views/NotificationView.vue") },
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/notification.ts frontend/src/components/NotificationBell.vue frontend/src/views/NotificationView.vue frontend/src/app/router.ts frontend/src/locales/
git commit -m "feat(notifications): bell + list view wrapping Notification Log"
```

---

### Task 13: Profile view + edit + Settings + Discard-pending

**Files:**
- Create: `frontend/src/stores/profile.ts`
- Create: `frontend/src/views/ProfileView.vue`
- Create: `frontend/src/views/SettingsView.vue`
- Modify: `frontend/src/app/router.ts`

- [ ] **Step 1: Store**

```typescript
import { defineStore } from "pinia";
import { meApi, type Profile } from "@/api/me";
import { saveItem } from "@/offline/queue";
import { useSyncStore } from "@/stores/sync";
import { v4 as uuid } from "uuid";

export const useProfileStore = defineStore("profile", {
  state: () => ({ profile: null as Profile | null }),
  actions: {
    async load() { try { this.profile = await meApi.profile(); } catch {} },
    async update(patch: Partial<Profile>) {
      const sync = useSyncStore();
      if (sync.isOnline) {
        try { await meApi.updateProfile(patch); await this.load(); return { mode: "online" as const }; }
        catch { /* fall through */ }
      }
      await saveItem("profile_update", `profile:${uuid()}`, patch, []);
      // Optimistic local merge
      if (this.profile) this.profile = { ...this.profile, ...patch };
      await sync.refresh();
      return { mode: "queued" as const };
    },
  },
});
```

- [ ] **Step 2: `ProfileView.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import Card from "@/components/Card.vue";
import AppButton from "@/components/Button.vue";
import { useProfileStore } from "@/stores/profile";

const { t } = useI18n();
const router = useRouter();
const store = useProfileStore();

const emergencyPhone = ref(""), contact = ref(""), relation = ref("");
const bankName = ref(""), bankAc = ref(""), iban = ref("");
const unmaskBank = ref(false);

onMounted(async () => {
  await store.load();
});

watch(() => store.profile, (p) => {
  if (!p) return;
  emergencyPhone.value = p.emergency_phone_number ?? "";
  contact.value = p.person_to_be_contacted ?? "";
  relation.value = p.relation ?? "";
  bankName.value = p.bank_name ?? "";
  bankAc.value = p.bank_ac_no ?? "";
  iban.value = p.iban ?? "";
}, { immediate: true });

function mask(s: string) {
  if (!s) return "";
  return s.length <= 4 ? "•".repeat(s.length) : "•".repeat(s.length - 4) + s.slice(-4);
}

async function save() {
  await store.update({
    emergency_phone_number: emergencyPhone.value,
    person_to_be_contacted: contact.value,
    relation: relation.value,
    bank_name: bankName.value,
    bank_ac_no: bankAc.value,
    iban: iban.value,
  });
}
</script>

<template>
  <main v-if="store.profile" class="profile">
    <TopAppBar :title="t('profile.title')" back @back="router.back()" />
    <header class="profile__header">
      <div class="profile__avatar" :style="{ backgroundImage: store.profile.photo ? `url(${store.profile.photo})` : '' }"></div>
      <h2>{{ store.profile.full_name }}</h2>
      <p>{{ [store.profile.designation, store.profile.department].filter(Boolean).join(' · ') }}</p>
    </header>

    <Card>
      <h3>{{ t('profile.emergency') }}</h3>
      <label><span>{{ t('profile.emergency_contact') }}</span><input v-model="contact" /></label>
      <label><span>{{ t('profile.relation') }}</span><input v-model="relation" /></label>
      <label><span>{{ t('profile.phone') }}</span><input v-model="emergencyPhone" /></label>
    </Card>

    <Card>
      <div class="profile__bank-head">
        <h3>{{ t('profile.bank') }}</h3>
        <AppButton variant="ghost" @click="unmaskBank = !unmaskBank">{{ unmaskBank ? t('profile.hide') : t('profile.show') }}</AppButton>
      </div>
      <label><span>{{ t('profile.bank_name') }}</span><input v-model="bankName" /></label>
      <label><span>{{ t('profile.bank_ac') }}</span>
        <input v-if="unmaskBank" v-model="bankAc" />
        <input v-else disabled :value="mask(bankAc)" /></label>
      <label><span>IBAN</span>
        <input v-if="unmaskBank" v-model="iban" />
        <input v-else disabled :value="mask(iban)" /></label>
    </Card>

    <AppButton block @click="save">{{ t('profile.save') }}</AppButton>

    <BottomNav />
  </main>
</template>

<style scoped>
.profile { padding: 0 var(--page-gutter) 120px; display: flex; flex-direction: column; gap: 12px; }
.profile__header { text-align: center; padding: 8px 0 12px; }
.profile__avatar {
  width: 96px; height: 96px; border-radius: var(--r-full);
  margin: 8px auto 12px; background: var(--bg-sunk) center/cover;
}
.profile__header h2 { font-family: var(--font-display); font-weight: 400; font-size: 24px; margin: 0 0 2px; }
.profile__header p { color: var(--ink-secondary); margin: 0; }
.profile__bank-head { display: flex; align-items: center; justify-content: space-between; }
h3 { font-family: var(--font-display); font-weight: 400; font-size: 17px; margin: 0 0 8px; }
label { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
label span { font-size: 12px; color: var(--ink-secondary); text-transform: uppercase; }
input { background: var(--bg-sunk); border: 0; border-radius: var(--r-md); padding: 12px; font-size: 15px; color: var(--ink-primary); }
</style>
```

- [ ] **Step 3: `SettingsView.vue`**

```vue
<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import Card from "@/components/Card.vue";
import AppButton from "@/components/Button.vue";
import { setLocale } from "@/app/i18n";
import { useSessionStore } from "@/stores/session";
import { useSyncStore } from "@/stores/sync";
import { openDb, resetDb } from "@/offline/db";
import { authApi } from "@/api/auth";

const { t, locale } = useI18n();
const router = useRouter();
const session = useSessionStore();
const sync = useSyncStore();
const theme = ref(localStorage.getItem("fatehhr.theme") ?? "auto");

function applyTheme(v: "light" | "dark" | "auto") {
  theme.value = v;
  document.documentElement.classList.remove("light-theme", "dark-theme", "auto-theme");
  document.documentElement.classList.add(`${v}-theme`);
  localStorage.setItem("fatehhr.theme", v);
}

async function forceSync() { await sync.triggerDrain(); }

async function discardPending() {
  const typed = prompt(t("settings.discard_prompt"));
  if (typed !== "DISCARD") return;
  await resetDb();
  await sync.refresh();
}

async function changePin() {
  const oldPin = prompt(t("settings.pin_old"));
  if (!oldPin) return;
  const newPin = prompt(t("settings.pin_new"));
  if (!newPin) return;
  try { await authApi.changePin(oldPin, newPin); alert(t("settings.pin_changed")); }
  catch (e: any) { alert(e?.message || "error"); }
}

async function logout() {
  if (sync.pending > 0 && !confirm(t("settings.logout_pending_confirm"))) return;
  await session.clear();
  router.replace({ name: "login" });
}
</script>

<template>
  <main class="settings">
    <TopAppBar :title="t('settings.title')" back @back="router.back()" />

    <Card><h3>{{ t('settings.security') }}</h3>
      <AppButton variant="ghost" block @click="changePin">{{ t('settings.change_pin') }}</AppButton>
    </Card>

    <Card><h3>{{ t('settings.language') }}</h3>
      <div class="settings__row">
        <AppButton :variant="locale === 'en' ? 'primary' : 'ghost'" @click="setLocale('en')">English</AppButton>
        <AppButton :variant="locale === 'ar' ? 'primary' : 'ghost'" @click="setLocale('ar')">العربية</AppButton>
      </div>
    </Card>

    <Card><h3>{{ t('settings.appearance') }}</h3>
      <div class="settings__row">
        <AppButton :variant="theme === 'light' ? 'primary' : 'ghost'" @click="applyTheme('light')">{{ t('settings.light') }}</AppButton>
        <AppButton :variant="theme === 'dark'  ? 'primary' : 'ghost'" @click="applyTheme('dark')">{{ t('settings.dark') }}</AppButton>
        <AppButton :variant="theme === 'auto'  ? 'primary' : 'ghost'" @click="applyTheme('auto')">{{ t('settings.auto') }}</AppButton>
      </div>
    </Card>

    <Card><h3>{{ t('settings.sync') }}</h3>
      <AppButton variant="ghost" block @click="forceSync">{{ t('settings.force_sync') }}</AppButton>
      <AppButton variant="ghost" block @click="router.push({ name: 'sync.errors' })">
        {{ t('settings.sync_errors') }} ({{ sync.errorCount }})
      </AppButton>
      <AppButton variant="destructive" block @click="discardPending">{{ t('settings.discard_pending') }}</AppButton>
    </Card>

    <Card><h3>{{ t('settings.about') }}</h3>
      <p>{{ t('settings.version') }}: 1.0.0 / Capacitor / build {{ 1 }}</p>
    </Card>

    <AppButton variant="destructive" block @click="logout">{{ t('settings.logout') }}</AppButton>
    <BottomNav />
  </main>
</template>

<style scoped>
.settings { padding: 0 var(--page-gutter) 120px; display: flex; flex-direction: column; gap: 12px; }
.settings__row { display: flex; gap: 8px; flex-wrap: wrap; }
h3 { font-family: var(--font-display); font-weight: 400; font-size: 17px; margin: 0 0 8px; }
</style>
```

- [ ] **Step 4: Translations**

`en.json`:

```json
  ,"profile": {
    "title": "Profile",
    "emergency": "Emergency contact",
    "emergency_contact": "Contact name",
    "relation": "Relation",
    "phone": "Phone number",
    "bank": "Bank details",
    "show": "Show",
    "hide": "Hide",
    "bank_name": "Bank",
    "bank_ac": "Account #",
    "save": "Save changes"
  },
  "settings": {
    "title": "Settings",
    "security": "Security",
    "change_pin": "Change PIN",
    "pin_old": "Current PIN",
    "pin_new": "New PIN (4–6 digits)",
    "pin_changed": "PIN updated.",
    "language": "Language",
    "appearance": "Appearance",
    "light": "Light",
    "dark": "Dark",
    "auto": "Auto",
    "sync": "Sync",
    "force_sync": "Force sync",
    "sync_errors": "Sync errors",
    "discard_pending": "Discard pending changes",
    "discard_prompt": "Type DISCARD to permanently delete all pending changes.",
    "logout_pending_confirm": "You have pending sync items. Logging out won't lose them from this device — they'll sync next time you log in on this device. Continue?",
    "about": "About",
    "version": "Version",
    "logout": "Log out"
  }
```

(Copy keys to `ar.json` with Arabic labels — the same shape; omitted here for brevity.)

- [ ] **Step 5: Routes**

```typescript
{ path: "profile", name: "profile", component: () => import("@/views/ProfileView.vue") },
{ path: "settings", name: "settings", component: () => import("@/views/SettingsView.vue") },
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/profile.ts frontend/src/views/ProfileView.vue frontend/src/views/SettingsView.vue frontend/src/app/router.ts frontend/src/locales/
git commit -m "feat(profile+settings): view/edit + language/theme/sync/discard-pending/logout"
```

---

### Task 14: Full Dashboard (replaces Phase 1 stub)

**Files:**
- Create: `frontend/src/components/HeroCard.vue`
- Create: `frontend/src/components/QuickActionGrid.vue`
- Modify: `frontend/src/views/DashboardView.vue`

- [ ] **Step 1: `HeroCard.vue`**

```vue
<template><div class="hero"><slot /></div></template>
<style scoped>
.hero { background: var(--bg-surface); border-radius: var(--r-xl); box-shadow: var(--e-2); padding: 24px; }
</style>
```

- [ ] **Step 2: `QuickActionGrid.vue`**

```vue
<script setup lang="ts">
import { RouterLink } from "vue-router";
defineProps<{ items: { to: string; label: string; icon: string; badge?: number }[] }>();
</script>
<template>
  <section class="qa">
    <RouterLink v-for="it in items" :key="it.to" :to="it.to" class="qa__item">
      <span class="qa__icon">{{ it.icon }}</span>
      <span class="qa__label">{{ it.label }}</span>
      <span v-if="it.badge" class="qa__badge">{{ it.badge }}</span>
    </RouterLink>
  </section>
</template>
<style scoped>
.qa { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.qa__item {
  display: flex; flex-direction: column; gap: 4px; padding: 16px;
  background: var(--bg-surface); box-shadow: var(--e-1); border-radius: var(--r-lg);
  color: var(--ink-primary); text-decoration: none; position: relative;
}
.qa__icon { font-size: 22px; }
.qa__label { font-size: 14px; }
.qa__badge {
  position: absolute; top: 12px; right: 12px; min-width: 20px; height: 20px;
  padding: 0 6px; border-radius: var(--r-full); background: var(--accent);
  color: var(--accent-ink); font-size: 11px; display: grid; place-items: center;
}
[dir="rtl"] .qa__badge { left: 12px; right: auto; }
</style>
```

- [ ] **Step 3: Replace `DashboardView.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import HeroCard from "@/components/HeroCard.vue";
import QuickActionGrid from "@/components/QuickActionGrid.vue";
import NotificationBell from "@/components/NotificationBell.vue";
import AppButton from "@/components/Button.vue";
import { useSessionStore } from "@/stores/session";
import { useProfileStore } from "@/stores/profile";
import { useCheckinStore } from "@/stores/checkin";
import { useLeaveStore } from "@/stores/leave";
import { useAnnouncementStore } from "@/stores/announcement";
import { useNotificationStore } from "@/stores/notification";

const { t } = useI18n();
const router = useRouter();
const session = useSessionStore();
const profile = useProfileStore();
const checkin = useCheckinStore();
const leave = useLeaveStore();
const ann = useAnnouncementStore();
const notif = useNotificationStore();

const greetingKey = computed(() => {
  const h = new Date().getHours();
  if (h < 12) return "dashboard.greeting_morning";
  if (h < 17) return "dashboard.greeting_afternoon";
  return "dashboard.greeting_evening";
});

const quickActions = computed(() => [
  { to: "/leave", label: t("nav.leave"), icon: "◈" },
  { to: "/expense", label: t("expense.title"), icon: "₪" },
  { to: "/tasks", label: t("tasks.title"), icon: "◆" },
  { to: "/announcements", label: t("announce.title"), icon: "✎" },
]);

onMounted(async () => {
  await profile.load();
  await checkin.refreshToday();
  await leave.loadTypes();
  await ann.load(session.user ?? "");
  await notif.load();
});

const primaryBalance = computed(() => leave.types[0]?.balance ?? 0);
</script>

<template>
  <main class="dash">
    <header class="dash__head">
      <h1>{{ t('app.name') }}</h1>
      <NotificationBell />
    </header>
    <SyncBar />

    <h2 class="dash__greeting">
      {{ t(greetingKey, { name: profile.profile?.full_name || session.user || '' }) }}
    </h2>

    <HeroCard class="dash__today">
      <p class="dash__today-status">
        {{ checkin.today.currentStatus === 'IN' ? t('dashboard.currently_in') : t('dashboard.currently_out') }}
      </p>
      <AppButton block @click="router.push({ name: 'checkin' })">
        {{ checkin.today.currentStatus === 'IN' ? t('checkin.check_out') : t('checkin.check_in') }}
      </AppButton>
    </HeroCard>

    <section class="dash__chips">
      <span class="dash__chip">{{ t('dashboard.leave_balance') }}: <strong>{{ primaryBalance.toFixed(1) }}</strong></span>
      <span v-if="notif.unread > 0" class="dash__chip is-accent">{{ notif.unread }} {{ t('dashboard.unread') }}</span>
    </section>

    <QuickActionGrid :items="quickActions" />

    <article v-if="ann.feed[0]" class="dash__ann"
             @click="router.push({ name: 'announce.detail', params: { name: ann.feed[0].name } })">
      <span class="dash__ann-label">{{ t('dashboard.latest_announcement') }}</span>
      <h3>{{ ann.feed[0].title }}</h3>
    </article>

    <BottomNav />
  </main>
</template>

<style scoped>
.dash { padding: 0 var(--page-gutter) 120px; display: flex; flex-direction: column; gap: 16px; }
.dash__head { display: flex; align-items: center; justify-content: space-between; padding: 12px 0 0; }
.dash__head h1 { font-family: var(--font-display); font-weight: 400; font-size: 22px; margin: 0; }
.dash__greeting { font-family: var(--font-display); font-weight: 400; font-size: 28px; margin: 0; letter-spacing: -0.01em; }
[dir="rtl"] .dash__greeting { font-family: var(--font-display-ar); font-weight: 500; }
.dash__today-status { margin: 0 0 12px; color: var(--ink-secondary); }
.dash__chips { display: flex; gap: 8px; flex-wrap: wrap; }
.dash__chip { background: var(--bg-sunk); padding: 6px 12px; border-radius: var(--r-full); font-size: 13px; }
.dash__chip.is-accent { background: var(--accent-soft); color: var(--accent); }
.dash__ann { background: var(--bg-surface); border-radius: var(--r-lg); box-shadow: var(--e-1); padding: 14px; cursor: pointer; }
.dash__ann-label { font-size: 11px; color: var(--ink-secondary); letter-spacing: .08em; text-transform: uppercase; }
.dash__ann h3 { font-family: var(--font-display); font-weight: 400; font-size: 18px; margin: 4px 0 0; }
</style>
```

- [ ] **Step 4: Translations (dashboard additions)**

`en.json`:

```json
  ,"dashboard": {
    "greeting_morning": "Good morning, {name}",
    "greeting_afternoon": "Good afternoon, {name}",
    "greeting_evening": "Good evening, {name}",
    "currently_in": "You're checked in.",
    "currently_out": "You're not checked in.",
    "leave_balance": "Leave balance",
    "unread": "unread",
    "latest_announcement": "Latest announcement"
  }
```

`ar.json` — mirror these.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/HeroCard.vue frontend/src/components/QuickActionGrid.vue frontend/src/views/DashboardView.vue frontend/src/locales/
git commit -m "feat(dashboard): full dashboard with hero + quick actions + bell + announcements"
```

---

### Task 14a: Wire task picker into the Check-in screen (spec §6.3)

Phase 2 left the check-in task as free-typed text. For a field-team app the
primary flow is "check in to a task" — make it a proper picker.

**Files:**
- Modify: `frontend/src/views/CheckinView.vue`

- [ ] **Step 1: Add a picker BottomSheet**

In `CheckinView.vue` imports:

```typescript
import BottomSheet from "@/components/BottomSheet.vue";
import ListRow from "@/components/ListRow.vue";
import { useTasksStore } from "@/stores/tasks";
```

Add state:

```typescript
const tasksStore = useTasksStore();
const pickerOpen = ref(false);
onMounted(() => tasksStore.load());
const selectedTask = computed(() =>
  tasksStore.tasks.find((t) => t.name === task.value) ?? null);
function pickTask(name: string | null) { task.value = name; pickerOpen.value = false; }
```

Replace the free-text task input with a button + sheet:

```vue
<button class="checkin__task-btn" @click="pickerOpen = true">
  <span>{{ t('checkin.task') }}</span>
  <strong>{{ selectedTask ? selectedTask.subject : t('checkin.no_task') }}</strong>
</button>

<BottomSheet :open="pickerOpen" :title="t('checkin.pick_task')" @close="pickerOpen = false">
  <ListRow :title="t('checkin.no_task')" @click="pickTask(null)" />
  <ListRow v-for="tk in tasksStore.tasks" :key="tk.name"
           :title="tk.subject" :subtitle="tk.project ?? ''"
           @click="pickTask(tk.name)" />
</BottomSheet>
```

- [ ] **Step 2: When a task is picked, re-classify geofence client-side**

After `pickTask`, update `geofence.value`:

```typescript
function pickTask(name: string | null) {
  task.value = name;
  pickerOpen.value = false;
  if (!name) { geofence.value = "disabled"; return; }
  const t2 = tasksStore.tasks.find((t) => t.name === name);
  geofence.value = classify(
    t2?.custom_latitude ?? null, t2?.custom_longitude ?? null,
    t2?.custom_geofence_radius_m ?? null, lat.value, lng.value,
  );
}
```

- [ ] **Step 3: Translations**

Append to `en.json` `checkin`:

```json
    ,"task": "Task",
    "no_task": "Standalone — no task",
    "pick_task": "Pick task"
```

And `ar.json`:

```json
    ,"task": "المهمة",
    "no_task": "عام — بدون مهمة",
    "pick_task": "اختر مهمة"
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/CheckinView.vue frontend/src/locales/
git commit -m "feat(checkin): task picker bottom sheet with live geofence recalc"
```

---

### Task 14b: Task detail BottomSheet — manual hours edit (spec §6.8)

**Files:**
- Modify: `frontend/src/views/TaskListView.vue`
- Modify: `apps/fatehhr/fatehhr/api/task.py`

- [ ] **Step 1: Add server endpoint to expose + edit today's timesheet row for a task**

Append to `task.py`:

```python
@frappe.whitelist()
def today_entry(task: str) -> dict:
    employee = _my_employee()
    from frappe.utils import today
    ts_name = frappe.db.get_value("Timesheet",
        {"employee": employee, "start_date": today(), "status": "Draft"}, "name")
    if not ts_name: return {"hours": 0, "rows": []}
    ts = frappe.get_doc("Timesheet", ts_name)
    rows = [{"idx": i, "from_time": r.from_time, "to_time": r.to_time, "hours": r.hours}
            for i, r in enumerate(ts.time_logs) if r.task == task]
    return {"timesheet": ts.name, "hours": sum(r["hours"] for r in rows), "rows": rows}


@frappe.whitelist()
def update_entry_hours(timesheet: str, row_idx: int, hours: float) -> dict:
    employee = _my_employee()
    ts = frappe.get_doc("Timesheet", timesheet)
    if ts.employee != employee:
        frappe.throw(frappe._("Not yours."), frappe.PermissionError)
    if row_idx < 0 or row_idx >= len(ts.time_logs):
        frappe.throw(frappe._("Bad row."))
    ts.time_logs[row_idx].hours = max(0.0, float(hours))
    ts.save()
    frappe.db.commit()
    return {"ok": True}
```

- [ ] **Step 2: Add API client methods**

In `frontend/src/api/task.ts`:

```typescript
  today_entry: (task: string) =>
    apiCall<{ timesheet?: string; hours: number; rows: { idx: number; from_time: string; to_time: string | null; hours: number }[] }>(
      "POST", "fatehhr.api.task.today_entry", { task }),
  update_entry_hours: (timesheet: string, row_idx: number, hours: number) =>
    apiCall<{ ok: true }>("POST", "fatehhr.api.task.update_entry_hours",
      { timesheet, row_idx, hours }),
```

- [ ] **Step 3: Add BottomSheet to TaskListView**

Add imports:

```typescript
import BottomSheet from "@/components/BottomSheet.vue";
import AmountDisplay from "@/components/AmountDisplay.vue";
import { taskApi } from "@/api/task";
```

State:

```typescript
const detailOpen = ref(false);
const detailTask = ref<string | null>(null);
const detailEntry = ref<Awaited<ReturnType<typeof taskApi.today_entry>> | null>(null);
const editHours = ref("");

async function openDetail(name: string) {
  detailTask.value = name;
  detailOpen.value = true;
  detailEntry.value = await taskApi.today_entry(name);
  editHours.value = String(detailEntry.value.hours.toFixed(2));
}

async function saveHours() {
  if (!detailEntry.value?.timesheet || !detailEntry.value.rows.length) return;
  const last = detailEntry.value.rows[detailEntry.value.rows.length - 1];
  await taskApi.update_entry_hours(detailEntry.value.timesheet, last.idx, Number(editHours.value));
  detailOpen.value = false;
}
```

Template — add a chevron to each task card that opens the sheet, and add the sheet at the end:

```vue
<button class="tasks__more" @click="openDetail(tk.name)">›</button>
...
<BottomSheet :open="detailOpen" :title="detailTask ?? ''" @close="detailOpen = false">
  <p>{{ t('tasks.today_hours') }}: <AmountDisplay :amount="Number(editHours) || 0" currency="h" size="md" /></p>
  <label><span>{{ t('tasks.adjust_hours') }}</span>
    <input v-model="editHours" type="number" step="0.25" min="0" /></label>
  <AppButton block @click="saveHours">{{ t('tasks.save_hours') }}</AppButton>
</BottomSheet>
```

- [ ] **Step 4: Translations**

`en.json` `tasks`:

```json
    ,"today_hours": "Logged today",
    "adjust_hours": "Manual adjustment",
    "save_hours": "Save"
```

`ar.json` matching.

- [ ] **Step 5: Commit**

```bash
git add apps/fatehhr/fatehhr/api/task.py frontend/src/api/task.ts frontend/src/views/TaskListView.vue frontend/src/locales/
git commit -m "feat(tasks): today_entry + manual hours adjustment sheet"
```

---

### Task 14c: 15-minute inactivity → PIN re-prompt (spec §7)

**Files:**
- Modify: `frontend/src/stores/session.ts`
- Modify: `frontend/src/main.ts`

- [ ] **Step 1: Track last activity + watchdog**

Add to `session.ts` state:

```typescript
    lastActivityAt: Date.now(),
```

And actions:

```typescript
    bumpActivity() { this.lastActivityAt = Date.now(); },
    shouldReprompt(): boolean {
      if (!this.hasApiSecret) return false;
      return Date.now() - this.lastActivityAt > 15 * 60 * 1000;
    },
```

- [ ] **Step 2: In `main.ts`, attach global listeners + periodic check**

After `app.mount`:

```typescript
const s = useSessionStore();
["pointerdown", "keydown", "touchstart", "focus"].forEach((ev) =>
  window.addEventListener(ev, () => s.bumpActivity(), { passive: true }),
);

setInterval(() => {
  if (s.shouldReprompt()) {
    s.isPinVerified = false;
    // Router guard in app/router.ts will force PIN on next nav; trigger one now:
    if (location.hash.indexOf("#/pin") === -1 && !location.pathname.endsWith("/pin")) {
      location.hash = "#/pin";
    }
  }
}, 30_000);
```

Also watch for app resume (visibilitychange) — Capacitor resume counts:

```typescript
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && s.shouldReprompt()) {
    s.isPinVerified = false;
    location.hash = "#/pin";
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/session.ts frontend/src/main.ts
git commit -m "feat(session): 15-min inactivity + resume PIN re-prompt"
```

---

### Task 15: End-of-phase verification

- [ ] **Step 1: Tests green**

```bash
bench --site fatehhr_dev run-tests --app fatehhr
cd frontend && pnpm test && pnpm build
```

- [ ] **Step 2: Brief §12 gate rows 6–8 + 11–14**

- [ ] **Row 6.** **Task timer** start → stop **offline** → online: timesheet detail + IN + OUT all land with correct paired timestamps.
- [ ] **Row 7.** **Payslip PDF** downloads and opens on native (after the APK exists — Phase 5; on web do the download in a browser).
- [ ] **Row 8.** **PIN login:** wrong PIN rejected; 5 failed attempts forces full re-login.
- [ ] **Row 11.** **Queue is empty** after every online happy-path flow.
- [ ] **Row 12.** **Sync Errors** is empty on the happy path.
- [ ] **Row 13.** Different `CUSTOMER_ERP_DOMAIN` / `BRAND` / `COLOR` → rebuild → app visibly theme-switches without code changes.
- [ ] **Row 14.** **Arabic locale:** full RTL, no mirrored icons that shouldn't mirror, dates/numbers localized correctly.
- [ ] Announcements: markdown renders bold/italic; `<script>` tags stripped.
- [ ] Payslip PDF cache: downloading the same slip twice hits the server once (network tab).
- [ ] Notifications bell: badge count matches unread count.
- [ ] Profile edit: emergency contact saves; disallowed field `ctc` submitted via browser console is rejected server-side.
- [ ] Settings → Discard pending: types `DISCARD` → queue + photos wiped; typing anything else → no-op.

- [ ] **Step 3: Tag**

```bash
git tag -a phase-4-full-modules -m "Phase 4 complete" && git push --tags
```

---

## Phase 4 Definition of Done

All boxes in Task 15 ticked. Every v1 module functional. Ready for [Phase 5](./2026-04-18-fatehhr-phase5-capacitor-rollout.md).
