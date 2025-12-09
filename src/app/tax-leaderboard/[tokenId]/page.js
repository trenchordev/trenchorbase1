'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function TaxLeaderboardPage() {
  const params = useParams();
  const tokenId = params.tokenId;

  const [meta, setMeta] = useState(null);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [virtualPrice, setVirtualPrice] = useState(null);

  // New State for Search & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  const fetchData = async () => {
    try {
      const response = await fetch(`/api/tax-leaderboard?tokenId=${tokenId}`);
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setMeta(data.meta);
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
        console.error('VIRTUAL price fetch failed:', err.message);
      }
    };
    loadPrice();
    const priceInterval = setInterval(loadPrice, 60000);
    return () => clearInterval(priceInterval);
  }, []);

  // Filter & Pagination Logic
  const filteredData = leaderboardData.filter(item =>
    item.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
  const displayedData = filteredData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleSearch = (e) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1); // Reset to page 1 on search
  };

  const formatAddress = (address) => {
    if (!address) return 'N/A';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatVirtual = (value) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    }).format(value);
  };

  const formatUsd = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const renderRankBadge = (rank) => {
    if (rank === 1) {
      return (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-b from-amber-300 to-amber-500 text-black font-bold shadow-[0_0_10px_rgba(255,193,7,0.6)] text-xs">
          1
        </span>
      );
    }
    if (rank === 2) return <span className="text-base">🥈</span>;
    if (rank === 3) return <span className="text-base">🥉</span>;
    return <span className="text-[#00ff41] font-mono text-xs">{rank}</span>;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#00ff41] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white/50">Loading tax leaderboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-red-500 mb-2">Error</h2>
          <p className="text-white/70 mb-6">{error}</p>
          <Link href="/" className="px-6 py-3 bg-[#00ff41] text-black font-bold rounded-lg hover:bg-[#00cc33] transition-colors">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const totalTaxCollected = leaderboardData.reduce((sum, entry) => sum + (entry.taxPaidVirtual || 0), 0);

  return (
    <div className="min-h-screen">
      {/* Background */}
      {/* Background - Removed to use Global Layout Background */}

      <div className="relative z-10 p-4 md:p-6 lg:p-8">
        <div className="max-w-[1600px] mx-auto">
          {/* Header Section */}
          <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <Link href="/" className="inline-flex items-center gap-2 px-3 py-1.5 border border-[#00ff41]/50 hover:border-[#00ff41] hover:bg-[#00ff41]/10 transition-all font-mono text-xs rounded-lg">
              <span>{'<'}</span><span>BACK</span>
            </Link>

            <div className="text-center md:text-right flex items-center justify-end gap-3">
              {meta?.logoUrl && (
                <div className="w-12 h-12 rounded-lg bg-white/5 border border-[#00ff41]/40 overflow-hidden flex items-center justify-center">
                  <img 
                    src={`/images/${meta.logoUrl}`} 
                    alt={meta.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div>
                <h1 className="text-2xl md:text-3xl font-bold">
                  <span className="neon-text">TAX TERMINAL</span>
                </h1>
                <p className="text-xs opacity-50 font-mono text-[#00ff41] tracking-wider">{meta?.name || 'LOADING...'}</p>
              </div>
            </div>
          </div>

          {meta && (
            <div className="mb-6 px-4 py-3 border border-[#00ff41]/30 bg-black/50 backdrop-blur-sm rounded-lg">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div className="col-span-2 md:col-span-2 text-left pl-4 flex items-center gap-3">
                  {meta.logoUrl && (
                    <div className="w-10 h-10 rounded bg-white/10 border border-[#00ff41]/30 overflow-hidden flex items-center justify-center flex-shrink-0">
                      <img 
                        src={`/images/${meta.logoUrl}`} 
                        alt={meta.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div>
                    <div className="text-[10px] opacity-50 font-mono mb-1">CAMPAIGN</div>
                    <div className="text-white font-bold font-mono text-lg truncate">
                      {meta.name}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] opacity-50 font-mono mb-1">TOTAL TAX</div>
                  <div className="text-[#00ff41] font-mono text-xs font-bold">
                    {formatVirtual(totalTaxCollected)} VIRTUAL
                  </div>
                </div>
                <div>
                  <div className="text-[10px] opacity-50 font-mono mb-1">UPDATED</div>
                  <div className="text-white/70 font-mono text-[10px]">
                    {meta.lastUpdated ? new Date(parseInt(meta.lastUpdated)).toLocaleTimeString() : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Main Content Layout - Changed to lg:flex-row for better Laptop support */}
          <div className="flex flex-col lg:flex-row gap-6 items-start">

            {/* Table Section */}
            <div className="flex-1 w-full min-w-0">
              <div className="bg-black/30 backdrop-blur-sm border border-[#00ff41]/50 rounded-2xl p-4 shadow-[0_0_30px_rgba(0,255,65,0.1)]">

                {/* Search & Stats Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div className="font-mono text-xs opacity-70">
                    Showing <span className="text-[#00ff41] font-bold">{filteredData.length}</span> users
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search Address..."
                      value={searchQuery}
                      onChange={handleSearch}
                      className="w-full sm:w-64 bg-black/50 border border-[#00ff41]/30 rounded-md px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-[#00ff41] focus:ring-1 focus:ring-[#00ff41]/50 placeholder-white/30"
                    />
                    <div className="absolute right-2 top-1.5 text-[#00ff41]/50 text-xs">🔍</div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <div className="border border-[#00ff41]/30 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#00ff41]/10 border-b border-[#00ff41]/30">
                          <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider w-10 text-[#00ff41]/80">#</th>
                          <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-[#00ff41]/80">ADDRESS</th>
                          <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-wider text-[#00ff41]/80">TAX (VIRTUAL)</th>
                          <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-wider text-[#00ff41]/80">TAX (USD)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedData.length === 0 ? (
                          <tr><td colSpan="4" className="px-4 py-8 text-center opacity-50 text-xs font-mono">No users found matching your search.</td></tr>
                        ) : (
                          displayedData.map((entry) => {
                            const isTopThree = entry.rank <= 3;
                            const usdValue = virtualPrice ? entry.taxPaidVirtual * virtualPrice : 0;
                            return (
                              <tr key={`${entry.address}-${entry.rank}`} className={`border-b border-white/5 hover:bg-[#00ff41]/5 transition-colors ${isTopThree && currentPage === 1 ? 'bg-[#00ff41]/5' : ''}`}>
                                <td className="px-3 py-1.5 font-mono align-middle">{renderRankBadge(entry.rank)}</td>
                                <td className="px-3 py-1.5 font-mono align-middle">
                                  <a href={`https://basescan.org/address/${entry.address}`} target="_blank" rel="noopener noreferrer" className="text-white/90 hover:text-[#00ff41] hover:underline transition-colors text-xs">
                                    {formatAddress(entry.address)}
                                  </a>
                                </td>
                                <td className="px-3 py-1.5 font-mono text-right text-xs align-middle">
                                  <span className="text-[#00ff41] font-bold">{formatVirtual(entry.taxPaidVirtual || 0)}</span>
                                </td>
                                <td className="px-3 py-1.5 font-mono text-right text-xs align-middle text-cyan-400/80">
                                  {formatUsd(usdValue)}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="mt-4 flex justify-between items-center font-mono text-xs">
                    <button
                      onClick={() => setCurrentPage(c => Math.max(1, c - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1 rounded border border-[#00ff41]/30 hover:bg-[#00ff41] hover:text-black disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-current transition-colors"
                    >
                      Prev
                    </button>
                    <span className="text-white/50">Page {currentPage} of {totalPages}</span>
                    <button
                      onClick={() => setCurrentPage(c => Math.min(totalPages, c + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 rounded border border-[#00ff41]/30 hover:bg-[#00ff41] hover:text-black disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-current transition-colors"
                    >
                      Next
                    </button>
                  </div>
                )}

              </div>
            </div>

            {/* Sidebar Image - Sticky functionality for better UX */}
            <aside className="w-full lg:w-72 xl:w-96 shrink-0 lg:sticky lg:top-4 order-last mt-0">
              <div className="relative h-[300px] lg:h-[400px] xl:h-[500px] border border-[#00ff41]/40 rounded-2xl overflow-hidden bg-gradient-to-b from-black/40 to-[#041b0d] shadow-[0_0_35px_rgba(0,255,65,0.2)]">
                <Image
                  src="/images/trenchor-agent.png"
                  alt="Trenchor Tax Tracker"
                  fill
                  priority
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 30vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent"></div>
                <div className="absolute inset-0 flex flex-col justify-end gap-2 p-5">
                  <p className="text-[10px] font-mono tracking-[0.3em] text-[#00ff41] uppercase">Agent Status</p>
                  <h3 className="text-xl font-bold text-white">Tax Tracker</h3>
                  <div className="w-full h-px bg-[#00ff41]/30 my-1 font-mono"></div>
                  <div className="flex justify-between text-xs font-mono text-white/70">
                    <span>SCAN STATUS:</span>
                    <span className="text-[#00ff41] animate-pulse">● ACTIVE</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono text-white/70">
                    <span>VIRTUAL Px:</span>
                    <span className="text-cyan-400">${virtualPrice ? virtualPrice.toFixed(4) : '...'}</span>
                  </div>
                </div>
              </div>
            </aside>

          </div>
        </div>
      </div>
    </div>
  );
}
