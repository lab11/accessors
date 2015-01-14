// name: Hue Single
// author: Brad Campbell
// email: bradjc@umich.edu
//
// Hue Light Bulb
// ==============
//
// This controls a single Hue bulb.
//
//

var bulb_layout;

function* prefetch_bulb_layout () {
	var url = get_parameter('bridge_url') + '/api/' + get_parameter('username') + '/lights';
	bulb_layout = JSON.parse(yield* rt.http.readURL(url));
}

function get_bulb_id () {
	var name = get_parameter('bulb_name');

	for (var key in bulb_layout) {
		if (bulb_layout[key].name == name) {
			return key;
		}
	}
}

function* set_bulb_paramter (params) {
	var bulbid = get_bulb_id();

	url = get_parameter('bridge_url') + '/api/' + get_parameter('username') + '/lights/' + bulbid + '/state';
	yield* rt.http.request(url, 'PUT', null, JSON.stringify(params), 3000);
}

function* init () {
	provide_interface('/lighting/light', {
			'lighting.light.Power': power,
			});
	provide_interface('/lighting/hue', {
			'lighting.rgb.color': color,
			'lighting.brightness.Brightness': brightness,
			});

	yield* prefetch_bulb_layout();
}

function* power (on) {
	yield* set_bulb_paramter({'on': on});
}

function* color (hex_color) {
	hsv = rt.color.hex_to_hsv(hex_color);
	params = {'hue': Math.round(hsv.h*182.04),
	          'sat': Math.round(hsv.s*255),
	          'bri': Math.round(hsv.v*255)}
	yield* set_bulb_paramter(params);
}
function* brightness (brightness) {
	yield* set_bulb_paramter({'bri': parseInt(brightness)});
}