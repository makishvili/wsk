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
