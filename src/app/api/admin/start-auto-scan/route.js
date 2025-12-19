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

    // Check if there's existing scan progress (from manual scan)
    const metaKey = `tax-leaderboard-meta:${campaignId}`;
    const existingMeta = await redis.hgetall(metaKey);
    let resumeFromBlock = null;
    
    if (existingMeta && existingMeta.endBlock) {
      // If there was a previous scan, we can resume from where it left off
      resumeFromBlock = BigInt(existingMeta.endBlock);
      console.log(`[Auto-Scan] Found existing scan progress, can resume from block ${resumeFromBlock}`);
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

    // Validate currentBlock before creating job
    if (!currentBlock) {
      return NextResponse.json({ 
        error: 'Failed to fetch current block number from network' 
      }, { status: 500 });
    }

    // Determine scan start block
    let scanStartBlock;
    let scanEndBlock;
    
    // Priority 1: Resume from previous scan if available
    if (resumeFromBlock && config.startBlock && config.endBlock) {
      const configEndBlock = BigInt(config.endBlock);
      if (resumeFromBlock < configEndBlock) {
        scanStartBlock = resumeFromBlock;
        scanEndBlock = configEndBlock;
        console.log(`[Auto-Scan] 🔄 RESUMING from previous scan: ${scanStartBlock} -> ${scanEndBlock}`);
      } else {
        console.log(`[Auto-Scan] ✅ Previous scan completed full range. Starting fresh.`);
        scanStartBlock = BigInt(config.startBlock);
        scanEndBlock = BigInt(config.endBlock);
      }
    }
    // Priority 2: Use campaign config startBlock/endBlock if specified
    else if (config.startBlock && config.endBlock) {
      scanStartBlock = BigInt(config.startBlock);
      scanEndBlock = BigInt(config.endBlock);
      console.log(`[Auto-Scan] Using campaign config blocks: ${scanStartBlock} -> ${scanEndBlock}`);
    } 
    // Priority 3: If only startBlock, use +2940 blocks
    else if (config.startBlock) {
      scanStartBlock = BigInt(config.startBlock);
      scanEndBlock = scanStartBlock + 2940n;
      // Don't scan beyond current
      if (scanEndBlock > currentBlock) {
        scanEndBlock = currentBlock;
      }
      console.log(`[Auto-Scan] Using campaign startBlock with +2940: ${scanStartBlock} -> ${scanEndBlock}`);
    } 
    // Priority 4: Default to current block
    else {
      scanStartBlock = currentBlock;
      scanEndBlock = currentBlock + 2940n;
      console.log(`[Auto-Scan] Using current block: ${scanStartBlock} -> ${scanEndBlock}`);
    }

    // Create scan job with determined blocks
    const job = await createScanJob({
      campaignId,
      targetToken: config.targetToken,
      taxWallet: config.taxWallet,
      name: config.name,
      startBlock: scanStartBlock.toString(),
      endBlock: scanEndBlock.toString(),
      logoUrl: config.logoUrl,
    });

    // Update campaign config with job info
    await redis.set(`tax-campaign-config:${campaignId}`, {
      ...config,
      autoScanEnabled: true,
      autoScanStartedAt: Date.now(),
      autoScanStartBlock: scanStartBlock.toString(),
      autoScanEndBlock: scanEndBlock.toString(),
    });

    const totalBlocks = scanEndBlock - scanStartBlock;
    const estimatedMinutes = Number(totalBlocks) * 2 / 60; // ~2 sec per block
    const isResuming = resumeFromBlock !== null && resumeFromBlock > 0n;

    console.log(`[Auto-Scan] Started job for ${campaignId}: ${scanStartBlock} -> ${scanEndBlock} (${totalBlocks} blocks)`);

    return NextResponse.json({
      success: true,
      message: isResuming 
        ? `🔄 Auto-scan resumed! Continuing from block ${scanStartBlock} to ${scanEndBlock} (${totalBlocks} blocks remaining)`
        : `✅ Auto-scan started! Will scan from ${scanStartBlock} to ${scanEndBlock} (${totalBlocks} blocks, ~${Math.ceil(estimatedMinutes)} minutes)`,
      job: {
        campaignId: job.campaignId,
        startBlock: job.startBlock,
        endBlock: job.endBlock,
        currentBlock: job.currentBlock,
        status: job.status,
        totalBlocks: totalBlocks.toString(),
        estimatedMinutes: Math.ceil(estimatedMinutes),
        isResuming,
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
