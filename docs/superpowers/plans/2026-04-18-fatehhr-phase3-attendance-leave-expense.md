# Fateh HR — Phase 3: Attendance + Leave + Expense — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three full offline-capable feature tracks on top of the Phase 2 engine: (1) Attendance Calendar with per-day pair breakdown and monthly summary; (2) Leave Application (employee-only — apply, view own, cancel pending, live balance per type); (3) Expense Claims (multi-line with required receipt photo per line, ONE uploader). Add a Sync Errors view that reads `lastError`-marked queue entries. Brief §12 verification gates rows 3 + 4 + 5 pass.

**Architecture:** Backend adds `fatehhr.api.attendance.month` (pair summation + open-pair autoclose + status derivation), `fatehhr.api.leave.*` (thin wraps of HRMS primitives), and `fatehhr.api.expense.*` (wraps Expense Claim with child rows). Frontend adds three processors (`leave`, `expense`, and a placeholder `profile_update` that Phase 4 will fill), three stores, seven views, and a handful of shared form components. Every queued write follows the skill §4 invariants. Expense receipts flow through the ONE uploader identically to check-in selfies.

**Tech Stack:** Frappe v15 HRMS primitives (Leave Application / Leave Allocation / Expense Claim); reuse of Phase 2 offline engine (`queue`, `drain`, `photos`, `orphans`).

**Companion docs:**
- Visual direction: [`docs/superpowers/specs/2026-04-17-fatehhr-visual-direction.md`](../specs/2026-04-17-fatehhr-visual-direction.md)
- v1 design spec: [`docs/superpowers/specs/2026-04-18-fatehhr-v1-design.md`](../specs/2026-04-18-fatehhr-v1-design.md)
- Previous phases: [Phase 1](./2026-04-18-fatehhr-phase1-foundation.md), [Phase 2](./2026-04-18-fatehhr-phase2-offline-checkin.md)

---

## File structure added in Phase 3

```
apps/fatehhr/fatehhr/
  api/
    attendance.py
    leave.py
    expense.py
  tests/
    test_attendance.py
    test_leave.py
    test_expense.py

frontend/
  src/
    offline/
      processors/
        leave.ts
        expense.ts
        profile.ts                  # stub; filled in Phase 4
    stores/
      attendance.ts
      leave.ts
      expense.ts
    api/
      attendance.ts
      leave.ts
      expense.ts
    components/
      Card.vue
      Chip.vue
      SegmentedControl.vue
      BottomSheet.vue
      DateRangePicker.vue
      AmountDisplay.vue
      SkeletonBlock.vue
    views/
      AttendanceCalendarView.vue
      LeaveApplyView.vue
      LeaveListView.vue
      ExpenseClaimView.vue
      ExpenseListView.vue
      SyncErrorsView.vue
  tests/
    unit/
      attendance-month.spec.ts
      leave-processor.spec.ts
      expense-processor.spec.ts
```

---

## Tasks

### Task 1: `fatehhr.api.attendance.month` — pair summation + open-pair auto-close

**Files:**
- Create: `apps/fatehhr/fatehhr/api/attendance.py`
- Create: `apps/fatehhr/fatehhr/tests/test_attendance.py`

- [ ] **Step 1: Write failing tests**

`apps/fatehhr/fatehhr/tests/test_attendance.py`:

```python
import frappe
import unittest
from datetime import datetime

from fatehhr.tests.test_auth import _make_user, TEST_PASSWORD
from fatehhr.tests.test_checkin import _ensure_employee


def _mk_checkin(employee, time, log_type, task=None):
    doc = frappe.get_doc({
        "doctype": "Employee Checkin",
        "employee": employee,
        "log_type": log_type,
        "time": time,
        "custom_task": task,
    })
    doc.flags.ignore_permissions = True
    doc.insert()
    return doc


class TestAttendanceMonth(unittest.TestCase):
    def setUp(self):
        self.user = _make_user("attn-test@example.com")
        self.employee = _ensure_employee(self.user.email)
        frappe.db.sql("DELETE FROM `tabEmployee Checkin` WHERE employee=%s", self.employee)
        frappe.set_user(self.user.email)

    def tearDown(self):
        frappe.set_user("Administrator")

    def test_three_pairs_sum_hours_worked(self):
        from fatehhr.api.attendance import month
        # 9-11, 12-15, 16-17.5 → 2 + 3 + 1.5 = 6.5 hours
        day = "2026-04-15"
        _mk_checkin(self.employee, f"{day} 09:00:00", "IN")
        _mk_checkin(self.employee, f"{day} 11:00:00", "OUT")
        _mk_checkin(self.employee, f"{day} 12:00:00", "IN")
        _mk_checkin(self.employee, f"{day} 15:00:00", "OUT")
        _mk_checkin(self.employee, f"{day} 16:00:00", "IN")
        _mk_checkin(self.employee, f"{day} 17:30:00", "OUT")
        frappe.db.commit()
        data = month(year=2026, month=4)
        rec = next(d for d in data["days"] if d["date"] == day)
        self.assertAlmostEqual(rec["hours_worked"], 6.5, places=2)
        self.assertEqual(len(rec["pairs"]), 3)

    def test_open_pair_is_auto_closed_and_flagged(self):
        from fatehhr.api.attendance import month
        day = "2026-04-16"
        _mk_checkin(self.employee, f"{day} 09:00:00", "IN")
        # no OUT
        frappe.db.commit()
        data = month(year=2026, month=4)
        rec = next(d for d in data["days"] if d["date"] == day)
        self.assertEqual(len(rec["pairs"]), 1)
        self.assertTrue(rec["pairs"][0].get("open_pair_autoclosed"))
        self.assertLessEqual(rec["hours_worked"], 24)
```

- [ ] **Step 2: Run — fail**

```bash
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_attendance
```

- [ ] **Step 3: Implement `attendance.py`**

```python
import calendar
import datetime as dt
import frappe
from frappe.utils import get_datetime


@frappe.whitelist()
def month(year: int, month: int) -> dict:
    """Return daily summary for the given month for the logged-in employee."""
    employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if not employee:
        return {"year": int(year), "month": int(month), "days": []}

    year = int(year)
    month = int(month)
    start = dt.date(year, month, 1)
    last_day = calendar.monthrange(year, month)[1]
    end = dt.date(year, month, last_day)

    rows = frappe.get_all(
        "Employee Checkin",
        filters={
            "employee": employee,
            "time": ["between", [f"{start} 00:00:00", f"{end} 23:59:59"]],
        },
        fields=["name", "log_type", "time", "custom_task", "custom_location_address"],
        order_by="time asc",
    )

    by_day: dict[str, list] = {}
    for r in rows:
        d = get_datetime(r["time"]).date().isoformat()
        by_day.setdefault(d, []).append(r)

    attendance_rows = frappe.get_all(
        "Attendance",
        filters={"employee": employee,
                 "attendance_date": ["between", [start.isoformat(), end.isoformat()]]},
        fields=["name", "attendance_date", "status", "working_hours"],
    )
    att_by_day = {a.attendance_date.isoformat(): a for a in attendance_rows}

    leave_rows = frappe.get_all(
        "Leave Application",
        filters={
            "employee": employee, "status": "Approved",
            "from_date": ["<=", end.isoformat()],
            "to_date": [">=", start.isoformat()],
        },
        fields=["from_date", "to_date", "leave_type"],
    )

    holidays = _holidays_for_employee(employee, start, end)

    days = []
    d = start
    while d <= end:
        key = d.isoformat()
        day_rows = by_day.get(key, [])
        pairs = _build_pairs(day_rows, d)
        hours = round(sum((p["hours"] for p in pairs)), 2)
        status = _derive_status(d, att_by_day.get(key), pairs, leave_rows, holidays)
        days.append({
            "date": key,
            "status": status,
            "hours_worked": hours,
            "pairs": pairs,
        })
        d += dt.timedelta(days=1)

    summary = _summarize(days)
    return {"year": year, "month": month, "days": days, "summary": summary}


def _build_pairs(rows, for_date):
    pairs = []
    current_in = None
    for r in rows:
        t = get_datetime(r["time"])
        if r["log_type"] == "IN":
            if current_in is not None:
                # previous IN wasn't closed; treat as open → autoclosed at midnight
                pairs.append(_autoclose(current_in, for_date))
            current_in = r
        else:
            if current_in:
                dur = (t - get_datetime(current_in["time"])).total_seconds() / 3600.0
                pairs.append({
                    "in": current_in["time"].isoformat() if hasattr(current_in["time"], "isoformat") else str(current_in["time"]),
                    "out": t.isoformat(),
                    "task": current_in.get("custom_task"),
                    "location": current_in.get("custom_location_address"),
                    "hours": round(max(dur, 0), 2),
                })
                current_in = None
    if current_in:
        pairs.append(_autoclose(current_in, for_date))
    return pairs


def _autoclose(current_in, for_date):
    t_in = get_datetime(current_in["time"])
    midnight = dt.datetime.combine(for_date + dt.timedelta(days=1), dt.time.min)
    dur = (midnight - t_in).total_seconds() / 3600.0
    return {
        "in": t_in.isoformat(),
        "out": midnight.isoformat(),
        "task": current_in.get("custom_task"),
        "location": current_in.get("custom_location_address"),
        "hours": round(max(dur, 0), 2),
        "open_pair_autoclosed": True,
    }


def _derive_status(d, attendance_row, pairs, leave_rows, holidays):
    if attendance_row and attendance_row.status:
        return attendance_row.status
    if d.isoformat() in holidays:
        return "Holiday"
    for lv in leave_rows:
        if lv["from_date"] <= d <= lv["to_date"]:
            return "On Leave"
    if d.weekday() in (5, 6):  # Sat/Sun — could be customer-config later
        if not pairs:
            return "Weekend"
    if pairs:
        return "Present"
    if d < dt.date.today():
        return "Absent"
    return ""


def _holidays_for_employee(employee, start, end):
    holiday_list = frappe.db.get_value("Employee", employee, "holiday_list") or \
        frappe.db.get_single_value("HR Settings", "default_holiday_list")
    if not holiday_list:
        return set()
    rows = frappe.get_all(
        "Holiday", filters={"parent": holiday_list,
                            "holiday_date": ["between", [start.isoformat(), end.isoformat()]]},
        fields=["holiday_date"],
    )
    return {r.holiday_date.isoformat() for r in rows}


def _summarize(days):
    present = absent = on_leave = 0
    hours = 0.0
    for d in days:
        if d["status"] == "Present": present += 1
        elif d["status"] == "Absent": absent += 1
        elif d["status"] == "On Leave": on_leave += 1
        hours += d["hours_worked"]
    return {
        "present": present, "absent": absent, "on_leave": on_leave,
        "total_hours": round(hours, 2),
    }
```

