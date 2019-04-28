const isMobileVersion = new MobileDetect(window.navigator.userAgent).mobile() != null;

// indicator whether the event was triggerd by TogetherJS sync operation
let sendByTogetherJSPeer = false;

let locked = true;
let cuttingPlane = true;
let bearing = -9;
let animationRunning = false;
// dates that are available
let dates = [];
const millisecPerDay = 24 * 60 * 60 * 1000;
let granularities = [
	{
		attr: 'yearly',
		max: NaN,
		start: null,
		end: null,
		parents: [],
		from: (date) => date.getFullYear(),
		to: (value) => {
			value = parseInt(value);
			return new Date(value, 0, 1);
		},
		str: function(value) {
			return d3.time.format('%Y')(this.to(value))
		},
		round: d3.time.year.round,
		interval: d3.time.year
	},
	{
		attr: 'monthly',
		max: NaN,
		start: null,
		end: null,
		parents: [],
		from: (date) => date.getFullYear() * 12 + date.getMonth(),
		to: (value) => {
			value = parseInt(value);
			const m = value % 12;
			return new Date((value - m) / 12, m, 1);
		},
		str: function(value) {
			return d3.time.format('%b %Y')(this.to(value))
		},
		round: d3.time.month.round,
		interval: d3.time.month
	},
	{
		attr: 'weekly',
		max: NaN,
		start: null,
		end: null,
		parents: [],
		f: d3.time.format('%U'),
		from: function (date) {
			return date.getFullYear() * 52 + parseInt(this.f(date));
		},
		to: function (value) {
			value = parseInt(value);
			const m = value % 52;
			return d3.time.monday.round(d3.time.format('%Y %U').parse(`${(value - m) / 52} ${m}`));
		},
		str: function(value) {
			return d3.time.format('%Y #%U')(this.to(value))
		},
		round: d3.time.monday.round,
		interval: d3.time.monday
	},
	{
		attr: 'daily',
		max: NaN,
		start: null,
		end: null,
		parents: [],
		from: (date) => Math.floor(date.getTime() / millisecPerDay),
		to: function(value) {
			value = parseInt(value) * millisecPerDay;
			return d3.time.day.round(new Date(value));
		},
		str: function(value) {
			return d3.time.format('%b %d')(this.to(value))
		},
		round: d3.time.day.round,
		interval: d3.time.day
	}
];
// currently selected date
let selectedDate = null;
let selectedGranularity = granularities[0]; // year
let selectedBuilding = null;
let selectedVisMode = null;
let selectedScale = d3.scale.linear().domain([0, 100]).range(['#fee8c8', '#e34a33']).clamp(true);

// list of buildings: { properties: { name: string}, data: {date: Date, value: number}[] }
let buildings = [];
let relevantBuildings = [];
let networkLines = [];

// internal event handler
const events = d3.dispatch('init', 'select', 'selectGranularity', 'selectBuilding', 'selectVisMode', 'animate', 'animateEnd', 'resize', 'toggleCuttingPlane');

const numberFormat = d3.format('.5s');
const parseDate = d3.time.format("%Y%m%d").parse;


const map = !isMobileVersion ? createMap() : null;

