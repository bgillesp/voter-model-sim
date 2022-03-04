// goog.module('voter.lattice');

goog.require('goog.structs.AvlTree');

goog.require('voter.rectangle');
Rectangle = voter.rectangle.Rectangle;


// // Lattice

function Lattice(canvas,nx,ny,bounds,colorFunction,highlightColor) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.renderTree = new goog.structs.AvlTree(Id.comparator);
    this.stopped = false;

    this.blendRate = 1;
    this.hBlendRate = 1;

    this.grid = new Array();
    this.nx = nx;
    this.ny = ny;
    this.bb = bounds;
    this.dx = Math.floor(bounds.width/nx);
    this.dy = Math.floor(bounds.height/ny);
    // initialize rectangles
    var id = new Id();
    for (var i = 0; i < this.ny; i++) {
	var row = new Array();
	for (var j = 0; j < this.nx; j++) {
  	  var bb = {left: bounds.left + j*this.dx,
		    top: bounds.top + i*this.dy,
		    width: this.dx,
		    height: this.dy};
	  var rect = new Rectangle(bb, colorFunction(j,i), this.context);
	  id.touch(rect);
	  row[j] = {rectangle:rect, highlight:null};
	}
	this.grid[i] = row;
    }
    this.hColor = highlightColor;
}

Lattice.prototype.run = function() {
  var _this = this;
  var time = (new Date()).getTime();

  for (var i = 0; i < this.ny; i++) {
    for (var j = 0; j < this.nx; j++) {
      var rect = this.grid[i][j].rectangle;
      rect.updateAnimation(time);
      rect.render();
    }
  }

  requestAnimFrame(function() {_this.updateRendering();});
};

Lattice.prototype.stop = function() {
  this.stopped = true;
};

Lattice.prototype.updateRendering = function() {
  var time = (new Date()).getTime();

  var purgeList = null;
  this.renderTree.inOrderTraverse(
    function(rect) {
      var animating = rect.updateAnimation(time);
      if (!animating) {
	if (purgeList == null)
	  purgeList = new Array();
	purgeList.push(rect);
      }
      rect.render();
    }
  );

  if (purgeList != null) {
    for (var i = 0; i < purgeList.length; i++) {
      this.renderTree.remove(purgeList[i]);
    }
  }

  if (!this.stopped) {
    var _this = this;
    requestAnimFrame(function() {_this.updateRendering();});
  }
};

Lattice.prototype.sync = function() {
  this.renderTree.inOrderTraverse(
    function(rect) {
      rect.sync();
    }
  );
  this.renderTree.clear();
};

Lattice.prototype.pickSquare = function(coords) {
  var latX = coords.x - this.bb.left, latY = coords.y - this.bb.top;
  var x = Math.floor(latX/this.dx), y = Math.floor(latY/this.dy);
  return {x:x, y:y};
};

Lattice.prototype.containsCoords = function(gridCoords) {
  return (gridCoords.x < this.nx && gridCoords.y < this.ny &&
	  gridCoords.x >= 0 && gridCoords.y >= 0);
};

Lattice.prototype.changeColor = function(x,y,color) {
  x = goog.math.modulo(x,this.nx);
  y = goog.math.modulo(y,this.ny);
  var rect = this.grid[y][x].rectangle;

  var time = (new Date()).getTime();
  rect.animateToColor(time, 1000/this.blendRate, color);

  this.renderTree.add(rect);
};

Lattice.prototype.blink = function(x,y,time) {
  x = goog.math.modulo(x,this.nx);
  y = goog.math.modulo(y,this.ny);
  var rect = this.grid[y][x].rectangle;

  if (time == undefined)
    time = (new Date()).getTime();
  rect.animateHighlight(time, 1000/this.hBlendRate, this.hColor);

  this.renderTree.add(rect);
};

Lattice.prototype.blinkAll = function(f,time) {
  if (f == undefined)
    f = function(x,y) {return true;};

  if (time == undefined)
    time = (new Date()).getTime();

  for (var i = 0; i < this.ny; i++) {
    for (var j = 0; j < this.nx; j++) {
      if (f(j,i))
	this.blink(j,i,time);
    }
  }
};


goog.provide('voter.lattice')
voter.lattice.Lattice = Lattice
