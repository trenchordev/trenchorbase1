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

    if (!tokenId) {
      return NextResponse.json({ error: "tokenId gerekli!" }, { status: 400 });
    }

    const leaderboard = await redis.zrange(`leaderboard:${tokenId}`, 0, -1, {
      withScores: true,
      rev: true,
    });

    const processedData = [];
    
    if (leaderboard.length > 0) {
      if (typeof leaderboard[0] === 'object' && leaderboard[0] !== null && 'member' in leaderboard[0]) {
        for (const item of leaderboard) {
          const address = item.member;
          const userDetails = await redis.hgetall(`user:${tokenId}:${address}`);
          
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
      } else {
        for (let i = 0; i < leaderboard.length; i += 2) {
          const address = leaderboard[i];
          const userDetails = await redis.hgetall(`user:${tokenId}:${address}`);
          
          processedData.push({
            rank: processedData.length + 1,
            address,
            totalUsdVolume: userDetails?.totalUsdVolume ? parseFloat(userDetails.totalUsdVolume) : 0,
            buyUsdVolume: userDetails?.buyUsdVolume ? parseFloat(userDetails.buyUsdVolume) : 0,
            sellUsdVolume: userDetails?.sellUsdVolume ? parseFloat(userDetails.sellUsdVolume) : 0,
            netBuyUsd: userDetails?.netBuyUsd ? parseFloat(userDetails.netBuyUsd) : 0,
            totalVirtualVolume: userDetails?.totalVirtualVolume ? parseFloat(userDetails.totalVirtualVolume) : 0,
            totalTokenVolume: userDetails?.totalTokenVolume ? parseFloat(userDetails.totalTokenVolume) : 0,
            txCount: userDetails?.txCount ? parseInt(userDetails.txCount) : 0,
          });
        }
      }
    }

    // Token bilgilerini de ekle
    const tokenInfo = await redis.hgetall(`token:${tokenId}`);

    return NextResponse.json({
      token: tokenInfo,
      leaderboard: processedData
    });

  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
