""" frappe/utils/logger.py """

# imports - standard imports
from copy import deepcopy
import logging
import logging.handlers
# from logging.handlers import RotatingFileHandler
import os
import stat
from typing import Literal

# imports - module imports
import frappe
from frappe.utils import get_sites

logging.handlers = logging.handlers
default_log_level = logging.WARNING if frappe._dev_server else logging.ERROR  # pylint: disable=invalid-name, protected-access
stream_logging = os.environ.get("FRAPPE_STREAM_LOGGING")


class DHCustomRotatingClass(logging.handlers.RotatingFileHandler):
	"""
	Out of the box Python doesn't properly handle Group Permissions.  :eyeroll:
	"""

	def __init__(self, *args, **kwargs):
		super().__init__(*args, **kwargs)
		# Change the permissions of the first, initial file created
		
		# TODO: This doesn't work, because a non-owner cannot execute chmod on a file.   :eyeroll:
		# os.chmod(self.baseFilename, 0o664)  # rw-rw-r--
		# NOTE: To change the file's group:  os.chown(self.baseFilename, chosen_uid, chosen_gid)

	def _open(self):
		# DATAHENGE: VERY, VERY IMPORTANT FOR LINUX GROUP PERMISSIONS
		temporary_mask = 0o002  # This mask will remove write access for Others
		previous_mask = os.umask(temporary_mask)  # the response from umask() is the previous mask, so we'll store that
		#os.fdopen(os.open('/path/to/file', os.O_WRONLY, 0600))
		rtv=logging.handlers.RotatingFileHandler._open(self)  # pylint: disable=protected-access
		os.umask(previous_mask)
		return rtv

	def doRollover(self):
		"""
		Override base class method to make the new log file group writable.
		"""
		# Rotate the file first.
		super().doRollover()

		# Add group write to the current permissions.
		currMode = os.stat(self.baseFilename).st_mode  # pylint: disable-invalid-name
		os.chmod(self.baseFilename, currMode | stat.S_IWGRP)

logging.handlers.DHCustomRotatingClass = DHCustomRotatingClass


def get_logger(
	module=None,
	with_more_info=False,
	allow_site=True,
	filter=None,
	max_size=100_000,
	file_count=20,
	stream_only=stream_logging,
) -> "logging.Logger":
	"""Application Logger for your given module

	Args:
	        module (str, optional): Name of your logger and consequently your log file. Defaults to None.
	        with_more_info (bool, optional): Will log the form dict using the SiteContextFilter. Defaults to False.
	        allow_site ((str, bool), optional): Pass site name to explicitly log under it's logs. If True and unspecified, guesses which site the logs would be saved under. Defaults to True.
	        filter (function, optional): Add a filter function for your logger. Defaults to None.
	        max_size (int, optional): Max file size of each log file in bytes. Defaults to 100_000.
	        file_count (int, optional): Max count of log files to be retained via Log Rotation. Defaults to 20.
	        stream_only (bool, optional): Whether to stream logs only to stderr (True) or use log files (False). Defaults to False.

	Returns:
	        <class 'logging.Logger'>: Returns a Python logger object with Site and Bench level logging capabilities.
	"""

	if allow_site is True:
		site = getattr(frappe.local, "site", None)
	elif allow_site in get_sites():
		site = allow_site
	else:
		site = False

	logger_name = f"{module}-{site or 'all'}"

	try:
		return frappe.loggers[logger_name]
	except KeyError:
		pass

	if not module:
		module = "frappe"
		with_more_info = True

	logfile = module + ".log"
	log_filename = os.path.join("..", "logs", logfile)

	logger = logging.getLogger(logger_name)
	logger.setLevel(frappe.log_level or default_log_level)
	logger.propagate = False

	formatter = logging.Formatter(f"%(asctime)s %(levelname)s {module} %(message)s")
	if stream_only:
		handler = logging.StreamHandler()
	else:
		handler = logging.handlers.DHCustomRotatingClass(log_filename, maxBytes=max_size, backupCount=file_count)
	handler.setFormatter(formatter)
	logger.addHandler(handler)

	if site and not stream_only:
		sitelog_filename = os.path.join(site, "logs", logfile)
		site_handler = logging.handlers.DHCustomRotatingClass(sitelog_filename, maxBytes=max_size, backupCount=file_count)
		site_handler.setFormatter(formatter)
		logger.addHandler(site_handler)

	if with_more_info:
		handler.addFilter(SiteContextFilter())

	if filter:
		logger.addFilter(filter)

	frappe.loggers[logger_name] = logger

	return logger


class SiteContextFilter(logging.Filter):
	"""This is a filter which injects request information (if available) into the log."""

	def filter(self, record) -> bool:
		if "Form Dict" not in str(record.msg):
			site = getattr(frappe.local, "site", None)
			form_dict = sanitized_dict(getattr(frappe.local, "form_dict", None))
			record.msg = str(record.msg) + f"\nSite: {site}\nForm Dict: {form_dict}"
			return True


def set_log_level(level: Literal["ERROR", "WARNING", "WARN", "INFO", "DEBUG"]) -> None:
	"""Use this method to set log level to something other than the default DEBUG"""
	frappe.log_level = getattr(logging, (level or "").upper(), None) or default_log_level
	frappe.loggers = {}


def sanitized_dict(form_dict):
	if not isinstance(form_dict, dict):
		return form_dict

	_sanitized_dict = deepcopy(form_dict)

	blocklist = [
		"password",
		"passwd",
		"secret",
		"token",
		"key",
		"pwd",
	]

	for k in _sanitized_dict:
		for secret_kw in blocklist:
			if secret_kw in k:
				_sanitized_dict[k] = "********"
	return _sanitized_dict
