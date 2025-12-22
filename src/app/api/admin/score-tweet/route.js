
import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function POST(request) {
  try {
    const { campaignId, wallet, postIndex, score, reviewedBy } = await request.json();

    console.log('[Score] Request:', { campaignId, wallet, postIndex, score });

    if (!campaignId || !wallet || postIndex === undefined || score === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const submissionKey = `trenchshare:submission:${campaignId}:${wallet.toLowerCase()}`;

    // Get existing submission
    const submission = await redis.hgetall(submissionKey);
    if (!submission || !submission.posts) {
      console.error('[Score] Submission not found for:', submissionKey);
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    let posts;
    try {
      posts = typeof submission.posts === 'string' ? JSON.parse(submission.posts) : submission.posts;
    } catch (e) {
      console.error('[Score] JSON Parse Error:', e);
      return NextResponse.json({ error: 'Data corruption: Invalid posts JSON' }, { status: 500 });
    }

    // Update the specific post
    if (!posts[postIndex]) {
      console.error('[Score] Post index not found:', postIndex);
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const finalScore = parseInt(score);
    if (isNaN(finalScore)) {
      return NextResponse.json({ error: 'Invalid score' }, { status: 400 });
    }

    posts[postIndex].status = finalScore > 0 ? 'approved' : 'rejected';
    posts[postIndex].finalScore = finalScore;
    posts[postIndex].reviewedAt = Date.now();
    posts[postIndex].reviewedBy = reviewedBy || 'admin';

    // Recalculate total points
    const totalPoints = posts
      .filter(p => (p.status === 'approved' && typeof p.finalScore === 'number'))
      .reduce((sum, p) => sum + p.finalScore, 0);

    console.log('[Score] Calculated total points:', totalPoints);

    // Save updated submission
    await redis.hset(submissionKey, {
      ...submission,
      posts: JSON.stringify(posts),
      points: totalPoints.toString()
    });

    // Update leaderboard
    const leaderboardKey = `trenchshare:leaderboard:${campaignId}`;
    try {
      await redis.zadd(leaderboardKey, { score: totalPoints, member: wallet.toLowerCase() });
    } catch (zaddError) {
      console.error('[Score] Leaderboard update failed:', zaddError);
      // We don't fail the whole request if only leaderboard update fails, but we log it.
      // Or we can throw to alert user. Let's throw for now to see it.
      throw new Error(`Leaderboard update failed: ${zaddError.message}`);
    }

    console.log('[Score] Success');

    return NextResponse.json({
      success: true,
      submission: { ...submission, posts, points: totalPoints },
      message: `Tweet scored ${finalScore}`
    });
  } catch (error) {
    console.error('Error scoring tweet:', error);
    return NextResponse.json(
      { error: `Failed to score: ${error.message}` },
      { status: 500 }
    );
  }
}
