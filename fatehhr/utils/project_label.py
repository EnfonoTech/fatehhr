import frappe


def project_label(project: str | None) -> str | None:
	"""``CODE — Project name`` when the site has client job codes on Project
	(``custom_project_code`` / ``custom_crm_no``), plain project name otherwise.

	Several projects can run at one site, so the code is what lets a technician
	pick the right one."""
	if not project:
		return None
	meta = frappe.get_meta("Project")
	fields = ["project_name"] + [f for f in ("custom_project_code", "custom_crm_no") if meta.has_field(f)]
	row = frappe.db.get_value("Project", project, fields, as_dict=True) or {}
	name = row.get("project_name")
	code = row.get("custom_project_code") or row.get("custom_crm_no")
	if code and name and code != name:
		return code + " — " + name
	return name or code or project
