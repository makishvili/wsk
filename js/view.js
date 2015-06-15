modules.define(
    'view',
    [
        'inherit',
        'dom'
    ],
    function (
        provide,
        inherit,
        DOM
    ) {
        /*jshint devel:true*/

        var View = inherit(DOM, /** @lends dom.prototype */ {
            /**
             *
             * @constructor
             */
            __constructor: function () {
                this.screen = 0;

                this.start = this.byId('start');
                this.content = this.byId('content');
                this.finish = this.byId('finish');

                // Заголовок всего исследования. Виден только на самом первом экране.
                this.surveyHead = this.byId('survey-head');

                // Заголовок каждого нового витка иследования.
                this.taskHead = this.byId('task-head');

                // Контейнер с текущим номером витка исследования
                this.taskNext = this.byId('task-next');

                // Контейнер для текста с произвольной голосовой командой
                this.customCmd = this.byId('custom-cmd');

                // Пользователь начал новый виток исследования
                this.startButton = this.byId('btn');
                this.startButton.addEventListener('click', this._onStartButtonClicked.bind(this));
            },

            /**
             * Показывает стартовый экран приложения
             * Используется, как инструкция перед каждым новым витком исследования
             *
             * @param {String} phrase Текст команды активации Spotter
             * @param {Number|Null} taskIndex Номер текущего витка исследования. Отсутствует, если пользователь
             * ещё не начинал
             */
            showStartPage: function (phrase, taskIndex) {

                // Для второго и каждого последующего витка
                if (taskIndex) {
                    this.addClass(this.surveyHead, 'hidden');
                    this.taskNext.innerText = taskIndex + 1;
                    this.removeClass(this.taskHead, 'hidden');
                }

                this.removeClass(this.start, 'hidden');
                this.removeAllClasses(this.content);
                this.addClass(this.content, 'hidden');
            },

            /**
             * Показывает нужный экран приложения
             *
             * @param {Number} screen Номер экрана, который должны показать
             */
            changeContent: function (screen) {
                // console.log('Переходим к screen = ', screen);

                this.addClass(this.start, 'hidden');
                this.removeClass(this.content, 'hidden');

                var prevState = 'screen' + this.screen;
                var currState = 'screen' + screen;

                if (this.containsClass(this.content, prevState)) {
                    this.removeClass(this.content, prevState);
                }
                this.addClass(this.content, currState);
                this.screen = screen;
            },

            /**
             * Показывает прощальную страницу исследования
             */
            showFinishPage: function () {
                this.addClass(this.content, 'hidden');
                this.removeClass(this.finish, 'hidden');
            },

            /**
             * Показывает произвольный текст, произнесенный пользователем
             */
            setCustomCommand: function (text) {
                this.customCmd.innerText = text;
            },

            _onStartButtonClicked: function () {
                this.emit('onStarted');
            }
        });

        provide(View);
    }
);
