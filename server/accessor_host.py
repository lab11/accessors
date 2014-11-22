#!/usr/bin/env python3


import argparse
import copy
import xml.etree.ElementTree as ET
import json
import sys
import os

import tornado.ioloop
import tornado.web

import watchdog.events
import watchdog.observers

import sh
from sh import rm
try:
	from sh import npm
except ImportError:
	print("You need to install npm: https://www.npmjs.org/")
	print("(this isn't a python package)")
	sys.exit(1)

traceur = os.path.join(
	os.getcwd(),
	'node_modules',
	'traceur',
	'traceur')
if not os.path.exists(traceur):
	print("Running npm...")
	npm('install', 'traceur')
traceur = sh.Command(traceur)

ACCESSOR_SERVER_PORT = 6565


server_path_tuples = []
accessors_by_path = {}

ET._original_serialize_xml = ET._serialize_xml
def _serialize_xml(write, elem, *args, **kwargs):
	if elem.tag == '![CDATA[':
		write("\n<%s%s]]>\n" % (elem.tag, elem.text))
		return
	return ET._original_serialize_xml(write, elem, *args, **kwargs)
ET._serialize_xml = ET._serialize['xml'] = _serialize_xml

class accessor_tree_node ():
	def __init__ (self, name, accessor):
		self.name = name
		self.accessor = accessor
		self.children = []

	def add_child (self, child):
		self.children.append(child)

	def __str__ (self):
		return self.to_string(0)

	def to_string (self, indent):
		s =  '{indent}ATN: {name}\n'.format(indent=' '*indent, name=self.name)
		s += '{indent}Children:\n'.format(indent=' '*indent)
		for c in self.children:
			s += c.to_string(indent+2)
		return s



class accessor_tree_leaf ():
	def __init__ (self, name, accessor, path):
		self.name = name
		self.accessor = accessor
		self.path = path

	def to_string (self, indent):
		s =  '{indent}ATL: {name}\n'.format(indent=' '*indent, name=self.name)
		return s



# Avoid this Cross-Origin nonsense
class ServerAccessorList (tornado.web.StaticFileHandler):
	def set_default_headers(self):
		self.set_header("Access-Control-Allow-Origin", "*")


# Base class for serving accessors.
class ServeAccessor (tornado.web.RequestHandler):
	def set_default_headers(self):
		self.set_header("Access-Control-Allow-Origin", "*")

	def get (self):
		print("get accessor {}".format(self))
		# Create a local copy of the accessor to serve so we can configure it
		accessor = copy.deepcopy(self.accessor)

		# See if any of the parameters should be configured
		if 'parameters' in accessor:
			for p in accessor['parameters']:
				if 'required' in p and p['required']:
					p['value'] = self.get_argument(p['name'])
				else:
					p['value'] = self.get_argument(p['name'], p['default'])

		# Look for any other parameters that change how we will respond
		language = self.get_argument('_language', 'es6')
		if language == 'traceur_es5':
			print('traceur_es5')
			accessor['code']['javascript'] = accessor['code_alternates']['traceur_es5']
		elif language == 'es6':
			pass
		else:
			raise NotImplementedError("Unknown language: {}".format(language))

		if 'code_alternates' in accessor:
			del accessor['code_alternates']

		format = self.get_argument('_format', 'json')
		if format == 'xml':
			print('xml')
			self.set_header('Content-Type', 'application/xml')
			accessor_xml = self.convert_accessor_to_xml(accessor)
			self.write(accessor_xml)
			return


		self.set_header('Content-Type', 'application/json')
		accessor_json = json.dumps(accessor, indent=4)
		#accessor_json = json.dumps(accessor, indent=4).replace('\\n', '\n')
		self.write(accessor_json)

	def convert_accessor_to_xml (self, accessor):
		top = ET.Element('class', attrib={'name': accessor['name'],
		                                  'extends': 'org.terraswarm.kernel.JavaScript'})
		ET.SubElement(top, 'author').text = accessor['author']
		ET.SubElement(top, 'version').text = accessor['version']
		for port in accessor['ports']:
			props = {'name': port['name']}
			if 'default' in port:
				props['value'] = port['default']
			if 'type' in port:
				props['type'] = port['type']
			if 'description' in port:
				props['description'] = port['description']

			ET.SubElement(top, port['direction'], attrib=props)
		doc = ET.SubElement(top, 'documentation', attrib={'type': 'text/html'})
		ET.SubElement(doc, '![CDATA[', attrib={'type': 'text/html'})\
			.text = accessor['description']
		ET.SubElement(top, '![CDATA[', attrib={'type': 'text/javascript'})\
			.text = '\n{}\n'.format(accessor['code']['javascript'])

		s = '\n'.join(ET.tostringlist(top, encoding='unicode'))
		s = '''<?xml version="1.0" encoding="utf-8"?>
<?xml-stylesheet type="text/xsl" href="renderHTML.xsl"?>
<!DOCTYPE class PUBLIC "-//TerraSwarm//DTD Accessor 1//EN"
    "http://www.terraswarm.org/accessors/Accessor_1.dtd">
''' + s
		return s


