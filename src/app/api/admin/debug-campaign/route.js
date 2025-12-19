import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { cookies } from 'next/headers';

const isTruthy = (value) => value === true || value === 'true' || value === 1 || value === '1';

async function isAdmin() {
  const cookieStore = await cookies();
  const session = cookieStore.get('admin_session');
  return session?.value === 'authenticated';
}

export async function GET(request) {
  try {
    if (!await isAdmin()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('id');

    if (!campaignId) {
      return NextResponse.json({ error: 'Campaign ID required' }, { status: 400 });
    }

    const key = `trenchshare:campaign:${campaignId}`;
    const campaign = await redis.hgetall(key);

    return NextResponse.json({ 
      key,
      raw: campaign,
      parsed: {
        ...campaign,
        active: isTruthy(campaign.active),
        maxPosts: parseInt(campaign.maxPosts),
      }
    });
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!await isAdmin()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { campaignId, field, value } = await request.json();
    const key = `trenchshare:campaign:${campaignId}`;
    
    await redis.hset(key, { [field]: value });
    
    const updated = await redis.hgetall(key);

    return NextResponse.json({ 
      success: true,
      updated 
    });
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
