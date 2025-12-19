// Terminal API - Token listesi ve pool verileri
import { TERMINAL_TOKENS } from '@/lib/terminalTokens';

async function fetchPoolData(token) {
  const baseUrl = 'https://api.geckoterminal.com/api/v2';
  const url = `${baseUrl}/networks/${token.network}/pools/${token.poolId}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 30 }, // 30 saniye cache
    });

    if (!res.ok) {
      console.error('GeckoTerminal error for', token.id, res.status);
      throw new Error(`status ${res.status}`);
    }

    const json = await res.json();
    const attrs = json?.data?.attributes || {};

    // Fiyat (USD)
    const priceUsd = Number(
      attrs.base_token_price_usd ??
      attrs.token_price_usd ??
      attrs.quote_token_price_usd ??
      0
    );

    // Likidite (USD)
    const liquidityUsd = Number(
      attrs.reserve_in_usd ??
      attrs.reserve_usd ??
      0
    );

    // 24 Saatlik Hacim (USD)
    const volume24hUsd = Number(
      (attrs.volume_usd && (attrs.volume_usd.h24 ?? attrs.volume_usd['24h'])) ?? 0
    );

    // FDV
    const fdvUsd = Number(attrs.fdv_usd ?? attrs.fdv ?? 0);

    // 24 Saatlik Fiyat Değişimi (%)
    const priceChange24h = Number(
      (attrs.price_change_percentage && 
       (attrs.price_change_percentage.h24 ?? attrs.price_change_percentage['24h'])) ?? 0
    );

    return {
      ...token,
      priceUsd,
      fdvUsd,
      volume24hUsd,
      liquidityUsd,
      priceChange24h,
      updatedAt: attrs.updated_at || new Date().toISOString(),
    };
  } catch (e) {
    console.error('Pool fetch error for', token.id, e.message);
    return {
      ...token,
      priceUsd: 0,
      fdvUsd: 0,
      volume24hUsd: 0,
      liquidityUsd: 0,
      priceChange24h: 0,
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function GET() {
  try {
    const results = await Promise.all(TERMINAL_TOKENS.map(fetchPoolData));
    
    // FDV'ye göre sırala (büyükten küçüğe)
    results.sort((a, b) => b.fdvUsd - a.fdvUsd);
    
    return Response.json({ tokens: results });
  } catch (err) {
    console.error('API /terminal/tokens error:', err);
    return Response.json({ error: 'Failed to fetch token metrics' }, { status: 500 });
  }
}
