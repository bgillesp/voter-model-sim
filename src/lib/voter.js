goog.require('goog.structs.AvlTree');
goog.require('goog.structs.PriorityQueue');
goog.require('goog.math');
goog.require('goog.math.Vec3');
goog.require('goog.events');
goog.require('goog.fx.Animation');
goog.require('goog.color');


goog.require('voter.lattice');
Lattice = voter.lattice.Lattice;

VOTER = {};


var colorSchemes = [{name:"Black and White",
		     colors:["#000000","#FFFFFF"]},
		    {name:"RGB",
		     colors:["#FF0000","#00FF00","#0000FF"]},
		    {name:"Primary",
		     colors:["#000000","#FF0000","#FFFF00","#00FF00",
			     "#00FFFF","#FFFFFF","#FF00FF","#0000FF"]},
		    {name:"Blue Bossa",
		     colors:["#0F0F0F","#2F2F4F","#4F4F8F","#6F6FCF"]},
		    {name:"Lothlorien",
		     colors:["#009900","#22CC22","#33AA00","#CCCC33",
			     "#AA8800","#6666AA"]},
		    {name:"Rock Concert",
		     colors:["#000000","#000099","#DDDD00","#BB0000",
			     "#DDDDDD"]},
		    {name:"Autumn Leaves",
		     colors:["#CC1100","#DD4411","#EE7722","#DDDD11",
			     "#CCBB33","#993300"]},
		    {name:"Pastel Reflection",
		     colors:["#EFEFFF","#CFCFFF","#AFAFFF"]},
		    {name:"Fire and Ice",
		     colors:["#DD1111","#AA1100","#660000","#000077",
			     "#0033BB","#0099DD"]},
		    {name:"American Flag",
		     colors:["#CC0000","#FFFFFF","#000066"]}
];

VOTER["Color Schemes"] = colorSchemes;

// functions are added to this object after being defined
var selectorFunctions = {
    standardModel:{f:null,name:"Standard Model",
		   desc:"In the standard voter model, each voter updates their opinion by selecting a neighboring voter uniformly at random, and adopting their opinion."},
    doubleModel:  {f:null,name:"Double Polling Model",
		   desc:"In the double polling voter model, voters update their opinion by comparing the opinions of two uniformly selected neighboring voters.  If the opinions agree, then the voter adopts this common opinion.  Otherwise, the voter does nothing."},
    fofModel:     {f:null,name:"Friend of Friend Model",
		   desc:"In the friend of a friend voter model, each voter updates their opinion by first selecting a neighboring voter uniformly at random.  The voter then continues by flipping a coin.  If heads, they adopt the opinion of the selected voter.  If tails, they uniformly select a neighbor of this voter, and continue with another coin flip.  This process is repeated until an opinion is adopted."}
};
var selectorFunctionsArr = [
    selectorFunctions.standardModel,
    selectorFunctions.doubleModel,
    selectorFunctions.fofModel
];

VOTER["Selection Functions"] = selectorFunctionsArr;

var defParams = {};
defParams["render"] = {
    "bounds":{
      left:0,
      top:0,
      width:640,
      height:480
    },
    "fillColors":colorSchemes[0].colors,
    "highlightColor":"#FFFFFF",
    "blendRate":1,
};

defParams["model"] = selectorFunctions.standardModel;

defParams["lambda"] = .05;
defParams["states"] = defParams.render.fillColors.length;
defParams["dimensions"] = {"x":64,"y":48};

defParams["burnIn"] = 20000;
defParams["blink"] = false;

VOTER["defParams"] = defParams;

