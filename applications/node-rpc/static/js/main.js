
/*
 * Alerts for trying to create a new device.
 */
function new_device_alert_error (error_str) {
	html = '<div class="alert alert-danger" role="alert">'+error_str+'</div>';
	$('#new-device-alerts').empty();
	$('#new-device-alerts').html(html);
}

function new_device_alert_success (success_str) {
	html = '<div class="alert alert-success" role="alert">'+success_str+'</div>';
	$('#new-device-alerts').empty();
	$('#new-device-alerts').html(html);
}

function new_device_alert_clear () {
	$('#new-device-alerts').empty();
}

/*
 * Main page alerts.
 */
function alert_error (error_str) {
	html = '<div class="alert alert-danger" role="alert">'+error_str+'</div>';
	$('#alerts').empty();
	$('#alerts').html(html);
}

/*
 * Alerts on individual accessors running.
 */
function accessor_alert_error (accessor_uuid, error_str) {
	html = '<div class="alert alert-danger" role="alert">'+error_str+'</div>';
	$('#accessor-'+accessor_uuid+'-alerts').empty();
	$('#accessor-'+accessor_uuid+'-alerts').html(html);
}

function accessor_alert_clear (accessor_uuid) {
	$('#accessor-'+accessor_uuid+'-alerts').empty();
}


function format_currency_usd (price) {
	p = price.toFixed(2);

	if (p < 0) {
		return '<span class="negative">-$' + (p*-1.0).toFixed(2) + '</span>';
	} else {
		return '<span class="positive">$' + p + '</span>';
	}
}

function accessor_function_start (name) {
	accessor_alert_clear(name);
	$('#accessor-'+name+' .spinner').show();
}

function accessor_function_stop (name) {
	$('#accessor-'+name+' .spinner').hide();
}
