import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function POST(request) {
  try {
    const { campaignId, wallet, postIndex, score, reviewedBy } = await request.json();

    if (!campaignId || !wallet || postIndex === undefined || score === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const submissionKey = `trenchshare:submission:${campaignId}:${wallet.toLowerCase()}`;
    
    // Get existing submission
    const submission = await redis.hgetall(submissionKey);
    if (!submission || !submission.posts) {
      return NextResponse.json(
        { error: 'Submission not found' },
        { status: 404 }
      );
    }

    const posts = JSON.parse(submission.posts);

    // Update the specific post
    if (!posts[postIndex]) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    const finalScore = parseInt(score);
    posts[postIndex].status = finalScore > 0 ? 'approved' : 'rejected';
    posts[postIndex].finalScore = finalScore;
    posts[postIndex].reviewedAt = Date.now();
    posts[postIndex].reviewedBy = reviewedBy;

    // Recalculate total points
    const totalPoints = posts
      .filter(p => p.status === 'approved')
      .reduce((sum, p) => sum + (p.finalScore || 0), 0);

    // Save updated submission
    await redis.hset(submissionKey, {
      ...submission,
      posts: JSON.stringify(posts),
      points: totalPoints.toString()
    });

    // Update leaderboard if approved
    if (finalScore > 0) {
      const leaderboardKey = `trenchshare:leaderboard:${campaignId}`;
      await redis.zadd(leaderboardKey, totalPoints, wallet.toLowerCase());
    }

    return NextResponse.json({ 
      success: true, 
      submission: { ...submission, posts, points: totalPoints },
      message: `Tweet ${finalScore > 0 ? 'approved' : 'rejected'} successfully` 
    });
  } catch (error) {
    console.error('Error scoring tweet:', error);
    return NextResponse.json(
      { error: 'Failed to score tweet' },
      { status: 500 }
    );
  }
}
