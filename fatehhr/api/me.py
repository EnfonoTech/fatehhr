import frappe


@frappe.whitelist()
def profile() -> dict:
	user = frappe.session.user
	if user in ("Guest", ""):
		frappe.throw(frappe._("Not signed in."), frappe.AuthenticationError)

	employee_name = frappe.db.get_value("Employee", {"user_id": user}, "name")
	if not employee_name:
		return {
			"user": user,
			"full_name": frappe.db.get_value("User", user, "full_name") or user,
			"employee": None,
			"designation": None,
			"department": None,
		}

	emp = frappe.get_doc("Employee", employee_name)
	return {
		"user": user,
		"full_name": emp.employee_name,
		"employee": emp.name,
		"designation": emp.designation,
		"department": emp.department,
		"employee_id": emp.employee_number or emp.name,
		"photo": emp.image,
		"emergency_phone_number": getattr(emp, "emergency_phone_number", None),
		"person_to_be_contacted": getattr(emp, "person_to_be_contacted", None),
		"relation": getattr(emp, "relation", None),
		"bank_name": getattr(emp, "bank_name", None),
		"bank_ac_no": getattr(emp, "bank_ac_no", None),
		"iban": getattr(emp, "iban", None),
	}


ALLOWED_UPDATE_FIELDS = (
	"emergency_phone_number",
	"person_to_be_contacted",
	"relation",
	"bank_name",
	"bank_ac_no",
	"iban",
)


@frappe.whitelist()
def update_profile(**kwargs) -> dict:
	"""Update own employee record — restricted to emergency + bank fields."""
	user = frappe.session.user
	employee_name = frappe.db.get_value("Employee", {"user_id": user}, "name")
	if not employee_name:
		frappe.throw(frappe._("No Employee linked."))
	emp = frappe.get_doc("Employee", employee_name)
	applied = {}
	for f in ALLOWED_UPDATE_FIELDS:
		if f in kwargs and kwargs[f] is not None:
			setattr(emp, f, kwargs[f])
			applied[f] = kwargs[f]
	emp.flags.ignore_permissions = False
	emp.save()
	frappe.db.commit()
	return {"applied": applied}
