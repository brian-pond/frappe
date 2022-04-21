# -*- coding: utf-8 -*-
# Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import validate_email_address ,cint, cstr
import imaplib,poplib,smtplib
from frappe.email.utils import get_port

class EmailDomain(Document):
	def autoname(self):
		if self.domain_name:
			self.name = self.domain_name

	# Spectrum Fruits: Removed the validate function.  It was preventing saving the record altogether,
	# which made it very awkward for correcting or debugging just 1 or 2 fields.

	def on_update(self):
		"""update all email accounts using this domain"""
		for email_account in frappe.get_all("Email Account",
		filters={"domain": self.name}):

			try:
				email_account = frappe.get_doc("Email Account",
					email_account.name)
				email_account.set("email_server",self.email_server)
				email_account.set("use_imap",self.use_imap)
				email_account.set("use_ssl",self.use_ssl)
				email_account.set("use_tls",self.use_tls)
				email_account.set("attachment_limit",self.attachment_limit)
				email_account.set("smtp_server",self.smtp_server)
				email_account.set("smtp_port",self.smtp_port)
				email_account.set("use_ssl_for_outgoing", self.use_ssl_for_outgoing)
				email_account.set("incoming_port", self.incoming_port)
				email_account.save()
			except Exception as e:
				frappe.msgprint(email_account.name)
				frappe.throw(e)
				return None


# Spectrum Fruits
@frappe.whitelist()
def validate_domain(email_domain_name):
	"""Validate email id and check POP3/IMAP and SMTP connections is enabled."""

	doc = frappe.get_doc("Email Domain",email_domain_name)
	if not doc:
		frappe.throw(_(f"Could not find document 'Email Domain' named '{email_domain_name}'"))

	if doc.email_id:
		ret = validate_email_address(doc.email_id, True)

	if frappe.local.flags.in_patch:
		frappe.msgprint(_("Skipping domain tests because mode = 'in patch'"))
		return

	if frappe.local.flags.in_test:
		frappe.msgprint(_("Skipping domain tests because mode = 'in test'"))
		return

	if frappe.local.flags.in_install:
		frappe.msgprint(_("Skipping domain tests because mode = 'in install'"))
		return

	# Inbound Email (IMAP or POP3)
	try:
		if doc.use_imap:
			# IMAP
			if doc.use_ssl:
				test = imaplib.IMAP4_SSL(doc.email_server, port=get_port(doc))
			else:
				test = imaplib.IMAP4(doc.email_server, port=get_port(doc))
		else:
			# POP3
			if doc.use_ssl:
				test = poplib.POP3_SSL(doc.email_server, port=get_port(doc))
			else:
				test = poplib.POP3(doc.email_server, port=get_port(doc))
	except Exception:
		frappe.throw(_("Incoming email account not correct"))
		return None
	finally:
		try:
			if doc.use_imap:
				test.logout()
			else:
				test.quit()
		except Exception:
			pass

	# Outbound Email (SMTP)
	try:
		if doc.use_tls and not doc.smtp_port:
			doc.smtp_port = 587
			doc.save()
		sess = smtplib.SMTP(cstr(doc.smtp_server or ""), cint(doc.smtp_port) or None)
		sess.quit()
	except Exception:
		frappe.throw(_("Outgoing email account not correct"))
		return None

	frappe.msgprint(_("\u2713 Email domain '{0}' is valid.".format(email_domain_name)), indicator='green')
