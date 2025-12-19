'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { AccessGuard } from '@/components/AccessGuard';

export default function CampaignLeaderboardPage() {
  const params = useParams();
  const router = useRouter();
  const { address } = useAccount();
  
  const [campaign, setCampaign] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.id) {
      fetchLeaderboard();
    }
  }, [params.id]);

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch(`/api/trenchshare/leaderboard?campaignId=${params.id}`, { cache: 'no-store' });
      const data = await res.json();
      
      if (data.campaign) {
        setCampaign(data.campaign);
      }
      
      if (data.leaderboard) {
        setLeaderboard(data.leaderboard);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AccessGuard>
        <div className="min-h-screen bg-black flex items-center justify-center pl-[100px]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#00ff41] border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm text-white/50">Loading leaderboard...</span>
          </div>
        </div>
      </AccessGuard>
    );
  }

  return (
    <AccessGuard>
      <div className="min-h-screen bg-black pl-[100px] pr-8 py-8 max-w-5xl mx-auto transform lg:translate-x-16">
        {/* Header */}
        <header className="mb-8">
          <button
            onClick={() => router.push('/trenchshare/campaigns')}
            className="flex items-center gap-2 text-white/60 hover:text-white mb-4 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Campaigns
          </button>
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold text-[#00ff41]">
              {campaign?.name || 'Campaign'} Leaderboard
            </h1>
            <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-[#00ff41]/10 border border-[#00ff41]/20">
              <svg className="w-5 h-5 text-[#00ff41]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
              <span className="text-sm font-medium text-[#00ff41]">Leaderboard</span>
            </div>
          </div>
          <p className="text-white/60">Top performers in this TrenchShare campaign</p>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="p-4 rounded-xl bg-[#111827] border border-white/10">
            <div className="text-2xl font-bold text-[#00ff41]">{leaderboard.length}</div>
            <div className="text-sm text-white/40 mt-1">Total Participants</div>
          </div>
          <div className="p-4 rounded-xl bg-[#111827] border border-white/10">
            <div className="text-2xl font-bold text-yellow-400">
              {leaderboard[0]?.points || 0}
            </div>
            <div className="text-sm text-white/40 mt-1">Top Score</div>
          </div>
          <div className="p-4 rounded-xl bg-[#111827] border border-white/10">
            <div className="text-2xl font-bold text-cyan-400">
              {leaderboard.reduce((sum, e) => sum + e.points, 0)}
            </div>
            <div className="text-sm text-white/40 mt-1">Total Points</div>
          </div>
        </div>

        {/* Leaderboard */}
        {leaderboard.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-xl bg-[#111827] border border-white/10">
            <div className="w-16 h-16 mb-4 rounded-full bg-[#00ff41]/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-[#00ff41]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-lg text-white/50 mb-2">No Submissions Yet</p>
            <p className="text-sm text-white/30">Be the first to participate in this campaign!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {leaderboard.map((entry) => (
              <div
                key={entry.wallet}
                className={`flex items-center justify-between p-5 rounded-xl transition-all ${
                  entry.wallet.toLowerCase() === address?.toLowerCase()
                    ? 'bg-[#00ff41]/10 border-2 border-[#00ff41]/50 shadow-[0_0_30px_-15px_#00ff41]'
                    : entry.rank <= 3
                    ? 'bg-[#0d1520] border border-[#00ff41]/20'
                    : 'bg-[#111827] border border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-4 flex-1">
                  {/* Rank Badge */}
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${
                    entry.rank === 1 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-black' :
                    entry.rank === 2 ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-black' :
                    entry.rank === 3 ? 'bg-gradient-to-br from-amber-600 to-amber-800 text-white' :
                    'bg-white/5 text-white/60'
                  }`}>
                    {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : `#${entry.rank}`}
                  </div>

                  {/* Wallet Address */}
                  <div>
                    <div className="text-white font-mono text-lg">
                      {entry.wallet.slice(0, 8)}...{entry.wallet.slice(-6)}
                    </div>
                    {entry.wallet.toLowerCase() === address?.toLowerCase() && (
                      <div className="text-sm text-[#00ff41] font-medium">⭐ You</div>
                    )}
                  </div>
                </div>

                {/* Points */}
                <div className="text-right">
                  <div className="text-3xl font-bold text-[#00ff41]">{entry.points}</div>
                  <div className="text-sm text-white/40">points</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-white/10">
          <div className="text-center text-xs text-white/20 tracking-widest">
            TRENCHOR v2.0
          </div>
        </footer>
      </div>
    </AccessGuard>
  );
}
