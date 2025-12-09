import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export async function POST(request) {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('ADMIN_PASSWORD');

  if (adminAuth?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { txHash } = await request.json();
    
    if (!txHash) {
      return NextResponse.json({ error: 'txHash required' }, { status: 400 });
    }

    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
    const client = createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    });

    // Fetch transaction receipt
    const receipt = await client.getTransactionReceipt({ hash: txHash });

    const analysis = {
      txHash,
      blockNumber: parseInt(receipt.blockNumber, 16),
      from: receipt.from,
      to: receipt.to,
      status: receipt.status,
      logs: [],
      transfers: [],
    };

    // Analyze all logs
    for (const log of receipt.logs) {
      const logInfo = {
        address: log.address.toLowerCase(),
        topics: log.topics,
        data: log.data,
      };

      // Check if it's a Transfer event
      if (log.topics[0] === TRANSFER_TOPIC) {
        const from = log.topics[1] ? `0x${log.topics[1].slice(26)}` : null;
        const to = log.topics[2] ? `0x${log.topics[2].slice(26)}` : null;
        const value = log.data;

        logInfo.isTransfer = true;
        logInfo.from = from?.toLowerCase();
        logInfo.to = to?.toLowerCase();
        logInfo.value = value;
        logInfo.valueDecimal = parseInt(value, 16) / 1e18;

        analysis.transfers.push({
          token: log.address.toLowerCase(),
          from: from?.toLowerCase(),
          to: to?.toLowerCase(),
          value: logInfo.valueDecimal,
        });
      }

      analysis.logs.push(logInfo);
    }

    // Check for VIRTUAL token
    const virtualAddress = '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b';
    const virtualTransfers = analysis.transfers.filter(t => t.token === virtualAddress);

    analysis.summary = {
      totalTransfers: analysis.transfers.length,
      uniqueTokens: [...new Set(analysis.transfers.map(t => t.token))],
      virtualTransfers: virtualTransfers.length,
      virtualTransferDetails: virtualTransfers,
    };

    return NextResponse.json({ success: true, analysis });

  } catch (error) {
    console.error('TX analyze error:', error);
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
