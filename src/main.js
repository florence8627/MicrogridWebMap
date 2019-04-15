//togetherjs config //
window.TogetherJSConfig = {
	cloneClicks: "#info-panel",
	suppressJoinConfirmation: true
};


// indicator whether the event was triggerd by TogetherJS sync operation
let sendByTogetherJSPeer = false;

let bearing = 0;
// dates that are available
let dates = [];
let global_min = 0;
let global_max = 0;
let global_mean = 0;
// currently selected date
let selectedDate = null;
// list of buildings: { properties: { name: string}, data: {date: Date, value: number}[] }
let buildings = [];

// internal event handler
const events = d3.dispatch('select', 'animate');

const parseDate = d3.time.format("%Y%m%d").parse;

const buildingsOverlay = L.d3SvgOverlay((selection, proj) => {
	updateBuildings = (selectedDate) => {
		const upd = selection.classed('buildings', true).selectAll('path.building').data(buildings);
		const updEnter = upd.enter()
			.append('path')
			.classed('building', true)

		updEnter.append('title');
		upd
			.classed('phaseN', (d) => d.properties.phase_1 !== 'yes')
			.attr('id', (d) => d.properties.name)
			.attr('d', proj.pathFromGeojson)
			.style('fill', (d) => selectedDate == null || d.properties.phase_1 !== 'yes' ? null : computeConsumptionColor(d))
			.style('stroke-width', 1 / proj.scale);
		upd
			.select('title')
			.text((d) => `${d.properties.name ? d.properties.name.toUpperCase() : '???'}: ${d.properties.other_tags}`);

		upd.exit().remove();
	};
	
	events.on('select.buildings', updateBuildings);
	updateBuildings(selectedDate);
});

const map = createMap();

function createMap() {
	// map box tile layer
	const tiles_dark = L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
		attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
		id: 'mapbox.dark',
		maxZoom:30,
		accessToken: 'pk.eyJ1IjoiZmxvcmVuY2U4NjI3IiwiYSI6ImNqb294Mmk1MTAzcGQzcG14cXpqZHh1YmMifQ.ahUeysh9RSQJ4jegcGrr4w'
	});

	const tiles_satellite = L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
		attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
		id: 'mapbox.streets-satellite',
		maxZoom:30,
		accessToken: 'pk.eyJ1IjoiZmxvcmVuY2U4NjI3IiwiYSI6ImNqb294Mmk1MTAzcGQzcG14cXpqZHh1YmMifQ.ahUeysh9RSQJ4jegcGrr4w'
	});

	
	const map = L.map("map-canvas", {
		center: [-37.9109, 145.1344], 
		zoom: 17,
		minZoom: 10,
		maxZoom: 30,
		zoomSnap: 0.0,
		zoomDelta:0.1,
		rotate: false,
		zoomControl: false,
		touchZoom: false,
		touchRotate: false,
		boxZoom: false,
		doubleClickZoom: false,
		dragging: false,
		keyboard: false,
		scrollWheelZoom: false,
		layers: [tiles_satellite,tiles_dark]
	});

	
	const baseMaps = {
		"Satelite": tiles_satellite,
		"Symbolic": tiles_dark
	};
	const overlayMaps = {
		"Buildings": buildingsOverlay
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
	
	return map;
}

d3.select(".close").on("click", () => d3.select("#info-panel").style("display","none"));


function setBearing() {
	bearing = bearing-1.5;
    map.setBearing(bearing);
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
}


function toggleWeather() {
	d3.select("#info-panel").style("display", "block");//generating weather charts

	if (d3.select("#weather-chart .weather_parameters").empty()) {	
		generateWeatherChart();
	}
}

// adding rotation control
// L.easyButton('<img src="images/rotation.png">', setBearing).addTo(map);

// adding additional info panel 
L.easyButton('<img src="images/weather.png" alt="Show Weather Plot">', toggleWeather).addTo(map);

// testing collaborative js
L.easyButton('<img src="images/collaborative.png" alt="Start Collaboration">', () => TogetherJS(this)).addTo(map);
// animation
L.easyButton('<img src="images/rotation.png" alt="Start Animation">', () => events.animate()).addTo(map);


d3.json("./features-edit.geojson", function (data) { 	
	d3.csv("./data/consump_all_monthlydailysum.csv", (csv) => {
		buildings = data.features;

		// integrate building data
		dates = csv.map((d) => parseDate(d.date));
		csv.forEach((row) => {
			Object.keys(row).forEach((key) => row[key.toLowerCase()] = row[key]);
		})
		buildings.forEach((building) => {
			const name = (building.properties.name || '').toLowerCase();
			building.data = dates.map((date, i) => ({date: date, value: parseFloat(csv[i][name])}))
		});
		
		global_mean = d3.mean(buildings, (d) => d3.mean(d.data, (d) => d.value));
		global_min = d3.min(buildings, (d) => d3.min(d.data, (d) => d.value));
		global_max = d3.max(buildings, (d) => d3.max(d.data, (d) => d.value));
		
		//console.log(buildings);
		// build buildings layer
		buildingsOverlay.addTo(map);
		initSlider();
		initLegend();
	})
});


