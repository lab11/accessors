/* vim: set noet ts=2 sts=2 sw=2: */
'use strict';

/*** Core Functions ***/

var lib        = require('lib');

var util       = require('util');
var domain     = require('domain');
var Q          = require('q');
var debug_lib  = require('debug');

var debug = debug_lib('accessors:debug');
var info  = debug_lib('accessors:info');
var warn  = debug_lib('accessors:warn');
var error = debug_lib('accessors:error');

// We use `accessor_object` to keep track of `this` for the accessor
// object so we can use the EventEmitter `emit()` function.
var accessor_object = null;

var _remove_from_array = function (item, arr) {
	var to_remove = -1;
	for (var i=0; i<arr.length; i++) {
		if (arr[i] === item) {
			to_remove = i;
			break;
		}
	}
	if (to_remove > -1) {
		arr.splice(to_remove, 1);
	}
}

// Function that wraps calling a port. This sets up all of the promises/futures
// code so that "await" works.
var _do_port_call = function (port_name, direction, value, done_fn) {
	var r;

	// in the OUTPUT case, there is no value.
	// in the other cases, there should be a value
	if (direction === 'output' && typeof value === 'function') {
		done_fn = value;
		value = null;
	}

	if (typeof done_fn === 'undefined') {
		done_fn = function () {
			warn("Port call of " + port_name + " finished successfully with no callback");
		}
	}

	info("before port call of " + port_name + "(" + value + ")");

	// With output, we need to register the given callback before calling the
	// output handling functions. temporary is set to true so that this will
	// only get called once.
	if (direction === 'output') {
		accessor_object.once(port_name, done_fn);
	}

	// Determine which functions to call.
	// These are based on the port handlers that were configured.
	var to_call = [];
	if (port_name === 'init') {
		to_call = [init];
	} else if (port_name === 'wrapup') {
		to_call = [wrapup];
	} else {
		to_call = _port_handlers[port_name][direction];
	}

	if (to_call.length === 0) {
		// No handlers for this port, just do the callback
		done_fn(null);

	} else {
		// Have work to do
		var d = domain.create();

		d.on('error', function (err) {
			d.exit();
			done_fn(err);
		});

		d.run(function() {
			// Iterate all functions in the port list and call them, checking
			// if they are generators and whatnot.
			for (var i=0; i<to_call.length; i++) {
				(function (port) {
					r = port(value);
					if (r && typeof r.next == 'function') {
						var def = Q.async(function* () {
							r = yield* port(value);
						});

						def().done(function () {
							d.exit();
							// We only call the callback when this is an input.
							// If this is an output, when the accessor calls
							// `send()` the done callback will be called.
							// We also call done for init and wrapup
							if (direction === 'input' || direction === null) {
								done_fn(null, r);
							}

						}, function (err) {
							// Throw this error so that the domain can pick it up.
							throw err;
						});
						info("port call running asynchronously");

					} else {
						d.exit();
						if (direction === 'input' || direction === null) {
							done_fn(null, r);
						}
					}
				})(to_call[i]);
			}
		});
	}
}

var _set_output_functions = function (functions) {
	if ('console_log' in functions) {
		console.log = functions.console_log;
	}
	if ('console_info' in functions) {
		console.info = functions.console_info;
	}
	if ('console_error' in functions) {
		console.error = functions.console_error;
	}
}

// These function are NOOPs and are only used by the Host Server to understand
// properties of the accessor/device, and do not have any meaning when
// running an accessor.
var createPort = function() {};
var createPortBundle = function() {};
var provideInterface = function() {};
var provide_interface = function() {};

// This allows the accessor to specify a function that should get bound
// to a particular input
var addInputHandler = function (port_name, func) {
	if (typeof port_name === 'function') {
		// Using the function in this way defines a new fire() function
		// Check for duplicates
		for (var i=0; i<_port_handlers._fire.length; i++) {
			if (_port_handlers._fire[i] === port_name) {
				error('Adding duplicate fire() function.');
				return null;
			}
		}
		// Add the new fire function before the original fire function
		_port_handlers._fire.unshift(port_name);
		return ['_fire', func];
	}

	if (func === null || func === 'undefined') {
		// Ignore this case.
		return;
	}
	if (typeof func === 'function') {
		if (port_name in _port_handlers) {
			// Check that this hasn't already been added.
			for (var i=0; i<_port_handlers[port_name].input.length; i++) {
				if (func === _port_handlers[port_name].input[i]) {
					error('Already added this handler function.');
					return null;
				}
			}

			_port_handlers[port_name].input.push(func);
			// Return the name and the function so it can be removed,
			// if desired.
			return [port_name, func];
		} else {
			error('Assigning a new input handler to port_name that does not exist.');
		}
	} else {
		error('Input handler must be a function');
	}
	return null;
}

// This allows an accessor to remove an input callback
var removeInputHandler = function (handle) {
	if (handle instanceof Array) {
		if (handle.length == 2) {
			if (handle[0] in _port_handlers) {
				_remove_from_array(handle[1], _port_handlers[handle[0]].input);
			} else {
				error('Remove handle for non-existent port.');
			}
		} else {
			error('Bad handle, wrong length.');
		}
	} else {
		error('Bad handle, not array.')
	}
}

// var addBundleHandler = function (bundle_name, func) {

// }


var addOutputHandler = function (port_name, func) {
	if (typeof func === 'function') {
		if (port_name in _port_handlers) {
			// Check that this hasn't already been added.
			for (var i=0; i<_port_handlers[port_name].output.length; i++) {
				if (func === _port_handlers[port_name].output[i]) {
					error('Already added this handler function.');
					return null;
				}
			}

			_port_handlers[port_name].output.push(func);
			// Return the name and the function so it can be removed,
			// if desired.
			return [port_name, func];
		} else {
			error('Assigning a new output handler to port_name that does not exist.');
		}
	} else {
		error('Output handler must be a function');
	}
	return null;
}

// This allows an accessor to remove an input callback
var removeOutputHandler = function (handle) {
	if (handle instanceof Array) {
		if (handle.length == 2) {
			if (handle[0] in _port_handlers) {
				_remove_from_array(handle[1], _port_handlers[handle[0]].output);
			} else {
				error('Remove handle for non-existent port.');
			}
		} else {
			error('Bad handle, wrong length.');
		}
	} else {
		error('Bad handle, not array.')
	}
}

/* `get()` allows an accessor to read the input on one of its ports that
 * comes from the user of the accessor. We do this be returning the last
 * value that was written.
 */
var get = function (port_name) {
	return _port_values[port_name];
}

/* `send()` is used by observe ports to forward data to any interested
 * listeners. The runtime maintains the callback list.
 */
var send = function (port_name, val) {
	info("SEND: " + port_name + " <= " + val);
	accessor_object.emit(port_name, null, val);
}

/* `get_parameter()` allows an accessor to retrieve specific parameters
 * from the runtime.
 */
var getParameter = function (parameter_name) {
	return parameters[parameter_name];
}

var load_dependency = function (path, parameters) {
	if (typeof(parameters)==='undefined') parameters = null;
	error('Do not support load_dependency yet.');

	throw new AccessorRuntimeException("That was optimistic");
}

/******************************************************************************/
/* Part of accessor standard library.
 */

var print = function (val) {
	console.log(val);
}
