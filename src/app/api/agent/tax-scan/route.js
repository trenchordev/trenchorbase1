/**
 * ACP Agent: Tax Scanner
 * 
 * Endpoint: POST /api/agent/tax-scan
 * 
 * Purpose: Scan VIRTUAL token tax collection from launch block to +2940 blocks
 * 
 * Input:
 * {
 *   "tokenAddress": "0x...",  // Token to analyze
 *   "chainId": 8453            // (optional, default: Base)
 * }
 * 
 * Output:
 * {
 *   "agent_response": {
 *     "success": true,
 *     "token": "0x...",
 *     "launch_info": {...},
 *     "scan_config": {...},
 *     "tax_metrics": {...},
 *     "distributionStats": {...}
 *   }
 * }
 */

import { NextResponse } from 'next/server';
import { findTokenLaunchBlock } from '@/lib/tokenLaunchDetector';
import { scanTaxCollection } from '@/lib/agentTaxScanner';
import { validateTaxScanRequest, formatValidationErrors } from '@/lib/agentSchemaValidator';
import { redis } from '@/lib/redis';

// Constants
const MAX_SCAN_BLOCKS = 2940n; // ~98 minutes
const AGENT_VERSION = '1.0.0';
const AGENT_ID = 'tax-scanner-v1';

// CORS headers to allow browser-based tools (Hoppscotch/Postman-in-browser)
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-acp-version, x-agent-id',
};

function jsonWithCors(body, opts = {}) {
  const status = opts.status || 200;
  const extraHeaders = opts.headers || {};
  const headers = Object.assign({}, CORS_HEADERS, extraHeaders);
  return NextResponse.json(body, { status, headers });
}
/**
 * Detect if this is an ACP protocol request
 * ACP requests may include specific headers
 */
function isACPRequest(request) {
  const acpVersion = request.headers.get('x-acp-version');
  const agentId = request.headers.get('x-agent-id');
  const contentType = request.headers.get('content-type');

  return acpVersion || agentId || contentType?.includes('application/json');
}

/**
 * Wrap response in ACP protocol envelope
 */
function wrapACPResponse(agentResponse) {
  return {
    protocol: 'acp/1.0',
    agentId: AGENT_ID,
    agentVersion: AGENT_VERSION,
    timestamp: new Date().toISOString(),
    status: agentResponse.success ? 'success' : 'error',
    duration: agentResponse.metadata?.executionTime || 'unknown',
    data: agentResponse,
    ttl: 3600, // Cache 1 hour
  };
}

/**
 * Validate token address format
 */
function isValidTokenAddress(address) {
  return address && typeof address === 'string' && address.match(/^0x[a-fA-F0-9]{40}$/i);
}

