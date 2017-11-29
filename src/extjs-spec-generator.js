var esprima = require('esprima');
var _ = require('underscore');
var Path = require('path');
var fs = require('fs');
var endOfLine = require('os').EOL;
var beautify = require('js-beautify').js_beautify;
var glob = require('glob');
var logs = [];

function generateSpecs(file, config) {
    log("[" + colors().grey(config.type) + "] " + colors().green("Generating specs for ") + colors().magenta(file.path));
    
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
    let tree;
    try {
        tree = esprima.parse(fileContent);
    } catch (error) {
        generateLogs(error, file.path);
        file.contents = new Buffer("");
        file.path = config.destDir + "\\trash.tmp";
        //cb(null, file);
        return file;
    }
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
                    spec = generateModelSpec(config, className, properties, config.aliasMappings);
                    break;
                case "store":
                    spec = generateStoreSpec(config, className, properties, config.aliasMappings);
                    break;
                case "controller":
                case "viewmodel":
                case "viewcontroller":
                    let extend = _.find(properties, function (p) {
                        return p.key.name === "extend";
                    });
                    if (extend && (extend.value.value === "Ext.app.ViewController" || extend.value.value.indexOf("ViewController") !== -1) && (specType === "viewcontroller" || specType === "controller")) {
                        generated = generateViewControllerSpec(config, className, properties, config.aliasMappings);
                        spec = generated.spec;
                        controllerType = extend.value.value;
                    } else if (extend && (extend.value.value === "Ext.app.ViewModel" || extend.value.value.indexOf("ViewModel") !== -1) && (specType === "viewmodel" || specType === "controller")) {
                        generated = generateViewModelSpec(config, className, properties, config.aliasMappings);
                        spec = generated.spec;
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
                if (controllerType === "Ext.app.ViewController" || controllerType.indexOf("ViewController") !== -1) {
                    file.path = `${config.destDir}\\${className.replace(config.moduleName + ".view.", "").replace("ViewController", "").replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}.viewcontroller.spec.js`;
                } else if (controllerType === "Ext.app.ViewModel" || controllerType.indexOf("ViewModel") !== -1) {
                    file.path = `${config.destDir}\\${className.replace(config.moduleName + ".view.", "").replace("ViewModel", "").replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}.viewmodel.spec.js`;
                }
            }
            file.contents = new Buffer(formatContent(config.formatContent, spec));
            if (logs.length > 0) {
                appendLog("logs.log");
            }
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

function extractNamespaceClassAndType(moduleName, namespace, specType, controllerType, className) {
    let name = '';
    if (specType === "model" || specType === "store")
        name = `${className.replace(namespace, "").replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`;
    else {
        if (controllerType === "Ext.app.ViewController" || controllerType.indexOf("ViewController") !== -1) {
            name = `${className.replace(moduleName + ".view.", "").replace("ViewController", "").replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`;
        } else if (controllerType === "Ext.app.ViewModel" || controllerType.indexOf("ViewModel") !== -1) {
            name = `${className.replace(moduleName + ".view.", "").replace("ViewModel", "").replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`;
        }
    }

    result = {
        namespace: namespace,
        type: specType,
        name: `'${name}'`,
        alias: `'${type.toLowerCase()}.${name.toLowerCase()}'`
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

function generateModelSpec(config, className, properties, aliasMappings) {
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

    let extras = { type: 'model', extend: base, aliasMappings: aliasMappings };
    writeDependencyFile(config, className, dependencies, extras);

    return spec;
}

function generateStoreSpec(gulpConfig, className, properties, aliasMappings) {
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
                                if (args.length > 0) {
                                    if (args[0].elements && args[0].elements.length > 0) {
                                        if (args[0].elements[0].arguments && args[0].elements[0].arguments.length > 0) {
                                            if (args[0].elements[0].arguments[0].properties) {
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
                                }
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

    let extras = { type: 'store', extend: base, aliasMappings: aliasMappings };
    writeDependencyFile(gulpConfig, className, dependencies, extras);

    return spec;
}

function generateViewModelSpec(config, className, properties, aliasMappings) {
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
        UnitTestEngine.testViewModel({
            name: '${className}',
            alias: '${alias}',
            base: '${base}',    
            dependencies: ${JSON.stringify(dependencies)}
        });
    `;

    let extras = { type: 'viewmodel', extend: base, aliasMappings: aliasMappings };
    writeDependencyFile(config, className, dependencies, extras);

    return { spec: spec, alias: alias, base: base, dependencies: dependencies };
}

function generateViewControllerSpec(config, className, properties, aliasMappings) {
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

    let extras = { type: 'viewcontroller', extend: base, aliasMappings: aliasMappings };
    writeDependencyFile(config, className, dependencies, extras);

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

function fileExists(filename) {
    try {
        return fs.statSync(filename).isFile();
    }
    catch (err) {
        return false;
    }
}

function parseFile(filename) {
    if (fileExists(filename)) {
        let data = fs.readFileSync(filename, 'utf-8');
        let tree;
        try {
            try {
                let tree = esprima.parse(data);
                return getClassName(tree);
            } catch (err) {
                generateLogs(err, filename);
            }
        } catch (error) {
            generateLogs(error, filename);
            //generateLogs('logs.log', error + endOfLine + "       -> " + filename + endOfLine);
        }
    }
    return undefined;
}

var util = require('util');

function colorize(color, text) {
    const codes = util.inspect.colors[color]
    return `\x1b[${codes[0]}m${text}\x1b[${codes[1]}m`
}

function colors() {
    let returnValue = {}
    Object.keys(util.inspect.colors).forEach((color) => {
        returnValue[color] = (text) => colorize(color, text)
    })
    return returnValue
}

function generateLogs(data, filename) {
    if (!_.findWhere(logs, { file: filename })) {
        logs.push({
            file: filename,
            data: data
        });
    }
}

function appendLog(filename) {
    let msg = "";
    _.each(logs, l => {
        console.error(colors().red("Found error while processing ") + colors().yellow(l.file) + ". Please see " + colors().green("logs.log"));
        msg += l.data + endOfLine + "        -> " + l.file + endOfLine;
    });
    fs.appendFile(filename, msg, function (err) {
        if (err) throw err;
        //console.error(colors().red('    > Errors encountered during generation. Please see log file.' + err) + " " + colors().green(filename));
    });
    logs = [];
}

function log(msg) {
    console.log(msg);
}

function getClassName(tree) {
    let className;
    let args;
    if (tree.body[0] && tree.body[0].expression)
        args = tree.body[0].expression.arguments;

    if (args) {
        let literal = _.findWhere(args, { type: 'Literal' });
        if (literal)
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

function writeDependencyFile(config, className, dependencies, extras) {
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
                    log("[" + colors().grey("mockfile") + "] " + colors().green("Generating mock file for ") + colors().blue(d) + " to " + colors().magenta(config.dependencyDestDir + "\\" + filename + ".js"));
                    
                    let data = formatContent(config.formatContent, `Ext.define('${d}', {});`);
                    
                    if(extras) {
                        let metadata = getClassMetadata(d, extras.type, true, extras.aliasMappings);
                        let body = {
                            extend: metadata.extend,
                            alias: metadata.alias
                        };
                        data = formatContent(config.formatContent, `Ext.define('${d}', ${JSON.stringify(body)});`);
                    }

                    ensureDirectoryExistence(config.dependencyDestDir + "\\" + filename + ".js");
                    fs.writeFile(config.dependencyDestDir + "\\" + filename + ".js", data, 'utf-8', function (e) {

                    });
                } else {
                    if (config.resolveModuleDependencies === true) {
                        if (config.dependencyDir, config.formatContent) {
                            resolveDependencies(config.dependencyDir, config.dependencyDestDir, d, undefined, extras);
                        }
                    }
                }
            }
        });
    }
}

function getDefaultAliasMappings() {
    let aliasMappings = [
        { name: 'i21', prefix: 'sm' },        
        { name: 'AccountsPayable', prefix: 'ap' },
        { name: 'AccountsReceivable', prefix: 'ar' },
        { name: 'CardFueling', prefix: 'cf' },
        { name: 'CashManagement', prefix: 'cm' },
        { name: 'CreditCardRecon', prefix: 'cc' },
        { name: 'ContractManagement', prefix: 'ct' },
        { name: 'CRM', prefix: 'crm' },
        { name: 'Dashboard', prefix: 'db' },
        { name: 'EnergyTrac', prefix: 'et' },
        { name: 'EntityManagement', prefix: 'em' },
        { name: 'FinancialReportDesigner', prefix: 'frd' },
        { name: 'GeneralLedger', prefix: 'gl' },
        { name: 'GlobalComponentEngine', prefix: 'frm' },
        { name: 'Grain', prefix: 'gr' },
        { name: 'HelpDesk', prefix: 'hd' },
        { name: 'Integration', prefix: 'ip' },
        { name: 'Inventory', prefix: 'ic' },
        { name: 'Logistics', prefix: 'lg' },
        { name: 'Manufacturing', prefix: 'mf' },
        { name: 'MeterBilling', prefix: 'mb' },
        { name: 'NoteReceivable', prefix: 'nr' },
        { name: 'Patronage', prefix: 'pat' },
        { name: 'Payroll', prefix: 'pr' },
        { name: 'Quality', prefix: 'qm' },
        { name: 'Reporting', prefix: 'sr' },
        { name: 'RiskManagement', prefix: 'rk' },
        { name: 'ServicePack', prefix: 'sp' },
        { name: 'Store', prefix: 'st' },
        { name: 'RiskManagement', prefix: 'rm' },
        { name: 'SystemManager', prefix: 'sm' },
        { name: 'TankManagemet', prefix: 'tm' },
        { name: 'TaxForm', prefix: 'tf' },
        { name: 'Transports', prefix: 'tr' },
        { name: 'VendorRebates', prefix: 'vr' },
        { name: 'Warehouse', prefix: 'wh' }
    ];
    return aliasMappings;
}

function getClassMetadata(namespace, type, resolveType, aliasMappings) {
    if(!aliasMappings)
        aliasMappings = getDefaultAliasMappings();
    let extend = "Ext.Base";
    if(resolveType) {
        if(namespace.indexOf(".store.") !== -1) {
            type = "store";
            extend = namespace.indexOf("Buffered") !== -1 ? "Ext.data.BufferedStore" : "Ext.data.Store";
        }
        else if (namespace.indexOf(".model.") !== -1) {
            type = "model";
            extend = "iRely.BaseEntity";
        }
        else if (namespace.indexOf(".view.") && namespace.indexOf("ViewController") !== -1) {
            type = "viewcontroller";
            extend = "Ext.app.ViewController";
        }
        else if (namespace.indexOf(".view.") && namespace.indexOf("ViewModel") !== -1) {
            type = "viewmodel";
            extend = "Ext.app.ViewModel";
        }
    }

    let tStart = -1;
    let tEnd = type.length;

    switch (type) {
        case "store":
        case "model":
            tStart = namespace.indexOf("." + type + ".") + 2;
            tEnd = tStart + tEnd;
            break;
        case "viewmodel":
        case "viewcontroller":
            tStart = namespace.indexOf(".view.") + 2;
            tEnd = tStart + 4;
            break;
        default:
            throw `Invalid type: "${type}".`;
            break;
    }

    let className = namespace.substring(tEnd, namespace.length).trim();
    let moduleName = namespace.substring(0, tStart - 2);
    let aliasMap = _.findWhere(aliasMappings, { name: moduleName });
    aliasMap = aliasMap ? aliasMap : { name: moduleName, prefix: moduleName };

    let metadata = {
        namespace: namespace,
        className: className,
        moduleName: moduleName,
        extend: extend,
        type: type,
        aliasMap: aliasMap,
        alias: `${type}.${aliasMap.prefix}${className}`.toLowerCase()
    };
    return metadata;
}

function resolveDependencies(src, dest, dependency, formatCode, extras) {
    let referenceClass = replaceAll(dependency, '"', '');
    glob(src, function (err, files) {
        let classes = [];
        _.each(files, function (f) {
            let className = parseFile(f);
            if (_.indexOf(classes, className) === -1)
                classes.push(className);
        });

        if (_.indexOf(classes, referenceClass) === -1) {
            log("[" + colors().grey("mock") + "] " + colors().green("Generating mock file for ") + colors().blue(referenceClass) + " to " + + colors().magenta(replaceAll(dest, "/", "\\") + "\\" + referenceClass + ".js"));
            
            let data = formatContent(formatCode, `Ext.define('${referenceClass}', {});`);

            if(extras) {
                let metadata = getClassMetadata(referenceClass, extras.type, true, extras.aliasMappings);
                let body = {
                    extend: metadata.extend,
                    alias: metadata.alias
                };
                data = formatContent(formatCode, `Ext.define('${referenceClass}', ${JSON.stringify(body)});`);
            }

            ensureDirectoryExistence(replaceAll(dest, "/", "\\") + "\\" + referenceClass + ".js");
            fs.writeFile(replaceAll(dest, "/", "\\") + "\\" + referenceClass + ".js", data, 'utf-8', function (err) {

            });
        }
    });
}

function formatContent(format, data) {
    return format ? beautify(data) : data;
}

exports.generateSpecs = generateSpecs;