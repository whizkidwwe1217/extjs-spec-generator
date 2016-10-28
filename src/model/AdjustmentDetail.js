
/**
 * Created by LZabala on 3/27/2015.
 */
Ext.define('SampleModule.model.AdjustmentDetail', {
    extend: 'iRely.BaseEntity',

    requires: [
        'Ext.data.Field'
    ],

    idProperty: 'intInventoryAdjustmentId',

    fields: [
        { name: 'intInventoryAdjustmentId', type: 'int' },
        { name: 'intLocationId', type: 'int', allowNull: true },
        { name: 'dtmAdjustmentDate', type: 'date', dateFormat: 'c', dateWriteFormat: 'Y-m-d' },
        { name: 'intAdjustmentType', type: 'int', allowNull: true },
        { name: 'strAdjustmentNo', type: 'string' },
        { name: 'strDescription', type: 'string' },
        { name: 'ysnPosted', type: 'boolean'},
        { name: 'intSort', type: 'int', allowNull: true }
    ],

    validators: [
        { type: 'presence', field: 'intLocationId' },
        { type: 'presence', field: 'dtmAdjustmentDate' },
        { type: 'presence', field: 'intAdjustmentType' }
    ]
});