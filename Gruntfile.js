module.exports = function (grunt) {

    grunt.initConfig({
        concat: {
            css: {
                src: ['*.css'],
                dest: 'build/main.css'
            },
            js: {
                src: [
                    'node_modules/ym/modules.js',
                    'node_modules/inherit/lib/inherit.js',
                    'js/**/*.js',
                    '!js/**/*.test.js',
                    '!node_modules/',
                    '!Gruntfile.js',
                    '!.*'
                ],
                dest: 'build/main.js'
            }
        }
    });

    // Load the plugin that provides the "uglify" task.
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-cssmin');

    // Default task(s).
    grunt.registerTask('default', ['concat']);

};
