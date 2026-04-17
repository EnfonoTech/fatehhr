import frappe
from frappe.utils import now_datetime, get_datetime

from fatehhr.utils.geofence import classify


@frappe.whitelist()
def create(
	log_type: str,
	latitude: float | None = None,
	longitude: float | None = None,
	address: str | None = None,
	task: str | None = None,
	selfie_file_url: str | None = None,
	timestamp: str | None = None,
) -> dict:
	"""Create an Employee Checkin (IN/OUT) with optional GPS + task + selfie.

	`timestamp`, if provided, is the queued ISO time from the client — used
	ONLY as the `time` field. It is NEVER propagated as `client_modified`
	(frappe-vue-pwa §4.5).
	"""
	if log_type not in ("IN", "OUT"):
		frappe.throw(frappe._("log_type must be IN or OUT"))

	employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
	if not employee:
		frappe.throw(frappe._("No Employee linked to this user."))

	t_lat = t_lng = t_rad = None
	if task:
		t_lat, t_lng, t_rad = frappe.db.get_value(
			"Task", task,
			["custom_latitude", "custom_longitude", "custom_geofence_radius_m"],
		) or (None, None, None)
	gf_status = classify(_f(t_lat), _f(t_lng), _i(t_rad), _f(latitude), _f(longitude))

	ts = get_datetime(timestamp) if timestamp else now_datetime()
	doc = frappe.get_doc({
		"doctype": "Employee Checkin",
		"employee": employee,
		"log_type": log_type,
		"time": ts,
		"custom_latitude": _f(latitude),
		"custom_longitude": _f(longitude),
		"custom_location_address": address,
		"custom_task": task or None,
		"custom_selfie": selfie_file_url or None,
		"custom_geofence_status": gf_status,
	})
	doc.flags.ignore_permissions = False
	doc.insert()
	frappe.db.commit()

	return {
		"name": doc.name,
		"log_type": log_type,
		"time": ts.isoformat(),
		"custom_task": task,
		"custom_latitude": _f(latitude),
		"custom_longitude": _f(longitude),
		"custom_location_address": address,
		"custom_selfie": selfie_file_url,
		"custom_geofence_status": gf_status,
	}


@frappe.whitelist()
def list_mine(
	from_date: str | None = None,
	to_date: str | None = None,
	page: int = 1,
	page_size: int = 20,
) -> list[dict]:
	employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
	if not employee:
		return []
	filters: dict = {"employee": employee}
	if from_date and to_date:
		filters["time"] = ["between", [from_date, to_date]]
	elif from_date:
		filters["time"] = [">=", from_date]
	rows = frappe.get_all(
		"Employee Checkin",
		filters=filters,
		fields=[
			"name", "log_type", "time",
			"custom_task", "custom_latitude", "custom_longitude",
			"custom_location_address", "custom_selfie",
			"custom_geofence_status",
		],
		order_by="time desc",
		start=max(0, (int(page) - 1)) * int(page_size),
		page_length=int(page_size),
	)
	for r in rows:
		r["employee_user"] = frappe.session.user
	return rows


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
