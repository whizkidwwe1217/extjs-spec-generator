var esprima = require('esprima');
var _ = require('underscore');
var Path = require('path');
var fs = require('fs');
var endOfLine = require('os').EOL;
var beautify = require('js-beautify').js_beautify;
var glob = require('glob');

function generateSpecs(file, config) {
    if (config.formatContent === undefined)
        config.formatContent = true;
    let specType = config.type;
    if (!specType || (specType !== 'model' && specType !== 'store' && specType != 'viewcontroller' && specType !== 'controller' && specType != 'viewmodel')) {
        file.contents = new Buffer("You can delete this file.");
        file.path = config.destDir + "\\trash.tmp";
        //cb(null, file);
        return file;
    }
    let fileContent = file.contents.toString();
    let tree = esprima.parse(fileContent);
    let args = null;
    let invalidFiles = [];
    if (tree.body[0] && tree.body[0].expression)
        args = tree.body[0].expression.arguments;
    else {
        invalidFiles.push(file.path);
    }

    if (args) {
        let className;
        let literal = _.findWhere(args, { type: 'Literal' });
        let objectExp = _.findWhere(args, { type: 'ObjectExpression' });
        if (objectExp) {
            let properties = objectExp.properties;
            if (literal)
                className = literal.value;
            let spec = "", controllerType;
            let generated = null;

            switch (specType) {
                case "model":
                    spec = generateModelSpec(config, className, properties);
                    break;
                case "store":
                    spec = generateStoreSpec(config, className, properties);
                    break;
                case "controller":
                case "viewmodel":
                case "viewcontroller":
                    let extend = _.find(properties, function (p) {
                        return p.key.name === "extend";
                    });
                    if (extend && extend.value.value === "Ext.app.ViewController" && (specType === "viewcontroller" || specType === "controller")) {
                        generated = generateViewControllerSpec(config, className, properties);
                        spec = generated.spec;
                        controllerType = extend.value.value;
                    } else if (extend && extend.value.value === "Ext.app.ViewModel" && (specType === "viewmodel" || specType === "controller")) {
                        spec = generateViewModelSpec(config, className, properties);
                        controllerType = extend.value.value;
                    } else {
                        file.contents = new Buffer(JSON.stringify(invalidFiles));
                        file.path = config.destDir + "\\trash.tmp";
                        //cb(null, file);
                        return file;
                    }
                    break;
                default:
                    break;
            }

            let namespace = config.moduleName + "." + config.type + ".";
            let newPath = parsePath(file.relative);

            if (specType === "model" || specType === "store")
                file.path = `${config.destDir}\\${className.replace(namespace, "").replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}.${config.type.toLowerCase()}.spec.js`;
            else {
                if (controllerType === "Ext.app.ViewController") {
                    file.path = `${config.destDir}\\${className.replace(config.moduleName + ".view.", "").replace("ViewController", "").replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}.viewcontroller.spec.js`;
                } else if (controllerType === "Ext.app.ViewModel") {
                    file.path = `${config.destDir}\\${className.replace(config.moduleName + ".view.", "").replace("ViewModel", "").replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}.viewmodel.spec.js`;
                }
            }
            file.contents = new Buffer(formatContent(config.formatContent, spec));
            // send the updated file down the pipe
            //cb(null, file);
            return file;
        } else {
            file.contents = new Buffer("");
            file.path = config.destDir + "\\trash.tmp";
            //cb(null, file);
            return file;
        }
    }
}

function parsePath(path) {
    let extname = Path.extname(path);
    return {
        dirname: Path.dirname(path),
        basename: Path.basename(path, extname),
        extname: extname
    };
}

