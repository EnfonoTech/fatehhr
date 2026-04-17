import frappe
import requests

MIN_CLIENT_VERSION = "1.0.0"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
CACHE_TTL_SEC = 60 * 60 * 24 * 7  # 7 days
CACHE_PRECISION = 5  # rounding decimals → ~1.1 m


@frappe.whitelist(allow_guest=True)
def version_compat(client_version: str = "0.0.0") -> dict:
	return {
		"min_client_version": MIN_CLIENT_VERSION,
		"server_app_version": _server_version(),
	}


@frappe.whitelist()
def reverse_geocode(lat: float, lng: float) -> dict:
	lat = float(lat)
	lng = float(lng)
	key = f"fatehhr:geocode:{round(lat, CACHE_PRECISION)}:{round(lng, CACHE_PRECISION)}"
	cached = frappe.cache().get_value(key)
	if cached:
		return cached

	try:
		data = _fetch_nominatim(lat, lng)
	except Exception as e:
		frappe.log_error(f"reverse_geocode failed: {e}", "fatehhr.reverse_geocode")
		return {"address": None, "city": None, "raw": None}

	response = {
		"address": (data or {}).get("display_name"),
		"city": ((data or {}).get("address") or {}).get("city"),
		"raw": data,
	}
	frappe.cache().set_value(key, response, expires_in_sec=CACHE_TTL_SEC)
	return response


def _fetch_nominatim(lat: float, lng: float) -> dict:
	r = requests.get(
		NOMINATIM_URL,
		params={"lat": lat, "lon": lng, "format": "jsonv2", "zoom": 18},
		headers={"User-Agent": "FatehHR/1.0 (contact: dev@enfonotech.com)"},
		timeout=6,
	)
	r.raise_for_status()
	return r.json()


def _server_version() -> str:
	import fatehhr
	return getattr(fatehhr, "__version__", "0.0.0")
