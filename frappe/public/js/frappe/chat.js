// Frappe Chat
// Author - Achilles Rasquinha <achilles@frappe.io>

// Datahenge: I'm removing most of the "Chat" code,
// while retaining the useful library components that are unfortunately embedded in here.

import Fuse   from 'fuse.js'
import hyper  from '../lib/hyper.min'
import './socketio_client'
import './ui/dialog'
import './ui/capture'
import './utils/user'

/* eslint semi: "never" */
// https://mislav.net/2010/05/semicolons

// frappe extensions

/**
 * @description The base class for all Frappe Errors.
 *
 * @example
 * try
 *      throw new frappe.Error("foobar")
 * catch (e)
 *      console.log(e.name)
 * // returns "FrappeError"
 *
 * @see  https://stackoverflow.com/a/32749533
 * @todo Requires "transform-builtin-extend" for Babel 6
 */
frappe.Error = Error

/**
 * @description TypeError
 */
frappe.TypeError  = TypeError

/**
 * @description ValueError
 */
frappe.ValueError = Error

/**
 * @description ImportError
 */
frappe.ImportError = Error

// frappe.datetime
frappe.provide('frappe.datetime')

/**
 * @description Frappe's datetime object. (Inspired by Python's datetime object).
 *
 * @example
 * const datetime = new frappe.datetime.datetime()
 */
frappe.datetime.datetime = class {
	/**
	 * @description Frappe's datetime Class's constructor.
	 */
	constructor (instance, format = null) {
		if ( typeof moment === 'undefined' )
			throw new frappe.ImportError(`Moment.js not installed.`)

		this.moment = instance ? moment(instance, format) : moment()
	}

	/**
	 * @description Returns a formatted string of the datetime object.
	 */
	format (format = null) {
		const  formatted = this.moment.format(format)
		return formatted
	}
}

/**
 * @description Frappe's daterange object.
 *
 * @example
 * const range = new frappe.datetime.range(frappe.datetime.now(), frappe.datetime.now())
 * range.contains(frappe.datetime.now())
 */
frappe.datetime.range   = class {
	constructor (start, end) {
		if ( typeof moment === undefined )
			throw new frappe.ImportError(`Moment.js not installed.`)

		this.start = start
		this.end   = end
	}

	contains (datetime) {
		const  contains = datetime.moment.isBetween(this.start.moment, this.end.moment)
		return contains
	}
}

/**
 * @description Returns the current datetime.
 *
 * @example
 * const datetime = new frappe.datetime.now()
 */
frappe.datetime.now   = () => new frappe.datetime.datetime()

frappe.datetime.equal = (a, b, type) => {
	a = a.moment
	b = b.moment

	const equal = a.isSame(b, type)

	return equal
}

/**
 * @description Compares two frappe.datetime.datetime objects.
 *
 * @param   {frappe.datetime.datetime} a - A frappe.datetime.datetime/moment object.
 * @param   {frappe.datetime.datetime} b - A frappe.datetime.datetime/moment object.
 *
 * @returns {number} 0 (if a and b are equal), 1 (if a is before b), -1 (if a is after b).
 *
 * @example
 * frappe.datetime.compare(frappe.datetime.now(), frappe.datetime.now())
 * // returns 0
 * const then = frappe.datetime.now()
 *
 * frappe.datetime.compare(then, frappe.datetime.now())
 * // returns 1
 */
frappe.datetime.compare = (a, b) => {
	a = a.moment
	b = b.moment

	if ( a.isBefore(b) )
		return  1
	else
	if ( b.isBefore(a) )
		return -1
	else
		return  0
}

// frappe.quick_edit
frappe.quick_edit      = (doctype, docname, fn) => {
	return new Promise(resolve => {
		frappe.model.with_doctype(doctype, () => {
			frappe.db.get_doc(doctype, docname).then(doc  => {
				const meta     = frappe.get_meta(doctype)
				const fields   = meta.fields
				const required = fields.filter(f => f.reqd || f.bold && !f.read_only)

				required.map(f => {
					if(f.fieldname == 'content' && doc.type == 'File') {
						f['read_only'] = 1;
					}
				})

				const dialog   = new frappe.ui.Dialog({
					 title: __(`Edit ${doctype} (${docname})`),
					fields: required,
					action: {
						primary: {
							   label: __("Save"),
							onsubmit: (values) => {
								frappe.call('frappe.client.save',
									{ doc: { doctype: doctype, docname: docname, ...doc, ...values } })
									  .then(r => {
										if ( fn )
											fn(r.message)

										resolve(r.message)
									  })

								dialog.hide()
							}
						},
						secondary: {
							label: __("Discard")
						}
					}
				})
				dialog.set_values(doc)

				const $element = $(dialog.body)
				$element.append(`
					<div class="qe-fp" style="padding-top: '15px'; padding-bottom: '15px'; padding-left: '7px'">
						<button class="btn btn-default btn-sm">
							${__("Edit in Full Page")}
						</button>
					</div>
				`)
				$element.find('.qe-fp').click(() => {
					dialog.hide()
					frappe.set_route(`Form/${doctype}/${docname}`)
				})

				dialog.show()
			})
		})
	})
}

