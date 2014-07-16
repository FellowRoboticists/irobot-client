var create = (function() {
  var dsigner = require('dsigner');
  var net = require('net');
  // The actual thing that will get exported from this module
  var module = {};

  // Make sure we get the path to the keys from the environment
  var keyPath = process.env.KEY_PATH;
  if (! keyPath) {
    throw new Error("No KEY_PATH environment variable specified");
  }

  module.go = function(name, port, host, serverName) {
    var client = net.Socket();
    var first = true;

    client.connect(port, host, function() {
      console.log('Connected');
    });

    client.on('data', function(data) {
      var message = verifyServerMessage(serverName, data);
      if (message) {
        if (first) {
          client.write(signMessage(name, formatRegistration(name)));
          first = false;
        } else {
          // At this point we are registered with the telep server so we can
          // start processing serial messages. Each message is a command to 
          // the robot.
          console.log(message);
        }
      } else {
        console.log("Invalid message from server: " + data);
      }
    });

    client.on('close', function() {
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

  function formatRegistration(name) {
    return "robot|" + name;
  }

  return module; // The exported module
}());

module.exports = create;
