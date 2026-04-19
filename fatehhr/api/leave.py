import frappe
from frappe.utils import nowdate


@frappe.whitelist()
def types_with_balance() -> list[dict]:
	employee = _my_employee_or_none()
	if not employee:
		return []
	type_fields = ["name", "leave_type_name", "max_leaves_allowed"]
	try:
		types = frappe.get_all("Leave Type", fields=[*type_fields, "color"])
	except Exception:
		types = frappe.get_all("Leave Type", fields=type_fields)
	from hrms.hr.doctype.leave_application.leave_application import get_leave_balance_on
	today = nowdate()
	out = []
	for t in types:
		name = t.get("name")
		try:
			balance = get_leave_balance_on(employee=employee, leave_type=name, date=today) or 0
		except Exception:
			balance = 0
		# Total allocated for the period covering today
		try:
			allocs = frappe.get_all(
				"Leave Allocation",
				filters={
					"employee": employee,
					"leave_type": name,
					"docstatus": 1,
					"from_date": ["<=", today],
					"to_date": [">=", today],
				},
				fields=["total_leaves_allocated"],
			)
			total = sum(float(a.total_leaves_allocated or 0) for a in allocs)
		except Exception:
			total = 0.0
		out.append({
			"leave_type": name,
			"label": t.get("leave_type_name"),
			"balance": float(balance),
			"total": float(total),
			"color": t.get("color"),
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
	doc.flags.ignore_permissions = True
	doc.insert()
	frappe.db.commit()
	return {
		"name": doc.name,
		"status": doc.status,
		"total_leave_days": doc.total_leave_days,
	}


@frappe.whitelist()
def cancel(name: str) -> dict:
	employee = _my_employee()
	doc = frappe.get_doc("Leave Application", name)
	if doc.employee != employee:
		frappe.throw(frappe._("Not your leave application."), frappe.PermissionError)
	if doc.status not in ("Open", "Cancelled"):
		frappe.throw(frappe._("Only pending leaves can be cancelled from the app."))
	doc.status = "Cancelled"
	doc.flags.ignore_permissions = True
	doc.save()
	frappe.db.commit()
	return {"name": doc.name, "status": doc.status}


@frappe.whitelist()
def list_mine(limit: int = 50) -> list[dict]:
	employee = _my_employee_or_none()
	if not employee:
		return []
	return frappe.get_all(
		"Leave Application",
		filters={"employee": employee},
		fields=[
			"name", "leave_type", "from_date", "to_date", "half_day",
			"total_leave_days", "description", "status",
		],
		order_by="from_date desc",
		limit=int(limit),
	)


def _my_employee() -> str:
	employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
	if not employee:
		frappe.throw(frappe._("No Employee linked to this user."))
	return employee


def _my_employee_or_none() -> str | None:
	return frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
