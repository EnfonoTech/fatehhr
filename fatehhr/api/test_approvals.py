"""Tests for fatehhr.api.approvals.

These run on whatever bench `bench run-tests` targets. The approval schema
lives in the separate `cooperheat` app, so tests that need it skip cleanly when
it is absent (e.g. the shared demo tenant) — the guard behaviour itself is what
we assert there.
"""

import unittest

import frappe
from frappe.tests.utils import FrappeTestCase

from fatehhr.api import approvals


def _schema_present() -> bool:
	return frappe.get_meta("Attendance").has_field("workflow_state")


class TestApprovalsGuards(FrappeTestCase):
	def test_summary_shape(self):
		"""summary() always returns the contract keys with correct types."""
		s = approvals.summary()
		self.assertIn("enabled", s)
		self.assertIn("is_approver", s)
		self.assertIn("pending_count", s)
		self.assertIsInstance(s["enabled"], bool)
		self.assertIsInstance(s["is_approver"], bool)
		self.assertIsInstance(s["pending_count"], int)

	def test_disabled_tenant_returns_safe_defaults(self):
		"""On a tenant without the cooperheat schema, everything is inert."""
		if _schema_present():
			self.skipTest("cooperheat schema present — guard path not exercised here")
		s = approvals.summary()
		self.assertFalse(s["enabled"])
		self.assertFalse(s["is_approver"])
		self.assertEqual(s["pending_count"], 0)
		self.assertEqual(approvals.list_pending(), [])
		self.assertEqual(approvals.list_done(), [])

	def test_actions_blocked_when_disabled(self):
		if _schema_present():
			self.skipTest("cooperheat schema present — guard path not exercised here")
		with self.assertRaises(frappe.ValidationError):
			approvals.approve("NON-EXISTENT")
		with self.assertRaises(frappe.ValidationError):
			approvals.reject("NON-EXISTENT")


@unittest.skipUnless(_schema_present(), "requires the cooperheat approval schema")
class TestApprovalsWithSchema(FrappeTestCase):
	"""Exercised only on a cooperheat bench. Verifies permission gating without
	mutating real records (read-only assertions + a not-mine rejection)."""

	def test_detail_rejects_non_approver(self):
		# Find a pending record NOT assigned to the current session user, if any.
		me = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
		others = frappe.get_all(
			"Attendance",
			filters={
				"workflow_state": ["in", list(approvals.PENDING_STATES)],
				"docstatus": 1,
				"current_approver": ["!=", me or "__none__"],
			},
			pluck="name",
			limit=1,
		)
		if not others:
			self.skipTest("no foreign pending Attendance to assert against")
		if "HR Manager" in frappe.get_roles(frappe.session.user):
			self.skipTest("HR Manager bypasses the per-approver gate")
		with self.assertRaises(frappe.PermissionError):
			approvals.detail(others[0])
