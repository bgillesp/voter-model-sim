goog.require('voter.sim');
VOTER = voter.sim.VOTER
VoterSimulation = voter.sim.VoterSimulation;

goog.require('goog.color');

SIM = {};

// html identifiers
var ids = {
    canvas:              'canvas',
    noscriptContainer:   'noscriptContainer',
    initContainer:       'promptContainer',
    simContainer:        'canvasContainer',
    canvasDiv:           'canvasDiv',
    xDimSelector:        'xDimSelector',
    yDimSelector:        'yDimSelector',
    modelSelector:       'modelSelector',
    modelDisplay:        'modelDisplay',
    statesSelector:      'statesSelector',
    colorSchemeSelector: 'colorSchemeSelector',
    sizeSelector:        'sizeSelector',
    startSimulation:     'startSimulation',
    simToolBox:          'toolBox',
    simToolBoxTable:     'toolBoxTable',
    progressSelector:    'progressText',
    progressButton:      'progressButton',
    pauseButton:         'pauseButton',
    newSimulation:       'newSimulation'
};

SIM.ids = ids;

// gui defaults
var defs = {
    dimX:68,
    dimY:48,
    model:0,
    states:2,
    scheme:0,
    tSize:10,
    progSteps:10000,
    progIncr:2000
};

SIM.defs = defs;

// simulation defaults
var simDefs = {
    lambda: 0.05,
    //burnIn: 2000,
    highlight: "#FFFFFF",
    blendRate: 2,
    blink: false
};

SIM.simDefs = simDefs;

// utility components
SIM.drag = {x:-1, y:-1};
SIM.dragging = false;
SIM.paused = false;
SIM.pauseText = {pause:"Pause", resume:"Resume"};


// TODO
// Implement GUI components for initialization, initialize w/ constants
// init: set number of states to the number for the default color scheme
// (X) Unify document IDs in a single place for safe keeping
// Unify selection functions in voter.js
// Generate model on-the-fly, modify canvas to fit
// Add button to start over (explanation text should be always visible with title)


function initSim() {
    // basic GUI components'
    var canvas = document.getElementById(SIM.ids.canvas);
    canvas.onselectstart = function() {return false;};
    SIM.canvas = canvas;

    // retrieve gui components
    var xDimSelector = document.getElementById(SIM.ids.xDimSelector);
    var yDimSelector = document.getElementById(SIM.ids.yDimSelector);
    var modelSelector = document.getElementById(SIM.ids.modelSelector);
    var statesSelector = document.getElementById(SIM.ids.statesSelector);
    var cSchemeSelector = document.getElementById(SIM.ids.colorSchemeSelector);
    var sizeSelector = document.getElementById(SIM.ids.sizeSelector);
    var startSimulationButton = document.getElementById(SIM.ids.startSimulation);
    var progressSelector = document.getElementById(SIM.ids.progressSelector);
    var progressButton = document.getElementById(SIM.ids.progressButton);
    var pauseButton = document.getElementById(SIM.ids.pauseButton);
    var newSimulationButton = document.getElementById(SIM.ids.newSimulation);

    // populate gui components with data

    // model selector
    SIM.models = VOTER["Selection Functions"];
    for (var i1 = 0; i1 < SIM.models.length; i1++) {
	var opt = document.createElement("option");
	modelSelector.add(opt);
	opt.text = SIM.models[i1].name;
	opt.value = i1;
    }
    // color scheme selector
    SIM.cSchemes = VOTER["Color Schemes"];
    for (var i2 = 0; i2 < SIM.cSchemes.length; i2++) {
	var opt = document.createElement("option");
	cSchemeSelector.add(opt);
	opt.text = SIM.cSchemes[i2].name + " (" + SIM.cSchemes[i2].colors.length + " colors)";
	opt.value = i2;
    }

    // set gui default values
    xDimSelector.value = SIM.defs.dimX;
    yDimSelector.value = SIM.defs.dimY;
    modelSelector.selectedIndex = SIM.defs.model;
    updateModelDisplayText();
    statesSelector.value = SIM.defs.states;
    cSchemeSelector.selectedIndex = SIM.defs.scheme;
    sizeSelector.value = SIM.defs.tSize;
    progressSelector.value = SIM.defs.progSteps;
    progressSelector.step = SIM.defs.progIncr;

    // hook up callbacks
    modelSelector.onchange = updateModelDisplayText;
    startSimulationButton.onclick = startSimulation;
    canvas.onmousedown = clickCanvas;
    document.body.onmouseup = releaseCanvas;
    canvas.onmousemove = dragCanvas;
    progressButton.onclick = guiProgress;
    pauseButton.onclick = guiPause;
    newSimulationButton.onclick = newSimulation;

    // make the initialization display visible
    var noscriptContainer = document.getElementById(SIM.ids.noscriptContainer);
    var initContainer = document.getElementById(SIM.ids.initContainer);
    noscriptContainer.style.display = "none";
    initContainer.style.display = "block";
}

function updateModelDisplayText() {
    var modelSelector = document.getElementById(SIM.ids.modelSelector);
    var modelDisplay = document.getElementById(SIM.ids.modelDisplay);

    var modelOption = modelSelector.options[modelSelector.selectedIndex].value;
    var model = SIM.models[modelOption];

    modelDisplay.textContent = model.desc;
}

