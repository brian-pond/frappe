""" frappe.database.test_postgres_save """

import frappe
def run_test1():
	"""
	bench execute frappe.database.test_postgres_save.run_test1
	"""

	# frame_records = inspect.stack()[1]
	# print(frame_records)

	print("\n========\nBEGIN TEST\n========")

	new_document = frappe.new_doc("ToDo")
	new_document.priority = 'Low'
	new_document.description = 'Hello'
	new_document.save()
	print("Successfully Inserted New Document.")
	print(f"    Creation: {new_document.creation}, Time Zone = {new_document.creation.tzinfo}")
	print(f"    Modified: {new_document.modified}, Time Zone = {new_document.modified.tzinfo}")

	from_disk = frappe.get_doc("ToDo", new_document.name)
	print("Re-reading document from SQL storage:")
	print(f"    Creation: {from_disk.creation}, Time Zone = {from_disk.creation.tzinfo}")
	print(f"    Modified: {from_disk.modified}, Time Zone = {from_disk.modified.tzinfo}")

	new_document.priority = 'Low'
	new_document.save()
	print("Successfully Updated New Document.")
	print(f"    Creation: {new_document.creation}")
	print(f"    Modified: {new_document.modified}")

def run_test2():
	"""
	bench execute frappe.database.test_postgres_save.run_test2
	"""

	# frame_records = inspect.stack()[1]
	# print(frame_records)

	print("\n========\nBEGIN TEST\n========")

	from_disk = frappe.get_doc("Customer", "CUST-CONS-00")
	print("Re-reading Customer document from SQL storage:")
	print(f"    Creation: {from_disk.creation}, Time Zone = {from_disk.creation.tzinfo}")
	print(f"    Modified: {from_disk.modified}, Time Zone = {from_disk.modified.tzinfo}")

	from_disk.first_name = from_disk.first_name + 'A'
	from_disk.save()
	print("Successfully update 'first_name' of the Customer document.")
	print(f"    Creation: {from_disk.creation}")
	print(f"    Modified: {from_disk.modified}")