function createMap() {
	// map box tile layer
	const tiles_bright = L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/256/{z}/{x}/{y}?access_token={accessToken}', {
		attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
		id: 'sgeoviz/cjdamgdvl92j12sp5049j5xjk',
		maxZoom:30,
		accessToken: 'pk.eyJ1Ijoic2dlb3ZpeiIsImEiOiJnZ1VQQ1ZNIn0.kX6gvvUIGV9VGpiixzGtPg'
	});

	const tiles_dark = L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/256/{z}/{x}/{y}?access_token={accessToken}', {
		attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
		id: 'sgeoviz/cjuhuz4va5ruo1fpp0zaq1lf1',
		maxZoom:30,
		accessToken: 'pk.eyJ1Ijoic2dlb3ZpeiIsImEiOiJnZ1VQQ1ZNIn0.kX6gvvUIGV9VGpiixzGtPg'
	});

	// const tiles_satellite = L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
	// 	attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
	// 	id: 'mapbox.streets-satellite',
	// 	maxZoom:30,
	// 	accessToken: 'pk.eyJ1IjoiZmxvcmVuY2U4NjI3IiwiYSI6ImNqb294Mmk1MTAzcGQzcG14cXpqZHh1YmMifQ.ahUeysh9RSQJ4jegcGrr4w'
	// });
	
	const tiles_satellite = L.tileLayer('https://api.nearmap.com/tiles/v3/Vert/{z}/{x}/{y}.png?apikey={accessToken}', {
		accessToken: 'ZDZiOWU0NjctY2NjYS00YWVmLThhNWMtOGM2NTI4N2ZiZGYw'
	});
	
	const buildingsOverlay = L.d3SvgOverlay((selection, proj) => {
		updateBuildings = () => {
			const upd = selection.classed('buildings', true).selectAll('path.building').data(buildings);
			const updEnter = upd.enter()
				.append('path')
				.classed('building', true)
				.on('click', (d) => setSelectedBuilding(d.properties.name));

			updEnter.append('title');
			upd
				.classed('phaseN', (d) => d.properties.phase_1 !== 'yes')
				.attr('id', (d) => d.properties.name)
				.attr('d', proj.pathFromGeojson)
				.style('fill', (d) => selectedDate == null || d.properties.phase_1 !== 'yes' ? null : computeConsumptionColor(d))
				.classed('selected', (d) => d.properties.name === selectedBuilding)
				.style('stroke-width', 1 / proj.scale);
			upd
				.select('title').text(computeConsumptionText);

			upd.exit().remove();
		};
		events.on('select.buildings', updateBuildings);
		events.on('selectBuilding.buildings', updateBuildings);
		updateBuildings();
	});

	const networkLinesOverlay = L.d3SvgOverlay((selection, proj) => {
		const networks = selection.selectAll('path.network').data(networkLines);
		const networksEnter = networks.enter()
			.append('path')
			.classed('network', true);

		networks
			.attr('id', (d) => d.properties.name)
			.attr('d', proj.pathFromGeojson)
			networks.exit().remove();
		networks.exit().remove();
	});

	
	const map = L.map("map-canvas", {
		//center: [-37.9115, 145.1344],
		center: [-37.911865347872435, 145.13213679960097],
		zoom: 17,
		minZoom: 10,
		maxZoom: 30,
		zoomSnap: 0.0,
		zoomDelta:0.1,
		rotate: true,
		zoomControl: true,
		touchZoom: true,
		touchRotate: true,
		boxZoom: false,
		doubleClickZoom: false,
		dragging: true,
		keyboard: false,
		scrollWheelZoom: false,
		layers: [tiles_satellite,tiles_dark]
	});

	map.on('moveend', (evt) => {
		console.log('new center', map.getCenter());
	});

	
	const baseMaps = {
		Satelite: tiles_satellite,
		Symbolic: tiles_dark,
		'Symbolic (Bright)': tiles_bright
	};
	const overlayMaps = {
		Buildings: buildingsOverlay,
		NetworkLines: networkLinesOverlay
	};
	L.control.layers(baseMaps, overlayMaps).addTo(map);
	L.control.scale().addTo(map);
	map.addControl(new L.Control.Fullscreen());
	L.control.ruler({
		lengthUnit:{
			factor: 1000,
			decimal: 2,
			display:'meters',
			label:'Distance'
		}
	}).addTo(map);

	events.on('init.map', () => {
		//console.log(buildings);
		// build buildings layer
		buildingsOverlay.addTo(map);

		// disable network layer by default
		// networkLinesOverlay.addTo(map);
		map.setBearing(bearing);
	});

	function setBearing() {
		if (locked) {
			return;
		}
		bearing = bearing-1.5;
		map.setBearing(bearing);
	}

	function toggleLock() {
		locked = !locked;
		d3.select('.fa-lock,.fa-lock-open').classed('fa-lock', locked).classed('fa-lock-open', !locked);

		const handlers = ['dragging', 'scrollWheelZoom', 'tap', 'doubleClickZoom', 'boxZoom', 'touchZoom'];

		handlers.forEach((d) => {
			if (map[d] != null) {
				if (locked) {
					map[d].disable();
				} else {
					map[d].enable();
				}
			}
		});

		map.setBearing(bearing);
	}

	if (locked) {
		locked = false; // dummy since toggle
		toggleLock();
	}

	function toggleCuttingPlane() {
		cuttingPlane = !cuttingPlane;
		d3.select('.fa-cut,.fa-square').classed('fa-cut', cuttingPlane).classed('fa-square', !cuttingPlane);
		events.toggleCuttingPlane(cuttingPlane);
	}

	// adding rotation control
	L.easyButton('<i class="fa fa-undo"></i>', setBearing).addTo(map);
	L.easyButton('<i class="fa fa-lock"></i>', toggleLock).addTo(map);

	// adding additional info panel 
	// L.easyButton('<i class="fa fa-cloud-sun" title="Show Weather Plot"></i>', toggleWeather).addTo(map);

	// testing collaborative js
	L.easyButton('<i class="fa fa-users"></i>', () => TogetherJS(this)).addTo(map);
	// animation
	function toggleAnimation() {
		animationRunning = !animationRunning;
		d3.select('.fa-play-circle,.fa-stop-circle').classed('fa-play-circle', !animationRunning).classed('fa-stop-circle', animationRunning);
		events.animate(animationRunning);
	}
	events.on('animateEnd.button', () => {
		animationRunning = false;
		d3.select('.fa-play-circle,.fa-stop-circle').classed('fa-play-circle', !animationRunning).classed('fa-stop-circle', animationRunning);
	});
	L.easyButton('<i class="fa fa-play-circle"></i>', toggleAnimation).addTo(map);


	(new L.Control.EasyBar([
		L.easyButton('<i class="fa fa-chart-bar" data-mode="bar"></i>', () => setVisMode('bar')),
		L.easyButton('<i class="fa fa-power-off" data-mode="consumption"></i>', () => setVisMode('consumption')),
		L.easyButton('<i class="fa fa-sun" data-mode="solar"></i>', () => setVisMode('solar'))
	])).addTo(map);

	
	L.easyButton('<i class="fa fa-cut"></i>', toggleCuttingPlane).addTo(map);

	
	// events.on('selectGranularity.dataMode', (granularity) => {
	// 	const enabled = granularity.attr === granularities[0].attr;
	// 	Array.from(document.querySelectorAll('.fa[data-mode]')).forEach((d) => {
	// 		d.parentElement.parentElement.classList.toggle('toggle-disabled', !enabled);
	// 	});
	// });

	
	return map;
}

