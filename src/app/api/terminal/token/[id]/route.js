
import { TERMINAL_TOKENS } from '@/lib/terminalTokens';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  const { id } = await params;
  const token = TERMINAL_TOKENS.find(t => t.id === id);

  if (!token) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 });
  }

  // Fetch live data from GeckoTerminal
  const baseUrl = 'https://api.geckoterminal.com/api/v2';
  const url = `${baseUrl}/networks/${token.network}/pools/${token.poolId}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 30 },
    });

    if (!res.ok) {
      throw new Error(`GeckoTerminal error: ${res.status}`);
    }

    const json = await res.json();
    const attrs = json?.data?.attributes || {};

    const tokenData = {
      ...token,
      priceUsd: Number(attrs.base_token_price_usd || 0),
      liquidityUsd: Number(attrs.reserve_in_usd || 0),
      volume24hUsd: Number(attrs.volume_usd?.h24 || 0),
      fdvUsd: Number(attrs.fdv_usd || 0),
      priceChange24h: Number(attrs.price_change_percentage?.h24 || 0),
      marketCapUsd: Number(attrs.market_cap_usd || 0),
    };

    return NextResponse.json({ token: tokenData });
  } catch (error) {
    console.error('Error fetching token data:', error);
    // Return static data if API fails
    return NextResponse.json({ token });
  }
}