function startSimulation() {
    // build parameters
    var xDimSelector = document.getElementById(SIM.ids.xDimSelector);
    var xDim = parseInt(xDimSelector.value);

    var yDimSelector = document.getElementById(SIM.ids.yDimSelector);
    var yDim = parseInt(yDimSelector.value);

    var modelSelector = document.getElementById(SIM.ids.modelSelector);
    var modelOption = modelSelector.options[modelSelector.selectedIndex].value;
    var model = SIM.models[modelOption];

    var statesSelector = document.getElementById(SIM.ids.statesSelector);
    var states = parseInt(statesSelector.value);

    var cSchemeSelector = document.getElementById(SIM.ids.colorSchemeSelector);
    var cSchemeOption = cSchemeSelector.options[cSchemeSelector.selectedIndex].value;
    var scheme = SIM.cSchemes[cSchemeOption].colors;

    var sizeSelector = document.getElementById(SIM.ids.sizeSelector);
    var size = parseInt(sizeSelector.value);

    // scrub input numbers
    if (isNaN(xDim*yDim*states*size)) {
	alertUser("A number was not formatted correctly.  Please try again.");
	return;
    } else {
	xDim = Math.round(xDim);
	yDim = Math.round(yDim);
	states = Math.round(states);
	size = Math.round(size);
	if (xDim < 1 || yDim < 1 || states < 1 || size < 1) {
	    alertUser("All numbers should be positive.  Please try again.");
	}
    }

    var width = xDim*size;
    var height = yDim*size;
    var highlight = SIM.simDefs.highlight;
    var blendRate = SIM.simDefs.blendRate;

    var params = {
	dimensions: {x: xDim, y: yDim},
	states: states,
	model: model,
	render: {
	    bounds: {
		left: 0,
		top: 0,
		width: width,
		height: height
	    },
	    fillColors: scheme,
	    highlightColor: SIM.simDefs.highlight,
	    blendRate: SIM.simDefs.blendRate
	},
	lambda: SIM.simDefs.lambda,
        burnIn: xDim*yDim,
	blink: SIM.simDefs.blink
    };

    // update canvas size
    SIM.canvas.width = width;
    SIM.canvas.height = height;
    // update canvas div size
    var canvasDiv = document.getElementById(SIM.ids.canvasDiv);
    canvasDiv.style.width = width + "px";

    // hide initialization container and show simulation container
    var initContainer = document.getElementById(SIM.ids.initContainer);
    var simContainer = document.getElementById(SIM.ids.simContainer);
    initContainer.style.display = "none";
    simContainer.style.display = "block";

    // start simulation
    SIM.sim = new VoterSimulation(SIM.canvas, params);
    SIM.sim.run();
}

function alertUser(text) {
    alert(text);
}

function parseNonnegativeInt(text) {
    var n = parseInt(textField.value);
    if (isNaN(n)) {
	return -1;
    } else {
	return n;
    }
}

function newSimulation() {
    // stop simulation
    if (SIM.paused) {
	guiPause();
    }

    SIM.sim.stop();
    SIM.sim = null;

    // hide simulation container and show initialization container
    var initContainer = document.getElementById(SIM.ids.initContainer);
    var simContainer = document.getElementById(SIM.ids.simContainer);
    simContainer.style.display = "none";
    initContainer.style.display = "block";
}

function guiProgress() {
  var textField = document.getElementById(SIM.ids.progressSelector);
  var n = parseInt(textField.value);
  if (isNaN(n)) {

  } else {
    SIM.sim.progress(n);
  }
}

function guiPause() {
    SIM.paused = !SIM.paused;
    SIM.sim.pause(SIM.paused);
    var pauseButton = document.getElementById(SIM.ids.pauseButton);
    if (SIM.sim.paused) {
	pauseButton.textContent = SIM.pauseText.resume;
    } else {
	pauseButton.textContent = SIM.pauseText.pause;
    }
}

function tweakSim(coords,checkOld) {
  if (checkOld && SIM.drag.x == coords.x && SIM.drag.y == coords.y) {
    return;
  } else {
    if (SIM.sim.display.containsCoords(coords)) {
      var gridSlot = SIM.sim.grid[coords.y][coords.x];
      gridSlot.state = goog.math.modulo(gridSlot.state + 1, SIM.sim.states);
      SIM.sim.updateTileDisplay(gridSlot);
      SIM.sim.display.blink(gridSlot.x, gridSlot.y);
    }
  }
}

function clickCanvas(event) {
    var canvasCoords = getMousePos(event, SIM.canvas);
    var gridCoords = SIM.sim.display.pickSquare(canvasCoords);
    tweakSim(gridCoords, false);
    SIM.drag = gridCoords;
    SIM.dragging = true;
}

function releaseCanvas(event) {
  SIM.dragging = false;
}

function dragCanvas(event) {
    if (SIM.dragging) {
	var canvasCoords = getMousePos(event,SIM.canvas);
	var gridCoords = SIM.sim.display.pickSquare(canvasCoords);
	tweakSim(gridCoords, true);
	SIM.drag = gridCoords;
    }
}

function getMousePos(event, canvas) {
    var rect = canvas.getBoundingClientRect();
    return {
	x: event.clientX - rect.left,
	y: event.clientY - rect.top
    };
}

goog.provide('extern');
extern.entrypoint = initSim;
