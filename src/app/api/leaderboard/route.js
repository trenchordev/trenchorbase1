import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function GET() {
  try {
    const leaderboard = await redis.zrange('leaderboard:volume', 0, -1, {
      withScores: true,
      rev: true,
    });

    const processedData = [];
    
    if (leaderboard.length > 0) {
      if (typeof leaderboard[0] === 'object' && leaderboard[0] !== null && 'member' in leaderboard[0]) {
        for (const item of leaderboard) {
          const address = item.member;
          const userDetails = await redis.hgetall(`user:${address}`);
          
          processedData.push({
            rank: processedData.length + 1,
            address,
            // USD Volumes
            totalUsdVolume: userDetails?.totalUsdVolume ? parseFloat(userDetails.totalUsdVolume) : 0,
            buyUsdVolume: userDetails?.buyUsdVolume ? parseFloat(userDetails.buyUsdVolume) : 0,
            sellUsdVolume: userDetails?.sellUsdVolume ? parseFloat(userDetails.sellUsdVolume) : 0,
            netBuyUsd: userDetails?.netBuyUsd ? parseFloat(userDetails.netBuyUsd) : 0,
            // VIRTUAL Volumes
            totalVirtualVolume: userDetails?.totalVirtualVolume ? parseFloat(userDetails.totalVirtualVolume) : 0,
            buyVirtualVolume: userDetails?.buyVirtualVolume ? parseFloat(userDetails.buyVirtualVolume) : 0,
            sellVirtualVolume: userDetails?.sellVirtualVolume ? parseFloat(userDetails.sellVirtualVolume) : 0,
            netBuyVirtual: userDetails?.netBuyVirtual ? parseFloat(userDetails.netBuyVirtual) : 0,
            // Token Volume
            totalTokenVolume: userDetails?.totalTokenVolume ? parseFloat(userDetails.totalTokenVolume) : 0,
            // TX Count
            txCount: userDetails?.txCount ? parseInt(userDetails.txCount) : 0,
          });
        }
      } else {
        for (let i = 0; i < leaderboard.length; i += 2) {
          const address = leaderboard[i];
          const userDetails = await redis.hgetall(`user:${address}`);
          
          processedData.push({
            rank: processedData.length + 1,
            address,
            totalUsdVolume: userDetails?.totalUsdVolume ? parseFloat(userDetails.totalUsdVolume) : 0,
            buyUsdVolume: userDetails?.buyUsdVolume ? parseFloat(userDetails.buyUsdVolume) : 0,
            sellUsdVolume: userDetails?.sellUsdVolume ? parseFloat(userDetails.sellUsdVolume) : 0,
            netBuyUsd: userDetails?.netBuyUsd ? parseFloat(userDetails.netBuyUsd) : 0,
            totalVirtualVolume: userDetails?.totalVirtualVolume ? parseFloat(userDetails.totalVirtualVolume) : 0,
            buyVirtualVolume: userDetails?.buyVirtualVolume ? parseFloat(userDetails.buyVirtualVolume) : 0,
            sellVirtualVolume: userDetails?.sellVirtualVolume ? parseFloat(userDetails.sellVirtualVolume) : 0,
            netBuyVirtual: userDetails?.netBuyVirtual ? parseFloat(userDetails.netBuyVirtual) : 0,
            totalTokenVolume: userDetails?.totalTokenVolume ? parseFloat(userDetails.totalTokenVolume) : 0,
            txCount: userDetails?.txCount ? parseInt(userDetails.txCount) : 0,
          });
        }
      }
    }

    return NextResponse.json(processedData);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard data', details: error.message },
      { status: 500 }
    );
  }
}
