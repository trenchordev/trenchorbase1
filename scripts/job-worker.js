#!/usr/bin/env node
/**
 * Simple job worker for ACP-style jobs
 * Usage: node scripts/job-worker.js
 * It polls Redis list 'job-queue' for job IDs, processes them, and updates job records.
 */
import { redis, isRedisConfigured, getRedisConfigError } from '../src/lib/redis.js';
import { getHandler } from '../src/lib/agentHandlers.js';

if (!isRedisConfigured()) {
  console.error(getRedisConfigError());
  process.exit(1);
}

const POLL_INTERVAL_MS = Number(process.env.JOB_WORKER_POLL_MS) || 3000;
let shuttingDown = false;

async function processNextJob() {
  try {
    // Pop a job id from the queue (use RPOP to get oldest if using LPUSH to push)
    const jobId = await redis.rpop('job-queue');
    if (!jobId) return null;

    const jobKey = `job:${jobId}`;
    const raw = await redis.get(jobKey);
    if (!raw) {
      console.warn('[Worker] Job record not found for', jobId);
      return null;
    }

    const job = JSON.parse(raw);

    // Load offering
    const offeringKey = `job-offering:${job.agentAddress}:${job.offeringId}`;
    const offeringRaw = await redis.get(offeringKey);
    if (!offeringRaw) {
      console.warn('[Worker] Offering not found for job', jobId);
      job.status = 'failed';
      job.error = 'Offering not found';
      await redis.set(jobKey, JSON.stringify(job));
      return null;
    }

    const offering = JSON.parse(offeringRaw);

    // Determine handler: try offering.id, offering.name, fallback
    const possibleNames = [offering.id, offering.name && offering.name.toLowerCase(), 'tax-scanner'];
    let handler = null;
    for (const n of possibleNames) {
      if (!n) continue;
      handler = getHandler(n.toString().toLowerCase());
      if (handler) break;
    }

    if (!handler) {
      console.warn('[Worker] No handler registered for offering', offering.id);
      job.status = 'failed';
      job.error = 'No handler registered for offering';
      await redis.set(jobKey, JSON.stringify(job));
      return null;
    }

    // Update job status -> running
    job.status = 'running';
    job.startedAt = new Date().toISOString();
    await redis.set(jobKey, JSON.stringify(job));

    // Execute handler
    let result;
    try {
      result = await handler(job, offering, redis);
    } catch (err) {
      console.error('[Worker] Handler threw error for job', jobId, err);
      job.status = 'failed';
      job.error = err.message || String(err);
      job.finishedAt = new Date().toISOString();
      await redis.set(jobKey, JSON.stringify(job));
      return null;
    }

    // Save result
    job.status = result?.success ? 'completed' : 'failed';
    job.result = result;
    job.finishedAt = new Date().toISOString();
    await redis.set(jobKey, JSON.stringify(job));

    console.log('[Worker] Job', jobId, 'processed, status=', job.status);
    return jobId;
  } catch (err) {
    console.error('[Worker] Error processing job:', err);
    return null;
  }
}

async function loop() {
  while (!shuttingDown) {
    const did = await processNextJob();
    if (!did) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

process.on('SIGINT', () => { shuttingDown = true; });
process.on('SIGTERM', () => { shuttingDown = true; });

loop().then(() => console.log('Worker exiting'));