def create_accessor (structure, accessor, path):
	# Handle any code include directives
	if 'code' in accessor:
		for language,v in accessor['code'].items():
			code = ''
			if 'include' in v:
				for include in v['include']:
					code += open(os.path.join(path, include)).read()
			if 'code' in v:
				code += v['code']
			accessor['code'][language] = code

			if language == 'javascript':
				assert not os.path.exists('_temp1.js')
				assert not os.path.exists('_temp2.js')
				try:
					open('_temp1.js', 'w').write(code)
					traceur('--out', '_temp2.js', '--script', '_temp1.js')
					try:
						if 'code_alternates' not in accessor:
							accessor['code_alternates'] = {}
						accessor['code_alternates']['traceur_es5'] = open('_temp2.js').read()
					finally:
						rm("_temp2.js")
				finally:
					rm('_temp1.js')

	# Create the URL based on the hierarchy
	name = ''.join(structure)
	path = '/accessor/{}'.format('/'.join(structure[1:]))

	# Create a class for the tornado webserver to use when the accessor
	# is requested
	serve_class = type('ServeAccessor' + name, (ServeAccessor,), {
		'accessor': accessor
	})

	if path in accessors_by_path:
		accessors_by_path[path].accessor = accessor
		print('Updating accessor {}'.format(path))

	else:

		# Add the accessor to the list of valid accessors to request
		server_path_tuples.append((path, serve_class))
		accessors_by_path[path] = serve_class
		print('Adding accessor {}'.format(path))


# Build accessors going down the tree
def create_accessors (accessor_tree, current_accessor, structure):
	structure.append(accessor_tree.name)

	# accessor_tree.accessor is the current accessor we are pointing to.
	#                        This is the furthest down the chain so far.
	# current_accessor       is the accessor we have been building so far

	if current_accessor == None:
		current_accessor = accessor_tree.accessor
	else:
		# Take what we want from current_accessor
		if 'ports' in current_accessor:
			if 'ports' in accessor_tree.accessor:
				accessor_tree.accessor['ports'] = \
					copy.deepcopy(current_accessor['ports']) + \
					accessor_tree.accessor['ports']
			else:
				accessor_tree.accessor['ports'] = \
					copy.deepcopy(current_accessor['ports'])

	if type(accessor_tree) == accessor_tree_leaf:
		# This is an accessor we can actually serve
		create_accessor(structure, accessor_tree.accessor, accessor_tree.path)

	else:
		# recurse!
		for atn in accessor_tree.children:
			create_accessors(atn, accessor_tree.accessor, copy.deepcopy(structure))


def find_accessors (path, tree_node):

	# sub_structure = copy.deepcopy(structure)
	# sub_ports     = copy.deepcopy(ports)

	# Get the name of the folder we are currently in
	folder = os.path.basename(os.path.normpath(path))
	atn = None

	# See if there is a .json file in this folder with the same
	# name as the folder. If so, this is the interface file
	interface_path = os.path.join(path, folder) + '.json'
	if os.path.isfile(interface_path):
		with open(interface_path) as f:
			j = json.load(f, strict=False)
			atn = accessor_tree_node(folder, j)
			# sub_structure += [folder]
			# if 'ports' in j:
			# 	sub_ports += j['ports']
	else:
		atn = accessor_tree_node(folder, None)


	if tree_node:
		tree_node.add_child(atn)


	# Look for any other .json files. These are accessors
	contents = os.listdir(path)
	for item in contents:
		item_path = os.path.join(path, item)
		# Do only .json files on the first pass
		if os.path.isfile(item_path):
			filename, ext = os.path.splitext(os.path.basename(item_path))
			if ext == '.json' and filename != folder:
				# This must be an accessor file
				with open(item_path) as f:
					j = json.load(f, strict=False)
					atl = accessor_tree_leaf(filename, j, path)
					atn.add_child(atl)
					#create_accessor(path, sub_structure+[filename], sub_ports, j)


	# Do the directories
	for item in contents:
		item_path = os.path.join(path, item)
		if os.path.isdir(item_path):
			find_accessors(item_path, atn)

	return atn




DESC = """
Run an accessor hosting server.
"""


parser = argparse.ArgumentParser(description=DESC)
parser.add_argument('-p', '--path',
                    required=True,
                    help='The root of the tree that holds the accessors.')
parser.add_argument('-l', '--location_path',
                    required=True,
                    help='The root of the location tree.')
args = parser.parse_args()

# Initialize the accessors
root = find_accessors(args.path, None)
create_accessors(root, None, [])

# Start a monitor to watch for any changes to accessors
class AccessorChangeHandler (watchdog.events.FileSystemEventHandler):
	def on_any_event (self, event):
		root = find_accessors(args.path, None)
		create_accessors(root, None, [])

observer = watchdog.observers.Observer()
observer.schedule(AccessorChangeHandler(), path=args.path, recursive=True)
observer.start()

# Start the webserver for accessors
accessor_server = tornado.web.Application(
	server_path_tuples +
	[(r'/accessors/(.*)', ServerAccessorList, {'path': args.location_path})])
accessor_server.listen(ACCESSOR_SERVER_PORT)

print('Starting accessor server on port {}'.format(ACCESSOR_SERVER_PORT))

# Run the loop!
tornado.ioloop.IOLoop.instance().start()


