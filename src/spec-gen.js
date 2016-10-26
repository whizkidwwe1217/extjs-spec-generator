/**
 * Created by WEstrada on 10/7/2016.
 */
var es = require('event-stream');
var esprima = require('esprima');
var gutil = require('gulp-util');
var Path = require('path');
var _ = require('underscore');
var fs = require('fs');

var PluginError = gutil.PluginError;
const PLUGIN_NAME = 'i21-gen-spec';

function generateSpecs(config) {
    return es.map(function (file, cb) {
        var specType = config.type;
        if(!specType || (specType !== 'model' && specType !== 'store' 
            && specType != 'viewcontroller' && specType !== 'controller'
            && specType != 'viewmodel')) {
            file.contents = new Buffer("You can delete this file.");
            file.path = config.destDir + "\\trash.tmp";
            cb(null, file);
            return;
        }
        var fileContent = file.contents.toString();
        let tree = esprima.parse(fileContent);
        var arguments = null;
        var invalidFiles = [];
        if(tree.body[0] && tree.body[0].expression)
            arguments = tree.body[0].expression.arguments;
        else {
            invalidFiles.push(file.path);
        }
        if(arguments) {
            let literal = _.findWhere(arguments, { type: 'Literal'});
            let objectExp = _.findWhere(arguments, { type: 'ObjectExpression'});
            let properties = objectExp.properties;
            let className = literal.value;
            let spec = "", controllerType;
            let generated = null;

            switch(specType) {
                case "model":
                    spec = generateModelSpec(config, className, properties);
                    break;
                case "store":
                    spec = generateStoreSpec(config, className, properties);
                    break;
                case "controller":
                case "viewmodel":
                case "viewcontroller":
                    let extend = _.find(properties, function(p) {
                        return p.key.name === "extend";
                    });
                    if(extend && extend.value.value === "Ext.app.ViewController" && (specType === "viewcontroller" || specType === "controller")) {
                        generated = generateViewControllerSpec(config, className, properties);
                        spec = generated.spec;
                        controllerType = extend.value.value;
                    } else if (extend && extend.value.value === "Ext.app.ViewModel" && (specType === "viewmodel" || specType === "controller")) {
                        spec = generateViewModelSpec(config, className, properties);
                        controllerType = extend.value.value;
                    } else {
                        file.contents = new Buffer(JSON.stringify(invalidFiles));
                        file.path = config.destDir + "\\trash.tmp";
                        cb(null, file);
                        return;
                    }
                    break;
                default:
                    break;
            }

            var namespace = config.moduleName + "." + config.type + ".";
            var newPath = parsePath(file.relative);

            if (specType === "model" || specType === "store")
                file.path = `${config.destDir}\\${className.replace(namespace, "").replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}.${config.type.toLowerCase()}.spec.js`;
            else {
                if (controllerType === "Ext.app.ViewController") {
                    file.path = `${config.destDir}\\${className.replace(config.moduleName + ".view.", "").replace("ViewController", "").replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}.viewcontroller.spec.js`;
                } else if (controllerType === "Ext.app.ViewModel") {
                    file.path = `${config.destDir}\\${className.replace(config.moduleName + ".view.", "").replace("ViewModel", "").replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}.viewmodel.spec.js`;
                }
            }
            file.contents = new Buffer(spec);
            // send the updated file down the pipe
            cb(null, file);
        }
    });
}

function parsePath(path) {
    var extname = Path.extname(path);
    return {
        dirname: Path.dirname(path),
        basename: Path.basename(path, extname),
        extname: extname
    };
}

