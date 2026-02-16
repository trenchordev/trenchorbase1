'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

export default function TokenLeaderboardPage() {
  const params = useParams();
  const tokenId = params.tokenId;

  const [tokenInfo, setTokenInfo] = useState(null);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [visibleCount, setVisibleCount] = useState(25);
  const [virtualPrice, setVirtualPrice] = useState(null);

  const fetchData = async () => {
    try {
      const response = await fetch(`/api/tokens/leaderboard?tokenId=${tokenId}`);
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setTokenInfo(data.token);
        setLeaderboardData(data.leaderboard || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tokenId) {
      fetchData();
      const interval = setInterval(fetchData, 30000);
      return () => clearInterval(interval);
    }
  }, [tokenId]);

  useEffect(() => {
    const loadPrice = async () => {
      try {
        const res = await fetch('/api/virtual-price');
        const data = await res.json();
        if (data?.usd) setVirtualPrice(Number(data.usd));
      } catch (err) {
        console.error('VIRTUAL fiyatı alınamadı:', err.message);
      }
    };
    loadPrice();
    const priceInterval = setInterval(loadPrice, 60000);
    return () => clearInterval(priceInterval);
  }, []);

  const formatAddress = (address) => {
    if (!address) return 'N/A';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatUsd = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD',
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(value);
  };

  const formatVirtual = (value) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(value) + ' V';
  };

  const formatToken = (value) => {
    if (value >= 1000000) return (value / 1000000).toFixed(2) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(2) + 'K';
    return value.toFixed(2);
  };

  const renderRankBadge = (rank) => {
    if (rank === 1) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gradient-to-b from-amber-300 to-amber-500 text-black font-bold shadow-[0_0_10px_rgba(255,193,7,0.6)] border border-amber-400">
          <span className="text-lg">👑</span>
          <span className="text-sm">1</span>
        </span>
      );
    }
    if (rank === 2) return <span className="text-lg">🥈</span>;
    if (rank === 3) return <span className="text-lg">🥉</span>;
    return <span className="text-[#00ff41] font-bold">{rank}</span>;
  };

  const displayedLeaderboard = leaderboardData.slice(0, visibleCount);
  const totalTraders = leaderboardData.length;
  const showingCount = Math.min(visibleCount, totalTraders);

  return (
    <div className="min-h-screen">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-black"></div>
        <div className="absolute top-0 left-0 w-full h-full opacity-20">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-green-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
        </div>
      </div>

      <div className="relative z-10 p-4 md:p-8">
        <div className="max-w-[1400px] mx-auto">
          <div className="mb-6">
            <Link href="/" className="inline-flex items-center gap-2 px-4 py-2 border border-[#00ff41]/50 hover:border-[#00ff41] hover:bg-[#00ff41]/10 transition-all font-mono text-sm rounded-lg">
              <span>{'<'}</span><span>BACK TO TOKENS</span>
            </Link>
          </div>

          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs font-mono opacity-50">LIVE</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-bold mb-2">
              <span className="text-white opacity-50">{'>'}</span>
              <span className="neon-text ml-2">{tokenInfo?.tokenName || tokenId?.toUpperCase()}</span>
            </h1>
            <p className="text-sm opacity-50 font-mono">[ TRADING LEADERBOARD ]</p>
          </div>

          {tokenInfo && (
            <div className="mb-8 p-4 border border-[#00ff41]/30 bg-black/50 backdrop-blur-sm rounded-lg">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                <div>
                  <div className="text-xs opacity-50 font-mono mb-1">TOKEN</div>
                  <a href={`https://basescan.org/token/${tokenInfo.tokenAddress}`} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 font-mono text-sm">
                    {formatAddress(tokenInfo.tokenAddress)}
                  </a>
                </div>
                <div>
                  <div className="text-xs opacity-50 font-mono mb-1">LP POOL</div>
                  <a href={`https://basescan.org/address/${tokenInfo.lpAddress}`} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 font-mono text-sm">
                    {formatAddress(tokenInfo.lpAddress)}
                  </a>
                </div>
                <div>
                  <div className="text-xs opacity-50 font-mono mb-1">TRADERS</div>
                  <div className="text-xl font-bold text-[#00ff41]">{tokenInfo.uniqueTraders}</div>
                </div>
                <div>
                  <div className="text-xs opacity-50 font-mono mb-1">SWAPS</div>
                  <div className="text-xl font-bold text-yellow-400">{tokenInfo.totalSwaps}</div>
                </div>
                <div>
                  <div className="text-xs opacity-50 font-mono mb-1">BLOCKS</div>
                  <div className="text-sm font-mono text-white/70">{parseInt(tokenInfo.startBlock).toLocaleString()} - {parseInt(tokenInfo.endBlock).toLocaleString()}</div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 border border-red-500 bg-red-950/20 text-red-400 rounded-lg">
              <span className="font-bold">ERROR:</span> {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-20">
              <div className="inline-flex items-center gap-3 text-xl">
                <div className="w-6 h-6 border-2 border-[#00ff41] border-t-transparent rounded-full animate-spin"></div>
                <span className="animate-pulse">LOADING LEADERBOARD...</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col xl:flex-row gap-8">
              <div className="flex-1">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4 font-mono text-xs">
                  <div className="opacity-70">
                    Showing <span className="text-[#00ff41] font-bold">{showingCount}</span> / <span className="text-white">{totalTraders}</span> traders
                  </div>
                  {totalTraders > 25 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setVisibleCount(25)}
                        disabled={visibleCount === 25}
                        className={`px-3 py-1 rounded border text-xs tracking-widest transition-colors ${visibleCount === 25 ? 'border-[#00ff41] text-black bg-[#00ff41]' : 'border-[#00ff41]/40 text-[#00ff41] hover:border-[#00ff41]'}`}
                      >
                        TOP 25
                      </button>
                      <button
                        onClick={() => setVisibleCount(100)}
                        disabled={visibleCount === 100 || totalTraders <= 25}
                        className={`px-3 py-1 rounded border text-xs tracking-widest transition-colors ${(visibleCount === 100 || totalTraders <= 25) ? 'border-white/20 text-white/40' : 'border-[#00ff41]/40 text-[#00ff41] hover:border-[#00ff41]'}`}
                      >
                        SEE TOP 100
                      </button>
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <div className="border border-[#00ff41]/50 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#00ff41]/10 border-b border-[#00ff41]/30">
                          <th className="px-2 py-2 text-left font-mono text-xs uppercase tracking-wider w-12">#</th>
                          <th className="px-2 py-2 text-left font-mono text-xs uppercase tracking-wider w-28">TRADER</th>
                          <th className="px-2 py-2 text-right font-mono text-xs uppercase tracking-wider">VOL (USD)</th>
                          <th className="px-2 py-2 text-right font-mono text-xs uppercase tracking-wider">VIRTUAL</th>
                          <th className="px-2 py-2 text-right font-mono text-xs uppercase tracking-wider">TOKEN</th>
                          <th className="px-2 py-2 text-right font-mono text-xs uppercase tracking-wider text-green-400">BUY</th>
                          <th className="px-2 py-2 text-right font-mono text-xs uppercase tracking-wider text-red-400">SELL</th>
                          <th className="px-2 py-2 text-right font-mono text-xs uppercase tracking-wider">NET</th>
                          <th className="px-2 py-2 text-right font-mono text-xs uppercase tracking-wider w-14">TXs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaderboardData.length === 0 ? (
                          <tr><td colSpan="9" className="px-4 py-12 text-center opacity-50"><div className="text-4xl mb-2">📊</div><div>No trading data available</div></td></tr>
                        ) : (
                          displayedLeaderboard.map((entry) => {
                            const isTopThree = entry.rank <= 3;
                            return (
                              <tr key={`${entry.address}-${entry.rank}`} className={`border-b border-white/5 hover:bg-[#00ff41]/5 transition-colors ${isTopThree ? 'bg-[#00ff41]/5' : ''}`}>
                                <td className="px-2 py-2 font-mono">{renderRankBadge(entry.rank)}</td>
                                <td className="px-2 py-2 font-mono"><a href={`https://basescan.org/address/${entry.address}`} target="_blank" rel="noopener noreferrer" className="text-yellow-400 hover:text-yellow-300 hover:underline">{formatAddress(entry.address)}</a></td>
                                <td className="px-2 py-2 font-mono text-right text-xs"><span className="text-[#00ff41] font-bold">{formatUsd(entry.totalUsdVolume || 0)}</span></td>
                                <td className="px-2 py-2 font-mono text-right text-xs text-cyan-400">{formatVirtual(entry.totalVirtualVolume || 0)}</td>
                                <td className="px-2 py-2 font-mono text-right text-xs text-purple-400">{formatToken(entry.totalTokenVolume || 0)}</td>
                                <td className="px-2 py-2 font-mono text-right text-xs text-green-400">{formatUsd(entry.buyUsdVolume || 0)}</td>
                                <td className="px-2 py-2 font-mono text-right text-xs text-red-400">{formatUsd(entry.sellUsdVolume || 0)}</td>
                                <td className="px-2 py-2 font-mono text-right text-xs"><span className={entry.netBuyUsd >= 0 ? 'text-green-400' : 'text-red-400'}>{formatUsd(entry.netBuyUsd || 0)}</span></td>
                                <td className="px-2 py-2 font-mono text-right text-xs text-white/70">{entry.txCount || 0}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-8 text-center">
                  <div className="inline-block p-3 border border-[#00ff41]/20 rounded-lg bg-black/30 w-full">
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-xs font-mono opacity-70">
                      <span>Auto-refresh: 30s</span>
                      <span className="text-[#00ff41]">|</span>
                      <span>VIRTUAL: ${virtualPrice ? virtualPrice.toFixed(4) : '...'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <aside className="xl:w-96 shrink-0">
                <div className="relative h-[460px] xl:h-[520px] border border-[#00ff41]/40 rounded-2xl overflow-hidden bg-gradient-to-b from-black/40 to-[#041b0d] shadow-[0_0_35px_rgba(0,255,65,0.2)]">
                  <Image
                    src="/images/trenchor-agent.png"
                    alt="Trenchor Sentinel"
                    fill
                    priority
                    className="object-cover"
                    sizes="(max-width: 1280px) 80vw, 24rem"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent"></div>
                  <div className="absolute inset-0 flex flex-col justify-end gap-3 p-6">
                    <p className="text-xs font-mono tracking-[0.3em] text-[#00ff41]">TRENCHOR AGENT</p>
                    <h3 className="text-2xl font-bold text-white">Liquidity Agent</h3>
                    <p className="text-sm text-white/70 leading-relaxed">
                      Trenchor Agent scans every swap on the chain, filters out bots, and reveals real trader movements.
                    </p>
                    <div className="text-xs font-mono text-white/60">
                      <div>STATUS: <span className="text-[#00ff41]">LIVE MONITORING</span></div>
                      <div>SCAN RANGE: <span className="text-cyan-300">{tokenInfo?.startBlock && tokenInfo?.endBlock ? `${parseInt(tokenInfo.startBlock).toLocaleString()} - ${parseInt(tokenInfo.endBlock).toLocaleString()}` : 'AUTO'}</span></div>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}