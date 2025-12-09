'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function TaxLeaderboardListPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCampaigns() {
      try {
        // Fetch from public API (doesn't require admin auth)
        const res = await fetch('/api/tax-leaderboard');
        const data = await res.json();

        if (data.campaigns) {
          setCampaigns(data.campaigns);
        }
      } catch (error) {
        console.error('Error fetching campaigns:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchCampaigns();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#00ff41] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white/50">Loading campaigns...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 max-w-5xl mx-auto transform lg:translate-x-24 font-sans text-[13px] sm:text-[14px] leading-relaxed">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold neon-text mb-2">Tax Terminal</h1>
          <p className="text-white/60">Active trading campaigns</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.length === 0 ? (
            <div className="col-span-full text-center py-20 border border-white/10 rounded-xl bg-black/30">
              <div className="text-6xl mb-4">📊</div>
              <h3 className="text-xl font-bold text-white/70 mb-2">No Tax Campaigns Yet</h3>
            </div>
          ) : (
            campaigns.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/tax-leaderboard/${campaign.id}`}
                className="block p-6 rounded-xl bg-gradient-to-br from-black/50 to-[#041b0d]/30 border border-[#00ff41]/20 hover:border-[#00ff41] transition-all hover:shadow-[0_0_30px_rgba(0,255,65,0.2)] group"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-lg bg-[#00ff41]/10 border border-[#00ff41]/30 flex items-center justify-center overflow-hidden">
                    {campaign.logoUrl ? (
                      <img src={campaign.logoUrl} alt={campaign.name} className="w-full h-full object-cover" />
                    ) : (
                      <svg className="w-6 h-6 text-[#00ff41]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-white text-lg group-hover:text-[#00ff41] transition-colors">
                      {campaign.name}
                    </h3>
                    <p className="text-xs text-white/50 font-mono">ID: {campaign.id}</p>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-white/50">Total Users:</span>
                    <span className="text-[#00ff41] font-mono font-bold">{campaign.totalUsers}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">Total Tax:</span>
                    <span className="text-cyan-400 font-mono">{campaign.totalTaxPaid} VIRTUAL</span>
                  </div>
                </div>

                {/* Technical details removed for cleaner UI */}

                <div className="mt-4 text-center">
                  <span className="text-xs text-[#00ff41] font-mono group-hover:underline">
                    View Leaderboard →
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>


      </div>
    </div>
  );
}
