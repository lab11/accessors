#!/usr/bin/env node

/* vim: set noet ts=2 sts=2 sw=2: */

// w for "web server"
try {
	var os         = require('os');
	var accessors  = require('accessors.io');
	var request    = require('request');
	var dbg        = require('debug');
	var express    = require('express');
	var w          = express();
	var express_ws = require('express-ws')(w);
	var bodyParser = require('body-parser');
	var s          = require('underscore.string');
	var nunjucks   = require('nunjucks');
	var markdown   = require('nunjucks-markdown');
	var marked     = require('marked');
	var uuid       = require('node-uuid');
	var sqlite     = require('sqlite3');

	var argv = require('yargs')
		.usage('Run an accessor with a command line interface.\nUsage: $0')
		.alias   ('s', 'host_server')
		.alias   ('s', 'host-server')
		.describe('s', 'URL of the accessor host server to use.')
		.default ('s', 'http://accessors.io')
		.alias   ('d', 'db_location')
		.describe('d', 'Filename to use as the device database.')
		.default ('d', os.tmpdir() + '/accessors-rpc.db')
		.alias   ('p', 'port')
		.describe('p', 'Port to run server on.')
		.default ('p', 5000)
		.options({
			'debug': {
				describe: 'Turn on debug output.',
				type: 'boolean'
			}
		})
		.help('help')
		.argv;
} catch (e) {
	console.log("** Missing import in the node-rpc library");
	console.log("** This is an error with the node-rpc module.");
	throw e;
}

if (argv.debug) {
	dbg.enable('accessors-rpc.*');
}
var info = dbg('accessors-rcp:info');
var error = dbg('accessors-rcp:error');
var debug = dbg('accessors-rcp:debug');


if (argv.host_server.slice(0, 7) != 'http://') {
	argv.host_server = 'http://' + argv.host_server;
}
info('Using Accessor Host Server: ' + argv.host_server);
info('Using port ' + argv.port + ' for RPC commands');
info('Using ' + argv.db_location + ' to store devices.');

// Configure the library
accessors.set_host_server(argv.host_server);

// Keep track of all created accessors
var active_accessors = [];

// Setup express
w.use(bodyParser.text());
w.use(bodyParser.json());

// Serve our static content
w.use('/static', express.static(__dirname + '/static'));

// Remove this cross-origin policy nonsense
w.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Origincess-Control-Allow-Headers", "X-Requested-With, Content-Type");
  next();
});

// Configure nunjucks
var n = nunjucks.configure(__dirname + '/templates', {
	autoescape: true,
	express: w,
	watch: false
});

// Add markdown support, mostly for accessor descriptions.
markdown.register(n, marked);

// Add JSON filter
n.addFilter('json', function (s, n) {
	return JSON.stringify(s);
});

// Get a database to store created accessors
var db = new sqlite.Database(argv.db_location, function (err) {
	if (err) {
		error('Issue creating accessors.db');
		return;
	}

	db.serialize(function () {
		// Create the tables if they do not exist
		db.run('CREATE TABLE IF NOT EXISTS accessors       \
		        (id   INTEGER PRIMARY KEY AUTOINCREMENT,   \
		         name VARCHAR(1024)       NOT NULL UNIQUE, \
		         path VARCHAR(1024)       NOT NULL)        \
		       ');

		db.run('CREATE TABLE IF NOT EXISTS parameters           \
		        (id          INTEGER PRIMARY KEY AUTOINCREMENT, \
		         accessor_id INT                 NOT NULL,      \
		         name        VARCHAR(1024)       NOT NULL,      \
		         value       VARCHAR(1024)       NOT NULL,      \
		         FOREIGN KEY(accessor_id) REFERENCES accessors(id)) \
		       ');

		// Query the tables and create accessor instances for each device
		db.each('SELECT * FROM accessors ORDER BY name ASC',
			function (err, row) {
				if (err) {
					error(err);
					throw 'Could not retrieve accessors from DB';
				}
				// Now get the parameters
				var parameters = {};
				db.all('SELECT * FROM parameters WHERE accessor_id=?', row.id,
					function (err, rows) {
						if (err) {
							error(err);
							throw 'Could not retrieve parameters from DB';
						}
						for (var i=0; i<rows.length; i++) {
							parameters[rows[i].name] = rows[i].value;
						}

						activate_accessor(row.name, row.path, parameters);
					}
				);
			}
		);

	});

	info('Created or opened sqlite db successfully.');
});



