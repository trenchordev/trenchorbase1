import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Redis } from '@upstash/redis';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { scanToken } from '@/lib/tokenScanner';

const COOKIE_NAME = 'ADMIN_PASSWORD';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const RPC_ENDPOINTS = [
  'https://mainnet.base.org',
  'https://base.llamarpc.com',
  'https://base-mainnet.public.blastapi.io',
];

async function getBestClient() {
  let bestBlock = 0n;
  let bestRpc = RPC_ENDPOINTS[0];

  for (const rpc of RPC_ENDPOINTS) {
    try {
      const tempClient = createPublicClient({
        chain: base,
        transport: http(rpc, { timeout: 3000 }),
      });
      const block = await tempClient.getBlockNumber();
      if (block > bestBlock) {
        bestBlock = block;
        bestRpc = rpc;
      }
    } catch (error) {
      console.log(`RPC ${rpc} failed:`, error.message);
    }
  }

  console.log(`Using RPC: ${bestRpc} at block ${bestBlock}`);

  return createPublicClient({
    chain: base,
    transport: http(bestRpc),
  });
}

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const authCookie = cookieStore.get(COOKIE_NAME);
    if (authCookie?.value !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      tokenId,
      tokenName,
      ticker,
      tokenAddress,
      lpAddress,
      startBlock,
      endBlock,
      imageUrl,
      timeline,
      distributionPeriod,
      details,
      campaignLinks,
      isFeatured,
    } = body;

    if (!tokenId || !tokenAddress || !lpAddress) {
      return NextResponse.json({
        error: 'tokenId, tokenAddress ve lpAddress gerekli!'
      }, { status: 400 });
    }

    const client = await getBestClient();

    const result = await scanToken({
      tokenId,
      tokenName,
      ticker,
      tokenAddress,
      lpAddress,
      startBlock,
      endBlock,
      redis,
      client,
      imageUrl,
      timeline,
      distributionPeriod,
      details,
      campaignLinks,
      isFeatured,
    });

    return NextResponse.json({
      success: true,
      tokenId,
      stats: result.stats,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