export async function POST(request) {
  const startTime = Date.now();
  const isACP = isACPRequest(request);

  try {
    // Parse request body
    const body = await request.json();
    const { tokenAddress, chainId = 8453 } = body;

    // ===== SCHEMA VALIDATION =====
    const validation = validateTaxScanRequest(body);
    if (!validation.valid) {
      console.log('[Agent/Tax-Scan] Validation failed:', validation.errors);

      return jsonWithCors(
        {
          agent_response: {
            success: false,
            error: 'Request validation failed',
            error_code: 'VALIDATION_ERROR',
            details: formatValidationErrors(validation.errors),
          },
        },
        { status: 400 }
      );
    }

    // Use validated data (includes defaults)
    const validatedAddress = validation.data.tokenAddress.toLowerCase();
    const validatedChainId = validation.data.chainId;

    console.log(`[Agent/Tax-Scan] Request for token: ${validatedAddress} (chain: ${validatedChainId})`);

    // Only support Base chain
    if (validatedChainId !== 8453) {
      return jsonWithCors(
        {
          agent_response: {
            success: false,
            error: 'Unsupported chain',
            error_code: 'UNSUPPORTED_CHAIN',
            supported_chains: [8453],
            hint: 'Currently only Base Chain (8453) is supported',
          },
        },
        { status: 400 }
      );
    }

    // ===== CACHE CHECK =====
    const cacheKey = `agent:tax-scan:${validatedAddress}`;
    try {
      if (!body.testMode) {
        const cachedResponseStr = await redis.get(cacheKey);
        if (cachedResponseStr) {
          const cachedResponse = typeof cachedResponseStr === 'string' ? JSON.parse(cachedResponseStr) : cachedResponseStr;
          console.log(`[Agent/Tax-Scan] ⚡ Cache HIT for token: ${validatedAddress}`);
          const cacheExecutionTime = Date.now() - startTime;
          cachedResponse.metadata.executionTime = `${cacheExecutionTime}ms (from cache)`;

          const responseBody = isACP ? wrapACPResponse(cachedResponse) : { agent_response: cachedResponse };
          return jsonWithCors(responseBody, {
            headers: {
              'x-acp-protocol': '1.0',
              'x-agent-id': AGENT_ID,
              'x-agent-version': AGENT_VERSION,
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }
      }
    } catch (e) {
      console.warn('[Agent/Tax-Scan] Cache read warning:', e.message);
    }

    // ===== LAUNCH BLOCK DETECTION =====
    console.log('[Agent/Tax-Scan] Step 1: Finding token launch block...');
    let launchInfo;
    try {
      launchInfo = await findTokenLaunchBlock(validatedAddress);
    } catch (error) {
      console.error('[Agent/Tax-Scan] Launch detection failed:', error);
      return jsonWithCors(
        {
          agent_response: {
            success: false,
            error: 'Failed to detect token launch block',
            error_code: 'LAUNCH_DETECTION_FAILED',
            details: error.message,
          },
        },
        { status: 500 }
      );
    }

    if (!launchInfo) {
      return jsonWithCors(
        {
          agent_response: {
            success: false,
            error: 'Token launch block not found',
            error_code: 'LAUNCH_BLOCK_NOT_FOUND',
            hint: 'Token may not have transferred to tax wallet yet, or is not on Base chain',
          },
        },
        { status: 404 }
      );
    }

    console.log(`[Agent/Tax-Scan] Launch block detected: ${launchInfo.launchBlock}`);

    // QUICK-TEST MODE: if client requests testMode, return launch info only
    // This avoids long-running scans and helps in-browser tools (Hoppscotch/Virtual) to validate integration.
    if (body && body.testMode) {
      const quickResponse = {
        success: true,
        message: 'Quick test: launch detection only',
        token: validatedAddress,
        launch_info: {
          launchBlock: launchInfo.launchBlock.toString(),
          launchTx: launchInfo.launchTx,
          launchTimestamp: launchInfo.launchTimestamp,
        },
      };

      return jsonWithCors({ agent_response: quickResponse }, { headers: { 'x-acp-protocol': '1.0' } });
    }

    // ===== TAX SCANNING =====
    const launchBlock = BigInt(launchInfo.launchBlock);
    const endBlock = launchBlock + MAX_SCAN_BLOCKS;

    console.log(`[Agent/Tax-Scan] Step 2: Scanning blocks ${launchBlock} to ${endBlock}...`);

    let taxReport;
    try {
      taxReport = await scanTaxCollection(launchBlock, endBlock);
    } catch (error) {
      console.error('[Agent/Tax-Scan] Tax scanning failed:', error);
      return jsonWithCors(
        {
          agent_response: {
            success: false,
            error: 'Failed to scan tax collection',
            error_code: 'SCAN_FAILED',
            details: error.message,
          },
        },
        { status: 500 }
      );
    }

    // ===== BUILD RESPONSE =====
    const executionTime = Date.now() - startTime;

    const agentResponse = {
      success: true,
      message: 'Tax collection analysis complete',
      token: validatedAddress,
      chainId: 8453,

      launch_info: {
        launchBlock: launchInfo.launchBlock.toString(),
        launchTx: launchInfo.launchTx,
        launchTimestamp: launchInfo.launchTimestamp,
        launchBlockTime: launchInfo.blockTime,
      },

      scan_config: {
        startBlock: taxReport.scanConfig.startBlock,
        endBlock: taxReport.scanConfig.endBlock,
        totalBlocksScanned: taxReport.scanConfig.totalBlocksScanned,
        estimatedDuration: taxReport.scanConfig.estimatedDuration,
      },

      tax_metrics: {
        totalTaxCollected: taxReport.taxMetrics.totalTaxCollected,
        totalTransactions: taxReport.taxMetrics.totalTransactions,
        uniqueContributors: taxReport.taxMetrics.uniqueContributors,
        averageTaxPerContributor: taxReport.taxMetrics.averageTaxPerContributor,
        largestSingleContribution: taxReport.taxMetrics.largestSingleContribution,
        topContributor: taxReport.taxMetrics.topContributor,
        top10Contributors: taxReport.taxMetrics.topContributors,
      },

      distribution_stats: {
        median: taxReport.distributionStats.median,
        mode: taxReport.distributionStats.mode,
        standardDeviation: taxReport.distributionStats.standardDeviation,
        minContribution: taxReport.distributionStats.minContribution,
        maxContribution: taxReport.distributionStats.maxContribution,
      },

      bonding_curve_status: 'Scanning blocks where bonding curve collected taxes (launch → +2940 blocks)',

      metadata: {
        executionTime: `${executionTime}ms`,
        scannedAt: taxReport.timestamp,
        taxWallet: '0x32487287c65f11d53bbCa89c2472171eB09bf337',
      },
    };

    console.log(`[Agent/Tax-Scan] ✅ Complete (${executionTime}ms)`);

    // Save to cache for 24 hours (86400 seconds)
    try {
      if (!body.testMode) {
        await redis.setex(cacheKey, 86400, JSON.stringify(agentResponse));
        console.log(`[Agent/Tax-Scan] 💾 Saved to cache: ${cacheKey}`);
      }
    } catch (e) {
      console.warn('[Agent/Tax-Scan] Cache write warning:', e.message);
    }

    // Wrap in ACP protocol if ACP request
    const responseBody = isACP ? wrapACPResponse(agentResponse) : { agent_response: agentResponse };

    return jsonWithCors(responseBody, {
      headers: {
        'x-acp-protocol': '1.0',
        'x-agent-id': AGENT_ID,
        'x-agent-version': AGENT_VERSION,
        'Cache-Control': 'public, max-age=3600',
      },
    });

  } catch (error) {
    console.error('[Agent/Tax-Scan] Unhandled error:', error);
    return jsonWithCors(
      {
        agent_response: {
          success: false,
          error: 'Internal server error',
          error_code: 'INTERNAL_ERROR',
          details: error.message,
        },
      },
      { status: 500 }
    );
  }
}

/**
 * Health check - GET /api/agent/tax-scan
 */
export async function GET(request) {
  const isACP = isACPRequest(request);

  const healthResponse = {
    status: 'online',
    agent_name: 'Tax Scanner Agent',
    agent_id: AGENT_ID,
    version: AGENT_VERSION,
    description: 'Scans VIRTUAL token tax collection from launch block to +2940 blocks',
    uptime: 'operational',

    capabilities: [
      {
        id: 'scan-tax-collection',
        name: 'Scan Tax Collection',
        description: 'Analyze VIRTUAL token tax collection from launch to +2940 blocks (approximately 98 minutes)',
      },
    ],

    endpoints: {
      'POST /api/agent/tax-scan': {
        description: 'Scan tax collection for a token',
        method: 'POST',
        authentication: 'none',
      },
      'GET /api/agent/tax-scan': {
        description: 'Health check and capability discovery',
        method: 'GET',
        authentication: 'none',
      },
    },

    supported_chains: [
      {
        chainId: 8453,
        name: 'Base',
        rpcProvider: 'infura',
      },
    ],

    performance: {
      averageScanTime: '45 seconds',
      maxScanDuration: '120 seconds',
      blockProcessRate: '~30 blocks/second',
    },

    example_request: {
      method: 'POST',
      url: '/api/agent/tax-scan',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        tokenAddress: '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b',
        chainId: 8453,
      },
    },

    rate_limits: {
      requestsPerMinute: 30,
      requestsPerHour: 1000,
      burstLimit: 5,
    },

    caching: {
      enabled: true,
      tokenLaunchBlockTTL: '24 hours',
      responseTTL: '1 hour',
    },
  };

  const responseBody = isACP ? wrapACPResponse(healthResponse) : { agent_response: healthResponse };

  return jsonWithCors(responseBody, {
    headers: {
      'x-acp-protocol': '1.0',
      'x-agent-id': AGENT_ID,
      'x-agent-version': AGENT_VERSION,
      'Cache-Control': 'public, max-age=300',
    },
  });
}

// Respond to CORS preflight from browsers / in-browser tools
export async function OPTIONS(request) {
  return NextResponse.json(null, { status: 204, headers: CORS_HEADERS });
}

export const maxDuration = 60; // Vercel: allow up to 60 seconds for full scan