/******************************************************************************
 *** RPC Server Functions
 ******************************************************************************/

function activate_accessor (name, path, parameters, callback) {

	accessors.create_accessor(path, parameters, function (err, accessor) {
		if (err) {
			error('Create_Accessor error');

			if (typeof callback === 'function') {
				callback({success: false, message: 'failed when creating the accessor. Are the parameters valid?'});
			}
		}

		accessor.init(function (err) {
			if (err) {
				error('Init_Accessor error');

				if (typeof callback === 'function') {
					callback({success: false, message: 'init() failed when loading the accessor. Are the parameters valid?'});
				}
			}

			try {
				// Success callback

				// Add UUIDs
				for (var i=0; i<accessor._meta.ports.length; i++) {
					var port = accessor._meta.ports[i];
					port.uuid = uuid.v4();
				}
				accessor._meta.uuid = uuid.v4();
				accessor._meta.device_name = escape(name);
				accessor._meta.html = nunjucks.render('ports.html', {
					accessor: accessor._meta,
					parameters: parameters
				});

				// Keep track of the accessors we are running
				active_accessors.push({
					name: name,
					path: path,
					accessor: accessor._meta
				});

				// Also save this in the database
				db.get('SELECT count(id) as count FROM accessors WHERE name=?', name, function (err, row) {
					if (err) {
						error(err);
						throw 'Could not query for accessor name';
					}
					if (row.count == 0) {
						// Have not seen this device before, add it.
						var ins = db.prepare('INSERT INTO accessors (name, path) \
						                      VALUES (?, ?)');
						ins.run([name, path], function (err) {
							if (err) {
								error(err);
								throw 'Could not add accessor to db';
							}
							var accessor_id = this.lastID;

							var insparam = db.prepare('INSERT INTO parameters (accessor_id, name, value) \
							                           VALUES (?, ?, ?)');
							for (var param_name in parameters) {
								var param_value = parameters[param_name];
								insparam.run([accessor_id, param_name, param_value], function (err) {
									if (err) {
										error(err);
										throw 'Failed to add accessor parameters to db';
									}
								});
							}
							insparam.finalize();

						});
						ins.finalize();
					}
				});

				// Iterate through all ports so we can create routes
				// for all ports.
				accessor._meta.ports.forEach(function (port, port_index, port_array) {
					info('Adding port ' + port.name);

					var slash = '';
					if (!s.startsWith(port.name, '/')) {
						slash = '/';
					}
					var port_path = slash + port.name;
					var device_base_path = '/active/' + escape(name);
					var device_port_path = device_base_path + port_path;
					info('path: ' + device_port_path);

					// Handle GET requests for this port
					// OUTPUT
					w.get(device_port_path, function (req, res) {
						info(" GET " + device_port_path + ": (req: " + req + ", res: " + res + ")");
						res.header("Content-Type", "application/json");

						if (port.attributes.indexOf('read') == -1) {
							res.send(JSON.stringify({
								success: false,
								message: 'Request for output when that is not a valid direction'
							}));
							return;
						}

						try {
							function send_error (err) {
								var err_str = err;
								if (err && typeof err === 'object' && 'message' in err) {
									err_str = err.message;
								}
								res.send(JSON.stringify({
									success: false,
									message: err_str
								}));
							}
							accessor.read(port.name, function (err, result) {
								if (err) {
									send_error(err);
									return;
								}
								info(" --> resp: " + result);
								res.send(JSON.stringify({
									success: true,
									data: result
								}));
							});
						} catch (err) {
							error('GET Exception');
							send_error(err);
						}
					});

					// INPUT
					w.post(device_port_path, function (req, res) {
						info("POST " + device_port_path);
						res.header("Content-Type", "application/json");

						if (port.directions.indexOf('input') == -1) {
							res.send(JSON.stringify({
								success: false,
								message: 'Request for input when that is not a valid direction'
							}));
							return;
						}
						var arg = null;
						if (port.type == 'bool') {
							info('REQ BODY: ' + req.body);
							arg = (req.body == 'true');
						} else {
							arg = req.body;
						}

						accessor.write(port.name, arg, function (err) {
							if (err) {
								error('POST err: ' + err);
								res.send(JSON.stringify({
									success: false,
									message: err.message
								}));
								return;
							}
							res.send(JSON.stringify({
								success: true
							}));
						});
					});

					w.ws(device_port_path, function (ws, req) {
						info("WS " + device_port_path);

						var on_observe = function (err, data) {
							if (err) {
								error('WS OBSERVE err: ' + err);
								try {
									ws.send(JSON.stringify({
										success: false,
										message: err.message
									}));
								} catch (err) {
									error('Error with ws - not connected');
								}
								return;
							}
							info('SENDING DATA TO WS');
							ws.send(JSON.stringify({
								success: true,
								data: data
							}));
						}

						ws.on('close', function () {
							info('Closed WS');
							accessor.removeListener(port.name, on_observe);
							ws.close();
						});

						accessor.on(port.name, on_observe);

					});
				});

				if (typeof callback === 'function') {
					callback({success: true});
				}

			} catch (e) {
				error('outside catch')
				error(e);
				if (typeof callback === 'function') {
					callback({success: false, message: e.message});
				}
			}
		});

	});

}


