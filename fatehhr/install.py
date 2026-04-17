import frappe

CAPACITOR_ORIGINS = (
	"https://localhost",
	"capacitor://localhost",
	"http://localhost",
)


def ensure_capacitor_cors():
	"""Idempotently append Capacitor origins to site_config.allow_cors.

	frappe-vue-pwa §3.6. Frappe v15 reads CORS allowlist from
	`frappe.conf.allow_cors` (a comma-separated string or a list) —
	configured via `site_config.json` / `common_site_config.json`.

	Runs via `after_migrate` hook so every bench migrate on this app
	keeps CORS in sync. Only writes to the CURRENT site's config.
	"""
	current = frappe.conf.get("allow_cors") or ""
	if isinstance(current, list):
		existing = {str(o).strip() for o in current if str(o).strip()}
	else:
		existing = {o.strip() for o in str(current).split(",") if o.strip()}

	missing = [o for o in CAPACITOR_ORIGINS if o not in existing]
	if not missing:
		return

	merged = sorted(existing.union(missing))
	frappe.conf["allow_cors"] = ",".join(merged)

	# Persist to site_config.json
	from frappe.installer import update_site_config
	update_site_config(
		"allow_cors",
		",".join(merged),
		site_config_path=frappe.get_site_path("site_config.json"),
	)
