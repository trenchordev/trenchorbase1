import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { scanToken } from '@/lib/tokenScanner';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const CRON_SECRET = process.env.CRON_SECRET_KEY;

export async function POST(request) {
  try {
    const { searchParams } = new URL(request.url);
    const providedKey = searchParams.get('key');

    if (CRON_SECRET && CRON_SECRET.length > 0 && providedKey !== CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tokenIds = await redis.smembers('tokens:list');
    const results = [];

    for (const tokenId of tokenIds) {
      const tokenInfo = await redis.hgetall(`token:${tokenId}`);
      if (!tokenInfo) {
        results.push({ tokenId, status: 'skipped', reason: 'Missing token info' });
        continue;
      }

      try {
        const scanResult = await scanToken({
          tokenId,
          tokenName: tokenInfo.tokenName,
          tokenAddress: tokenInfo.tokenAddress,
          lpAddress: tokenInfo.lpAddress,
          startBlock: tokenInfo.startBlock,
          endBlock: tokenInfo.endBlock,
          redis,
        });

        results.push({ tokenId, status: 'ok', stats: scanResult.stats });
      } catch (error) {
        console.error(`Refresh failed for ${tokenId}:`, error.message);
        results.push({ tokenId, status: 'error', error: error.message });
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error('refresh-all error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
