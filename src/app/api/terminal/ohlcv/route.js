// Terminal API - OHLCV (Candle) verileri
import { TERMINAL_TOKENS } from '@/lib/terminalTokens';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const tokenId = searchParams.get('tokenId');

  if (!tokenId) {
    return Response.json({ error: 'tokenId required' }, { status: 400 });
  }

  const token = TERMINAL_TOKENS.find((t) => t.id === tokenId);
  if (!token) {
    return Response.json({ error: 'Token not found' }, { status: 404 });
  }

  const baseUrl = 'https://api.geckoterminal.com/api/v2';
  // 1 günlük mumlar (day timeframe)
  const url = `${baseUrl}/networks/${token.network}/pools/${token.poolId}/ohlcv/day?limit=30`;

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      throw new Error(`GeckoTerminal OHLCV error: ${res.status}`);
    }

    const json = await res.json();
    const ohlcvList = json?.data?.attributes?.ohlcv_list || [];

    // ohlcv_list: [[timestamp, open, high, low, close, volume], ...]
    // En son günün open değerini al
    if (ohlcvList.length === 0) {
      return Response.json({ dayOpen: null, lastClose: null });
    }

    // Son mum (en güncel)
    const lastCandle = ohlcvList[0];
    const dayOpen = lastCandle[1]; // open
    const lastClose = lastCandle[4]; // close

    return Response.json({
      dayOpen,
      lastClose,
      candles: ohlcvList.slice(0, 7), // Son 7 gün
    });
  } catch (err) {
    console.error('OHLCV fetch error:', err);
    return Response.json({ error: 'Failed to fetch OHLCV data' }, { status: 500 });
  }
}