function generateModelSpec(config, className, properties) {
    let base, idProperty, fields = [], dependencies = [], validators = [];

    _.each(properties, function (prop) {
        if (prop.type === "Property" && prop.key.type === "Identifier") {
            switch (prop.key.name) {
                case "extend":
                    base = prop.value.value;
                    break;
                case "idProperty":
                    idProperty = prop.value.value;
                    break;
                case "requires":
                    if (prop.value) {
                        _.each(prop.value.elements, function (e) {
                            if (e) dependencies.push(e.value);
                        });
                    }
                    break;
                case "fields":
                    _.each(prop.value.elements, function (e) {
                        let name, type, allowNull = false;
                        _.each(e.properties, function (p) {
                            switch (p.key.name) {
                                case "name":
                                    name = p.value.value;
                                    break;
                                case "type":
                                    type = p.value.value;
                                    break;
                                case "allowNull":
                                    allowNull = p.value.value;
                                    break;
                                default:
                                    break;
                            }
                        });
                        fields.push({
                            name: name,
                            type: type,
                            allowNull: allowNull
                        });
                    });
                    break;
                case "validators":
                    _.each(prop.value.elements, function (e) {
                        let field, type;
                        _.each(e.properties, function (p) {
                            switch (p.key.name) {
                                case "field":
                                    field = p.value.value;
                                    break;
                                case "type":
                                    type = p.value.value;
                                    break;
                                default:
                                    break;
                            }
                        });
                        validators.push({
                            field: field,
                            type: type
                        });
                    });
                    break;
                default:
                    break;
            }
        }
    });

    let spec = `
    UnitTestEngine.testModel({
        name: '${className}',
        base: '${base}',${!_.isUndefined(idProperty) && !_.isNull(idProperty) ? "idProperty: '" + idProperty + "'," : ""}
        dependencies: ${JSON.stringify(dependencies)},
        fields: ${JSON.stringify(fields)},
        validators: [${JSON.stringify(validators)}]
    });
    `;

    writeDependencyFile(config, className, dependencies);

    return spec;
}

function generateStoreSpec(gulpConfig, className, properties) {
    let base, alias, fields = [], dependencies = [], validators = [], config = {};

    _.each(properties, function (prop) {
        if (prop.type === "Property" && prop.key.type === "Identifier") {
            switch (prop.key.name) {
                case "extend":
                    base = prop.value.value;
                    break;
                case "alias":
                    alias = prop.value.value;
                    break;
                case "requires":
                    _.each(prop.value.elements, function (e) {
                        dependencies.push(e.value);
                    });
                    break;
                case "model":
                    config.model = prop.value.value;
                    break;
                case "storeId":
                    config.storeId = prop.value.value;
                    break;
                case "pageSize":
                    config.pageSize = prop.value.value;
                    break;
                case "remoteFilter":
                    config.remoteFilter = prop.value.value;
                    break;
                case "remoteSort":
                    config.remoteSort = prop.value.value;
                    break;
                case "proxy":
                    config.proxy = getProxy(prop.value.properties);
                    break;
                case "constructor":
                    if (prop.value.body.type === "BlockStatement") {
                        var stmt = _.find(prop.value.body.body, function (b) {
                            return b.type === "ExpressionStatement" && b.expression.type === "CallExpression";
                        });
                        if (!(_.isNull(stmt) || _.isUndefined(stmt))) {
                            let cfg = _.find(stmt, function (s) {
                                return s.type === "CallExpression";
                            });
                            if (!(_.isNull(cfg) || _.isUndefined(cfg))) {
                                let args = cfg.arguments;
                                let props = args[0].elements[0].arguments[0].properties;
                                _.each(props, function (p) {
                                    switch (p.key.name) {
                                        case "model":
                                            config.model = p.value.value;
                                            break;
                                        case "storeId":
                                            config.storeId = p.value.value;
                                            break;
                                        case "pageSize":
                                            config.pageSize = p.value.value;
                                            break;
                                        case "remoteFilter":
                                            config.remoteFilter = p.value.value;
                                            break;
                                        case "remoteSort":
                                            config.remoteSort = p.value.value;
                                            break;
                                        case "proxy":
                                            config.proxy = getProxy(p.value.properties);
                                            break;
                                        default:
                                            break;
                                    }
                                });
                            }
                        }
                    }
                    break;
                default:
                    break;
            }
        }
    });
    let spec = `
        UnitTestEngine.testStore({
            name: '${className}',
            alias: ${_.isUndefined(alias) ? null : JSON.stringify(alias)},
            base: '${base}',
            dependencies: ${JSON.stringify(dependencies)},
            config: ${JSON.stringify(config)}
        });
    `;

    writeDependencyFile(gulpConfig, className, dependencies);

    return spec;
}

