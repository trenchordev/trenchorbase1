'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function TokenDetailPage() {
  const params = useParams();
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('chart');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/terminal/token/${params.id}`);
        const data = await res.json();
        if (data.token) {
          setToken(data.token);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    if (params.id) load();
  }, [params.id]);

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
          <span className="text-[#00ff41] animate-pulse tracking-widest">ACCESSING DATA...</span>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center font-mono text-[#00ff41]">
        TOKEN NOT FOUND
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black font-mono selection:bg-[#00ff41] selection:text-black p-8 relative">
      {/* CRT Effect */}
      <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-0 bg-[length:100%_2px,3px_100%] opacity-20"></div>

      {/* Breadcrumb */}
      <div className="relative z-10 mb-6 flex items-center gap-2 text-[#00ff41]/60 text-xs uppercase tracking-wider">
        <Link href="/terminal" className="hover:text-[#00ff41] hover:underline">&lt; BACK TO TOKEN TERMINAL</Link>
        <span>/</span>
        <span className="text-[#00ff41]">{token.symbol}</span>
      </div>

      {/* Header */}
      <div className="relative z-10 mb-6 flex items-center justify-between border-b border-[#00ff41]/30 pb-4 max-w-[1400px] mx-auto">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 border-2 border-[#00ff41] bg-[#00ff41]/10 flex items-center justify-center text-2xl font-bold text-[#00ff41] overflow-hidden rounded-full">
            {token.logo ? (
              <img src={token.logo} alt={token.symbol} className="w-full h-full object-cover" />
            ) : (
              token.symbol?.slice(0, 2)
            )}
          </div>
          <div>
            <h1 className="text-4xl font-bold text-[#00ff41] tracking-tighter mb-1">{token.name}</h1>
            <div className="flex items-center gap-4 text-sm">
              <span className="bg-[#00ff41] text-black px-2 py-0.5 font-bold">{token.symbol}</span>
              <span className="text-[#00ff41]/60 uppercase tracking-wider">{token.type}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="relative z-10 grid grid-cols-12 gap-6 max-w-[1400px] mx-auto">
        {/* Left Column: Chart */}
        <div className="col-span-8 lg:col-span-9 flex flex-col gap-6">
          <div className="border border-[#00ff41] bg-black p-1 shadow-[0_0_20px_rgba(0,255,65,0.1)] h-[500px]">
            <iframe
              src={`${token.geckoTerminalUrl}?embed=1&info=0&swaps=0`}
              title={`${token.name} chart`}
              className="w-full h-full"
              frameBorder="0"
              allowFullScreen
            />
          </div>
        </div>

        {/* Right Column: Stats & Info */}
        <div className="col-span-4 lg:col-span-3 flex flex-col gap-4 max-w-sm ml-auto">
          {/* Stats Box */}
          <div className="border border-[#00ff41] bg-black p-4 shadow-[0_0_10px_rgba(0,255,65,0.05)]">
            <div className="flex items-center justify-between border-b border-[#00ff41]/30 pb-2 mb-3">
              <h3 className="text-[#00ff41] text-sm uppercase tracking-[0.2em]">
                Market Data
              </h3>
              {token.logo && (
                <div className="w-8 h-8 rounded-full overflow-hidden border border-[#00ff41]/50">
                  <img src={token.logo} alt="Logo" className="w-full h-full object-cover" />
                </div>
              )}
            </div>

            {/* Price Block */}
            <div className="mb-3 pb-3 border-b border-[#00ff41]/30 text-right">
              <div className="text-2xl font-bold text-[#00ff41] font-mono">${token.priceUsd?.toFixed(6)}</div>
              <div className={`text-xs font-mono font-bold ${token.priceChange24h >= 0 ? 'text-[#00ff41]' : 'text-red-500'}`}>
                {token.priceChange24h >= 0 ? '+' : ''}{token.priceChange24h?.toFixed(2)}% (24H)
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center gap-4">
                <span className="text-[#00ff41]/60 text-xs uppercase">FDV</span>
                <span className="text-[#00ff41] font-mono font-bold">{formatNumber(token.fdvUsd)}</span>
              </div>
              <div className="flex justify-between items-center gap-4">
                <span className="text-[#00ff41]/60 text-xs uppercase">Market Cap</span>
                <span className="text-[#00ff41] font-mono font-bold">{formatNumber(token.marketCapUsd)}</span>
              </div>
              <div className="flex justify-between items-center gap-4">
                <span className="text-[#00ff41]/60 text-xs uppercase">Liquidity</span>
                <span className="text-[#00ff41] font-mono font-bold">{formatNumber(token.liquidityUsd)}</span>
              </div>
              <div className="flex justify-between items-center gap-4">
                <span className="text-[#00ff41]/60 text-xs uppercase">24H Volume</span>
                <span className="text-[#00ff41] font-mono font-bold">{formatNumber(token.volume24hUsd)}</span>
              </div>
              <div className="flex justify-between items-center gap-4">
                <span className="text-[#00ff41]/60 text-xs uppercase">Network</span>
                <span className="text-[#00ff41] font-mono uppercase">{token.network}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="border border-[#00ff41] bg-black p-4 text-xs">
            <h3 className="text-[#00ff41] text-sm uppercase tracking-[0.2em] border-b border-[#00ff41]/30 pb-2 mb-4">
              Actions
            </h3>
            <div className="grid grid-cols-1 gap-4">
              <a 
                href={token.geckoTerminalUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center px-4 py-3 bg-[#00ff41]/10 border border-[#00ff41] text-[#00ff41] hover:bg-[#00ff41] hover:text-black transition-all text-xs font-bold uppercase tracking-wider"
              >
                GeckoTerminal ↗
              </a>
            </div>
          </div>

          {/* Contract Info */}
          <div className="border border-[#00ff41] bg-black p-4 opacity-80 text-xs">
            <h3 className="text-[#00ff41] text-sm uppercase tracking-[0.2em] border-b border-[#00ff41]/30 pb-2 mb-4">
              Contract
            </h3>
            <div className="text-[#00ff41]/60 text-[10px] font-mono break-all">
              {token.poolId}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