// frappe._
// frappe's utility namespace.
frappe.provide('frappe._')

// String Utilities

/**
 * @description Python-inspired format extension for string objects.
 *
 * @param  {string} string - A string with placeholders.
 * @param  {object} object - An object with placeholder, value pairs.
 *
 * @return {string}        - The formatted string.
 *
 * @example
 * frappe._.format('{foo} {bar}', { bar: 'foo', foo: 'bar' })
 * // returns "bar foo"
 */
frappe._.format = (string, object) => {
	for (const key in object)
		string  = string.replace(`{${key}}`, object[key])

	return string
}

/**
 * @description Fuzzy Search a given query within a dataset.
 *
 * @param  {string} query   - A query string.
 * @param  {array}  dataset - A dataset to search within, can contain singletons or objects.
 * @param  {object} options - Options as per fuze.js
 *
 * @return {array}          - The fuzzy matched index/object within the dataset.
 *
 * @example
 * frappe._.fuzzy_search("foobar", ["foobar", "bartender"])
 * // returns [0, 1]
 *
 * @see http://fusejs.io
 */
frappe._.fuzzy_search = (query, dataset, options) => {
	const DEFAULT     = {
				shouldSort: true,
				 threshold: 0.6,
				  location: 0,
				  distance: 100,
		minMatchCharLength: 1,
		  maxPatternLength: 32
	}
	options       = { ...DEFAULT, ...options }

	const fuse    = new Fuse(dataset, options)
	const result  = fuse.search(query)

	return result
}

/**
 * @description Pluralizes a given word.
 *
 * @param  {string} word  - The word to be pluralized.
 * @param  {number} count - The count.
 *
 * @return {string}       - The pluralized string.
 *
 * @example
 * frappe._.pluralize('member',  1)
 * // returns "member"
 * frappe._.pluralize('members', 0)
 * // returns "members"
 *
 * @todo Handle more edge cases.
 */
frappe._.pluralize = (word, count = 0, suffix = 's') => `${word}${count === 1 ? '' : suffix}`

/**
 * @description Captializes a given string.
 *
 * @param   {word}  - The word to be capitalized.
 *
 * @return {string} - The capitalized word.
 *
 * @example
 * frappe._.capitalize('foobar')
 * // returns "Foobar"
 */
frappe._.capitalize = word => `${word.charAt(0).toUpperCase()}${word.slice(1)}`

// Array Utilities

/**
 * @description Returns the first element of an array.
 *
 * @param   {array} array - The array.
 *
 * @returns - The first element of an array, undefined elsewise.
 *
 * @example
 * frappe._.head([1, 2, 3])
 * // returns 1
 * frappe._.head([])
 * // returns undefined
 */
frappe._.head = arr => frappe._.is_empty(arr) ? undefined : arr[0]

/**
 * @description Returns a copy of the given array (shallow).
 *
 * @param   {array} array - The array to be copied.
 *
 * @returns {array}       - The copied array.
 *
 * @example
 * frappe._.copy_array(["foobar", "barfoo"])
 * // returns ["foobar", "barfoo"]
 *
 * @todo Add optional deep copy.
 */
frappe._.copy_array = array => {
	if ( Array.isArray(array) )
		return array.slice()
	else
		throw frappe.TypeError(`Expected Array, recieved ${typeof array} instead.`)
}

/**
 * @description Check whether an array|string|object|jQuery is empty.
 *
 * @param   {any}     value - The value to be checked on.
 *
 * @returns {boolean}       - Returns if the object is empty.
 *
 * @example
 * frappe._.is_empty([])      // returns true
 * frappe._.is_empty(["foo"]) // returns false
 *
 * frappe._.is_empty("")      // returns true
 * frappe._.is_empty("foo")   // returns false
 *
 * frappe._.is_empty({ })            // returns true
 * frappe._.is_empty({ foo: "bar" }) // returns false
 *
 * frappe._.is_empty($('.papito'))   // returns false
 *
 * @todo Handle other cases.
 */
