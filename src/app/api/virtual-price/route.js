import { NextResponse } from 'next/server';
import { fetchVirtualUsdPrice } from '@/lib/virtualPrice';

export async function GET() {
  try {
    const usd = await fetchVirtualUsdPrice();
    return NextResponse.json({ usd });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
