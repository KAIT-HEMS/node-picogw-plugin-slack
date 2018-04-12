let pi;
let log = console.log;

let slackBot;

module.exports = {
    init: init,
    onCall: onProcCall,
    onUISetSettings: onUISetSettings,
};

/**
 * Initialize plugin
 * @param {object} pluginInterface The interface of picogw plugin
 */
function init(pluginInterface) {
    pi = pluginInterface;
    log = pluginInterface.log;
    initSlack();
}


/**
 * Setting value rewriting event for UI
 * @param {object} newSettings Settings edited for UI
 * @return {object} Settings to save
 */
function onUISetSettings(newSettings) {
    if (newSettings.bottoken != null) {
        pi.localStorage.setItem('bottoken', newSettings.bottoken);
        newSettings.bottoken = ''; // Keep it secret
        initSlack();
    }
    return newSettings;
}


/**
 * onCall handler of plugin
 * @param {string} method Caller method, accept GET only.
 * @param {string} path Plugin URL path
 * @param {object} args parameters of this call
 * @return {object} Returns a Promise object or object containing the result
 */
function onProcCall(method, path, args) {
    switch (method) {
    case 'GET':
        if (path == '') {
            let re = {post: {text: '[TEXT TO SAY]'}};
            if (args && args.info === 'true') {
                re.post._info = {doc: {short: 'Bot to say something'}};
            }
            return re;
        }
        // break ; proceed to POST
    case 'POST':
        if (path != 'post') {
            return {error: `path ${path} is not supported.`};
        }
        if (args.text == null || args.text == '') {
            return {error: `No text to say.`};
        }
        if (!slackBot) {
            return {error: `Slack token is not properly set.`};
        }

        return new Promise((ac, rj)=>{
            getChannelsList().then((channels)=>{
                channels.forEach((channel)=>{
                    slackBot.say({
                        text: args.text,
                        channel: channel.id,
                    });
                });
                ac({success: 'Successfully posted to channels ['+channels.map((ch)=>ch.name).join(',')+']'}); // eslint-disable-line max-len
            }).catch(rj);
        });
    case 'POST':
    case 'PUT':
    case 'DELETE':
    default:
        return {error: `The specified method ${method} is not implemented in admin plugin.`}; // eslint-disable-line max-len
    }
}

/**
 * Get slack channel list
 * @return {Promise} Return slack channel list
 */
function getChannelsList() {
    if (slackBot == null) {
        return Promise.reject({error: 'Bot is not defined yet'});
    }

    return new Promise((ac, rj)=>{
        slackBot.api.channels.list({}, function(err, response) {
            if (err) {
                rj({error: err}); return;
            }
            let channels = response.channels.filter(
                (channel) => channel.is_member&&!channel.is_archived);
            channels = channels.map(function(channel) {
                const ret = {};
                ['id', 'name', 'purpose'].forEach(
                    (elem) => ret[elem]=channel[elem]
                );
                return ret;
            });
            ac(channels);
        });
    });
}


/**
 * Initialize Slack
 * @return {object} Returns the result of initialization of slack
 */
function initSlack() {
    try {
        const SLACK_TOKEN = pi.localStorage.getItem('bottoken', null);
        if (SLACK_TOKEN == null) {
            return {error: 'Please set Slack bot API token first.'};
        }
        const Botkit = require('botkit');
        const controller = Botkit.slackbot();
        slackBot = controller.spawn({
            token: SLACK_TOKEN,
        }).startRTM(function(err, bot, payload) {
            if (err) {
                return {error: 'Could not connect to Slack'};
            }
            slackBot = bot;

            controller.hears(
                [''], 'direct_message,direct_mention,mention',
                (bot, message) => {
                    const cmd = message.text.split(' ')[0];
                    const params = message.text.slice(cmd.length).trim();
                    log(`Publish to topic ${cmd} : ${params}`);
                    pi.server.publish(cmd, {params: params});
                });
        });
    } catch (e) {
        return {error: 'Please set Slack bot API token first.'};
    }
}
