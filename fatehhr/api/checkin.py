from datetime import timezone

import frappe
from dateutil.parser import isoparse
from frappe.utils import now_datetime, get_system_timezone

try:
	from zoneinfo import ZoneInfo
except ImportError:  # py<3.9 fallback
	from backports.zoneinfo import ZoneInfo  # type: ignore

from fatehhr.utils.geofence import classify


def _parse_client_ts(ts_str):
	"""Parse a client ISO timestamp into a naive site-local datetime.

	Why this exists: Frappe's own `get_datetime` was dropping the tz on
	ISO-with-'Z' strings from `new Date().toISOString()`, so both IN and
	OUT from a single offline session ended up saved with the drain-time
	clock. `dateutil.isoparse` keeps the tz; we then convert to site tz
	and strip, which is the format Frappe's ORM expects.
	"""
	if not ts_str:
		return None
	try:
		dt = isoparse(ts_str)
	except (ValueError, TypeError):
		return None
	# JS toISOString() always emits 'Z' (UTC). Be tolerant of naive input
	# (e.g. some test payloads) by assuming UTC in that case.
	if dt.tzinfo is None:
		dt = dt.replace(tzinfo=timezone.utc)
	site_tz = ZoneInfo(get_system_timezone())
	return dt.astimezone(site_tz).replace(tzinfo=None)


def _naive_site_to_utc_iso(dt):
	"""Convert a Frappe-stored naive site-local datetime → UTC ISO string
	with 'Z'. Clients that roam timezones (phone in Riyadh, site in Muscat)
	need a tz-aware value to render correctly in their own locale; a naive
	string gets interpreted as device-local and skews the display.
	"""
	if dt is None:
		return None
	if isinstance(dt, str):
		# DB already serialised; reparse assuming site-local.
		try:
			dt = isoparse(dt)
		except (ValueError, TypeError):
			return dt
	if dt.tzinfo is None:
		dt = dt.replace(tzinfo=ZoneInfo(get_system_timezone()))
	utc_dt = dt.astimezone(timezone.utc)
	# isoformat → "2026-04-19T15:25:16+00:00"; canonicalise to …Z
	return utc_dt.isoformat().replace("+00:00", "Z")


@frappe.whitelist()
def create(
	log_type: str,
	latitude: float | None = None,
	longitude: float | None = None,
	address: str | None = None,
	task: str | None = None,
	selfie_file_url: str | None = None,
	timestamp: str | None = None,
	client_id: str | None = None,
) -> dict:
	"""Create an Employee Checkin (IN/OUT) with optional GPS + task + selfie.

	`timestamp`, if provided, is the queued ISO time from the client — used
	ONLY as the `time` field. It is NEVER propagated as `client_modified`
	(frappe-vue-pwa §4.5).

	`client_id` is a UUID the client mints at the moment of the tap. The
	server stores it on `custom_client_id` with a unique index so the
	online call + offline queue drain cannot both materialise the same tap
	into two attendance rows (which would corrupt payroll via
	auto-Attendance → `payment_days`).
	"""
	if log_type not in ("IN", "OUT"):
		frappe.throw(frappe._("log_type must be IN or OUT"))

	employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
	if not employee:
		frappe.throw(frappe._("No Employee linked to this user."))

	# Dedupe by client_id BEFORE work — if the client already managed to
	# write this tap (e.g. an earlier partial network attempt succeeded),
	# return the existing row so the caller can settle its UI without
	# creating a duplicate.
	if client_id:
		existing_name = frappe.db.get_value(
			"Employee Checkin",
			{"custom_client_id": client_id, "employee": employee},
			"name",
		)
		if existing_name:
			return _row_as_response(existing_name)

	t_lat = t_lng = t_rad = None
	if task:
		t_lat, t_lng, t_rad = frappe.db.get_value(
			"Task", task,
			["custom_latitude", "custom_longitude", "custom_geofence_radius_m"],
		) or (None, None, None)
	gf_status = classify(_f(t_lat), _f(t_lng), _i(t_rad), _f(latitude), _f(longitude))

	ts = _parse_client_ts(timestamp) or now_datetime()
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
		"custom_client_id": client_id or None,
	})
	doc.flags.ignore_permissions = False
	try:
		doc.insert()
	except frappe.exceptions.DuplicateEntryError:
		# Race: another worker (drain) won. Return whatever they wrote.
		frappe.db.rollback()
		if client_id:
			existing_name = frappe.db.get_value(
				"Employee Checkin",
				{"custom_client_id": client_id, "employee": employee},
				"name",
			)
			if existing_name:
				return _row_as_response(existing_name)
		raise

	# Frappe's ORM formats datetime as "YYYY-MM-DD HH:MM:SS" on insert, so the
	# datetime(6) column drops microseconds — two IN/OUT taps within the same
	# second end up with identical stored `time` values. Rewrite with a direct
	# SQL update that preserves microseconds so rapid-tap offline pairs keep
	# their distinct moments.
	if ts.microsecond:
		frappe.db.sql(
			"UPDATE `tabEmployee Checkin` SET `time`=%s WHERE name=%s",
			(ts.isoformat(sep=" ", timespec="microseconds"), doc.name),
		)
		doc.reload()

	frappe.db.commit()

	return {
		"name": doc.name,
		"log_type": log_type,
		"time": _naive_site_to_utc_iso(ts),
		"custom_task": task,
		"custom_latitude": _f(latitude),
		"custom_longitude": _f(longitude),
		"custom_location_address": address,
		"custom_selfie": selfie_file_url,
		"custom_geofence_status": gf_status,
	}


def _row_as_response(name: str) -> dict:
	r = frappe.db.get_value(
		"Employee Checkin", name,
		[
			"name", "log_type", "time",
			"custom_task", "custom_latitude", "custom_longitude",
			"custom_location_address", "custom_selfie", "custom_geofence_status",
		],
		as_dict=True,
	) or {}
	if r.get("time"):
		r["time"] = _naive_site_to_utc_iso(r["time"])
	return r


@frappe.whitelist()
def today_summary() -> dict:
	"""Return today's worked seconds + open_since for the home screen.

	Pairs consecutive IN→OUT rows for today. If the last row is an open IN
	(no matching OUT yet), `open_since` is its ISO timestamp and the client
	can live-tick the card. If the last row is OUT (or no rows), the total
	is frozen.
	"""
	employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
	if not employee:
		return {"worked_seconds": 0, "open_since": None}

	from frappe.utils import today
	rows = frappe.db.sql(
		"""
		SELECT log_type, time
		FROM `tabEmployee Checkin`
		WHERE employee=%s AND DATE(time)=%s
		ORDER BY time ASC
		""",
		(employee, today()),
		as_dict=True,
	)

	total = 0
	open_from = None
	for r in rows:
		if r["log_type"] == "IN":
			open_from = r["time"]
		elif r["log_type"] == "OUT" and open_from is not None:
			total += max(0, (r["time"] - open_from).total_seconds())
			open_from = None

	return {
		"worked_seconds": int(total),
		"open_since": _naive_site_to_utc_iso(open_from) if open_from else None,
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
		# Convert naive site-local → UTC ISO so clients in any timezone
		# display the correct local wall-clock.
		r["time"] = _naive_site_to_utc_iso(r.get("time"))
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
