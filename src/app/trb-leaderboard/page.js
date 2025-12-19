'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AccessGuard } from '@/components/AccessGuard';

function formatNum(n, decimals = 2) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '0.00';
  const num = Number(n);
  if (num === 0) return '0.00';
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  });
}

function formatToken(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '0.00';
  const num = Number(n);
  if (num === 0) return '0.00';
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
  return num.toFixed(2);
}

function SummaryBar({ token, lp, traders, swaps, scanRange }) {
  return (
    <div className="rounded-none border-y border-[#00ff41]/20 bg-black/30 overflow-hidden mb-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-0 divide-x divide-[#00ff41]/20">
        <div className="px-4 py-3 text-center">
          <div className="text-[10px] text-[#00ff41] font-mono mb-1">TOKEN</div>
          <div className="text-[#00ff41] font-mono text-xs truncate">
            {token ? `${token.slice(0, 6)}...${token.slice(-4)}` : '-'}
          </div>
        </div>
        <div className="px-4 py-3 text-center">
          <div className="text-[10px] text-[#00ff41] font-mono mb-1">LP POOL</div>
          <div className="text-[#00ff41] font-mono text-xs truncate">
            {lp ? `${lp.slice(0, 6)}...${lp.slice(-4)}` : '-'}
          </div>
        </div>
        <div className="px-4 py-3 text-center">
          <div className="text-[10px] text-[#00ff41] font-mono mb-1">TRADERS</div>
          <div className="text-[#00ff41] font-mono text-xl font-bold">{traders ?? 0}</div>
        </div>
        <div className="px-4 py-3 text-center">
          <div className="text-[10px] text-[#00ff41] font-mono mb-1">SWAPS</div>
          <div className="text-[#00ff41] font-mono text-xl font-bold">{swaps ?? 0}</div>
        </div>
        <div className="px-4 py-3 text-center col-span-2 md:col-span-1">
          <div className="text-[10px] text-[#00ff41] font-mono mb-1">BLOCKS</div>
          <div className="text-white font-mono text-xs">{scanRange || '-'}</div>
        </div>
      </div>
    </div>
  );
}

