'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';

export default function ReviewTweetsPage() {
  const { address } = useAccount();
  const [pendingSubmissions, setPendingSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchPendingSubmissions();
  }, []);

  const fetchPendingSubmissions = async () => {
    try {
      const res = await fetch('/api/admin/pending-tweets', { cache: 'no-store' });
      const data = await res.json();
      
      if (data.submissions) {
        setPendingSubmissions(data.submissions);
      }
    } catch (err) {
      console.error('Error fetching submissions:', err);
      setError('Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  const handleScore = async (campaignId, wallet, postIndex, score, action) => {
    setError('');
    setSuccess('');
    setProcessing(`${wallet}-${postIndex}`);

    try {
      const res = await fetch('/api/admin/score-tweet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          wallet,
          postIndex,
          score: action === 'reject' ? 0 : parseInt(score),
          reviewedBy: address,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to score tweet');
      }

      setSuccess(`Tweet ${action === 'reject' ? 'rejected' : 'approved'} successfully!`);
      
      // Refresh submissions
      await fetchPendingSubmissions();
    } catch (err) {
      console.error('Error scoring tweet:', err);
      setError(err.message);
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center pl-[100px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#00ff41] border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm text-white/50">Loading submissions...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pl-[100px] pr-8 py-8 max-w-7xl mx-auto transform lg:translate-x-16">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-[#00ff41] mb-2">Review TrenchShare Submissions</h1>
        <p className="text-white/60">Approve or reject tweet submissions and assign points</p>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="p-4 rounded-xl bg-[#111827] border border-white/10">
          <div className="text-2xl font-bold text-[#00ff41]">{pendingSubmissions.length}</div>
          <div className="text-sm text-white/40 mt-1">Pending Submissions</div>
        </div>
        <div className="p-4 rounded-xl bg-[#111827] border border-white/10">
          <div className="text-2xl font-bold text-cyan-400">
            {pendingSubmissions.reduce((acc, sub) => acc + sub.posts.filter(p => p.status === 'pending').length, 0)}
          </div>
          <div className="text-sm text-white/40 mt-1">Pending Tweets</div>
        </div>
        <div className="p-4 rounded-xl bg-[#111827] border border-white/10">
          <div className="text-2xl font-bold text-yellow-400">Manual</div>
          <div className="text-sm text-white/40 mt-1">Review Mode</div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400">
          {success}
        </div>
      )}

      {/* Submissions List */}
      {pendingSubmissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl bg-[#111827] border border-white/10">
          <div className="w-16 h-16 mb-4 rounded-full bg-[#00ff41]/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-[#00ff41]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-lg text-white/50 mb-2">All Caught Up!</p>
          <p className="text-sm text-white/30">No pending submissions to review</p>
        </div>
      ) : (
        <div className="space-y-6">
          {pendingSubmissions.map((submission) => (
            <div key={`${submission.campaignId}-${submission.wallet}`} className="rounded-xl bg-[#0d1520] border border-[#00ff41]/20 p-6">
              {/* Submission Header */}
              <div className="flex items-start justify-between mb-4 pb-4 border-b border-white/10">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-bold text-white">{submission.campaignName || submission.campaignId}</h3>
                    <span className="px-2 py-1 text-xs font-bold rounded bg-cyan-500/20 text-cyan-400">
                      {submission.posts.filter(p => p.status === 'pending').length} Pending
                    </span>
                  </div>
                  <p className="text-sm text-white/50 font-mono">{submission.wallet}</p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-white/40">Submitted</div>
                  <div className="text-sm text-white/60">
                    {new Date(submission.submittedAt).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Posts */}
              <div className="space-y-4">
                {submission.posts.map((post, idx) => {
                  if (post.status !== 'pending') return null;

                  return (
                    <TweetReviewCard
                      key={idx}
                      post={post}
                      postIndex={idx}
                      campaignId={submission.campaignId}
                      wallet={submission.wallet}
                      onScore={handleScore}
                      processing={processing === `${submission.wallet}-${idx}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TweetReviewCard({ post, postIndex, campaignId, wallet, onScore, processing }) {
  const [score, setScore] = useState('');

  const handleApprove = () => {
    if (!score || parseInt(score) < 0 || parseInt(score) > 100) {
      alert('Please enter a valid score between 0-100');
      return;
    }
    onScore(campaignId, wallet, postIndex, score, 'approve');
  };

  const handleReject = () => {
    onScore(campaignId, wallet, postIndex, 0, 'reject');
  };

  return (
    <div className="rounded-lg bg-[#111827] border border-white/10 p-4">
      <div className="mb-4">
        <div className="text-xs text-white/40 mb-2">Tweet #{postIndex + 1}</div>
        
        {/* Twitter Embed */}
        <div className="bg-black/30 rounded-lg p-4 mb-4">
          <blockquote className="twitter-tweet" data-theme="dark">
            <a href={post.url}></a>
          </blockquote>
          <script async src="https://platform.twitter.com/widgets.js" charSet="utf-8"></script>
        </div>

        {/* Tweet URL */}
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-cyan-400 hover:underline break-all"
        >
          {post.url}
        </a>
      </div>

      {/* Score Input */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="block text-xs text-white/40 mb-1.5">Points (0-100)</label>
          <input
            type="number"
            min="0"
            max="100"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="Enter score"
            className="w-full px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white placeholder-white/30 focus:border-[#00ff41]/50 focus:outline-none"
            disabled={processing}
          />
        </div>
        
        <div className="flex gap-2 pt-5">
          <button
            onClick={handleApprove}
            disabled={processing}
            className="px-4 py-2 rounded-lg bg-[#00ff41] text-black font-bold hover:bg-[#00cc33] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? '...' : '✓ Approve'}
          </button>
          <button
            onClick={handleReject}
            disabled={processing}
            className="px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 font-bold hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? '...' : '✗ Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}
