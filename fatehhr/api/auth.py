import hashlib

import frappe
from frappe.auth import LoginManager
from frappe.utils.password import get_decrypted_password

from fatehhr.utils.secrets import get_or_create_api_secret

PIN_LOCKOUT_THRESHOLD = 5


class PinLockoutError(frappe.AuthenticationError):
	http_status_code = 423  # Locked


@frappe.whitelist(allow_guest=True)
def login(usr: str, pwd: str) -> dict:
	"""Email+password first-time login.

	Returns {user, api_key, api_secret, require_pin_setup}.
	Raises frappe.AuthenticationError on bad credentials.
	"""
	lm = LoginManager()
	lm.authenticate(user=usr, pwd=pwd)
	lm.post_login()
	user = frappe.session.user
	api_secret = get_or_create_api_secret(user)
	api_key = frappe.db.get_value("User", user, "api_key")
	return {
		"user": user,
		"api_key": api_key,
		"api_secret": api_secret,
		"require_pin_setup": _require_pin_setup(user),
	}


@frappe.whitelist()
def set_pin(pin: str) -> dict:
	_validate_pin_shape(pin)
	employee = _current_employee()
	employee.custom_pin_hash = _hash_pin(pin)
	employee.flags.ignore_permissions = True
	employee.save()
	frappe.db.commit()
	return {"ok": True}


@frappe.whitelist(allow_guest=True)
def verify_pin(user: str, pin: str) -> dict:
	employee_name = frappe.db.get_value("Employee", {"user_id": user}, "name")
	if not employee_name:
		raise frappe.AuthenticationError("No employee linked to this user.")

	if _is_locked_out(employee_name):
		raise PinLockoutError("PIN locked. Please sign in with your password.")

	stored = get_decrypted_password(
		"Employee", employee_name, fieldname="custom_pin_hash", raise_exception=False
	)
	if not stored or stored != _hash_pin(pin):
		_record_failed_attempt(employee_name)
		raise frappe.AuthenticationError("Invalid PIN.")

	_reset_failed_attempts(employee_name)
	api_secret = get_or_create_api_secret(user)
	api_key = frappe.db.get_value("User", user, "api_key")
	return {"user": user, "api_key": api_key, "api_secret": api_secret}


@frappe.whitelist()
def change_pin(old_pin: str, new_pin: str) -> dict:
	_validate_pin_shape(new_pin)
	employee = _current_employee()
	stored = get_decrypted_password(
		"Employee", employee.name, fieldname="custom_pin_hash", raise_exception=False
	)
	if not stored or stored != _hash_pin(old_pin):
		raise frappe.AuthenticationError("Current PIN incorrect.")
	employee.custom_pin_hash = _hash_pin(new_pin)
	employee.flags.ignore_permissions = True
	employee.save()
	frappe.db.commit()
	return {"ok": True}


# --- helpers ---------------------------------------------------------------


def _require_pin_setup(user: str) -> bool:
	employee_name = frappe.db.get_value("Employee", {"user_id": user}, "name")
	if not employee_name:
		return True
	stored = get_decrypted_password(
		"Employee", employee_name, fieldname="custom_pin_hash", raise_exception=False
	)
	return not bool(stored)


def _current_employee():
	user = frappe.session.user
	employee_name = frappe.db.get_value("Employee", {"user_id": user}, "name")
	if not employee_name:
		frappe.throw(frappe._("No employee linked to your user."))
	return frappe.get_doc("Employee", employee_name)


def _validate_pin_shape(pin: str) -> None:
	if not isinstance(pin, str) or not pin.isdigit() or not (4 <= len(pin) <= 6):
		frappe.throw(frappe._("PIN must be 4 to 6 digits."))


def _hash_pin(pin: str) -> str:
	salt = frappe.local.conf.get("secret_hash_salt") or frappe.local.conf.get("secret_key") or "fatehhr-pin-salt"
	return hashlib.sha256(f"{salt}:{pin}".encode()).hexdigest()


def _failed_key(employee: str) -> str:
	return f"fatehhr:pin_fail:{employee}"


def _record_failed_attempt(employee: str) -> None:
	key = _failed_key(employee)
	count = (frappe.cache().get_value(key) or 0) + 1
	frappe.cache().set_value(key, count, expires_in_sec=60 * 60)


def _reset_failed_attempts(employee: str) -> None:
	frappe.cache().delete_value(_failed_key(employee))


def _is_locked_out(employee: str) -> bool:
	count = frappe.cache().get_value(_failed_key(employee)) or 0
	return count >= PIN_LOCKOUT_THRESHOLD