function LeaderboardTable({ rows, virtualUsdPrice }) {
  return (
    <div className="rounded-none border border-[#00ff41]/20 bg-black/30 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] font-mono">
          <thead>
            <tr className="text-[#00ff41] border-b border-[#00ff41]/20 bg-[#00ff41]/5">
              <th className="text-left px-4 py-3 font-normal">#</th>
              <th className="text-left px-4 py-3 font-normal">TRADER</th>
              <th className="text-right px-4 py-3 font-normal">VOLUME</th>
              <th className="text-right px-4 py-3 font-normal">TOKEN</th>
              <th className="text-right px-4 py-3 font-normal">BUY</th>
              <th className="text-right px-4 py-3 font-normal">SELL</th>
              <th className="text-right px-4 py-3 font-normal">NET</th>
              <th className="text-right px-4 py-3 font-normal">TXS</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-white/50">
                  No data yet.
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => (
                <tr
                  key={r.address}
                  className="border-b border-[#00ff41]/10 hover:bg-[#00ff41]/5 transition-colors"
                >
                  <td className="px-4 py-3">
                    {idx === 0 && <span className="text-xl">👑</span>}
                    {idx === 1 && <span className="text-xl">🥈</span>}
                    {idx === 2 && <span className="text-xl">🥉</span>}
                    {idx > 2 && <span className="text-[#00ff41]">{idx + 1}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[#00ff41]">{r.addressShort}</div>
                    <div className="text-[#00ff41]/40 text-[10px] hidden sm:block">
                      {r.address}
                    </div>
                  </td>

                  {/* VOLUME */}
                  <td className="px-4 py-3 text-right">
                    <div className="text-[#00ff41]">
                      $
                      {virtualUsdPrice && r.volVirtual
                        ? formatNum(r.volVirtual * virtualUsdPrice)
                        : '0.00'}
                    </div>
                    <div className="text-cyan-400 text-[10px]">{formatNum(r.volVirtual)} V</div>
                  </td>

                  {/* TOKEN */}
                  <td className="px-4 py-3 text-right text-white">{formatToken(r.volTrb)}</td>

                  {/* BUY */}
                  <td className="px-4 py-3 text-right">
                    <div className="text-[#00ff41]">
                      $
                      {virtualUsdPrice && r.buyVirtual
                        ? formatNum(r.buyVirtual * virtualUsdPrice)
                        : '0.00'}
                    </div>
                    <div className="text-cyan-400 text-[10px]">{formatNum(r.buyVirtual)} V</div>
                  </td>

                  {/* SELL */}
                  <td className="px-4 py-3 text-right">
                    <div className="text-[#00ff41]">
                      $
                      {virtualUsdPrice && r.sellVirtual
                        ? formatNum(r.sellVirtual * virtualUsdPrice)
                        : '0.00'}
                    </div>
                    <div className="text-cyan-400 text-[10px]">{formatNum(r.sellVirtual)} V</div>
                  </td>

                  {/* NET */}
                  <td className="px-4 py-3 text-right">
                    <div className={r.netVirtual >= 0 ? 'text-[#00ff41]' : 'text-red-500'}>
                      $
                      {virtualUsdPrice && r.netVirtual
                        ? formatNum(Math.abs(r.netVirtual * virtualUsdPrice))
                        : '0.00'}
                    </div>
                    <div className="text-cyan-400 text-[10px]">{formatNum(r.netVirtual)} V</div>
                  </td>

                  <td className="px-4 py-3 text-right text-white">{r.txs || 0}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function TrbLeaderboardPage() {
  const [data, setData] = useState(null);
  const [virtualUsdPrice, setVirtualUsdPrice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchAddress, setSearchAddress] = useState('');

  useEffect(() => {
    let mounted = true;

    const fetchOnce = async () => {
      const [lbRes, priceRes] = await Promise.all([
        fetch('/api/trb-lp-leaderboard', { cache: 'no-store' }),
        fetch('/api/virtual-price', { cache: 'no-store' }),
      ]);

      const [lbJson, priceJson] = await Promise.all([
        lbRes.json(),
        priceRes.ok ? priceRes.json() : Promise.resolve(null),
      ]);

      return { lbRes, lbJson, priceJson };
    };

    async function load() {
      try {
        setError('');
        const { lbRes, lbJson, priceJson } = await fetchOnce();
        if (!mounted) return;

        if (!lbRes.ok || !lbJson.ok) {
          throw new Error(lbJson?.error || 'Failed to load leaderboard');
        }

        setData(lbJson);
        const usd = priceJson?.usd;
        setVirtualUsdPrice(Number.isFinite(Number(usd)) ? Number(usd) : null);
      } catch (e) {
        setError(e?.message || 'Unknown error');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();

    const interval = setInterval(() => {
      if (!mounted) return;
      load();
    }, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const meta = useMemo(() => data?.meta || {}, [data]);
  const stats = useMemo(() => data?.stats || {}, [data]);

  const scanRange = useMemo(() => {
    if (meta.lastScannedFrom && meta.lastScannedTo) {
      return `${Number(meta.lastScannedFrom).toLocaleString()} - ${Number(
        meta.lastScannedTo
      ).toLocaleString()}`;
    }
    return null;
  }, [meta]);

  const filteredLeaderboard = useMemo(() => {
    if (!data?.leaderboard) return [];
    if (!searchAddress.trim()) return data.leaderboard;
    const query = searchAddress.toLowerCase().trim();
    return data.leaderboard.filter(
      (r) => r.address?.toLowerCase().includes(query)
    );
  }, [data?.leaderboard, searchAddress]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#00ff41] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white/50">Loading TRB leaderboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen p-8 max-w-5xl mx-auto transform lg:translate-x-24 font-sans text-[13px] sm:text-[14px]">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
          <h1 className="text-white font-semibold text-xl mb-2">TRB Leaderboard</h1>
          <p className="text-white/70">{error}</p>
          <p className="text-white/50 mt-3 text-sm">
            If this is a fresh setup, run the scanner via admin and/or cron endpoint.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AccessGuard>
      <div className="min-h-screen p-6 sm:p-8 max-w-7xl mx-auto transform lg:translate-x-24 font-sans">
      <div className="flex items-center justify-between mb-3">
        <Link
          href="/terminal"
          className="text-xs font-mono text-[#00ff41]/70 hover:text-[#00ff41]"
        >
          {'<'} BACK TO TOKENS
        </Link>
      </div>

      <div className="flex items-center justify-center mb-4">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[#00ff41] animate-pulse" />
            <span className="text-[#00ff41] text-xs font-mono">LIVE</span>
          </div>
          <div className="text-4xl sm:text-5xl font-bold neon-text">{'>'}TRB</div>
          <div className="text-[#00ff41]/70 text-xs font-mono mt-1">
            [ TRADING LEADERBOARD ]
          </div>
          <a
            href="https://app.virtuals.io/prototypes/0x2baaD38A80FfDd8D195d2B4eef0bC8E0f319c63a"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 px-6 py-3 bg-[#00ff41] text-black font-bold text-sm rounded-lg hover:bg-[#00ff41]/80 transition-all hover:scale-105 shadow-lg shadow-[#00ff41]/20"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            Trade Now on Virtuals
          </a>
        </div>
      </div>

      <SummaryBar
        token={meta.tokenAddress}
        lp={meta.lpLikeAddress}
        traders={stats.traders}
        swaps={stats.transfers}
        scanRange={scanRange}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          {/* Search Box */}
          <div className="flex items-center justify-between mb-3 gap-4">
            <div className="text-[#00ff41] text-xs font-mono">
              Showing {filteredLeaderboard.length} / {stats.traders || 0} traders
            </div>
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#00ff41]/50 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search address..."
                value={searchAddress}
                onChange={(e) => setSearchAddress(e.target.value)}
                className="w-48 sm:w-64 px-3 py-2 pl-10 bg-black/50 border border-[#00ff41]/30 rounded-lg text-[#00ff41] text-xs font-mono placeholder:text-[#00ff41]/40 focus:outline-none focus:border-[#00ff41]/60"
              />
            </div>
          </div>
          <LeaderboardTable
            rows={filteredLeaderboard}
            virtualUsdPrice={virtualUsdPrice}
          />
          <div className="mt-3 text-center text-[11px] text-[#00ff41]/60 font-mono">
            Auto-refresh: 5m | VIRTUAL: ${virtualUsdPrice ? virtualUsdPrice.toFixed(4) : '0.0000'}
          </div>
        </div>

        <div className="rounded-xl border border-[#00ff41]/20 bg-black/30 overflow-hidden w-full flex flex-col self-stretch">
          <div className="px-4 py-2 border-b border-[#00ff41]/20 bg-[#00ff41]/5">
            <div className="flex items-center justify-between">
              <span className="text-[#00ff41] text-xs font-mono">TRB PRICE CHART</span>
              <a
                href="https://www.defined.fi/base/0x367c2522a452efc180cc93855d98dbd8668488d4?quoteToken=token0"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00ff41]/60 hover:text-[#00ff41] text-[10px] font-mono"
              >
                Open Full ↗
              </a>
            </div>
          </div>
          <div className="lg:max-w-none flex-1" style={{ minHeight: '500px' }}>
            <iframe
              height="100%"
              width="100%"
              id="defined-embed"
              title="Defined Embed"
              src="https://www.defined.fi/base/0x367c2522a452efc180cc93855d98dbd8668488d4/embed?quoteToken=token0&hideTxTable=1&hideSidebar=0&hideChart=0&hideChartEmptyBars=1&chartSmoothing=0&embedColorMode=DARK"
              className="border-2 h-full"
              allow="clipboard-write"
            />
          </div>
        </div>
      </div>
      </div>
    </AccessGuard>
  );
}