frappe._.is_empty = value => {
	let empty = false

	if ( value === undefined || value === null )
		empty = true
	else
	if ( Array.isArray(value) || typeof value === 'string' || value instanceof $ )
		empty = value.length === 0
	else
	if ( typeof value === 'object' )
		empty = Object.keys(value).length === 0

	return empty
}

/**
 * @description Converts a singleton to an array, if required.
 *
 * @param {object} item - An object
 *
 * @example
 * frappe._.as_array("foo")
 * // returns ["foo"]
 *
 * frappe._.as_array(["foo"])
 * // returns ["foo"]
 *
 * @see https://docs.oracle.com/javase/8/docs/api/java/util/Arrays.html#asList-T...-
 */
frappe._.as_array = item => Array.isArray(item) ? item : [item]

/**
 * @description Return a singleton if array contains a single element.
 *
 * @param   {array}        list - An array to squash.
 *
 * @returns {array|object}      - Returns an array if there's more than 1 object else the first object itself.
 *
 * @example
 * frappe._.squash(["foo"])
 * // returns "foo"
 *
 * frappe._.squash(["foo", "bar"])
 * // returns ["foo", "bar"]
 */
frappe._.squash = list => Array.isArray(list) && list.length === 1 ? list[0] : list

/**
 * @description Returns true, if the current device is a mobile device.
 *
 * @example
 * frappe._.is_mobile()
 * // returns true|false
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Browser_detection_using_the_user_agent
 */
frappe._.is_mobile = () => {
	const regex    = new RegExp("Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini", "i")
	const agent    = navigator.userAgent
	const mobile   = regex.test(agent)

	return mobile
}

/**
 * @description Removes falsey values from an array.
 *
 * @example
 * frappe._.compact([1, 2, false, NaN, ''])
 * // returns [1, 2]
 */
frappe._.compact   = array => array.filter(Boolean)

// extend utils to base.
frappe.utils       = { ...frappe.utils, ...frappe._ }

// frappe extensions

// frappe.user extensions
/**
 * @description Returns the first name of a User.
 *
 * @param {string} user - User
 *
 * @returns The first name of the user.
 *
 * @example
 * frappe.user.first_name("Rahul Malhotra")
 * // returns "Rahul"
 */
frappe.provide('frappe.user')
frappe.user.first_name = user => frappe._.head(frappe.user.full_name(user).split(" "))

frappe.provide('frappe.ui.keycode')
frappe.ui.keycode = { RETURN: 13 }

/**
 * @description Frappe's Store Class
 */
 // frappe.stores  - A registry for frappe stores.
frappe.provide('frappe.stores')
frappe.stores = [ ]
frappe.Store  = class
{
	/**
	 * @description Frappe's Store Class's constructor.
	 *
	 * @param {string} name - Name of the logger.
	 */
	constructor (name) {
		if ( typeof name !== 'string' )
			throw new frappe.TypeError(`Expected string for name, got ${typeof name} instead.`)
		this.name = name
	}

	/**
	 * @description Get instance of frappe.Store (return registered one if declared).
	 *
	 * @param {string} name - Name of the store.
	 */
	static get (name) {
		if ( !(name in frappe.stores) )
			frappe.stores[name] = new frappe.Store(name)
		return frappe.stores[name]
	}

	set (key, value) { localStorage.setItem(`${this.name}:${key}`, value) }
	get (key, value) { return localStorage.getItem(`${this.name}:${key}`) }
}

// frappe.loggers - A registry for frappe loggers.
frappe.provide('frappe.loggers')
/**
 * @description Frappe's Logger Class
 *
 * @example
 * frappe.log       = frappe.Logger.get('foobar')
 * frappe.log.level = frappe.Logger.DEBUG
 *
 * frappe.log.info('foobar')
 * // prints '[timestamp] foobar: foobar'
 */
