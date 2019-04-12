//togetherjs config //
TogetherJSConfig_cloneClicks = "#info-panel";

let bearing = 0;
let dates = [];
let buildings = [];

const parseDate = d3.time.format("%Y%m%d").parse;

const buildingsOverlay = L.d3SvgOverlay((selection, proj) => {
	const upd = selection.classed('buildings', true).selectAll('path.building').data(buildings);
	
	const updEnter = upd.enter()
		.append('path')
		.classed('building', true)

	updEnter.append('title');

	upd
		.classed('phaseN', (d) => d.properties.phase_1 !== 'yes')
		.attr('id', (d) => d.properties.name)
		.attr('d', proj.pathFromGeojson)
		.attr('stroke-width', 1 / proj.scale);
	upd
		.select('title')
		.text((d) => `${d.properties.name ? d.properties.name.toUpperCase() : '???'}: ${d.properties.other_tags}`);

	upd.exit().remove();
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



//adding pattern definition
d3.select("svg").append('defs').append("pattern")
                               .attr({id:"diagonal-stripe-3",patternUnits:"userSpaceOnUse",width:"5",height:"5"})
                               .append('path')
							    .attr('d', 'M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2')
							    .attr('stroke', '#000000')
							    .attr('stroke-width', 0.2)
							    .attr('fill','none');




d3.select(".close").on("click", function(){d3.select("#info-panel").style("display","none")});


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
L.easyButton('<img src="images/weather.png">', toggleWeather).addTo(map);

// testing collaborative js
L.easyButton('<img src="images/collaborative.png">', () => TogetherJS(this)).addTo(map);


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

		//console.log(buildings);
		buildingsOverlay.addTo(map);
		initSlider();
	})
});

function initSlider() {
	const global_mean = d3.mean(buildings, (d) => d3.mean(d.data, (d) => d.value));
	const global_max = d3.max(buildings, (d) => d3.max(d.data, (d) => d.value));
	
	const width = document.getElementById('map-canvas').offsetWidth;
	//console.log(width);
	
	const x = d3.time.scale().domain([dates[0], dates[dates.length - 1]]).range([0, width - 50]).clamp(true);
	
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
	handle.call(d3.behavior.drag().on('drag', () => {
		const px = d3.event.x;
		const value = d3.time.month.round(x.invert(px));
		handle.attr('cx', x(value));
		console.log(px, value);

		// update the buildings
		d3.select('.buildings').selectAll('.building:not(.phaseN)').style('fill', (d) => {
			const consumption = d.data.find((d) => d.date.getTime() == value.getTime());
			if (consumption == null || isNaN(consumption.value)) {
				return 'white';
			}
			if (consumption.value === 0) {
				return 'ligtgray';
			}
			return colorcode(consumption.value, 0, global_max, global_mean);
		});
	}));

	//slider animation introduction
	// slider.call(brush.event).transition().delay(20).duration(10000).call(brush.extent([17, 17])).call(brush.event);
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