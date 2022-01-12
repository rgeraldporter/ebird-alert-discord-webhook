require('dotenv').config();

const EbirdClient = require('@rgeraldporter/ebird-client').EbirdClient;
const storage = require('node-persist');
const { CronJob } = require('cron');
const webhook = require('webhook-discord');
const glob = require('glob');
const path = require('path');

const { issueCheckLog, issueInitLog } = require('./helpers/logs');
const {
    issueBatchHeader,
    issueObservationAlerts,
    issueErrorAlert
} = require('./helpers/alerts');

const sleep = async m => new Promise(r => setTimeout(r, m));

let tasks = [];

glob.sync(__dirname + '/../tasks/**/*.json').forEach(function(file) {
    console.log('Found task:', file);
    tasks = tasks.concat(require(path.resolve(file)));
});

if (!tasks.length) {
    console.error('No JSON tasks in root /tasks folder. Quitting.');
    process.exit(1);
}

const EBIRD_API_KEY = process.env.EBIRD_API_KEY || '';
const ebird = new EbirdClient(EBIRD_API_KEY);

Promise.each = async function(arr, fn) {
    // take an array and a function
    for (const item of arr) await fn(item);
};

const initializeStorage = async observationIds => {
    await storage.setItem('observationIds', observationIds);
    issueInitLog(observationIds.length);
};

const taskRun = options => async () =>
    ebird
        .recentNotableObservationsInARegion(options.apiOptions)
        .then(async data => {
            const { discordWebhooks } = options;

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
            // `Set` forces values to be unique
            const uniqueNewObservationIds = [...new Set(newObservationIds)];

            // keep only observation ids that are still present in the eBird response
            /*const nonStaleObservationIds = pastObservationIds.filter(
            a => resultingObservationIds.indexOf(a) !== -1
        );*/
            const nonStaleObservationIds = pastObservationIds;

            const staleObservationIds = pastObservationIds.filter(
                a => resultingObservationIds.indexOf(a) === -1
            );

            // for logging purposes
            const staleObservationCount =
                pastObservationIds.length - nonStaleObservationIds.length;

            // Add new ids to store for later comparison
            const storedObservationIds = nonStaleObservationIds.concat(
                uniqueNewObservationIds
            );

            await storage.setItem('observationIds', storedObservationIds);

            issueCheckLog(
                uniqueNewObservationIds.length,
                staleObservationCount,
                staleObservationIds
            );

            // nothing new, end
            if (!uniqueNewObservationIds.length) {
                return;
            }

            Promise.each(discordWebhooks, async hook => {
                const {
                    displayName,
                    conditions = [],
                    exclusions = [],
                    url,
                    disabled = false
                } = hook;

                if (disabled) {
                    return;
                }

                const counties = conditions
                    .filter(c => c.property === 'county')
                    .map(c => c.value);

                const filteredIds = uniqueNewObservationIds
                    // filter by county
                    .filter(id => {
                        const observationData = data.find(a => a.obsId === id);
                        return (
                            counties.indexOf(observationData.subnational2Code) !==
                            -1
                        );
                    })
                    // filter by excluded terms, such as "Owl"
                    .filter(id => {
                        const observationData = data.find(a => a.obsId === id);
                        return (exclusions.indexOf(observationData.comName) === -1)
                    })

                const ids = counties.length
                    ? filteredIds
                    : uniqueNewObservationIds;

                if (!ids.length) {
                    return;
                }

                const Hook = new webhook.Webhook(url);

                const headerMsg = issueBatchHeader(ids.length, displayName);
                const msgs = issueObservationAlerts(data, ids, displayName);

                Hook.send(headerMsg);

                // I hate this but until the discord lib supports promises
                // this is the only way to have the header message first
                await sleep(1500);

                await Promise.each(msgs, async msg => {
                    Hook.send(msg);
                });

                return sleep(5000);
            });
        })
        .catch(issueErrorAlert);

const runWorker = task => {
    const worker = new CronJob(task.cronSchedule, taskRun(task));
    worker.start();
};

tasks.forEach(runWorker);
