modules.define(
    'wsk-controller',
    [
        'inherit',
        'webspeechkit',
        'dom',
        'messages'
    ],
    function (
        provide,
        inherit,
        Webspeechkit,
        DOM,
        Messages
    ) {
        var WskController = inherit(DOM, {
            __constructor: function () {

                // ya.speechkit.settings.apiKey = 'developers-simple-key';
                // ya.speechkit.settings.spotterUrl = 'voiceproxy-tornado01h.tst.voicetech.yandex.net/spottersocket.ws';
                ya.speechkit.settings.apiKey = '8884dcb3-39ab-40fe-a145-d18121cb0a4f';
                this.spotter = new ya.speechkit.Spotter();
            },

            /**
             * Запускает фоновое ожидание команды активации
             *
             * @param {String} phrase Текст команды активации Spotter
             */
            runSpotter: function (phrase) {

                var self = this;
                var initCallbackTimeout = setTimeout(function () {
                    Messages.show('Возможно, вы не включили микрофон.', 'info');
                    Messages.show('Возможно, голосовые команды не инициализированы из-за ошибки приложения', 'error');
                }.bind(this), 5000);

                this.spotter.start({
                    // Набор фраз, на которые будет реагировать споттер
                    phrases: [phrase],

                    // Формат записи  звука
                    format: ya.speechkit.FORMAT.PCM16,

                    // Коллбэк для сообщений об ошибках
                    errorCallback: function (err) {
                        console.error(err);
                        Messages.show('Что-то пошло не так: ' + err);
                    },

                    // Коллбэк, в который будут приходить распознанные фразы
                    dataCallback: function (text, uttr, merge) {
                        if (text.toLowerCase() === phrase.toLowerCase().replace(/\s+/g, '-')) {
                            self._onSpotterDone();
                        }
                    },

                    // Коллбэк, в который придёт уведомление о начале записи звука
                    initCallback: function (sessionId, code) {
                        clearTimeout(initCallbackTimeout);
                    },

                    advancedOptions: {
                        partial_results: false,
                        utterance_silence: 60
                    }
                });
            },

            /**
             * Запускает фоновое ожидание любой команды
             */
            runDictationWaiting: function () {
                var self = this;

                ya.speechkit.recognize({
                    doneCallback: function (text) {
                        self._onDictationEnded(text);
                    },
                    initCallback: function () {
                        self._onDictationStarted();
                    },
                    errorCallback: function (err) {
                        console.error(err);
                        Messages.show('Что-то пошло не так: ' + err);
                    },
                    advancedOptions: {
                        utterance_silence: 60
                    }
                });
            },

            _onSpotterDone: function () {
                this.spotter.stop();

                this.emit('onSpotter');
            },

            _onDictationStarted: function () {
                this.emit('onDictationStarted');
            },

            _onDictationEnded: function (text) {
                this.emit('onDictationEnded', text);
            }
        });

        provide(WskController);
    }
);
