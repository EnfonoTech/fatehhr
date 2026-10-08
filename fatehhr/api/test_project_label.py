import frappe
from frappe.tests.utils import FrappeTestCase

from fatehhr.utils.project_label import project_label


class TestProjectLabel(FrappeTestCase):
	def test_none_returns_none(self):
		self.assertIsNone(project_label(None))

	def test_code_and_name_are_joined(self):
		if not frappe.get_meta("Project").has_field("custom_project_code"):
			self.skipTest("site has no custom_project_code")
		frappe.get_doc(
			{"doctype": "Project", "project_name": "Label Test Job", "custom_project_code": "NRT-LBL-1", "company": frappe.defaults.get_defaults().company}
		).insert(ignore_permissions=True)
		self.assertEqual(project_label("NRT-LBL-1"), "NRT-LBL-1 — Label Test Job")

	def test_unknown_project_falls_back_to_its_id(self):
		self.assertEqual(project_label("NO-SUCH-PROJECT"), "NO-SUCH-PROJECT")
