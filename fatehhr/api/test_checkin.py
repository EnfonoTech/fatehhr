"""Tests for fatehhr.api.checkin.

Focused on the future-clamp (spec §7): a future-dated punch (device-clock skew)
is clamped to server-now rather than rejected — a hard reject was blocking every
check-in/out from devices running ahead. The past is left untouched so offline
queue drains, which carry the real (older) punch time and may arrive hours or
days late, still land unchanged.
"""

import unittest
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_to_date, now_datetime

from fatehhr.api import checkin


class TestCheckinFutureClamp(FrappeTestCase):
	def test_future_punch_clamped_to_now(self):
		"""A punch dated well ahead is clamped back to ~now, never rejected."""
		future = add_to_date(now_datetime(), hours=1)
		result = checkin._clamp_future(future)
		# clamped to server-now (within a few seconds of the call)
		self.assertLess(abs((result - now_datetime()).total_seconds()), 60)

	def test_now_unchanged(self):
		"""A punch at 'now' passes through unchanged."""
		ts = now_datetime()
		self.assertEqual(checkin._clamp_future(ts), ts)

	def test_within_skew_unchanged(self):
		"""A punch a minute ahead (minor drift) is kept as-is (within tolerance)."""
		ts = add_to_date(now_datetime(), minutes=1)
		self.assertEqual(checkin._clamp_future(ts), ts)

	def test_backdated_offline_drain_unchanged(self):
		"""A punch dated days in the past (late offline drain) is preserved."""
		ts = add_to_date(now_datetime(), days=-3)
		self.assertEqual(checkin._clamp_future(ts), ts)

	def test_none_is_noop(self):
		self.assertIsNone(checkin._clamp_future(None))


# ---------------------------------------------------------------------------
# Idempotency of checkin.create (duplicate-submit guard)
# ---------------------------------------------------------------------------


def _iso_utc(dt: datetime) -> str:
	return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class TestCheckinIdempotency(FrappeTestCase):
	"""create() must return the existing row instead of inserting when:
	- the same client_id is sent twice, or
	- a checkin with the same employee + log_type exists within 60 s.
	The opposite log_type, or the same type outside the window, is allowed.

	create() calls frappe.db.commit(); it is patched to a no-op so the
	FrappeTestCase rollback still discards everything written here.
	"""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		company = frappe.db.get_value("Company", {}, "name")
		gender = frappe.db.get_value("Gender", {}, "name")
		if not company or not gender:
			raise unittest.SkipTest("needs at least one Company and Gender")
		email = f"checkin-idem-{uuid.uuid4().hex[:8]}@example.com"
		with patch.object(frappe.db, "commit"):
			frappe.get_doc({
				"doctype": "User", "email": email, "first_name": "Checkin Idem",
				"send_welcome_email": 0,
				# Insert perms on Employee Checkin (create() does not bypass them).
				"roles": [{"role": "HR User"}],
			}).insert(ignore_permissions=True)
			cls.employee = frappe.get_doc({
				"doctype": "Employee", "first_name": "Checkin Idem", "gender": gender,
				"date_of_birth": "1990-01-01", "date_of_joining": "2020-01-01",
				"company": company, "status": "Active", "user_id": email,
			}).insert(ignore_permissions=True).name
		cls.user = email

	def setUp(self):
		frappe.set_user("Administrator")
		frappe.db.delete("Employee Checkin", {"employee": self.employee})
		frappe.set_user(self.user)
		self._commit = patch.object(frappe.db, "commit")
		self._commit.start()
		# Two hours ago: clear of the future clamp, deterministic window maths.
		self.base = datetime.now(timezone.utc) - timedelta(hours=2)

	def tearDown(self):
		self._commit.stop()
		frappe.set_user("Administrator")

	def _create(self, log_type, at, client_id=None):
		return checkin.create(log_type=log_type, timestamp=_iso_utc(at), client_id=client_id)

	def _count(self, log_type=None):
		filters = {"employee": self.employee}
		if log_type:
			filters["log_type"] = log_type
		return frappe.db.count("Employee Checkin", filters)

	def test_same_client_id_twice_creates_one(self):
		key = str(uuid.uuid4())
		a = self._create("IN", self.base, key)
		b = self._create("IN", self.base + timedelta(minutes=5), key)
		self.assertEqual(a["name"], b["name"])
		self.assertEqual(self._count(), 1)

	def test_no_key_same_type_within_60s_creates_one(self):
		a = self._create("IN", self.base)
		b = self._create("IN", self.base + timedelta(seconds=30))
		self.assertEqual(a["name"], b["name"])
		self.assertEqual(self._count(), 1)

	def test_different_keys_same_type_within_60s_creates_one(self):
		"""Multi-tap on current APKs mints a fresh client_id per tap."""
		a = self._create("IN", self.base, str(uuid.uuid4()))
		b = self._create("IN", self.base + timedelta(milliseconds=100), str(uuid.uuid4()))
		self.assertEqual(a["name"], b["name"])
		self.assertEqual(self._count(), 1)

	def test_opposite_type_within_60s_allowed(self):
		a = self._create("IN", self.base)
		b = self._create("OUT", self.base + timedelta(seconds=20))
		self.assertNotEqual(a["name"], b["name"])
		self.assertEqual(self._count("IN"), 1)
		self.assertEqual(self._count("OUT"), 1)

	def test_same_type_after_60s_allowed(self):
		# OUT -> OUT rather than IN -> IN: sites such as Cooperheat refuse a
		# second IN while one is open, which is a different rule.
		self._create("IN", self.base)
		a = self._create("OUT", self.base + timedelta(seconds=30))
		b = self._create("OUT", self.base + timedelta(seconds=120))
		self.assertNotEqual(a["name"], b["name"])
		self.assertEqual(self._count("OUT"), 2)
