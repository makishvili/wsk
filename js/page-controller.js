modules.define(
    'page-controller',
    [
        'inherit',
        'wsk-controller',
        'dom',
        'view'
    ],
    function (
        provide,
        inherit,
        WskController,
        DOM,
        View) {
        var PageController = inherit(DOM, {
            __constructor: function () {
                if (!window.yaWskPhrases) {
                    throw new Error('Не заданы фразы активации');
                }

                this.phrases = window.yaWskPhrases;
                this.currentPhraseIndex = 0;

                this.view = new View();
                // Впервые показываем стартовый экран
                var phrase = this._getPhrase();
                this.view.showStartPage(phrase);

                // Нажали кнопку "Старт"
                this.view.on('onStarted', this._showNextScreen, this);

                this.wsk = new WskController();
                this.wsk.on('onSpotter', this._showNextScreen, this);
                this.wsk.on('onDictationStarted', this._showNextScreen, this);
                this.wsk.on('onDictationEnded', function (text) {
                    this.view.setCustomCommand(text);
                    this._showNextScreen();
                    this.emit('onDictationEnded', text);
                }, this);
            },

            /**
             *
             * @param {Number | Null} phraseIndex Порядковый номер команды активации
             * @returns {String | Null} Текст фразы активации
             */
            _showNextScreen: function (phraseIndex) {
                // Счетчик шагов внутри одного витка исследования
                if (!this.screen) {
                    this.screen = 1;
                }

                phraseIndex = phraseIndex || this.currentPhraseIndex;

                switch (this.screen) {
                    case 1:
                        var phrase = this._getPhrase(phraseIndex);
                        // Приложение ждёт, когда пользователь скажет правильную команду  активации
                        this.wsk.runSpotter(phrase);
                        break;

                    case 2:
                        // Приложение ждёт, когда пользователь начнёт диктовать произвольную команду
                        this.wsk.runDictationWaiting();
                        break;

                    case 3:
                        // Пользователь начал диктовать произвольную команду
                        // Приложение ждёт, когда пользователь закончить диктовать произвольную команду
                        // this.wsk.runDictationStopping();
                        break;

                    case 4:
                        // Пользователь закончил диктовать произвольную команду
                        setTimeout(function () {
                            this._showNextScreen();
                        }.bind(this), 1000);
                        break;

                    case 5:
                        setTimeout(function () {
                            this._showNextScreen();
                        }.bind(this), 3000);
                        break;

                    case 6:
                        setTimeout(function () {
                            this._startAgain();
                        }.bind(this), 1500);
                        break;

                    default:
                        break;
                }

                this.view.changeContent(this.screen);
                this.screen = this.screen + 1;
            },

            /**
             * Запускает новый виток исследования или завершает исследование
             */
            _startAgain: function () {

                // Обработали все команды активации?
                if (this.currentPhraseIndex === this.phrases.length - 1) {
                    this.view.showFinishPage();
                } else {
                    // Сбрасываем счётчик экранов, готовимся к новому кругу исследования
                    this.screen = 1;

                    // Берем следующую команду активации
                    this.currentPhraseIndex = this.currentPhraseIndex + 1;
                    var phrase = this._getPhrase(this.currentPhraseIndex);

                    // Заново рисуем первый экран приложения
                    this.view.showStartPage(phrase, this.currentPhraseIndex);
                }
            },

            /**
             * Получает команду активации
             *
             * @param {Number} phraseIndex Порядковый номер команды активации
             * @returns {String}
             */
            _getPhrase: function (phraseIndex) {
                return this.phrases[phraseIndex];
            },

            /**
             *
             * @param {Number} phraseIndex Порядковый номер команды активации
             * @returns {String} Текст фразы активации
             */
            run: function (phraseIndex) {
                this._showNextScreen(phraseIndex);
            }

        });

        var pageController = new PageController();
        window.yaWsk = pageController;

        provide(pageController);
    }
);
