#!/usr/bin/env node
/**
 * Demo test script that does not require Redis.
 * It writes offerings and jobs to a local file `.demo_db.json` to simulate behavior.
 * Usage: node scripts/test_register_and_initiate_demo.js
 */

import fs from 'fs';
import path from 'path';

const demoPath = path.join(process.cwd(), '.demo_db.json');

function readDemo() {
  if (!fs.existsSync(demoPath)) return { offerings: {}, jobs: [], queue: [] };
  return JSON.parse(fs.readFileSync(demoPath, 'utf8'));
}

function writeDemo(obj) {
  fs.writeFileSync(demoPath, JSON.stringify(obj, null, 2));
}

const payloadPath = path.join(process.cwd(), 'scripts', 'acp_registration_payload.json');
const raw = fs.readFileSync(payloadPath, 'utf8');
const payload = JSON.parse(raw);

const db = readDemo();

const agentAddress = payload.agentAddress.toLowerCase();
for (const offering of payload.jobOfferings || []) {
  const offeringId = offering.offeringId || (`offering_${Date.now()}`);
  const key = `${agentAddress}:${offeringId}`;
  db.offerings[key] = { id: offeringId, agentAddress, createdAt: new Date().toISOString(), ...offering };
  console.log('Demo stored offering', key);

  // create a minimal valid service_requirement
  const sr = {};
  const props = offering.serviceRequirementSchema?.properties || {};
  for (const [pname, pschema] of Object.entries(props)) {
    if (offering.serviceRequirementSchema.required && offering.serviceRequirementSchema.required.includes(pname)) {
      if (pschema.type === 'string') sr[pname] = 'example';
      else if (pschema.type === 'number' || pschema.type === 'integer') sr[pname] = 1;
      else if (pschema.type === 'boolean') sr[pname] = true;
      else if (pschema.type === 'object') sr[pname] = {};
      else if (pschema.type === 'array') sr[pname] = [];
    }
  }

  const jobId = `job_${Date.now()}`;
  const job = { id: jobId, offeringId, agentAddress, serviceRequirement: sr, status: 'queued', createdAt: new Date().toISOString() };
  db.jobs.push(job);
  db.queue.push(jobId);
  console.log('Demo created job', jobId);
}

writeDemo(db);
console.log('Demo DB written to .demo_db.json. Start worker (demo) to process jobs.');
