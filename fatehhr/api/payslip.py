import frappe
from frappe.utils.print_format import download_pdf


@frappe.whitelist()
def list_mine(limit: int = 24) -> list[dict]:
	employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
	if not employee:
		return []
	return frappe.get_all(
		"Salary Slip",
		filters={"employee": employee, "docstatus": 1},
		fields=[
			"name", "start_date", "end_date", "posting_date",
			"gross_pay", "total_deduction", "net_pay", "currency", "status",
		],
		order_by="end_date desc",
		limit=int(limit),
	)


@frappe.whitelist()
def detail(name: str) -> dict:
	employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
	doc = frappe.get_doc("Salary Slip", name)
	if doc.employee != employee:
		frappe.throw(frappe._("Not your slip."), frappe.PermissionError)
	return {
		"name": doc.name,
		"posting_date": doc.posting_date,
		"start_date": doc.start_date,
		"end_date": doc.end_date,
		"gross_pay": doc.gross_pay,
		"net_pay": doc.net_pay,
		"total_deduction": doc.total_deduction,
		"currency": doc.currency,
		"earnings": [{"name": e.salary_component, "amount": e.amount} for e in doc.earnings],
		"deductions": [{"name": d.salary_component, "amount": d.amount} for d in doc.deductions],
	}


@frappe.whitelist()
def pdf(name: str) -> None:
	employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
	doc = frappe.get_doc("Salary Slip", name)
	if doc.employee != employee:
		frappe.throw(frappe._("Not your slip."), frappe.PermissionError)
	download_pdf("Salary Slip", name, format=None)
