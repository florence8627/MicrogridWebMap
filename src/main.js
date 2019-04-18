const isMobileVersion = new MobileDetect(window.navigator.userAgent).mobile() != null;

// indicator whether the event was triggerd by TogetherJS sync operation
let sendByTogetherJSPeer = false;

let locked = false;
let bearing = -9;
// dates that are available
let dates = [];
let global_monthly_min = 0;
let global_monthly_max = 0;
let global_monthly_mean = 0;
// currently selected date
let selectedDate = null;
let selectedBuilding = null;
let selectedVisMode = null;

// list of buildings: { properties: { name: string}, data: {date: Date, value: number}[] }
let buildings = [];
let networkLines = [];

// internal event handler
const events = d3.dispatch('init', 'select', 'selectBuilding', 'selectVisMode', 'animate', 'resize');

const numberFormat = d3.format('.5s');
const parseDate = d3.time.format("%Y%m%d").parse;

const toFromMonths = {
	from: (date) => date.getFullYear() * 12 + date.getMonth(),
	to: (months) => {
		months = parseInt(months);
		const m = months % 12;
		return new Date((months - m) / 12, m, 1);
	}
};

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
		center: [-37.9115, 145.1344], 
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

	// adding rotation control
	L.easyButton('<i class="fa fa-undo"></i>', setBearing).addTo(map);
	L.easyButton('<i class="fa fa-lock-open"></i>', toggleLock).addTo(map);

	// adding additional info panel 
	L.easyButton('<i class="fa fa-cloud-sun" title="Show Weather Plot"></i>', toggleWeather).addTo(map);

	// testing collaborative js
	L.easyButton('<i class="fa fa-users"></i>', () => TogetherJS(this)).addTo(map);
	// animation
	L.easyButton('<i class="fa fa-play-circle"></i>', () => events.animate()).addTo(map);


	(new L.Control.EasyBar([
		L.easyButton('<i class="fa fa-power-off" data-mode="consumption"></i>', () => setVisMode('consumption')),
		L.easyButton('<i class="fa fa-chart-bar" data-mode="bar"></i>', () => setVisMode('bar')),
		L.easyButton('<i class="fa fa-sun" data-mode="solar"></i>', () => setVisMode('solar')),
	])).addTo(map);

	
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
		
		const buildingsWithoutSwitch = buildings.filter((d) => d.properties.name !== 'building_62' && d.properties.phase_1 === 'yes');
		global_monthly_mean = d3.mean(buildingsWithoutSwitch, (d) => d3.mean(d.monthly, (d) => d.value));
		global_monthly_min = d3.min(buildingsWithoutSwitch, (d) => d3.min(d.monthly, (d) => d.value));
		global_monthly_max = d3.max(buildingsWithoutSwitch, (d) => d3.max(d.monthly, (d) => d.value));

		events.init();
	})
});

events.on('init', () => {
	// default mode
	setVisMode('consumption');
	initSlider();
	initLegend();
});


function setSelectedDate(newDate) {
	if (selectedDate && newDate.getTime() === selectedDate.getTime()) {
		return;
	}

	selectedDate = newDate;
	events.select(newDate);
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
	selectedVisMode = mode;
	events.selectVisMode(mode);

	Array.from(document.querySelectorAll('.fa[data-mode]')).forEach((d) => {
		d.parentElement.parentElement.classList.toggle('toggle-selected', d.dataset.mode === mode);
	});
}


