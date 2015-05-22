modules.require(
    [
        'inherit',
        'wsk-controller',
        'dom',
        'view'
    ],
    function (
        inherit,
        WskController,
        DOM,
        View
    ) {
        var PageController = inherit(DOM, {
            __constructor: function () {
                this.phrases = [
                    'Слушай Яндекс',
                    'Яндекс это я',
                    'Яндекс ты здесь',
                    'Ок Гугл',
                    'Ок Яндекс',
                    'Привет Яндекс',
                    'Яндекс'
                ];
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
                }, this);
            },

            _showNextScreen: function (text) {
                // Счетчик шагов внутри одного витка исследования
                if (!this.screen) {
                    this.screen = 1;
                }

                switch (this.screen) {
                    case 1:
                        var phrase = this._getPhrase();
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
                        setTimeout(function () { this._showNextScreen(); }.bind(this), 1000);
                        break;

                    case 5:
                        setTimeout(function () { this._showNextScreen(); }.bind(this), 3000);
                        break;

                    case 6:
                        setTimeout(function () { this._startAgain(); }.bind(this), 1500);
                        break;

                    default:
                        break;
                }

                this.view.changeContent(this.screen);
                this.screen = this.screen + 1;
            },

            /**
             * Запускает новый виток исследования или завершает иследование
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
                    var phrase = this._getPhrase();

                    // Заново рисуем первый экран приложения
                    this.view.showStartPage(phrase, this.currentPhraseIndex);
                }
            },

            /**
             * Получает команду активации
             *
             * @returns {String}
             */
            _getPhrase: function () {
                return this.phrases[this.currentPhraseIndex];
            }

        });

        var pageController = new PageController();
    }
);
