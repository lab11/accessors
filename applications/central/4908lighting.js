
var central = require('./central');
var config = require('./config');

// Define our test.
// This pulls packets from BLE scan queue, puts them in match, feeds one
// output of match into a not, and feeds both of those into the 4908lights
// block, which will be an accessor some day.
var profile_desc = {
	blocks: [
		{
			type: 'accessor',
			path: '/webquery/RabbitMQ',
			parameters: {
				amqp_url: 'amqp://' + config.rabbitmq.login + ':' +
				           config.rabbitmq.password + '@' +
				           config.rabbitmq.host + '/' + config.rabbitmq.vhost,
				amqp_exchange: config.rabbitmq.exchange,
				amqp_routing_key: 'event.presence.University_of_Michigan.BBB.4908.#',
			},
			uuid: 'PullWearabouts'
		},
		{
			type: 'Match',
			parameters: {
				key: 'event_str',
				matches: [
					'Location occupied',       // 0
					'Location not occupied',   // 1
					'samkuo in location',      // 2
					'samkuo not in location'   // 3
				]
			},
			uuid: 'MatchEvents',
		},
		{
			type: 'Not',
			uuid: 'Not0'
		},
		{
			type: 'Not',
			uuid: 'Not1'
		},
		{
			type: 'accessor',
			path: '/switch/acme++',
			parameters: {
				ip_addr: config.acme.workbench_right_ip_addr,
			},
			uuid: 'AcmeWorkbenchRight'
		},
		{
			type: 'accessor',
			path: '/switch/acme++',
			parameters: {
				ip_addr: config.acme.workbench_left_ip_addr,
			},
			uuid: 'AcmeWorkbenchLeft'
		},
		// {
		// 	type: 'accessor',
		// 	path: '/switch/acme++',
		// 	parameters: {
		// 		ip_addr: config.acme.overhead_ip_addr,
		// 	},
		// 	uuid: 'AcmeOverheadLights'
		// },
		// {
		// 	type: 'accessor',
		// 	path: '/switch/acme++',
		// 	parameters: {
		// 		ip_addr: config.acme.yesheng_ip_addr,
		// 	},
		// 	uuid: 'AcmeYeshengLight'
		// },
		{
			type: 'accessor',
			path: '/lighting/hue/allbridgehues',
			parameters: {
				bridge_url: config.hues.bridge_url,
				username: config.hues.username,
			},
			uuid: 'HueAll'
		},
		{
			type: 'accessor',
			path: '/switch/wemo',
			parameters: {
				wemo_url: config.sconce.wemo_url,
			},
			uuid: 'WemoSamSconce'
		}
	],
	connections: [
		{
			src: 'PullWearabouts.Data',
			dst: 'MatchEvents.0'
		},
		{
			src: 'MatchEvents.1',
			dst: 'Not0'
		},
		{
			src: 'Not0',
			dst: 'AcmeWorkbenchRight.PowerControl'
		},
		{
			src: 'MatchEvents.2',
			dst: 'AcmeWorkbenchLeft.PowerControl'
		},
		{
			src: 'MatchEvents.3',
			dst: 'Not1'
		},
		{
			src: 'Not1',
			dst: 'AcmeWorkbenchLeft.PowerControl'
		}
		// {
		// 	src: '2',
		// 	dst: 'acme_workbench.PowerControl'
		// },
		// {
		// 	src: '1.0',
		// 	dst: 'acme_workbench.PowerControl'
		// }
	]
}

c = new central(profile_desc);
