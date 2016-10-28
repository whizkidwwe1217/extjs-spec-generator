UnitTestEngine.testModel({
    name: 'Inventory.model.Adjustment',
    base: 'iRely.BaseEntity',
    idProperty: 'intInventoryAdjustmentId',
    dependencies: ["Inventory.model.AdjustmentDetail", "Inventory.model.AdjustmentNote", "Entity.model.AdjustmentNote", "Ext.data.Field"],
    fields: [{
        "name": "intInventoryAdjustmentId",
        "type": "int",
        "allowNull": false
    }, {
        "name": "intLocationId",
        "type": "int",
        "allowNull": true
    }, {
        "name": "dtmAdjustmentDate",
        "type": "date",
        "allowNull": false
    }, {
        "name": "intAdjustmentType",
        "type": "int",
        "allowNull": true
    }, {
        "name": "strAdjustmentNo",
        "type": "string",
        "allowNull": false
    }, {
        "name": "strDescription",
        "type": "string",
        "allowNull": false
    }, {
        "name": "ysnPosted",
        "type": "boolean",
        "allowNull": false
    }, {
        "name": "intSort",
        "type": "int",
        "allowNull": true
    }],
    validators: [
        [{
            "field": "intLocationId",
            "type": "presence"
        }, {
            "field": "dtmAdjustmentDate",
            "type": "presence"
        }, {
            "field": "intAdjustmentType",
            "type": "presence"
        }]
    ]
});