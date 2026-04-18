import frappe
from frappe.utils import now_datetime, get_datetime

from fatehhr.utils.geofence import classify


@frappe.whitelist()
def list_mine(limit: int = 100) -> list[dict]:
	employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
	if not employee:
		return []
	# Tasks allocated via ToDo
	todos = frappe.get_all(
		"ToDo",
		filters={
			"allocated_to": frappe.session.user,
			"reference_type": "Task",
			"status": "Open",
		},
		fields=["reference_name"],
		limit=int(limit),
	)
	names = [t.reference_name for t in todos] or ["__none__"]
	return frappe.get_all(
		"Task",
		filters={"name": ["in", names]},
		fields=[
			"name", "subject", "project", "status", "priority", "exp_end_date",
			"custom_latitude", "custom_longitude", "custom_geofence_radius_m",
		],
		order_by="exp_end_date asc",
	)


@frappe.whitelist()
def start_timer(
	task: str,
	latitude: float | None = None,
	longitude: float | None = None,
	address: str | None = None,
	timestamp: str | None = None,
) -> dict:
	"""Open a Timesheet detail AND create a paired Employee Checkin (IN)."""
	employee = _my_employee()
	ts = get_datetime(timestamp) if timestamp else now_datetime()

	t_lat, t_lng, t_rad = frappe.db.get_value(
		"Task", task,
		["custom_latitude", "custom_longitude", "custom_geofence_radius_m"],
	) or (None, None, None)
	gf = classify(_f(t_lat), _f(t_lng), _i(t_rad), _f(latitude), _f(longitude))

	checkin = frappe.get_doc({
		"doctype": "Employee Checkin",
		"employee": employee,
		"log_type": "IN",
		"time": ts,
		"custom_latitude": _f(latitude),
		"custom_longitude": _f(longitude),
		"custom_location_address": address,
		"custom_task": task,
		"custom_geofence_status": gf,
	})
	checkin.flags.ignore_permissions = True
	checkin.insert()

	ts_doc = _get_or_create_open_timesheet(employee)
	ts_doc.append("time_logs", {
		"activity_type": _default_activity_type(),
		"task": task,
		"from_time": ts,
		"hours": 0,
	})
	ts_doc.flags.ignore_permissions = True
	ts_doc.save()
	frappe.db.commit()

	return {
		"session_id": f"{ts_doc.name}:{len(ts_doc.time_logs) - 1}",
		"checkin_name": checkin.name,
		"timesheet": ts_doc.name,
		"custom_geofence_status": gf,
	}


@frappe.whitelist()
def stop_timer(
	session_id: str,
	latitude: float | None = None,
	longitude: float | None = None,
	address: str | None = None,
	timestamp: str | None = None,
) -> dict:
	employee = _my_employee()
	ts_name, row_idx_str = session_id.rsplit(":", 1)
	row_idx = int(row_idx_str)
	ts_doc = frappe.get_doc("Timesheet", ts_name)
	if row_idx < 0 or row_idx >= len(ts_doc.time_logs):
		frappe.throw(frappe._("Invalid timer session."))
	row = ts_doc.time_logs[row_idx]
	end_ts = get_datetime(timestamp) if timestamp else now_datetime()
	row.to_time = end_ts
	row.hours = max(0, (end_ts - get_datetime(row.from_time)).total_seconds() / 3600.0)
	ts_doc.flags.ignore_permissions = True
	ts_doc.save()

	checkin_out = frappe.get_doc({
		"doctype": "Employee Checkin",
		"employee": employee,
		"log_type": "OUT",
		"time": end_ts,
		"custom_latitude": _f(latitude),
		"custom_longitude": _f(longitude),
		"custom_location_address": address,
		"custom_task": row.task,
		"custom_geofence_status": "disabled",
	})
	checkin_out.flags.ignore_permissions = True
	checkin_out.insert()
	frappe.db.commit()

	return {
		"session_id": session_id,
		"checkin_out_name": checkin_out.name,
		"timesheet": ts_doc.name,
		"hours": row.hours,
	}


def _my_employee() -> str:
	n = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
	if not n:
		frappe.throw(frappe._("No Employee linked."))
	return n


def _get_or_create_open_timesheet(employee):
	from frappe.utils import today
	name = frappe.db.get_value(
		"Timesheet",
		{"employee": employee, "start_date": today(), "status": "Draft"},
		"name",
	)
	if name:
		return frappe.get_doc("Timesheet", name)
	doc = frappe.get_doc({
		"doctype": "Timesheet",
		"employee": employee,
		"start_date": today(),
	})
	doc.flags.ignore_permissions = True
	doc.insert()
	return doc


def _default_activity_type() -> str:
	row = frappe.db.get_value("Activity Type", {"disabled": 0}, "name")
	if row:
		return row
	doc = frappe.get_doc({"doctype": "Activity Type", "activity_type": "Work-FHR"})
	doc.flags.ignore_permissions = True
	doc.insert()
	return doc.name


def _f(v):
	try:
		return None if v in (None, "") else float(v)
	except (TypeError, ValueError):
		return None


def _i(v):
	try:
		return None if v in (None, "") else int(v)
	except (TypeError, ValueError):
		return None
