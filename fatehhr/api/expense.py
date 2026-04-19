import frappe


@frappe.whitelist()
def submit_claim(lines: list[dict], company: str | None = None) -> dict:
	employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
	if not employee:
		frappe.throw(frappe._("No Employee linked to this user."))
	if not lines:
		frappe.throw(frappe._("At least one expense line is required."))

	emp_doc = frappe.get_cached_doc("Employee", employee)
	claim = frappe.get_doc({
		"doctype": "Expense Claim",
		"employee": employee,
		"company": company or emp_doc.company,
		"expenses": [],
	})
	for ln in lines:
		claim.append("expenses", {
			"expense_date": ln.get("expense_date"),
			"expense_type": ln.get("expense_type"),
			"description": ln.get("description") or "",
			"amount": float(ln.get("amount") or 0),
			"sanctioned_amount": float(ln.get("amount") or 0),
		})
	claim.flags.ignore_permissions = True
	claim.insert()

	# Attach receipts to the claim (one File per line, via its URL)
	for ln in lines:
		if ln.get("receipt_file_url"):
			frappe.get_doc({
				"doctype": "File",
				"file_url": ln["receipt_file_url"],
				"attached_to_doctype": "Expense Claim",
				"attached_to_name": claim.name,
				"folder": "Home/Attachments",
				"is_private": 0,
			}).insert(ignore_permissions=True)

	claim.save(ignore_permissions=True)
	frappe.db.commit()
	return {"name": claim.name, "total_claimed_amount": claim.total_claimed_amount}


@frappe.whitelist()
def list_mine(limit: int = 50) -> list[dict]:
	employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
	if not employee:
		return []
	return frappe.get_all(
		"Expense Claim",
		filters={"employee": employee},
		fields=[
			"name", "posting_date", "total_claimed_amount",
			"total_sanctioned_amount", "status", "approval_status",
		],
		order_by="posting_date desc",
		limit=int(limit),
	)


@frappe.whitelist()
def summary() -> dict:
	"""Aggregated totals for the current user: claimed / pending / approved / paid."""
	employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
	if not employee:
		return {"claimed": 0, "pending": 0, "approved": 0, "paid": 0, "count": 0}
	rows = frappe.get_all(
		"Expense Claim",
		filters={"employee": employee},
		fields=["total_claimed_amount", "total_sanctioned_amount", "status", "approval_status"],
	)
	claimed = sum(float(r.total_claimed_amount or 0) for r in rows)
	pending = sum(
		float(r.total_claimed_amount or 0) for r in rows
		if (r.approval_status or "Draft") not in ("Approved", "Rejected")
		and (r.status or "Draft") not in ("Paid", "Cancelled")
	)
	approved = sum(
		float(r.total_sanctioned_amount or 0) for r in rows
		if r.approval_status == "Approved"
	)
	paid = sum(float(r.total_sanctioned_amount or 0) for r in rows if r.status == "Paid")
	return {
		"claimed": round(claimed, 2),
		"pending": round(pending, 2),
		"approved": round(approved, 2),
		"paid": round(paid, 2),
		"count": len(rows),
	}
