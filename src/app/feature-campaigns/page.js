"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function FeatureCampaignsPage() {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const featuredTokens = tokens;

  const fetchTokens = async () => {
    try {
      const response = await fetch("/api/feature-campaigns");
      const data = await response.json();
      setTokens(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokens();
    const interval = setInterval(fetchTokens, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatNumber = (num) => {
    if (!num) return "0";
    const n = parseInt(num);
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return n.toString();
  };

  return (
    <div className="min-h-screen pl-[100px] pr-8 max-w-5xl mx-auto transform lg:translate-x-16 font-sans text-[13px] sm:text-[14px] leading-relaxed">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0a0f1a]/95 backdrop-blur-md border-b border-white/5 py-4 -mx-8 px-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#00ff41]">Feature Campaigns</h1>
            <p className="text-sm text-white/60 mt-1">Discover featured trading campaigns and earn rewards</p>
          </div>
          <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-[#00ff41]/10 border border-[#00ff41]/20">
            <div className="w-2 h-2 bg-[#00ff41] rounded-full animate-pulse"></div>
            <span className="text-xs font-medium text-[#00ff41]">Live</span>
          </div>
        </div>
      </header>

      {/* İstatistikler */}
      <div className="py-6">
        <div className="grid grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-[#111827] border border-white/10">
            <div className="text-3xl font-bold text-[#00ff41]">{featuredTokens.length}</div>
            <div className="text-xs text-white/40 mt-2">Feature Campaigns</div>
          </div>
          <div className="p-4 rounded-lg bg-[#111827] border border-white/10">
            <div className="text-3xl font-bold text-cyan-400">
              {featuredTokens.reduce((acc, t) => acc + parseInt(t.uniqueTraders || 0), 0)}
            </div>
            <div className="text-xs text-white/40 mt-2">Traders</div>
          </div>
          <div className="p-4 rounded-lg bg-[#111827] border border-white/10">
            <div className="text-3xl font-bold text-yellow-400">
              {formatNumber(featuredTokens.reduce((acc, t) => acc + parseInt(t.totalSwaps || 0), 0))}
            </div>
            <div className="text-xs text-white/40 mt-2">Swaps</div>
          </div>
          <div className="p-4 rounded-lg bg-[#111827] border border-white/10">
            <div className="text-3xl font-bold text-purple-400">24/7</div>
            <div className="text-xs text-white/40 mt-2">Monitoring</div>
          </div>
        </div>
      </div>

      {/* Kampanya Sayısı */}
      <div className="pb-4">
        <div className="text-sm text-white/40">
          Showing <span className="text-white">{featuredTokens.length}</span> feature campaigns
        </div>
      </div>

      {/* Token Kartları */}
      <div className="pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-[#00ff41] border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm text-white/50">Loading...</span>
            </div>
          </div>
        ) : featuredTokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-lg bg-[#111827] border border-white/10">
            <p className="text-lg text-white/50 mb-2">No Feature Campaigns</p>
            <p className="text-xs text-white/30">Feature campaigns will appear here when added.</p>
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-6">
            {featuredTokens.map((token) => {
              const campaignLinks = (() => {
                if (!token.campaignLinks) return [];
                try {
                  const parsed = typeof token.campaignLinks === 'string' ? JSON.parse(token.campaignLinks) : token.campaignLinks;
                  return Array.isArray(parsed) ? parsed : [];
                } catch (err) {
                  return [];
                }
              })();

              const imageSrc = token.imageUrl || '/images/tr-character.svg';
              const timelineText = token.timeline || 'Timeline TBA';
              const distributionText = token.distributionPeriod || 'Not Started';
              const detailsText = token.details || 'Details coming soon...';
              const isExpanded = expanded === (token.tokenId || token.id);

              return (
                <div key={token.tokenId || token.id} className="relative rounded-xl bg-[#0d1520] border border-[#00ff41]/20 hover:border-[#00ff41]/50 transition-all duration-300 p-8 flex flex-col w-[400px]">
                  {/* LIVE Badge */}
                  <div className="absolute top-5 right-5">
                    <span className="px-3 py-1.5 text-xs font-bold rounded-md bg-[#00ff41] text-black">LIVE</span>
                  </div>

                  {/* Logo */}
                  <div className="flex justify-center pt-3 pb-5">
                    <div className="w-20 h-20 rounded-xl bg-[#00ff41]/10 border border-[#00ff41]/30 flex items-center justify-center overflow-hidden">
                      <img
                        src={imageSrc}
                        alt={token.tokenName || token.name}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    </div>
                  </div>

                  {/* Token Name & Handle */}
                  <div className="text-center mb-5">
                    <h3 className="text-2xl font-bold text-white">
                      {token.tokenName || token.name || token.tokenId || token.id}
                    </h3>
                    <p className="text-sm text-[#00ff41]/60 mt-1.5">{token.ticker || `@${(token.tokenId || token.id || 'campaign').slice(0, 8)}`}</p>
                  </div>

                  {/* Reward Box */}
                  <div className="py-3.5 px-5 rounded-lg bg-[#00ff41]/15 border border-[#00ff41]/30 mb-6">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 text-[#00ff41]" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.736 6.979C9.208 6.193 9.696 6 10 6c.304 0 .792.193 1.264.979a1 1 0 001.715-1.029C12.279 4.784 11.232 4 10 4s-2.279.784-2.979 1.95c-.285.475-.507 1-.67 1.55H6a1 1 0 000 2h.013a9.358 9.358 0 000 1H6a1 1 0 100 2h.351c.163.55.385 1.075.67 1.55C7.721 15.216 8.768 16 10 16s2.279-.784 2.979-1.95a1 1 0 10-1.715-1.029c-.472.786-.96.979-1.264.979-.304 0-.792-.193-1.264-.979a4.265 4.265 0 01-.264-.521H10a1 1 0 100-2H8.017a7.36 7.36 0 010-1H10a1 1 0 100-2H8.472c.08-.185.167-.36.264-.521z" />
                      </svg>
                      <span className="text-[#00ff41] font-bold text-sm">
                        {token.totalReward || 'Rewards TBA'}
                      </span>
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-4 h-4 text-white/40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <div>
                      <div className="text-xs text-white/40 uppercase tracking-wider">Timeline</div>
                      <div className="text-sm text-white/80">{timelineText}</div>
                    </div>
                  </div>

                  {/* Distribution Period */}
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-4 h-4 text-white/40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <div className="text-xs text-white/40 uppercase tracking-wider">Distribution Period</div>
                      <div className="text-sm text-white/80">{distributionText}</div>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="flex items-start gap-2 mb-5">
                    <svg className="w-4 h-4 text-white/40 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <div className="text-xs text-white/40 uppercase tracking-wider">Details</div>
                      <div className="text-sm text-white/60 line-clamp-2">{detailsText}</div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <div className="py-2 px-3 rounded-lg bg-[#00ff41]/5 border border-[#00ff41]/10 text-center">
                      <div className="text-xl font-bold text-[#00ff41]">{token.uniqueTraders || 0}</div>
                      <div className="text-[10px] text-white/40 uppercase">Traders</div>
                    </div>
                    <div className="py-2 px-3 rounded-lg bg-yellow-500/5 border border-yellow-500/10 text-center">
                      <div className="text-xl font-bold text-yellow-400">{token.totalSwaps || 0}</div>
                      <div className="text-[10px] text-white/40 uppercase">Swaps</div>
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="mt-auto space-y-3">
                    {/* Primary Link Logic: use ctaUrl OR first campaign link */}
                    {(() => {
                      const primaryLink = token.ctaUrl || (campaignLinks.length > 0 ? campaignLinks[0] : null);

                      return primaryLink ? (
                        <a
                          href={primaryLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-full text-center py-3 rounded-lg bg-[#00ff41] text-black font-bold text-sm hover:bg-[#00cc33] transition-colors"
                        >
                          View Campaign
                        </a>
                      ) : (
                        <span className="block w-full text-center py-3 rounded-lg bg-white/5 text-white/60 text-sm border border-white/10">
                          No external link
                        </span>
                      );
                    })()}
                    <button
                      type="button"
                      onClick={() => setExpanded(isExpanded ? null : token.tokenId)}
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-lg border border-white/20 text-white/70 text-sm hover:border-[#00ff41]/50 hover:text-white transition-colors"
                    >
                      Campaign Details
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </button>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="border-t border-white/10 pt-4 mt-4">
                      <div className="text-xs text-white/40 uppercase tracking-wider mb-2">Campaign Links</div>
                      {campaignLinks.length === 0 ? (
                        <div className="text-sm text-white/30">No links available yet.</div>
                      ) : (
                        <ul className="space-y-2">
                          {campaignLinks.map((link, idx) => (
                            <li key={idx}>
                              <a href={link} target="_blank" rel="noopener noreferrer" className="text-sm text-cyan-400 hover:underline break-all">{link}</a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="py-8 mt-auto">
        <div className="text-center text-[10px] text-white/15 tracking-widest">
          TRENCHOR v2.0
        </div>
      </footer>
    </div>
  );
}
