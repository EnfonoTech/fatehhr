"""Seed demo data for Fateh HR development testing.

Run via: bench --site fatehhr_dev execute fatehhr.fixtures.seed_demo.run

Idempotent — re-running is safe and only creates what's missing.
"""
import frappe


DEMO_EMAIL = "demo@fatehhr.test"
DEMO_PASSWORD = "demo@123"
DEMO_FIRST_NAME = "Demo"
DEMO_LAST_NAME = "Tester"

MANAGER_EMAIL = "manager@fatehhr.test"
MANAGER_PASSWORD = "manager@123"

DEMO_COMPANY = "Fatehhr Demo Co"
DEMO_ABBR = "FDC"

DEMO_PROJECT = "Fatehhr Demo Project"

DEMO_TASKS = (
    {
        "subject": "Site Visit — Marina Tower",
        "latitude": 24.7136,
        "longitude": 46.6753,
        "radius": 100,
    },
    {
        "subject": "Client Meeting — Riyadh HQ",
        "latitude": 24.7236,
        "longitude": 46.6853,
        "radius": 50,
    },
    {
        "subject": "Maintenance — Warehouse",
        "latitude": None,
        "longitude": None,
        "radius": None,
    },
)

DEMO_LEAVE_TYPE = "Casual Leave"


def run():
    _ensure_setup_wizard()
    _ensure_user_with_employee(DEMO_EMAIL, DEMO_PASSWORD, DEMO_FIRST_NAME, DEMO_LAST_NAME)
    _ensure_user_with_employee(MANAGER_EMAIL, MANAGER_PASSWORD, "Demo", "Manager")
    _ensure_project()
    _ensure_tasks()
    _ensure_leave_allocation(DEMO_EMAIL)
    _ensure_announcement()
    frappe.db.commit()
    print(f"Seed complete. Login: {DEMO_EMAIL} / {DEMO_PASSWORD}")


def _ensure_setup_wizard():
    """Run the ERPNext setup wizard with sensible defaults if not already run."""
    if frappe.db.exists("Company", DEMO_COMPANY):
        return
    if frappe.db.exists("System Settings", "System Settings"):
        ss = frappe.get_single("System Settings")
        if ss.setup_complete:
            # wizard already ran; fetch the existing company name instead of creating ours
            existing = frappe.db.get_value("Company", {}, "name")
            if existing:
                globals()["DEMO_COMPANY"] = existing
                return

    try:
        from frappe.desk.page.setup_wizard.setup_wizard import setup_complete
        setup_complete({
            "language": "English",
            "country": "Saudi Arabia",
            "timezone": "Asia/Riyadh",
            "currency": "SAR",
            "full_name": "Administrator",
            "email": "admin@fatehhr.test",
            "company_name": DEMO_COMPANY,
            "company_abbr": DEMO_ABBR,
            "company_tagline": "Fateh HR demo",
            "fy_start_date": "2026-01-01",
            "fy_end_date": "2026-12-31",
            "chart_of_accounts": "Standard",
            "bank_account": "Primary",
        })
    except Exception as e:  # noqa: BLE001
        print(f"setup_wizard failed, continuing without: {e}")


def _ensure_user_with_employee(email, password, first, last):
    if not frappe.db.exists("User", email):
        user = frappe.get_doc({
            "doctype": "User",
            "email": email,
            "first_name": first,
            "last_name": last,
            "send_welcome_email": 0,
            "enabled": 1,
            "new_password": password,
            "roles": [
                {"role": "Employee"},
                {"role": "Employee Self Service"},
            ],
        })
        user.flags.ignore_permissions = True
        user.insert()
    else:
        user = frappe.get_doc("User", email)
        if not user.enabled:
            user.enabled = 1
            user.save(ignore_permissions=True)

    emp_name = frappe.db.get_value("Employee", {"user_id": email}, "name")
    if emp_name:
        return emp_name

    emp_data = {
        "doctype": "Employee",
        "first_name": first,
        "last_name": last,
        "user_id": email,
        "status": "Active",
        "gender": "Male",
        "date_of_birth": "1990-01-01",
        "date_of_joining": "2024-01-01",
    }
    existing_company = frappe.db.get_value("Company", {}, "name")
    if existing_company:
        emp_data["company"] = existing_company
    emp = frappe.get_doc(emp_data)
    emp.flags.ignore_permissions = True
    emp.insert()
    return emp.name


def _ensure_project():
    if not frappe.db.exists("Project", DEMO_PROJECT):
        data = {
            "doctype": "Project",
            "project_name": DEMO_PROJECT,
            "status": "Open",
        }
        existing_company = frappe.db.get_value("Company", {}, "name")
        if existing_company:
            data["company"] = existing_company
        frappe.get_doc(data).insert(ignore_permissions=True)


def _ensure_tasks():
    employee_user = DEMO_EMAIL
    for t in DEMO_TASKS:
        name = frappe.db.get_value("Task", {"subject": t["subject"], "project": DEMO_PROJECT}, "name")
        if not name:
            task = frappe.get_doc({
                "doctype": "Task",
                "subject": t["subject"],
                "project": DEMO_PROJECT,
                "status": "Open",
                "priority": "Medium",
                "custom_latitude": t["latitude"],
                "custom_longitude": t["longitude"],
                "custom_geofence_radius_m": t["radius"],
            })
            task.flags.ignore_permissions = True
            task.insert()
            name = task.name
        # Assign via ToDo so task.list_mine() returns them
        if not frappe.db.exists("ToDo", {
            "reference_type": "Task",
            "reference_name": name,
            "allocated_to": employee_user,
            "status": "Open",
        }):
            frappe.get_doc({
                "doctype": "ToDo",
                "allocated_to": employee_user,
                "reference_type": "Task",
                "reference_name": name,
                "description": f"Complete: {t['subject']}",
                "priority": "Medium",
                "status": "Open",
            }).insert(ignore_permissions=True)


def _ensure_leave_allocation(email):
    employee = frappe.db.get_value("Employee", {"user_id": email}, "name")
    if not employee:
        return
    if not frappe.db.exists("Leave Type", DEMO_LEAVE_TYPE):
        return
    existing = frappe.db.get_value("Leave Allocation", {
        "employee": employee,
        "leave_type": DEMO_LEAVE_TYPE,
        "from_date": "2026-01-01",
    }, "name")
    if existing:
        return
    alloc = frappe.get_doc({
        "doctype": "Leave Allocation",
        "employee": employee,
        "leave_type": DEMO_LEAVE_TYPE,
        "from_date": "2026-01-01",
        "to_date": "2026-12-31",
        "new_leaves_allocated": 12,
    })
    alloc.flags.ignore_permissions = True
    try:
        alloc.insert()
        alloc.submit()
    except Exception as e:  # noqa: BLE001
        frappe.log_error(f"seed leave allocation failed: {e}", "fatehhr.seed")


def _ensure_announcement():
    if not frappe.db.table_exists("HR Announcement"):
        # DocType ships in Phase 4; skip in earlier phases
        return
    if frappe.db.exists("HR Announcement", {"title": "Welcome to Fateh HR"}):
        return
    frappe.get_doc({
        "doctype": "HR Announcement",
        "title": "Welcome to Fateh HR",
        "body": "**This is the demo site.** Check in, apply for leave, start a task timer — it all works offline too.",
        "pinned": 1,
        "published_on": frappe.utils.now(),
    }).insert(ignore_permissions=True)