function generateWeatherChart() {
	const margin = {top: 5, right: 90, bottom: 30, left: 20};
	const width = document.getElementById("info-panel").clientWidth - margin.left - margin.right;
	const height = document.getElementById("info-panel").clientHeight - margin.top - margin.bottom;

	const svg = d3.select("#weather-chart")
					 .attr("width", width + margin.left + margin.right)
					 .attr("height", height + margin.top + margin.bottom)
					 .append("g")
					 .attr("id","weather-chart-group")
					 .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

	const formatMonth = d3.time.format('%b');
	const formatYear = d3.time.format('%Y');

	const x = d3.time.scale().range([0, width]);
	const y = d3.scale.linear().range([height, 0]);
	const color = d3.scale.category10();

	const xAxis = d3.svg.axis()
		.scale(x)
		.orient("bottom")
		.tickFormat((date) => d3.time.year(date) < date ? formatMonth(date) : formatYear(date));

	const yAxis = d3.svg.axis()
		.scale(y)
		.orient("left")
		.ticks(6);

	const line = d3.svg.line()
		.x((d) => x(d.date))
		.y((d) => y(d.para_value));
	
	function renderChart(weather_parameters) {	  
		svg.append("g")
			.attr("class", "x_axis")
			.attr("transform", "translate(0," + height + ")")
			.call(xAxis);

		svg.append("g")
			.attr("class", "y_axis")
			.call(yAxis)
			.append("text")
			.attr("transform", "rotate(-90)")
			.attr("y", 10)
			.attr("dy", ".71em")
			.style("text-anchor", "end")
			.text("Temperature");

		const info = svg.selectAll(".weather_parameters")
			.data(weather_parameters)
			.enter().append("g")
			.attr("class", "weather_parameters");

		info.append("path")
			.attr("class", "line")
			.attr("d", (d)  => line(d.values))
			.style("stroke", (d) => color(d.name));

		info.append("text")
			.datum((d) => ({name: d.name, value: d.values[d.values.length-1]}))
			.attr("transform", (d) => `translate(${x(d.value.date)},${y(d.value.para_value)})`)
			.attr("x", 3)
			.attr("dy", ".35em")
			.text((d)  => d.name);

		info.selectAll("circle")
			.data((d) => d.values)
			.enter()
			.append("circle")
			.attr("r",4)
			.attr("cx", (d) => x(d.date))
			.attr("cy", (d) => y(d.para_value))
			.style("fill", (d, i, j) => color(weather_parameters[j].name))
			.append('title').text((d) => d.para_value);
	}

	d3.csv("./data/meanMonthlyTemp.csv", function(error, data) {
		if (error) throw error;

		data.forEach((d) => {
			d.date = parseDate(d.date);
		});
		
		const weather_parameters = Object.keys(data[0]).filter((d) => d !== 'date').map((name) => {
			return {
				name: name,
				values: data.map((d) => ({date: d.date, para_value: +d[name]}))
			};
		});

		color.domain(weather_parameters.map((d) => d.name));
		x.domain(d3.extent(data, (d) => d.date))
		y.domain([
			4,
			d3.max(weather_parameters, (c) => d3.max(c.values, (v) => v.para_value))
		]);
			
		renderChart(weather_parameters);
	});

	d3.select(".close").on("click", () => d3.select("#info-panel").style("display","none"));
}

