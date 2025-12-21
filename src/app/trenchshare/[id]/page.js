'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAccount, useSignTypedData } from 'wagmi';
import { AccessGuard } from '@/components/AccessGuard';

const DOMAIN = {
  name: 'Trenchor',
  version: '1',
  chainId: 8453,
};

const TYPES = {
  Submission: [
    { name: 'campaignId', type: 'string' },
    { name: 'postCount', type: 'uint256' },
    { name: 'timestamp', type: 'uint256' },
  ],
};

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  
  const [campaign, setCampaign] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [posts, setPosts] = useState(['']);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [existingSubmission, setExistingSubmission] = useState(null);
  const [dailyCount, setDailyCount] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (params.id) {
      fetchCampaignData();
    }
  }, [params.id, address]);

  const fetchCampaignData = async () => {
    try {
      // Fetch campaign details
      const campaignRes = await fetch(`/api/trenchshare/campaign?id=${params.id}`, { cache: 'no-store' });
      const campaignData = await campaignRes.json();
      
      if (campaignData.campaign) {
        setCampaign(campaignData.campaign);
      }

      // Fetch leaderboard
      const leaderboardRes = await fetch(`/api/trenchshare/leaderboard?campaignId=${params.id}`, { cache: 'no-store' });
      const leaderboardData = await leaderboardRes.json();
      
      if (leaderboardData.leaderboard) {
        setLeaderboard(leaderboardData.leaderboard);
      }

      // Check existing submission and daily count
      if (address) {
        const subRes = await fetch(`/api/trenchshare/submission?campaignId=${params.id}&wallet=${address}`, { cache: 'no-store' });
        const subData = await subRes.json();
        
        if (subData.submission) {
          setExistingSubmission(subData.submission);
          setSubmitted(true);
        }

        // Fetch daily count from submit API (we'll add a GET method or separate endpoint)
        // For now, let's assume the submission API returns it or we fetch it
        const dailyRes = await fetch(`/api/trenchshare/daily-status?campaignId=${params.id}&wallet=${address}`, { cache: 'no-store' });
        const dailyData = await dailyRes.json();
        if (dailyData.success) {
          setDailyCount(dailyData.count);
        }
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load campaign data');
    } finally {
      setLoading(false);
    }
  };

  const addPostField = () => {
    const remainingDaily = 10 - dailyCount;
    if (posts.length < remainingDaily) {
      setPosts([...posts, '']);
    }
  };

  const removePostField = (index) => {
    if (posts.length > 1) {
      setPosts(posts.filter((_, i) => i !== index));
    }
  };

  const updatePost = (index, value) => {
    const newPosts = [...posts];
    newPosts[index] = value;
    setPosts(newPosts);
  };

  const validateTwitterUrl = (url) => {
    const pattern = /^https?:\/\/(twitter\.com|x\.com)\/[a-zA-Z0-9_]+\/status\/[0-9]+/;
    return pattern.test(url);
  };

  const handleSubmit = async () => {
    setError('');
    setSuccess('');

    const validPosts = posts.filter(p => p.trim() !== '');
    
    if (validPosts.length === 0) {
      setError('At least one X post link is required.');
      return;
    }

    for (const post of validPosts) {
      if (!validateTwitterUrl(post)) {
        setError(`Invalid X post link: ${post}`);
        return;
      }
    }

    setSubmitting(true);

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      
      const signature = await signTypedDataAsync({
        domain: DOMAIN,
        types: TYPES,
        primaryType: 'Submission',
        message: {
          campaignId: params.id,
          postCount: BigInt(validPosts.length),
          timestamp: BigInt(timestamp),
        },
      });

      const res = await fetch('/api/trenchshare/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: params.id,
          wallet: address,
          posts: validPosts,
          signature,
          timestamp,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Submission failed');
      }

      setSuccess('Your posts have been submitted successfully! Points will be calculated after review.');
      setSubmitted(true);
      setExistingSubmission(data.submission);
      setPosts(['']); // Reset form for next daily submission
      
      // Refresh leaderboard
      setTimeout(() => {
        fetchCampaignData();
      }, 1000);
    } catch (err) {
      console.error('Submit error:', err);
      if (err.message?.includes('User rejected')) {
        setError('Signature rejected.');
      } else {
        setError(err.message || 'An error occurred.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const getRemainingTime = () => {
    if (!campaign) return '';
    const end = new Date(campaign.endDate);
    const now = new Date();
    const diff = end - now;
    
    if (diff <= 0) return 'Campaign ended';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days} days ${hours} hrs left`;
    return `${hours} hrs left`;
  };

  if (loading) {
    return (
      <AccessGuard>
        <div className="min-h-screen bg-black flex items-center justify-center pl-[100px]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#00ff41] border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm text-white/50">Loading campaign...</span>
          </div>
        </div>
      </AccessGuard>
    );
  }

  if (!campaign) {
    return (
      <AccessGuard>
        <div className="min-h-screen bg-black pl-[100px] pr-8 py-8">
          <div className="max-w-5xl mx-auto transform lg:translate-x-16">
            <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-8 text-center">
              <h2 className="text-xl font-bold text-white mb-2">Campaign Not Found</h2>
              <p className="text-gray-400 mb-4">The campaign you're looking for doesn't exist.</p>
              <button
                onClick={() => router.push('/trenchshare/campaigns')}
                className="px-4 py-2 bg-[#00ff41] text-black font-bold rounded-lg hover:bg-[#00cc33] transition-colors"
              >
                Back to Campaigns
              </button>
            </div>
          </div>
        </div>
      </AccessGuard>
    );
  }

  const isCampaignActive = () => {
    const now = new Date();
    return now >= new Date(campaign.startDate) && now <= new Date(campaign.endDate);
  };

  return (
    <AccessGuard>
      <div className="min-h-screen bg-black pl-[100px] pr-8 py-8 max-w-[1600px] mx-auto transform lg:translate-x-16">
        {/* Header */}
        <header className="mb-6">
          <button
            onClick={() => router.push('/trenchshare/campaigns')}
            className="flex items-center gap-2 text-white/60 hover:text-white mb-4 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Campaigns
          </button>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              {campaign.imageUrl && (
                <div className="w-16 h-16 rounded-xl bg-[#00ff41]/10 border border-[#00ff41]/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                  <img 
                    src={campaign.imageUrl} 
                    alt={campaign.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div>
                <h1 className="text-3xl font-bold text-[#00ff41] mb-2">{campaign.name}</h1>
                {campaign.description && (
                  <p className="text-white/60">{campaign.description}</p>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-white/40 mb-1">Time Remaining</div>
              <div className="text-lg font-bold text-[#00ff41]">{getRemainingTime()}</div>
            </div>
          </div>
        </header>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Submit Form */}
          <div className="space-y-6">
            {/* Submission Form */}
            <div className="bg-[#0d1520] border border-[#00ff41]/20 rounded-xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white">Submit Your Posts</h3>
                <div className="px-3 py-1 rounded-full bg-[#00ff41]/10 border border-[#00ff41]/30 text-[10px] font-mono text-[#00ff41]">
                  DAILY LIMIT: {dailyCount}/10
                </div>
              </div>
              
              <p className="text-white/60 text-sm mb-6">
                Share X posts about $TRB or Trenchor. You can submit up to <span className="text-[#00ff41] font-bold">10 posts every day</span>.
              </p>

              {dailyCount >= 10 ? (
                <div className="bg-[#00ff41]/5 border border-[#00ff41]/20 rounded-lg p-6 text-center mb-6">
                  <div className="w-12 h-12 bg-[#00ff41]/20 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-[#00ff41]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h4 className="text-[#00ff41] font-bold mb-1">Daily Limit Reached</h4>
                  <p className="text-white/50 text-xs">You've submitted 10 posts today. Your limit will reset at 00:00 UTC.</p>
                </div>
              ) : (
                <>
                  {!isCampaignActive() && (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-4">
                      <p className="text-yellow-400 text-sm">
                        {new Date() < new Date(campaign.startDate) ? 'Campaign has not started yet' : 'Campaign has ended'}
                      </p>
                    </div>
                  )}

                  {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
                      <p className="text-red-400 text-sm">{error}</p>
                    </div>
                  )}

                  {success && (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-4">
                      <p className="text-green-400 text-sm">{success}</p>
                    </div>
                  )}

                  <div className="space-y-3 mb-6">
                    {posts.map((post, index) => (
                      <div key={index} className="flex gap-2">
                        <div className="flex-1 relative">
                          <input
                            type="url"
                            value={post}
                            onChange={(e) => updatePost(index, e.target.value)}
                            placeholder="https://x.com/username/status/123456789"
                            className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#00ff41]/50 transition-colors"
                            disabled={!isCampaignActive()}
                          />
                          {post && validateTwitterUrl(post) && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#00ff41]">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                          )}
                        </div>
                        {posts.length > 1 && (
                          <button
                            onClick={() => removePostField(index)}
                            className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                            disabled={!isCampaignActive()}
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      onClick={addPostField}
                      disabled={posts.length >= (10 - dailyCount) || !isCampaignActive()}
                      className="flex items-center gap-2 text-[#00ff41] hover:text-[#00cc33] disabled:text-white/30 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Add Post ({posts.length}/{10 - dailyCount})
                    </button>

                    <button
                      onClick={handleSubmit}
                      disabled={submitting || !isCampaignActive()}
                      className="flex items-center gap-2 bg-[#00ff41] hover:bg-[#00cc33] text-black font-bold px-6 py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? (
                        <>
                          <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                          Signing...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Submit
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}

              <p className="text-xs text-white/30 mt-4">
                💡 Signature required for verification. No gas fees. You can submit 10 posts every 24 hours.
              </p>
            </div>

            {/* Existing Submissions */}
            {submitted && existingSubmission && (
              <div className="bg-[#0d1520] border border-[#00ff41]/20 rounded-xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-white">Your Submissions</h3>
                  <div className="flex gap-4">
                    <div className="text-center">
                      <div className="text-xs text-white/40">Total Points</div>
                      <div className="text-lg font-bold text-[#00ff41]">{existingSubmission.points || 0}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-white/40">Total Posts</div>
                      <div className="text-lg font-bold text-cyan-400">{existingSubmission.posts?.length || 0}</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {existingSubmission.posts?.map((postUrl, idx) => (
                    <div key={idx} className="p-3 rounded-lg bg-black/30 border border-white/10">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-white/40">Post #{idx + 1}</span>
                        <span className="text-xs px-2 py-1 rounded bg-yellow-500/20 text-yellow-400">
                          Pending
                        </span>
                      </div>
                      <a
                        href={typeof postUrl === 'string' ? postUrl : postUrl.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-cyan-400 hover:underline break-all"
                      >
                        {typeof postUrl === 'string' ? postUrl : postUrl.url}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Leaderboard */}
          <div className="bg-[#0d1520] border border-[#00ff41]/20 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">Leaderboard</h3>
              <div className="text-sm text-white/40">{leaderboard.length} participants</div>
            </div>

            {leaderboard.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                  <svg className="w-8 h-8 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-white/50">No submissions yet</p>
                <p className="text-white/30 text-sm mt-2">Be the first to participate!</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {leaderboard.map((entry) => (
                  <div
                    key={entry.wallet}
                    className={`flex items-center justify-between p-4 rounded-lg transition-colors ${
                      entry.wallet.toLowerCase() === address?.toLowerCase()
                        ? 'bg-[#00ff41]/10 border border-[#00ff41]/30'
                        : 'bg-black/30 border border-white/10 hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                        entry.rank === 1 ? 'bg-yellow-500/20 text-yellow-400' :
                        entry.rank === 2 ? 'bg-gray-400/20 text-gray-300' :
                        entry.rank === 3 ? 'bg-amber-700/20 text-amber-600' :
                        'bg-white/5 text-white/50'
                      }`}>
                        {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : `#${entry.rank}`}
                      </div>
                      <div>
                        <div className="text-white font-mono text-sm">
                          {entry.wallet.slice(0, 6)}...{entry.wallet.slice(-4)}
                        </div>
                        {entry.wallet.toLowerCase() === address?.toLowerCase() && (
                          <div className="text-xs text-[#00ff41]">You</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-[#00ff41]">{entry.points}</div>
                      <div className="text-xs text-white/40">points</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AccessGuard>
  );
}
