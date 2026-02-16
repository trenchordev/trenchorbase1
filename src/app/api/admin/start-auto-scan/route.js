/**
 * Start Auto Tax Scan
 * Creates a background job that continuously scans for 2940 blocks (98 minutes)
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { redis } from '@/lib/redis';
import { createScanJob, getJob } from '@/lib/taxScanJobManager';

export async function POST(request) {
  try {
    // Auth check
    const cookieStore = await cookies();
    const adminAuth = cookieStore.get('ADMIN_PASSWORD');

    if (adminAuth?.value !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { campaignId } = body;

    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
    }

    // Check if campaign exists
    const config = await redis.get(`tax-campaign-config:${campaignId}`);
    if (!config) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Check if job already exists and is active
    const existingJob = await getJob(campaignId);
    if (existingJob && existingJob.status === 'active') {
      return NextResponse.json({ 
        error: 'Job already running for this campaign',
        job: existingJob 
      }, { status: 409 });
    }

    // Get current block from network
    let rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
    const infuraKey = process.env.INFURA_API_KEY || process.env.NEXT_PUBLIC_INFURA_API_KEY;

    if (infuraKey) {
      rpcUrl = `https://base-mainnet.infura.io/v3/${infuraKey}`;
    }

    const client = createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    });

    const currentBlock = await client.getBlockNumber();

    // Create scan job (will scan for next 2940 blocks)
    const job = await createScanJob({
      campaignId,
      targetToken: config.targetToken,
      taxWallet: config.taxWallet,
      name: config.name,
      startBlock: currentBlock,
      logoUrl: config.logoUrl,
    });

    // Update campaign config with job info
    await redis.set(`tax-campaign-config:${campaignId}`, {
      ...config,
      autoScanEnabled: true,
      autoScanStartedAt: Date.now(),
      autoScanStartBlock: currentBlock.toString(),
    });

    console.log(`[Auto-Scan] Started job for ${campaignId} from block ${currentBlock}`);

    return NextResponse.json({
      success: true,
      message: `Auto-scan started! Will scan 2940 blocks (~98 minutes)`,
      job: {
        campaignId: job.campaignId,
        startBlock: job.startBlock,
        endBlock: job.endBlock,
        status: job.status,
        estimatedCompletionTime: new Date(Date.now() + 98 * 60 * 1000).toISOString(),
      }
    });

  } catch (error) {
    console.error('[Auto-Scan] Error starting job:', error);
    return NextResponse.json({
      error: error.message,
      details: error.stack
    }, { status: 500 });
  }
}
