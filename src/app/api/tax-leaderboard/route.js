import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get('tokenId');

    // If no tokenId, return all campaigns
    if (!tokenId) {
      const keys = await redis.keys('tax-campaign-config:*');
      const campaigns = [];

      for (const key of keys) {
        const config = await redis.get(key);
        if (config) {
          const campaignId = key.replace('tax-campaign-config:', '');
          const meta = await redis.hgetall(`tax-leaderboard-meta:${campaignId}`);
          
          campaigns.push({
            id: campaignId,
            name: config.name || campaignId,
            targetToken: config.targetToken,
            taxWallet: config.taxWallet,
            logoUrl: config.logoUrl ? `/images/${config.logoUrl}` : null,
            totalUsers: parseInt(meta?.totalUsers || '0'),
            totalTaxPaid: meta?.totalTaxPaid || '0.0000',
            lastUpdated: meta?.lastUpdated || null,
            timeWindowMinutes: config.timeWindowMinutes || 99,
          });
        }
      }

      campaigns.sort((a, b) => parseInt(b.lastUpdated || 0) - parseInt(a.lastUpdated || 0));
      return NextResponse.json({ campaigns });
    }

    // Fetch specific campaign leaderboard data
    const leaderboard = await redis.zrange(`tax-leaderboard:${tokenId}`, 0, -1, {
      withScores: true,
      rev: true,
    });

    // Fetch metadata
    const meta = await redis.hgetall(`tax-leaderboard-meta:${tokenId}`);
    
    // Fetch campaign config for additional info like logoUrl
    const config = await redis.get(`tax-campaign-config:${tokenId}`);

    const processedData = [];
    
    if (leaderboard.length > 0) {
      if (typeof leaderboard[0] === 'object' && leaderboard[0] !== null && 'member' in leaderboard[0]) {
        for (const item of leaderboard) {
          processedData.push({
            rank: processedData.length + 1,
            address: item.member,
            taxPaidVirtual: parseFloat(item.score),
          });
        }
      } else {
        for (let i = 0; i < leaderboard.length; i += 2) {
          const address = leaderboard[i];
          const taxPaid = parseFloat(leaderboard[i + 1]);
          
          processedData.push({
            rank: processedData.length + 1,
            address,
            taxPaidVirtual: taxPaid,
          });
        }
      }
    }

    return NextResponse.json({
      meta: {
        ...meta,
        name: config?.name || meta?.name || tokenId,
        logoUrl: config?.logoUrl || '',
      },
      leaderboard: processedData,
    });

  } catch (error) {
    console.error('Tax leaderboard error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
