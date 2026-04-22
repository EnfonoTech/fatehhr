"""Expose a minimal, read-only view of `Fateh HR Settings` to the mobile app.

Only the few keys the client needs are surfaced here — never the whole doc
(permission surface + forward-compat). If a field is not yet installed
(migration not run), we fall back to safe defaults rather than 500.
"""

import frappe


@frappe.whitelist()
def get_public() -> dict:
	if not frappe.db.exists("DocType", "Fateh HR Settings"):
		return _defaults()
	try:
		doc = frappe.get_cached_doc("Fateh HR Settings", "Fateh HR Settings")
	except Exception:
		return _defaults()
	return {
		"attendance_mode": (doc.get("attendance_mode") or "Checkin Based"),
	}


def _defaults() -> dict:
	return {"attendance_mode": "Checkin Based"}
