"""Manual, one-off cleanup of duplicate Employee Checkins created by the app's
multi-submit bug (double tap / tap while GPS was resolving / re-tap after
success). NOT registered in patches.txt — run by hand, dry-run first:

	bench --site <site> execute fatehhr.patches_manual.dedupe_checkins.run
	bench --site <site> execute fatehhr.patches_manual.dedupe_checkins.run \
		--kwargs "{'dry_run': False}"

Rule (same as the server guard in fatehhr.api.checkin.create): within one
employee, a checkin with the same log_type as an earlier "keeper" and a time
within WINDOW_SECONDS of the keeper's time is a duplicate. The earliest row is
kept. IN→OUT toggles (opposite log_type) are never deleted; they are listed
under `toggles_for_review` for HR to judge.

Attendance safety — a duplicate linked to a SUBMITTED Attendance is deleted
only when that is provably harmless:
  * keeper is already linked to the same Attendance → delete the duplicate;
  * keeper has no Attendance and the Attendance date equals the keeper's date
    → re-link the keeper to that Attendance, then delete the duplicate;
  * anything else → skipped and reported (`skipped`).
Duplicates linked to a draft/cancelled Attendance (or none) are deleted.

Deletion goes through frappe.delete_doc, so every removed row is kept in
"Deleted Document" and can be restored from there.
"""

import frappe
from frappe.utils import get_datetime, getdate

WINDOW_SECONDS = 60
SAMPLE = 50  # rows of each list returned in the summary


def find_duplicates(from_date: str = "2026-10-01", employee: str | None = None) -> dict:
	filters = {"time": [">=", from_date]}
	if employee:
		filters["employee"] = employee
	# get_all: admin maintenance script, permissions deliberately bypassed.
	rows = frappe.get_all(
		"Employee Checkin",
		filters=filters,
		fields=["name", "employee", "log_type", "time", "attendance", "creation"],
		order_by="employee asc, time asc, creation asc",
	)

	groups = []  # [{keeper: row, duplicates: [row, ...]}]
	toggles = []
	keeper_by_type: dict[tuple, dict] = {}
	open_group: dict[str, dict] = {}
	prev = None
	for r in rows:
		t = get_datetime(r.time)
		key = (r.employee, r.log_type)
		keeper = keeper_by_type.get(key)
		if keeper and (t - get_datetime(keeper.time)).total_seconds() <= WINDOW_SECONDS:
			g = open_group.get(keeper.name)
			if not g:
				g = {"keeper": keeper, "duplicates": []}
				open_group[keeper.name] = g
				groups.append(g)
			g["duplicates"].append(r)
		else:
			keeper_by_type[key] = r
		if (
			prev
			and prev.employee == r.employee
			and prev.log_type != r.log_type
			and (t - get_datetime(prev.time)).total_seconds() <= WINDOW_SECONDS
		):
			toggles.append({"employee": r.employee, "first": prev.name, "second": r.name,
				"first_type": prev.log_type, "time": str(prev.time)})
		prev = r
	return {"groups": groups, "toggles": toggles}


def _plan(groups: list[dict]) -> tuple[list, list, list]:
	"""→ (delete, relink, skipped). relink = [(keeper_name, attendance)]."""
	att_names = {d.attendance for g in groups for d in g["duplicates"] if d.attendance}
	att_names |= {g["keeper"].attendance for g in groups if g["keeper"].attendance}
	att = {}
	if att_names:
		for a in frappe.get_all(
			"Attendance",
			filters={"name": ["in", list(att_names)]},
			fields=["name", "docstatus", "attendance_date"],
		):
			att[a.name] = a

	delete, relink, skipped = [], [], []
	for g in groups:
		keeper = g["keeper"]
		keeper_att = keeper.attendance
		for d in g["duplicates"]:
			a = att.get(d.attendance) if d.attendance else None
			if not a or a.docstatus != 1:
				delete.append(d.name)
			elif keeper_att == d.attendance:
				delete.append(d.name)
			elif not keeper_att and getdate(a.attendance_date) == getdate(keeper.time):
				relink.append((keeper.name, d.attendance))
				keeper_att = d.attendance  # later duplicates in the group now match
				delete.append(d.name)
			else:
				skipped.append({
					"duplicate": d.name, "keeper": keeper.name,
					"duplicate_attendance": d.attendance, "keeper_attendance": keeper_att,
					"reason": "linked to a different submitted Attendance",
				})
	return delete, relink, skipped


def run(dry_run: bool = True, from_date: str = "2026-10-01", employee: str | None = None) -> dict:
	found = find_duplicates(from_date=from_date, employee=employee)
	groups = found["groups"]
	delete, relink, skipped = _plan(groups)

	summary = {
		"dry_run": bool(dry_run),
		"from_date": from_date,
		"groups": len(groups),
		"to_delete": len(delete),
		"to_relink": len(relink),
		"skipped": len(skipped),
		"toggles_for_review": len(found["toggles"]),
		"sample_groups": [
			{"keeper": g["keeper"].name, "employee": g["keeper"].employee,
			 "log_type": g["keeper"].log_type, "time": str(g["keeper"].time),
			 "duplicates": [d.name for d in g["duplicates"]]}
			for g in groups[:SAMPLE]
		],
		"sample_relink": relink[:SAMPLE],
		"sample_skipped": skipped[:SAMPLE],
		"sample_toggles": found["toggles"][:SAMPLE],
	}
	if dry_run:
		return summary

	for keeper_name, attendance in relink:
		frappe.db.set_value("Employee Checkin", keeper_name, "attendance", attendance,
			update_modified=False)
	for i, name in enumerate(delete, 1):
		frappe.delete_doc("Employee Checkin", name, ignore_permissions=True)
		if i % 100 == 0:
			frappe.db.commit()
	frappe.db.commit()
	return summary
