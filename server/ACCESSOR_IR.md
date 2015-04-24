Accessor JSON Format
====================

Accessors are written by accessor authors as `Javascript` files. These files
are processed by the accessor host server to generate a JSON file the
expresses the accessor interface, dependencies, imports, and other key
information. The JSON file includes the original accessor under a `code` key.
This document specifies the JSON format.

Additionally, this document defines an isomorphic transfrom from this JSON format
to an XML format for cases where XML is easier for the recipient to process.

The basic format is:

```json
{
	"[KEY]": VALUE
}
```

Accessor Fields
---------------

Here is the list of valid keys. All keys are required, however the arrays may
be empty. Runtimes should ignore unknown keys.

| KEY            | Type          | Description |
| ---            | ------        | ----------- |
| `version`      | string        | The version number of the accessor format. |
| `name`         | string        | The name of the accessor. |
| `safe_name`    | string        | The name of the accessor with any special characters removed. Will match /[a-zA-Z_]+[a-zA-Z_0-9]*/ |
| `author`       | object        | Information about the author. Must be an object with the keys: `name`, `email`. |
| `description`  | string        | Description of the accessor written in Markdown syntax. |
| `ports`        | array         | Input and output fields for this accessor. See the "Ports" section below. |
| `parameters`   | array         | Values which must be specified for a particular instantiation of this accessor. These are set when the accessor is retrieved from the accessor host server. |
| `code`         | object        | Code that makes the accessor run. See the "Code" section for more details. |
| `dependencies` | array         | Other accessors that must be loaded in order for this accessor to run. See the "Accessor Dependencies" section for more details. |


### Ports

Ports specify how data goes into and out of accessors. Ports are specified
as a list of objects where each object is a port. Here are the keys that
are valid in the port object:

| KEY            | Required | Type          | Description |
| ---            | -------- | ------        | ----------- |
| `direction`    | yes      | string        | Specifies if this port takes data from the user, displays data to the user, or both. Valid choices are: `input`, `output`, and `inout`. |
| `name`         | yes      | string        | Port name. Valid characters are `A-Z`, `a-z`, `0-9`, and `_`. |
| `display_name` | yes      | string        | A preferred format for the port name in UI elements. |
| `description`  | no       | string        | A description of the port for use in UIs (like a tagline, or tooltip). |
| `type`         | yes      | string        | Specifies the data type of the port. Defaults to "string". See "Port Types" below for more information. |
| `units`        | no       | string        | Specifies how the data should be interpreted. See "Units" below for more information. |
| `default`      | no       | `<type>`      | Specify a default value for the port |
| `options`      | for select | array         | Required and only valid when `type` == "select". Specifies the list of valid options the user can select from. |
| `min`          | no       | number        | Only valid when `type` == "integer" or "numeric". Allows the accessor runtime to limit input values. |
| `max`          | no       | number        | Only valid when `type` == "integer" or "numeric". Allows the accessor runtime to limit input values. |


#### Port Types

Port types essentially specify the data type of the port. Valid choices are:

| Port Type | Description |
| --------- | ----------- |
| `button`  | Only valid when `type` == "input". Display a button the user can press. |
| `bool`    | Any true/false field. Likely will show as a checkbox. |
| `string`  | Any string entry. Likely will just be a text field the user can write in. |
| `numeric` | Any number. Can be constrained by using "min" and/or "max" keys. Using "min" and "max" allows the UI to be cleaner as the runtime can display a slider or other easier to use UI element.  |
| `integer` | Constrain the numeric field to just integers. See `numeric` section for information about "min" and "max". |
| `select`  | Shows the user a list of options to choose from. Use the `options` key to specify the options. |
| `color`   | Allow the user to enter a color. Will likely display a color picker. Color will be represented by a six digit RGB hex string. Example: "00FF00". |

**TODO:** Should `color` be a type, or should `color_hex_rgb` be a unit
affiliated with a `string` type?

#### Units