frappe.Logger = class {
	/**
	 * @description Frappe's Logger Class's constructor.
	 *
	 * @param {string} name - Name of the logger.
	 */
	constructor (name, level) {
		if ( typeof name !== 'string' )
			throw new frappe.TypeError(`Expected string for name, got ${typeof name} instead.`)

		this.name   = name
		this.level  = level

		if ( !this.level ) {
			if ( frappe.boot.developer_mode )
				this.level = frappe.Logger.ERROR
			else
				this.level = frappe.Logger.NOTSET
		}
		this.format = frappe.Logger.FORMAT
	}

	/**
	 * @description Get instance of frappe.Logger (return registered one if declared).
	 *
	 * @param {string} name - Name of the logger.
	 */
	static get (name, level) {
		if ( !(name in frappe.loggers) )
			frappe.loggers[name] = new frappe.Logger(name, level)
		return frappe.loggers[name]
	}

	debug (message) { this.log(message, frappe.Logger.DEBUG) }
	info  (message) { this.log(message, frappe.Logger.INFO)  }
	warn  (message) { this.log(message, frappe.Logger.WARN)  }
	error (message) { this.log(message, frappe.Logger.ERROR) }

	log (message, level) {
		const timestamp   = frappe.datetime.now()

		if ( level.value <= this.level.value ) {
			const format  = frappe._.format(this.format, {
				time: timestamp.format('HH:mm:ss'),
				name: this.name
			})
			console.log(`%c ${format}:`, `color: ${level.color}`, message)
		}
	}
}

frappe.Logger.DEBUG  = { value: 10, color: '#616161', name: 'DEBUG'  }
frappe.Logger.INFO   = { value: 20, color: '#2196F3', name: 'INFO'   }
frappe.Logger.WARN   = { value: 30, color: '#FFC107', name: 'WARN'   }
frappe.Logger.ERROR  = { value: 40, color: '#F44336', name: 'ERROR'  }
frappe.Logger.NOTSET = { value:  0,                   name: 'NOTSET' }

frappe.Logger.FORMAT = '{time} {name}'

// frappe.chat
frappe.provide('frappe.chat')

frappe.log = frappe.Logger.get('frappe.chat', frappe.Logger.NOTSET)

// frappe.chat.profile
frappe.provide('frappe.chat.profile')

/**
 * @description Create a Chat Profile.
 *
 * @param   {string|array} fields - (Optional) fields to be retrieved after creating a Chat Profile.
 * @param   {function}     fn     - (Optional) callback with the returned Chat Profile.
 *
 * @returns {Promise}
 *
 * @example
 * frappe.chat.profile.create(console.log)
 *
 * frappe.chat.profile.create("status").then(console.log) // { status: "Online" }
 */
frappe.chat.profile.create = (fields, fn) => {
	if ( typeof fields === "function" ) {
		fn     = fields
		fields = null
	} else
	if ( typeof fields === "string" )
		fields = frappe._.as_array(fields)

	return /* Datahenge: Chat is deprecated in v13.  Also, this was throwing errors because it's not checking for duplicates. */

	return new Promise(resolve => {
		frappe.call("frappe.chat.doctype.chat_profile.chat_profile.create",
			{ user: frappe.session.user, exists_ok: true, fields: fields },
				response => {
					if ( fn )
						fn(response.message)

					resolve(response.message)
				})
	})
}

/**
 * @description Updates a Chat Profile.
 *
 * @param   {string} user   - (Optional) Chat Profile User, defaults to session user.
 * @param   {object} update - (Required) Updates to be dispatched.
 *
 * @example
 * frappe.chat.profile.update(frappe.session.user, { "status": "Offline" })
 */
frappe.chat.profile.update = (user, update, fn) => {
	return new Promise(resolve => {
		frappe.call("frappe.chat.doctype.chat_profile.chat_profile.update",
			{ user: user || frappe.session.user, data: update },
				response => {
					if ( fn )
						fn(response.message)

					resolve(response.message)
				})
	})
}

// frappe.chat.profile.on
frappe.provide('frappe.chat.profile.on')

/**
 * @description Triggers on a Chat Profile update of a user (Only if there's a one-on-one conversation).
 *
 * @param   {function} fn - (Optional) callback with the User and the Chat Profile update.
 *
 * @returns {Promise}
 *
 * @example
 * frappe.chat.profile.on.update(function (user, update)
 * {
 *      // do stuff
 * })
 */
frappe.chat.profile.on.update = function (fn) {
	frappe.realtime.on("frappe.chat.profile:update", r => fn(r.user, r.data))
}
frappe.chat.profile.STATUSES
=
[
	{
		name: "Online",
	   color: "green"
	},
	{
		 name: "Away",
		color: "yellow"
	},
	{
		 name: "Busy",
		color: "red"
	},
	{
		 name: "Offline",
		color: "darkgrey"
	}
]

// frappe.chat.room
frappe.provide('frappe.chat.room')