function toggleWeather() {
	d3.select("#info-panel").style("display", "block");//generating weather charts

	if (d3.select("#weather-chart .weather_parameters").empty()) {	
		generateWeatherChart();
	}
}

window.addEventListener('resize', () => events.resize());
 

d3.json("./Feature-withnetwork.geojson", function (data) { 	
	buildings = data.features.filter((d) => !d.properties.id.includes('NetworkLine'));
	networkLines = data.features.filter((d) => d.properties.id.includes('NetworkLine'));
	
	d3.csv("./data/daily.csv", (csv) => {	
		// integrate building data
		dates = csv.map((d) => parseDate(d.date));
		buildings.forEach((building) => {
			const name = (building.properties.name || '').toLowerCase();
			building.daily = dates.map((date, i) => ({date: date, value: parseFloat(csv[i][name])}))

			function aggregate(toKey) {
				const agg = d3.nest().key((d) => toKey(d.date)).entries(building.daily);
				return agg.map((d) => {
					const values = d.values.filter((d) => !isNaN(d.value)).map((d) => d.value);
					const value = d3.sum(values);
					return {
						date: toKey.parse(d.key),
						values: d.values,
						value: value === 0 ? NaN : value,
						mean: values.length === 0 ? NaN : d3.mean(values),
						median: values.length === 0 ? NaN : d3.median(values)
					};
				});
			}
			building.weekly = aggregate(d3.time.format('%Y-%U'));
			building.monthly = aggregate(d3.time.format('%Y-%m'));
			building.yearly = aggregate(d3.time.format('%Y'));
		});

		events.init();
	})
});

events.on('init', () => {
	relevantBuildings = buildings.filter((d) => d.properties.name !== 'building_62' && d.properties.phase_1 === 'yes');
	granularities.forEach((gran) => {
		gran.max = d3.max(relevantBuildings, (b) => d3.max(b[gran.attr], (d) => d.value));
		gran.start = gran.interval.floor(dates[0]);
		gran.end = gran.interval.floor(dates[dates.length - 1]);
	});

	// default mode
	setVisMode('bar');
	//initSlider(toFromYear, '#slider');
	
	selectedScale.domain([0, selectedGranularity.max]);
	initSlider(selectedGranularity, `#slider-${selectedGranularity.attr} .slider-widget`, selectedGranularity.start, selectedGranularity.end);

	updateLegend();
});

d3.selectAll('.slider-level-down').on('click', function () {
	const elem = this;
	const target = elem.closest('.slider').nextElementSibling.dataset.granularity;
	const base = granularities.find((d) => d.attr === target);
	const next = Object.assign({}, base, {
		start: base.interval.floor(selectedDate),
		end: base.interval.offset(base.interval.floor(selectedGranularity.interval.offset(selectedDate, 1)), -1),
		parents: selectedGranularity.parents.concat([selectedGranularity])
	});
	setGranularity(next);
});
d3.selectAll('.slider-close').on('click', function () {
	const elem = this;
	const target = elem.closest('.slider').previousElementSibling.dataset.granularity;
	setGranularity(selectedGranularity.parents.find((d) => d.attr === target));
});

