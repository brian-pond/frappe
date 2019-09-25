import frappe.app

# Make sure you use an absolute path to 'sites'
frappe.app.serve(port=8000, sites_path='/home/think/erpnext/v12-pristine/frappe-bench/sites')

