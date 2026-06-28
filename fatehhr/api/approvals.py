"""Attendance approval endpoints for the Cooperheat multi-level (up to 3) workflow.

The active backend Workflow is "Attendance Approval" on Attendance, with states
Pending Level 1/2/3 Approval -> Approved (+ Rejected), transition actions
"Level N Approve" / "Reject". Approvers come from the Department Approval Matrix
(per level); the per-level window hours are overridden by the linked Project
(supervisor / level_2 / manager_payroll_final approval window) else the matrix.
An hourly scheduler auto-approves once the Level 3 window lapses.

This module is a *consumer* of fields + a Workflow that live in the separate
`cooperheat` custom app (Attendance: workflow_state, current_approval_level,
current_approver, current_approver_name, window_expires_at, ...). It declares
NO custom fields itself (cooperheat owns them — see the cooperheat docs §11).

Every endpoint degrades safely when the cooperheat app is NOT installed (e.g.
the shared demo tenant): `_enabled()` returns False and the endpoints return
empty / disabled results instead of erroring.

VERIFY-ON-BENCH (could not be confirmed offline — see
docs/cooperheat-approval-ui-plan.md Phase 0):
  - exact fieldnames below (esp. `current_approver`, `current_approver_name`,
    `window_expires_at`);
  - that the Workflow "Shift Assignment Approval" defines real Transitions with
    Approve/Reject actions. `_apply()` discovers transitions at runtime via
    frappe's get_transitions(), so it adapts to the actual action labels and
    never hardcodes the L1 -> L2 -> Approved sequence. If NO transitions are
    defined (state advancement is purely code-driven in cooperheat), `_apply()`
    raises a clear error rather than corrupting state.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, get_datetime, now_datetime, time_diff_in_hours

# Reuse the timezone-correct converters from the checkin module rather than
# duplicating them (keeps the single source of UTC-ISO handling, gotcha #1/#2).
from fatehhr.api.checkin import _naive_site_to_utc_iso, _parse_client_ts

PENDING_STATES = (
	"Pending Level 1 Approval",
	"Pending Level 2 Approval",
	"Pending Level 3 Approval",
)
TERMINAL_STATES = ("Approved", "Rejected")

# Child DocType holding the per-department approver matrix (cooperheat). Used
# only to decide "is this user ever an approver" for tile visibility.
APPROVAL_MATRIX_DT = "Department Approval Matrix"


def _enabled() -> bool:
	"""True only when the cooperheat approval schema is present on this site."""
	return frappe.get_meta("Attendance").has_field("workflow_state")


def _my_employee() -> str | None:
	return frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")


def _is_hr_manager() -> bool:
	# HR Manager bypasses the per-level approver restriction (cooperheat §2.9).
	return "HR Manager" in frappe.get_roles(frappe.session.user)


def _in_approval_matrix(employee: str) -> bool:
	"""Whether the employee appears as an approver in any Department matrix."""
	if not employee:
		return False
	try:
		if not frappe.db.exists("DocType", APPROVAL_MATRIX_DT):
			return False
		return bool(frappe.db.count(APPROVAL_MATRIX_DT, {"approver": employee}))
	except Exception:
		# Field/doctype shape differs from the doc — fail closed, don't 500.
		return False


@frappe.whitelist()
def summary() -> dict:
	"""Drives the Home tile + badge and the More-menu entry.

	{enabled, is_approver, pending_count}. Safe on the demo tenant (returns
	all-false when the cooperheat schema is absent).
	"""
	if not _enabled():
		return {"enabled": False, "is_approver": False, "pending_count": 0}
	emp = _my_employee()
	if not emp:
		return {"enabled": True, "is_approver": False, "pending_count": 0}

	if _is_hr_manager():
		count = frappe.db.count(
			"Attendance",
			{"workflow_state": ["in", PENDING_STATES], "docstatus": 1},
		)
		return {"enabled": True, "is_approver": True, "pending_count": count}

	count = frappe.db.count(
		"Attendance",
		{"current_approver": emp, "workflow_state": ["in", PENDING_STATES], "docstatus": 1},
	)
	is_approver = count > 0 or _in_approval_matrix(emp)
	return {"enabled": True, "is_approver": is_approver, "pending_count": count}


@frappe.whitelist()
def list_pending(limit: int = 50) -> list[dict]:
	"""Attendance records currently waiting on the logged-in approver."""
	if not _enabled():
		return []
	emp = _my_employee()
	if not emp:
		return []
	filters: dict = {"workflow_state": ["in", PENDING_STATES], "docstatus": 1}
	if not _is_hr_manager():
		filters["current_approver"] = emp
	rows = frappe.get_all(
		"Attendance",
		filters=filters,
		fields=_LIST_FIELDS,
		order_by="window_expires_at asc",
		page_length=cint(limit) or 50,
	)
	return [_shape(r) for r in rows]


@frappe.whitelist()
def list_done(limit: int = 30) -> list[dict]:
	"""Recently actioned (Approved/Rejected) records, best-effort.

	NOTE (verify on bench): this filters terminal records by
	`current_approver == me`. If cooperheat CLEARS current_approver once a
	record reaches a terminal state, this tab will be sparse/empty. That is an
	accepted MVP limitation (plan Phase 0) — the Pending tab is the primary
	surface. HR Managers see all terminal records.
	"""
	if not _enabled():
		return []
	emp = _my_employee()
	if not emp:
		return []
	filters: dict = {"workflow_state": ["in", TERMINAL_STATES], "docstatus": 1}
	if not _is_hr_manager():
		filters["current_approver"] = emp
	rows = frappe.get_all(
		"Attendance",
		filters=filters,
		fields=_LIST_FIELDS,
		order_by="modified desc",
		page_length=cint(limit) or 30,
	)
	return [_shape(r) for r in rows]


@frappe.whitelist()
def detail(name: str) -> dict:
	"""Full record for the approval detail screen. Approver-gated."""
	if not _enabled():
		frappe.throw(_("Approvals are not enabled on this account."))
	doc = _load_for_approver(name)
	d = _shape(doc.as_dict())
	d["department"] = doc.get("department")
	d["site_hours"] = _site_hours(doc)
	d["checkins"] = _day_checkins(doc)
	return d


def _site_hours(doc) -> list[dict]:
	"""The derived per-site pairs (cooperheat `custom_site_hours`) for display."""
	if not frappe.get_meta("Attendance").has_field("custom_site_hours"):
		return []
	out = []
	for r in doc.get("custom_site_hours") or []:
		out.append({
			"project": r.get("project"),
			"project_name": r.get("project_name"),
			"check_in_time": _naive_site_to_utc_iso(r.get("check_in_time")),
			"check_out_time": _naive_site_to_utc_iso(r.get("check_out_time")),
			"hours": flt(r.get("hours")),
		})
	return out


def _day_checkins(doc) -> list[dict]:
	"""Raw Employee Checkin logs for the record's employee+date — the editable
	source of truth behind the pairs. Each row carries its site (custom_project)."""
	if not doc.get("employee") or not doc.get("attendance_date"):
		return []
	has_proj = frappe.get_meta("Employee Checkin").has_field("custom_project")
	date_str = str(doc.attendance_date)
	fields = ["name", "log_type", "time"] + (["custom_project"] if has_proj else [])
	rows = frappe.get_all(
		"Employee Checkin",
		filters=[
			["employee", "=", doc.employee],
			["time", "between", [date_str + " 00:00:00", date_str + " 23:59:59"]],
		],
		fields=fields,
		order_by="time asc",
	)
	out = []
	for r in rows:
		proj = r.get("custom_project") if has_proj else None
		out.append({
			"name": r.name,
			"log_type": r.log_type,
			"time": _naive_site_to_utc_iso(r.time),
			"project": proj,
			"project_name": (frappe.db.get_value("Project", proj, "project_name") or proj) if proj else None,
		})
	return out


@frappe.whitelist()
def update_checkin_times(name: str, edits) -> dict:
	"""Approver corrects multiple check-in/out times. Edits the RAW Employee Checkin
	`time` values (source of truth) — cooperheat's checkin hooks re-validate overlap
	and re-derive the Attendance site-hours. Auth: current-level approver (or HR
	Manager) of a pending record, within the approval window.

	`edits` = JSON list of {"checkin": <name>, "time": <UTC-ISO>}.
	"""
	import json
	if not _enabled():
		frappe.throw(_("Approvals are not enabled on this account."))
	if isinstance(edits, str):
		edits = json.loads(edits or "[]")

	doc = _load_for_approver(name)
	if doc.get("workflow_state") not in PENDING_STATES:
		frappe.throw(_("This record is no longer pending approval."))
	wx = doc.get("window_expires_at")
	if wx and get_datetime(wx) < now_datetime() and not _is_hr_manager():
		frappe.throw(_("The approval window has expired — times can no longer be edited."))

	changed = 0
	for e in edits or []:
		cname, t = e.get("checkin"), e.get("time")
		if not cname or not t:
			continue
		ci = frappe.db.get_value("Employee Checkin", cname, ["employee"], as_dict=True)
		if not ci or ci.employee != doc.employee:
			# Never let an approver edit a checkin outside this record's employee.
			continue
		cdoc = frappe.get_doc("Employee Checkin", cname)
		cdoc.time = _parse_client_ts(t)
		cdoc.flags.ignore_permissions = True
		cdoc.save()  # fires cooperheat validate (overlap) + sync → re-derive site_hours
		changed += 1

	if changed:
		frappe.db.commit()
		# Belt-and-suspenders: ask cooperheat to recompute the attendance totals.
		try:
			from cooperheat.cooperheat.api.api import recalculate_site_hours
			recalculate_site_hours(name)
			frappe.db.commit()
		except Exception:
			pass

	return detail(name)


@frappe.whitelist()
def approve(name: str, in_time: str | None = None, out_time: str | None = None) -> dict:
	"""Approve, optionally correcting the IN/OUT times first."""
	return _action(name, "approve", in_time=in_time, out_time=out_time)


@frappe.whitelist()
def reject(name: str, reason: str | None = None) -> dict:
	return _action(name, "reject", reason=reason)


# ----------------------------------------------------------------------------
# internals
# ----------------------------------------------------------------------------

_LIST_FIELDS = [
	"name", "employee", "employee_name", "attendance_date", "status",
	"in_time", "out_time", "working_hours",
	"current_approval_level", "current_approver", "current_approver_name",
	"workflow_state", "window_expires_at",
]


def _load_for_approver(name: str):
	doc = frappe.get_doc("Attendance", name)
	emp = _my_employee()
	if not (_is_hr_manager() or doc.get("current_approver") == emp):
		frappe.throw(_("This approval is not assigned to you."), frappe.PermissionError)
	return doc


def _action(name, kind, in_time=None, out_time=None, reason=None) -> dict:
	if not _enabled():
		frappe.throw(_("Approvals are not enabled on this account."))

	doc = _load_for_approver(name)
	# This endpoint IS the authorization boundary: _load_for_approver already
	# verified current_approver == me (or HR Manager), and cooperheat's validate
	# hook re-checks the per-level approver on save. Mobile approvers are
	# Self-Service users without Desk write-perm on Attendance, so run the
	# transition privileged — the business-level auth above still applies.
	doc.flags.ignore_permissions = True

	if doc.get("workflow_state") not in PENDING_STATES:
		frappe.throw(_("This record is no longer pending approval."))

	# The cooperheat hourly scheduler auto-approves once the window lapses;
	# block a late human action that would race it. HR Manager bypasses.
	wx = doc.get("window_expires_at")
	if wx and get_datetime(wx) < now_datetime() and not _is_hr_manager():
		frappe.throw(_("The approval window has expired — this record was auto-handled."))

	# Time corrections must be a SEPARATE save BEFORE the workflow transition.
	# cooperheat's validate authorizes in_time/out_time edits against the level
	# implied by the CURRENT workflow_state. apply_workflow sets the *next* state
	# before validate runs, so editing + advancing in one save would re-check the
	# edit against the next level's approver and wrongly reject it. Edit-then-
	# transition as two saves mirrors the ERP Desk flow. (Fields carry
	# allow_on_submit=1, so saving on the submitted doc is permitted.)
	edits = {}
	if in_time:
		edits["in_time"] = _parse_client_ts(in_time)
	if out_time:
		edits["out_time"] = _parse_client_ts(out_time)
	if edits:
		for field, value in edits.items():
			doc.set(field, value)
		# Recompute working_hours deterministically from the corrected times.
		# cooperheat's validate hook is meant to do this, but it doesn't fire
		# reliably on this save path, so set it here too (idempotent — the hook
		# would compute the same value). The client shows the same number.
		if doc.in_time and doc.out_time:
			doc.working_hours = time_diff_in_hours(doc.out_time, doc.in_time)
		doc.save()  # state unchanged → validate checks the current-level approver (= caller) + recalcs hours
		frappe.db.commit()
		doc = frappe.get_doc("Attendance", name)  # reload fresh for the transition
		doc.flags.ignore_permissions = True

	_apply(doc, kind, reason)
	frappe.db.commit()
	doc.reload()
	return {"name": doc.name, "workflow_state": doc.get("workflow_state")}


def _apply(doc, kind: str, reason: str | None) -> None:
	"""Advance the Attendance workflow via real Workflow Transitions.

	Discovers the transition available to THIS user in the current state
	(get_transitions respects the Transition's allowed role + state) and picks
	the one whose action name matches approve/reject. The active "Attendance
	Approval" workflow labels its forward actions "Level 1/2/3 Approve" and its
	reverse "Reject" — matching on the substring keeps this level-agnostic and
	avoids hardcoding the L1 -> L2 -> L3 -> Approved sequence. apply_workflow
	performs the save, which fires cooperheat's validate / on_update_after_submit
	hooks (working-hours recalc, next-level stamp + email).
	"""
	from frappe.model.workflow import apply_workflow, get_transitions

	wanted = "reject" if kind == "reject" else "approve"
	transitions = get_transitions(doc) or []
	chosen = None
	for t in transitions:
		if wanted in (t.get("action") or "").lower():
			chosen = t["action"]
			break

	if not chosen:
		# Defensive: don't guess a next-state and corrupt the workflow. Surface
		# a precise message so the bench config can be fixed.
		frappe.throw(
			_("No '{0}' transition is available for this record. Verify the "
			  "'Attendance Approval' workflow defines Approve/Reject transitions "
			  "for your role.").format(wanted)
		)

	if reason:
		# No dedicated rejection-reason field is documented; attach as a comment
		# so it's visible in Desk without touching the cooperheat schema.
		doc.add_comment("Comment", text=_("Rejected: {0}").format(reason))

	apply_workflow(doc, chosen)


def _shape(r: dict) -> dict:
	"""Normalise a raw Attendance row/dict for the client. Datetimes -> UTC-ISO."""
	ad = r.get("attendance_date")
	return {
		"name": r.get("name"),
		"employee": r.get("employee"),
		"employee_name": r.get("employee_name"),
		"attendance_date": ad.isoformat() if hasattr(ad, "isoformat") else ad,
		"status": r.get("status"),
		"in_time": _naive_site_to_utc_iso(r.get("in_time")),
		"out_time": _naive_site_to_utc_iso(r.get("out_time")),
		"working_hours": flt(r.get("working_hours")),
		"current_approval_level": cint(r.get("current_approval_level")),
		"current_approver_name": r.get("current_approver_name"),
		"workflow_state": r.get("workflow_state"),
		"window_expires_at": _naive_site_to_utc_iso(r.get("window_expires_at")),
	}
