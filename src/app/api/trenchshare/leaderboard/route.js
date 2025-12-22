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
    const entries = await redis.zrange(leaderboardKey, 0, 99, { rev: true, withScores: true });

    // Parse entries which can be either [{ member, score }, ...] or [member, score, ...]
    const leaderboard = [];

    if (entries && entries.length > 0) {
      // Check if it's an array of objects (modern Upstash)
      if (typeof entries[0] === 'object' && entries[0] !== null && 'member' in entries[0]) {
        entries.forEach((entry, index) => {
          leaderboard.push({
            wallet: entry.member,
            points: entry.score,
            rank: index + 1
          });
        });
      } else {
        // Handle flat array [member, score, member, score...]
        for (let i = 0; i < entries.length; i += 2) {
          leaderboard.push({
            wallet: entries[i],
            points: Number(entries[i + 1]),
            rank: (i / 2) + 1
          });
        }
      }
    }

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