function generateViewModelSpec(config, className, properties) {
    let base, alias, dependencies = [];
    _.each(properties, function (prop) {
        if (prop.type === "Property" && prop.key.type === "Identifier") {
            switch (prop.key.name) {
                case "extend":
                    base = prop.value.value;
                    break;
                case "alias":
                    alias = prop.value.value;
                    break;
                default:
                    break;
            }
        }
    });

    let spec = `
        UnitTestEngine.testViewModel({
            name: '${className}',
            alias: '${alias}',
            base: '${base}',    
            dependencies: ${JSON.stringify(dependencies)}
        });
    `;

    writeDependencyFile(config, className, dependencies);

    return spec;
}

function generateViewControllerSpec(config, className, properties) {
    let base, alias, dependencies = [];
    _.each(properties, function (prop) {
        if (prop.type === "Property" && prop.key.type === "Identifier") {
            switch (prop.key.name) {
                case "extend":
                    base = prop.value.value;
                    break;
                case "alias":
                    alias = prop.value.value;
                    break;
                case "requires":
                    if (prop.value) {
                        _.each(prop.value.elements, function (e) {
                            if (e) dependencies.push(e.value);
                        });
                    }
                    break;
                default:
                    break;
            }
        }
    });

    let spec = `
        UnitTestEngine.testViewController({
            name: '${className}',
            alias: '${alias}',
            base: '${base}',    
            dependencies: ${JSON.stringify(dependencies)}
        });
    `;

    writeDependencyFile(config, className, dependencies);

    return { spec: spec, alias: alias, base: base, dependencies: dependencies };
}

function getProxy(properties) {
    let proxy = {};
    _.each(properties, function (pr) {
        switch (pr.key.name) {
            case "type":
                proxy.type = pr.value.value;
                break;
            case "extraParams":
                let extraParams = pr.value.properties;
                let ep = [];
                _.each(extraParams, function (prop) {
                    ep.push({
                        name: prop.key.name,
                        value: JSON.stringify(prop.value.value)
                    });
                });
                proxy.extraParams = ep;
                break;
            case "api":
                let api = {};
                _.each(pr.value.properties, function (a) {
                    switch (a.key.name) {
                        case "read":
                            api.read = a.value.value;
                            break;
                        case "create":
                            api.create = a.value.value;
                            break;
                        case "update":
                            api.update = a.value.value;
                            break;
                        case "delete":
                            api.delete = a.value.value;
                            break;
                        default:
                            break;
                    }
                });
                proxy.api = api;
                break;
            default:
                break;
        }
    });
    return proxy;
}

function replaceAll(haystack, needle, replacement) {
    return haystack.split(needle).join(replacement);
}

function resolveDependencies(src, dest, dependency, formatCode) {
    let referenceClass = replaceAll(dependency, '"', '');
    glob(src, function (err, files) {
        let classes = [];
        _.each(files, function (f) {
            let className = parseFile(f);
            if (_.indexOf(classes, className) === -1)
                classes.push(className);
        });

        if (_.indexOf(classes, referenceClass) === -1) {
            let data = formatContent(formatCode, "Ext.define('" + referenceClass + "', {});");
            ensureDirectoryExistence(replaceAll(dest, "/", "\\") + "\\" + referenceClass + ".js");
            fs.writeFile(replaceAll(dest, "/", "\\") + "\\" + referenceClass + ".js", data, 'utf-8', function (err) {

            });
        }
    });
}