function VoterSimulation(canvas,params) {
    this.canvas = canvas;
    this.voterQueue = new goog.structs.PriorityQueue();

  if (!params) {
    params = VOTER.defParams;
  }
  this.lambda = params.lambda;
  this.states = params.states;
  this.gridX = params.dimensions.x;
  this.gridY = params.dimensions.y;

  this.selectionFunction = params.model.f;
  this.paused = false;

  this.burnIn = params.burnIn;
  this.blink = params.blink;

  this.renderParams = params.render;

  this.grid = new Array();

  this.stopped = false;

  // initialize grid
  for (var i = 0; i < this.gridY; i = i + 1) {
    var row = new Array();
    for (var j = 0; j < this.gridX; j++) {
      var state = goog.math.randomInt(this.states);
      var neighbors = new ProbabilityAggregator();
      var gridSlot = {x:j,y:i,state:state,neighbors:neighbors};
      row[j] = gridSlot;
      }
      this.grid[i] = row;
  }
  // initialize neighbors
  for (var i = 0; i < this.gridY; i = i + 1) {
    for (var j = 0; j < this.gridX; j++) {
      var neighbors = this.grid[i][j].neighbors;
      // neighbors in the cardinal directions
      var px = goog.math.modulo(j+1,this.gridX);
      var mx = goog.math.modulo(j-1,this.gridX);
      var py = goog.math.modulo(i+1,this.gridY);
      var my = goog.math.modulo(i-1,this.gridY);
      neighbors.add(this.grid[i][px], 1);
      neighbors.add(this.grid[i][mx], 1);
      neighbors.add(this.grid[py][j], 1);
      neighbors.add(this.grid[my][j], 1);
    }
  }

  // initialized in the run command
  this.display = null;
};


  // halting command
VoterSimulation.prototype.stop = function() {
    // designed to be irreversible -- a bit trickier to set up reversible
    this.stopped = true;
    this.display.stop();
};


VoterSimulation.prototype.pause = function(indicator) {
  // true to pause, false to restart, undefined to toggle
  if (indicator == undefined) {
    this.paused = !this.paused;
  } else {
    this.paused = indicator;
  }
};

VoterSimulation.prototype.progress = function(n, silent) {
  var u, v, i, gridSlot, result;
  for (i = 0; i < n; i++) {
    u = goog.math.randomInt(this.gridY);
    v = goog.math.randomInt(this.gridX);
    gridSlot = this.grid[u][v];
    result = this.selectionFunction(gridSlot);
    this.grid[u][v].state = result.state;
  }

  if (!silent) {
    this.updateAllTiles();
  }
};

VoterSimulation.prototype.updateAllTiles = function() {
  for (var i = 0; i < this.gridY; i = i + 1) {
      for (var j = 0; j < this.gridX; j++) {
	this.updateTileDisplay(this.grid[i][j]);
      }
    }
};

VoterSimulation.prototype.run = function() {
  // run burn-in steps
  this.progress(this.burnIn, true);

  // enqueue all grid slots
  var time = (new Date()).getTime();
  var i, j;
  for (i = 0; i < this.gridY; i = i + 1) {
    for (j = 0; j < this.gridX; j++) {
      this.enqueue(time, this.grid[i][j], this.lambda);
    }
  }

  // initialize display
  var _this = this;
  var colorFunction = function(x,y) {
    x = goog.math.modulo(x,_this.gridX);
    y = goog.math.modulo(y,_this.gridY);
    var state = _this.grid[y][x].state;
    var colors = _this.renderParams.fillColors;

    state = goog.math.modulo(state,colors.length);
    return colors[state];
  };

  this.display = new Lattice(this.canvas,this.gridX,this.gridY,
			     this.renderParams.bounds,colorFunction,
			     this.renderParams.highlightColor);
  this.display.blendRate = this.renderParams.blendRate;

  // start update sequence
  this.display.run();
  this.updateTiles();
};

VoterSimulation.prototype.updateTileDisplay = function(gridSlot) {
  var colors = this.renderParams.fillColors;
  var state = goog.math.modulo(gridSlot.state,colors.length);
  this.display.changeColor(gridSlot.x,gridSlot.y,colors[state]);
};

