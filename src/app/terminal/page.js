'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function TerminalPage() {
  const router = useRouter();
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filters & Sort 
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [sortConfig, setSortConfig] = useState({ key: 'liquidityUsd', direction: 'desc' });

  // Token listesi yükle
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/terminal/tokens');
        const data = await res.json();
        setTokens(data.tokens || []);
      } catch (e) {
        console.error(e);
        setError('Failed to load tokens');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Unique Types for Filter
  const types = useMemo(() => {
    const t = new Set(tokens.map(token => token.type).filter(Boolean));
    return ['All', ...Array.from(t)];
  }, [tokens]);

  // Filter & Sort Logic
  const processedTokens = useMemo(() => {
    let result = [...tokens];

    // 1. Search
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(t => 
        t.name.toLowerCase().includes(s) || 
        t.symbol.toLowerCase().includes(s)
      );
    }

    // 2. Type Filter
    if (filterType !== 'All') {
      result = result.filter(t => t.type === filterType);
    }

    // 3. Sort
    if (sortConfig.key) {
      result.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [tokens, search, filterType, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const formatNumber = (num) => {
    if (!num) return '$0';
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
    return `$${num.toFixed(0)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center font-mono">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[#00ff41] border-t-transparent rounded-full animate-spin"></div>
          <span className="text-[#00ff41] animate-pulse tracking-widest">INITIALIZING TOKEN TERMINAL...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center font-mono">
        <div className="text-red-500 border border-red-500 p-4 rounded bg-red-500/10">
          ERROR: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-mono selection:bg-[#00ff41] selection:text-black p-8 relative">
      {/* CRT Scanline Effect */}
      <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-0 bg-[length:100%_2px,3px_100%] opacity-20"></div>
        
      {/* Main Content Container */}
      <div className="relative z-10 max-w-5xl mx-auto transform lg:translate-x-12 ml-[100px]">

        {/* Header */}
        <div className="mb-8">
          <div className="text-center mb-8">
            <h1 className="text-5xl font-bold text-[#00ff41] mb-4 tracking-tighter animate-pulse drop-shadow-[0_0_10px_rgba(0,255,65,0.5)]">
              &gt; Virtuals Ecosystem
            </h1>
            <div className="text-[#00ff41] text-sm tracking-[0.5em] opacity-80 border-y border-[#00ff41]/30 py-2 inline-block px-12 bg-black/60 backdrop-blur-sm">
              [ TOKEN TERMINAL ]
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-black/60 backdrop-blur-sm border border-[#00ff41]/30 p-4 shadow-[0_0_10px_rgba(0,255,65,0.05)]">
            {/* Search */}
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-4 w-4 text-[#00ff41]/50 group-focus-within:text-[#00ff41]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                id="search-input"
                type="text"
                placeholder="SEARCH TICKER..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-black border border-[#00ff41]/30 text-[#00ff41] text-xs pl-10 pr-4 py-2 focus:outline-none focus:border-[#00ff41] focus:shadow-[0_0_10px_rgba(0,255,65,0.2)] w-64 placeholder-[#00ff41]/30 uppercase tracking-wider"
              />
            </div>

            {/* Type Filter */}
            <div className="flex items-center gap-2">
              <span className="text-[#00ff41]/60 text-xs uppercase tracking-wider">TYPE:</span>
              <div className="flex gap-1">
                {types.map(type => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={`px-3 py-1 text-[10px] uppercase tracking-wider border transition-all ${
                      filterType === type
                        ? 'bg-[#00ff41] text-black border-[#00ff41] font-bold'
                        : 'bg-black text-[#00ff41] border-[#00ff41]/30 hover:border-[#00ff41]'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Table Container - Keep Black */}
        <div className="mt-4 w-full border border-[#00ff41] bg-black shadow-[0_0_20px_rgba(0,255,65,0.1)] overflow-x-auto rounded-lg">
          <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-[#00ff41] bg-[#00ff41]/10 text-[#00ff41] text-[10px] uppercase tracking-widest">
                  <th className="py-2 px-3 font-bold w-12 border-r border-[#00ff41]/30">#</th>
                  <th 
                    className="py-2 px-3 font-bold border-r border-[#00ff41]/30 cursor-pointer hover:bg-[#00ff41]/20 transition-colors group w-20"
                    onClick={() => {
                      const currentIndex = types.indexOf(filterType);
                      const nextIndex = (currentIndex + 1) % types.length;
                      setFilterType(types[nextIndex]);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      Type 
                      <svg className="w-3 h-3 opacity-30 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                      </svg>
                    </div>
                  </th>
                  <th 
                    className="py-2 px-3 font-bold border-r border-[#00ff41]/30 cursor-pointer hover:bg-[#00ff41]/20 transition-colors group"
                    onClick={() => document.getElementById('search-input')?.focus()}
                  >
                    <div className="flex items-center gap-2">
                      Token
                      <svg className="w-3 h-3 opacity-30 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                      </svg>
                    </div>
                  </th>
                  <th 
                    className="py-2 px-3 font-bold text-right border-r border-[#00ff41]/30 cursor-pointer hover:bg-[#00ff41]/20 transition-colors group"
                    onClick={() => handleSort('priceUsd')}
                  >
                    <div className="flex items-center justify-end gap-2">
                      Price
                      <span className="opacity-50 group-hover:opacity-100">
                        {sortConfig.key === 'priceUsd' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th 
                    className="py-2 px-3 font-bold text-right border-r border-[#00ff41]/30 cursor-pointer hover:bg-[#00ff41]/20 transition-colors group"
                    onClick={() => handleSort('fdvUsd')}
                  >
                    <div className="flex items-center justify-end gap-2">
                      FDV
                      <span className="opacity-50 group-hover:opacity-100">
                        {sortConfig.key === 'fdvUsd' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th 
                    className="py-2 px-3 font-bold text-right border-r border-[#00ff41]/30 cursor-pointer hover:bg-[#00ff41]/20 transition-colors group"
                    onClick={() => handleSort('priceChange24h')}
                  >
                    <div className="flex items-center justify-end gap-2">
                      24H %
                      <span className="opacity-50 group-hover:opacity-100">
                        {sortConfig.key === 'priceChange24h' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th 
                    className="py-2 px-3 font-bold text-right border-r border-[#00ff41]/30 cursor-pointer hover:bg-[#00ff41]/20 transition-colors group"
                    onClick={() => handleSort('volume24hUsd')}
                  >
                    <div className="flex items-center justify-end gap-2">
                      24H Vol
                      <span className="opacity-50 group-hover:opacity-100">
                        {sortConfig.key === 'volume24hUsd' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th 
                    className="py-2 px-3 font-bold text-right cursor-pointer hover:bg-[#00ff41]/20 transition-colors group"
                    onClick={() => handleSort('liquidityUsd')}
                  >
                    <div className="flex items-center justify-end gap-2">
                      Liquidity
                      <span className="opacity-50 group-hover:opacity-100">
                        {sortConfig.key === 'liquidityUsd' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {processedTokens.map((t, idx) => (
                  <tr 
                    key={t.id}
                    onClick={() => router.push(`/terminal/${t.id}`)}
                    className="border-b border-[#00ff41]/20 hover:bg-[#00ff41] hover:text-black cursor-pointer transition-all group"
                  >
                    <td className="py-2 px-3 font-bold border-r border-[#00ff41]/20 group-hover:border-black/20 text-[#00ff41] group-hover:text-black text-xs">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-3 border-r border-[#00ff41]/20 group-hover:border-black/20 font-mono text-[10px] uppercase tracking-wider text-[#00ff41] group-hover:text-black">
                      {t.type || 'UNKNOWN'}
                    </td>
                    <td className="py-2 px-3 border-r border-[#00ff41]/20 group-hover:border-black/20">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-[#00ff41]/20 group-hover:bg-black/20 flex items-center justify-center text-[#00ff41] group-hover:text-black font-bold text-[10px] border border-[#00ff41] group-hover:border-black overflow-hidden rounded-full">
                          {t.logo ? (
                            <img src={t.logo} alt={t.symbol} className="w-full h-full object-cover" />
                          ) : (
                            t.symbol?.slice(0, 2)
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-xs text-[#00ff41] group-hover:text-black tracking-wider">{t.name}</div>
                          <div className="text-[#00ff41]/60 group-hover:text-black/60 text-[10px]">{t.symbol}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right font-mono border-r border-[#00ff41]/20 group-hover:border-black/20 text-[#00ff41] group-hover:text-black text-xs">
                      ${t.priceUsd?.toFixed(6)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono opacity-80 border-r border-[#00ff41]/20 group-hover:border-black/20 text-[#00ff41] group-hover:text-black text-xs">
                      {formatNumber(t.fdvUsd)}
                    </td>
                    <td className={`py-2 px-3 text-right font-mono font-bold border-r border-[#00ff41]/20 group-hover:border-black/20 text-xs ${
                      t.priceChange24h >= 0 
                        ? 'text-[#00ff41] group-hover:text-black' 
                        : 'text-red-500 group-hover:text-red-900'
                    }`}>
                      {t.priceChange24h?.toFixed(2)}%
                    </td>
                    <td className="py-2 px-3 text-right font-mono opacity-80 border-r border-[#00ff41]/20 group-hover:border-black/20 text-[#00ff41] group-hover:text-black text-xs">
                      {formatNumber(t.volume24hUsd)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono opacity-80 text-[#00ff41] group-hover:text-black text-xs">
                      {formatNumber(t.liquidityUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>

        </div>{/* /Main Content Container */}
    </div>
  );
}
