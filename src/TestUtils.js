/**
 * Created by WEstrada on 10/6/2016.
 */
Ext.define('Inventory.TestUtils', {
    name: 'testutils',

    statics: {
        /**
         * Check if field exists.
         * @param fields
         * @param name
         * @param type
         */
        shouldHaveField: function (fields, name, type) {
            should.exist(_.findWhere(fields, {name: name, type: type}), name
                + ' does not exists. The field name or data type might have been changed.');
        },

        shouldHaveReference: function (fields, name, reference, inverse) {
            var field = _.find(fields, function (field) {
                return field.name === name
                    && field.reference
                    && field.reference.type === reference;
            });
            should.exist(field, "Reference model '" + reference + "' for '" + name + "' does not exists.");
            if (inverse && reference) {
                field.reference.inverse.role.should.be.equal(inverse, "The inverse role '"
                    + inverse + "' is not equal to '" + field.reference.inverse.role + "'.")
            }
        },

        isValidExtObject: function(className) {
            try {
                var object = Ext.create(className);
                return { valid: true, obj: object };
            } catch(e) {
                return { valid: false, obj: null };
            }
        },

        /**
         * Unit test for a odel
         * @param config Contains all the configurations of the Model
         *  - modelName Name of the model including the namespace.
         *  - fieldList List of fields { name: <fieldname>, type: <datatype> }
         *  - referenceList List of field references { name: <fieldname>, type: <referencemodel>, role: <role> }
         *  - idProperty The id of the Model
         *  - callbacks Includes some events for handling the model
         *      Events: afterInit
         */
        testModel: function (config) {
            var modelName = config.name,
                idProperty = config.idProperty,
                fieldList = config.fields,
                referenceList = config.references,
                base = config.base,
                callbacks = config.callbacks,
                excludeFields = config.excludeFields,
                model = null;
            var obj = this.isValidExtObject(modelName);
            isValid = obj.valid;
            model = obj.obj;

            describe(modelName, function() {
                describe("Ext object", function() {
                    it('should be a valid Ext object', function() {
                        isValid.should.equal(true);
                    });
                });
                describe("config", function() {
                    it('should exists', function () {
                        if(isValid)
                            should.exist(model, "Adjustment Note model might not have been initialized.");
                        else
                            should.exist(model, "Model does not exists.");
                    });

                    if(base) {
                        it('should be derived from ' + base, function () {
                            if(isValid)
                                should.equal(Ext.getClass(model).superclass.self.getName(), base);
                            else
                                should.exist(model, "Model does not exists.");
                        });
                    }

                    it('should have an idProperty', function () {
                        if(isValid) {
                            if(model.idProperty && !(model.idProperty === 'id' && (_.isUndefined(idProperty) || _.isEmpty(idProperty))))
                                model.idProperty.should.equal(idProperty);
                        } else 
                            should.exist(model, "Model does not exists.");
                    });

                    if(fieldList && !excludeFields) {
                        describe('fields', function () {
                            it('should have the correct fields', function () {
                                if(isValid) {
                                    var fields = model.fields;
                                    should.exist(fields, 'No fields');
                                    _.isEmpty(fields).should.be.false;
                                    _.each(fieldList, function (field) {
                                        Inventory.TestUtils.shouldHaveField(fields, field.name, field.type);
                                    });
                                } else
                                    should.exist(model, "Model does not exists.");
                            });

                            it('should have reference model(s)', function () {
                                if(isValid) {
                                    _.each(referenceList, function (ref) {
                                        Inventory.TestUtils.shouldHaveReference(fields, ref.name, ref.type, ref.role);
                                    })
                                } else
                                    should.exist(model, "Model does not exists.");
                            });
                        });
                    }
                });
                if(isValid) {
                    describe("behaviors", function () {
                        if (callbacks) {
                            if (callbacks.afterInit) {
                                callbacks.afterInit(model);
                            }
                        }
                    });
                }
            });
        },

        /**
         * Unit test for a view controller
         * @param cfg A configuration object that is passed to this function that contains information about the view controller.
         *  - name: The name of the view controller including the namespace.
         *  - callbacks: Contains some events to handle the view controller.
         *      Events: init, searchConfig, binConfig
         */
        testViewController: function (cfg) {
            var name = cfg.name,
                callbacks = cfg.callbacks, base = cfg.base,
                controller, config, search, binding, isValidExt = false, obj = null;

            obj = this.isValidExtObject(name);
            controller = obj.obj;
            isValidExt = obj.valid; 
            config = controller.config;
            search = config.searchConfig;
            binding = config.binding;

            describe(name, function () {
                // Initialize controller
                if (cfg.init) {
                    describe("view controller behaviors", function () {
                        cfg.init(controller);
                    });
                }

                it('should exist', function () {
                    should.exist(controller);
                });

                if(base) {
                    it('should be derived from ' + base, function () {
                        should.equal(Ext.getClass(controller).superclass.self.getName(), base);
                    });
                }

                it('should have a config', function () {
                    should.exist(config);
                });

                describe('config', function () {
                    if(cfg.checkSearch) {
                        it('should have a search config', function () {
                            should.exist(search);
                        });
                    }

                    if(cfg.checkBinding) {
                        it('should have a binding config', function () {
                            should.exist(binding);
                        });
                    }

                    if (callbacks) {
                        describe("search config", function () {
                            callbacks.searchConfig(search);
                        });

                        describe("binding config", function () {
                            callbacks.bindConfig(binding);
                        });
                    }
                });
            });
        },

        testStore: function(config) {
            var store = null, obj = null;
            var isValidExt = false;
            obj = this.isValidExtObject(config.name);
            store = obj.obj;
            isValidExt = obj.valid;            

            describe(config.name, function() {
                describe('Ext object', function() {
                    it('should be a valid Ext object', function() {
                        isValidExt.should.be.true;
                    });

                    if(!_.isUndefined(config.alias) && !_.isNull(config.alias)) {
                        it('should have an alias of "'.concat(config.alias).concat('"'), function() {
                            store.alias[0].should.be.equal(config.alias);
                        });
                    }

                    describe("config", function() {
                        if(config.config.model) {
                            describe('model', function() {
                                var model;
                                beforeEach(function() {
                                    model = store.getModel();
                                });

                                it('should exists', function() {
                                    should.exist(model);
                                });

                                it('should have a model named "'.concat(config.config.model).concat('"'), function() {
                                    model.getName().should.be.equal(config.config.model);
                                });
                            });
                        }
                        
                        it('should have a storeId of "'.concat(config.config.storeId), function() {
                            store.getStoreId().should.be.equal(config.config.storeId);    
                        });

                        if(config.config.proxy) {
                            describe('proxy', function() {
                                it('should have a proxy', function() {
                                    should.exist(store.proxy);
                                });
                                it('should be of type "'.concat(config.config.proxy.type.concat('"')), function() {
                                    store.proxy.type.should.be.equal(config.config.proxy.type);    
                                });
                                describe('api', function() {
                                    var expectedApi = config.config.proxy.api;
                                    var api = store.proxy.api;
                                    it('should have the correct api URIs', function() {
                                        should.exist(api);
                                    });

                                    if(expectedApi.create)
                                        it('"create" URI should be "'.concat(expectedApi.create).concat('"'), function() {
                                            api.create.should.be.equal(expectedApi.create);
                                        });
                                    if(expectedApi.read)
                                        it('"read" URI should be "'.concat(expectedApi.read).concat('"'), function() {
                                            api.read.should.be.equal(expectedApi.read);
                                        });
                                    if(expectedApi.update)
                                        it('"update" URI should be "'.concat(expectedApi.update).concat('"'), function() {
                                            api.update.should.be.equal(expectedApi.update);
                                        });
                                    if(expectedApi.destroy)
                                        it('"destroy" URI should be "'.concat(expectedApi.destroy).concat('"'), function() {
                                            api.destroy.should.be.equal(expectedApi.destroy);
                                        });
                                });
                            });
                        }
                    });
                });
            });

            if(isValidExt) {
                if(config.init) {
                    config.init(store);
                }
            }
        },

        testViewModel: function(cfg) {
            describe(cfg.name, function() {
                it('should be a valid view model class.');
            })
        },

        outputFields: function (modelName) {
            var model = Ext.create(modelName);
            var ff = [];
            _.each(model.fields, function (f) {
                ff.push({name: f.name, type: 'int'});
            });
            console.log(ff);
        }
    }
});