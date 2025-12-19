// VIRTUAL Token Address on Base
const VIRTUAL_TOKEN_ADDRESS = '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b';

// GeckoTerminal API
const GECKOTERMINAL_URL = `https://api.geckoterminal.com/api/v2/networks/base/tokens/${VIRTUAL_TOKEN_ADDRESS}`;

// DexScreener API
const DEXSCREENER_URL = `https://api.dexscreener.com/latest/dex/tokens/${VIRTUAL_TOKEN_ADDRESS}`;

export async function fetchVirtualUsdPrice() {
  // 1. Try GeckoTerminal (Primary)
  try {
    const res = await fetch(GECKOTERMINAL_URL, { 
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 30 }
    });
    
    if (res.ok) {
      const data = await res.json();
      const price = data?.data?.attributes?.price_usd;
      
      if (price && Number(price) > 0) {
        return Number(price);
      }
    }
  } catch (error) {
    console.error('GeckoTerminal Virtual Price Error:', error.message);
  }

  // 2. Try DexScreener (Backup)
  try {
    const res = await fetch(DEXSCREENER_URL, { 
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    });
    
    if (res.ok) {
      const data = await res.json();
      const pair = data?.pairs?.[0];
      const price = pair?.priceUsd;
      
      if (price && Number(price) > 0) {
        return Number(price);
      }
    }
  } catch (error) {
    console.error('DexScreener Virtual Price Error:', error.message);
  }

  // No fallback to 1.5 anymore. Return null.
  return null;
}
