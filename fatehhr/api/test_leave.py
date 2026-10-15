"""Tests for fatehhr.api.leave.

The client-approval fields live in the separate `cooperheat` app, so the
schema-dependent tests skip cleanly when it is absent — on a plain Fateh HR
site we assert the keys are silently dropped instead.
"""

import unittest

import frappe
from frappe.tests.utils import FrappeTestCase

from fatehhr.api import leave


def _schema_present() -> bool:
	return leave._client_approval_fields_present()


class TestLeaveFormConfig(FrappeTestCase):
	def test_form_config_shape(self):
		cfg = leave.form_config()
		self.assertIn("client_approval", cfg)
		self.assertIsInstance(cfg["client_approval"], bool)
		self.assertEqual(cfg["client_approval"], _schema_present())

	def test_types_with_balance_exposes_guard_flags(self):
		"""Every row carries the flags the app's balance guard relies on."""
		for row in leave.types_with_balance():
			for key in ("leave_type", "balance", "total", "is_lwp", "allow_negative", "has_allocation"):
				self.assertIn(key, row)
			self.assertIsInstance(row["is_lwp"], bool)
			self.assertIsInstance(row["allow_negative"], bool)
			self.assertEqual(row["has_allocation"], row["total"] > 0)

	def test_leave_days_rejects_unknown_type(self):
		with self.assertRaises(frappe.ValidationError):
			leave.leave_days("__no_such_leave_type__", "2026-01-01", "2026-01-02")


class TestClientApprovalValues(FrappeTestCase):
	def test_rejects_invalid_required_value(self):
		with self.assertRaises(frappe.ValidationError):
			leave._client_approval_values("Maybe", None, None)

	def test_not_required_drops_received_and_attachment(self):
		out = leave._client_approval_values("Not Required", "Yes", "/files/x.jpg")
		self.assertNotIn("custom_client_approval_received", out)
		self.assertNotIn("custom_client_approval_attachment", out)

	def test_blank_inputs_default_safely(self):
		out = leave._client_approval_values(None, None, None)
		if _schema_present():
			self.assertEqual(out, {"custom_client_approval_required": "Not Required"})
		else:
			self.assertEqual(out, {})

	def test_plain_site_drops_keys(self):
		if _schema_present():
			self.skipTest("cooperheat schema present — guard path not exercised here")
		out = leave._client_approval_values("Yes", "Yes", "/files/x.jpg")
		self.assertEqual(out, {})


@unittest.skipUnless(_schema_present(), "requires the cooperheat client-approval fields")
class TestClientApprovalWithSchema(FrappeTestCase):
	def test_required_pending(self):
		out = leave._client_approval_values("Yes", "No", None)
		self.assertEqual(
			out,
			{
				"custom_client_approval_required": "Yes",
				"custom_client_approval_received": "No",
			},
		)

	def test_received_requires_attachment(self):
		with self.assertRaises(frappe.ValidationError):
			leave._client_approval_values("Yes", "Yes", "")

	def test_received_with_attachment(self):
		out = leave._client_approval_values("Yes", "Yes", "/files/client-ok.jpg")
		self.assertEqual(out["custom_client_approval_received"], "Yes")
		self.assertEqual(out["custom_client_approval_attachment"], "/files/client-ok.jpg")

	def test_rejects_invalid_received_value(self):
		with self.assertRaises(frappe.ValidationError):
			leave._client_approval_values("Yes", "Perhaps", None)