- [ ] **Step 4: Run — pass**

```bash
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_attendance
```

- [ ] **Step 5: Commit**

```bash
git add fatehhr/api/attendance.py fatehhr/tests/test_attendance.py
git commit -m "feat(api): attendance.month with pair summation + open-pair autoclose"
git push
```

---

### Task 2: `fatehhr.api.leave` — types_with_balance, apply, cancel, list_mine

**Files:**
- Create: `apps/fatehhr/fatehhr/api/leave.py`
- Create: `apps/fatehhr/fatehhr/tests/test_leave.py`

- [ ] **Step 1: Write failing tests**

`apps/fatehhr/fatehhr/tests/test_leave.py`:

```python
import frappe
import unittest

from fatehhr.tests.test_auth import _make_user, TEST_PASSWORD
from fatehhr.tests.test_checkin import _ensure_employee


def _ensure_leave_type(name="Casual Leave-FHR", initial=10):
    if not frappe.db.exists("Leave Type", name):
        frappe.get_doc({
            "doctype": "Leave Type", "leave_type_name": name,
            "max_leaves_allowed": initial, "is_ppl": 0, "is_optional_leave": 0,
            "include_holiday": 0, "is_carry_forward": 0,
        }).insert(ignore_permissions=True)
    return name


class TestLeave(unittest.TestCase):
    def setUp(self):
        self.user = _make_user("leave-test@example.com")
        self.employee = _ensure_employee(self.user.email)
        self.leave_type = _ensure_leave_type()
        # Allocate
        if not frappe.db.exists("Leave Allocation", {
            "employee": self.employee, "leave_type": self.leave_type,
            "from_date": "2026-01-01"
        }):
            alloc = frappe.get_doc({
                "doctype": "Leave Allocation", "employee": self.employee,
                "leave_type": self.leave_type, "from_date": "2026-01-01",
                "to_date": "2026-12-31", "new_leaves_allocated": 10,
            })
            alloc.flags.ignore_permissions = True
            alloc.insert()
            alloc.submit()
            frappe.db.commit()
        frappe.set_user(self.user.email)

    def tearDown(self):
        frappe.set_user("Administrator")

    def test_types_with_balance_includes_type(self):
        from fatehhr.api.leave import types_with_balance
        rows = types_with_balance()
        names = [r["leave_type"] for r in rows]
        self.assertIn(self.leave_type, names)
        row = next(r for r in rows if r["leave_type"] == self.leave_type)
        self.assertGreaterEqual(row["balance"], 0)

    def test_apply_creates_leave(self):
        from fatehhr.api.leave import apply, list_mine
        r = apply(leave_type=self.leave_type, from_date="2026-06-10",
                  to_date="2026-06-10", half_day=0, reason="doctor")
        self.assertIn("name", r)
        mine = list_mine()
        self.assertTrue(any(m["name"] == r["name"] for m in mine))

    def test_cancel_own_pending(self):
        from fatehhr.api.leave import apply, cancel
        r = apply(leave_type=self.leave_type, from_date="2026-06-11",
                  to_date="2026-06-11", half_day=0, reason="")
        cancel(name=r["name"])
        doc = frappe.get_doc("Leave Application", r["name"])
        self.assertIn(doc.status, ("Cancelled", "Rejected"))
```

- [ ] **Step 2: Run — fail**

```bash
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_leave
```

- [ ] **Step 3: Implement `leave.py`**

```python
import frappe
from frappe.utils import nowdate


@frappe.whitelist()
def types_with_balance() -> list[dict]:
    employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if not employee:
        return []
    types = frappe.get_all(
        "Leave Type", fields=["name", "leave_type_name", "max_leaves_allowed", "color"]
    )
    from hrms.hr.doctype.leave_application.leave_application import get_leave_balance_on
    today = nowdate()
    out = []
    for t in types:
        try:
            balance = get_leave_balance_on(employee=employee, leave_type=t.name, date=today) or 0
        except Exception:
            balance = 0
        out.append({
            "leave_type": t.name,
            "label": t.leave_type_name,
            "balance": float(balance),
            "color": t.color,
        })
    return out


@frappe.whitelist()
def apply(
    leave_type: str,
    from_date: str,
    to_date: str,
    half_day: int = 0,
    half_day_date: str | None = None,
    reason: str | None = None,
) -> dict:
    employee = _my_employee()
    doc = frappe.get_doc({
        "doctype": "Leave Application",
        "employee": employee,
        "leave_type": leave_type,
        "from_date": from_date,
        "to_date": to_date,
        "half_day": int(half_day or 0),
        "half_day_date": half_day_date or None,
        "description": reason or "",
        "status": "Open",
    })
    doc.insert()
    # Don't auto-submit — let HRMS workflow transition on approver action
    frappe.db.commit()
    return {"name": doc.name, "status": doc.status, "total_leave_days": doc.total_leave_days}


@frappe.whitelist()
def cancel(name: str) -> dict:
    employee = _my_employee()
    doc = frappe.get_doc("Leave Application", name)
    if doc.employee != employee:
        frappe.throw(frappe._("Not your leave application."), frappe.PermissionError)
    if doc.status not in ("Open", "Cancelled"):
        # Approved leaves require a manager to cancel — v1.1 feature
        frappe.throw(frappe._("Only pending leaves can be cancelled from the app."))
    doc.status = "Cancelled"
    doc.save()
    frappe.db.commit()
    return {"name": doc.name, "status": doc.status}


@frappe.whitelist()
def list_mine(limit: int = 50) -> list[dict]:
    employee = _my_employee()
    return frappe.get_all(
        "Leave Application",
        filters={"employee": employee},
        fields=["name", "leave_type", "from_date", "to_date", "half_day",
                "total_leave_days", "description", "status"],
        order_by="from_date desc",
        limit=int(limit),
    )


def _my_employee() -> str:
    employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if not employee:
        frappe.throw(frappe._("No Employee linked to this user."))
    return employee
```

- [ ] **Step 4: Run — pass**

```bash
bench --site fatehhr_dev run-tests --app fatehhr --module fatehhr.tests.test_leave
```

- [ ] **Step 5: Commit**

