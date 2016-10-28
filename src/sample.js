var http = require('http');
var gen = require('./extjs-spec-generator');
var fs = require('fs');
var Vinyl = require('vinyl');

var config = {
    type: "model",
    moduleName: "SampleModule",
    dependencyDir: "src/model",
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

var Path = require('path');
var esprima = require('esprima');
var _ = require('underscore');

function resolveDependencies(dir, dependency) {
    var walkSync = function (dir, filelist) {
        files = fs.readdirSync(dir);
        filelist = filelist || [];
        files.forEach(function (file) {
            if (fs.statSync(Path.join(dir, file)).isDirectory()) {
                filelist = walkSync(Path.join(dir, file), filelist);
            }
            else {
                parseFile(Path.join(dir, file), (e) => {
                    if(dependency === dependency.replace('"', ''))
                        console.log(dependency);
                });
                
                filelist.push(file);
            }
        });
        return filelist;
    };

    var list = [];
    walkSync(dir, list);
    return list;
}

//resolveDependencies('src/model', '"Inventory.model.Adjustment"');

// var srFile = fs.readFile(src, 'utf-8', function (err, data) {
//     if (err) {
//         console.log(err);
//         response.end('Error: ' + err);
//     } else {
//         var tree = esprima.parse(data);
//         console.log(getClassName(tree));
//     }
// });

function parseFile(filename, callback) {
    fs.readFile(filename, 'utf-8', function (err, data) {
        if (err) {
            throw err;
        } else {
            var tree = esprima.parse(data);
            className = getClassName(tree);
            callback(className);
        }
    });
}

function getClassName(tree) {
    var className;

    if (tree.body[0] && tree.body[0].expression)
        args = tree.body[0].expression.arguments;
    else {
        invalidFiles.push(file.path);
    }

    if (args) {
        var literal = _.findWhere(args, { type: 'Literal' });
        var objectExp = _.findWhere(args, { type: 'ObjectExpression' });
        var properties = objectExp.properties;
        className = literal.value;
    }
    return className;
}


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