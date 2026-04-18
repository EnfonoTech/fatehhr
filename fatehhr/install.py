import frappe

CAPACITOR_ORIGINS = (
	"https://localhost",
	"capacitor://localhost",
	"http://localhost",
)


def ensure_capacitor_cors():
	"""Idempotently append Capacitor origins to site_config.allow_cors.

	frappe-vue-pwa §3.6. Frappe v15's CORS checker expects a **JSON list**
	(or the literal "*"). A comma-separated string is silently treated as
	one opaque origin and never matches — so NO `Access-Control-*` headers
	get emitted and the Capacitor WebView's fetch throws "Failed to fetch".
	Writing a list fixes it.
	"""
	current = frappe.conf.get("allow_cors")
	if isinstance(current, list):
		existing = {str(o).strip() for o in current if str(o).strip()}
	elif isinstance(current, str) and current.strip():
		# Legacy comma-separated value — migrate to a proper list
		existing = {o.strip() for o in current.split(",") if o.strip()}
	else:
		existing = set()

	merged = sorted(existing.union(CAPACITOR_ORIGINS))

	# Rewrite if the stored value isn't already a list with the same set.
	needs_write = not isinstance(current, list) or set(current) != set(merged)
	if not needs_write:
		return

	from frappe.installer import update_site_config
	update_site_config(
		"allow_cors",
		merged,
		site_config_path=frappe.get_site_path("site_config.json"),
	)
	frappe.conf["allow_cors"] = merged
