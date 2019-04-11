//togetherjs config //
TogetherJSConfig_cloneClicks = "#info-panel";

let global_max;
let global_min;
let global_mean;
let bearing = 0;
const building_no = [1,2,3,4,5,50,6,61,67,68,7,73,84,87,88,89,90,9,92,62];
let buildings = [];

const buildingsOverlay = L.d3SvgOverlay((selection, proj) => {
	const upd = selection.selectAll('path.building').data(buildings);
	
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
		.text((d) => `${d.properties.name.toUpperCase()}: ${d.properties.other_tags}`);

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

function toggleWeather() {
	d3.select("#info-panel").style("display","block");//generating weather charts
		
		//generate the chart if it doesn't exist, otherwise just hide it
		if(d3.select("#weather-chart").attr("width")==null){
			 // set the dimensions and margins of the graph
		var margin = {top: 5, right: 90, bottom: 30, left: 20},
		width = document.getElementById("info-panel").clientWidth - margin.left - margin.right,
		height = document.getElementById("info-panel").clientHeight - margin.top - margin.bottom;
		var svg = d3.select("#weather-chart")
						 .attr("width", width + margin.left + margin.right)
						 .attr("height", height + margin.top + margin.bottom)
						 .append("g")
						 .attr("id","weather-chart-group")
						 .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

		var parseDate = d3.time.format("%Y%m%d").parse;

		var x = d3.time.scale().range([0, width]);


		var y = d3.scale.linear().range([height, 0]);

		var color = d3.scale.category10();

		var xAxis = d3.svg.axis()
		    .scale(x)
		    .orient("bottom")
		    .tickFormat(function(date){
				    if (d3.time.year(date) < date) {
				      return d3.time.format('%b')(date);
				    } else {
				      return d3.time.format('%Y')(date);
				    }
		            });
		   

		var yAxis = d3.svg.axis()
		    .scale(y)
		    .orient("left")
		    .ticks(6);

		var line = d3.svg.line()
		    .x(function(d) { return x(d.date); })
		    .y(function(d) { return y(d.para_value); });

		d3.csv("./data/meanMonthlyTemp.csv", function(error, data) {

				  if (error) throw error;
				
				  color.domain(d3.keys(data[0]).filter(function(key) { return (key !== "date")&&(key !== "Month")&&(key !== "Year"); }));
				 
				  data.forEach(function(d) {
				  
				    d.date = parseDate(d.date);
				  });

				   

				  var weather_parameters = color.domain().map(function(name) {
				    return {
				      name: name,
				      values: data.map(function(d) {
				        return {date: d.date, para_value: +d[name]};
				      })
				    };
				  });
		        
		          //console.log(weather_parameters);

				  x.domain(d3.extent(data, function(d) { return d.date; }));

				  y.domain([
				    4,
				    d3.max(weather_parameters, function(c) { return d3.max(c.values, function(v) { return v.para_value; }); })
				  ]);

		       
				  
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

				  var info = svg.selectAll(".weather_parameters")
				      .data(weather_parameters)
				      .enter().append("g")
				      .attr("class", "weather_parameters");

				  info.append("path")
				      .attr("class", "line")
				      .attr("d", function(d) { return line(d.values); })
				      .style("stroke", function(d) { return color(d.name); });

				  info.append("text")
				      .datum(function(d) { return {name: d.name, value: d.values[d.values.length-1]}; })
				      .attr("transform", function(d) { return "translate(" + x(d.value.date) + "," + y(d.value.para_value) + ")"; })
				      .attr("x", 3)
				      .attr("dy", ".35em")
				      .text(function(d) { return d.name; });

				  info.selectAll("circle")
				      .data(function(d){return d.values})
				      .enter()
				      .append("circle")
				      .attr("r",4)
		              .attr("cx", function(d){return x(d.date);})
		              .attr("cy", function(d){return y(d.para_value);})
		              .style("fill", function(d,i,j){return color(weather_parameters[j].name);});
		});


		}

	
}

// adding rotation control
L.easyButton('<img src="images/rotation.png">', setBearing).addTo(map);

// adding additional info panel 
L.easyButton('<img src="images/weather.png">', toggleWeather).addTo(map);

// testing collaborative js
L.easyButton('<img src="images/collaborative.png">', () => TogetherJS(this)).addTo(map);


d3.json("./features-edit.geojson", function(data) { 
  	buildings = data.features; 
  	//console.log(buildings);
	buildingsOverlay.addTo(map);
});

var width = document.getElementById('map-canvas').offsetWidth;
//console.log(width);
var x = d3.scale.linear().domain([6,17]).range([0, width-50]).clamp(true);
var brush = d3.svg.brush().x(x).extent([0, 0]);
 
var slider = d3.select("#slidersvg").attr("width", width).attr("height", 40).append("g").attr("class", "slider").attr("transform","translate(20,10)");
var classflow = slider.append("g").attr("class","classflow");
slider.append("g").attr("class", "x axis").call(d3.svg.axis().scale(x).orient("bottom")
      .tickFormat(function(d) { if (d<=12){return "2016-"+d;}
                                if (d> 12){return "2017-"+(d-12);} } )
      .ticks(12)
      .tickSize(0)
      .tickPadding(12))
      .select(".domain")
      .select(function() { return this.parentNode.appendChild(this.cloneNode(true)); })
      .attr("class", "halo");
var handle = slider.append("circle").attr("class", "handle").attr("r", 10);




d3.csv("./data/consump_all_monthlydailysum.csv", (data) => {

	const buildings_max = [];
    const buildings_min = [];
    const buildings_mean = [];

    building_no.forEach((num) => {
        const key = "Building_" + num;
        const building_data = data.map((d) => parseFloat(d[key]));
        buildings_max.push(d3.max(building_data));
        buildings_min.push(d3.min(building_data));
        buildings_mean.push(d3.mean(building_data));
    });

    global_max = d3.max(buildings_max);
    global_min = d3.min(buildings_min);
    global_mean = d3.mean(buildings_mean);

    brush.on("brush", function(){
        let value = brush.extent()[0];

        if (d3.event.sourceEvent) { // not a programmatic event
            value = x.invert(d3.mouse(this)[0]);
            brush.extent([value, value]);
        }

        handle.attr("cx", x(value));
        const month = Math.round(value);
        for (i=0; i<building_no.length;i++){
            consump = data[month-6]["Building_"+building_no[i]];

            d3.selectAll("#building_" + building_no[i]).attr("fill", colorcode(consump, 0, global_max, global_mean));
        }
    });
 
    slider.call(brush);
});

//slider animation introduction
slider.call(brush.event).transition().delay(20).duration(10000).call(brush.extent([17, 17])).call(brush.event);



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
        return d3.hsv(hue,1,1).toString();
    }

    if(consumption <= 1.5 * mean){ 
        //var hue = (1-(Consumption-min)/(max-min))*0.5;
        var hue = (1-Math.log(consumption)/Math.log(1.5*mean))*0.5;
        return d3.hsv(hue,1,1).toString();
        //console.log(Consumption);	 
    }

    // TODO what color should be used instead?
}