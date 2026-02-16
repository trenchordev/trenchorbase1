import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Redis } from '@upstash/redis';

const COOKIE_NAME = 'ADMIN_PASSWORD';
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const LIST_KEY = 'feature:list';
const itemKey = (id) => `feature:${id}`;

async function requireAuth() {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(COOKIE_NAME);
  return authCookie?.value === process.env.ADMIN_PASSWORD;
}

export async function GET() {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ids = await redis.smembers(LIST_KEY);
  const items = [];
  for (const id of ids) {
    const data = await redis.hgetall(itemKey(id));
    if (data) items.push(data);
  }
  return NextResponse.json(items);
}

export async function POST(request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const {
      id,
      name,
      ticker,
      imageUrl,
      timeline,
      distributionPeriod,
      details,
      totalReward,
      uniqueTraders,
      totalSwaps,
      campaignLinks,
      ctaUrl,
    } = body;

    if (!id || !name) {
      return NextResponse.json({ error: 'id and name are required' }, { status: 400 });
    }

    const payload = {
      id,
      name,
      ticker: ticker || '',
      imageUrl: imageUrl || '',
      timeline: timeline || 'Timeline TBA',
      distributionPeriod: distributionPeriod || 'Distribution TBA',
      details: details || 'Details coming soon... ',
      totalReward: totalReward || 'Rewards TBA',
      uniqueTraders: uniqueTraders ? String(uniqueTraders) : '0',
      totalSwaps: totalSwaps ? String(totalSwaps) : '0',
      ctaUrl: ctaUrl || '',
      updatedAt: Date.now().toString(),
    };

    if (campaignLinks) {
      try {
        payload.campaignLinks = Array.isArray(campaignLinks)
          ? JSON.stringify(campaignLinks)
          : campaignLinks;
      } catch (err) {
        console.error('feature campaignLinks serialization error:', err.message);
      }
    }

    await redis.hset(itemKey(id), payload);
    await redis.sadd(LIST_KEY, id);
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Feature campaigns POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    await redis.del(itemKey(id));
    await redis.srem(LIST_KEY, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Feature campaigns DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