Units optionally express how a basic port type should be interpreted for
contexts where they may be meaningful. Units are only valid for certain types,
as specified here. Note that `integer` is a subset of `numeric`, (any `numeric`
type can be applied to an `integer`, but not vice-versa).

##### `numeric` units

* `currency`: A currency type. Specific currency types exist as (**TODO**
  `currency_usd` or `currency.usd`).
  - **(TODO, idea):** The accessor `/anywhere/utility/currency/convert` can be
    used to convert between currency types.


### Parameters

Parameters allow for otherwise generic accessors to be customized to a particular
device or room. Parameters are specified as a list of objects. Here are the valid
keys in an accessor parameter object:

| KEY            | Required | Type          | Description |
| ---            | -------- | ------        | ----------- |
| `name`         | yes      | string        | Name of the parameter. |
| `required`     | yes      | bool          | Specifies whether the parameter must be set when the accessor is requested. If the parameter is not specified an error will be returned. |
| `default`      | if !required | string    | Value of the parameter if it is not otherwise specified when the accessor is requested. |

**TODO:** Think more about required/default interaction.

#### Parameters Example

```json
"parameters": [
	{
		"name": "device_url",
		"required": true
	},
	{
		"name": "username",
		"required": true,
		"default": "user1"
	},
	{
		"name": "favorite",
		"required": false,
		"default": "device_0"
	}
]
```

### Code

The magic of accessors is their included code. The `code` key specifies the available
code and what language(s) the code is in. Code is specified as an object. The keys
of the object are programming language names. Each language name key has another
object as its value. The valid keys in the second object are:

| KEY            | Required | Type          | Description |
| ---            | -------- | ------        | ----------- |
| `code`         | no       | string        | A string of code. Will be included last in the generated accessor by the accessor host server. |
| `include`      | no       | array         | A list of files that should be included when the final code blob is created by the accessor host server. The files will be appended in order. Using `include` makes writing the accessor code easier than including it in this file. |

#### Code Example

```json
"code": "function* init () {\n\t// INTERFACES\n\tprovide_interface('/onoff', {\n\t\t'/onoff.Power': PowerControl\n\t});\n\tprovide_interface('/sensor/power' ..."
```

### Dependencies

Often it may be useful to compose accessors, that is, create a higher-level interface
from a set of lower-level accessors. Think of this like an "all-in-one remote":
playing a movie may require the TV accessor, the audio accessor, and the Blu-ray
accessor. By specifying dependencies an accessor is able to use the sub-accessor's
code rather than having to recreate it.

Dependencies are specified as a list of objects. Here are the valid keys in the
objects:

| KEY            | Required | Type          | Description |
| ---            | -------- | ------        | ----------- |
| `name`         | yes      | string        | Name to map the sub-accessor to. This name will be used when creating the object for the sub-accessor. |
| `path`         | yes      | string        | Path to the sub-accessor. Can point to an accessor on the local accessor host server or a remote one. Parameters can also be passed if needed. |
| `parameters`   | no       | object        | Object of <parameter_name:parameter_value> pairs. Use this to set the parameters of the sub-accessor to a constant value. |

#### Dependencies Example

```json
"dependencies": [
	{
		"name": "MyHue",
		"path": "/onoffdevice/light/hue/huesingle.json"
	},
	{
		"name": "MyRoomLight",
		"path": "/onoffdevice/light/roomlight.json?room_number=7104"
	},
	{
		"name": "MyCustomLight",
		"path": "http://myaccessorserver.com/accessor/onoffdevice/light/custom.json"
	}
]
```



Accessor Example
----------------

