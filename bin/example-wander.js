#!/usr/bin/env node
/**
 * This is the example program provided with the create-oi
 * NPM module. It has been modified slightly to deal with
 * the actual serial port to use. I brought in commander
 * to make that a big easier to deal with.
 *
 * Other than that, no substantive changes have been made.
 * Not a very interesting program, but it provides the
 * first connectivity example and - with that - a very
 * successful program.
 */
var program = require('commander');

// Set up the command line arguments
program.
  version('0.1.0').
  option('-t, --tty [tty]', 'Specify the tty used for the serial port. Default \'(/dev/ttyUSB0)\'', '/dev/ttyUSB0').
  parse(process.argv);

if (! program.tty ) {
  console.error("Must specify the TTY");
  process.exit(1);
}

var SPEED = 100; // 100mm/s
var robot = require("create-oi");

robot.init({ serialport: program.tty });

robot.on('ready', function() {
  // start by going forward
  this.drive(SPEED, 0);
});
  
var bumpHndlr = function(bumperEvt) {
  var r = this;
              
  // temporarily disable further bump events
  // getting multiple bump events while one is in progress
  // will cause weird interleaving of our robot behavior 
  r.off('bump');

  // backup a bit
  r.drive(-SPEED, 0);
  r.wait(1000);

  // turn based on which bumper sensor got hit
  switch(bumperEvt.which) {
    case 'forward': // randomly choose a direction
      var dir = [-1,1][Math.round(Math.random())];
      r.rotate(dir*SPEED);
      r.wait(2100); // time is in ms
      break;
    case 'left':
      r.rotate(-SPEED); // turn right
      r.wait(1000);
      break;
    case 'right':
      r.rotate(SPEED); // turn left 
      r.wait(1000);
      break;
  }

  // onward!
  r.drive(SPEED, 0)
    .then(function() {
      // turn handler back on
      r.on('bump', bumpHndlr);
    });
};

robot.on('bump', bumpHndlr);
