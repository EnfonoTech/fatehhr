"""Service requests from the app (Cooperheat): raise a request, follow it, forward / complete / reject it.

The logic lives in the cooperheat app (``cooperheat.cooperheat.service_request_tools``); this module
only exposes it to the mobile client, with the names the screens need. On a site without the
cooperheat app every call answers "not enabled".
"""

import frappe
from frappe import _

DT = "Service Request"


def _tools():
	try:
		from cooperheat.cooperheat import service_request_tools
	except ImportError:
		frappe.throw(_("Requests are not enabled on this system."))
	return service_request_tools


@frappe.whitelist()
def enabled() -> bool:
	try:
		from cooperheat.cooperheat import service_request_tools  # noqa: F401
	except ImportError:
		return False
	return bool(frappe.db.exists("DocType", DT))


@frappe.whitelist()
def mine() -> dict:
	return _tools().mine()


@frappe.whitelist()
def create(subject: str, details: str | None = None) -> dict:
	_tools()
	subject = (subject or "").strip()
	if not subject:
		frappe.throw(_("Write what you need."))
	doc = frappe.get_doc({"doctype": DT, "subject": subject, "details": details or ""})
	doc.insert()
	return {"name": doc.name, "current_holder": doc.current_holder, "holder_name": doc.holder_name}


@frappe.whitelist()
def detail(name: str) -> dict:
	tools = _tools()
	doc = frappe.get_doc(DT, name)
	doc.check_permission("read")
	names = {}

	def emp(code):
		if code and code not in names:
			names[code] = frappe.db.get_value("Employee", code, "employee_name")
		return names.get(code)

	return {
		"name": doc.name,
		"subject": doc.subject,
		"details": doc.details,
		"status": doc.status,
		"requested_by": doc.requested_by,
		"requested_by_name": emp(doc.requested_by),
		"current_holder": doc.current_holder,
		"holder_name": emp(doc.current_holder),
		"creation": str(doc.creation),
		"completed_on": str(doc.completed_on) if doc.completed_on else None,
		"can_act": tools.can_act(doc),
		"trail": [
			{
				"time": str(s.step_time),
				"action": s.action,
				"from_name": emp(s.from_employee),
				"to_name": emp(s.to_employee),
				"comment": s.comment,
			}
			for s in doc.trail
		],
	}


@frappe.whitelist()
def forward(name: str, to_employee: str, comment: str | None = None) -> dict:
	return _tools().forward(name, to_employee, comment)


@frappe.whitelist()
def complete(name: str, comment: str | None = None) -> dict:
	return _tools().complete(name, comment)


@frappe.whitelist()
def reject(name: str, comment: str | None = None) -> dict:
	return _tools().reject(name, comment)


@frappe.whitelist()
def people(txt: str = "") -> list[dict]:
	return _tools().people(txt)
