import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redis } from '@/lib/redis';

// GET: Fetch all tax campaigns
export async function GET(request) {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('ADMIN_PASSWORD');

  if (adminAuth?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch all tax campaign configs from Redis
    const keys = await redis.keys('tax-campaign-config:*');
    const campaigns = [];

    for (const key of keys) {
      const config = await redis.get(key);
      if (config) {
        const campaignId = key.replace('tax-campaign-config:', '');

        // Get leaderboard meta for stats
        const meta = await redis.hgetall(`tax-leaderboard-meta:${campaignId}`);

        campaigns.push({
          ...config,
          id: campaignId,
          totalUsers: meta?.totalUsers || 0,
          totalTax: meta?.totalTaxPaid || '0.0000',
          lastUpdated: meta?.lastUpdated || null
        });
      }
    }

    // Sort by creation time if available
    campaigns.sort((a, b) => {
      const timeA = a.createdAt || 0;
      const timeB = b.createdAt || 0;
      return timeB - timeA;
    });

    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error('Error fetching tax campaigns:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Create new tax campaign
export async function POST(request) {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('ADMIN_PASSWORD');

  if (adminAuth?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, name, targetToken, taxWallet, timeWindowMinutes, startBlock, endBlock, logoUrl } = body;

    if (!id || !targetToken || !taxWallet) {
      return NextResponse.json({ error: 'Missing required fields: id, targetToken, taxWallet' }, { status: 400 });
    }

    // Check if campaign already exists
    const existing = await redis.get(`tax-campaign-config:${id}`);
    if (existing) {
      return NextResponse.json({ error: 'Campaign ID already exists' }, { status: 409 });
    }

    // Create campaign config
    const config = {
      name: name || id,
      targetToken: targetToken.toLowerCase(),
      taxWallet: taxWallet.toLowerCase(),
      timeWindowMinutes: timeWindowMinutes || 99,
      startBlock: startBlock || null,
      endBlock: endBlock || null,
      logoUrl: logoUrl || '',
      createdAt: Date.now()
    };

    // Store in Redis
    await redis.set(`tax-campaign-config:${id}`, config);

    return NextResponse.json({
      success: true,
      campaign: { id, ...config }
    });
  } catch (error) {
    console.error('Error creating tax campaign:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: Remove tax campaign
export async function DELETE(request) {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('ADMIN_PASSWORD');

  if (adminAuth?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('id');

    if (!campaignId) {
      return NextResponse.json({ error: 'Missing campaign ID' }, { status: 400 });
    }

    // Delete campaign config and associated leaderboard data
    await Promise.all([
      redis.del(`tax-campaign-config:${campaignId}`),
      redis.del(`tax-leaderboard:${campaignId}`),
      redis.del(`tax-leaderboard-meta:${campaignId}`)
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting tax campaign:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
