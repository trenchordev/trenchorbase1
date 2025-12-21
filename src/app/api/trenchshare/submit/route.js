import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { verifyTypedData } from 'viem';

const isTruthy = (value) => value === true || value === 'true' || value === 1 || value === '1';

const DOMAIN = {
  name: 'Trenchor',
  version: '1',
  chainId: 8453,
};

const TYPES = {
  Submission: [
    { name: 'campaignId', type: 'string' },
    { name: 'postCount', type: 'uint256' },
    { name: 'timestamp', type: 'uint256' },
  ],
};

export async function POST(request) {
  try {
    const body = await request.json();
    const { campaignId, wallet, posts, signature, timestamp } = body;

    // Validate input
    if (!campaignId || !wallet || !posts || !signature || !timestamp) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!Array.isArray(posts) || posts.length === 0) {
      return NextResponse.json({ error: 'At least one post is required' }, { status: 400 });
    }

    if (posts.length > 10) {
      return NextResponse.json({ error: 'Maximum 10 posts allowed' }, { status: 400 });
    }

    // Validate Twitter URLs
    const twitterPattern = /^https?:\/\/(twitter\.com|x\.com)\/[a-zA-Z0-9_]+\/status\/[0-9]+/;
    for (const post of posts) {
      if (!twitterPattern.test(post)) {
        return NextResponse.json({ error: `Invalid Twitter/X URL: ${post}` }, { status: 400 });
      }
    }

    const walletLower = wallet.toLowerCase();
    const today = new Date().toISOString().split('T')[0];
    const dailyLimitKey = `trenchshare:daily-limit:${campaignId}:${walletLower}:${today}`;

    // Check daily limit (10 posts per day)
    const currentDailyCount = await redis.get(dailyLimitKey) || 0;
    if (parseInt(currentDailyCount) + posts.length > 10) {
      return NextResponse.json({ 
        error: `Daily limit reached. You can submit ${10 - parseInt(currentDailyCount)} more posts today.` 
      }, { status: 400 });
    }

    // Check if campaign exists and is active
    const campaignKey = `trenchshare:campaign:${campaignId}`;
    const campaign = await redis.hgetall(campaignKey);

    if (!campaign || !campaign.id) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (!isTruthy(campaign.active)) {
      return NextResponse.json({ error: 'Campaign is not active' }, { status: 400 });
    }

    const now = new Date();
    const startDate = new Date(campaign.startDate);
    const endDate = new Date(campaign.endDate);

    if (now < startDate || now > endDate) {
      return NextResponse.json({ error: 'Campaign is not currently running' }, { status: 400 });
    }

    // Fetch existing submission to append posts
    const submissionKey = `trenchshare:submission:${campaignId}:${walletLower}`;
    const existingSubmission = await redis.hgetall(submissionKey);
    
    let allPosts = [];
    if (existingSubmission && existingSubmission.posts) {
      try {
        allPosts = JSON.parse(existingSubmission.posts);
      } catch (e) {
        console.error('Error parsing existing posts:', e);
        allPosts = [];
      }
    }

    // Check for duplicate URLs
    const existingUrls = allPosts.map(p => typeof p === 'string' ? p : p.url);
    for (const newPostUrl of posts) {
      if (existingUrls.includes(newPostUrl)) {
        return NextResponse.json({ error: `Post already submitted: ${newPostUrl}` }, { status: 400 });
      }
    }

    // Verify signature
    try {
      const isValid = await verifyTypedData({
        address: wallet,
        domain: DOMAIN,
        types: TYPES,
        primaryType: 'Submission',
        message: {
          campaignId,
          postCount: BigInt(posts.length),
          timestamp: BigInt(timestamp),
        },
        signature,
      });

      if (!isValid) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
      }
    } catch (err) {
      console.error('Signature verification error:', err);
      return NextResponse.json({ error: 'Signature verification failed' }, { status: 400 });
    }

    // Check timestamp is recent (within 10 minutes)
    const nowTs = Math.floor(Date.now() / 1000);
    if (Math.abs(nowTs - timestamp) > 600) {
      return NextResponse.json({ error: 'Signature expired' }, { status: 400 });
    }

    // Create new post objects
    const newPostObjects = posts.map(url => ({
      url,
      status: 'pending',
      submittedAt: new Date().toISOString(),
      finalScore: 0
    }));

    // Update posts array
    const updatedPosts = [...allPosts, ...newPostObjects];

    // Save submission
    const submission = {
      campaignId,
      wallet: walletLower,
      posts: JSON.stringify(updatedPosts),
      signature, // Store latest signature
      timestamp: timestamp.toString(),
      status: existingSubmission?.status || 'pending',
      points: existingSubmission?.points || '0',
      submittedAt: existingSubmission?.submittedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await redis.hset(submissionKey, submission);

    // Increment daily limit and set expiry (48h to be safe)
    await redis.incrby(dailyLimitKey, posts.length);
    await redis.expire(dailyLimitKey, 172800);

    // Add to submissions list for this campaign
    await redis.sadd(`trenchshare:campaign:${campaignId}:submissions`, walletLower);

    return NextResponse.json({
      success: true,
      submission: {
        campaignId,
        wallet: walletLower,
        posts: updatedPosts,
        status: submission.status,
        points: parseInt(submission.points),
      }
    });
  } catch (error) {
    console.error('Error submitting:', error);
    return NextResponse.json({ error: 'Failed to submit' }, { status: 500 });
  }
}
