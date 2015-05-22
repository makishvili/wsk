modules.define(
    'dom',
    [
        'inherit',
        'y-event-emitter'
    ],
    function (
        provide,
        inherit,
        EventEmitter
    ) {

        var Dom = inherit(EventEmitter, /** @lends EventEmitter.prototype */ {
            /**
             *
             * @constructor
             */
            __constructor: function () {

            },

            /**
             * Возвращает элемент по его id
             *
             * @param {String} id
             * @returns {HTMLElement}
             */
            byId: function (id) {
                return document.getElementById(id);
            },

            /**
             * Возвращает элемент(-ы) по его class
             *
             * @param cssClass
             * @returns {HTMLElement}
             */
            byClass: function (cssClass) {
                if (document.querySelectorAll) {
                    var nodeList = document.querySelectorAll(cssClass);
                    return nodeList.length === 1 ? nodeList[0] : nodeList;
                }
            },

            /**
             * Добавляет класс
             *
             * @param {HTMLElement} elem
             * @param {String} cssClass
             * @return {HTMLElement}
             */
            addClass: function (elem, cssClass) {
                if (document.body.classList.add) {
                    elem.classList.add(cssClass);
                }
                return elem;
            },

            /**
             * Удаляет класс
             *
             * @param {HTMLElement} elem
             * @param {String} cssClass
             * @return {HTMLElement}
             */
            removeClass: function (elem, cssClass) {
                if (document.body.classList.remove) {
                    elem.classList.remove(cssClass);
                }
                return elem;
            },

            /**
             * Удаляет все классы
             *
             * @param {HTMLElement} elem
             * @return {HTMLElement}
             */
            removeAllClasses: function (elem) {
                elem.className = '';
                return elem;
            },

            /**
             * Toggles класс элемента
             *
             * @param {HTMLElement} elem
             * @param {String} cssClass
             * @return {HTMLElement}
             */
            toggleClass: function (elem, cssClass) {
                if (document.body.classList.toggle) {
                    elem.classList.toggle(cssClass);
                }
                return elem;
            },

            /**
             * Проверяет, есть ли класс у элемента
             *
             * @param {HTMLElement} elem
             * @param {String} cssClass
             * @return { Ищщдуфт}
             */
            containsClass: function (elem, cssClass) {
                if (document.body.classList.contains) {
                    return elem.classList.contains(cssClass);
                }
            }
        });

        provide(Dom);
    });