function setSelectedDate(newDate, byOther) {
	if (selectedDate && newDate.getTime() === selectedDate.getTime()) {
		return;
	}

	selectedDate = newDate;
	events.select(newDate, byOther);
} 

function initSlider() {
	
	const width = document.getElementById('map-canvas').offsetWidth;
	//console.log(width);
	
	const firstDate = dates[0];
	const lastDate = dates[dates.length - 1];
	const x = d3.time.scale().domain([firstDate, lastDate]).range([0, width - 50]).clamp(true);
	
	const slider = d3.select("#slidersvg").attr("width", width).attr("height", 40).append("g").attr("class", "slider").attr("transform","translate(20,10)");
	slider.append("g").attr("class", "classflow");
	
	const axis = d3.svg.axis().scale(x).orient("bottom")
		.tickSize(0)
		.tickFormat(d3.time.format('%b %Y'))
		.tickPadding(12);

	slider.append("g").attr("class", "x axis")
		.call(axis)
		.select(".domain")
		.select(function() { return this.parentNode.appendChild(this.cloneNode(true)); })
		.attr("class", "halo");

	const handle = slider.append("circle").attr("class", "handle").attr("r", 10);

	const brush = d3.svg.brush().x(x).extent([firstDate, firstDate]);
	setSelectedDate(firstDate);

	brush.on("brush", function () {
		let value = brush.extent()[0];
		if (d3.event.sourceEvent) { // not a programmatic event
			value = x.invert(d3.mouse(this)[0]);
			brush.extent([value, value]);
		}
		handle.attr("cx", x(value));
		const newDate = d3.time.month.round(value);
		setSelectedDate(newDate);
	});
	slider.call(brush);

	events.on('select.slider', (date) => {
		if (!sendByTogetherJSPeer) {
			return;
		}
		handle.attr("cx", x(date));
		brush.extent([date, date]);
	});

	
	events.on('animate.slider', () => {
		//slider animation introduction
		slider.call(brush.extent([firstDate, firstDate])).call(brush.event).transition().ease('linear').duration(10000).call(brush.extent([lastDate, lastDate])).call(brush.event);
	});
}

function initLegend() {
	const scale = d3.scale.linear().domain([0, 100]).range([0, global_max]);
	const ticks = scale.ticks(20);

	d3.select('#legend')
		.style('background', `linear-gradient(to right, ${ticks.map((d) => `${colorcode(scale(d), 0, global_max, global_mean)} ${d}%`).join(',')})`)
		.attr('data-min', 0)
		.attr('data-max', d3.format('.5s')(global_max));
}

// sync selection event
TogetherJSConfig.hub_on = {
	select: (msg) => {
		sendByTogetherJSPeer = true;
		setSelectedDate(new Date(msg.date));
		sendByTogetherJSPeer = false;
	},
	'togetherjs.hello': () => {
		// added a new peer, sync the selectedDate
		console.log('peer added');
		if (selectedDate) {
			TogetherJS.send({type: 'select', date: selectedDate.toString()});
		}
	}
};
events.on('select.together', (date) => {
	if (TogetherJS.running && !sendByTogetherJSPeer) {
		TogetherJS.send({type: 'select', date: date.toString()});
	}
});


function computeConsumptionColor(d) {
	if (!selectedDate) {
		return 'white';
	}
	const consumption = d.data.find((d) => d.date.getTime() == selectedDate.getTime());
	if (consumption == null || isNaN(consumption.value)) {
		return 'white';
	}
	if (consumption.value === 0) {
		return 'lightgray';
	}
	return colorcode(consumption.value, 0, global_max, global_mean);
}

function colorcode(consumption, min, max, mean){
    //console.log(Consumption);
    if(typeof consumption === 'undefined'){
        return "white";
    }
    if (consumption === 0){
        return "lightgray";
    }

    if(consumption > mean){   	  
        var hue = (1 - Math.log(consumption) / Math.log(max)) * 0.5;
        return d3.hsl(hue * 360,1, 0.5).toString();
    }

    if(consumption <= 1.5 * mean){ 
        //var hue = (1-(Consumption-min)/(max-min))*0.5;
        var hue = (1-Math.log(consumption)/Math.log(1.5*mean))*0.5;
        return d3.hsl(hue * 360,1, 0.5).toString();
        //console.log(Consumption);	 
    }

    // TODO what color should be used instead?
}