```bash
git add fatehhr/api/leave.py fatehhr/tests/test_leave.py
git commit -m "feat(api): leave.types_with_balance / apply / cancel / list_mine"
git push
```

---

### Task 3: `fatehhr.api.expense` — submit_claim + list_mine

**Files:**
- Create: `apps/fatehhr/fatehhr/api/expense.py`
- Create: `apps/fatehhr/fatehhr/tests/test_expense.py`

- [ ] **Step 1: Write failing tests**

`apps/fatehhr/fatehhr/tests/test_expense.py`:

```python
import frappe
import unittest

from fatehhr.tests.test_auth import _make_user, TEST_PASSWORD
from fatehhr.tests.test_checkin import _ensure_employee


def _ensure_expense_type():
    if not frappe.db.exists("Expense Claim Type", "Travel-FHR"):
        frappe.get_doc({"doctype": "Expense Claim Type", "expense_type": "Travel-FHR"}
                       ).insert(ignore_permissions=True)
    return "Travel-FHR"


class TestExpense(unittest.TestCase):
    def setUp(self):
        self.user = _make_user("expense-test@example.com")
        self.employee = _ensure_employee(self.user.email)
        self.expense_type = _ensure_expense_type()
        frappe.set_user(self.user.email)

    def tearDown(self):
        frappe.set_user("Administrator")

    def test_submit_claim_creates_doc_with_lines(self):
        from fatehhr.api.expense import submit_claim, list_mine
        r = submit_claim(lines=[
            {"expense_type": self.expense_type, "expense_date": "2026-04-10",
             "amount": 120.50, "description": "taxi", "receipt_file_url": "/files/r1.jpg"},
            {"expense_type": self.expense_type, "expense_date": "2026-04-11",
             "amount": 33.00, "description": "meal", "receipt_file_url": "/files/r2.jpg"},
        ])
        self.assertIn("name", r)
        mine = list_mine()
        hit = next(m for m in mine if m["name"] == r["name"])
        self.assertAlmostEqual(float(hit["total_claimed_amount"]), 153.50, places=2)
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implement `expense.py`**

```python
import frappe


@frappe.whitelist()
def submit_claim(lines: list[dict], company: str | None = None) -> dict:
    employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if not employee:
        frappe.throw(frappe._("No Employee linked to this user."))
    if not lines:
        frappe.throw(frappe._("At least one expense line is required."))

    emp_doc = frappe.get_cached_doc("Employee", employee)
    claim = frappe.get_doc({
        "doctype": "Expense Claim",
        "employee": employee,
        "company": company or emp_doc.company,
        "expenses": [],
    })
    for ln in lines:
        claim.append("expenses", {
            "expense_date": ln.get("expense_date"),
            "expense_type": ln.get("expense_type"),
            "description": ln.get("description") or "",
            "amount": float(ln.get("amount") or 0),
            "sanctioned_amount": float(ln.get("amount") or 0),
        })
    claim.insert()

    # Attach receipts to the claim (one File per line, via its URL)
    for ln, row in zip(lines, claim.expenses, strict=True):
        if ln.get("receipt_file_url"):
            frappe.get_doc({
                "doctype": "File",
                "file_url": ln["receipt_file_url"],
                "attached_to_doctype": "Expense Claim",
                "attached_to_name": claim.name,
                "attached_to_field": "expenses",
                "folder": "Home/Attachments",
                "is_private": 0,
            }).insert(ignore_permissions=True)

    claim.save()
    frappe.db.commit()
    return {"name": claim.name, "total_claimed_amount": claim.total_claimed_amount}


@frappe.whitelist()
def list_mine(limit: int = 50) -> list[dict]:
    employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
    if not employee:
        return []
    return frappe.get_all(
        "Expense Claim",
        filters={"employee": employee},
        fields=["name", "posting_date", "total_claimed_amount",
                "total_sanctioned_amount", "status", "approval_status"],
        order_by="posting_date desc",
        limit=int(limit),
    )
```

- [ ] **Step 4: Run — pass**

- [ ] **Step 5: Commit**

```bash
git add fatehhr/api/expense.py fatehhr/tests/test_expense.py
git commit -m "feat(api): expense.submit_claim + list_mine"
git push
```

---

### Task 4: Frontend — shared components (`Card`, `Chip`, `SegmentedControl`, `BottomSheet`, `DateRangePicker`, `AmountDisplay`, `SkeletonBlock`)

**Files:**
- Create: `frontend/src/components/Card.vue`
- Create: `frontend/src/components/Chip.vue`
- Create: `frontend/src/components/SegmentedControl.vue`
- Create: `frontend/src/components/BottomSheet.vue`
- Create: `frontend/src/components/DateRangePicker.vue`
- Create: `frontend/src/components/AmountDisplay.vue`
- Create: `frontend/src/components/SkeletonBlock.vue`

- [ ] **Step 1: `Card.vue`**

```vue
<template><div class="card"><slot /></div></template>
<style scoped>
.card { background: var(--bg-surface); border-radius: var(--r-lg); box-shadow: var(--e-1); padding: 16px; }
</style>
```

- [ ] **Step 2: `Chip.vue`**

```vue
<script setup lang="ts">
defineProps<{
  variant?: "neutral" | "pending" | "approved" | "rejected" | "paid" | "draft" | "info";
  dot?: boolean;
}>();
</script>

<template>
  <span class="chip" :class="`chip--${variant ?? 'neutral'}`">
    <span v-if="dot" class="chip__dot" />
    <slot />
  </span>
</template>

<style scoped>
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; font-size: 12px; border-radius: var(--r-full);
  background: var(--bg-sunk); color: var(--ink-secondary);
}
.chip__dot { width: 6px; height: 6px; border-radius: var(--r-full); background: currentColor; }
.chip--pending   { background: var(--warning-soft); color: var(--warning); }
.chip--approved  { background: var(--success-soft); color: var(--success); }
.chip--rejected  { background: var(--danger-soft); color: var(--danger); }
.chip--paid      { background: var(--success-soft); color: var(--success); }
.chip--draft     { background: var(--bg-sunk); color: var(--ink-secondary); }
.chip--info      { background: var(--info-soft); color: var(--info); }
</style>
```

- [ ] **Step 3: `SegmentedControl.vue`**

```vue
<script setup lang="ts">
defineProps<{ options: { label: string; value: string }[]; modelValue: string }>();
defineEmits<{ "update:modelValue": [v: string] }>();
</script>

<template>
  <div class="seg">
    <button v-for="o in options" :key="o.value"
      :class="['seg__btn', { 'is-active': modelValue === o.value }]"
      @click="$emit('update:modelValue', o.value)">
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.seg { display: inline-flex; background: var(--bg-sunk); border-radius: var(--r-md); padding: 3px; }
.seg__btn { padding: 8px 14px; font-size: 13px; border-radius: calc(var(--r-md) - 2px); color: var(--ink-secondary); }
.seg__btn.is-active { background: var(--bg-surface); box-shadow: var(--e-1); color: var(--ink-primary); }
</style>
```

- [ ] **Step 4: `BottomSheet.vue`**

```vue
<script setup lang="ts">
defineProps<{ open: boolean; title?: string }>();
defineEmits<{ close: [] }>();
</script>

<template>
  <teleport to="body">
    <div v-if="open" class="sheet-scrim" @click.self="$emit('close')">
      <div class="sheet" role="dialog" aria-modal="true">
        <div class="sheet__handle" />
        <h2 v-if="title" class="sheet__title">{{ title }}</h2>
        <div class="sheet__body"><slot /></div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.sheet-scrim {
  position: fixed; inset: 0; background: rgba(26,23,20,.45);
  display: flex; align-items: flex-end; z-index: 50;
}
.sheet {
  background: var(--bg-surface); width: 100%;
  border-top-left-radius: var(--r-xl); border-top-right-radius: var(--r-xl);
  padding: 12px var(--page-gutter) calc(24px + env(safe-area-inset-bottom));
  max-height: 86vh; overflow: auto;
  animation: slideUp var(--m-base) forwards;
}
.sheet__handle { width: 36px; height: 4px; border-radius: var(--r-full); background: var(--hairline-strong); margin: 0 auto 12px; }
.sheet__title { font-family: var(--font-display); font-weight: 400; font-size: 20px; margin: 0 0 12px; }
[dir="rtl"] .sheet__title { font-family: var(--font-display-ar); font-weight: 500; }
@keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .sheet { animation: none; } }
</style>
```

- [ ] **Step 5: `DateRangePicker.vue`**

```vue
<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{ from: string | null; to: string | null; singleDay?: boolean }>();
const emit = defineEmits<{ "update:from": [v: string]; "update:to": [v: string] }>();

