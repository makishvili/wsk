/**
 * Modules
 *
 * Copyright (c) 2013 Filatov Dmitry (dfilatov@yandex-team.ru)
 * Dual licensed under the MIT and GPL licenses:
 * http://www.opensource.org/licenses/mit-license.php
 * http://www.gnu.org/licenses/gpl.html
 *
 * @version 0.1.1
 */

(function(global) {

var undef,

    DECL_STATES = {
        NOT_RESOLVED : 'NOT_RESOLVED',
        IN_RESOLVING : 'IN_RESOLVING',
        RESOLVED     : 'RESOLVED'
    },

    /**
     * Creates a new instance of modular system
     * @returns {Object}
     */
    create = function() {
        var curOptions = {
                trackCircularDependencies : true,
                allowMultipleDeclarations : true
            },

            modulesStorage = {},
            waitForNextTick = false,
            pendingRequires = [],

            /**
             * Defines module
             * @param {String} name
             * @param {String[]} [deps]
             * @param {Function} declFn
             */
            define = function(name, deps, declFn) {
                if(!declFn) {
                    declFn = deps;
                    deps = [];
                }

                var module = modulesStorage[name];
                if(!module) {
                    module = modulesStorage[name] = {
                        name : name,
                        decl : undef
                    };
                }

                module.decl = {
                    name       : name,
                    prev       : module.decl,
                    fn         : declFn,
                    state      : DECL_STATES.NOT_RESOLVED,
                    deps       : deps,
                    dependents : [],
                    exports    : undef
                };
            },

            /**
             * Requires modules
             * @param {String|String[]} modules
             * @param {Function} cb
             * @param {Function} [errorCb]
             */
            require = function(modules, cb, errorCb) {
                if(typeof modules === 'string') {
                    modules = [modules];
                }

                if(!waitForNextTick) {
                    waitForNextTick = true;
                    nextTick(onNextTick);
                }

                pendingRequires.push({
                    deps : modules,
                    cb   : function(exports, error) {
                        error?
                            (errorCb || onError)(error) :
                            cb.apply(global, exports);
                    }
                });
            },

            /**
             * Returns state of module
             * @param {String} name
             * @returns {String} state, possible values are NOT_DEFINED, NOT_RESOLVED, IN_RESOLVING, RESOLVED
             */
            getState = function(name) {
                var module = modulesStorage[name];
                return module?
                    DECL_STATES[module.decl.state] :
                    'NOT_DEFINED';
            },

            /**
             * Returns whether the module is defined
             * @param {String} name
             * @returns {Boolean}
             */
            isDefined = function(name) {
                return !!modulesStorage[name];
            },

            /**
             * Sets options
             * @param {Object} options
             */
            setOptions = function(options) {
                for(var name in options) {
                    if(options.hasOwnProperty(name)) {
                        curOptions[name] = options[name];
                    }
                }
            },

            getStat = function() {
                var res = {},
                    module;

                for(var name in modulesStorage) {
                    if(modulesStorage.hasOwnProperty(name)) {
                        module = modulesStorage[name];
                        (res[module.decl.state] || (res[module.decl.state] = [])).push(name);
                    }
                }

                return res;
            },

            onNextTick = function() {
                waitForNextTick = false;
                applyRequires();
            },

            applyRequires = function() {
                var requiresToProcess = pendingRequires,
                    i = 0, require;

                pendingRequires = [];

                while(require = requiresToProcess[i++]) {
                    requireDeps(null, require.deps, [], require.cb);
                }
            },

            requireDeps = function(fromDecl, deps, path, cb) {
                var unresolvedDepsCnt = deps.length;
                if(!unresolvedDepsCnt) {
                    cb([]);
                }

                var decls = [],
                    onDeclResolved = function(_, error) {
                        if(error) {
                            cb(null, error);
                            return;
                        }

                        if(!--unresolvedDepsCnt) {
                            var exports = [],
                                i = 0, decl;
                            while(decl = decls[i++]) {
                                exports.push(decl.exports);
                            }
                            cb(exports);
                        }
                    },
                    i = 0, len = unresolvedDepsCnt,
                    dep, decl;

                while(i < len) {
                    dep = deps[i++];
                    if(typeof dep === 'string') {
                        if(!modulesStorage[dep]) {
                            cb(null, buildModuleNotFoundError(dep, fromDecl));
                            return;
                        }

                        decl = modulesStorage[dep].decl;
                    }
                    else {
                        decl = dep;
                    }

                    decls.push(decl);

                    startDeclResolving(decl, path, onDeclResolved);
                }
            },

            startDeclResolving = function(decl, path, cb) {
                if(decl.state === DECL_STATES.RESOLVED) {
                    cb(decl.exports);
                    return;
                }
                else if(decl.state === DECL_STATES.IN_RESOLVING) {
                    curOptions.trackCircularDependencies && isDependenceCircular(decl, path)?
                        cb(null, buildCircularDependenceError(decl, path)) :
                        decl.dependents.push(cb);
                    return;
                }

                decl.dependents.push(cb);

                if(decl.prev && !curOptions.allowMultipleDeclarations) {
                    provideError(decl, buildMultipleDeclarationError(decl));
                    return;
                }

                curOptions.trackCircularDependencies && (path = path.slice()).push(decl);

                var isProvided = false,
                    deps = decl.prev? decl.deps.concat([decl.prev]) : decl.deps;

                decl.state = DECL_STATES.IN_RESOLVING;
                requireDeps(
                    decl,
                    deps,
                    path,
                    function(depDeclsExports, error) {
                        if(error) {
                            provideError(decl, error);
                            return;
                        }

                        depDeclsExports.unshift(function(exports, error) {
                            if(isProvided) {
                                cb(null, buildDeclAreadyProvidedError(decl));
                                return;
                            }

                            isProvided = true;
                            error?
                                provideError(decl, error) :
                                provideDecl(decl, exports);
                        });

                        decl.fn.apply(
                            {
                                name   : decl.name,
                                deps   : decl.deps,
                                global : global
                            },
                            depDeclsExports);
                    });
            },

            provideDecl = function(decl, exports) {
                decl.exports = exports;
                decl.state = DECL_STATES.RESOLVED;

                var i = 0, dependent;
                while(dependent = decl.dependents[i++]) {
                    dependent(exports);
                }

                decl.dependents = undef;
            },

            provideError = function(decl, error) {
                decl.state = DECL_STATES.NOT_RESOLVED;

                var i = 0, dependent;
                while(dependent = decl.dependents[i++]) {
                    dependent(null, error);
                }

                decl.dependents = [];
            };

        return {
            create     : create,
            define     : define,
            require    : require,
            getState   : getState,
            isDefined  : isDefined,
            setOptions : setOptions,
            getStat    : getStat
        };
    },

    onError = function(e) {
        nextTick(function() {
            throw e;
        });
    },

    buildModuleNotFoundError = function(name, decl) {
        return Error(decl?
            'Module "' + decl.name + '": can\'t resolve dependence "' + name + '"' :
            'Required module "' + name + '" can\'t be resolved');
    },

    buildCircularDependenceError = function(decl, path) {
        var strPath = [],
            i = 0, pathDecl;
        while(pathDecl = path[i++]) {
            strPath.push(pathDecl.name);
        }
        strPath.push(decl.name);

        return Error('Circular dependence has been detected: "' + strPath.join(' -> ') + '"');
    },

    buildDeclAreadyProvidedError = function(decl) {
        return Error('Declaration of module "' + decl.name + '" has already been provided');
    },

    buildMultipleDeclarationError = function(decl) {
        return Error('Multiple declarations of module "' + decl.name + '" have been detected');
    },

    isDependenceCircular = function(decl, path) {
        var i = 0, pathDecl;
        while(pathDecl = path[i++]) {
            if(decl === pathDecl) {
                return true;
            }
        }
        return false;
    },

    nextTick = (function() {
        var fns = [],
            enqueueFn = function(fn) {
                return fns.push(fn) === 1;
            },
            callFns = function() {
                var fnsToCall = fns, i = 0, len = fns.length;
                fns = [];
                while(i < len) {
                    fnsToCall[i++]();
                }
            };

        if(typeof process === 'object' && process.nextTick) { // nodejs
            return function(fn) {
                enqueueFn(fn) && process.nextTick(callFns);
            };
        }

        if(global.setImmediate) { // ie10
            return function(fn) {
                enqueueFn(fn) && global.setImmediate(callFns);
            };
        }

        if(global.postMessage && !global.opera) { // modern browsers
            var isPostMessageAsync = true;
            if(global.attachEvent) {
                var checkAsync = function() {
                        isPostMessageAsync = false;
                    };
                global.attachEvent('onmessage', checkAsync);
                global.postMessage('__checkAsync', '*');
                global.detachEvent('onmessage', checkAsync);
            }

            if(isPostMessageAsync) {
                var msg = '__modules' + (+new Date()),
                    onMessage = function(e) {
                        if(e.data === msg) {
                            e.stopPropagation && e.stopPropagation();
                            callFns();
                        }
                    };

                global.addEventListener?
                    global.addEventListener('message', onMessage, true) :
                    global.attachEvent('onmessage', onMessage);

                return function(fn) {
                    enqueueFn(fn) && global.postMessage(msg, '*');
                };
            }
        }

        var doc = global.document;
        if('onreadystatechange' in doc.createElement('script')) { // ie6-ie8
            var head = doc.getElementsByTagName('head')[0],
                createScript = function() {
                    var script = doc.createElement('script');
                    script.onreadystatechange = function() {
                        script.parentNode.removeChild(script);
                        script = script.onreadystatechange = null;
                        callFns();
                    };
                    head.appendChild(script);
                };

            return function(fn) {
                enqueueFn(fn) && createScript();
            };
        }

        return function(fn) { // old browsers
            enqueueFn(fn) && setTimeout(callFns, 0);
        };
    })();

if(typeof exports === 'object') {
    module.exports = create();
}
else {
    global.modules = create();
}

})(this);

