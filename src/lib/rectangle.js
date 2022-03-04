// goog.module('voter.rectangle');

goog.require('goog.color');
goog.require('goog.math');
goog.require('goog.math.Rect');
goog.require('goog.structs.AvlTree');


// // Interpolating Functions

// c positive
// large c gives nearly linear function, small c gives steep sigmoid
function algSigmoidFunction(c) {
    var normConst = Math.sqrt(1+c)/2;

    var f = function(time) {
	var t = goog.math.clamp(time,0,1);
	var x = 2*t - 1;
	var val = normConst*x/Math.sqrt(c + x*x) + 0.5;
	return goog.math.clamp(val,0,1);
    };

    return f;
}

// alpha, beta > 1
function betaDistrFunction(alpha, beta) {
    var a = alpha - 1;
    var b = beta - 1;
    var normConst = Math.pow(a+b,a+b)/(Math.pow(a,a)*Math.pow(b,b));

    var f = function(time) {
	var t = goog.math.clamp(time,0,1);
	var val = Math.pow(t,a)*Math.pow(1-t,b)*normConst;
	return goog.math.clamp(val,0,1);
    };

    return f;
}

// array entries should be lerp-able
function arrayLerp(start, end) {
    var length = Math.min(start.length, end.length);

    var f = function(time) {
	var t = goog.math.clamp(time,0,1);
	var arr = new Array();
	for (var i = 0; i < length; i++) {
	    arr[i] = goog.math.lerp(start[i],end[i],t);
	}
	return arr;
    };

    return f;
}


// // Ordering Utility

function Id() {
    var staticNext = 1;

    this.touch = function(obj) {
	obj.id = staticNext;
	staticNext = staticNext+1;
    };

    this.next = 1;
}

Id.prototype.touch = function(obj) {
    obj.id = this.next;
    this.next = this.next + 1;
};

Id.comparator = function(a,b) {
    return a.id - b.id; // higher id comes second
};


// // Animations

function Animation(f, start, end, unit) {
    // function f takes in a time after the start time and returns a value
    // if the returned value is null, the animation ends
    // otherwise, if the time is after end, the animation also ends
    this.f = f;
    this.start = start;
    this.end = end; // end may be undefined
    this.unit = unit; // 1 unit of time for the purposes of the function
}

Animation.prototype.eval = function(t) {
    return {
	value:this.f((t-this.start)/this.unit),
	done:(this.end == undefined ? false : t >= this.end)
    };
};

Animation.prototype.finish = function() {
    var endTime = (this.end == undefined ? 0 : (this.end - this.start)/this.unit);
    return {
	value:this.f(endTime),
	done:true
    };
};


// // Rectangle

// bb should be a goog.math.Rect(x,y,w,h)
function Rectangle(bb,color,renderContext) {
    this.bb = bb;

    // color
    this.color = goog.color.hexToRgb(color);
    this.colorAnimation = null;

    // highlights
    this.highlights = new goog.structs.AvlTree(Id.comparator);
    this.highlightIds = new Id();

    // rendering context
    this.ctx = renderContext;
}

Rectangle.constants = {
    blendRate: 1,
    hBlendRate: 1,
    hPeak: 0.2,
    hMaxAmount: 0.5,
    hToFrom: 0,
    hTo: 1,
    hFrom: 2
};

Rectangle.prototype.render = function() {
    var highlight = this.getHighlight();
    var color;
    if (highlight == null) {
	color = this.color;
    } else {
	var rColor = this.color;
	var hColor = highlight.color;
	color = new Array();
	// use the "screen" algorithm
	for (var i = 0; i < 3; i++) {
	    color[i] = rColor[i] + hColor[i] - rColor[i]*hColor[i]/255;
	}
	color = goog.color.blend(color, rColor, highlight.amount);
    }
    var roundColor = new Array();
    for (var i = 0; i < 3; i++) {
	roundColor[i] = Math.round(color[i]);
    }
    var hexColor = goog.color.rgbArrayToHex(roundColor);

    this.ctx.fillStyle = hexColor;
    var bb = this.bb;
    this.ctx.fillRect(bb.left,bb.top,bb.width,bb.height);
};