const fromRef = ref(props.from ?? "");
const toRef = ref(props.to ?? "");
watch(() => props.from, (v) => (fromRef.value = v ?? ""));
watch(() => props.to, (v) => (toRef.value = v ?? ""));
</script>

<template>
  <div class="drp">
    <label>
      <span>{{ singleDay ? "Date" : "From" }}</span>
      <input type="date" v-model="fromRef"
        @change="emit('update:from', fromRef); if (singleDay) emit('update:to', fromRef)" />
    </label>
    <label v-if="!singleDay">
      <span>To</span>
      <input type="date" v-model="toRef" @change="emit('update:to', toRef)" />
    </label>
  </div>
</template>

<style scoped>
.drp { display: flex; gap: 12px; }
.drp label { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.drp label span { font-size: 12px; color: var(--ink-secondary); letter-spacing: .04em; text-transform: uppercase; }
.drp input {
  background: var(--bg-sunk); border: 0; border-radius: var(--r-md);
  padding: 12px; font-size: 15px; color: var(--ink-primary);
}
</style>
```

- [ ] **Step 6: `AmountDisplay.vue`**

```vue
<script setup lang="ts">
defineProps<{ amount: number; currency: string; size?: "lg" | "md" }>();
</script>
<template>
  <span :class="['amt', `amt--${size ?? 'lg'}`]">
    <span class="amt__num">{{ amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
    <span class="amt__cur">{{ currency }}</span>
  </span>
</template>
<style scoped>
.amt { display: inline-flex; align-items: baseline; gap: 8px; font-family: var(--font-mono); color: var(--ink-primary); }
.amt--lg .amt__num { font-size: 28px; }
.amt--md .amt__num { font-size: 17px; }
.amt__cur { font-size: 11px; color: var(--ink-secondary); letter-spacing: .06em; text-transform: uppercase; }
</style>
```

- [ ] **Step 7: `SkeletonBlock.vue`**

```vue
<script setup lang="ts">
defineProps<{ height?: string; width?: string; radius?: string }>();
</script>
<template>
  <div class="skel" :style="{ height: height ?? '16px', width: width ?? '100%', borderRadius: radius ?? 'var(--r-md)' }" />
</template>
<style scoped>
.skel {
  background: linear-gradient(90deg, var(--bg-sunk), var(--hairline), var(--bg-sunk));
  background-size: 200% 100%;
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse { 0% { background-position: 0 0; } 100% { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .skel { animation: none; background: var(--bg-sunk); } }
</style>
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/
git commit -m "feat(frontend): shared components (Card, Chip, Segmented, Sheet, DRP, Amount, Skeleton)"
```

---

### Task 5: `api/attendance.ts`, `api/leave.ts`, `api/expense.ts`

**Files:**
- Create: `frontend/src/api/attendance.ts`
- Create: `frontend/src/api/leave.ts`
- Create: `frontend/src/api/expense.ts`

- [ ] **Step 1: Implement**

`frontend/src/api/attendance.ts`:

```typescript
import { apiCall } from "./client";

export interface DayRec {
  date: string;
  status: string;
  hours_worked: number;
  pairs: {
    in: string; out: string; task: string | null; location: string | null;
    hours: number; open_pair_autoclosed?: boolean;
  }[];
}

export interface MonthResp {
  year: number; month: number;
  days: DayRec[];
  summary: { present: number; absent: number; on_leave: number; total_hours: number };
}

export const attendanceApi = {
  month: (year: number, month: number) =>
    apiCall<MonthResp>("POST", "fatehhr.api.attendance.month", { year, month }),
};
```

`frontend/src/api/leave.ts`:

```typescript
import { apiCall } from "./client";

export interface LeaveTypeBalance { leave_type: string; label: string; balance: number; color: string | null; }
export interface LeaveRow {
  name: string; leave_type: string; from_date: string; to_date: string;
  half_day: number; total_leave_days: number; description: string; status: string;
}

export const leaveApi = {
  types_with_balance: () => apiCall<LeaveTypeBalance[]>("GET", "fatehhr.api.leave.types_with_balance"),
  apply: (p: { leave_type: string; from_date: string; to_date: string; half_day?: 0 | 1; reason?: string }) =>
    apiCall<{ name: string; status: string; total_leave_days: number }>(
      "POST", "fatehhr.api.leave.apply", p),
  cancel: (name: string) => apiCall<{ name: string; status: string }>("POST", "fatehhr.api.leave.cancel", { name }),
  list_mine: () => apiCall<LeaveRow[]>("GET", "fatehhr.api.leave.list_mine"),
};
```

`frontend/src/api/expense.ts`:

```typescript
import { apiCall } from "./client";

export interface ExpenseLine {
  expense_type: string; expense_date: string; amount: number;
  description: string; receipt_file_url?: string | null;
}
export interface ExpenseClaimRow {
  name: string; posting_date: string;
  total_claimed_amount: number; total_sanctioned_amount: number;
  status: string; approval_status: string;
}

export const expenseApi = {
  submit: (lines: ExpenseLine[], company?: string) =>
    apiCall<{ name: string; total_claimed_amount: number }>(
      "POST", "fatehhr.api.expense.submit_claim", { lines, company }),
  list_mine: () => apiCall<ExpenseClaimRow[]>("GET", "fatehhr.api.expense.list_mine"),
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/attendance.ts frontend/src/api/leave.ts frontend/src/api/expense.ts
git commit -m "feat(api): attendance/leave/expense client modules"
```

---

### Task 6: Processors — `leave.ts`, `expense.ts`, placeholder `profile.ts`

**Files:**
- Create: `frontend/src/offline/processors/leave.ts`
- Create: `frontend/src/offline/processors/expense.ts`
- Create: `frontend/src/offline/processors/profile.ts`
- Create: `frontend/tests/unit/leave-processor.spec.ts`
- Create: `frontend/tests/unit/expense-processor.spec.ts`

- [ ] **Step 1: `leave.ts` processor**

```typescript
import type { QueueRecord } from "@/offline/db";
import { registerProcessor } from "@/offline/drain";
import { apiCall } from "@/api/client";

registerProcessor("leave", async (entry: QueueRecord) => {
  const p = entry.payload as {
    leave_type: string; from_date: string; to_date: string;
    half_day: 0 | 1; reason: string;
  };
  await apiCall("POST", "fatehhr.api.leave.apply", p);
});
```

- [ ] **Step 2: `expense.ts` processor — ONE uploader for each line**

```typescript
import type { QueueRecord } from "@/offline/db";
import { registerProcessor } from "@/offline/drain";
import { apiCall } from "@/api/client";
import { uploadPhoto } from "@/offline/photos";

interface ExpenseLinePayload {
  expense_type: string; expense_date: string;
  amount: number; description: string;
  receipt_photo_id?: string | null;
  receipt_file_url?: string | null;
}

registerProcessor("expense", async (entry: QueueRecord) => {
  const p = entry.payload as { lines: ExpenseLinePayload[]; company?: string | null };
  const resolved = [] as { expense_type: string; expense_date: string; amount: number; description: string; receipt_file_url: string | null }[];
  for (const ln of p.lines) {
    let url = ln.receipt_file_url ?? null;
    if (!url && ln.receipt_photo_id) {
      url = await uploadPhoto(ln.receipt_photo_id);
    }
    resolved.push({
      expense_type: ln.expense_type,
      expense_date: ln.expense_date,
      amount: ln.amount,
      description: ln.description,
      receipt_file_url: url,
    });
  }
  await apiCall("POST", "fatehhr.api.expense.submit_claim", { lines: resolved, company: p.company });
});
```

- [ ] **Step 3: `profile.ts` placeholder — fleshed out in Phase 4**

```typescript
import { registerProcessor } from "@/offline/drain";
import { apiCall } from "@/api/client";

registerProcessor("profile_update", async (entry) => {
  await apiCall("POST", "fatehhr.api.me.update_profile", entry.payload as any);
});
```

- [ ] **Step 4: Register all from `main.ts`**

Prepend imports in `frontend/src/main.ts` (merge with existing):

```typescript
import "@/offline/processors/checkin";
import "@/offline/processors/leave";
import "@/offline/processors/expense";
import "@/offline/processors/profile";
```

- [ ] **Step 5: Tests for leave + expense processors**

`frontend/tests/unit/leave-processor.spec.ts`:

```typescript
import "fake-indexeddb/auto";
import "@/offline/processors/leave";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetDb } from "@/offline/db";
import { saveItem, listPending } from "@/offline/queue";
import { drain } from "@/offline/drain";

describe("leave processor", () => {
  beforeEach(async () => await resetDb());

  it("POSTs leave.apply and removes entry on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: { name: "LV-0001", status: "Open", total_leave_days: 1 } }),
      { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await saveItem("leave", "logical-a", {
      leave_type: "Casual-FHR", from_date: "2026-06-01", to_date: "2026-06-01",
      half_day: 0, reason: "r",
    }, []);
    await drain();
    expect(await listPending()).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("fatehhr.api.leave.apply"),
      expect.any(Object),
    );
  });
});
```

`frontend/tests/unit/expense-processor.spec.ts`:

```typescript
import "fake-indexeddb/auto";
import "@/offline/processors/expense";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetDb } from "@/offline/db";
import { saveItem, listPending } from "@/offline/queue";
import { drain } from "@/offline/drain";
import { savePhoto } from "@/offline/photos";

describe("expense processor", () => {
  beforeEach(async () => await resetDb());

  it("uploads each receipt ONCE then submits claim with resolved URLs", async () => {
    const pid1 = await savePhoto(new Blob(["a"], { type: "image/jpeg" }), "image/jpeg");
    const pid2 = await savePhoto(new Blob(["b"], { type: "image/jpeg" }), "image/jpeg");

    const uploadResponses = [
      new Response(JSON.stringify({ message: { file_url: "/files/u1.jpg" } }),
        { status: 200, headers: { "content-type": "application/json" } }),
      new Response(JSON.stringify({ message: { file_url: "/files/u2.jpg" } }),
        { status: 200, headers: { "content-type": "application/json" } }),
    ];
    let uploads = 0;
    let submits = 0;

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("upload_file")) return uploadResponses[uploads++];
      if (url.includes("submit_claim")) {
        submits++;
        return new Response(JSON.stringify({ message: { name: "EC-1", total_claimed_amount: 3 } }),
          { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await saveItem("expense", "claim-1", {
      lines: [
        { expense_type: "Travel-FHR", expense_date: "2026-04-10", amount: 1, description: "a", receipt_photo_id: pid1 },
        { expense_type: "Travel-FHR", expense_date: "2026-04-11", amount: 2, description: "b", receipt_photo_id: pid2 },
      ],
    }, [pid1, pid2]);

    await drain();
    expect(uploads).toBe(2);
    expect(submits).toBe(1);
    expect(await listPending()).toEqual([]);

    // Re-running drain would NOT re-upload even if the entry re-appeared
    // (uploadPhoto memoizes serverUrl) — regression check:
    await saveItem("expense", "claim-2", {
      lines: [{ expense_type: "Travel-FHR", expense_date: "2026-04-12", amount: 3, description: "c", receipt_photo_id: pid1 }],
    }, [pid1]);
    await drain();
    expect(uploads).toBe(2);
  });
});
```

- [ ] **Step 6: Run — pass**

```bash
cd frontend && pnpm test
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/offline/processors/ frontend/src/main.ts frontend/tests/unit/
git commit -m "feat(offline): leave + expense + profile processors; ONE-uploader dedup test"
```

---

### Task 7: `stores/attendance.ts` + Calendar view

**Files:**
- Create: `frontend/src/stores/attendance.ts`
- Create: `frontend/src/views/AttendanceCalendarView.vue`
- Modify: `frontend/src/app/router.ts`

- [ ] **Step 1: Implement store**

```typescript
import { defineStore } from "pinia";
import { attendanceApi, type MonthResp, type DayRec } from "@/api/attendance";
import { openDb, STORE } from "@/offline/db";

function cacheKey(y: number, m: number) { return `attendance.month:${y}-${m}`; }

export const useAttendanceStore = defineStore("attendance", {
  state: () => ({
    current: null as MonthResp | null,
    loading: false,
  }),
  actions: {
    async loadMonth(year: number, month: number) {
      this.loading = true;
      const db = await openDb();
      try {
        const resp = await attendanceApi.month(year, month);
        this.current = resp;
        await db.put(STORE.cache, resp, cacheKey(year, month));
      } catch {
        const cached = (await db.get(STORE.cache, cacheKey(year, month))) as MonthResp | undefined;
        this.current = cached ?? null;
      } finally {
        this.loading = false;
      }
    },
    dayFor(date: string): DayRec | null {
      return this.current?.days.find((d) => d.date === date) ?? null;
    },
  },
});
```

- [ ] **Step 2: `AttendanceCalendarView.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import BottomSheet from "@/components/BottomSheet.vue";
import Card from "@/components/Card.vue";
import { useAttendanceStore } from "@/stores/attendance";

const { t } = useI18n();
const router = useRouter();
const store = useAttendanceStore();

const now = new Date();
const year = ref(now.getFullYear());
const month = ref(now.getMonth() + 1);
const selectedDate = ref<string | null>(null);

onMounted(() => store.loadMonth(year.value, month.value));

const days = computed(() => store.current?.days ?? []);
const summary = computed(() => store.current?.summary);

function prev() { if (month.value === 1) { month.value = 12; year.value--; } else month.value--; store.loadMonth(year.value, month.value); }
function next() { if (month.value === 12) { month.value = 1; year.value++; } else month.value++; store.loadMonth(year.value, month.value); }

function statusClass(s: string) {
  return ({
    "Present": "is-present", "Absent": "is-absent", "Half Day": "is-half",
    "On Leave": "is-leave", "Holiday": "is-holiday", "Weekend": "is-weekend",
  } as const)[s as any] ?? "";
}

function tap(d: string) { selectedDate.value = d; }
const selected = computed(() => selectedDate.value ? store.dayFor(selectedDate.value) : null);
</script>

<template>
  <main class="cal">
    <TopAppBar :title="t('attendance.title')" back @back="router.back()" />
    <SyncBar />
    <header class="cal__head">
      <button @click="prev">‹</button>
      <h2>{{ year }} / {{ String(month).padStart(2, "0") }}</h2>
      <button @click="next">›</button>
    </header>

    <div class="cal__grid">
      <div v-for="d in days" :key="d.date"
           :class="['cal__cell', statusClass(d.status)]"
           @click="tap(d.date)">
        <span class="cal__dow">{{ Number(d.date.slice(-2)) }}</span>
      </div>
    </div>

    <Card v-if="summary" class="cal__summary">
      <div><strong>{{ summary.present }}</strong> {{ t("attendance.present") }}</div>
      <div><strong>{{ summary.absent }}</strong> {{ t("attendance.absent") }}</div>
      <div><strong>{{ summary.on_leave }}</strong> {{ t("attendance.on_leave") }}</div>
      <div><strong>{{ summary.total_hours.toFixed(1) }}</strong> {{ t("attendance.hours") }}</div>
    </Card>

    <BottomSheet :open="!!selected" :title="selected?.date" @close="selectedDate = null">
      <template v-if="selected">
        <p>{{ t('attendance.status') }}: <strong>{{ selected.status }}</strong></p>
        <p>{{ t('attendance.hours') }}: <strong>{{ selected.hours_worked.toFixed(2) }}</strong></p>
        <ul class="cal__pairs">
          <li v-for="(p, i) in selected.pairs" :key="i">
            {{ p.in.slice(11,16) }} → {{ p.out.slice(11,16) }}
            · {{ p.task ?? t('attendance.no_task') }}
            <em v-if="p.open_pair_autoclosed">({{ t('attendance.autoclosed') }})</em>
          </li>
        </ul>
      </template>
    </BottomSheet>

    <BottomNav />
  </main>
</template>

<style scoped>
.cal { padding: 0 var(--page-gutter) 120px; }
.cal__head { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; }
.cal__head h2 { font-family: var(--font-display); font-weight: 400; font-size: 22px; margin: 0; }
.cal__grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.cal__cell {
  aspect-ratio: 1 / 1; border-radius: var(--r-md);
  background: var(--bg-sunk); display: grid; place-items: center;
  color: var(--ink-secondary); font-variant-numeric: tabular-nums;
}
.cal__cell.is-present  { background: #D8E8DE; color: var(--success); }
.cal__cell.is-absent   { background: #F2DBD6; color: var(--danger); }
.cal__cell.is-half     { background: #F2E4C7; color: var(--warning); }
.cal__cell.is-leave    { background: #D8E0EA; color: var(--info); }
.cal__cell.is-holiday  { background: var(--hairline); color: var(--ink-tertiary); }
.cal__cell.is-weekend  { background: var(--bg-sunk); color: var(--ink-tertiary); }
.cal__summary { margin-top: 16px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; text-align: center; }
.cal__pairs { padding-left: 16px; }
</style>
```

- [ ] **Step 3: Translations**

`en.json`:

```json
  ,"attendance": {
    "title": "Attendance",
    "status": "Status",
    "hours": "Hours",
    "present": "Present",
    "absent": "Absent",
    "on_leave": "On Leave",
    "no_task": "No task",
    "autoclosed": "auto-closed at midnight"
  }
```

`ar.json`:

```json
  ,"attendance": {
    "title": "الحضور",
    "status": "الحالة",
    "hours": "الساعات",
    "present": "حاضر",
    "absent": "غائب",
    "on_leave": "في إجازة",
    "no_task": "بدون مهمة",
    "autoclosed": "أُغلقت عند منتصف الليل"
  }
```

- [ ] **Step 4: Route**

Append to `router.ts` children:

```typescript
{ path: "attendance", name: "attendance", component: () => import("@/views/AttendanceCalendarView.vue") },
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/attendance.ts frontend/src/views/AttendanceCalendarView.vue frontend/src/app/router.ts frontend/src/locales/
git commit -m "feat(attendance): calendar view with pair detail sheet"
```

---

### Task 8: `stores/leave.ts` + Leave Apply + List views

**Files:**
- Create: `frontend/src/stores/leave.ts`
- Create: `frontend/src/views/LeaveApplyView.vue`
- Create: `frontend/src/views/LeaveListView.vue`
- Modify: `frontend/src/app/router.ts`

- [ ] **Step 1: `stores/leave.ts`**

```typescript
import { defineStore } from "pinia";
import { leaveApi, type LeaveTypeBalance, type LeaveRow } from "@/api/leave";
import { saveItem } from "@/offline/queue";
import { useSyncStore } from "@/stores/sync";
import { v4 as uuid } from "uuid";

export const useLeaveStore = defineStore("leave", {
  state: () => ({
    types: [] as LeaveTypeBalance[],
    mine: [] as LeaveRow[],
    pendingLocal: [] as { draftId: string; leave_type: string; from_date: string; to_date: string; status: "pending-sync" }[],
  }),
  actions: {
    async loadTypes() { try { this.types = await leaveApi.types_with_balance(); } catch {} },
    async loadMine() { try { this.mine = await leaveApi.list_mine(); } catch {} },

    async apply(p: { leave_type: string; from_date: string; to_date: string; half_day: 0 | 1; reason: string }) {
      const sync = useSyncStore();
      if (sync.isOnline) {
        try {
          const r = await leaveApi.apply(p);
          await this.loadMine();
          return { mode: "online" as const, row: r };
        } catch { /* fall through */ }
      }
      const draftId = uuid();
      await saveItem("leave", `leave:${draftId}`, p, []);
      this.pendingLocal.push({ draftId, leave_type: p.leave_type, from_date: p.from_date, to_date: p.to_date, status: "pending-sync" });
      await sync.refresh();
      return { mode: "queued" as const };
    },

    async cancel(name: string) {
      await leaveApi.cancel(name);
      await this.loadMine();
    },
  },
});
```

- [ ] **Step 2: `LeaveApplyView.vue`**

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import Card from "@/components/Card.vue";
import AppButton from "@/components/Button.vue";
import SegmentedControl from "@/components/SegmentedControl.vue";
import DateRangePicker from "@/components/DateRangePicker.vue";
import { useLeaveStore } from "@/stores/leave";

const { t } = useI18n();
const router = useRouter();
const store = useLeaveStore();

const tab = ref("apply");
const leaveType = ref("");
const fromDate = ref<string>(new Date().toISOString().slice(0, 10));
const toDate = ref<string>(new Date().toISOString().slice(0, 10));
const halfDay = ref<0 | 1>(0);
const reason = ref("");
const busy = ref(false);
const message = ref<string | null>(null);

onMounted(async () => {
  await store.loadTypes();
  if (!leaveType.value && store.types.length) leaveType.value = store.types[0].leave_type;
});

const selectedBalance = computed(() =>
  store.types.find((t) => t.leave_type === leaveType.value)?.balance ?? 0);

async function submit() {
  busy.value = true;
  try {
    const res = await store.apply({ leave_type: leaveType.value, from_date: fromDate.value, to_date: toDate.value, half_day: halfDay.value, reason: reason.value });
    message.value = res.mode === "online" ? t("leave.submitted") : t("leave.queued");
    reason.value = "";
  } catch (e: any) {
    message.value = e?.message || "error";
  } finally {
    busy.value = false;
  }
}

function goList() { router.push({ name: "leave.list" }); }
</script>

<template>
  <main class="leave-apply">
    <TopAppBar :title="t('leave.title')" back @back="router.back()" />
    <SyncBar />
    <SegmentedControl class="leave-apply__tabs" :model-value="tab"
      :options="[{ label: t('leave.apply'), value: 'apply' }, { label: t('leave.mine'), value: 'mine' }]"
      @update:model-value="(v) => v === 'mine' ? goList() : null" />

    <form class="leave-apply__form" @submit.prevent="submit">
      <label>
        <span>{{ t("leave.type") }}</span>
        <select v-model="leaveType">
          <option v-for="tt in store.types" :key="tt.leave_type" :value="tt.leave_type">
            {{ tt.label }} — {{ tt.balance.toFixed(1) }} {{ t("leave.days_left") }}
          </option>
        </select>
      </label>

      <DateRangePicker v-model:from="fromDate" v-model:to="toDate" />

      <label class="leave-apply__half">
        <input type="checkbox" :checked="halfDay === 1" @change="halfDay = ($event.target as HTMLInputElement).checked ? 1 : 0" />
        <span>{{ t("leave.half_day") }}</span>
      </label>

      <label>
        <span>{{ t("leave.reason") }}</span>
        <textarea v-model="reason" rows="3" />
      </label>

      <Card class="leave-apply__balance">
        <h3>{{ t("leave.balance_card") }}</h3>
        <p class="leave-apply__balance-num">{{ selectedBalance.toFixed(1) }} {{ t("leave.days_left") }}</p>
      </Card>

      <AppButton block type="submit" :disabled="busy">{{ t("leave.submit") }}</AppButton>
      <p v-if="message" class="leave-apply__msg">{{ message }}</p>
    </form>

    <BottomNav />
  </main>
</template>

<style scoped>
.leave-apply { padding: 0 var(--page-gutter) 120px; }
.leave-apply__tabs { display: flex; margin: 8px 0 16px; }
.leave-apply__form { display: flex; flex-direction: column; gap: 14px; }
.leave-apply__form label { display: flex; flex-direction: column; gap: 6px; }
.leave-apply__form label span {
  font-size: 12px; color: var(--ink-secondary); text-transform: uppercase; letter-spacing: .04em;
}
.leave-apply__form select, .leave-apply__form textarea {
  background: var(--bg-sunk); border: 0; border-radius: var(--r-md);
  padding: 12px; font-size: 15px; color: var(--ink-primary);
}
.leave-apply__half { flex-direction: row !important; align-items: center; gap: 10px; }
.leave-apply__balance h3 { font-family: var(--font-display); font-weight: 400; font-size: 17px; margin: 0 0 4px; }
.leave-apply__balance-num { font-family: var(--font-mono); font-size: 24px; margin: 0; }
.leave-apply__msg { color: var(--ink-secondary); font-size: 13px; }
</style>
```

- [ ] **Step 3: `LeaveListView.vue`**

```vue
<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import ListRow from "@/components/ListRow.vue";
import Chip from "@/components/Chip.vue";
import AppButton from "@/components/Button.vue";
import { useLeaveStore } from "@/stores/leave";

const { t } = useI18n();
const router = useRouter();
const store = useLeaveStore();

onMounted(() => store.loadMine());

function variantFor(status: string): any {
  const map: any = { "Open": "pending", "Approved": "approved", "Rejected": "rejected", "Cancelled": "draft" };
  return map[status] ?? "neutral";
}

async function cancel(name: string) {
  if (!confirm(t("leave.cancel_confirm"))) return;
  try { await store.cancel(name); } catch (e: any) { alert(e?.message || "error"); }
}
</script>

<template>
  <main class="leave-list">
    <TopAppBar :title="t('leave.mine')" back @back="router.back()" />
    <SyncBar />

    <div v-for="r in store.mine" :key="r.name" class="leave-list__row">
      <ListRow :title="r.leave_type" :subtitle="`${r.from_date} → ${r.to_date}`" :trailing="`${r.total_leave_days}d`" />
      <div class="leave-list__meta">
        <Chip :variant="variantFor(r.status)">{{ r.status }}</Chip>
        <AppButton v-if="r.status === 'Open'" variant="ghost" @click="cancel(r.name)">{{ t('leave.cancel') }}</AppButton>
      </div>
    </div>

    <div v-for="p in store.pendingLocal" :key="p.draftId" class="leave-list__row">
      <ListRow :title="p.leave_type" :subtitle="`${p.from_date} → ${p.to_date}`" />
      <Chip variant="pending">{{ t('leave.pending_sync') }}</Chip>
    </div>

    <BottomNav />
  </main>
</template>

<style scoped>
.leave-list { padding-bottom: 120px; }
.leave-list__row { padding-bottom: 8px; }
.leave-list__meta { display: flex; align-items: center; gap: 8px; padding: 4px var(--page-gutter) 12px; }
</style>
```

- [ ] **Step 4: Translations**

`en.json`:

```json
  ,"leave": {
    "title": "Leave",
    "apply": "Apply",
    "mine": "My Leaves",
    "type": "Leave Type",
    "days_left": "days left",
    "half_day": "Half day",
    "reason": "Reason",
    "balance_card": "Balance",
    "submit": "Submit",
    "submitted": "Submitted.",
    "queued": "Queued — will submit when online.",
    "cancel": "Cancel",
    "cancel_confirm": "Cancel this pending leave?",
    "pending_sync": "Pending sync"
  }
```

`ar.json`:

```json
  ,"leave": {
    "title": "الإجازة",
    "apply": "طلب جديد",
    "mine": "إجازاتي",
    "type": "نوع الإجازة",
    "days_left": "يوم متبقٍ",
    "half_day": "نصف يوم",
    "reason": "السبب",
    "balance_card": "الرصيد",
    "submit": "إرسال",
    "submitted": "تم الإرسال.",
    "queued": "في قائمة الانتظار — سيتم الإرسال عند الاتصال.",
    "cancel": "إلغاء",
    "cancel_confirm": "إلغاء هذا الطلب؟",
    "pending_sync": "بانتظار المزامنة"
  }
```

- [ ] **Step 5: Routes**

Append in `router.ts`:

```typescript
{ path: "leave", name: "leave", component: () => import("@/views/LeaveApplyView.vue") },
{ path: "leave/mine", name: "leave.list", component: () => import("@/views/LeaveListView.vue") },
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/leave.ts frontend/src/views/LeaveApplyView.vue frontend/src/views/LeaveListView.vue frontend/src/app/router.ts frontend/src/locales/
git commit -m "feat(leave): apply + list views with queue-on-offline"
```

---

### Task 9: `stores/expense.ts` + Expense Claim + List views

**Files:**
- Create: `frontend/src/stores/expense.ts`
- Create: `frontend/src/views/ExpenseClaimView.vue`
- Create: `frontend/src/views/ExpenseListView.vue`
- Modify: `frontend/src/app/router.ts`

- [ ] **Step 1: `stores/expense.ts`**

```typescript
import { defineStore } from "pinia";
import { expenseApi, type ExpenseLine, type ExpenseClaimRow } from "@/api/expense";
import { saveItem } from "@/offline/queue";
import { useSyncStore } from "@/stores/sync";
import { uploadPhoto } from "@/offline/photos";
import { v4 as uuid } from "uuid";

export interface DraftLine {
  expense_type: string;
  expense_date: string;
  amount: number;
  description: string;
  receipt_photo_id: string | null;   // local id until uploaded
}

export const useExpenseStore = defineStore("expense", {
  state: () => ({
    mine: [] as ExpenseClaimRow[],
  }),
  actions: {
    async loadMine() { try { this.mine = await expenseApi.list_mine(); } catch {} },

    async submit(lines: DraftLine[]) {
      const sync = useSyncStore();
      if (lines.some((l) => !l.receipt_photo_id)) {
        throw new Error("Every line must have a receipt photo.");
      }
      const claimDraftId = uuid();

      if (sync.isOnline) {
        try {
          const resolved: ExpenseLine[] = [];
          for (const ln of lines) {
            const url = await uploadPhoto(ln.receipt_photo_id!);
            resolved.push({
              expense_type: ln.expense_type, expense_date: ln.expense_date,
              amount: ln.amount, description: ln.description, receipt_file_url: url,
            });
          }
          const r = await expenseApi.submit(resolved);
          await this.loadMine();
          return { mode: "online" as const, row: r };
        } catch { /* fall through */ }
      }

      await saveItem("expense", `expense:${claimDraftId}`, {
        lines: lines.map((ln) => ({ ...ln })),  // payload keeps receipt_photo_id
      }, lines.map((ln) => ln.receipt_photo_id!).filter(Boolean) as string[]);
      await sync.refresh();
      return { mode: "queued" as const };
    },
  },
});
```

- [ ] **Step 2: `ExpenseClaimView.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import Card from "@/components/Card.vue";
import AppButton from "@/components/Button.vue";
import PhotoSlot from "@/components/PhotoSlot.vue";
import AmountDisplay from "@/components/AmountDisplay.vue";
import { useExpenseStore, type DraftLine } from "@/stores/expense";

const { t } = useI18n();
const router = useRouter();
const store = useExpenseStore();

// Phase 3: typed by user — an Expense Type picker (pulls from server) is a Phase 4 polish
const lines = ref<DraftLine[]>([{
  expense_type: "", expense_date: new Date().toISOString().slice(0, 10),
  amount: 0, description: "", receipt_photo_id: null,
}]);
const busy = ref(false);
const msg = ref<string | null>(null);

function addLine() {
  lines.value.push({
    expense_type: "", expense_date: new Date().toISOString().slice(0, 10),
    amount: 0, description: "", receipt_photo_id: null,
  });
}
function removeLine(i: number) { lines.value.splice(i, 1); }

const total = computed(() => lines.value.reduce((a, l) => a + Number(l.amount || 0), 0));

async function submit() {
  if (!lines.value.every((l) => l.receipt_photo_id)) { msg.value = t("expense.receipt_required"); return; }
  busy.value = true;
  try {
    const res = await store.submit(lines.value);
    msg.value = res.mode === "online" ? t("expense.submitted") : t("expense.queued");
  } catch (e: any) { msg.value = e?.message || "error"; }
  finally { busy.value = false; }
}
</script>

<template>
  <main class="expense">
    <TopAppBar :title="t('expense.title')" back @back="router.back()" />
    <SyncBar />

    <Card v-for="(ln, i) in lines" :key="i" class="expense__line">
      <label><span>{{ t('expense.type') }}</span>
        <input v-model="ln.expense_type" type="text" placeholder="e.g. Travel" /></label>
      <label><span>{{ t('expense.date') }}</span>
        <input v-model="ln.expense_date" type="date" /></label>
      <label><span>{{ t('expense.amount') }}</span>
        <input v-model.number="ln.amount" type="number" step="0.01" min="0" /></label>
      <label><span>{{ t('expense.description') }}</span>
        <input v-model="ln.description" type="text" /></label>
      <div>
        <span class="expense__label">{{ t('expense.receipt') }} *</span>
        <PhotoSlot v-model="ln.receipt_photo_id" aspect="3:4" />
      </div>
      <button class="expense__remove" v-if="lines.length > 1" @click="removeLine(i)">{{ t('expense.remove_line') }}</button>
    </Card>

    <AppButton variant="ghost" block @click="addLine">+ {{ t('expense.add_line') }}</AppButton>

    <Card class="expense__total">
      <span>{{ t('expense.total') }}</span>
      <AmountDisplay :amount="total" currency="SAR" />
    </Card>

    <AppButton block :disabled="busy" @click="submit">{{ t('expense.submit') }}</AppButton>
    <p v-if="msg" class="expense__msg">{{ msg }}</p>

    <RouterLink to="/expense/mine" class="expense__history">{{ t('expense.mine') }} →</RouterLink>

    <BottomNav />
  </main>
</template>

<style scoped>
.expense { padding: 0 var(--page-gutter) 120px; display: flex; flex-direction: column; gap: 12px; }
.expense__line { display: flex; flex-direction: column; gap: 10px; }
.expense__line label { display: flex; flex-direction: column; gap: 4px; }
.expense__line label span, .expense__label {
  font-size: 12px; color: var(--ink-secondary); text-transform: uppercase; letter-spacing: .04em;
}
.expense__line input {
  background: var(--bg-sunk); border: 0; border-radius: var(--r-md);
  padding: 12px; font-size: 15px; color: var(--ink-primary);
}
.expense__remove { color: var(--danger); font-size: 13px; align-self: flex-start; padding: 4px 0; }
.expense__total { display: flex; align-items: center; justify-content: space-between; }
.expense__history { display: block; margin-top: 12px; color: var(--ink-secondary); text-align: center; }
.expense__msg { color: var(--ink-secondary); font-size: 13px; text-align: center; }
</style>
```

- [ ] **Step 3: `ExpenseListView.vue`**

```vue
<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import ListRow from "@/components/ListRow.vue";
import Chip from "@/components/Chip.vue";
import { useExpenseStore } from "@/stores/expense";

const { t } = useI18n();
const router = useRouter();
const store = useExpenseStore();

onMounted(() => store.loadMine());

function variantFor(status: string, approval: string): any {
  if (approval === "Approved") return "approved";
  if (approval === "Rejected") return "rejected";
  if (status === "Paid") return "paid";
  if (status === "Draft") return "draft";
  return "pending";
}
</script>

<template>
  <main class="exp-list">
    <TopAppBar :title="t('expense.mine')" back @back="router.back()" />
    <SyncBar />
    <div v-for="r in store.mine" :key="r.name" class="exp-list__row">
      <ListRow :title="r.name" :subtitle="r.posting_date"
               :trailing="r.total_claimed_amount.toFixed(2)" />
      <Chip :variant="variantFor(r.status, r.approval_status)" style="margin: 0 var(--page-gutter) 8px;">
        {{ r.approval_status || r.status }}
      </Chip>
    </div>
    <BottomNav />
  </main>
</template>

<style scoped>
.exp-list { padding-bottom: 120px; }
</style>
```

- [ ] **Step 4: Translations**

`en.json`:

```json
  ,"expense": {
    "title": "Expense Claim",
    "mine": "My Claims",
    "type": "Type",
    "date": "Date",
    "amount": "Amount",
    "description": "Description",
    "receipt": "Receipt",
    "add_line": "Add another line",
    "remove_line": "Remove line",
    "total": "Total",
    "submit": "Submit",
    "submitted": "Submitted.",
    "queued": "Queued — will submit when online.",
    "receipt_required": "Every line needs a receipt photo."
  }
```

`ar.json`:

```json
  ,"expense": {
    "title": "مطالبة نفقات",
    "mine": "مطالباتي",
    "type": "النوع",
    "date": "التاريخ",
    "amount": "المبلغ",
    "description": "الوصف",
    "receipt": "الإيصال",
    "add_line": "إضافة بند",
    "remove_line": "حذف البند",
    "total": "الإجمالي",
    "submit": "إرسال",
    "submitted": "تم الإرسال.",
    "queued": "في قائمة الانتظار — سيتم الإرسال عند الاتصال.",
    "receipt_required": "كل بند يحتاج صورة إيصال."
  }
```

- [ ] **Step 5: Routes**

```typescript
{ path: "expense", name: "expense", component: () => import("@/views/ExpenseClaimView.vue") },
{ path: "expense/mine", name: "expense.list", component: () => import("@/views/ExpenseListView.vue") },
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/expense.ts frontend/src/views/ExpenseClaimView.vue frontend/src/views/ExpenseListView.vue frontend/src/app/router.ts frontend/src/locales/
git commit -m "feat(expense): claim form with required receipts + list view"
```

---

### Task 10: `SyncErrorsView.vue`

**Files:**
- Create: `frontend/src/views/SyncErrorsView.vue`
- Modify: `frontend/src/app/router.ts`

- [ ] **Step 1: Implement**

```vue
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import TopAppBar from "@/components/TopAppBar.vue";
import SyncBar from "@/components/SyncBar.vue";
import BottomNav from "@/components/BottomNav.vue";
import Chip from "@/components/Chip.vue";
import AppButton from "@/components/Button.vue";
import { listPending, removeEntry } from "@/offline/queue";
import { useSyncStore } from "@/stores/sync";
import type { QueueRecord } from "@/offline/db";

const { t } = useI18n();
const router = useRouter();
const sync = useSyncStore();
const rows = ref<QueueRecord[]>([]);

async function refresh() { rows.value = (await listPending()).filter((r) => r.lastError); }
onMounted(refresh);

async function retry() { await sync.triggerDrain(); await refresh(); }

async function deleteOne(id: string) {
  const typed = prompt(t("sync_errors.type_delete"));
  if (typed !== "DELETE") return;
  await removeEntry(id);
  await refresh();
}
</script>

<template>
  <main class="syncerr">
    <TopAppBar :title="t('sync_errors.title')" back @back="router.back()" />
    <SyncBar />
    <p v-if="!rows.length" class="syncerr__empty">{{ t('sync_errors.empty') }}</p>
    <ul class="syncerr__list">
      <li v-for="r in rows" :key="r.id" class="syncerr__row">
        <div class="syncerr__head">
          <strong>{{ r.kind }}</strong>
          <Chip variant="rejected">{{ r.lastError?.code }}</Chip>
        </div>
        <p class="syncerr__msg">{{ r.lastError?.message }}</p>
        <div class="syncerr__actions">
          <AppButton variant="ghost" @click="retry">{{ t('sync_errors.retry') }}</AppButton>
          <AppButton variant="destructive" @click="deleteOne(r.id)">{{ t('sync_errors.delete_one') }}</AppButton>
        </div>
      </li>
    </ul>
    <BottomNav />
  </main>
</template>

<style scoped>
.syncerr { padding-bottom: 120px; }
.syncerr__empty { padding: 40px var(--page-gutter); color: var(--ink-secondary); text-align: center; }
.syncerr__list { list-style: none; padding: 0 var(--page-gutter); display: flex; flex-direction: column; gap: 12px; }
.syncerr__row { background: var(--bg-surface); border-radius: var(--r-lg); box-shadow: var(--e-1); padding: 12px; }
.syncerr__head { display: flex; align-items: center; justify-content: space-between; }
.syncerr__msg { color: var(--ink-secondary); font-size: 13px; margin: 8px 0; }
.syncerr__actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
```

- [ ] **Step 2: Translations**

`en.json`:

```json
  ,"sync_errors": {
    "title": "Sync Errors",
    "empty": "No sync errors.",
    "retry": "Retry",
    "delete_one": "Delete",
    "type_delete": "Type DELETE to confirm."
  }
```

`ar.json`:

```json
  ,"sync_errors": {
    "title": "أخطاء المزامنة",
    "empty": "لا توجد أخطاء.",
    "retry": "إعادة المحاولة",
    "delete_one": "حذف",
    "type_delete": "اكتب DELETE للتأكيد."
  }
```

- [ ] **Step 3: Route**

```typescript
{ path: "sync-errors", name: "sync.errors", component: () => import("@/views/SyncErrorsView.vue") },
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/SyncErrorsView.vue frontend/src/app/router.ts frontend/src/locales/
git commit -m "feat(sync): SyncErrors view with retry + typed-confirm delete"
```

---

### Task 11: End-of-phase verification

- [ ] **Step 1: Tests green**

```bash
bench --site fatehhr_dev run-tests --app fatehhr
cd frontend && pnpm test && pnpm build
```

- [ ] **Step 2: Brief §12 gate rows 3 + 4 + 5**

- [ ] **Row 3.** **Offline expense claim with photo receipt:** queue → online → photo uploads **ONCE** (Frappe File count +1 per line, not +2), expense saved on server.
- [ ] **Row 4.** **Leave application** offline → online: no duplicate entries; `list_mine` shows exactly one row per submission.
- [ ] **Row 5.** (Manager approvals) — *N/A in v1 (deferred to v1.1 per §12 of design spec).*
- [ ] Attendance calendar: 3 pair day shows 3 pair rows in detail sheet; hours sum correctly.
- [ ] Open-pair (no OUT) auto-closes at midnight with the "auto-closed" label in the detail sheet.
- [ ] Sync Errors view: force an error (e.g. drop the server mid-drain) → row appears → Retry works.

- [ ] **Step 3: Tag**

```bash
cd apps/fatehhr && git tag -a phase-3-attendance-leave-expense -m "Phase 3 complete" && git push --tags
```

---

## Phase 3 Definition of Done

All boxes in Task 11 ticked. Ready for [Phase 4](./2026-04-18-fatehhr-phase4-tasks-payslip-announcements-profile.md).
