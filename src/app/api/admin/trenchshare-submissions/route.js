import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { cookies } from 'next/headers';

async function isAdmin() {
  const cookieStore = await cookies();
  const session = cookieStore.get('admin_session');
  return session?.value === 'authenticated';
}

// GET - List all submissions for a campaign
export async function GET(request) {
  try {
    if (!await isAdmin()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('campaignId');

    if (!campaignId) {
      return NextResponse.json({ error: 'Campaign ID is required' }, { status: 400 });
    }

    // Use the set of submissions instead of scanning keys
    const submissionWallets = await redis.smembers(`trenchshare:campaign:${campaignId}:submissions`);
    const submissions = [];

    for (const wallet of submissionWallets) {
      const key = `trenchshare:submission:${campaignId}:${wallet}`;
      const submission = await redis.hgetall(key);

      if (submission && submission.posts) {
        submissions.push({
          campaignId: submission.campaignId,
          wallet: submission.wallet,
          posts: JSON.parse(submission.posts),
          status: submission.status || 'pending',
          points: parseInt(submission.points) || 0,
          timestamp: submission.timestamp,
          submittedAt: submission.submittedAt,
        });
      }
    }

    // Sort by submittedAt desc
    submissions.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    return NextResponse.json({ submissions });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    return NextResponse.json({ error: 'Failed to fetch submissions' }, { status: 500 });
  }
}

// PUT - Update submission (approve/reject, assign points)
export async function PUT(request) {
  try {
    if (!await isAdmin()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { campaignId, wallet, status, points } = body;

    if (!campaignId || !wallet) {
      return NextResponse.json({ error: 'Campaign ID and wallet are required' }, { status: 400 });
    }

    const key = `trenchshare:submission:${campaignId}:${wallet.toLowerCase()}`;
    const existing = await redis.hgetall(key);

    if (!existing || !existing.posts) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    const updates = {};
    if (status !== undefined) updates.status = status;
    if (points !== undefined) updates.points = points.toString();

    if (Object.keys(updates).length > 0) {
      await redis.hset(key, updates);
    }

    // If points are assigned, update the wallet's total points
    if (points !== undefined && points > 0) {
      const pointsKey = `trenchshare:points:${wallet.toLowerCase()}`;
      const currentPoints = await redis.hgetall(pointsKey);

      const oldCampaignPoints = parseInt(currentPoints?.campaigns ?
        (JSON.parse(currentPoints.campaigns)[campaignId] || 0) : 0);
      const totalPoints = parseInt(currentPoints?.total || 0) - oldCampaignPoints + points;

      const campaigns = currentPoints?.campaigns ? JSON.parse(currentPoints.campaigns) : {};
      campaigns[campaignId] = points;

      await redis.hset(pointsKey, {
        wallet: wallet.toLowerCase(),
        total: totalPoints.toString(),
        campaigns: JSON.stringify(campaigns),
      });

      // Update leaderboard sorted set
      await redis.zadd('trenchshare:leaderboard', { score: totalPoints, member: wallet.toLowerCase() });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating submission:', error);
    return NextResponse.json({ error: 'Failed to update submission' }, { status: 500 });
  }
}
