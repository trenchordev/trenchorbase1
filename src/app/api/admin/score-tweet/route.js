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

    const submissionKey = `submission:${campaignId}:${wallet.toLowerCase()}`;
    
    // Get existing submission
    const submissionData = await redis.get(submissionKey);
    if (!submissionData) {
      return NextResponse.json(
        { error: 'Submission not found' },
        { status: 404 }
      );
    }

    const submission = JSON.parse(submissionData);

    // Update the specific post
    if (!submission.posts[postIndex]) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      );
    }

    const finalScore = parseInt(score);
    submission.posts[postIndex].status = finalScore > 0 ? 'approved' : 'rejected';
    submission.posts[postIndex].finalScore = finalScore;
    submission.posts[postIndex].reviewedAt = Date.now();
    submission.posts[postIndex].reviewedBy = reviewedBy;

    // Recalculate total points
    submission.totalPoints = submission.posts
      .filter(p => p.status === 'approved')
      .reduce((sum, p) => sum + (p.finalScore || 0), 0);

    // Save updated submission
    await redis.set(submissionKey, JSON.stringify(submission));

    // Update leaderboard if approved
    if (finalScore > 0) {
      const leaderboardKey = `leaderboard:campaign:${campaignId}`;
      await redis.zadd(leaderboardKey, submission.totalPoints, wallet.toLowerCase());
    }

    return NextResponse.json({ 
      success: true, 
      submission,
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
