"""Tests for fatehhr.api.checkin.

Focused on the future-clamp (spec §7): a future-dated punch (device-clock skew)
is clamped to server-now rather than rejected — a hard reject was blocking every
check-in/out from devices running ahead. The past is left untouched so offline
queue drains, which carry the real (older) punch time and may arrive hours or
days late, still land unchanged.
"""

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
