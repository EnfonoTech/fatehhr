import frappe


@frappe.whitelist()
def feed(limit: int = 50) -> list[dict]:
	user = frappe.session.user
	return frappe.get_all(
		"Notification Log",
		filters={"for_user": user},
		fields=[
			"name", "subject", "email_content", "type",
			"document_type", "document_name", "read", "creation",
		],
		order_by="creation desc",
		limit=int(limit),
	)


@frappe.whitelist()
def unread_count() -> int:
	return frappe.db.count("Notification Log", {
		"for_user": frappe.session.user,
		"read": 0,
	})


@frappe.whitelist()
def mark_read(name: str) -> dict:
	doc = frappe.get_doc("Notification Log", name)
	if doc.for_user != frappe.session.user:
		frappe.throw(frappe._("Not yours."), frappe.PermissionError)
	doc.read = 1
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"name": name, "read": 1}
