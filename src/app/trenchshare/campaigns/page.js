'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AccessGuard } from '@/components/AccessGuard';

export default function TrenchShareCampaignsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const response = await fetch('/api/trenchshare/campaigns', { cache: 'no-store' });
      const data = await response.json();
      setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : []);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getCampaignStatus = (campaign) => {
    const now = new Date();
    const start = new Date(campaign.startDate);
    const end = new Date(campaign.endDate);
    
    if (now < start) return { label: 'UPCOMING', color: 'cyan' };
    if (now > end) return { label: 'ENDED', color: 'gray' };
    return { label: 'LIVE', color: 'green' };
  };

  const getRemainingTime = (campaign) => {
    const now = new Date();
    const end = new Date(campaign.endDate);
    const diff = end - now;
    
    if (diff <= 0) return 'Campaign ended';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days} days ${hours} hrs left`;
    return `${hours} hrs left`;
  };

  return (
    <AccessGuard>
      <div className="min-h-screen pl-[100px] pr-8 max-w-5xl mx-auto transform lg:translate-x-16 font-sans text-[13px] sm:text-[14px] leading-relaxed">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-transparent backdrop-blur-sm border-b border-white/5 py-4 -ml-[100px] -mr-8 pl-[100px] pr-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#00ff41]">TrenchShare Campaigns</h1>
              <p className="text-sm text-white/60 mt-1">Share about Trenchor on X, earn points and win rewards</p>
            </div>
            <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-[#00ff41]/10 border border-[#00ff41]/20">
              <div className="w-2 h-2 bg-[#00ff41] rounded-full animate-pulse"></div>
              <span className="text-xs font-medium text-[#00ff41]">TrenchShare</span>
            </div>
          </div>
        </header>

        {/* İstatistikler */}
        <div className="py-6">
          <div className="grid grid-cols-4 gap-6">
            <div className="p-6 rounded-xl bg-[#111827] border border-white/10">
              <div className="text-4xl font-bold text-[#00ff41]">{campaigns.length}</div>
              <div className="text-sm text-white/40 mt-3">Total Campaigns</div>
            </div>
            <div className="p-6 rounded-xl bg-[#111827] border border-white/10">
              <div className="text-4xl font-bold text-cyan-400">
                {campaigns.filter(c => getCampaignStatus(c).label === 'LIVE').length}
              </div>
              <div className="text-sm text-white/40 mt-3">Active Now</div>
            </div>
            <div className="p-6 rounded-xl bg-[#111827] border border-white/10">
              <div className="text-4xl font-bold text-yellow-400">
                {campaigns.reduce((acc, c) => acc + (c.participantCount || 0), 0)}
              </div>
              <div className="text-sm text-white/40 mt-3">Participants</div>
            </div>
            <div className="p-6 rounded-xl bg-[#111827] border border-white/10">
              <div className="text-4xl font-bold text-purple-400">
                {campaigns.reduce((acc, c) => acc + (c.submissionCount || 0), 0)}
              </div>
              <div className="text-sm text-white/40 mt-3">Submissions</div>
            </div>
          </div>
        </div>

        {/* Kampanya Sayısı */}
        <div className="pb-4">
          <div className="text-sm text-white/40">
            Showing <span className="text-white">{campaigns.length}</span> campaigns
          </div>
        </div>

        {/* Kampanya Kartları */}
        <div className="pb-8">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-[#00ff41] border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm text-white/50">Loading...</span>
              </div>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 rounded-lg bg-transparent border border-white/10">
              <p className="text-lg text-white/50 mb-2">No Campaigns Yet</p>
              <p className="text-xs text-white/30">TrenchShare campaigns will appear here when created.</p>
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-6">
              {campaigns.map((campaign) => {
                const status = getCampaignStatus(campaign);
                const statusColors = {
                  green: { bg: 'bg-[#00ff41]', text: 'text-black' },
                  cyan: { bg: 'bg-cyan-500', text: 'text-black' },
                  gray: { bg: 'bg-gray-500', text: 'text-white' }
                };
                const statusColor = statusColors[status.color];

                return (
                  <div key={campaign.id} className="relative rounded-xl bg-[#0d1520] border border-[#00ff41]/20 hover:border-[#00ff41]/50 transition-all duration-300 p-8 flex flex-col w-[400px]">
                    
                    {/* Status Badge - Sağ üst köşe */}
                    <div className="absolute top-5 right-5">
                      <span className={`px-3 py-1.5 text-xs font-bold rounded-md ${statusColor.bg} ${statusColor.text}`}>
                        {status.label}
                      </span>
                    </div>

                    {/* Logo - Ortalanmış, büyük */}
                    <div className="flex justify-center pt-3 pb-5">
                      <div className="w-20 h-20 rounded-xl bg-[#00ff41]/10 border border-[#00ff41]/30 flex items-center justify-center overflow-hidden">
                        {campaign.imageUrl ? (
                          <img 
                            src={campaign.imageUrl} 
                            alt={campaign.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <svg className="w-12 h-12 text-[#00ff41]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                          </svg>
                        )}
                      </div>
                    </div>

                    {/* Campaign Name - Ortalanmış */}
                    <div className="text-center mb-5">
                      <h3 className="text-2xl font-bold text-white">
                        {campaign.name}
                      </h3>
                      {campaign.description && (
                        <p className="text-sm text-[#00ff41]/60 mt-1.5">{campaign.description}</p>
                      )}
                    </div>

                    {/* Timeline Box */}
                    <div className="py-3.5 px-5 rounded-lg bg-[#00ff41]/15 border border-[#00ff41]/30 mb-6">
                      <div className="flex items-center justify-center gap-2 text-[#00ff41] font-bold text-sm">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{getRemainingTime(campaign)}</span>
                      </div>
                    </div>

                    {/* Timeline */}
                    <div className="flex items-center gap-2 mb-3">
                      <svg className="w-4 h-4 text-white/40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <div>
                        <div className="text-xs text-white/40 uppercase tracking-wider">Duration</div>
                        <div className="text-sm text-white/80">
                          {new Date(campaign.startDate).toLocaleDateString()} - {new Date(campaign.endDate).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    {/* Max Posts */}
                    <div className="flex items-center gap-2 mb-5">
                      <svg className="w-4 h-4 text-white/40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <div>
                        <div className="text-xs text-white/40 uppercase tracking-wider">Max Posts</div>
                        <div className="text-sm text-white/80">Up to {campaign.maxPosts || 10} posts per user</div>
                      </div>
                    </div>

                    {/* Stats - Participants & Submissions */}
                    <div className="grid grid-cols-2 gap-3 mb-5">
                      <div className="py-2 px-3 rounded-lg bg-[#00ff41]/5 border border-[#00ff41]/10 text-center">
                        <div className="text-xl font-bold text-[#00ff41]">{campaign.participantCount || 0}</div>
                        <div className="text-[10px] text-white/40 uppercase">Participants</div>
                      </div>
                      <div className="py-2 px-3 rounded-lg bg-yellow-500/5 border border-yellow-500/10 text-center">
                        <div className="text-xl font-bold text-yellow-400">{campaign.submissionCount || 0}</div>
                        <div className="text-[10px] text-white/40 uppercase">Submissions</div>
                      </div>
                    </div>

                    {/* Buttons - Dikey, tam genişlik */}
                    <div className="mt-auto space-y-3">
                      {status.label === 'LIVE' && (
                        <Link
                          href={`/trenchshare/${campaign.id}`}
                          className="block w-full text-center py-3 rounded-lg bg-[#00ff41] text-black font-bold text-sm hover:bg-[#00cc33] transition-colors"
                        >
                          Submit Posts
                        </Link>
                      )}
                      <Link
                        href={`/trenchshare/${campaign.id}/leaderboard`}
                        className="block w-full text-center py-3 rounded-lg border border-[#00ff41]/50 text-[#00ff41] font-bold text-sm hover:bg-[#00ff41]/10 transition-colors"
                      >
                        View Leaderboard
                      </Link>
                    </div>
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
    </AccessGuard>
  );
}
