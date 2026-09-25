import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { runReminders } from '../services/reminder.service.js';
import { expireUnpaidBookings } from '../services/cleanup.service.js';
import { markAbsentBookings } from '../services/noShow.service.js';
export const JOBS = [
    { name: 'reminders', schedule: '* * * * *', run: () => runReminders() },
    { name: 'cleanup', schedule: '*/5 * * * *', run: () => expireUnpaidBookings() },
    { name: 'no-shows', schedule: '*/5 * * * *', run: () => markAbsentBookings() },
];
const states = new Map(JOBS.map((j) => [j.name, { name: j.name, schedule: j.schedule, running: false, runs: 0, lastRunAt: null, lastDurationMs: null, lastResult: null, lastError: null }]));
let tasks = [];
let started = false;
/** Runs a job now. Returns null if it is already running in this process. */
export async function runJob(name) {
    const job = JOBS.find((j) => j.name === name);
    const state = states.get(name);
    if (!job || !state)
        throw new Error(`Unknown job "${name}"`);
    if (state.running)
        return null;
    state.running = true;
    const began = Date.now();
    try {
        const result = await job.run();
        Object.assign(state, { lastResult: result, lastError: null });
        return { result };
    }
    catch (err) {
        state.lastError = err instanceof Error ? err.message : String(err);
        logger.error(`Job "${name}" failed`, { error: state.lastError });
        throw err;
    }
    finally {
        Object.assign(state, { running: false, runs: state.runs + 1, lastRunAt: new Date().toISOString(), lastDurationMs: Date.now() - began });
    }
}
export function startScheduler() {
    if (started)
        return;
    started = true;
    tasks = JOBS.map((job) => cron.schedule(job.schedule, () => void runJob(job.name).catch(() => undefined)));
    logger.info('Scheduler started', { jobs: JOBS.map((j) => `${j.name} (${j.schedule})`) });
}
export function stopScheduler() {
    for (const t of tasks)
        void t.stop();
    tasks = [];
    started = false;
}
export function getSchedulerStatus() {
    const jobs = [...states.values()];
    const failing = jobs.some((j) => j.lastError);
    return { status: !started ? 'DISCONNECTED' : failing ? 'ERROR' : 'CONNECTED', jobs };
}
//# sourceMappingURL=scheduler.js.map