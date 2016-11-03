var http = require('http');
var gen = require('./extjs-spec-generator');
var fs = require('fs');
var Vinyl = require('vinyl');

var config = {
    type: "model",
    moduleName: "SampleModule",
    dependencyDir: "src/model/**/*.js",
    resolveModuleDependencies: true,
    destDir: "src/test/specs",
    formatContent: true,
    dependencyDestDir: "src/test/mock"
};

var src = "src/model/Adjustment.js";

fs.readFile(src, 'utf8', function (err, data) {
    if (err) throw err;

    var file = new Vinyl({
        cwd: '/',
        base: '/',
        path: src,
        contents: new Buffer(data)
    });

    var generated = gen.generateSpecs(file, config);
    fs.writeFile(generated.path, generated.contents, 'utf-8', function (err) {
        if (err)
            console.log(err);
    });

});

// http.createServer(function (request, response) {
//     // Send the HTTP header 
//     // HTTP Status: 200 : OK
//     // Content Type: text/plain
//     response.writeHead(200, { 'Content-Type': 'text/plain' });
//     var path = "";

//     var srFile = fs.open(src, 'r', function (err, fd) {
//         if (err) {
//             console.log(err);
//             response.end('Error: ' + err);
//         } else {
//             //path = gen.generateSpecs(fd, config);
//             path = esprima.parse("function hello() {console.log('dhello')}");
//             console.log(path);
//         }
//     });

//     response.end('Here\'s the generated path: ' + path);
// }).listen(8081);

// Console will print the message
//console.log('Server running at http://127.0.0.1:8081/');