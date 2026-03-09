#!/usr/bin/env node
/**
 * Test script: programmatically register job offering and initiate a job
 * Usage: Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars, then:
 * node scripts/test_register_and_initiate.js
 */

import fs from 'fs';
import path from 'path';
import { redis, isRedisConfigured, getRedisConfigError } from '../src/lib/redis.js';
import { validateJobOfferingDefinition, validateServiceRequirementAgainstSchema } from '../src/lib/agentSchemaValidator.js';

async function main() {
  if (!isRedisConfigured()) {
    console.error(getRedisConfigError());
    process.exit(1);
  }

  const payloadPath = path.join(process.cwd(), 'scripts', 'acp_registration_payload.json');
  const raw = fs.readFileSync(payloadPath, 'utf8');
  const payload = JSON.parse(raw);

  // Register each job offering into Redis using the same logic as admin route
  const agentAddress = payload.agentAddress.toLowerCase();

  for (const offering of payload.jobOfferings || []) {
    const offeringId = offering.offeringId || (`offering_${Date.now()}`);
    const body = { ...offering, agentAddress, offeringId };

    const validation = validateJobOfferingDefinition(body);
    if (!validation.valid) {
      console.error('Offering validation failed:', validation.errors);
      continue;
    }

    const key = `job-offering:${agentAddress}:${offeringId}`;
    const store = { id: offeringId, agentAddress, createdAt: new Date().toISOString(), ...validation.data };
    await redis.set(key, JSON.stringify(store));
    console.log('Stored offering at', key);

    // Now simulate a buyer initiating a job with minimal valid serviceRequirement
    const sr = {};
    // set required fields if present in schema
    const props = store.serviceRequirementSchema.properties || {};
    for (const [pname, pschema] of Object.entries(props)) {
      if (store.serviceRequirementSchema.required && store.serviceRequirementSchema.required.includes(pname)) {
        // provide simple defaults per type
        if (pschema.type === 'string') sr[pname] = 'example';
        else if (pschema.type === 'number' || pschema.type === 'integer') sr[pname] = 1;
        else if (pschema.type === 'boolean') sr[pname] = true;
        else if (pschema.type === 'object') sr[pname] = {};
        else if (pschema.type === 'array') sr[pname] = [];
      }
    }

    console.log('Simulated service_requirement:', sr);

    const validation2 = validateServiceRequirementAgainstSchema(sr, store.serviceRequirementSchema);
    if (!validation2.valid) {
      console.error('Service requirement validation failed:', validation2.errors);
      continue;
    }

    // Create job and push to queue
    const jobId = `job_${Date.now()}`;
    const jobKey = `job:${jobId}`;
    const jobRecord = { id: jobId, offeringId: store.id, agentAddress: store.agentAddress, serviceRequirement: validation2.data, status: 'queued', createdAt: new Date().toISOString() };
    await redis.set(jobKey, JSON.stringify(jobRecord));
    await redis.lpush('job-queue', jobId);
    console.log('Created job', jobId, 'and pushed to queue');
  }

  console.log('Done. Start the worker to process queued jobs (node scripts/job-worker.js)');
}

main().catch(err => { console.error(err); process.exit(1); });
