import frappe
from frappe import _
from frappe.utils import cint, cstr, flt, getdate, nowdate

# Optional client-approval fields added on Leave Application by the companion
# `cooperheat` app. Plain Fateh HR sites do not have them, so every read/write
# below is gated on the live DocType meta (see `_client_approval_fields`).
CLIENT_APPROVAL_FIELDS = (
	"custom_client_approval_required",
	"custom_client_approval_received",
	"custom_client_approval_attachment",
)
CLIENT_APPROVAL_REQUIRED_VALUES = ("Not Required", "Yes")
CLIENT_APPROVAL_RECEIVED_VALUES = ("No", "Yes")


@frappe.whitelist()
def types_with_balance() -> list[dict]:
	employee = _my_employee_or_none()
	if not employee:
		return []
	type_fields = ["name", "leave_type_name", "max_leaves_allowed", "is_lwp", "allow_negative"]
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
			# Lets the app decide whether a 0 / short balance should block the
			# form: HRMS skips the balance + allocation checks for LWP types and
			# tolerates a negative balance when allow_negative is set.
			"is_lwp": bool(cint(t.get("is_lwp"))),
			"allow_negative": bool(cint(t.get("allow_negative"))),
			"has_allocation": total > 0,
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
	client_approval_required: str | None = None,
	client_approval_received: str | None = None,
	client_approval_attachment: str | None = None,
) -> dict:
	employee = _my_employee()
	values = {
		"doctype": "Leave Application",
		"employee": employee,
		"leave_type": leave_type,
		"from_date": from_date,
		"to_date": to_date,
		"half_day": cint(half_day),
		"half_day_date": half_day_date or None,
		"description": cstr(reason),
		"status": "Open",
	}
	values.update(_client_approval_values(
		client_approval_required, client_approval_received, client_approval_attachment,
	))
	doc = frappe.get_doc(values)
	doc.flags.ignore_permissions = True
	doc.insert()
	_attach_file_to_doc(doc, values.get("custom_client_approval_attachment"))
	frappe.db.commit()
	return {
		"name": doc.name,
		"status": doc.status,
		"total_leave_days": doc.total_leave_days,
	}


@frappe.whitelist()
def form_config() -> dict:
	"""Which optional sections the leave form should render on this site."""
	return {"client_approval": _client_approval_fields_present()}


@frappe.whitelist()
def leave_days(
	leave_type: str,
	from_date: str,
	to_date: str,
	half_day: int = 0,
	half_day_date: str | None = None,
) -> dict:
	"""Number of leave days HRMS will charge for this range (holidays + half
	day aware), for the session user's own Employee. Used by the app to warn
	before submit when the request exceeds the balance."""
	employee = _my_employee()
	if not leave_type or not frappe.db.exists("Leave Type", leave_type):
		frappe.throw(_("Invalid leave type."))
	if not from_date or not to_date or getdate(to_date) < getdate(from_date):
		return {"days": 0.0}
	from hrms.hr.doctype.leave_application.leave_application import get_number_of_leave_days

	days = get_number_of_leave_days(
		employee, leave_type, from_date, to_date, cint(half_day), half_day_date or None,
	)
	return {"days": flt(days)}


@frappe.whitelist()
def cancel(name: str) -> dict:
	employee = _my_employee()
	doc = frappe.get_doc("Leave Application", name)
	if doc.employee != employee:
		frappe.throw(_("Not your leave application."), frappe.PermissionError)
	if doc.status not in ("Open", "Cancelled"):
		frappe.throw(_("Only pending leaves can be cancelled from the app."))
	doc.status = "Cancelled"
	doc.flags.ignore_permissions = True
	doc.save()
	if doc.meta.has_field("workflow_state"):
		# cooperheat's leave approval workflow: nobody can approve a cancelled request
		frappe.db.set_value("Leave Application", doc.name, "workflow_state", "Cancelled", update_modified=False)
	frappe.db.commit()
	return {"name": doc.name, "status": doc.status}


@frappe.whitelist()
def list_mine(limit: int = 50) -> list[dict]:
	employee = _my_employee_or_none()
	if not employee:
		return []
	fields = [
		"name", "leave_type", "from_date", "to_date", "half_day",
		"total_leave_days", "description", "status",
	]
	if _client_approval_fields_present():
		fields.extend(CLIENT_APPROVAL_FIELDS)
	return frappe.get_all(
		"Leave Application",
		filters={"employee": employee},
		fields=fields,
		order_by="from_date desc",
		limit=cint(limit) or 50,
	)


def _client_approval_fields_present() -> bool:
	meta = frappe.get_meta("Leave Application")
	return all(meta.has_field(f) for f in CLIENT_APPROVAL_FIELDS)


def _client_approval_values(required, received, attachment) -> dict:
	"""Map the app's client-approval inputs onto Leave Application fields.

	Returns {} on sites without the cooperheat fields (keys silently dropped so
	plain Fateh HR keeps working). Values are coerced to the Select options;
	`received` / `attachment` are only kept when approval is required, and an
	attachment is mandatory once the client approval is marked received.
	"""
	meta = frappe.get_meta("Leave Application")
	out = {}
	required = cstr(required).strip() or "Not Required"
	if required not in CLIENT_APPROVAL_REQUIRED_VALUES:
		frappe.throw(_("Invalid value for Client Approval Required: {0}").format(required))
	if meta.has_field("custom_client_approval_required"):
		out["custom_client_approval_required"] = required
	if required != "Yes":
		return out

	received = cstr(received).strip() or "No"
	if received not in CLIENT_APPROVAL_RECEIVED_VALUES:
		frappe.throw(_("Invalid value for Client Approval Received: {0}").format(received))
	attachment = cstr(attachment).strip()
	if meta.has_field("custom_client_approval_received"):
		out["custom_client_approval_received"] = received
	if meta.has_field("custom_client_approval_attachment"):
		if received == "Yes" and not attachment:
			frappe.throw(_("Attach the client approval evidence when the client approval is received."))
		if attachment:
			out["custom_client_approval_attachment"] = attachment
	return out


def _attach_file_to_doc(doc, file_url: str | None) -> None:
	"""Link the already-uploaded (unattached) File to the new leave so it shows
	in the form's attachment sidebar. Best-effort: never fails the apply."""
	if not file_url:
		return
	try:
		file_name = frappe.db.get_value(
			"File",
			{"file_url": file_url, "attached_to_name": ["is", "not set"], "owner": frappe.session.user},
			"name",
		)
		if file_name:
			frappe.db.set_value("File", file_name, {
				"attached_to_doctype": doc.doctype,
				"attached_to_name": doc.name,
				"attached_to_field": "custom_client_approval_attachment",
			})
	except Exception:
		frappe.log_error(frappe.get_traceback(), "fatehhr: attach client approval file")


def _my_employee() -> str:
	employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
	if not employee:
		frappe.throw(_("No Employee linked to this user."))
	return employee


def _my_employee_or_none() -> str | None:
	return frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
