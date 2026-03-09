import { NextResponse } from 'next/server';

const DEFAULT_AGENT_ID = process.env.ACP_AGENT_ID || 'local-agent';
const DEFAULT_AGENT_VERSION = process.env.ACP_AGENT_VERSION || '0.1.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-acp-version, x-agent-id',
};

export function isACPRequest(request) {
  try {
    const acpVersion = request.headers.get('x-acp-version');
    const agentId = request.headers.get('x-agent-id');
    const contentType = request.headers.get('content-type');
    return Boolean(acpVersion || agentId || (contentType && contentType.includes('application/json')));
  } catch (e) {
    return false;
  }
}

export function wrapACPEnvelope(agentResponse, opts = {}) {
  const agentId = opts.agentId || DEFAULT_AGENT_ID;
  const agentVersion = opts.agentVersion || DEFAULT_AGENT_VERSION;
  return {
    protocol: 'acp/1.0',
    agentId,
    agentVersion,
    timestamp: new Date().toISOString(),
    status: agentResponse.success ? 'success' : 'error',
    duration: agentResponse.metadata?.executionTime || 'unknown',
    data: agentResponse,
    ttl: opts.ttl || 3600,
  };
}

export function jsonWithCors(body, status = 200, extraHeaders = {}) {
  const headers = Object.assign({}, CORS_HEADERS, extraHeaders);
  return NextResponse.json(body, { status, headers });
}

export default {
  isACPRequest,
  wrapACPEnvelope,
  jsonWithCors,
};
