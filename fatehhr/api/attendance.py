import calendar
import datetime as dt

import frappe
from frappe.utils import get_datetime


@frappe.whitelist()
def month(year: int, month: int) -> dict:
	"""Daily summary for the given month for the logged-in employee.

	Each day includes:
	  - status (Present / Absent / Half Day / On Leave / Holiday / Weekend / "")
	  - hours_worked (sum of pair durations; open pairs auto-closed at midnight)
	  - pairs: [{in, out, task, location, hours, open_pair_autoclosed?}]
	"""
	employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
	if not employee:
		return {"year": int(year), "month": int(month), "days": [], "summary": _empty_summary()}

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
		filters={
			"employee": employee,
			"attendance_date": ["between", [start.isoformat(), end.isoformat()]],
		},
		fields=["name", "attendance_date", "status", "working_hours"],
	)
	att_by_day = {a.attendance_date.isoformat(): a for a in attendance_rows}

	leave_rows = frappe.get_all(
		"Leave Application",
		filters={
			"employee": employee,
			"status": "Approved",
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

	return {"year": year, "month": month, "days": days, "summary": _summarize(days)}


def _empty_summary():
	return {"present": 0, "absent": 0, "on_leave": 0, "total_hours": 0.0}


def _build_pairs(rows, for_date):
	pairs = []
	current_in = None
	for r in rows:
		t = get_datetime(r["time"])
		if r["log_type"] == "IN":
			if current_in is not None:
				pairs.append(_autoclose(current_in, for_date))
			current_in = r
		else:
			if current_in:
				dur = (t - get_datetime(current_in["time"])).total_seconds() / 3600.0
				pairs.append({
					"in": _iso(current_in["time"]),
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


def _iso(t):
	return t.isoformat() if hasattr(t, "isoformat") else str(t)


def _derive_status(d, attendance_row, pairs, leave_rows, holidays):
	if attendance_row and attendance_row.status:
		return attendance_row.status
	if d.isoformat() in holidays:
		return "Holiday"
	for lv in leave_rows:
		if lv["from_date"] <= d <= lv["to_date"]:
			return "On Leave"
	if d.weekday() in (5, 6) and not pairs:
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
		"Holiday",
		filters={
			"parent": holiday_list,
			"holiday_date": ["between", [start.isoformat(), end.isoformat()]],
		},
		fields=["holiday_date"],
	)
	return {r.holiday_date.isoformat() for r in rows}


def _summarize(days):
	present = absent = on_leave = 0
	hours = 0.0
	for d in days:
		if d["status"] == "Present":
			present += 1
		elif d["status"] == "Absent":
			absent += 1
		elif d["status"] == "On Leave":
			on_leave += 1
		hours += d["hours_worked"]
	return {
		"present": present,
		"absent": absent,
		"on_leave": on_leave,
		"total_hours": round(hours, 2),
	}
