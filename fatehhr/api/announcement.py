import frappe


@frappe.whitelist()
def feed(limit: int = 50) -> list[dict]:
	return frappe.get_all(
		"HR Announcement",
		fields=["name", "title", "body", "pinned", "published_on", "published_by"],
		order_by="pinned desc, published_on desc",
		limit=int(limit),
	)