Rectangle.prototype.getHighlight = function() {

    if (this.highlights.getCount() == 0)
	return null;

    var color;
    var amount;

    if (this.highlights.getCount() == 1) {
	// handle the standard case of a single highlight separately
	this.highlights.inOrderTraverse(
	    function(obj) {
		color = obj.color;
		amount = obj.amount;
		return true;
	    }
	);
    } else {
	// otherwise use the general weighting algorithm
	color = [0,0,0];
	amount = 0;
	var totAmount = 0;
	// traverse highlights
	this.highlights.inOrderTraverse(
	    function(obj) {
		amount = Math.max(amount, obj.amount);
		for (var i = 0; i < 3; i++) {
		    color[i] += obj.color[i]*obj.amount;
		}
		totAmount += obj.amount;
	    }
	);
	// renormalize weighted color
	for (var i = 0; i < 3; i++) {
	    color[i] = (totAmount > 0 ? color[i]/totAmount : 0);
	}
    }

    return {
	color:color,
	amount:amount
    };
};

Rectangle.prototype.animateToColor = function(time,duration,color) {
  var rgbColor = goog.color.hexToRgb(color);
  var anim = Rectangle.colorAnimation(time,duration,this.color,rgbColor);

  this.colorAnimation = anim;
};

Rectangle.prototype.animateHighlight = function(time,duration,color) {
    var rgbColor = goog.color.hexToRgb(color);
    var anim = Rectangle.highlightAnimation(time,duration,Rectangle.constants.hToFrom);

    // generate new animating highlight
    var highlight = {color:rgbColor, amount:0.0, animation:anim};
    this.highlightIds.touch(highlight);
    this.highlights.add(highlight);

    return highlight.id;
};

Rectangle.prototype.animateToHighlight = function(time,duration,color) {
    var rgbColor = goog.color.hexToRgb(color);
    var anim = Rectangle.highlightAnimation(time,duration,Rectangle.constants.hTo);

    // generate new animating highlight, only animating to peak
    var highlight = {color:rgbColor, amount:0.0, animation:anim};
    this.highlightIds.touch(highlight);
    this.highlights.add(highlight);

    return highlight.id;
};

Rectangle.prototype.animateFromHighlight = function(time,id,blendRate) {
    // retrieve highlight from tree
    var highlight = null;
    this.highlights.inOrderTraverse(function(obj) {
	if (obj.id = id)
	    highlight = obj;
	return true;
    }, {id:id});

    if (highlight == null)
	return -1;

    // append new animation
    var anim = Rectangle.highlightAnimation(
	time, duration, Rectangle.constants.hFrom, highlight.amount);
    highlight.animation = anim;

    return highlight.id;
};

Rectangle.colorFunction = function(startRgb, endRgb) {
    var f = arrayLerp(startRgb, endRgb);
    return f;
}

Rectangle.colorAnimation = function(startTime,duration,startRgb,endRgb) {
    var f = Rectangle.colorFunction(startRgb, endRgb);

//    var distance = 0;
//    for (var i = 0; i < 3; i++) {
//	distance += Math.pow(endRgb[i] - startRgb[i],2);
//    }
//    distance = Math.sqrt(distance);
//    var maxDistance = 443.406; // = sqrt(3)*256
//    var duration = duration*(distance/maxDistance);

    var animation = new Animation(f, startTime, startTime + duration, duration);
    return animation;
};

Rectangle.highlightFunction = function(proportion, maxHeight) {
    // beta function subject to the additional constraint 1/alpha + 1/beta = 1
    var a = Math.sqrt(proportion/(1-proportion));
    // b = 1/a; alpha = a + 1; beta = b + 1;
    var bDist = betaDistrFunction(a+1, (1/a)+1);
    var height = (maxHeight == undefined ? 1 : goog.math.clamp(maxHeight,0,1));
    var f = function(time) { return height * bDist(time); };
    return f;
};

