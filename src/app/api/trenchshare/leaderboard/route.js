import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('campaignId');

    if (!campaignId) {
      return NextResponse.json(
        { error: 'Campaign ID is required' },
        { status: 400 }
      );
    }

    const leaderboardKey = `trenchshare:leaderboard:${campaignId}`;

    // Get top 100 from sorted set (descending order)
    // Get top 100 from sorted set (descending order)
    const entries = await redis.zrange(leaderboardKey, 0, 99, { rev: true, withScores: true });

    // Parse entries into array of {wallet, points}
    const leaderboard = entries.map((entry, index) => ({
      wallet: entry.member,
      points: entry.score,
      rank: index + 1
    }));

    // Get campaign info
    const campaign = await redis.hgetall(`trenchshare:campaign:${campaignId}`);

    return NextResponse.json({
      leaderboard,
      campaign,
      totalParticipants: leaderboard.length
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard' },
      { status: 500 }
    );
  }
}
