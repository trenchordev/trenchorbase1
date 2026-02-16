import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const LIST_KEY = 'feature:list';
const itemKey = (id) => `feature:${id}`;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      const data = await redis.hgetall(itemKey(id));
      return NextResponse.json(data || {});
    }

    const ids = await redis.smembers(LIST_KEY);
    const items = [];
    for (const featureId of ids) {
      const data = await redis.hgetall(itemKey(featureId));
      if (data) items.push(data);
    }
    return NextResponse.json(items);
  } catch (error) {
    console.error('Feature campaigns GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
