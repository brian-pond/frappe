""" frappe/utils/pdf.py """

# Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
# MIT License. See license.txt
from __future__ import unicode_literals

import io
import os
import re
from distutils.version import LooseVersion
import subprocess

import pdfkit
import six
from bs4 import BeautifulSoup
from PyPDF2 import PdfFileReader, PdfFileWriter

import frappe
from frappe import _
from frappe.utils import scrub_urls
from frappe.utils.jinja import is_rtl

PDF_CONTENT_ERRORS = ["ContentNotFoundError", "ContentOperationNotPermittedError",
	"UnknownContentError", "RemoteHostClosedError"]

def get_pdf(html, options=None, output=None):
	"""
	Convert HTML string to a PDF document.
	"""

	# Datahenge:
	# The official Frappe code likes to "assume" that the Site name is going to be the HTTP Domain.
	# Pretty poor assumption.  This also makes copying entire environments painful, because you're forced
	# to rename the site directories.
	#
	# I believe I've permanently solved this headache in "frappe/utils/data.py."
	# But I'm leaving this debugging option here anyway.
	debug_mode = frappe.db.get_single_value("System Settings", "enable_pdf_debugging")

	# Debugging: Display all links within the HTML, prior to any "scrubbing"
	if debug_mode:
		results = search_html_for_string(html, "link type")
		for result in results:
			print(f"\nBefore Scrub URLs, function get_pdf() has these HTML links:\n{result[1]}")

	# 1. Given a relative path (such as to a CSS file), this function will prefix the domain.
	# NOTE: This function 'scrub_urls' has been modified to accept the debug mode.
	html = scrub_urls(html, debug=debug_mode)

	if debug_mode:
		results = search_html_for_string(html, "link type")
		for result in results:
			print(f"\nAfter Scrub URLs, function get_pdf() has these HTML links\n:{result[1]}")

	# 2. Prepare options.  This strips some of the leading HTML.
	html, options = prepare_options(html, options)

	options.update({
		"disable-javascript": "",
		"disable-local-file-access": ""
	})

	filedata = ''
	if LooseVersion(get_wkhtmltopdf_version()) > LooseVersion('0.12.3'):
		options.update({"disable-smart-shrinking": ""})

	try:
		# Set filename property to false, so no file is actually created
		filedata = pdfkit.from_string(html, False, options=options or {})

		# https://pythonhosted.org/PyPDF2/PdfFileReader.html
		# create in-memory binary streams from filedata and create a PdfFileReader object
		reader = PdfFileReader(io.BytesIO(filedata))
	except OSError as e:
		if any([error in str(e) for error in PDF_CONTENT_ERRORS]):
			if not filedata:
				frappe.throw(_("PDF generation failed because of broken image links"))

			# allow pdfs with missing images if file got created
			if output:  # output is a PdfFileWriter object
				output.appendPagesFromReader(reader)
		else:
			raise
	finally:
		cleanup(options)

	if "password" in options:
		password = options["password"]
		if six.PY2:
			password = frappe.safe_encode(password)

	if output:
		output.appendPagesFromReader(reader)
		return output

	writer = PdfFileWriter()
	writer.appendPagesFromReader(reader)

	if "password" in options:
		writer.encrypt(password)

	filedata = get_file_data_from_writer(writer)

	return filedata


def get_file_data_from_writer(writer_obj):

	# https://docs.python.org/3/library/io.html
	stream = io.BytesIO()
	writer_obj.write(stream)

	# Change the stream position to start of the stream
	stream.seek(0)

	# Read up to size bytes from the object and return them
	return stream.read()


def prepare_options(html, options):
	if not options:
		options = {}

	options.update({
		'print-media-type': None,
		'background': None,
		'images': None,
		'quiet': None,
		# 'no-outline': None,
		'encoding': "UTF-8",
		# 'load-error-handling': 'ignore'
	})

	if not options.get("margin-right"):
		options['margin-right'] = '15mm'

	if not options.get("margin-left"):
		options['margin-left'] = '15mm'

	html, html_options = read_options_from_html(html)
	options.update(html_options or {})

	# cookies
	options.update(get_cookie_options())

	# page size
	pdf_page_size = (
		options.get("page-size")
		or frappe.db.get_single_value("Print Settings", "pdf_page_size")
		or "A4"
	)

	if pdf_page_size == "Custom":
		options["page-height"] = options.get("page-height") or frappe.db.get_single_value(
			"Print Settings", "pdf_page_height"
		)
		options["page-width"] = options.get("page-width") or frappe.db.get_single_value(
			"Print Settings", "pdf_page_width"
		)
	else:
		options["page-size"] = pdf_page_size

	return html, options


