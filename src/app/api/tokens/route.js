import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { scanToken } from '@/lib/tokenScanner';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      tokenId,
      tokenName,
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

    const result = await scanToken({
      tokenId,
      tokenName,
      tokenAddress,
      lpAddress,
      startBlock,
      endBlock,
      redis,
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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get('tokenId');

    if (tokenId) {
      const tokenInfo = await redis.hgetall(`token:${tokenId}`);
      return NextResponse.json(tokenInfo || {});
    }

    const tokenIds = await redis.smembers('tokens:list');
    const tokens = [];

    for (const id of tokenIds) {
      const info = await redis.hgetall(`token:${id}`);
      if (info) tokens.push(info);
    }

    return NextResponse.json(tokens);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