/**
 * @module inherit
 * @version 2.2.2
 * @author Filatov Dmitry <dfilatov@yandex-team.ru>
 * @description This module provides some syntax sugar for "class" declarations, constructors, mixins, "super" calls and static members.
 */

(function(global) {

var hasIntrospection = (function(){'_';}).toString().indexOf('_') > -1,
    emptyBase = function() {},
    hasOwnProperty = Object.prototype.hasOwnProperty,
    objCreate = Object.create || function(ptp) {
        var inheritance = function() {};
        inheritance.prototype = ptp;
        return new inheritance();
    },
    objKeys = Object.keys || function(obj) {
        var res = [];
        for(var i in obj) {
            hasOwnProperty.call(obj, i) && res.push(i);
        }
        return res;
    },
    extend = function(o1, o2) {
        for(var i in o2) {
            hasOwnProperty.call(o2, i) && (o1[i] = o2[i]);
        }

        return o1;
    },
    toStr = Object.prototype.toString,
    isArray = Array.isArray || function(obj) {
        return toStr.call(obj) === '[object Array]';
    },
    isFunction = function(obj) {
        return toStr.call(obj) === '[object Function]';
    },
    noOp = function() {},
    needCheckProps = true,
    testPropObj = { toString : '' };

for(var i in testPropObj) { // fucking ie hasn't toString, valueOf in for
    testPropObj.hasOwnProperty(i) && (needCheckProps = false);
}

var specProps = needCheckProps? ['toString', 'valueOf'] : null;

function getPropList(obj) {
    var res = objKeys(obj);
    if(needCheckProps) {
        var specProp, i = 0;
        while(specProp = specProps[i++]) {
            obj.hasOwnProperty(specProp) && res.push(specProp);
        }
    }

    return res;
}

function override(base, res, add) {
    var addList = getPropList(add),
        j = 0, len = addList.length,
        name, prop;
    while(j < len) {
        if((name = addList[j++]) === '__self') {
            continue;
        }
        prop = add[name];
        if(isFunction(prop) &&
                (!hasIntrospection || prop.toString().indexOf('.__base') > -1)) {
            res[name] = (function(name, prop) {
                var baseMethod = base[name]?
                        base[name] :
                        name === '__constructor'? // case of inheritance from plane function
                            res.__self.__parent :
                            noOp;
                return function() {
                    var baseSaved = this.__base;
                    this.__base = baseMethod;
                    var res = prop.apply(this, arguments);
                    this.__base = baseSaved;
                    return res;
                };
            })(name, prop);
        } else {
            res[name] = prop;
        }
    }
}

function applyMixins(mixins, res) {
    var i = 1, mixin;
    while(mixin = mixins[i++]) {
        res?
            isFunction(mixin)?
                inherit.self(res, mixin.prototype, mixin) :
                inherit.self(res, mixin) :
            res = isFunction(mixin)?
                inherit(mixins[0], mixin.prototype, mixin) :
                inherit(mixins[0], mixin);
    }
    return res || mixins[0];
}

/**
* Creates class
* @exports
* @param {Function|Array} [baseClass|baseClassAndMixins] class (or class and mixins) to inherit from
* @param {Object} prototypeFields
* @param {Object} [staticFields]
* @returns {Function} class
*/
function inherit() {
    var args = arguments,
        withMixins = isArray(args[0]),
        hasBase = withMixins || isFunction(args[0]),
        base = hasBase? withMixins? applyMixins(args[0]) : args[0] : emptyBase,
        props = args[hasBase? 1 : 0] || {},
        staticProps = args[hasBase? 2 : 1],
        res = props.__constructor || (hasBase && base.prototype.__constructor)?
            function() {
                return this.__constructor.apply(this, arguments);
            } :
            hasBase?
                function() {
                    return base.apply(this, arguments);
                } :
                function() {};

    if(!hasBase) {
        res.prototype = props;
        res.prototype.__self = res.prototype.constructor = res;
        return extend(res, staticProps);
    }

    extend(res, base);

    res.__parent = base;

    var basePtp = base.prototype,
        resPtp = res.prototype = objCreate(basePtp);

    resPtp.__self = resPtp.constructor = res;

    props && override(basePtp, resPtp, props);
    staticProps && override(base, res, staticProps);

    return res;
}

inherit.self = function() {
    var args = arguments,
        withMixins = isArray(args[0]),
        base = withMixins? applyMixins(args[0], args[0][0]) : args[0],
        props = args[1],
        staticProps = args[2],
        basePtp = base.prototype;

    props && override(basePtp, basePtp, props);
    staticProps && override(base, base, staticProps);

    return base;
};

var defineAsGlobal = true;
if(typeof exports === 'object') {
    module.exports = inherit;
    defineAsGlobal = false;
}

if(typeof modules === 'object') {
    modules.define('inherit', function(provide) {
        provide(inherit);
    });
    defineAsGlobal = false;
}

if(typeof define === 'function') {
    define(function(require, exports, module) {
        module.exports = inherit;
    });
    defineAsGlobal = false;
}

defineAsGlobal && (global.inherit = inherit);

})(this);

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

modules.define(
    'messages',
    [
        'inherit',
        'dom'
    ],
    function (provide,
              inherit,
              DOM) {

        var Messages = inherit(/** @lends Messages.prototype */{},
            {
                /**
                 * dom module
                 */
                _dom: new DOM(),

                /**
                 * Hide message after, msec. False if show infinitly
                 *
                 * @type {Number|Boolean}
                 */
                _autohide: 10000,

                /**
                 * Get parent block where message appear
                 *
                 * @returns {HTMLElement|undefined}
                 */
                _getMessagesBlock: function () {
                    return this._dom.byId('messages');
                },

                /**
                 * Shows message
                 *
                 * @param {String} text message
                 * @param {error|info|warning} type default = error
                 */
                show: function (text, type) {
                    type = type || 'error';
                    var div = document.createElement('DIV');
                    this._dom.addClass(div, type);
                    div.innerText = text;
                    this._getMessagesBlock().appendChild(div);

                    if (this._autohide && typeof(this._autohide) === 'number') {
                        setTimeout(this.hide.bind(this), this._autohide);
                    }
                },

                /**
                 * Hides all messages
                 */
                hide: function () {
                    this._getMessagesBlock().innerHTML = '';
                }
            });

        provide(Messages);
    });

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

                // Контейнер для текста с командой активации
                this.spotterCmd = this.byId('spotter-cmd');

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

                // Установливает текст команды активации, чтобы его увидел пользователь.
                this.spotterCmd.innerText = phrase;

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

