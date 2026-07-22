"""Tests for fatehhr.api.checkin.

Focused on the employee time-adjust guard (spec §7): the server rejects a
future-dated punch but leaves the past unbounded so offline queue drains — which
carry the real (older) punch time and may arrive hours or days late — still land.
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_to_date, now_datetime

from fatehhr.api import checkin


class TestCheckinTimeGuard(FrappeTestCase):
	def test_future_punch_rejected(self):
		"""A punch dated well beyond the skew tolerance is rejected."""
		future = add_to_date(now_datetime(), hours=1)
		with self.assertRaises(frappe.ValidationError):
			checkin._guard_not_future(future)

	def test_now_allowed(self):
		"""The normal case — a punch at 'now' — passes."""
		checkin._guard_not_future(now_datetime())  # must not raise

	def test_within_skew_allowed(self):
		"""A punch a minute ahead (device-clock drift) is tolerated."""
		checkin._guard_not_future(add_to_date(now_datetime(), minutes=1))  # must not raise

	def test_backdated_offline_drain_allowed(self):
		"""A punch dated days in the past (late offline drain) is NOT rejected —
		the 24h employee bound is enforced on the client, not re-clamped here."""
		checkin._guard_not_future(add_to_date(now_datetime(), days=-3))  # must not raise

	def test_none_is_noop(self):
		checkin._guard_not_future(None)  # must not raise