/**
 * @description Creates a Chat Room.
 *
 * @param   {string}       kind  - (Required) "Direct", "Group" or "Visitor".
 * @param   {string}       owner - (Optional) Chat Room owner (defaults to current user).
 * @param   {string|array} users - (Required for "Direct" and "Visitor", Optional for "Group") User(s) within Chat Room.
 * @param   {string}       name  - Chat Room name.
 * @param   {function}     fn    - callback with created Chat Room.
 *
 * @returns {Promise}
 *
 * @example
 * frappe.chat.room.create("Direct", frappe.session.user, "foo@bar.com", function (room) {
 *      // do stuff
 * })
 * frappe.chat.room.create("Group",  frappe.session.user, ["santa@gmail.com", "banta@gmail.com"], "Santa and Banta", function (room) {
 *      // do stuff
 * })
 */
frappe.chat.room.create = function (kind, owner, users, name, fn) {
	if ( typeof name === "function" ) {
		fn   = name
		name = null
	}

	users    = frappe._.as_array(users)

	return new Promise(resolve => {
		frappe.call("frappe.chat.doctype.chat_room.chat_room.create",
			{ kind: kind, owner: owner || frappe.session.user, users: users, name: name },
			r => {
				let room = r.message
				room     = { ...room, creation: new frappe.datetime.datetime(room.creation) }

				if ( fn )
					fn(room)

				resolve(room)
			})
	})
}

/**
 * @description Returns Chat Room(s).
 *
 * @param   {string|array} names   - (Optional) Chat Room(s) to retrieve.
 * @param   {string|array} fields  - (Optional) fields to be retrieved for each Chat Room.
 * @param   {function}     fn      - (Optional) callback with the returned Chat Room(s).
 *
 * @returns {Promise}
 *
 * @example
 * frappe.chat.room.get(function (rooms) {
 *      // do stuff
 * })
 * frappe.chat.room.get().then(function (rooms) {
 *      // do stuff
 * })
 *
 * frappe.chat.room.get(null, ["room_name", "avatar"], function (rooms) {
 *      // do stuff
 * })
 *
 * frappe.chat.room.get("CR00001", "room_name", function (room) {
 *      // do stuff
 * })
 *
 * frappe.chat.room.get(["CR00001", "CR00002"], ["room_name", "last_message"], function (rooms) {
 *
 * })
 */
frappe.chat.room.get = function (names, fields, fn) {
	if ( typeof names === "function" ) {
		fn     = names
		names  = null
		fields = null
	}
	else
	if ( typeof names === "string" ) {
		names  = frappe._.as_array(names)

		if ( typeof fields === "function" ) {
			fn     = fields
			fields = null
		}
		else
		if ( typeof fields === "string" )
			fields = frappe._.as_array(fields)
	}

	return new Promise(resolve => {
		frappe.call("frappe.chat.doctype.chat_room.chat_room.get",
			{ user: frappe.session.user, rooms: names, fields: fields },
				response => {
					let rooms = response.message
					if ( rooms ) { // frappe.api BOGZ! (emtpy arrays are falsified, not good design).
						rooms = frappe._.as_array(rooms)
						rooms = rooms.map(room => {
							return { ...room, creation: new frappe.datetime.datetime(room.creation),
								last_message: room.last_message ? {
									...room.last_message,
									creation: new frappe.datetime.datetime(room.last_message.creation)
								} : null
							}
						})
						rooms = frappe._.squash(rooms)
					}
					else
						rooms = [ ]

					if ( fn )
						fn(rooms)

					resolve(rooms)
				})
	})
}

/**
 * @description Subscribe current user to said Chat Room(s).
 *
 * @param {string|array} rooms - Chat Room(s).
 *
 * @example
 * frappe.chat.room.subscribe("CR00001")
 */
frappe.chat.room.subscribe = function (rooms) {
	frappe.realtime.publish("frappe.chat.room:subscribe", rooms)
}

/**
 * @description Get Chat Room history.
 *
 * @param   {string} name - Chat Room name
 *
 * @returns {Promise}     - Chat Message(s)
 *
 * @example
 * frappe.chat.room.history(function (messages)
 * {
 *      // do stuff.
 * })
 */
frappe.chat.room.history = function (name, fn) {
	return new Promise(resolve => {
		frappe.call("frappe.chat.doctype.chat_room.chat_room.history",
			{ room: name, user: frappe.session.user },
				r => {
					let messages = r.message ? frappe._.as_array(r.message) : [ ] // frappe.api BOGZ! (emtpy arrays are falsified, not good design).
					messages     = messages.map(m => {
						return { ...m,
							creation: new frappe.datetime.datetime(m.creation)
						}
					})

					if ( fn )
						fn(messages)

					resolve(messages)
				})
	})
}

