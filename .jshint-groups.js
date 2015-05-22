module.exports = {
    options: {
        curly: true,
        eqeqeq: true,
        immed: true,
        newcap: true,
        noarg: true,
        noempty: true,
        nonew: true,
        undef: true,
        unused: true,
        trailing: true,
        maxlen: 120,
        quotmark: 'single'
    },
    groups: {
        client: {
            options: {
                browser: true,
                predef: [
                    'modules',
                    'module',
                    'console',
                    'alert',
                    'confirm',
                    'require',
                    '__dirname'
                ]
            },
            includes: [
                '*.js'
            ],
            excludes: [
                'webspeechkit.min.js',
                'webspeechkit-1.0.0.js',
                'webspeechkit-settings.js'
            ]
        }
    }
};
