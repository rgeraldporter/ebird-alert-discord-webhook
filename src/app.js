require('dotenv').config();

const EbirdClient = require('@rgeraldporter/ebird-client').EbirdClient;
const storage = require('node-persist');
const { CronJob } = require('cron');

const { issueCheckLog, issueInitLog } = require('./helpers/logs');
const {
    issueBatchHeader,
    issueObservationAlerts,
    issueErrorAlert
} = require('./helpers/alerts');

const EBIRD_API_KEY = process.env.EBIRD_API_KEY || '';
const ebird = new EbirdClient(EBIRD_API_KEY);

const initializeStorage = async observationIds => {
    await storage.setItem('observationIds', observationIds);
    issueInitLog(observationIds.length);
};

const task = async () => ebird
    .recentNotableObservationsInARegion({
        regionCode: 'CA-ON',
        detail: 'full',
        back: 14
    })
    .then(async data => {
        if (data.length < 1) {
            return;
        }

        await storage.init();

        const resultingObservationIds = data.map(a => a.obsId);
        const pastObservationIds =
            (await storage.getItem('observationIds')) || [];

        // if nothing is in storage, this means we haven't run yet
        // since we haven't yet, let's not flood the channel with everything in the last two weeks
        // just store stuff and then only issue alerts for new things
        if (pastObservationIds.length === 0) {
            await initializeStorage(resultingObservationIds);
            return;
        }

        // only new observations
        const newObservationIds = resultingObservationIds.filter(
            a => pastObservationIds.indexOf(a) === -1
        );

        // sometimes the eBird API has duplicates for an unknown reason
        const uniqueNewObservationIds = [...new Set(newObservationIds)];

        // keep only observation ids that are still present in the eBird response
        const nonStaleObservationIds = pastObservationIds.filter(
            a => resultingObservationIds.indexOf(a) !== -1
        );

        // for logging purposes
        const staleObservationCount =
            pastObservationIds.length - nonStaleObservationIds.length;

        // Add new ids to store for later comparison
        const storedObservationIds = nonStaleObservationIds.concat(
            uniqueNewObservationIds
        );

        await storage.setItem('observationIds', storedObservationIds);

        issueCheckLog(uniqueNewObservationIds.length, staleObservationCount);

        // nothing new, end
        if (!uniqueNewObservationIds.length) {
            return;
        }

        await issueBatchHeader(uniqueNewObservationIds.length);
        await issueObservationAlerts(
            data,
            uniqueNewObservationIds
        );
    })
    .catch(issueErrorAlert);

const alertWorker = new CronJob(
    '0,5,10,15,20,25,30,35,40,45,50,55 * * * *',
    task
);

alertWorker.start();