/******************************************************************************
 *** API Functions
 ******************************************************************************/

// Provide list of accessors
w.get('/list/all', function (req, res) {
	request(argv.host_server + '/list/all', function (error, response, body) {
		res.header("Content-Type", "application/json");
		if (error || response.statusCode != 200) {
			res.send(JSON.stringify({
				success: false,
				message: 'Failed to retrieve accessor list.'
			}));
		} else {
			res.send(JSON.stringify({
				success: true,
				data: JSON.parse(body)
			}));
		}
	});
});

// Get Accessor IR for an accessor
w.get('/accessor/:path([/\\.\\S]+)', function (req, res) {
	request(argv.host_server + '/accessor/' + req.params.path, function (error, response, body) {
		res.header("Content-Type", "application/json");
		if (error || response.statusCode != 200) {
			res.send(JSON.stringify({
				success: false,
				message: 'Failed to retrieve accessor IR for ' + req.params.path + '.'
			}));
		} else {
			res.send(JSON.stringify({
				success: true,
				data: JSON.parse(body)
			}));
		}
	});
});

// List all active accessors in this server
w.get('/list/active', function (req, res) {
	res.header("Content-Type", "application/json");
	res.send(JSON.stringify({
		success: true,
		data: active_accessors
	}));
});

// Get info on a particular instantiated device
w.get('/device/:name([\\S]+)', function (req, res) {
	res.header("Content-Type", "application/json");

	for (var i=0; i<active_accessors.length; i++) {
		var item = active_accessors[i];

		if (item.name == unescape(req.params.name)) {
			res.send(JSON.stringify({
				success: true,
				data: item.accessor
			}));
			return;
		}
	}

	res.send(JSON.stringify({
		success: false,
		message: 'Found no device matching ' + unescape(req.params.name) + '.'
	}));
});

// Create a new accessor
w.post('/create', function (req, res) {
	var create_properties = req.body;

	if (!('path' in create_properties) ||
		!('parameters' in create_properties) ||
		!('custom_name' in create_properties)) {
		res.status(400).send('Malformed accessor creation JSON.');
		return
	}

	var outcome = activate_accessor(create_properties.custom_name,
	                                create_properties.path,
	                                create_properties.parameters,
		function (outcome) {
			res.header("Content-Type", "application/json");
			res.send(JSON.stringify(outcome));
		});
});


/******************************************************************************
 *** Frontend Views
 ******************************************************************************/

// Homepage with main UI
w.get('/', function (req, res) {
	// Get all accessors
	request(argv.host_server + '/list/all', function (error, response, body) {

		res.render('index.html', {
			active_accessors: active_accessors,
			all_accessors: JSON.parse(body)
		});
	});
});


/******************************************************************************
 *** Create the server
 ******************************************************************************/
var server = w.listen(argv.port);