VoterSimulation.prototype.blinkTiles = function(gridSlots) {
  for (var i = 0; i < gridSlots.length; i++) {
    var gridSlot = gridSlots[i];
    this.display.blink(gridSlot.x, gridSlot.y);
  }
};

VoterSimulation.prototype.updateTiles = function() {
    var time = (new Date()).getTime();
    var oldTime, gridSlot, result;
    while (this.voterQueue.peekKey() <= time) {
	oldTime = this.voterQueue.peekKey();
	gridSlot = this.voterQueue.dequeue();
	if (!this.paused) {
	  result = this.selectionFunction(gridSlot);
	  if (result.state != gridSlot.state) {
	    gridSlot.state = result.state;
	    this.updateTileDisplay(gridSlot);
	    if (this.blink)
	      this.blinkTiles(result.highlight);
	  }
	}
	this.enqueue(oldTime, gridSlot, this.lambda/2);
    }

    var delay;
    var nextTime = this.voterQueue.peekKey();
    if (nextTime != undefined) {
	delay = Math.max(40, nextTime - time);
    } else {
        delay = 1000;
    }

    if (!this.stopped) {
      var _this = this;
      var timer = setTimeout(function() {_this.updateTiles();}, delay);
    }
};

VoterSimulation.prototype.enqueue = function(currentTime, gridSlot, lambda) {
    if (this.stopped) {
	return;
    }

    var uniform = Math.random();
    var exponential = -Math.log(uniform)/lambda;
    var msDelay = Math.floor(1000*exponential);
    var queueTime = currentTime + msDelay;
    this.voterQueue.enqueue(queueTime,gridSlot);
};

VoterSimulation.pauseSelector = function(gridSlot) {
  return {state:gridSlot.state, highlight:[]};
};

VoterSimulation.standardVoterSelector = function(gridSlot) {
  var n = gridSlot.neighbors.at(Math.random());
  var state = n.state;
  return {state:state, highlight:[n]};
};
selectorFunctions.standardModel.f = VoterSimulation.standardVoterSelector;

VoterSimulation.doubleVoterSelector = function(gridSlot) {
  var n1 = gridSlot.neighbors.at(Math.random());
  var n2 = gridSlot.neighbors.at(Math.random());
  if (n1.state == n2.state) {
    return {state:n1.state, highlight:[n1,n2]};
  } else {
    return {state:gridSlot.state, highlight:[]};
  }
};
selectorFunctions.doubleModel.f = VoterSimulation.doubleVoterSelector;

VoterSimulation.friendOfFriendVoterSelector = function(gridSlot) {
  var f = gridSlot.neighbors.at(Math.random());
  var friends = [f];
  var p = 0.5;
  var num = Math.random();
  while (num < p) {
    f = f.neighbors.at(Math.random());
    friends.push(f);
    num = Math.random();
  }
  return {state:f.state, highlight:friends};
};
selectorFunctions.fofModel.f = VoterSimulation.friendOfFriendVoterSelector;


function ProbabilityAggregator() {
    this.max = 0;
    this.objects = new Array();
    this.weights = new Array();
}

ProbabilityAggregator.prototype.add = function(object,weight) {
    // weight should be positive
    this.objects.push(object);
    this.weights.push(this.max);
    this.max = this.max + weight;
};

ProbabilityAggregator.prototype.at = function(tValue) {
    // tValue in [0,1)
    tValue = tValue * this.max;
    var low = 0;
    var high = this.weights.length;
    var mid, mValue;
    do {
	mid = Math.floor((high + low)/2);
	mValue = this.weights[mid];
	if (mValue > tValue) {
	    high = mid;
	} else {
	    low = mid;
	}
    } while (high > low + 1);
    return this.objects[low];
};


goog.provide('voter.sim');
voter.sim.VOTER = VOTER
voter.sim.VoterSimulation = VoterSimulation