/**
 * @description Searches Rooms based on a query.
 *
 * @param   {string} query - The query string.
 * @param   {array}  rooms - A list of Chat Rooms.
 *
 * @returns {array}        - A fuzzy searched list of rooms.
 */
frappe.chat.room.search = function (query, rooms) {
	const dataset = rooms.map(r => {
		if ( r.room_name )
			return r.room_name
		else
			if ( r.owner === frappe.session.user )
				return frappe.user.full_name(frappe._.squash(r.users))
			else
				return frappe.user.full_name(r.owner)
	})
	const results = frappe._.fuzzy_search(query, dataset)
	rooms         = results.map(i => rooms[i])

	return rooms
}

/**
 * @description Sort Chat Room(s) based on Last Message Timestamp or Creation Date.
 *
 * @param {array}   - A list of Chat Room(s)
 * @param {compare} - (Optional) a comparision function.
 */
frappe.chat.room.sort = function (rooms, compare = null) {
	compare = compare || function (a, b) {
		if ( a.last_message && b.last_message )
			return frappe.datetime.compare(a.last_message.creation, b.last_message.creation)
		else
		if ( a.last_message )
			return frappe.datetime.compare(a.last_message.creation, b.creation)
		else
		if ( b.last_message )
			return frappe.datetime.compare(a.creation, b.last_message.creation)
		else
			return frappe.datetime.compare(a.creation, b.creation)
	}
	rooms.sort(compare)

	return rooms
}

// frappe.chat.room.on
frappe.provide('frappe.chat.room.on')

/**
 * @description Triggers on Chat Room updated.
 *
 * @param {function} fn - callback with the Chat Room and Update.
 */
frappe.chat.room.on.update = function (fn) {
	frappe.realtime.on("frappe.chat.room:update", r => {
		if ( r.data.last_message )
			// creation to frappe.datetime.datetime (easier to manipulate).
			r.data = { ...r.data, last_message: { ...r.data.last_message, creation: new frappe.datetime.datetime(r.data.last_message.creation) } }

		fn(r.room, r.data)
	})
}

/**
 * @description Triggers on Chat Room created.
 *
 * @param {function} fn - callback with the created Chat Room.
 */
frappe.chat.room.on.create = function (fn) {
	frappe.realtime.on("frappe.chat.room:create", r =>
		fn({ ...r, creation: new frappe.datetime.datetime(r.creation) })
	)
}

/**
 * @description Triggers when a User is typing in a Chat Room.
 *
 * @param {function} fn - callback with the typing User within the Chat Room.
 */
frappe.chat.room.on.typing = function (fn) {
	frappe.realtime.on("frappe.chat.room:typing", r => fn(r.room, r.user))
}

// frappe.chat.message
frappe.provide('frappe.chat.message')

frappe.chat.message.typing = function (room, user) {
	frappe.realtime.publish("frappe.chat.message:typing", { user: user || frappe.session.user, room: room })
}

frappe.chat.message.send   = function (room, message, type = "Content") {
	frappe.call("frappe.chat.doctype.chat_message.chat_message.send",
		{ user: frappe.session.user, room: room, content: message, type: type })
}

frappe.chat.message.update = function (message, update, fn) {
	return new Promise(resolve => {
		frappe.call('frappe.chat.doctype.chat_message.chat_message.update',
			{ user: frappe.session.user, message: message, update: update },
			r =>  {
				if ( fn )
					fn(response.message)

				resolve(response.message)
			})
	})
}

frappe.chat.message.sort   = (messages) => {
	if ( !frappe._.is_empty(messages) )
		messages.sort((a, b) => frappe.datetime.compare(b.creation, a.creation))

	return messages
}

/**
 * @description Add user to seen (defaults to session.user)
 */
frappe.chat.message.seen   = (mess, user) => {
	frappe.call('frappe.chat.doctype.chat_message.chat_message.seen',
		{ message: mess, user: user || frappe.session.user })
}

frappe.provide('frappe.chat.message.on')
frappe.chat.message.on.create = function (fn) {
	frappe.realtime.on("frappe.chat.message:create", r =>
		fn({ ...r, creation: new frappe.datetime.datetime(r.creation) })
	)
}

frappe.chat.message.on.update = function (fn) {
	frappe.realtime.on("frappe.chat.message:update", r => fn(r.message, r.data))
}

