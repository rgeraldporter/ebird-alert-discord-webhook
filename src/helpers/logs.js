const webhook = require('webhook-discord');

const DISCORD_LOG_WEB_HOOK_URL = process.env.DISCORD_LOG_WEB_HOOK_URL || '';

let LogHook;

if (DISCORD_LOG_WEB_HOOK_URL !== '') {
    LogHook = new webhook.Webhook(DISCORD_LOG_WEB_HOOK_URL);
}

const issueInitLog = count => {
    console.log('Initialized Observations:', count);

    if (!LogHook) {
        return;
    }

    const logMsg = new webhook.MessageBuilder()
        .setName('eBird Alert Webhook Log')
        .setColor('#aabbcc')
        .addField('Initialized observations', count)
        .setTime();

    LogHook.send(logMsg);
};

const issueCheckLog = (newCount, staleCount) => {
    console.log('New Observations:', newCount);
    console.log('Stale Observations:', staleCount);

    if (!LogHook) {
        return;
    }

    const logMsg = new webhook.MessageBuilder()
        .setName('eBird Alert Webhook Log LOCAL')
        .setColor('#ffffff')
        .addField('New observation alerts issued', newCount)
        .addField(
            'Stale observations cleared',
            `${staleCount}`
        )
        .setTime();

    LogHook.send(logMsg);
};

module.exports = { issueCheckLog, issueInitLog };