```json
{
    "author": {
        "name": "Brad Campbell",
        "email": "bradjc@umich.edu"
    },
    "code": "// name: ACme++\n// author: Brad Campbell\n// email:  bradjc@umich.edu\n\n// ACme++\n// ======\n//\n// ACme++ (AC Meter ++) is a power meter with an included relay.\n//\n\nvar ip_addr;\n\nfunction* init () {\n\t// INTERFACES\n\tprovide_interface('/onoff', {\n\t\t'/onoff.Power': PowerControl\n\t});\n\tprovide_interface('/sensor/power', {\n\t\t'/sensor/power.Power': PowerMeter\n\t});\n\n\tip_addr = get_parameter('ip_addr');\n\n\t// Initialize the relay power state\n\tvar response = yield* rt.coap.get('coap://['+ip_addr+']/onoffdevice/Power');\n\tset('PowerControl', (response == 'true'));\n}\n\nfunction* PowerControl (state) {\n\tyield* rt.coap.post('coap://['+ip_addr+']/onoffdevice/Power', (state)?'true':'false');\n\n}\n\nfunction* PowerMeter () {\n\treturn yield* rt.coap.post('coap://['+ip_addr+']/powermeter/Power');\n}\n",
    "dependencies": [],
    "version": "0.1",
    "name": "ACme++",
    "description": "ACme++\n======\n\nACme++ (AC Meter ++) is a power meter with an included relay.\n\n",
    "implements": [
        {
            "interface": "/onoff",
            "provides": [
                [
                    "/onoff.Power",
                    "PowerControl"
                ]
            ],
            "ports": [
                "onoff.Power"
            ]
        },
        {
            "interface": "/sensor/power",
            "provides": [
                [
                    "/sensor/power.Power",
                    "PowerMeter"
                ]
            ],
            "ports": [
                "sensor.power.Power"
            ]
        }
    ],
    "ports": [
        {
            "type": "bool",
            "direction": "inout",
            "display_name": "Power",
            "name": "/onoff/Power",
            "function": "PowerControl"
        },
        {
            "direction": "output",
            "unit": "watts",
            "display_name": "Power Usage",
            "name": "/sensor/power/Power",
            "function": "PowerMeter",
            "type": "numeric"
        }
    ],
    "runtime_imports": [
        "coap"
    ],
    "parameters": [
        {
            "required": true,
            "name": "ip_addr"
        }
    ],
    "safe_name": "ACme__"
}
```

```xml
<?xml version="1.0" encoding="utf-8"?>
<?xml-stylesheet type="text/xsl" href="/static/v0/renderHTML.xsl"?>
<!DOCTYPE class PUBLIC "-//TerraSwarm//DTD Accessor 1//EN" "http://www.terraswarm.org/accessors/Accessor_1.dtd">
<class extends="org.terraswarm.kernel.JavaScript" name="ACme++" >
<version>0.1</version>
<author>
  <name>Brad Campbell</name>
  <email>bradjc@umich.edu</email>
</author>
<documentation type="text/html">
<![CDATA[ACme++
======

ACme++ (AC Meter ++) is a power meter with an included relay.

]]>
</documentation>
<implements>
  <interface name="/onoff">
    <provides name="/onoff.Power">
  </interface>
  <interface name="/sensor/power">
    <provides name="/sensor/power.Power">
  </interface>
<ports>
  <port name="/onoff/Power" direction="inout" type="bool" display_name="Power">
  <port name="/sensor/power/Power" direction="output" type="numeric" display_name="Power Usage" unit="watts">
</ports>
<parameter name="ip_addr" required="True" />
<script type="text/javascript">
<![CDATA[
// name: ACme++
// author: Brad Campbell
// email:  bradjc@umich.edu

// ACme++
// ======
//
// ACme++ (AC Meter ++) is a power meter with an included relay.
//

var ip_addr;

function* init () {
	// INTERFACES
	provide_interface('/onoff', {
		'/onoff.Power': PowerControl
	});
	provide_interface('/sensor/power', {
		'/sensor/power.Power': PowerMeter
	});

	ip_addr = get_parameter('ip_addr');

	// Initialize the relay power state
	var response = yield* rt.coap.get('coap://['+ip_addr+']/onoffdevice/Power');
	set('PowerControl', (response == 'true'));
}

function* PowerControl (state) {
	yield* rt.coap.post('coap://['+ip_addr+']/onoffdevice/Power', (state)?'true':'false');

}

function* PowerMeter () {
	return yield* rt.coap.post('coap://['+ip_addr+']/powermeter/Power');
}
]]>
</script>
</class>
```
