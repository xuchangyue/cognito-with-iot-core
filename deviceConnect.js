var awsIot = require('aws-iot-device-sdk');

//
// Replace the values of '<YourUniqueClientIdentifier>' and '<YourCustomEndpoint>'
// with a unique client identifier and custom host endpoint provided in AWS IoT.
// NOTE: client identifiers must be unique within your AWS account; if a client attempts 
// to connect with a client identifier which is already in use, the existing 
// connection will be terminated.
//
var device = awsIot.device({
   keyPath: "certificates/f1a8f9623b-private.pem.key",
  certPath: "certificates/f1a8f9623b-certificate.pem.crt",
    caPath: "certificates/AmazonRootCA1.pem",
  //clientId: "ap-northeast-1:0feb8df1-fe1c-47b5-be1b-eaee2e7ad027",
  clientId:"clientA",
      host: "aeb6a5w9er03m-ats.iot.ap-northeast-1.amazonaws.com"
});

//
// Device is an instance returned by mqtt.Client(), see mqtt.js for full
// documentation.
//
device
  .on('connect', function() {
    console.log('connect');
    //device.subscribe('topic_1');
    device.publish('clientA', JSON.stringify({ test_data: 1}));
  });


device
  .on('message', function(topic, payload) {
    console.log('message', topic, payload.toString());
  });