function generateModelSpec(config, className, properties) {
    let base, idProperty, fields = [], dependencies = [], validators = [];

    _.each(properties, function(prop) {
        if(prop.type === "Property" && prop.key.type === "Identifier") {
            switch (prop.key.name) {
                case "extend":
                    base = prop.value.value;
                    break;
                case "idProperty":
                    idProperty = prop.value.value;
                    break;
                case "requires":
                    if(prop.value) {
                        _.each(prop.value.elements, function(e) {
                            if(e) dependencies.push(e.value);
                        });
                    }
                    break;
                case "fields":
                    _.each(prop.value.elements, function(e) {
                        let name, type, allowNull = false;
                        _.each(e.properties, function(p) {
                            switch(p.key.name) {
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
                    _.each(prop.value.elements, function(e) {
                        let field, type;
                        _.each(e.properties, function(p) {
                            switch(p.key.name) {
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
    
    var spec = `
    ${config.moduleName}.TestUtils.testModel({
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

    _.each(properties, function(prop) {
        if(prop.type === "Property" && prop.key.type === "Identifier") {
            switch (prop.key.name) {
                case "extend":
                    base = prop.value.value;
                    break;
                case "alias":
                    alias = prop.value.value;
                    break;
                case "requires":
                    _.each(prop.value.elements, function(e) {
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
                    if(prop.value.body.type === "BlockStatement") {
                        let stmt = _.find(prop.value.body.body, function(b) {
                            return b.type === "ExpressionStatement" && b.expression.type === "CallExpression";
                        });
                        if(!(_.isNull(stmt) || _.isUndefined(stmt))) {
                            let cfg = _.find(stmt, function(s) {
                                return s.type === "CallExpression";
                            });
                            if(!(_.isNull(cfg) || _.isUndefined(cfg))) {
                                let args = cfg.arguments;
                                let prop = args[0].elements[0].arguments[0].properties;
                                _.each(prop, function(p) {
                                    switch(p.key.name) {
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

    var spec = `
        ${gulpConfig.moduleName}.TestUtils.testStore({
            name: '${className}',
            alias: ${_.isUndefined(alias) ? null : JSON.stringify(alias) },
            base: '${base}',
            dependencies: ${JSON.stringify(dependencies)},
            config: ${JSON.stringify(config)}
        });
    `;

    writeDependencyFile(gulpConfig, className, dependencies);

    return spec;
}

function getProxy(properties) {
    let proxy = {};
    _.each(properties, function(pr) {
        switch(pr.key.name) {
            case "type":
                proxy.type = pr.value.value;
                break;
            case "extraParams":
                var extraParams = pr.value.properties;
                var ep = [];
                _.each(extraParams, function(prop) {
                    ep.push({
                        name: prop.key.name,
                        value: JSON.stringify(prop.value.value)
                    });
                });
                proxy.extraParams = ep;
                break;
            case "api":
                let api = {};
                _.each(pr.value.properties, function(a) {
                    switch(a.key.name) {
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

function generateViewModelSpec(config, className, properties) {
    let base, alias, dependencies = [];
     _.each(properties, function(prop) {
        if(prop.type === "Property" && prop.key.type === "Identifier") {
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

     var spec = `
        ${config.moduleName}.TestUtils.testViewModel({
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
     _.each(properties, function(prop) {
        if(prop.type === "Property" && prop.key.type === "Identifier") {
            switch (prop.key.name) {
                case "extend":
                    base = prop.value.value;
                    break;
                case "alias":
                    alias = prop.value.value;
                    break;
                case "requires":
                    if(prop.value) {
                        _.each(prop.value.elements, function(e) {
                            if(e) dependencies.push(e.value);
                        });
                    }
                    break;
                default:
                    break;
            }
        }
     });

     var spec = `
        ${config.moduleName}.TestUtils.testViewController({
            name: '${className}',
            alias: '${alias}',
            base: '${base}',    
            dependencies: ${JSON.stringify(dependencies)}
        });
    `;

    writeDependencyFile(config, className, dependencies);

    return { spec: spec, alias: alias, base: base, dependencies: dependencies };
}

function writeDependencyFile(config, className, dependencies) {
    if(config.moduleName) {
        _.each(dependencies, function(d) {
            let s = d.split(".", 1);
            let name = "";
            if(s.length > 0) {
                name = s;
            }
            if(name != "Ext" && (name.toString().toLowerCase() !== config.moduleName.toLowerCase())) {
                let filename = d;
                let data = `
Ext.define("${d}", {
    
});
                `;
                fs.writeFile(config.dependencyDestDir + "\\" + filename + ".js", data, 'utf-8', function(e) {
                    
                });
            }
        });
    }
}

module.exports = generateSpecs;