modules.define(
    'webspeechkit',
    function (provide) {

(function (global){

(function (namespace) {
    'use strict';

    if (typeof namespace.ya === 'undefined') {
        namespace.ya = {};
    }
    if (typeof namespace.ya.speechkit === 'undefined') {
        namespace.ya.speechkit = {};
    }

    namespace.ya.speechkit.Equalizer = function (target, recorder) {
        this.recorder = recorder;
        this.element = document.getElementById(target);
        this.element.style.textAlign = 'center';
        this.element.innerText = '';
        this.graf = document.createElement('canvas');
        this.graf.style.width = '100%';
        this.graf.style.height = '100%';
        this.graf.width = 1000;

        this.element.appendChild(this.graf);

        if (!navigator.cancelAnimationFrame) {
            navigator.cancelAnimationFrame = navigator.webkitCancelAnimationFrame ||
                                             navigator.mozCancelAnimationFrame;
        }
        if (!navigator.requestAnimationFrame) {
            navigator.requestAnimationFrame = navigator.webkitRequestAnimationFrame ||
                                              navigator.mozRequestAnimationFrame;
        }

        this.refID = null;

        this.startDrawRealtime();
    };

    namespace.ya.speechkit.Equalizer.prototype = {
        destroy: function () {
            this.stopDrawRealtime();
            this.element.removeChild(this.graf);
        },
        stopDrawRealtime: function () {
            window.cancelAnimationFrame(this.rafID);
            this.rafID = null;
        },
        startDrawRealtime: function () {
            var _this = this;
            function updateAnalysers(time) {
                if (!_this.analyserNode) {
                    if (_this.recorder) {
                        _this.analyserNode = _this.recorder.getAnalyserNode();
                        _this.context = _this.recorder.context;
                    } else {
                        return;
                    }
                }

                var canvasWidth = _this.graf.width;
                var canvasHeight = _this.graf.height;
                var analyserContext = _this.graf.getContext('2d');

                var SPACING = 2;
                var BAR_WIDTH = 1;
                var numBars = Math.round(canvasWidth / SPACING);
                var freqByteData = new Uint8Array(_this.analyserNode.frequencyBinCount);

                _this.analyserNode.getByteFrequencyData(freqByteData);

                analyserContext.clearRect(0, 0, canvasWidth, canvasHeight);
                analyserContext.fillStyle = '#F6D565';
                analyserContext.lineCap = 'round';
                var multiplier = _this.analyserNode.frequencyBinCount / numBars;

                for (var i = 0; i < numBars; ++i) {
                    var magnitude = 0;
                    var offset = Math.floor(i * multiplier);
                    for (var j = 0; j < multiplier; j++) {
                        magnitude += freqByteData[offset + j];
                    }
                    magnitude = magnitude / multiplier / 2;
                    analyserContext.fillStyle = 'hsl( ' + Math.round(i * 60 / numBars) + ', 100%, 50%)';
                    analyserContext.fillRect(i * SPACING, canvasHeight, BAR_WIDTH, -magnitude);
                }
                _this.rafID = window.requestAnimationFrame(updateAnalysers);
            }

            this.rafID = window.requestAnimationFrame(updateAnalysers);
        }
    };
}(this));

(function (namespace) {
    'use strict';

    if (typeof namespace.ya === 'undefined') {
        namespace.ya = {};
    }
    if (typeof namespace.ya.speechkit === 'undefined') {
        namespace.ya.speechkit = {};
    }

    /**
     * Creates a new recognition session
     * @class
     * @classdesc Class for low-level recognition process control
     * @param {Object} options Set of callbacks for initialization, recoginition and error handling
     * @param {Recognizer~initCallback} options.onInit - Callback to be called upon successful session initialization
     * @param {Recognizer~dataCallback} options.onResult Callback to be called with recognized data
     * @param {Recognizer~errorCallback} options.onError Callback to be called upon error
     * @param {String} options.uuid - Recognition session UUID (defaults to ya.speechkit.settings.uuid)
     * @param {String} options.key - API key (defaults to ya.speechkit.settings.apiKey)
     * @param {ya.speechkit.FORMAT} options.format - Format of audio stream (defaults to ya.speechkit.settings.format)
     * @param {String} options.url - URL for recognition process (defaults to ya.speechkit.settings.asrUrl)
     * @param {Boolean} options.punctuation - Will recognition try to make punctuation or not (defaults to True)
     * @param {String} options.model - Model for recognition (defaults to ya.speechkit.settings.model)
     * @param {String} options.lang - Language for recognition (defaults to ya.speechkit.settings.lang)
     * @memberof ya.speechkit
     * @alias Recognizer
     */
    var Recognizer = function (options) {
        if (!(this instanceof namespace.ya.speechkit.Recognizer)) {
            return new namespace.ya.speechkit.Recognizer();
        }
        this.options = namespace.ya.speechkit._extend(
                        {key: namespace.ya.speechkit.settings.apiKey,
                         uuid: namespace.ya.speechkit.settings.uuid,
                         url: namespace.ya.speechkit.settings.websocketProtocol +
                            namespace.ya.speechkit.settings.asrUrl,
                         onInit: function () {},
                         onResult: function () {},
                         onError: function () {},
                         punctuation: true,
                        },
                        options);
        this.sessionId = null;
        this.socket = null;

        this.buffered = [];
        this.totaldata = 0;
    };

    Recognizer.prototype = {
        /**
         * Send raw data to websocket
         * @param data Any data to send to websocket (json string, raw audio data)
         * @private
         */
        _sendRaw: function (data) {
            if (this.socket) {
                this.socket.send(data);
            }
        },
        /**
         * Stringify JSON and send it to websocket
         * @param {Object} json Object needed to be send to websocket
         * @private
         */
        _sendJson: function (json) {
            this._sendRaw(JSON.stringify({type: 'message', data: json}));
        },
        /**
         * Starts recognition process
         */
        start: function () {
            this.socket = new WebSocket(this.options.url);

            this.socket.onopen = function () {
                // {uuid: uuid, key: key, format: audioFormat, punctuation: punctuation ...
                // console.log("Initial request: " + JSON.stringify(this.options));
                this._sendJson(this.options);
            }.bind(this);

            this.socket.onmessage = function (e) {
                var message = JSON.parse(e.data);

                if (message.type == 'InitResponse'){
                    this.sessionId = message.data.sessionId;
                    this.options.onInit(message.data.sessionId, message.data.code);
                } else if (message.type == 'AddDataResponse'){
                    this.options.onResult(message.data.text, message.data.uttr, message.data.merge);
                } else if (message.type == 'Error'){
                    this.options.onError('Session ' + this.sessionId + ': ' + message.data);
                    this.close();
                } else {
                    this.options.onError('Session ' + this.sessionId + ': ' + message);
                    this.close();
                }
            }.bind(this);

            this.socket.onerror = function (error) {
                this.options.onError('Socket error: ' + error.message);
            }.bind(this);

            this.socket.onclose = function (event) {
            }.bind(this);
        },
        /**
         * Sends data for recognition
         * @description If there is no active session, then data will be buffered and sent after session establishment
         * @param {ArrayBuffer} data Raw audio data
         */
        addData: function (data) {
            this.totaldata += data.byteLength;

            if (!this.sessionId) {
                this.buffered.push(data);
                return;
            }

            for (var i = 0; i < this.buffered.length; i++){
                this._sendRaw(new Blob([this.buffered[i]], {type: this.options.format}));
                this.totaldata += this.buffered[i].byteLength;
            }

            this.buffered = [];
            this._sendRaw(new Blob([data], {type: this.options.format}));
        },
        /**
         * Closes recognition session
         */
        close: function () {
            this.options = {onInit: function () {}, onResult: function () {}, onError: function () {}};

            if (this.socket) {
                this.socket.close();
            }
            this.socket = null;
        }
    };

    namespace.ya.speechkit.Recognizer = Recognizer;

    /**
     * Callback for successful recognition session initialization
     * @callback Recognizer~initCallback
     * @param {String} sessionId - Session identifier
     * @param {Number} code - Http status of initialization response
     */

    /**
     * Callback for recognition error message
     * @callback Recognizer~errorCallback
     * @param {String} message - Error message
     */

    /**
     * Callback for recognition error message
     * @callback Recognizer~dataCallback
     * @param {String} text - Recognized text
     * @param {Boolean} utterance - Is this a final text result for this utterance
     * @param {Number} merge - How many requests were merged in this response
     */
}(this));

(function (namespace) {
    'use strict';

    /**
     * namespace for Yandex.Speechkit JS code
     * @namespace ya.speechkit
     */
    if (typeof namespace.ya === 'undefined') {
        namespace.ya = {};
    }
    if (typeof namespace.ya.speechkit === 'undefined') {
        namespace.ya.speechkit = {};
    }

    /** Flag of initialization status
     * @private
     * @memberof ya.speechkit
     */
    namespace.ya.speechkit._recorderInited = false;

    /** Set of supported formats
     * @readonly
     * @enum
     * @memberof ya.speechkit
     */
    namespace.ya.speechkit.FORMAT = {
        /** PCM 8KHz gives bad quality of recognition and small file size */
        PCM8: {format: 'pcm', sampleRate: 8000, mime: 'audio/x-pcm;bit=16;rate=8000', bufferSize: 1024},
        /** PCM 16 KHz gives the best quality of recognition and average file size */
        PCM16: {format: 'pcm', sampleRate: 16000, mime: 'audio/x-pcm;bit=16;rate=16000', bufferSize: 2048},
        /** PCM 44 KHz gives big file size and lags on recognition */
        PCM44: {format: 'pcm', sampleRate: 44100, mime: 'audio/x-pcm;bit=16;rate=44100', bufferSize: 4096},
    };

    namespace.ya.speechkit._stream = null;

    /**
     * Deep copies fileds from object 'from' to object 'to'
     * @param {Object} from Source object
     * @param {Object} to Destination object
     * @private
     */
    namespace.ya.speechkit._extend = function (to, from) {
        var i;
        var toStr = Object.prototype.toString;
        var astr = '[object Array]';
        to = to || {};

        for (i in from) {
            if (from.hasOwnProperty(i)) {
                if (typeof from[i] === 'object') {
                    to[i] = (toStr.call(from[i]) === astr) ? [] : {};
                    namespace.ya.speechkit._extend(to[i], from[i]);
                } else {
                    to[i] = from[i];
                }
            }
        }
        return to;
    };

    /**
     * Records sound from mic
     * @class
     * @memberof ya.speechkit
     * @alias Recorder
     */
    var Recorder = function ()
    {
        if (!namespace.ya.speechkit._stream) {
            return null;
        }

        if (!(this instanceof Recorder)) {
            return new Recorder();
        }

        this.worker = namespace.ya.speechkit.newWorker();

        this.recording = false;

        this.paused = false;
        this.lastDataOnPause = 0;

        this.nullsArray = [];

        this.currCallback = null;
        this.buffCallback = null;
        this.startCallback = null;

        this.worker.onmessage = function (e) {
            if (e.data.command == 'int16stream')
            {
                var data = e.data.buffer;

                if (this.startCallback) {
                    this.startCallback(data);
                }
            } else if (e.data.command == 'getBuffers' && this.buffCallback) {
                this.buffCallback(e.data.blob);
            } else if (e.data.command == 'clear' && this.currCallback) {
                this.currCallback();
            } else if (this.currCallback) {
                this.currCallback(e.data.blob);
            }
        }.bind(this);

    };

    Recorder.prototype = {
        /**
         * Creates an input point for a given audio format (sets samplerate and buffer size
         * @param {ya.speechkit.FORMAT} format audio format (it's samplerate and bufferSize are being used)
         * @private
         */
        _createNode: function (format) {
            this.context = namespace.ya.speechkit.audiocontext || new namespace.ya.speechkit.AudioContext();
            namespace.ya.speechkit.audiocontext = this.context;

            this.inputPoint = this.context.createBiquadFilter();
            this.inputPoint.type = 'lowpass';
            this.inputPoint.frequency.value = format.sampleRate;
            this.inputPoint.Q.value = 1;
            this.inputPoint.gain.value = 5;

            this.audioInput = this.context.createMediaStreamSource(namespace.ya.speechkit._stream);
            this.audioInput.connect(this.inputPoint);

            if (!this.context.createScriptProcessor) {
                this.node = this.context.createJavaScriptNode(format.bufferSize, 2, 2);
            } else {
                this.node = this.context.createScriptProcessor(format.bufferSize, 2, 2);
            }

            this.node.onaudioprocess = function (e) {
                if (!this.recording) {return;}

                if (this.paused) {
                    if (Number(new Date()) - this.lastDataOnPause > 2000) {
                        this.lastDataOnPause = Number(new Date());
                        this.worker.postMessage({
                            command: 'record',
                            buffer: [
                                this.nullsArray,
                                this.nullsArray
                            ]
                        });
                    }
                } else {
                    this.worker.postMessage({
                        command: 'record',
                        buffer: [
                            e.inputBuffer.getChannelData(0),
                            e.inputBuffer.getChannelData(1)
                        ]
                    });
                }
            }.bind(this);

            this.inputPoint.connect(this.node);
            this.node.connect(this.context.destination);
        },
        /**
         * Puts recorder into paused mode
         * @description Recorder in this mode will call on startCallback with empty sound as a heartbeat
         */
        pause: function () {
            this.paused = true;
            this.lastDataOnPause = Number(new Date());
        },
        /**
         * Returns AudioContext which sound is being recordered
         * @returns {AudioContext} Current AudioContext
         * @see https://developer.mozilla.org/en-US/docs/Web/API/AudioContext
         */
        getAudioContext: function () {
            return this.context;
        },
        /**
         * Returns AnalyserNode for realtime audio record analysis
         * @returns {AnalyserNode}
         * @see https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode
         */
        getAnalyserNode: function () {
            this.context = namespace.ya.speechkit.audiocontext || new namespace.ya.speechkit.AudioContext();
            namespace.ya.speechkit.audiocontext = this.context;
            var analyserNode = this.context.createAnalyser();
            analyserNode.fftSize = 2048;
            this.inputPoint.connect(analyserNode);
            return analyserNode;
        },
        /**
         * Returns true if recorder is in paused mode
         * @returns {Boolean} True if recorder is paused (not stopped!)
         */
        isPaused: function () {
            return this.paused;
        },
        /**
         * Starts recording
         * @param {Recorder~streamCallback} cb Callback for 16-bit audio stream
         * @param {ya.speechkit.FORMAT} format Format for audio recording
         */
        start: function (cb, format) {
            if (!this.node) {
                this._createNode(format);
            }

            if (this.isPaused()) {
                this.paused = false;
                return;
            }

            this.inputPoint.frequency.value = format.sampleRate;

            this.startCallback = cb;
            this.worker.postMessage({
                command: 'init',
                config: {
                    sampleRate: this.context.sampleRate,
                    format: format || namespace.ya.speechkit.FORMAT.PCM16,
                    channels: this.channelCount,
                }
            });

            this.nullsArray = [];
            var bufferLen = (format || namespace.ya.speechkit.FORMAT.PCM16).bufferSize;
            for (var i = 0; i < bufferLen; i++) {
                this.nullsArray.push(0);
            }

            this.clear(function () {this.recording = true;}.bind(this));
        },
        /**
         * Stops recording
         * @param {Recorder~wavCallback} cb Callback for finallized record in a form of wav file
         * @param {Number} channelCount Channel count in audio file (1 or 2)
         */
        stop: function (cb, channelCount) {
            this.recording = false;

            this.exportWAV(function (blob) {
                cb(blob);
            }, channelCount || 2);
        },
        /**
         * Returns true if recording is going on (or is on pause)
         * @returns {Boolean} true if recorder is recording sound or sending heartbeat on pause
         */
        isRecording: function () {
            return this.recording;
        },
        /**
         * Clears recorder sound buffer
         * @param {Recorder~clearCallback} cb Callback for indication of clearing process finish
         */
        clear: function (cb) {
            this.currCallback = cb;
            this.worker.postMessage({command: 'clear'});
        },
        /**
         * Returns recordered sound buffers
         * @param {Recorder~buffersCallback} cb Callback for recordered buffers
         */
        getBuffers: function (cb) {
            this.buffCallback = cb;
            this.worker.postMessage({command: 'getBuffers'});
        },
        /**
         * Exports recordered sound buffers in a wav-file
         * @param {Recorder~wavCallback} cb Callback for wav-file
         */
        exportWAV: function (cb, channelCount) {
            this.currCallback = cb;
            var type = 'audio/wav';

            if (!this.currCallback) {throw new Error('Callback not set');}

            var exportCommand = 'export' + (channelCount != 2 && 'Mono' || '') + 'WAV';

            this.worker.postMessage({
                command: exportCommand,
                type: type
            });
        }
    };

    namespace.ya.speechkit.Recorder = Recorder;

    /**
     * Ask user to share his mic and initialize Recorder class
     * @param {ya.speechkit.initSuccessCallback} initSuccess Callback to call for successful initialization
     * @param {ya.speechkit.initFailCallback} initFail Callback to call on error
     * @memberof ya.speechkit
     */
    namespace.ya.speechkit.initRecorder = function (initSuccess, initFail)
    {
        namespace.ya.speechkit.AudioContext = window.AudioContext || window.webkitAudioContext;

        navigator.getUserMedia = (navigator.getUserMedia ||
        navigator.mozGetUserMedia ||
        navigator.msGetUserMedia ||
        navigator.webkitGetUserMedia);

        namespace.ya.speechkit._stream = null;

        var badInitialization = function (err) {
            namespace.ya.speechkit._recorderInited = false;
            initFail(err);
        };

        if (navigator.getUserMedia)
        {
            navigator.getUserMedia(
                {audio: true},
                function (stream) {
                    namespace.ya.speechkit._stream = stream;
                    namespace.ya.speechkit._recorderInited = true;
                    initSuccess();
                },
                function (err) {
                    badInitialization('Couldn\'t initialize Yandex Webspeechkit: ' + err);
                }
            );
        } else {
            badInitialization('Your browser doesn\'t support Web Audio API. ' +
                              'Please, use Yandex.Browser: https://browser.yandex.ru');
        }
    };

    /**
     * Callback for successful initialization
     * @callback initSuccessCallback
     * @memberof ya.speechkit
     */

    /**
     * Callback for unsuccessful initialization
     * @callback initFailCallback
     * @param {String} error Error message
     * @memberof ya.speechkit
     */

    /**
     * Callback for wav file export
     * @callback Recorder~wavCallback
     * @param {Blob} data - WAV file
     */

    /**
     * Callback for recordered audio buffers
     * @callback Recorder~buffersCallback
     * @param {Float32Array[]} buffers - recordered buffers for both channels (2 elements)
     */

    /**
     * Callback to indicate Recorder's readiness to record more audio
     * @callback Recorder~clearCallback
     */

    /**
     * Callback for realtime pcm streaming
     * @callback Recorder~streamCallback
     * @param {ArrayBuffer} stream - 16bit pcm stream
     */

}(this));

(function (namespace) {
    'use strict';

    if (typeof namespace.ya === 'undefined') {
        namespace.ya = {};
    }
    if (typeof namespace.ya.speechkit === 'undefined') {
        namespace.ya.speechkit = {};
    }

    function _makeWorker(script) {
        var URL = window.URL || window.webkitURL;
        var Blob = window.Blob;
        var Worker = window.Worker;

        if (!URL || !Blob || !Worker || !script) {
            return null;
        }

        var blob = new Blob([script]);
        var worker = new Worker(URL.createObjectURL(blob));
        return worker;
    }

    var inline_worker = 'var speex_loaded = false;' +
    'var recLength = 0;' +
    'var recBuffersL = [];' +
    'var recBuffersR = [];' +
    'var sampleRate;' +
    'var outSampleRate;' +
    'var tmp_buf = 0;' +
    'var need_buf_size = 4096;' +
    'var speex_converter = null;' +
    ' ' +
    'this.onmessage = function (e) {' +
    '    switch (e.data.command) {' +
    '    case \'init\':' +
    '        init(e.data.config);' +
    '        break;' +
    '    case \'record\':' +
    '        record(e.data.buffer);' +
    '        break;' +
    '    case \'exportWAV\':' +
    '        exportWAV(e.data.type);' +
    '        break;' +
    '    case \'exportMonoWAV\':' +
    '        exportMonoWAV(e.data.type);' +
    '        break;' +
    '    case \'getBuffers\':' +
    '        getBuffers();' +
    '        break;' +
    '    case \'clear\':' +
    '        clear();' +
    '        break;' +
    '    }' +
    '};' +
    ' ' +
    'function init(config) {' +
    '    sampleRate = config.sampleRate;' +
    '    outSampleRate = config.format.sampleRate || sampleRate;' +
    '    need_buf_size = config.format.bufferSize || 4096;' +
    '    speex_converter = null;' +
    '    /*if (config.format.format == \'speex\') {' +
    '        if (!speex_loaded) {' +
    '            importScripts(\'./speex.min.js\');' +
    '            speex_loaded = true;' +
    '        }' +
    '        need_buf_size /= 16;' +
    '        speex_converter = new SpeexConverter(outSampleRate);' +
    '    }*/' +
    '}' +
    ' ' +
    'function record(inputBuffer) {' +
    '    if (outSampleRate == sampleRate) {' +
    '        recBuffersL.push(inputBuffer[0]);' +
    '        recBuffersR.push(inputBuffer[1]);' +
    '        recLength += inputBuffer[0].length;' +
    ' ' +
    '        var samples = inputBuffer[0];' +
    '        var buffer = new ArrayBuffer(samples.length * 2);' +
    '        var view = new DataView(buffer);' +
    '        floatTo16BitPCM(view, 0, samples);' +
    '        this.postMessage({command: \'int16stream\', buffer: buffer});' +
    '    } else {' +
    '        var resample = function (inbuf) {' +
    '            var result = new Float32Array(Math.floor(inbuf.length * outSampleRate / sampleRate));' +
    '            var bin = 0;' +
    '            var num = 0;' +
    '            var indexIn = 0;' +
    '            var indexOut = 0;' +
    '            while (indexIn < result.length) {' +
    '                bin = 0;' +
    '                num = 0;' +
    '                while (indexOut < Math.min(inbuf.length, (indexIn + 1) * sampleRate / outSampleRate)) {' +
    '                    bin += inbuf[indexOut];' +
    '                    num += 1;' +
    '                    indexOut++;' +
    '                }' +
    '                result[indexIn] = bin / num;' +
    '                indexIn++;' +
    '            }' +
    '            return result;' +
    '        };' +
    ' ' +
    '        var resin0 = resample(inputBuffer[0]);' +
    '        var resin1 = resample(inputBuffer[1]);' +
    ' ' +
    '        recBuffersL.push(resin0);' +
    '        recBuffersR.push(resin1);' +
    '        recLength += resin0.length;' +
    ' ' +
    '        var result = new Int16Array(resin0.length);' +
    ' ' +
    '        for (var i = 0 ; i < resin0.length ; i++) {' +
    '            result[i] = Math.ceil((resin0[i] + resin0[i]) * 16383);' +
    '        }' +
    '        result = result;' +
    ' ' +
    '        if (speex_converter) {' +
    '            result = speex_converter.convert(result);' +
    '        } else {' +
    '            result = result.buffer;' +
    '        }' +
    ' ' +
    '        if (!tmp_buf) {' +
    '            tmp_buf = result;' +
    '        } else {' +
    '            var tmp = new DataView(new ArrayBuffer(tmp_buf.byteLength + result.byteLength));' +
    '            tmp_buf = new DataView(tmp_buf);' +
    '            result = new DataView(result);' +
    ' ' +
    '            for (i = 0; i < tmp_buf.byteLength; i++) {' +
    '                tmp.setUint8(i, tmp_buf.getUint8(i));' +
    '            }' +
    ' ' +
    '            for (i = 0; i < result.byteLength; i++) {' +
    '                tmp.setUint8(i + tmp_buf.byteLength, result.getUint8(i));' +
    '            }' +
    ' ' +
    '            tmp_buf = tmp.buffer;' +
    '        }' +
    ' ' +
    '        if (tmp_buf.byteLength >= need_buf_size) {' +
    '            this.postMessage({command: \'int16stream\', buffer: tmp_buf});' +
    '            tmp_buf = false;' +
    '        }' +
    '    }' +
    '}' +
    ' ' +
    'function exportWAV(type) {' +
    '    var bufferL = mergeBuffers(recBuffersL, recLength);' +
    '    var bufferR = mergeBuffers(recBuffersR, recLength);' +
    '    var interleaved = interleave(bufferL, bufferR);' +
    '    var dataview = encodeWAV(interleaved);' +
    '    var audioBlob = new Blob([dataview], {type: type});' +
    ' ' +
    '    this.postMessage({command: \'exportWAV\', blob: audioBlob});' +
    '}' +
    ' ' +
    'function exportMonoWAV(type) {' +
    '    var bufferL = mergeBuffers(recBuffersL, recLength);' +
    '    var dataview = encodeWAV(bufferL, true);' +
    '    var audioBlob = new Blob([dataview], {type: type});' +
    ' ' +
    '    this.postMessage({command: \'exportMonoWAV\', blob: audioBlob});' +
    '}' +
    ' ' +
    'function getBuffers() {' +
    '    var buffers = [];' +
    '    buffers.push(mergeBuffers(recBuffersL, recLength));' +
    '    buffers.push(mergeBuffers(recBuffersR, recLength));' +
    '    this.postMessage({command: \'getBuffers\', blob: buffers});' +
    '}' +
    ' ' +
    'function clear() {' +
    '    recLength = 0;' +
    '    recBuffersL = [];' +
    '    recBuffersR = [];' +
    '    if (speex_converter) {' +
    '        speex_converter.clear();' +
    '    }' +
    '    this.postMessage({command: \'clear\'});' +
    '}' +
    ' ' +
    'function mergeBuffers(recBuffers, recLength) {' +
    '    var result = new Float32Array(recLength);' +
    '    var offset = 0;' +
    '    for (var i = 0; i < recBuffers.length; i++){' +
    '        result.set(recBuffers[i], offset);' +
    '        offset += recBuffers[i].length;' +
    '    }' +
    '    return result;' +
    '}' +
    ' ' +
    'function interleave(inputL, inputR) {' +
    '    var length = inputL.length + inputR.length;' +
    '    var result = new Float32Array(length);' +
    ' ' +
    '    var index = 0;' +
    '    var inputIndex = 0;' +
    ' ' +
    '    while (index < length){' +
    '        result[index++] = inputL[inputIndex];' +
    '        result[index++] = inputR[inputIndex];' +
    '        inputIndex++;' +
    '    }' +
    '    return result;' +
    '}' +
    ' ' +
    'function floatTo16BitPCM(output, offset, input) {' +
    '    for (var i = 0; i < input.length; i++, offset += 2){' +
    '        var s = Math.max(-1, Math.min(1, input[i]));' +
    '        output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);' +
    '    }' +
    '}' +
    ' ' +
    'function writeString(view, offset, string) {' +
    '    for (var i = 0; i < string.length; i++){' +
    '        view.setUint8(offset + i, string.charCodeAt(i));' +
    '    }' +
    '}' +
    ' ' +
    'function encodeWAV(samples, mono) {' +
    '    var buffer = new ArrayBuffer(44 + samples.length * 2);' +
    '    var view = new DataView(buffer);' +
    ' ' +
    '    /* RIFF identifier */' +
    '    writeString(view, 0, \'RIFF\');' +
    '    /* file length */' +
    '    view.setUint32(4, 32 + samples.length * 2, true);' +
    '    /* RIFF type */' +
    '    writeString(view, 8, \'WAVE\');' +
    '    /* format chunk identifier */' +
    '    writeString(view, 12, \'fmt \');' +
    '    /* format chunk length */' +
    '    view.setUint32(16, 16, true);' +
    '    /* sample format (raw) */' +
    '    view.setUint16(20, 1, true);' +
    '    /* channel count */' +
    '    view.setUint16(22, mono ? 1 : 2, true);' +
    '    /* sample rate */' +
    '    view.setUint32(24, outSampleRate, true);' +
    '    /* block align (channel count * bytes per sample) */' +
    '    var block_align = mono ? 2 : 4;' +
    '    /* byte rate (sample rate * block align) */' +
    '    view.setUint32(28, outSampleRate * block_align, true);' +
    '    /* block align (channel count * bytes per sample) */' +
    '    view.setUint16(32, block_align, true);' +
    '    /* bits per sample */' +
    '    view.setUint16(34, 16, true);' +
    '    /* data chunk identifier */' +
    '    writeString(view, 36, \'data\');' +
    '    /* data chunk length */' +
    '    view.setUint32(40, samples.length * 2, true);' +
    ' ' +
    '    floatTo16BitPCM(view, 44, samples);' +
    ' ' +
    '    return view;' +
    '}';

    namespace.ya.speechkit.newWorker = function () {
        return _makeWorker(inline_worker);
    };
}(this));


(function (namespace) {
    'use strict';

    if (typeof namespace.ya === 'undefined') {
        namespace.ya = {};
    }
    if (typeof namespace.ya.speechkit === 'undefined') {
        namespace.ya.speechkit = {};
    }

    namespace.ya.speechkit.SpeakerId = function () {
        if (!(this instanceof namespace.ya.speechkit.SpeakerId)) {
            return new namespace.ya.speechkit.SpeakerId();
        }

        if (!namespace.ya.speechkit._recorderInited) {
            namespace.ya.speechkit.initRecorder(
                this.onInited.bind(this),
                function (error) {alert('Failed to init recorder: ' + error);}
            );
        }
    };

    namespace.ya.speechkit.SpeakerId.prototype = {
        onInited: function () {
            this.recorder = new namespace.ya.speechkit.Recorder();
        },

        startRecord: function () {
            console.log('Start recording...');
            this.recorder.start(
                function (data) {
                    console.log('Recorder callback, recorded data length: ' + data.byteLength);
                },
                namespace.ya.speechkit.FORMAT.PCM8);
        },

        completeRecordAndRegister: function (userid, keepPrev, text, onRegister) {
            console.log('completeRecordAndRegister');
            this.recorder.stop(function (wav) {
                console.log('Wav is ready:');
                console.log(wav);
                var fd = new FormData();
                fd.append('name', userid);
                fd.append('text', text);
                fd.append('audio', wav);
                fd.append('keepPrev', keepPrev ? 'true' : 'false');

                var xhr = new XMLHttpRequest();

                xhr.open('POST', namespace.ya.speechkit.settings.voicelabUrl + 'register_voice');

                xhr.onreadystatechange = function () {
                    if (this.readyState == 4) {
                        if (this.status == 200) {
                            console.log(this.responseText);
                            onRegister(this.responseText);
                        } else {
                            onRegister('Failed to register data, could not access ' +
                               namespace.ya.speechkit.settings.voicelabUrl +
                               ' Check out developer tools -> console for more details.');
                        }
                    }
                };

                xhr.send(fd);

            });
        },

        completeRecordAndIdentify: function (onFoundUser) {
            console.log('Indentify');
            this.recorder.stop(function (wav) {
                console.log('Wav is ready:');
                console.log(wav);
                var fd = new FormData();
                fd.append('audio', wav);

                var xhr = new XMLHttpRequest();

                xhr.open('POST', namespace.ya.speechkit.settings.voicelabUrl + 'detect_voice');

                xhr.onreadystatechange = function () {
                    if (this.readyState == 4) {
                        if (this.status == 200) {
                            console.log(this.responseText);
                            var data = {};
                            try {
                                data = JSON.parse(this.responseText);
                            } catch (e) {
                                onFoundUser(false, 'Failed to find user, internal server error: ' + e);
                                return;
                            }
                            onFoundUser(true, data);
                        } else {
                            onFoundUser(false, 'Failed to find user, could not access ' +
                                namespace.ya.speechkit.settings.voicelabUrl +
                                ' Check out developer tools -> console for more details.');
                        }
                    }
                };

                xhr.send(fd);
            }, 1);
        },

        feedback: function (requestId, feedback) {
            console.log('Post feedback');
            var fd = new FormData();
            fd.append('requestId', requestId);
            fd.append('feedback', feedback);

            var xhr = new XMLHttpRequest();

            xhr.open('POST', namespace.ya.speechkit.settings.voicelabUrl + 'postFeedback');

            xhr.onreadystatechange = function () {
                if (this.readyState == 4) {
                    console.log(this.responseText);
                }
            };

            xhr.send(fd);
        },
    };
}(this));

(function (namespace) {
    'use strict';

    if (typeof namespace.ya === 'undefined') {
        namespace.ya = {};
    }
    if (typeof namespace.ya.speechkit === 'undefined') {
        namespace.ya.speechkit = {};
    }

    function noop() {}

    /**
    * Default options for SpeechRecognition
    * @private
    */
    namespace.ya.speechkit._defaultOptions = function () {
        /**
         * @typedef {Object} SpeechRecognitionOptions
         * @property {SpeechRecognition~initCallback} initCallback - Callback to call upon successful initialization
         * @property {SpeechRecognition~errorCallback} errorCallback - Callback to call upon error
         * @property {SpeechRecognition~dataCallback} dataCallback - Callback for partialy recognized text
         * @property {SpeechRecognition~infoCallback} infoCallback - Callback for technical data
         * @property {SpeechRecognition~stopCallback} stopCallback - Callback for recognition stop
         * @property {Boolean} punctuation - Will you need some punctuation
         * @property {String} model - Model to use for recognition
         * @property {String} lang - Language to use for recognition
         * @property {ya.speechkit.FORMAT} format - Format for audio record
         */
        return {
                initCallback: noop,
                errorCallback: noop,
                dataCallback: noop,
                infoCallback: noop,
                stopCallback: noop,
                punctuation: false,
                advancedOptions: {},
                model: namespace.ya.speechkit.settings.model,
                lang: namespace.ya.speechkit.settings.lang,
                format: namespace.ya.speechkit.FORMAT.PCM16,
                vad: false,
                speechStart: noop,
                speechEnd: noop,
            };
    };

    /**
    * Creates a new SpeechRecognition session
    * @class
    * @classdesc A class for long speech recognition queries
    * @memberof ya.speechkit
    */
    var SpeechRecognition = function () {
        if (!(this instanceof namespace.ya.speechkit.SpeechRecognition)) {
            return new namespace.ya.speechkit.SpeechRecognition();
        }
        this.send = 0;
        this.send_bytes = 0;
        this.proc = 0;
        this.recorder = null;
        this.recognizer = null;
        this.vad = null;
    };

    SpeechRecognition.prototype = {
        /**
         * Starts recording sound and it's recognition
         * @param {SpeechRecognitionOptions} options - Options to use during recognition process
         */
        start: function (options) {
            this.options = namespace.ya.speechkit._extend(
                                namespace.ya.speechkit._extend(
                                    {},
                                    namespace.ya.speechkit._defaultOptions()
                                ),
                                options);

            if (namespace.ya.speechkit._recorderInited) {
                this._onstart();
            } else {
                namespace.ya.speechkit.initRecorder(
                    this._onstart.bind(this),
                    this.options.errorCallback
                );
            }
        },
        /**
         * Will be called after successful call of initRecorder
         * @private
         */
        _onstart: function () {
            if (this.recorder && this.recorder.isPaused()) {
                this.recorder.start();
            }

            if (this.recognizer) {
                return;
            }

            this.send = 0;
            this.send_bytes = 0;
            this.proc = 0;

            if (!this.recorder) {
                this.recorder = new namespace.ya.speechkit.Recorder();
                if (this.options.vad) {
                    this.vad = new namespace.ya.speechkit.Vad({recorder: this.recorder,
                                                     speechStart: this.options.speechStart,
                                                     speechEnd: this.options.speechEnd});
                }
            }

            this.recognizer = new namespace.ya.speechkit.Recognizer(
                {
                    onInit: function (sessionId, code) {
                        this.recorder.start(function (data) {
                            if (this.options.vad && this.vad) {
                                this.vad.update();
                            }
                            this.send++;
                            this.send_bytes += data.byteLength;
                            this.options.infoCallback({
                                send_bytes: this.send_bytes,
                                format: this.options.format,
                                send_packages: this.send,
                                processed: this.proc
                            });
                            this.recognizer.addData(data);
                        }.bind(this), this.options.format);

                        this.options.initCallback(sessionId, code);
                    }.bind(this),
                    onResult: function (text, uttr, merge) {
                                this.proc += merge;
                                this.options.dataCallback(text, uttr, merge);
                            }.bind(this),
                    onError: function (msg) {
                                this.recorder.stop(function () {});
                                this.recognizer.close();
                                this.recognizer = null;
                                this.options.errorCallback(msg);
                            }.bind(this),

                    model: this.options.model,
                    lang: this.options.lang,
                    format: this.options.format.mime,
                    punctuation: this.options.punctuation,
                    advancedOptions: this.options.advancedOptions
                });
            this.recognizer.start();
        },
        /**
         * Stops recognition process
         * @description When recognition process will stop stopCallback will be called
         */
        stop: function () {
            if (this.recognizer) {
                this.recognizer.close();
            }

            this.recorder.stop(
                function () {
                    this.recognizer = null;
                    this.options.stopCallback();
                }.bind(this)
            );
        },
        /**
         * Sets recognition process to pause mode
         * @description Heartbeet with empty sound will be send in pause mode to prevent session drop
         */
        pause: function () {
            this.recorder.pause();
        },
        /**
         * Returns true if recognition session is in pause mode
         * @returns {Boolean} True if recognition session is in pause mode
         */
        isPaused: function () {
            return (!this.recorder || this.recorder.isPaused());
        }
    };

    ya.speechkit.SpeechRecognition = SpeechRecognition;

    /**
    * Function for simple recognition
    * @param {SpeechRecognitionOptions} options - Options to use during recognition process
    * @param {recognitionDoneCallback} options.doneCallback - Callback for full recognized text
    * @memberof ya.speechkit
    */
    namespace.ya.speechkit.recognize = function (options) {
        var dict = new namespace.ya.speechkit.SpeechRecognition();

        var opts = namespace.ya.speechkit._extend(
                        namespace.ya.speechkit._extend(
                            {},
                            namespace.ya.speechkit._defaultOptions()
                        ),
                        options);

        opts.doneCallback = options.doneCallback;

        opts.dataCallback = function (text, uttr, merge) {
            if (uttr) {
                if (opts.doneCallback) {
                    opts.doneCallback(text);
                }
                dict.stop();
            }
        };

        opts.stopCallback = function () {
            dict = null;
        };

        dict.start(opts);
    };

    /**
     * Callback for full recognized text
     * @param {String} text - Recognized user speech
     * @callback recognitionDoneCallback
     *
     */

    /**
     * Callback for successful recognition session initialization
     * @callback SpeechRecognition~initCallback
     * @param {String} sessionId - Session identifier
     * @param {Number} code - Http status of initialization response
     */

    /**
     * Callback for recognition error message
     * @callback SpeechRecognition~errorCallback
     * @param {String} message - Error message
     */

    /**
     * Callback for recognition error message
     * @callback SpeechRecognition~dataCallback
     * @param {String} text - Recognized text
     * @param {Boolean} utterance - Is this a final text result for this utterance
     * @param {Number} merge - How many requests were merged in this response
     */

    /**
     * Callback for technical information messages
     * @callback SpeechRecognition~infoCallback
     * @param {Number} send_bytes - How many bytes of audio data were send during session
     * @param {Number} send_packages - How many packages with audio data were send during session
     * @param {Number} processed - How many audio packages were processed by server
     * @param {ya.speechkit.FORMAT} format - Which format is used for audio
     */

    /**
     * Callback to indicate recognition process has stopped
     * @callback SpeechRecognition~stopCallback
     */
}(this));

(function (namespace) {
    'use strict';

    if (typeof namespace.ya === 'undefined') {
        namespace.ya = {};
    }
    if (typeof namespace.ya.speechkit === 'undefined') {
        namespace.ya.speechkit = {};
    }

    namespace.ya.speechkit.Spotter = function () {
        if (!(this instanceof namespace.ya.speechkit.Spotter)) {
            return new namespace.ya.speechkit.Spotter();
        }

        this.send = 0;
        this.send_bytes = 0;
        this.proc = 0;
        this.recorder = null;
        this.recognizer = null;
        this.vad = null;
    };

    namespace.ya.speechkit.Spotter.prototype = {
        start: function (options) {
            this.options = namespace.ya.speechkit._extend(
                namespace.ya.speechkit._extend(
                    {phrases:[]},
                    namespace.ya.speechkit._defaultOptions()
                ),
                options);

            if (namespace.ya.speechkit._recorderInited) {
                this.onstart();
            } else {
                namespace.ya.speechkit.initRecorder(
                    this.onstart.bind(this),
                    this.options.errorCallback
                );
            }
        },

        onstart: function () {
            var _this = this;
            if (this.recorder && this.recorder.isPaused()) {
                this.recorder.start();
            }

            if (this.recognizer) {
                return;
            }

            this.send = 0;
            this.send_bytes = 0;
            this.proc = 0;

            if (!this.recorder) {
                this.recorder = new namespace.ya.speechkit.Recorder();
                if (this.options.vad) {
                    this.vad = new namespace.ya.speechkit.Vad({recorder: this.recorder,
                                                               speechStart: this.options.speechStart,
                                                               speechEnd: this.options.speechEnd});
                }
            }

            this.recognizer = new namespace.ya.speechkit.Recognizer(
                {
                    onInit: function (sessionId, code) {
                        _this.recorder.start(function (data) {
                            if (_this.options.vad && _this.vad) {
                                _this.vad.update();
                            }
                            _this.send++;
                            _this.send_bytes += data.byteLength;
                            _this.options.infoCallback({
                                send_bytes: _this.send_bytes,
                                format: _this.options.format,
                                send_packages: _this.send,
                                processed: _this.proc
                            });
                            _this.recognizer.addData(data);
                        }, _this.options.format);
                        _this.options.initCallback(sessionId, code);
                    },

                    onResult: function (text, uttr, merge) {
                        _this.proc += merge;
                        _this.options.dataCallback(text, uttr, merge);
                    },

                    onError: function (msg) {
                        _this.recorder.stop(function () {});
                        _this.recognizer.close();
                        _this.recognizer = null;
                        _this.options.errorCallback(msg);
                    },

                    format: this.options.format.mime,
                    phrases: this.options.phrases,
                    url: namespace.ya.speechkit.settings.websocketProtocol +
                         namespace.ya.speechkit.settings.spotterUrl,
                }
            );

            this.recognizer.start();
        },

        stop: function () {
            if (this.recognizer) {
                this.recognizer.close();
            }
            this.recorder.stop(
                function () {
                    this.recognizer = null;
                    this.options.stopCallback();
                }.bind(this)
            );
        },

        pause: function () {
            this.recorder.pause();
        },

        isPaused: function () {
            return (!this.recorder || this.recorder.isPaused());
        },
    };
}(this));

(function (namespace) {
    'use strict';

    if (typeof namespace.ya === 'undefined') {
        namespace.ya = {};
    }
    if (typeof namespace.ya.speechkit === 'undefined') {
        namespace.ya.speechkit = {};
    }

    namespace.ya.speechkit._mic_on = '<svg version="1.1" id="Layer_1" ' +
    ' xmlns:sketch="http://www.bohemiancoding.com/sketch/ns"' +
    ' xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
    ' x="0px" y="0px" viewBox="0 0 112 112"' +
    ' enable-background="new 0 0 112 112" xml:space="preserve">' +
    ' <g id="tuts" sketch:type="MSPage">' +
    ' <g id="mic_ff" sketch:type="MSLayerGroup">' +
    ' <g sketch:type="MSShapeGroup">' +
    ' <circle id="path-1" fill="rgb(255, 204, 0)" cx="56" cy="56" r="56"/>' +
    ' </g>' +
    ' <g id="speechkit_vector-9" transform="translate(39.000000, 32.000000)" ' +
    ' sketch:type="MSShapeGroup" opacity="0.9">' +
    ' <path id="Shape" d="M17,4c2.8,0,5,2.3,5,5.2v15.6c0,2.9-2.2,5.2-5,5.2s-5-2.3-5-5.2V9.2C12,6.3,14.2,4,17,4 M17,0' +
    ' c-5,0-9,4.1-9,9.2v15.6c0,5.1,4,9.2,9,9.2s9-4.1,9-9.2V9.2C26,4.1,22,0,17,0L17,0z"/>' +
    ' <path id="Shape_1_" ' +
    ' d="M34,23v1.1C34,34,26.4,42,17,42S0,34,0,24.1V23h4v0.1C4,31.3,9.8,38,17,38s13-6.7,13-14.9V23H34z"/>' +
    ' <rect id="Rectangle-311" x="15" y="41" width="4" height="10"/>' +
    ' </g>' +
    ' </g>' +
    ' </g>' +
    ' </svg>';

    namespace.ya.speechkit._mic_off = '<svg version="1.1" id="Layer_1" ' +
    ' xmlns:sketch="http://www.bohemiancoding.com/sketch/ns"' +
    ' xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
    ' x="0px" y="0px" viewBox="0 0 112 112"' +
    ' enable-background="new 0 0 112 112" xml:space="preserve">' +
    ' <g id="tuts" sketch:type="MSPage">' +
    ' <g id="mic_ff" sketch:type="MSLayerGroup">' +
    ' <g id="speechkit_vector-9" transform="translate(39.000000, 32.000000)" ' +
    ' sketch:type="MSShapeGroup" opacity="0.9">' +
    ' <path id="Shape" d="M17,4c2.8,0,5,2.3,5,5.2v15.6c0,2.9-2.2,5.2-5,5.2s-5-2.3-5-5.2V9.2C12,6.3,14.2,4,17,4 M17,0' +
    ' c-5,0-9,4.1-9,9.2v15.6c0,5.1,4,9.2,9,9.2s9-4.1,9-9.2V9.2C26,4.1,22,0,17,0L17,0z"/>' +
    ' <path id="Shape_1_" ' +
    ' d="M34,23v1.1C34,34,26.4,42,17,42S0,34,0,24.1V23h4v0.1C4,31.3,9.8,38,17,38s13-6.7,13-14.9V23H34z"/>' +
    ' <rect id="Rectangle-311" x="15" y="41" width="4" height="10"/>' +
    ' </g>' +
    ' </g>' +
    ' </g>' +
    ' </svg>';

    namespace.ya.speechkit.Textline = function (target, options) {
        this.element = document.getElementById(target);
        this.textinput = document.createElement('input');
        this.textinput.style['text-align'] = 'center';
        this.textinput.style.height = '100%';
        this.textinput.style.width = '100%';
        this.textinput.style.backgroundImage = 'url(\'data:image/svg+xml;utf8,' +
                                                namespace.ya.speechkit._mic_off + '\')';
        this.textinput.style.backgroundRepeat = 'no-repeat';
        this.textinput.style.backgroundPosition = 'right center';
        this.element.appendChild(this.textinput);

        this.dict = null;

        var _this = this;

        this.textinput.onmousemove = function (event) {
            var rect = _this.textinput.getBoundingClientRect();
            if (event.clientX - rect.x > rect.width - rect.height)
            {
                _this.textinput.style.cursor = 'pointer';
            } else {
                _this.textinput.style.cursor = 'text';
            }
        };

        options.dataCallback = function (text, uttr, merge) {
            _this.textinput.value = text;
            if (uttr) {
                if (options.onInputFinished) {
                    options.onInputFinished(text);
                }
                _this.dict.stop();
            }
        };

        options.initCallback = function () {
            _this.textinput.style.backgroundImage = 'url(\'data:image/svg+xml;utf8,' + ya.speechkit._mic_on + '\')';
        };

        options.stopCallback = function () {
            _this.textinput.style.backgroundImage = 'url(\'data:image/svg+xml;utf8,' + ya.speechkit._mic_off + '\')';
            _this.dict = null;
        };

        this.textinput.onmousedown = function (event) {
            var rect = _this.textinput.getBoundingClientRect();

            if (event.clientX <= rect.width - rect.height) {
                return;
            }

            if (!_this.dict) {
                _this.dict = new ya.speechkit.SpeechRecognition();
            }
            if (_this.dict.isPaused())
            {
                _this.dict.start(options);
            } else {
                _this.dict.stop();
            }
        };

        return {
            destroy: function () {
                if (_this.dict) {
                    _this.dict.stop();
                }
                _this.element.removeChild(_this.textinput);
            },
        };
    };
}(this));

(function (namespace) {
    'use strict';

    if (typeof namespace.ya === 'undefined') {
        namespace.ya = {};
    }
    if (typeof namespace.ya.speechkit === 'undefined') {
        namespace.ya.speechkit = {};
    }

    var speakersCache = null;

    /**
     * Plays audio file
     * @param {String} url - URL of audio (browser internal or external)
     * @param {Function} callback - Callback to call when audio will stop
     * @memberof ya.speechkit
     */
    namespace.ya.speechkit.play = function (url, cb) {
        var audio = new Audio(url);
        audio.onended = cb || function () {};
        audio.play();
    };

    /**
     * Creates a new object for text-to-speech
     * @class
     * @classdesc Class for text-to-speech conversion
     * @param {TtsOptions} options - Options for Tts
     * @memberof ya.speechkit
     * @alias Tts
     */
    var Tts = function (options) {
        if (!(this instanceof namespace.ya.speechkit.Tts)) {
            return new namespace.ya.speechkit.Tts();
        }
        /**
         * @typedef {Object} TtsOptions
         * @property {String} ttsUrl - Url of tts server
         * @property {String} apiKey - Developer's API key {@link http://ya.ru}
         * @property {String} emotion - Emotion
         * @property {String} speaker - Speaker
         * @property {Number} speed - Speed of speech
         * @property {Number} pitch - Pitch
         */
        this.options = namespace.ya.speechkit._extend({
                                    apiKey: namespace.ya.speechkit.settings.apiKey,
                                    ttsUrl: namespace.ya.speechkit.settings.ttsUrl,
                                    emotion: 'neutral',
                                    speaker: 'omazh',
                                    speed: 1.0,
                                    pitch: 0,
                                },
                                options);
    };

    Tts.prototype = {
        /**
         * Speaks text with text-to-speech technology
         * @param {String} text - Text ot speak
         * @param {Function} cb - Callback to call after all text message will be spoken
         * @param {TtsOptions} options - Options for Tts
         */
        say: function (text, cb, options) {
            var args = namespace.ya.speechkit._extend(this.options, options);

            namespace.ya.speechkit.play(args.ttsUrl +
                        '/crafted?key=' + args.apiKey +
                        '&speaker=' + args.speaker +
                        '&emotion=' + args.emotion +
                        '&pitch_shift=' + args.pitch +
                        '&speed=' + args.speed +
                        '&text=' + text,
                        cb);
        },

        /**
         * Gets available speakers
         * @param {String} ttsUrl - URL of Yandex.TTS server (leave it empty)
         * @returns {Object} JSON with speakers and their emotions
         */
        speakers: function (ttsUrl) {
            return new Promise(function (resolve, reject) {

                if (speakersCache) {
                    resolve(speakersCache);
                } else {
                    var xhr = new XMLHttpRequest();
                    xhr.open('GET', (ttsUrl || this.options.ttsUrl) + '/speakers');

                    xhr.onreadystatechange = function () {
                        if (this.readyState == 4) {
                            if (this.status == 200) {
                                try {
                                    speakersCache = JSON.parse(this.responseText);
                                    resolve(speakersCache);
                                } catch (ex) {
                                    reject(ex);
                                }
                            } else {
                                reject('Can\'t get speakers list!');
                            }
                        }
                    };

                    xhr.send();
                }
            }.bind(this));
        }
    };

    namespace.ya.speechkit.Tts = Tts;
}(this));


})(this.global);

    provide();
});
(function (namespace) {
    'use strict';

    if (typeof namespace.ya === 'undefined') {
        namespace.ya = {};
    }
    if (typeof namespace.ya.speechkit === 'undefined') {
        namespace.ya.speechkit = {};
    }
    /**
     * Global settings for speechkit
     * @memberof ya.speechkit
     * @property {String} websocketProtocol - Which protocol to use (wss:// or ws://)
     * @property {String} asrUrl - Url of asr websocket
     * @property {String} ttsUrl - Url of tts server
     * @property {String} lang - Default language for recognition
     * @property {String} model - Default model for recognition
     * @property {String} apiKey - Developer's API key {@link http://ya.ru}
     * @property {String} uuid - Pregenerated uuid of asr session
     * @see https://developer.tech.yandex.ru/
     */
    namespace.ya.speechkit.settings = {
        websocketProtocol: 'wss://',
        asrUrl: 'webasr.yandex.net/asrsocket.ws',
        spotterUrl: 'webasr.yandex.net/spottersocket.ws',
        ttsUrl: 'https://tts.voicetech.yandex.net',
        lang: 'ru-RU',
        model: 'freeform',
        apiKey: '',
        uuid: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
                /[xy]/g,
                function (c) {
                    var r = Math.random() * 16 | 0;
                    var v = c == 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                }
            )
    };
})(this);

