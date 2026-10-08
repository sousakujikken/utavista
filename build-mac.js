const builder = require('electron-builder');

builder.build({
    config: {
        'appId': 'appId': 'local.test.app1',,
        'mac':{
            'target': 'zip',
        }
    }
});