def get_cookie_options():
	options = {}
	if frappe.session and frappe.session.sid and hasattr(frappe.local, "request"):
		# Use wkhtmltopdf's cookie-jar feature to set cookies and restrict them to host domain
		cookiejar = "/tmp/{}.jar".format(frappe.generate_hash())

		# Remove port from request.host
		# https://werkzeug.palletsprojects.com/en/0.16.x/wrappers/#werkzeug.wrappers.BaseRequest.host
		domain = frappe.utils.get_host_name().split(":", 1)[0]
		with open(cookiejar, "w") as f:
			f.write("sid={}; Domain={};\n".format(frappe.session.sid, domain))

		options['cookie-jar'] = cookiejar

	return options

def read_options_from_html(html):
	options = {}
	soup = BeautifulSoup(html, "html5lib")

	options.update(prepare_header_footer(soup))

	toggle_visible_pdf(soup)

	# use regex instead of soup-parser
	for attr in ("margin-top", "margin-bottom", "margin-left", "margin-right", "page-size", "header-spacing", "orientation"):
		try:
			pattern = re.compile(r"(\.print-format)([\S|\s][^}]*?)(" + str(attr) + r":)(.+)(mm;)")
			match = pattern.findall(html)
			if match:
				options[attr] = str(match[-1][3]).strip()
		except:
			pass

	return str(soup), options


def prepare_header_footer(soup):
	options = {}

	head = soup.find("head").contents
	styles = soup.find_all("style")

	css = frappe.read_file(os.path.join(frappe.local.sites_path, "assets/css/printview.css"))

	# extract header and footer
	for html_id in ("header-html", "footer-html"):
		content = soup.find(id=html_id)
		if content:
			# there could be multiple instances of header-html/footer-html
			for tag in soup.find_all(id=html_id):
				tag.extract()

			toggle_visible_pdf(content)
			html = frappe.render_template("templates/print_formats/pdf_header_footer.html", {
				"head": head,
				"content": content,
				"styles": styles,
				"html_id": html_id,
				"css": css,
				"lang": frappe.local.lang,
				"layout_direction": "rtl" if is_rtl() else "ltr"
			})

			# create temp file
			fname = os.path.join("/tmp", "frappe-pdf-{0}.html".format(frappe.generate_hash()))
			with open(fname, "wb") as f:
				f.write(html.encode("utf-8"))

			# {"header-html": "/tmp/frappe-pdf-random.html"}
			options[html_id] = fname
		else:
			if html_id == "header-html":
				options["margin-top"] = "15mm"
			elif html_id == "footer-html":
				options["margin-bottom"] = "15mm"

	return options


def cleanup(options):
	for key in ("header-html", "footer-html", "cookie-jar"):
		if options.get(key) and os.path.exists(options[key]):
			os.remove(options[key])

def toggle_visible_pdf(soup):
	for tag in soup.find_all(attrs={"class": "visible-pdf"}):
		# remove visible-pdf class to unhide
		tag.attrs['class'].remove('visible-pdf')

	for tag in soup.find_all(attrs={"class": "hidden-pdf"}):
		# remove tag from html
		tag.extract()

def get_wkhtmltopdf_version():
	wkhtmltopdf_version = frappe.cache().hget("wkhtmltopdf_version", None)

	if not wkhtmltopdf_version:
		try:
			res = subprocess.check_output(["wkhtmltopdf", "--version"])
			wkhtmltopdf_version = res.decode('utf-8').split(" ")[1]
			frappe.cache().hset("wkhtmltopdf_version", None, wkhtmltopdf_version)
		except Exception:
			pass

	return (wkhtmltopdf_version or '0')

# --------
# Datahenge Additional Functions:
# --------

def clean_line(line):
	"""
	Remove newlines and tabs.
	"""
	line = re.sub(r"[\n\t]*", "", line)
	return line


def search_html_for_string(html, string_to_search):
	"""
	Search for the given string in file and return a tuple (line number, line)
	"""
	list_of_results = []  # returning a List of Tuple
	lines = html.splitlines()
	# print(f"Total Number of Lines in HTML: {len(html.splitlines())}")

	for idx, line in enumerate(lines):
		if string_to_search in line:
			# If yes, then add the line number & line as a tuple in the list
			ret = (idx, clean_line(line))
			list_of_results.append(ret)
	return list_of_results
