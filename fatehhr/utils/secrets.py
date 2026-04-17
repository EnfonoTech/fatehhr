import frappe
from frappe.utils.password import get_decrypted_password


def get_or_create_api_secret(user: str) -> str:
	"""Return the stable api_secret for the given user.

	Rule (frappe-vue-pwa §3.5): never regenerate per call. Reuse the stored
	secret unless it is missing/empty, in which case generate once and persist.
	"""
	user_doc = frappe.get_doc("User", user)
	if not user_doc.api_key:
		user_doc.api_key = frappe.generate_hash(length=15)
		user_doc.save(ignore_permissions=True)

	try:
		api_secret = get_decrypted_password(
			"User", user, fieldname="api_secret", raise_exception=False
		)
	except Exception:
		api_secret = None

	if api_secret:
		return api_secret

	api_secret = frappe.generate_hash(length=32)
	user_doc.api_secret = api_secret
	user_doc.save(ignore_permissions=True)
	frappe.db.commit()
	return api_secret
