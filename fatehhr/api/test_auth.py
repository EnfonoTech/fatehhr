"""Tests for fatehhr.api.auth.

Covers `site_info`, the pre-login reachability probe the app's server-address
screen uses to verify a typed URL before storing it. A stored typo is
unrecoverable from inside the app, so this endpoint's contract is load-bearing:
the client keys off `app == "fatehhr"` to tell "wrong server" from "unreachable".
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from fatehhr.api import auth


class TestSiteInfo(FrappeTestCase):
	def test_identifies_the_app(self):
		"""The client rejects any payload whose `app` is not exactly "fatehhr"."""
		self.assertEqual(auth.site_info()["app"], "fatehhr")

	def test_reports_ok(self):
		self.assertTrue(auth.site_info()["ok"])

	def test_reports_app_version(self):
		import fatehhr

		self.assertEqual(auth.site_info()["app_version"], fatehhr.__version__)

	def test_leaks_nothing_beyond_the_contract(self):
		"""Guest-readable, so the payload must stay exactly these three keys.

		Adding site, tenant or user data here would expose it to anyone who can
		reach the host, since the endpoint is allow_guest by necessity.
		"""
		self.assertEqual(set(auth.site_info()), {"ok", "app", "app_version"})

	def test_is_guest_callable(self):
		"""allow_guest is the point — there is no session when setup runs.

		frappe.whitelist registers by appending to the module-level `whitelisted`
		and `guest_methods` lists (frappe/__init__.py); it sets no attribute on
		the function, so membership is the only way to assert this.
		"""
		self.assertIn(auth.site_info, frappe.whitelisted)
		self.assertIn(auth.site_info, frappe.guest_methods)

	def test_works_without_a_session(self):
		"""Must not touch frappe.session.user or any permission-bound record."""
		original = frappe.session.user
		try:
			frappe.set_user("Guest")
			self.assertEqual(auth.site_info()["app"], "fatehhr")
		finally:
			frappe.set_user(original)
