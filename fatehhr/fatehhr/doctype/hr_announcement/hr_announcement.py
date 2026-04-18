import frappe
from frappe.model.document import Document


class HRAnnouncement(Document):
	def before_insert(self):
		if not self.published_by:
			self.published_by = frappe.session.user
