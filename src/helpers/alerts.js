const webhook = require('webhook-discord');
const moment = require('moment');
const counties = require('../assets/ontario-county-codes.json');

const DISCORD_WEB_HOOK_URL = process.env.DISCORD_WEB_HOOK_URL || '';

const Hook = new webhook.Webhook(DISCORD_WEB_HOOK_URL);

if (!Hook) {
    console.error('Discord hook error');
    process.exit(1);
}

const getCounty = code => counties.find(a => a.code === code).name;

const issueBatchHeader = (count, name = 'unnamed user') => {
    const batchMsg = new webhook.MessageBuilder()
        .setName(name)
        .setText(
            `${count} new observation(s) reported as of ${moment().format(
                'LLLL'
            )}:`
        );

    return batchMsg;
};

const observationAlert = (observationData, name = 'unnamed user') => {
    const {
        comName: commonName,
        howMany,
        userDisplayName: observerName,
        locName: location,
        obsDt: observationDatetime,
        subId: checklistId,
        obsId: id,
        subnational2Code: countyCode
    } = observationData;

    const msg = new webhook.MessageBuilder()
        .setName(name)
        .setColor('#00ff00')
        .addField(`Observation #${id}`, `${commonName} (${howMany})`)
        .addField('Location Found', `${location} (${getCounty(countyCode)})`)
        .addField('Observer Name', observerName)
        .addField(
            'Date & Time',
            `${moment(observationDatetime).format('LLLL')} (${moment(
                observationDatetime
            ).fromNow()})`
        )
        .addField('Checklist URL', `https://ebird.org/checklist/${checklistId}`)
        .setTime();

    return msg;
};

const issueObservationAlerts = (data, ids, name) =>
    ids.map(id => {
        const observationData = data.find(a => a.obsId === id);

        if (!observationData) {
            throw new Error(`Observation "${id}" not found!!`);
            return;
        }

        return observationAlert(observationData, name);
    });

const issueErrorAlert = err => {
    const msg = new webhook.MessageBuilder()
        .setName('eBird Alert Ontario')
        .setColor('#ff0000')
        .addField('Error encountered', err);

    Hook.send(msg);
};

module.exports = {
    issueBatchHeader,
    issueObservationAlerts,
    issueErrorAlert
};