var speex_loaded=false;var recLength=0,recBuffersL=[],recBuffersR=[],sampleRate,outSampleRate;var tmp_buf=0;var need_buf_size=4096;var speex_converter=null;this.onmessage=function(e){switch(e.data.command){case'init':init(e.data.config);break;case'record':record(e.data.buffer);break;case'exportWAV':exportWAV(e.data.type);break;case'exportMonoWAV':exportMonoWAV(e.data.type);break;case'getBuffers':getBuffers();break;case'clear':clear();break;}};function init(config){sampleRate=config.sampleRate;outSampleRate=config.format.samplerate||sampleRate;need_buf_size=config.bufSize||4096;speex_converter=null;if(config.format.format=="speex"){if(!speex_loaded){importScripts("./speex.min.js");speex_loaded=true;}
need_buf_size/=16;speex_converter=new SpeexConverter(outSampleRate);}}
function record(inputBuffer){if(outSampleRate==sampleRate){recBuffersL.push(inputBuffer[0]);recBuffersR.push(inputBuffer[1]);recLength+=inputBuffer[0].length;var samples=inputBuffer[0];var buffer=new ArrayBuffer(samples.length*2);var view=new DataView(buffer);floatTo16BitPCM(view,0,samples);this.postMessage({command:'int16stream',buffer:buffer});}
else
{function resample(inbuf){var result=new Float32Array(Math.floor(inbuf.length*outSampleRate/sampleRate));var bin=0,num=0,indexIn=0,indexOut=0;while(indexIn<result.length){bin=0;num=0;while(indexOut<Math.min(inbuf.length,(indexIn+1)*sampleRate/outSampleRate)){bin+=inbuf[indexOut];num+=1;indexOut++;}
result[indexIn]=bin/num;indexIn++;}
return result;}
var resin0=resample(inputBuffer[0]);var resin1=resample(inputBuffer[1]);recBuffersL.push(resin0);recBuffersR.push(resin1);recLength+=resin0.length;var result=new Int16Array(resin0.length);for(var i=0;i<resin0.length;i++){result[i]=Math.ceil((resin0[i]+resin1[i])*16383);}
result=result;if(speex_converter)
result=speex_converter.convert(result);else
result=result.buffer;if(!tmp_buf){tmp_buf=result;}
else{var tmp=new DataView(new ArrayBuffer(tmp_buf.byteLength+result.byteLength));tmp_buf=new DataView(tmp_buf);result=new DataView(result);for(var i=0;i<tmp_buf.byteLength;i++)
tmp.setUint8(i,tmp_buf.getUint8(i));for(var i=0;i<result.byteLength;i++)
tmp.setUint8(i+tmp_buf.byteLength,result.getUint8(i));tmp_buf=tmp.buffer;}
if(tmp_buf.byteLength>=need_buf_size){this.postMessage({command:'int16stream',buffer:tmp_buf});tmp_buf=false;}}}
function exportWAV(type){var bufferL=mergeBuffers(recBuffersL,recLength);var bufferR=mergeBuffers(recBuffersR,recLength);var interleaved=interleave(bufferL,bufferR);var dataview=encodeWAV(interleaved);var audioBlob=new Blob([dataview],{type:type});this.postMessage({command:'exportWAV',blob:audioBlob});}
function exportMonoWAV(type){var bufferL=mergeBuffers(recBuffersL,recLength);var dataview=encodeWAV(bufferL,true);var audioBlob=new Blob([dataview],{type:type});this.postMessage({command:'exportMonoWAV',blob:audioBlob});}
function getBuffers(){var buffers=[];buffers.push(mergeBuffers(recBuffersL,recLength));buffers.push(mergeBuffers(recBuffersR,recLength));this.postMessage({command:'getBuffers',blob:buffers});}
function clear(){recLength=0;recBuffersL=[];recBuffersR=[];if(speex_converter)
speex_converter.clear();this.postMessage({command:'clear'});}
function mergeBuffers(recBuffers,recLength){var result=new Float32Array(recLength);var offset=0;for(var i=0;i<recBuffers.length;i++){result.set(recBuffers[i],offset);offset+=recBuffers[i].length;}
return result;}
function interleave(inputL,inputR){var length=inputL.length+inputR.length;var result=new Float32Array(length);var index=0,inputIndex=0;while(index<length){result[index++]=inputL[inputIndex];result[index++]=inputR[inputIndex];inputIndex++;}
return result;}
function floatTo16BitPCM(output,offset,input){for(var i=0;i<input.length;i++,offset+=2){var s=Math.max(-1,Math.min(1,input[i]));output.setInt16(offset,s<0?s*0x8000:s*0x7FFF,true);}}
function writeString(view,offset,string){for(var i=0;i<string.length;i++){view.setUint8(offset+i,string.charCodeAt(i));}}
function encodeWAV(samples,mono){var buffer=new ArrayBuffer(44+samples.length*2);var view=new DataView(buffer);writeString(view,0,'RIFF');view.setUint32(4,32+samples.length*2,true);writeString(view,8,'WAVE');writeString(view,12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,mono?1:2,true);view.setUint32(24,outSampleRate,true);var block_align=mono?2:4;view.setUint32(28,outSampleRate*block_align,true);view.setUint16(32,block_align,true);view.setUint16(34,16,true);writeString(view,36,'data');view.setUint32(40,samples.length*2,true);floatTo16BitPCM(view,44,samples);return view;}
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