function initSlider() {
	const firstDate = d3.time.month.round(dates[0]);
	const lastDate = d3.time.month.round(dates[dates.length - 1]);

	const format = d3.time.format('%b %Y');

	const formatter = {
		from: (str) => +str,
		to: (months) => format(new Date(months / 12, months % 12, 1))
	};

	const slider = noUiSlider.create(document.querySelector('#slider'), {
		behavior: 'tap-drag',
		// Create two timestamps to define a range.
		range: {
			min: toFromMonths.from(firstDate),
			max: toFromMonths.from(lastDate)
		},
		step: 1,
		connect: true,
		start: [firstDate],
		format: toFromMonths,

		// Show a scale with the slider
		pips: {
			mode: 'count',
			stepped: true,
			density: 2,
			values: 7,
			format: formatter
		}
	});
	
	slider.on('update', (values) => {
		const value = values[0];
		setSelectedDate(value);
	});
	events.on('select.slider', (date) => {
		if (!sendByTogetherJSPeer) {
			return;
		}
		slider.set([date]);
	});

	events.on('animate.slider', () => {
		const range = d3.range(toFromMonths.from(firstDate), toFromMonths.from(lastDate) + 1, 1);
		const interval = 10000 / (range.length - 1);
		function set() {
			const v = range.shift();
			const date = toFromMonths.to(v);
			slider.set([date]);
			setSelectedDate(date);

			if (range.length > 0) {
				setTimeout(set, interval)
			}
		}
		setTimeout(set, interval);
	});
}

function initLegend() {
	const scale = d3.scale.linear().domain([0, 100]).range([0, global_monthly_max]);
	const ticks = scale.ticks(20);

	d3.select('#legend')
		.style('background', `linear-gradient(to right, ${ticks.map((d) => `${colorcode(scale(d), 0, global_monthly_max, global_monthly_mean)} ${d}%`).join(',')})`)
		.attr('data-min', 0)
		.attr('data-max', d3.format('.5s')(global_monthly_max));
}

//togetherjs config //
window.TogetherJSConfig = {
	cloneClicks: "#info-panel",
	suppressJoinConfirmation: true
};


// sync selection event
TogetherJSConfig.hub_on = {
	select: (msg) => {
		sendByTogetherJSPeer = true;
		setSelectedDate(new Date(msg.date));
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
			TogetherJS.send({type: 'select', date: selectedDate.getTime()});
		}
	}
};
events.on('select.together', (date) => {
	if (TogetherJS.running && !sendByTogetherJSPeer) {
		TogetherJS.send({type: 'select', date: date.getTime()});
	}
});
events.on('selectBuilding.together', (name) => {
	if (TogetherJS.running && !sendByTogetherJSPeer) {
		TogetherJS.send({type: 'selectBuilding', name: name});
	}
});
events.on('selectVisMode.together', (mode) => {
	if (TogetherJS.running && !sendByTogetherJSPeer) {
		TogetherJS.send({type: 'selectVisMode', mode: mode});
	}
});
TogetherJSConfig_on_ready = () => {
	const base = document.querySelector('#togetherjs-share');

	if (base.querySelector('img')) {
		return; // already added
	}
	const el = kjua({
		text: TogetherJS.shareUrl(),
		size: 280,
	});
	base.appendChild(el);
};
function computeConsumptionColor(d) {
	if (!selectedDate) {
		return 'white';
	}
	const consumption = d.monthly.find((d) => d.date.getTime() == selectedDate.getTime());
	if (consumption == null || isNaN(consumption.value)) {
		return 'white';
	}
	if (consumption.value === 0) {
		return 'lightgray';
	}
	return colorcode(consumption.value, 0, global_monthly_max, global_monthly_mean);
}

function computeConsumptionText(d) {
	if (!selectedDate || d.properties.phase_1 !== 'yes') {
		return `${d.properties.name ? d.properties.name.toUpperCase() : '???'}: ${d.properties.other_tags}`;
	}
	const consumption = d.monthly.find((d) => d.date.getTime() == selectedDate.getTime());
	const consumptionText = (consumption == null || isNaN(consumption.value)) ? 'NA' : numberFormat(consumption.value);
	return `${d.properties.name ? d.properties.name.toUpperCase() : '???'} (${consumptionText}): ${d.properties.other_tags}`;
}

function colorcode(consumption, min, max, mean) {
    //console.log(Consumption);
    if(typeof consumption === 'undefined'){
        return "white";
    }
    if (consumption === 0){
        return "lightgray";
	}
	
	const scale = d3.scale.linear().domain([min, max]).range(['#fee8c8', '#e34a33']).clamp(true);

	return scale(consumption);
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