frappe.chat.pretty_datetime   = function (date) {
	const today    = moment()
	const instance = date.moment

	if ( today.isSame(instance, "d") )
		return instance.format("hh:mm A")
	else
	if ( today.isSame(instance, "week") )
		return instance.format("dddd")
	else
		return instance.format("DD/MM/YYYY")
}

// frappe.chat.sound
frappe.provide('frappe.chat.sound')

/**
 * @description Plays a given registered sound.
 *
 * @param {value} - The name of the registered sound.
 *
 * @example
 * frappe.chat.sound.play("message")
 */
frappe.chat.sound.play  = function (name, volume = 0.1) {
	// frappe._.play_sound(`chat-${name}`)
	const $audio = $(`<audio class="chat-audio"/>`)
	$audio.attr('volume', volume)

	if  ( frappe._.is_empty($audio) )
		$(document).append($audio)

	if  ( !$audio.paused ) {
		frappe.log.info('Stopping sound playing.')
		$audio[0].pause()
		$audio.attr('currentTime', 0)
	}

	frappe.log.info('Playing sound.')
	$audio.attr('src', `${frappe.chat.sound.PATH}/chat-${name}.mp3`)
	$audio[0].play()
}
frappe.chat.sound.PATH  = '/assets/frappe/sounds'

// frappe.chat.emoji
frappe.chat.emojis = [ ]
frappe.chat.emoji  = function (fn) {
	return new Promise(resolve => {
		if ( !frappe._.is_empty(frappe.chat.emojis) ) {
			if ( fn )
				fn(frappe.chat.emojis)

			resolve(frappe.chat.emojis)
		}
		else
			$.get('https://cdn.rawgit.com/frappe/emoji/master/emoji', (data) => {
				frappe.chat.emojis = JSON.parse(data)

				if ( fn )
					fn(frappe.chat.emojis)

				resolve(frappe.chat.emojis)
			})
	})
}

// Website Settings
frappe.provide('frappe.chat.website.settings')
frappe.chat.website.settings = (fields, fn) =>
{
	if ( typeof fields === "function" ) {
		fn     = fields
		fields = null
	} else
	if ( typeof fields === "string" )
		fields = frappe._.as_array(fields)

	return new Promise(resolve => {
		frappe.call("frappe.chat.website.settings",
			{ fields: fields })
			.then(response => {
				var message = response.message

				if ( message.enable_from )
					message   = { ...message, enable_from: new frappe.datetime.datetime(message.enable_from, 'HH:mm:ss') }
				if ( message.enable_to )
					message   = { ...message, enable_to:   new frappe.datetime.datetime(message.enable_to,   'HH:mm:ss') }

				if ( fn )
					fn(message)

				resolve(message)
			})
	})
}

frappe.chat.website.token    = (fn) =>
{
	return new Promise(resolve => {
		frappe.call("frappe.chat.website.token")
			.then(response => {
				if ( fn )
					fn(response.message)

				resolve(response.message)
			})
	})
}

const { h, Component } = hyper

// frappe.components
// frappe's component namespace.
frappe.provide('frappe.components')

frappe.provide('frappe.chat.component')

/**
 * @description Button Component
 *
 * @prop {string}  type  - (Optional) "default", "primary", "info", "success", "warning", "danger" (defaults to "default")
 * @prop {boolean} block - (Optional) Render a button block (defaults to false).
 */
frappe.components.Button
=
class extends Component {
	render ( ) {
		const { props } = this
		const size      = frappe.components.Button.SIZE[props.size]

		return (
			h("button", { ...props, class: `btn ${size && size.class} btn-${props.type} ${props.block ? "btn-block" : ""} ${props.class ? props.class : ""}` },
				props.children
			)
		)
	}
}
frappe.components.Button.SIZE
=
{
	small: {
		class: "btn-sm"
	},
	large: {
		class: "btn-lg"
	}
}
frappe.components.Button.defaultProps
=
{
	 type: "default",
	block: false
}

/**
 * @description FAB Component
 *
 * @extends frappe.components.Button
 */
frappe.components.FAB
=
class extends frappe.components.Button {
	render ( ) {
		const { props } = this
		const size      = frappe.components.FAB.SIZE[props.size]

		return (
			h(frappe.components.Button, { ...props, class: `${props.class} ${size && size.class}`},
				h("i", { class: props.icon })
			)
		)
	}
}
frappe.components.FAB.defaultProps
=
{
	icon: "octicon octicon-plus"
}
frappe.components.FAB.SIZE
=
{
	small:
	{
		class: "frappe-fab-sm"
	},
	large:
	{
		class: "frappe-fab-lg"
	}
}