function resolveDependenciesDeprecated(src, dest, dependency, formatCode) {
    let dir = src;
    let dep = replaceAll(dependency, '"', '');

    let walkSync = function (dir, filelist, classlist) {
        let files = fs.readdirSync(dir);
        filelist = filelist || [];
        classlist = classlist || [];
        files.forEach(function (file) {
            if (fs.statSync(Path.join(dir, file)).isDirectory()) {
                walkSync(Path.join(dir, file));
            }
            else {
                filelist.push(file);
                let className = parseFile(Path.join(src, file));
                if (_.indexOf(classlist, className) === -1)
                    classlist.push(className);
            }
        });
    };

    let sourceFiles = [], classes = [];
    walkSync(dir, sourceFiles, classes);
    if (_.indexOf(classes, dep) === -1) {
        let data = formatContent(formatCode, "Ext.define('" + dep + "', {});");
        fs.writeFile(replaceAll(dest, "/", "\\") + "\\" + dep + ".js", data, 'utf-8', function (err) {

        });
    }
    // console.log(classes);
    // for(var i = 0; i < list.length; i++) {
    //     parseFile(Path.join(src, list[i]), (e) => {
    //         if (e !== dep) {
    //             console.log("S:" + e + ", D: " + dep);
    //             // var data = formatContent(formatCode, "Ext.define('" + dependency + "', {});");
    //             // fs.writeFile(replaceAll(dest, "/", "\\") + "\\" + dependency + ".js", data, 'utf-8', function (err) {

    //             // });
    //         }
    //     });   
    // }
}

function ensureDirectoryExistence(filePath) {
    let dirname = Path.dirname(filePath);
    if (directoryExists(dirname)) {
        return true;
    }
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
}

function directoryExists(path) {
    try {
        return fs.statSync(path).isDirectory();
    }
    catch (err) {
        return false;
    }
}

function parseFile(filename) {
    let data = fs.readFileSync(filename, 'utf-8');
    let tree;
    try {
        let tree = esprima.parse(data);
        return getClassName(tree);
    } catch(error) {
        fs.appendFile('logs.log', error + endOfLine + "       -> " + filename + endOfLine, function (err) {
        if (err) throw err;
            console.log('Errors encountered during generation. Please see log file.');
        });
    }
    return undefined;
}

function getClassName(tree) {
    let className;
    let args;
    if (tree.body[0] && tree.body[0].expression)
        args = tree.body[0].expression.arguments;

    if (args) {
        let literal = _.findWhere(args, { type: 'Literal' });
        if(literal)
            className = literal.value;
    }
    return className;
}

function traversePath(dir) {
    let walkSync = function (dir, filelist) {
        files = fs.readdirSync(dir);
        filelist = filelist || [];
        files.forEach(function (file) {
            if (fs.statSync(Path.join(dir, file)).isDirectory()) {
                filelist = walkSync(Path.join(dir, file), filelist);
            }
            else {
                filelist.push(file);
            }
        });
        return filelist;
    };

    let list = [];
    walkSync(dir, list);
    return list;
}

function writeDependencyFile(config, className, dependencies) {
    if (config.moduleName) {
        _.each(dependencies, function (d) {
            let s = d.split(".", 1);
            let name = "";
            if (s.length > 0) {
                name = s;
            }
            if (name != "Ext") {
                let filename = d;
                if (name.toString().toLowerCase() !== config.moduleName.toLowerCase()) {
                    let data = formatContent(config.formatContent, "Ext.define('" + d + "', {});");
                    ensureDirectoryExistence(config.dependencyDestDir + "\\" + filename + ".js");
                    fs.writeFile(config.dependencyDestDir + "\\" + filename + ".js", data, 'utf-8', function (e) {

                    });
                } else {
                    if (config.resolveModuleDependencies === true) {
                        if (config.dependencyDir, config.formatContent) {
                            resolveDependencies(config.dependencyDir, config.dependencyDestDir, d);
                        }
                    }
                }
            }
        });
    }
}

function formatContent(format, data) {
    return format ? beautify(data) : data;
}

exports.generateSpecs = generateSpecs;