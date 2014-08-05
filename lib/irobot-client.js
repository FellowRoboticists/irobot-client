var create = (function() {
  var SysLogger = require('ain2');
  var dsigner = require('dsigner');
  var net = require('net');
  var events = require('events');
  var robot = require('create-oi');

  // Set up the rsyslog logger
  var logger = new SysLogger({tag: 'irobot-client', facility: 'local3'});

  // The actual thing that will get exported from this module
  var module = {};

  // Define the robot state machine/event emitter
  function RobotCommander() {
    events.EventEmitter.call(this);

    var telepConnected = false;
    var iRobotConnected = false;
    var iRobotDriveable = false;
    this.speed = 100; // 100mm/s
    this.speedIncrement = 20; // 20mm/s
    this.currentCommand = null;
    this.previousCommand = null;

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
        if (command != this.currentCommand) {
          this.previousCommand = this.currentCommand;
          this.currentCommand = command;
        }
        switch (command) {
          case 'forward':
            this.emit('forward')
            break;
          case 'backward':
            this.emit('backward')
            break;
          case 'speed_up':
            this.speed += this.speedIncrement;
            this.emit('speed_up')
            break;
          case 'slow_down':
            this.speed -= this.speedIncrement;
            if (this.speed < 0) { this.speed = 0; }
            this.emit('slow_down')
            break;
          case 'stop':
            this.emit('stop')
            break;
          case 'rotate_cw':
            this.emit('rotate_cw')
            break;
          case 'rotate_ccw':
            this.emit('rotate_ccw')
            break;
        }
      }
    };
  }

  RobotCommander.prototype.__proto__ = events.EventEmitter.prototype;

  var commander = new RobotCommander();

  commander.on('forward', function() {
    robot.drive(commander.speed, 0);
  });
  commander.on('backward', function() {
    robot.drive(-commander.speed, 0);
  });
  commander.on('speed_up', function() {
    switch (commander.previousCommand) {
      case 'forward':
        robot.drive(commander.speed, 0);
        break;
      case 'backward':
        robot.drive(-commander.speed, 0);
        break;
    }
  });
  commander.on('slow_down', function() {
    switch (commander.previousCommand) {
      case 'forward':
        robot.drive(commander.speed, 0);
        break;
      case 'backward':
        robot.drive(-commander.speed, 0);
        break;
    }
  });
  commander.on('stop', function() {
    this.speed = 100; // 100mm/s
    robot.drive(0, 0);
  });
  commander.on('rotate_cw', function() {
    robot.rotate(-commander.speed);
  });
  commander.on('rotate_ccw', function() {
    robot.rotate(commander.speed);
  });

  var bumpHandler = function(bumperEvt) {
    // temporarily disable further bump events
    // getting multiple bump events while one is in progress
    // will cause weird interleaving of our robot behavior 
    robot.off('bump');
    // backup a bit
    robot.drive(-commander.speed, 0);
    robot.wait(1000);
    // Stop
    robot.drive(0, 0).then(function() {
      // Re-install the handler
      robot.on('bump', bumpHandler);
      commander.iRobotDriveableState(true);
    });
  }

  commander.on('hitABump', bumpHandler); 

  // Make sure we get the path to the keys from the environment
  var keyPath = process.env.KEY_PATH;
  if (! keyPath) {
    throw new Error("No KEY_PATH environment variable specified");
  }

  module.connectToIRobot = function(tty) {
    robot.init( { serialport: tty });

    robot.on('ready', function() {
      commander.connectedToIRobot(true);
      commander.iRobotDriveableState(true);
    });

    robot.on('bump', function() {
      robot.drive(0, 0);
      commander.hitABump();
    });

    robot.on('wheeldrop', function() {
      // We're in safe-mode so it will stop for us.
      commander.iRobotDriveableState(true);
    });

    robot.on('wall', function() {
      console.log("The Wall!, The Wall!");
    });

    robot.on('wall_signal', function(event) {
      console.log("Wall Signal: " + event.level);
    });

  };

  module.connectToTelep = function(name, port, host, serverName) {
    var client = net.Socket();
    var first = true;

    client.connect(port, host, function() {
      logger.info('Connected to server');
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
        logger.warn("Invalid message from server: " + data);
      }
    });

    client.on('close', function() {
      commander.connectedToTelep(false);
      logger.info('Closed connection to server');
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