/**
 * @description Octicon Component
 *
 * @prop color - (Required) color for the indicator
 */
frappe.components.Indicator
=
class extends Component {
	render ( ) {
		const { props } = this

		return props.color ? h("span", { ...props, class: `indicator ${props.color}` }) : null
	}
}

/**
 * @description FontAwesome Component
 */
frappe.components.FontAwesome
=
class extends Component {
	render ( ) {
		const { props } = this

		return props.type ? h("i", { ...props, class: `fa ${props.fixed ? "fa-fw" : ""} fa-${props.type} ${props.class}` }) : null
	}
}
frappe.components.FontAwesome.defaultProps
=
{
	fixed: false
}

/**
 * @description Octicon Component
 *
 * @extends frappe.Component
 */
frappe.components.Octicon
=
class extends Component {
	render ( ) {
		const { props } = this

		return props.type ? h("i", { ...props, class: `octicon octicon-${props.type}` }) : null
	}
}

/**
 * @description Avatar Component
 *
 * @prop {string} title - (Optional) title for the avatar.
 * @prop {string} abbr  - (Optional) abbreviation for the avatar, defaults to the first letter of the title.
 * @prop {string} size  - (Optional) size of the avatar to be displayed.
 * @prop {image}  image - (Optional) image for the avatar, defaults to the first letter of the title.
 */
frappe.components.Avatar
=
class extends Component {
	render ( ) {
		const { props } = this
		const abbr      = props.abbr || props.title.substr(0, 1)
		const size      = frappe.components.Avatar.SIZE[props.size] || frappe.components.Avatar.SIZE.medium

		return (
			h("span", { class: `avatar ${size.class} ${props.class ? props.class : ""}` },
				props.image ?
					h("img", { class: "media-object", src: props.image })
					:
					h("div", { class: "standard-image" }, abbr)
			)
		)
	}
}
frappe.components.Avatar.SIZE
=
{
	small:
	{
		class: "avatar-small"
	},
	large:
	{
		class: "avatar-large"
	},
	medium:
	{
		class: "avatar-medium"
	}
}

/**
 * @description EmojiPicker Component
 *
 * @todo Under Development
 */
frappe.chat.component.EmojiPicker
=
class extends Component  {
	render ( ) {
		const { props } = this

		return (
			h("div", { class: `frappe-chat-emoji dropup ${props.class}` },
				h(frappe.components.Button, { type: "primary", class: "dropdown-toggle", "data-toggle": "dropdown" },
					h(frappe.components.FontAwesome, { type: "smile-o", fixed: true })
				),
				h("div", { class: "dropdown-menu dropdown-menu-right", onclick: e => e.stopPropagation() },
					h("div", { class: "panel panel-default" },
						h(frappe.chat.component.EmojiPicker.List)
					)
				)
			)
		)
	}
}
frappe.chat.component.EmojiPicker.List
=
class extends Component {
	render ( ) {
		const { props } = this

		return (
			h("div", { class: "list-group" },

			)
		)
	}
}

/**
 * @description Python equivalent to sys.platform
 */
frappe.provide('frappe._')
frappe._.platform   = () => {
	const string    = navigator.appVersion

	if ( string.includes("Win") ) 	return "Windows"
	if ( string.includes("Mac") ) 	return "Darwin"
	if ( string.includes("X11") ) 	return "UNIX"
	if ( string.includes("Linux") ) return "Linux"

	return undefined
}

/**
 * @description Frappe's Asset Helper
 */
frappe.provide('frappe.assets')
frappe.assets.image = (image, app = 'frappe') => {
	const  path     = `/assets/${app}/images/${image}`
	return path
}

/**
 * @description Notify using Web Push Notifications
 */
frappe.provide('frappe.boot')
frappe.provide('frappe.browser')
frappe.browser.Notification = 'Notification' in window

frappe.notify     = (string, options) => {
	frappe.log    = frappe.Logger.get('frappe.notify')

	const OPTIONS = {
		icon: frappe.assets.image('favicon.png', 'frappe'),
		lang: frappe.boot.lang || "en"
	}
	options       = Object.assign({ }, OPTIONS, options)

	if ( !frappe.browser.Notification )
		frappe.log.error('ERROR: This browser does not support desktop notifications.')

	Notification.requestPermission(status => {
		if ( status === "granted" ) {
			const notification = new Notification(string, options)
		}
	})
}
