var create = (function() {
  var dsigner = require('dsigner');
  var net = require('net');
  var events = require('events');

  // The actual thing that will get exported from this module
  var module = {};

  // Define the robot state machine/event emitter
  function RobotCommander() {
    events.EventEmitter.call(this);

    var telepConnected = false;
    var iRobotConnected = false;
    var iRobotDriveable = false;

    this.connectedToTelep = function(connected) {
      telepConnected = connected;
    };

    this.connectedToIRobot = function(connected) {
      iRobotConnected = connected;
    };

    this.iRobotDriveableState = function(driveable) {
      iRobotDriveable = driveable;
    };

    this.isIRobotDriveable = function() {
      return iRobotDriveable;
    };

    this.isConnectedToIRobot = function() {
      return iRobotConnected;
    };

    this.isTelepConnected = function() {
      return telepConnected;
    };

    this.hitABump = function() {
      iRobotDriveable = false;
      this.emit('hitABump');
    };

    this.performCommand = function(command) {
      if (iRobotDriveable) {
        this.emit('perform', command);
      }
    };
  }

  RobotCommander.prototype.__proto__ = events.EventEmitter.prototype;

  var commander = new RobotCommander();

  commander.on('perform', function(command) {
    console.log("Perform: " + command);
  });

  commander.on('hitABump', function() {
    console.log("Hit a bump");
    setTimeout(function() {
      console.log("Dealt with the bump");
      commander.iRobotDriveableState(true);
    }, 5000);
  });

  // Make sure we get the path to the keys from the environment
  var keyPath = process.env.KEY_PATH;
  if (! keyPath) {
    throw new Error("No KEY_PATH environment variable specified");
  }

  module.connectToIRobot = function() {
    // Simulate a connection to the iRobot
    iRobotConnect(function() {
      commander.connectedToIRobot(true);
      commander.iRobotDriveableState(true);

      // Now, we'll camp out on a while loop infinitely
      waitForIRobotMessages(function() { console.log("Done with loop"); });
    });
  };

  module.connectToTelep = function(name, port, host, serverName) {
    var client = net.Socket();
    var first = true;

    client.connect(port, host, function() {
      console.log('Connected');
    });

    client.on('data', function(data) {
      var message = verifyServerMessage(serverName, data);
      if (message) {
        if (first) {
          commander.connectedToTelep(true);
          client.write(signMessage(name, formatRegistration(name)));
          first = false;
        } else {
          // At this point we are registered with the telep server so we can
          // start processing serial messages. Each message is a command to 
          // the robot.
          commander.performCommand(message);
        }
      } else {
        commander.connectedToTelep(false);
        console.log("Invalid message from server: " + data);
      }
    });

    client.on('close', function() {
      commander.connectedToTelep(false);
      console.log('Closed');
    });
  }

  // ############################################################
  // Functions to support digital signatures
  // ############################################################

  function verifyServerMessage(name, data) {
    var cmps = data.toString().split('|');
    var message = cmps[0];
    var signature = cmps[1];
    if (dsigner.verifySignatureFor(keyPath, name, message, signature)) {
      return message;
    } else {
      return null;
    }
  }

  function signMessage(name, message) {
    var signature = dsigner.signMessageFor(keyPath, name, message);
    return message + "|" + signature;
  }

  // ############################################################
  // iRobot Create functions
  // ############################################################

  function iRobotConnect(callback) {
    console.log("iRobotConnect");
    callback();
  }

  function invokeHitABump(callback) {
    commander.hitABump();
    callback();
  }

  function waitForIRobotMessages(callback) {
    //while (true) {
      setTimeout(function() {
        invokeHitABump(function() {
          waitForIRobotMessages(callback);
        });
        //commander.hitABump();
      }, randomInt(60000, 120000));
    // }
    //callback();
  }

  // ############################################################
  // Utility functions
  // ############################################################

  function formatRegistration(name) {
    return "robot|" + name;
  }

  function randomInt (low, high) {
    return Math.floor(Math.random() * (high - low) + low);
  }

  return module; // The exported module
}());

module.exports = create;