function setGranularity(newGranularity) {
	if (selectedGranularity.attr === newGranularity.attr && selectedGranularity.start.getTime() === newGranularity.start.getTime() && selectedGranularity.end.getTime() === newGranularity.end.getTime()) {
		return;
	}

	document.querySelector('.sliders').dataset.granularity = newGranularity.attr;
	// disable old
	document.querySelector(`#slider-${selectedGranularity.attr} .slider-widget`).setAttribute('disabled', true);
	
	selectedGranularity = newGranularity;

	selectedScale.domain([0, selectedGranularity.max]);
	initSlider(selectedGranularity, `#slider-${selectedGranularity.attr} .slider-widget`, selectedGranularity.start, selectedGranularity.end);
	updateLegend();

	events.selectGranularity(selectedGranularity);

	setSelectedDate(selectedGranularity.round(selectedDate));
}

function setSelectedDate(newDate) {
	if (selectedDate && newDate.getTime() === selectedDate.getTime()) {
		return;
	}

	selectedDate = newDate;
	events.select(newDate, selectedGranularity);
}

function setSelectedBuilding(name) {
	if (name === selectedBuilding) {
		name = null;
	}

	selectedBuilding = name;
	events.selectBuilding(selectedBuilding);
}

function setVisMode(mode) {
	if (selectedVisMode === mode) {
		return;
	}
	// if (selectedGranularity.attr !== granularities[0].attr) {
	// 	return; // not allowed to changed
	// }
	selectedVisMode = mode;
	events.selectVisMode(mode);

	Array.from(document.querySelectorAll('.fa[data-mode]')).forEach((d) => {
		d.parentElement.parentElement.classList.toggle('toggle-selected', d.dataset.mode === mode);
	});
}


function initSlider(granularity, selector, firstDate, lastDate) {
	const elem = document.querySelector(selector);
	if (elem.noUiSlider) {
		elem.removeAttribute('disabled');
		elem.noUiSlider.destroy();
	}
	const slider = noUiSlider.create(elem, {
		behavior: 'tap-drag',
		// Create two timestamps to define a range.
		range: {
			min: granularity.from(firstDate),
			max: granularity.from(lastDate)
		},
		step: 1,
		connect: true,
		start: [selectedDate || firstDate],
		format: granularity,
		tooltips: {
			to: granularity.str.bind(granularity)
		},
		// Show a scale with the slider
		pips: {
			mode: 'count',
			stepped: true,
			density: 2,
			values: granularity.attr === 'monthly' ? 4 : 7,
			format: {
				to: granularity.str.bind(granularity)
			}
		}
	});

	let disableListener = false;
	
	slider.on('update', (values) => {
		if (disableListener) {
			return;
		}
		const value = values[0];
		setSelectedDate(value);
	});
	events.on('select.' + selector, (date) => {
		if (!sendByTogetherJSPeer) {
			return;
		}
		disableListener = true;
		slider.set([date]);
		disableListener = false;
	});

	let animateTimer = -1;

	events.on('animate.slider', (animationRunning) => {
		if (granularity.attr !== selectedGranularity.attr || !animationRunning) {
			// just the lowest level
			if (animateTimer > -1) {
				clearTimeout(animateTimer);
				animateTimer = -1;
			}
			return;
		}
		const range = d3.range(granularity.from(firstDate), granularity.from(lastDate) + 1, 1);
		const interval = 1000; //10000 / (range.length - 1); // 1sec per step
		function set() {
			const v = range.shift();
			const date = granularity.to(v);
			if (!animationRunning) {
				return;
			}
			slider.set([date]);
			setSelectedDate(date, granularity);

			if (range.length > 0) {
				animateTimer = setTimeout(set, interval)
			} else {
				events.animateEnd();
			}
		}
		//animateTimer = setTimeout(set, interval);
		set();
	});
}

function updateLegend() {
	const scale = d3.scale.linear().domain([0, 100]).range(selectedScale.domain());
	const ticks = scale.ticks(20);

	d3.select('#legend')
		.style('background', `linear-gradient(to right, ${ticks.map((d) => `${colorcode(scale(d))} ${d}%`).join(',')})`)
		.attr('data-min', 0)
		.attr('data-max', d3.format('.5s')(scale.range()[1]));
}

//togetherjs config //
window.TogetherJSConfig = {
	cloneClicks: "#info-panel",
	suppressJoinConfirmation: true,
	dontShowClicks: true,
};


