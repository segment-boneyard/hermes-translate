var co = require('co');
var fmt = require('util').format;
var querystring = require('querystring');
var toFn = require('to-function');
var request = require('co-request');

/**
 * Expose `plugin`.
 */

module.exports = plugin;

/**
 * Teach Hermes to translate text and other people's chats.
 *
 * @param {Object} options
 *   @property {String} key
 */

function plugin(options) {
  var key = options.key;
  var previous = {};
  var languages = {};
  var users = [];

  return function(robot){
    robot.on('connect', co(fetch));
    robot.on('mention', /^what did @?(\w+)(?: just)? say\??$/i, co(translatePreviousChat));
    robot.on('mention', /^translate (.*)$/i, co(translateChat));
    robot.on('hear', listen);
    robot.help('translate <phrase>', 'Translate the given <phrase>.');
    robot.help('what did @<nickname> just say?', 'Translate the last thing <nickname> said.');

    /**
     * Fetch the supported languages.
     */

    function *fetch() {
      var url = api('languages', { target: 'en' });
      var res = yield request(url);
      var body = JSON.parse(res.body);
      if (body.error) return;

      body.data.languages.forEach(function(obj) {
        languages[obj.language] = obj.name;
      });
    }

    /**
     * Store the last thing everyone said for a room.
     *
     * @param {Object} chat
     */

    function listen(chat) {
      var room = chat.context.room || 'private';
      var user = robot.user(chat.context.user).nickname;
      previous[room] = previous[room] || {};
      previous[room][user] = chat.message;
    }

    /**
     * Respond to a previous translate `chat`.
     *
     * @param {Object} chat
     */

    function *translatePreviousChat(chat) {
      var user = chat[1];
      var room = chat.context.room || 'private';
      var message = previous[room] && previous[room][user];

      if (!message) return chat.reply('They haven\'t said anything yet.');

      var res = yield translate(message);
      if (!res) return chat.reply('I have no idea.');

      chat.reply(fmt('They said "%s", in %s.', res.text, res.language));
    }

    /**
     * Respond to `chat`.
     *
     * @param {Object} chat
     */

    function *translateChat(chat){
      var user = robot.user.nickname;
      var res = yield translate(chat[1]);
      if (!res) return chat.reply('I have no idea.');
      chat.reply(fmt('Translation from %s: "%s"', res.language, res.text));
    }

    /**
     * Translate a `string`.
     *
     * @param {String} string
     * @return {Object}
     *   @property {String} text
     *   @property {String} language
     */

    function *translate(string) {
      var url = api({ target: 'en', q: string });
      var res = yield request(url);
      var body = JSON.parse(res.body);
      if (body.error) return;

      var obj = body.data.translations[0];
      if (!obj) return;

      return {
        text: obj.translatedText,
        language: languages[obj.detectedSourceLanguage]
      };
    }

    /**
     * Create a Google Translate URL given a `path` and `params`.
     *
     * @param {String} path (optional)
     * @param {Object} params (optional)
     * @return {String}
     */

    function api(path, params) {
      if (!path || 'object' == typeof path) params = path, path = '';
      path = path || '';
      params = params || {};
      params.key = key;
      return ''
        + 'https://www.googleapis.com/language/translate/v2'
        + '/' + path
        + '?' + querystring.stringify(params);
    }
  };
}
