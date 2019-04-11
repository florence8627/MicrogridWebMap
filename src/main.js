//togetherjs config //
TogetherJSConfig_cloneClicks = "#info-panel";


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

var bearing = 0;
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


//adding pattern definition
d3.select("svg").append('defs').append("pattern")
                               .attr({id:"diagonal-stripe-3",patternUnits:"userSpaceOnUse",width:"5",height:"5"})
                               .append('path')
							    .attr('d', 'M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2')
							    .attr('stroke', '#000000')
							    .attr('stroke-width', 0.2)
							    .attr('fill','none');
var buildings = [];


const buildingsOverlay = L.d3SvgOverlay((selection, proj) => {
    const upd = selection.selectAll('path').data(buildings);
    
    upd.enter()
        .append('path')
        .filter(function(d){return d.properties.phase_1 == 'yes'})
        .attr("id", function (d) {return d.properties.name})
        .attr('d', proj.pathFromGeojson)   
        .attr('fill', "white")
        .attr('fill-opacity', '1')
        .attr('stroke', "orange")
        .attr('stroke-width', 1 / proj.scale)
        .append("title")
        .text(function(d){return d.properties.name.toUpperCase()+": "+d.properties.other_tags});

    upd.enter()
        .append('path')
        .filter(function(d){return d.properties.phase_1!='yes'})
        .attr("id", function (d) {return d.properties.name})
        .attr('d', proj.pathFromGeojson)   
        .attr('fill', "black")
        .attr("fill-opacity","0.1")
        .attr('stroke-width', 1 / proj.scale)
        .append("title")
        .text(function(d){return d.properties.name});
});


var baseMaps = {"Satelite":tiles_satellite, "Symbolic": tiles_dark};
var overlayMaps = {"Buildings": buildingsOverlay};
L.control.layers(baseMaps, overlayMaps).addTo(map);
L.control.scale().addTo(map);
map.addControl(new L.Control.Fullscreen());
var options = {
	lengthUnit:{
		factor: 1000,
		decimal: 2,
		display:'meters',
		label:'Distance'
	}
}
L.control.ruler(options).addTo(map);
// adding rotation control
L.easyButton('<img src="images/rotation.png">', function(btn, map){
    bearing = bearing-1.5;
    map.setBearing(bearing);
}).addTo( map );


// adding additional info panel 
L.easyButton('<img src="images/weather.png">', function(btn,map){
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

		
}).addTo(map);

d3.select(".close").on("click", function(){d3.select("#info-panel").style("display","none")});


// testing collaborative js
L.easyButton('<img src="images/collaborative.png">', function(btn,map){
TogetherJS(this); 
}).addTo(map);


d3.json("features-edit.geojson", function(data) { 
  buildings= data.features; 
  //console.log(buildings);
  buildingsOverlay.addTo(map) 
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

d3.csv("./data/consump_all_monthlydailysum.csv", function(data){

	 building_no = [1,2,3,4,5,50,6,61,67,68,7,73,84,87,88,89,90,9,92,62];
            buildings_max = {}
            buildings_min = {}
            buildings_mean= {}
            for (i=0; i<building_no.length;i++){
               building_data = data.map(function(d){return parseFloat(d["Building_"+building_no[i]])});
	           max_value = d3.max(building_data);
	           min_value = d3.min(building_data);  
	           mean_value = d3.mean(building_data);
	           buildings_max["Building_"+building_no[i]] = max_value;
	           buildings_min["Building_"+building_no[i]] = min_value;
	           buildings_mean["Building_"+building_no[i]] = mean_value;
	          
               }
              global_max = d3.max(Object.values(buildings_max));
              global_min = d3.min(Object.values(buildings_min));
              global_mean = d3.mean(Object.values(buildings_mean));
              console.log(buildings_mean);
              console.log(global_max);
              console.log(global_mean);
    brush.on("brush", function(){
            var value = brush.extent()[0];

            if (d3.event.sourceEvent) { // not a programmatic event
              value = x.invert(d3.mouse(this)[0]);
              brush.extent([value, value]);
              }

            handle.attr("cx", x(value));
            var month = Math.round(value);

          
           

             for (i=0; i<building_no.length;i++){
               consump = data[month-6]["Building_"+building_no[i]];

               d3.selectAll("#building_"+building_no[i]).attr("fill", colorcode(consump, 0, global_max, global_mean));
                

               }
            
                 
                 
              
             });
 
  slider.call(brush);
});

//slider animation introduction
slider.call(brush.event).transition().delay(20).duration(10000).call(brush.extent([17, 17])).call(brush.event);

function colorcode(Consumption, min, max, mean){
   //console.log(Consumption);
  if(typeof Consumption === 'undefined'){
  	return "rgb(250,250,250)";
  }
  if (Consumption== 0){
  	
  	return "rgb(100,100,100)";
  }

 if(Consumption>global_mean){ 
  	  
      var hue = (1-Math.log(Consumption)/Math.log(global_max))*0.5;
	  rgb_color = HSVtoRGB(hue,1,1);
	  //console.log(Consumption);
	  return "rgb("+rgb_color.r+","+rgb_color.g+","+rgb_color.b+")";
	 
  }

  if(Consumption!=0 && typeof Consumption != 'undefined'&& Consumption<=1.5*global_mean){ 
  	  
      //var hue = (1-(Consumption-min)/(max-min))*0.5;
      var hue = (1-Math.log(Consumption)/Math.log(1.5*global_mean))*0.5;
	  rgb_color = HSVtoRGB(hue,1,1);
	  //console.log(Consumption);
	  return "rgb("+rgb_color.r+","+rgb_color.g+","+rgb_color.b+")";
	 
  }
}
function HSVtoRGB(h, s, v) {
    var r, g, b, i, f, p, q, t;
    if (arguments.length === 1) {
        s = h.s, v = h.v, h = h.h;
    }
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}