// sync selection event
TogetherJSConfig.hub_on = {
	select: (msg) => {
		sendByTogetherJSPeer = true;
		setSelectedDate(new Date(msg.date));
		sendByTogetherJSPeer = false;
	},
	selectGranularity: (msg) => {
		sendByTogetherJSPeer = true;
		const g = granularities.find((d) => d.attr === msg.granularity);
		const next = Object.assign({}, g, {
			start: new Date(msg.start),
			end: new Date(msg.end),
			parents: selectedGranularity.parents.concat([selectedGranularity])
		});
		setGranularity(next);
		sendByTogetherJSPeer = false;
	},
	selectBuilding: (msg) => {
		sendByTogetherJSPeer = true;
		setSelectedBuilding(msg.name);
		sendByTogetherJSPeer = false;
	},
	selectVisMode: (msg) => {
		sendByTogetherJSPeer = true;
		setVisMode(msg.mode);
		sendByTogetherJSPeer = false;
	},
	'togetherjs.hello': () => {
		// added a new peer, sync the selectedDate
		console.log('peer added');
		if (selectedDate) {
			TogetherJS.send({
				type: 'select',
				date: selectedDate.getTime(),
				granularity: selectedGranularity.attr,
				start: selectedGranularity.start.getTime(),
				end: selectedGranularity.end.getTime()
			});
		}
	}
};
events.on('select.together', (date, granularity) => {
	if (TogetherJS.running && !sendByTogetherJSPeer) {
		TogetherJS.send({
			type: 'select',
			date: date.getTime(),
			granularity: granularity.attr,
			start: granularity.start.getTime(),
			end: granularity.end.getTime()
		});
	}
});
events.on('selectBuilding.together', (name) => {
	if (TogetherJS.running && !sendByTogetherJSPeer) {
		TogetherJS.send({type: 'selectBuilding', name: name});
	}
});
events.on('selectGranularity.together', (granularity) => {
	if (TogetherJS.running && !sendByTogetherJSPeer) {
		TogetherJS.send({
			type: 'selectGranularity',
			granularity: granularity.attr,
			start: granularity.start.getTime(),
			end: granularity.end.getTime()
		});
	}
});
events.on('selectVisMode.together', (mode) => {
	if (TogetherJS.running && !sendByTogetherJSPeer) {
		TogetherJS.send({type: 'selectVisMode', mode: mode});
	}
});
events.on('toggleCuttingPlane.together', (enabled) => {
	if (TogetherJS.running && !sendByTogetherJSPeer) {
		TogetherJS.send({type: 'toggleCuttingPlane', enabled: enabled});
	}
});


TogetherJSConfig_on_ready = () => {
	const base = document.querySelector('#togetherjs-share');

	if (base.querySelector('img')) {
		return; // already added
	}
	const el = kjua({
		text: TogetherJS.shareUrl(),
		size: 200,
	});
	base.appendChild(el);
};

function findSelectedConsumption(building) {
	return building[selectedGranularity.attr].find((d) => d.date.getTime() == selectedDate.getTime());
}

function computeConsumptionColor(d) {
	if (!selectedDate) {
		return 'white';
	}
	const consumption = findSelectedConsumption(d);
	if (consumption == null || isNaN(consumption.value)) {
		return 'white';
	}
	if (consumption.value === 0) {
		return 'lightgray';
	}
	return colorcode(consumption.value);
}

function computeConsumptionText(d) {
	if (!selectedDate || d.properties.phase_1 !== 'yes') {
		return `${d.properties.name ? d.properties.name.toUpperCase() : '???'}: ${d.properties.other_tags}`;
	}
	const consumption = findSelectedConsumption(d);
	const consumptionText = (consumption == null || isNaN(consumption.value)) ? 'NA' : numberFormat(consumption.value);
	return `${d.properties.name ? d.properties.name.toUpperCase() : '???'} (${consumptionText}): ${d.properties.other_tags}`;
}

function colorcode(consumption) {
    //console.log(Consumption);
    if(typeof consumption === 'undefined'){
        return "white";
    }
    if (consumption === 0){
        return "lightgray";
	}
	
	return selectedScale(consumption);
}

// function dragAble(selector) {
// 	const item = d3.select(selector);
	
// 	item.call(d3.behavior.drag()
// 		// .origin(function () {
// 		// 	return this.parentElement.parentElement;
// 		// })
// 		.on('drag', function () {
// 			const m = d3.mouse(this.parentElement);
// 			const parent = d3.select(this.parentElement);

// 			parent.style('left', d3.event.x);
// 			parent.style('top', d3.event.y);
// 		})
// 	)
// }

// dragAble('.slider-mover');

d3.select('#slider').classed('mobile', isMobileVersion);