/**
 * @author Konstantin Ikonnikov <ikokostya@yandex-team.ru>
 */

modules.define(
    'y-event-emitter',
    ['inherit'],
    function (provide, inherit) {

    var slice = Array.prototype.slice;

    /**
     * @name YEventEmitter
     */
    var YEventEmitter = inherit({
        /**
         * Добавляет обработчик события.
         *
         * @param {String} event
         * @param {Function} callback
         * @param {Object} [context]
         * @returns {YEventEmitter}
         */
        on: function (event, callback, context) {
            if (typeof callback !== 'function') {
                throw new Error('YEventEmitter#on(): `callback` must be a function.');
            }

            if (!this._events) {
                this._events = {};
            }

            var listener = {
                callback: callback,
                context: context
            };

            var listeners = this._events[event];
            if (listeners) {
                listeners.push(listener);
            } else {
                this._events[event] = [listener];
                this._onAddEvent(event);
            }

            return this;
        },

        /**
         * Добавляет обработчик события, который исполнится только 1 раз, затем удалится.
         *
         * @param {String} event
         * @param {Function} callback
         * @param {Object} [context]
         * @returns {YEventEmitter}
         */
        once: function (event, callback, context) {
            if (typeof callback !== 'function') {
                throw new Error('YEventEmitter#once(): `callback` must be a function.');
            }

            var _this = this;

            function once() {
                _this.off(event, once, context);
                callback.apply(context, arguments);
            }

            // Сохраняем ссылку на оригинальный колбэк. Благодаря этому можно удалить колбэк `once`,
            // используя оригинальный колбэк в методе `off()`.
            once._callback = callback;

            this.on(event, once, context);
            return this;
        },

        /**
         * Удаляет обработчик события.
         *
         * @param {String} event
         * @param {Function} callback
         * @param {Object} [context]
         * @returns {YEventEmitter}
         */
        off: function (event, callback, context) {
            if (typeof callback !== 'function') {
                throw new Error('YEventEmitter#off(): `callback` must be a function.');
            }

            if (!this._events) {
                return this;
            }

            var listeners = this._events[event];
            if (!listeners) {
                return this;
            }

            var len = listeners.length;
            for (var i = 0; i < len; i++) {
                var listener = listeners[i];
                var cb = listener.callback;
                if ((cb === callback || cb._callback === callback) && listener.context === context) {
                    if (len === 1) {
                        delete this._events[event];
                        this._onRemoveEvent(event);
                    } else {
                        listeners.splice(i, 1);
                    }
                    break;
                }
            }

            return this;
        },

        /**
         * Удаляет все обработчики всех событий или все обработчики переданного события `event`.
         *
         * @param {String} [event]
         * @returns {YEventEmitter}
         */
        offAll: function (event) {
            if (this._events) {
                if (event) {
                    if (this._events[event]) {
                        delete this._events[event];
                        this._onRemoveEvent(event);
                    }
                } else {
                    for (event in this._events) {
                        if (this._events.hasOwnProperty(event)) {
                            this._onRemoveEvent(event);
                        }
                    }
                    delete this._events;
                }
            }
            return this;
        },

        /**
         * Исполняет все обработчики события `event`.
         *
         * @param {String} event
         * @param {...*} [args] Аргументы, которые будут переданы в обработчики события.
         * @returns {YEventEmitter}
         */
        emit: function (event) {
            if (!this._events) {
                return this;
            }

            var listeners = this._events[event];
            if (!listeners) {
                return this;
            }

            // Копируем массив обработчиков, чтобы добавление/удаление обработчиков внутри колбэков не оказывало
            // влияния в цикле.
            var listenersCopy = listeners.slice(0);
            var len = listenersCopy.length;
            var listener;
            var i = -1;

            switch (arguments.length) {
                // Оптимизируем наиболее частые случаи.
                case 1:
                    while (++i < len) {
                        listener = listenersCopy[i];
                        listener.callback.call(listener.context);
                    }
                    break;
                case 2:
                    while (++i < len) {
                        listener = listenersCopy[i];
                        listener.callback.call(listener.context, arguments[1]);
                    }
                    break;
                case 3:
                    while (++i < len) {
                        listener = listenersCopy[i];
                        listener.callback.call(listener.context, arguments[1], arguments[2]);
                    }
                    break;
                default:
                    var args = slice.call(arguments, 1);
                    while (++i < len) {
                        listener = listenersCopy[i];
                        listener.callback.apply(listener.context, args);
                    }
            }

            return this;
        },

        /**
         * Вызывается когда было добавлено новое событие.
         *
         * @protected
         * @param {String} event
         */
        _onAddEvent: function () {},

        /**
         * Вызывается когда все обработчики события были удалены.
         *
         * @protected
         * @param {String} event
         */
        _onRemoveEvent: function () {}
    });

    provide(YEventEmitter);
});
