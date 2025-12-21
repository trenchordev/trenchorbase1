import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get('wallet');

    if (!wallet) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    const walletLower = wallet.toLowerCase();
    
    // 1. Get all campaign IDs
    const campaignKeys = await redis.keys('trenchshare:campaign:*');
    const campaignIds = campaignKeys
      .filter(key => key.split(':').length === 3)
      .map(key => key.split(':')[2]);

    let totalPoints = 0;
    const campaignPoints = [];

    // 2. Sum points from each campaign's submission
    for (const id of campaignIds) {
      const submissionKey = `trenchshare:submission:${id}:${walletLower}`;
      const submission = await redis.hgetall(submissionKey);
      
      if (submission && submission.points) {
        const points = parseInt(submission.points) || 0;
        totalPoints += points;
        campaignPoints.push({
          campaignId: id,
          points: points
        });
      }
    }

    return NextResponse.json({
      success: true,
      wallet: walletLower,
      totalPoints,
      campaignPoints
    });
  } catch (error) {
    console.error('Error fetching user points:', error);
    return NextResponse.json({ error: 'Failed to fetch points' }, { status: 500 });
  }
}
