#!/usr/bin/env python3

import flask
import requests
import argparse

DEFAULT_ACCESSOR_SERVER = 'http://pfet-v2.eecs.umich.edu:6565'

DESC = """
A webserver that acts as an accessor runtime. It includes some extra templating
and intelligence to style accessors and automatically generate nice web views
for them.
"""

parser = argparse.ArgumentParser(description=DESC)
parser.add_argument('-s', '--accessor-server',
		default=DEFAULT_ACCESSOR_SERVER,
		help='Server to load accessors from')
args = parser.parse_args()


app = flask.Flask(__name__, template_folder='jinja')

@app.template_filter('nospace')
def nospace(s):
	return s.replace(' ', '')


@app.route('/location/<path:location>')
def location(location):
	print(location)

	# Get the list of valid accessors for the given location
	r = requests.get('{}/accessors/{}/accessors.json'.format(args.accessor_server, location))
	if r.status_code != 200:
		return flask.jsonify(**{'status': 'error'})

	accessor_list = r.json()

	accessors = {'accessors': []}

	for accessor_url in accessor_list['accessors']:
		r2 = requests.get('{}/accessor{}'.format(args.accessor_server, accessor_url))
		if r2.status_code == 200:
			accessor = r2.json()
			accessor['html'] = flask.render_template('ports.jinja', accessor=accessor)
			accessors['accessors'].append(accessor)


	return flask.jsonify(**accessors)


@app.route('/accessor')
def accessor():

	locations = []
	locations.append({'name': 'University of Michigan - 4908 BBB',
	                  'path': '/usa/michigan/annarbor/universityofmichigan/bbb/4908'})

	return flask.render_template('accessors.jinja', locations=locations)


app.run(host='0.0.0.0', debug=True)