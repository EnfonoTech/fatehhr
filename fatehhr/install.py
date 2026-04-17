import frappe

CAPACITOR_ORIGINS = (
	"https://localhost",
	"capacitor://localhost",
	"http://localhost",
)


def ensure_capacitor_cors():
	"""Idempotently append Capacitor origins to System Settings → allow_cors.

	frappe-vue-pwa §3.6. Runs via `after_migrate` hook so every bench
	migrate on this app keeps CORS in sync.
	"""
	settings = frappe.get_single("System Settings")
	current = (settings.allow_cors or "").strip()
	existing = {o.strip() for o in current.split(",") if o.strip()}
	missing = [o for o in CAPACITOR_ORIGINS if o not in existing]
	if not missing:
		return
	merged = ",".join(sorted(existing.union(missing)))
	settings.allow_cors = merged
	settings.flags.ignore_permissions = True
	settings.save()