Rectangle.highlightAnimation = function(startTime,duration,type,maxAmount) {

    if (maxAmount == undefined) {
	maxAmount = Rectangle.constants.hMaxAmount;
    } else {
	maxAmount = goog.math.clamp(maxAmount,0,1);
    }

    var f = Rectangle.highlightFunction(Rectangle.constants.hPeak, maxAmount);

    var hitTime = startTime + duration*Rectangle.constants.hPeak;
    var endTime = startTime + duration;

    var animation = null;
    switch (type) {
    case Rectangle.constants.hToFrom: // animate to and then from
	animation = new Animation(f, startTime, endTime, duration);
	break;
    case Rectangle.constants.hTo: // animate to
	animation = new Animation(f, startTime, hitTime, duration);
	break;
    case Rectangle.constants.hFrom: // animate from
	var delta = (hitTime - startTime)/duration;
	var g = function(t) { return f(t + delta); };
	animation = new Animation(g, startTime, startTime + (endTime - hitTime), duration);
	break;
    }

    return animation;
};

Rectangle.prototype.updateAnimation = function(time) {

    var result = null;

    if (this.colorAnimation != null) {
	result = this.colorAnimation.eval(time);
	this.color = result.value;
	if (result.done) {
	    this.colorAnimation = null;
	}
    }

    var purgeList = null;
    this.highlights.inOrderTraverse(
	function(obj) {
	    if (obj.animation == null)
		return;

	    result = obj.animation.eval(time);
	    obj.amount = result.value;
	    if (result.done) {
		obj.animation = null;
		if (goog.math.nearlyEquals(obj.amount, 0, 0.0001)) {
		    if (purgeList == null) {
			purgeList = new Array();
		    }
		    purgeList.push(obj);
		}
	    }
	} // end anonymous function
    ); // end inOrderTraverse

    if (purgeList != null) {
	for (var i = 0; i < purgeList.length; i++) {
	    this.highlights.remove(purgeList[i]);
	}
    }

    return this.isAnimating();
};

Rectangle.prototype.endAnimation = function() {

    var result = null;

    if (this.colorAnimation != null) {
	result = this.colorAnimation.finish();
	this.color = result.value;
	this.colorAnimation = null;
    }

    var purgeList = null;
    this.highlights.inOrderTraverse(
	function(obj) {
	    if (obj.animation == null)
		return;

	    result = obj.animation.finish();
	    obj.amount = result.value;
	    obj.animation = null;
	    if (goog.math.nearlyEquals(obj.amount, 0, 0.0001)) {
		if (purgeList == null) {
		    purgeList = new Array();
		}
		purgeList.push(obj);
	    }
	} // end anonymous function
    ); // end inOrderTraverse

    if (purgeList != null) {
	for (var i = 0; i < purgeList.length; i++) {
	    this.highlights.remove(purgeList[i]);
	}
    }

    return false; // this.isAnimating()
};

Rectangle.prototype.sync = function() {
    this.endAnimation();
    this.render();
};

Rectangle.prototype.isAnimating = function() {
    if (this.colorAnimation != null)
	return true;

    var highlightAnimating = false;
    this.highlights.inOrderTraverse(
	function(obj) {
	    if (obj.animation != null) {
		highlightAnimating = true;
		return true;
	    }
	    return false;
	}
    );
    return highlightAnimating;
};


// // Timing Loop

function RectangleRenderLoop(canvas, size, color) {
    this.canvas = canvas;
    this.size = size;
    this.color = color;

    var bb = new goog.math.Rect(0,0,size,size);
    this.rectangle = new Rectangle(bb, color, canvas.getContext("2d"));
    this.rectangle.render();

    this.updateRendering();
}

RectangleRenderLoop.prototype.run = function() {
    this.updateRendering();
};

RectangleRenderLoop.prototype.updateRendering = function() {
    var _this = this;

    if (this.rectangle.isAnimating()) {
	var date = new Date();
	var time = date.getTime();
	this.rectangle.updateAnimation(time);
	this.rectangle.render();
    }

    requestAnimFrame(function() {_this.updateRendering();});
};

goog.provide('voter.rectangle')
voter.rectangle.Rectangle = Rectangle
