import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

function shortAddr(a) {
  if (!a) return '';
  const s = a.toLowerCase();
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

export async function GET() {
  try {
    const buyKey = 'trb-lp-leaderboard:buys';
    const sellKey = 'trb-lp-leaderboard:sells';
    const netKey = 'trb-lp-leaderboard:net';
    const buyVirtualKey = 'trb-lp-leaderboard:buys:virtual';
    const sellVirtualKey = 'trb-lp-leaderboard:sells:virtual';
    const netVirtualKey = 'trb-lp-leaderboard:net:virtual';
    const metaKey = 'trb-lp-leaderboard:meta';

    const [buys, sells, net, netVirtual, meta, tradersCount] = await Promise.all([
      redis.zrange(buyKey, 0, 99, { rev: true, withScores: true }),
      redis.zrange(sellKey, 0, 99, { rev: true, withScores: true }),
      redis.zrange(netKey, 0, 49, { rev: true, withScores: true }),
      redis.zrange(netVirtualKey, 0, 49, { rev: true, withScores: true }),
      redis.hgetall(metaKey),
      redis.zcard(netKey),
    ]);

    const mapRows = (rows) => {
      if (!rows || rows.length === 0) return [];

      // Upstash can return either [{member, score}, ...] or [member, score, member, score, ...]
      if (typeof rows[0] === 'object' && rows[0] !== null && 'member' in rows[0]) {
        return rows.map((r, idx) => ({
          rank: idx + 1,
          address: r.member,
          addressShort: shortAddr(r.member),
          amountTrb: typeof r.score === 'number' ? r.score : parseFloat(r.score || '0'),
        }));
      }

      const out = [];
      for (let i = 0; i < rows.length; i += 2) {
        const address = rows[i];
        const score = rows[i + 1];
        out.push({
          rank: out.length + 1,
          address,
          addressShort: shortAddr(address),
          amountTrb: typeof score === 'number' ? score : parseFloat(score || '0'),
        });
      }
      return out;
    };

    // Build a combined table for the top net addresses
    const netRows = mapRows(net);
    const netVirtualRows = mapRows(netVirtual);
    const netVirtualMap = new Map(netVirtualRows.map((r) => [r.address, r.amountTrb]));
    const leaderboard = [];

    for (const r of netRows) {
      const address = r.address;
      const [buyScore, sellScore, buyVirtualScore, sellVirtualScore, txCount] = await Promise.all([
        redis.zscore(buyKey, address),
        redis.zscore(sellKey, address),
        redis.zscore(buyVirtualKey, address),
        redis.zscore(sellVirtualKey, address),
        redis.get(`trb-lp-leaderboard:txcount:${address}`),
      ]);

      const buy = buyScore ? parseFloat(buyScore) : 0;
      const sell = sellScore ? parseFloat(sellScore) : 0;
      const netAmt = r.amountTrb;
      const vol = buy + sell;

      const buyVirtual = buyVirtualScore ? parseFloat(buyVirtualScore) : 0;
      const sellVirtual = sellVirtualScore ? parseFloat(sellVirtualScore) : 0;
      const netVirtualAmt = netVirtualMap.get(address) || (buyVirtual - sellVirtual);
      const volVirtual = buyVirtual + sellVirtual;

      const txs = txCount ? parseInt(txCount, 10) : 0;

      leaderboard.push({
        rank: r.rank,
        address,
        addressShort: r.addressShort,
        volTrb: vol,
        buyTrb: buy,
        sellTrb: sell,
        netTrb: netAmt,
        volVirtual,
        buyVirtual,
        sellVirtual,
        netVirtual: netVirtualAmt,
        txs,
      });
    }

    const transfersCount = parseInt(meta?.totalTransfers || '0', 10) || 0;

    return NextResponse.json({
      ok: true,
      meta: meta || {},
      stats: {
        traders: typeof tradersCount === 'number' ? tradersCount : parseInt(tradersCount || '0', 10) || 0,
        transfers: transfersCount,
        blocksFrom: meta?.lastScannedFrom || '',
        blocksTo: meta?.lastScannedTo || '',
      },
      leaderboard,
      topBuys: mapRows(buys),
      topSells: mapRows(sells),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err?.message || 'Unknown error' }, { status: 500 });
  }
}
