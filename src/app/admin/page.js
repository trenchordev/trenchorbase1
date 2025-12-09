'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState('');
  const [currentBlock, setCurrentBlock] = useState(null);
  const [editingToken, setEditingToken] = useState(null);
  const [adminView, setAdminView] = useState('tokens');
  const emptyForm = {
    tokenId: '',
    tokenName: '',
    ticker: '',
    tokenAddress: '',
    lpAddress: '',
    startBlock: '',
    endBlock: '',
    imageUrl: '',
    timeline: '',
    distributionPeriod: '',
    details: '',
    campaignLinks: '',
    isFeatured: false,
  };
  const [formData, setFormData] = useState(emptyForm);
  const [featureItems, setFeatureItems] = useState([]);
  const [featureForm, setFeatureForm] = useState({
    id: '',
    name: '',
    ticker: '',
    imageUrl: '',
    timeline: '',
    distributionPeriod: '',
    details: '',
    totalReward: '',
    campaignLinks: '',
    uniqueTraders: '',
    totalSwaps: '',
    ctaUrl: '',
  });
  const [taxCampaigns, setTaxCampaigns] = useState([]);
  const [taxJobStatuses, setTaxJobStatuses] = useState({});
  const [taxForm, setTaxForm] = useState({
    id: '',
    name: '',
    targetToken: '',
    taxWallet: '',
    timeWindowMinutes: '99',
    startBlock: '',
    endBlock: '',
    logoUrl: '',
  });

  // Session check on load
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/admin/session', { cache: 'no-store', credentials: 'include' });
        const data = await res.json();
        if (data.authenticated) {
          setIsAuthenticated(true);
        }
      } catch (err) {
        console.error('Session check failed:', err);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkSession();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchTokens();
    fetchCurrentBlock();
    fetchFeatureCampaigns();
    fetchTaxCampaigns();
    fetchJobStatuses();
    
    // Poll job statuses every 10 seconds
    const interval = setInterval(() => {
      fetchJobStatuses();
    }, 10000);
    
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const safeJson = async (res) => {
    const clone = res.clone();
    try {
      return await res.json();
    } catch (err) {
      const text = await clone.text();
      throw new Error(`Invalid JSON (status ${res.status}): ${text?.slice(0, 200)}`);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await safeJson(response);
      if (!response.ok || !data.success) {
        setError(data.error || 'Login failed');
        return;
      }

      setIsAuthenticated(true);
      setPassword('');
    } catch (err) {
      setError('Unable to reach server.');
    }
  };

  const handleUnauthorized = () => {
    setIsAuthenticated(false);
    setPassword('');
    setError('Session expired. Please login again.');
    setCheckingAuth(false);
  };

  const fetchTokens = async () => {
    try {
      const res = await fetch('/api/tokens', { cache: 'no-store', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load tokens');
      const data = await safeJson(res);
      setTokens(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching tokens:', err);
    }
  };

  const fetchCurrentBlock = async () => {
    try {
      const res = await fetch('/api/admin/current-block', { cache: 'no-store', credentials: 'include' });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      const data = await safeJson(res);
      if (data?.success && data.blockNumber) {
        setCurrentBlock(data.blockNumber);
      }
    } catch (err) {
      console.error('Error fetching current block:', err);
    }
  };

  const fetchFeatureCampaigns = async () => {
    try {
      const res = await fetch('/api/admin/feature-campaigns', { cache: 'no-store', credentials: 'include' });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      const data = await safeJson(res);
      setFeatureItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching feature campaigns:', err);
    }
  };

  const fetchTaxCampaigns = async () => {
    try {
      console.log('Fetching tax campaigns...');
      const res = await fetch('/api/admin/tax-campaigns', { cache: 'no-store', credentials: 'include' });
      console.log('Tax campaigns response status:', res.status);
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      const data = await safeJson(res);
      console.log('Tax campaigns data:', data);
      setTaxCampaigns(data?.campaigns ? data.campaigns : []);
      console.log('Set tax campaigns:', data?.campaigns ? data.campaigns.length : 0);
    } catch (err) {
      console.error('Error fetching tax campaigns:', err);
    }
  };

  const handleAddFeatureCampaign = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/admin/feature-campaigns', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: featureForm.id.trim().toLowerCase().replace(/\s+/g, '-'),
          name: featureForm.name || featureForm.id,
          ticker: featureForm.ticker || undefined,
          imageUrl: featureForm.imageUrl || undefined,
          timeline: featureForm.timeline || undefined,
          distributionPeriod: featureForm.distributionPeriod || undefined,
          details: featureForm.details || undefined,
          totalReward: featureForm.totalReward || undefined,
          campaignLinks: featureForm.campaignLinks
            ? featureForm.campaignLinks.split(',').map((s) => s.trim()).filter(Boolean)
            : undefined,
          uniqueTraders: featureForm.uniqueTraders || undefined,
          totalSwaps: featureForm.totalSwaps || undefined,
          ctaUrl: featureForm.ctaUrl || undefined,
        }),
      });

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const result = await safeJson(response);
      if (result.success) {
        setFeatureForm({ id: '', name: '', ticker: '', imageUrl: '', timeline: '', distributionPeriod: '', details: '', totalReward: '', campaignLinks: '', uniqueTraders: '', totalSwaps: '', ctaUrl: '' });
        fetchFeatureCampaigns();
      } else {
        alert(result.error || 'Failed to save feature campaign');
      }
    } catch (err) {
      console.error('Error saving feature campaign:', err);
      alert('Error: ' + err.message);
    }
  };

  const handleFeatureImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Max image size 2MB');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setFeatureForm((prev) => ({ ...prev, imageUrl: reader.result }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddTaxCampaign = async (e) => {
    e.preventDefault();
    console.log('Adding tax campaign:', taxForm);
    try {
      const payload = {
        id: taxForm.id.trim().toLowerCase().replace(/\s+/g, '-'),
        name: taxForm.name || taxForm.id,
        targetToken: taxForm.targetToken.trim(),
        taxWallet: taxForm.taxWallet.trim(),
        timeWindowMinutes: parseInt(taxForm.timeWindowMinutes) || 99,
        startBlock: taxForm.startBlock ? parseInt(taxForm.startBlock) : null,
        endBlock: taxForm.endBlock ? parseInt(taxForm.endBlock) : null,
        logoUrl: taxForm.logoUrl.trim(),
      };
      console.log('Payload:', payload);

      const response = await fetch('/api/admin/tax-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      console.log('Response status:', response.status);

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const result = await safeJson(response);
      console.log('Result:', result);

      if (result.success) {
        setTaxForm({
          id: '',
          name: '',
          targetToken: '',
          taxWallet: '',
          timeWindowMinutes: '99',
          startBlock: '',
          endBlock: '',
          logoUrl: '',
        });
        await fetchTaxCampaigns();
        alert('✅ Tax campaign created successfully!\n\nClick "RUN SCRIPT" to scan blockchain and generate leaderboard.');
      } else {
        alert(result.error || 'Failed to create tax campaign');
      }
    } catch (err) {
      console.error('Error creating tax campaign:', err);
      alert('Error: ' + err.message);
    }
  };

  const handleDeleteTaxCampaign = async (id) => {
    if (!confirm(`Delete tax campaign "${id}"?`)) return;
    try {
      const response = await fetch(`/api/admin/tax-campaigns?id=${id}`, { method: 'DELETE', credentials: 'include' });
      if (response.status === 401) {
        handleUnauthorized();
        return;
      }
      const result = await safeJson(response);
      if (result.success) {
        fetchTaxCampaigns();
      }
    } catch (err) {
      console.error('Error deleting tax campaign:', err);
    }
  };

  const handleRunTaxScript = async (campaign) => {
    if (!confirm(`Run tax leaderboard scan for "${campaign.name}"?\n\nThis will scan the last ${campaign.timeWindowMinutes || 99} minutes of blockchain data.`)) return;

    setScanning(true);
    setScanProgress(`Scanning blockchain for ${campaign.name}...`);

    try {
      const response = await fetch('/api/admin/run-tax-scan', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: campaign.id }),
      });

      const data = await safeJson(response);

      if (!response.ok) {
        throw new Error(data.error || 'Scan failed');
      }

      setScanProgress('');
      setScanning(false);

      alert(`✅ Tax Leaderboard Generated!\n\n` +
        `👥 Total Users: ${data.stats.totalUsers}\n` +
        `💰 Total Tax: ${data.stats.totalTaxPaid} VIRTUAL\n` +
        `✓ Valid Transactions: ${data.stats.validTxCount}\n` +
        `⏭️ Skipped (other projects): ${data.stats.skippedTxCount}\n` +
        `📦 Blocks: ${data.stats.scannedBlocks}\n\n` +
        `View at: /tax-leaderboard/${campaign.id}`
      );

      fetchTaxCampaigns(); // Refresh to show updated stats
    } catch (err) {
      setScanProgress('');
      setScanning(false);
      alert(`❌ Error: ${err.message}`);
      console.error('Tax scan error:', err);
    }
  };

  const handleDebugTaxScan = async (campaign) => {
    if (!confirm(`Debug tax scan for "${campaign.name}"? This will show detailed information about what's being scanned.`)) return;

    setScanning(true);
    setScanProgress(`Debugging scan for ${campaign.name}...`);

    try {
      const response = await fetch('/api/admin/debug-tax-scan', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: campaign.id }),
      });

      const data = await safeJson(response);
      setScanProgress('');
      setScanning(false);

      if (!response.ok) {
        throw new Error(data.error || 'Debug failed');
      }

      // Show debug info in console and alert
      console.log('=== TAX SCAN DEBUG INFO ===');
      console.log(JSON.stringify(data.debug, null, 2));

      const d = data.debug;
      alert(`🔍 DEBUG INFO\n\n` +
        `📋 Campaign: ${d.config.name}\n` +
        `🎯 Target Token: ${d.config.targetToken}\n` +
        `💰 Tax Wallet: ${d.config.taxWallet}\n\n` +
        `📦 Block Range: ${d.blockRange.fromBlock} → ${d.blockRange.toBlock}\n` +
        `   (${d.blockRange.totalBlocks} blocks)\n\n` +
        `STEP 1 - VIRTUAL transfers to tax wallet:\n` +
        `   Found: ${d.step1_virtualToTaxWallet.count} transfers\n\n` +
        `STEP 2 - Target token check (first 5 txs):\n` +
        `   Matching: ${d.step2_targetTokenCheck.matchingTxs}\n` +
        `   Not matching: ${d.step2_targetTokenCheck.notMatchingTxs}\n\n` +
        `STEP 3 - Target token transfers in range:\n` +
        `   Found: ${d.step3_targetTokenTransfers.count} transfers\n\n` +
        `Check browser console for full details.`
      );

    } catch (err) {
      setScanProgress('');
      setScanning(false);
      alert(`❌ Debug Error: ${err.message}`);
      console.error('Debug error:', err);
    }
  };

  // Auto-scan functions
  const handleStartAutoScan = async (campaign) => {
    if (!confirm(`Start auto-scan for "${campaign.name}"?\n\nThis will continuously scan for 2940 blocks (~98 minutes) and update the leaderboard in real-time.`)) return;

    try {
      const response = await fetch('/api/admin/start-auto-scan', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: campaign.id }),
      });

      const data = await safeJson(response);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start auto-scan');
      }

      alert(`✅ Auto-Scan Started!\n\n` +
        `📦 Start Block: ${data.job.startBlock}\n` +
        `📦 End Block: ${data.job.endBlock}\n` +
        `⏱️ Duration: ~98 minutes (2940 blocks)\n\n` +
        `The system will automatically scan every minute.\n` +
        `Completion: ${data.job.estimatedCompletionTime}`
      );

      fetchTaxCampaigns();
      fetchJobStatuses();
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
      console.error('Start auto-scan error:', err);
    }
  };

  const handleStopAutoScan = async (campaign) => {
    if (!confirm(`Stop auto-scan for "${campaign.name}"?`)) return;

    try {
      const response = await fetch('/api/admin/stop-auto-scan', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: campaign.id }),
      });

      const data = await safeJson(response);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to stop auto-scan');
      }

      alert('✅ Auto-scan stopped');
      fetchTaxCampaigns();
      fetchJobStatuses();
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
      console.error('Stop auto-scan error:', err);
    }
  };

  const handleResumeAutoScan = async (campaign) => {
    if (!confirm(`Resume auto-scan for "${campaign.name}"?`)) return;

    try {
      const response = await fetch('/api/admin/resume-auto-scan', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: campaign.id }),
      });

      const data = await safeJson(response);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to resume auto-scan');
      }

      alert('✅ Auto-scan resumed');
      fetchTaxCampaigns();
      fetchJobStatuses();
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
      console.error('Resume auto-scan error:', err);
    }
  };

  const fetchJobStatuses = async () => {
    try {
      const res = await fetch('/api/admin/job-status', { 
        cache: 'no-store', 
        credentials: 'include' 
      });
      
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      
      const data = await safeJson(res);
      
      if (data.jobs) {
        const statusMap = {};
        data.jobs.forEach(job => {
          statusMap[job.campaignId] = job;
        });
        setTaxJobStatuses(statusMap);
      }
    } catch (err) {
      console.error('Error fetching job statuses:', err);
    }
  };

  const handleAddToken = async (e) => {
    e.preventDefault();
    setScanning(true);
    setScanProgress('Starting scan...');

    try {
      const response = await fetch('/api/admin/add-token', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenId: formData.tokenId.trim().toLowerCase(),
          tokenName: formData.tokenName,
          ticker: formData.ticker || undefined,
          tokenAddress: formData.tokenAddress.trim(),
          lpAddress: formData.lpAddress.trim(),
          startBlock: formData.startBlock ? parseInt(formData.startBlock) : undefined,
          endBlock: formData.endBlock ? parseInt(formData.endBlock) : undefined,
          imageUrl: formData.imageUrl || undefined,
          timeline: formData.timeline || undefined,
          distributionPeriod: formData.distributionPeriod || undefined,
          details: formData.details || undefined,
          campaignLinks: formData.campaignLinks
            ? formData.campaignLinks.split(',').map((s) => s.trim()).filter(Boolean)
            : undefined,
          isFeatured: formData.isFeatured,
        }),
      });

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const data = await safeJson(response);
      if (!response.ok || !data.success) {
        setScanProgress(`[ERROR] ${data.error || 'Failed to add token'}`);
        return;
      }

      setScanProgress(`[DONE] Traders: ${data.stats?.uniqueTraders ?? '-'} | Swaps: ${data.stats?.totalSwaps ?? '-'}`);
      setFormData({ ...emptyForm });
      fetchTokens();
    } catch (err) {
      console.error('Error adding token:', err);
      setScanProgress(`[ERROR] ${err.message}`);
    } finally {
      setScanning(false);
    }
  };

  const handleDeleteFeatureCampaign = async (id) => {
    if (!confirm(`Delete feature campaign "${id}"?`)) return;
    try {
      const response = await fetch(`/api/admin/feature-campaigns?id=${id}`, { method: 'DELETE', credentials: 'include' });
      if (response.status === 401) {
        handleUnauthorized();
        return;
      }
      const result = await response.json();
      if (result.success) {
        fetchFeatureCampaigns();
      }
    } catch (err) {
      console.error('Error deleting feature campaign:', err);
    }
  };

  // Token sil
  const handleDeleteToken = async (tokenId) => {
    if (!confirm(`Are you sure you want to delete "${tokenId}"?`)) return;

    try {
      const response = await fetch(`/api/admin/delete-token?tokenId=${tokenId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (response.ok) {
        fetchTokens();
      }
    } catch (err) {
      console.error('Error:', err);
    }
  };

  // Token güncelle (refresh)
  const handleRefreshToken = async (token) => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/add-token', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenId: token.tokenId,
          tokenName: token.tokenName,
          tokenAddress: token.tokenAddress,
          lpAddress: token.lpAddress,
          startBlock: parseInt(token.startBlock),
          imageUrl: token.imageUrl,
          timeline: token.timeline,
          distributionPeriod: token.distributionPeriod,
          details: token.details,
          campaignLinks: (() => {
            if (!token.campaignLinks) return undefined;
            try { return JSON.parse(token.campaignLinks); } catch (e) { return undefined; }
          })(),
          isFeatured: token.isFeatured === 'true',
        }),
      });

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const result = await response.json();
      if (result.success) {
        fetchTokens();
        alert(`Refreshed! ${result.stats.uniqueTraders} traders, ${result.stats.totalSwaps} swaps`);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Token düzenle
  const handleEditToken = (token) => {
    setEditingToken({
      ...token,
      newStartBlock: token.startBlock,
      newEndBlock: token.endBlock,
    });
  };

  // Düzenlemeyi kaydet
  const handleSaveEdit = async () => {
    if (!editingToken) return;

    setLoading(true);
    try {
      const response = await fetch('/api/admin/add-token', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenId: editingToken.tokenId,
          tokenName: editingToken.tokenName,
          tokenAddress: editingToken.tokenAddress,
          lpAddress: editingToken.lpAddress,
          startBlock: parseInt(editingToken.newStartBlock),
          endBlock: editingToken.newEndBlock ? parseInt(editingToken.newEndBlock) : undefined,
          imageUrl: editingToken.imageUrl,
          timeline: editingToken.timeline,
          distributionPeriod: editingToken.distributionPeriod,
          details: editingToken.details,
          campaignLinks: (() => {
            if (!editingToken.campaignLinks) return undefined;
            try { return JSON.parse(editingToken.campaignLinks); } catch (e) { return undefined; }
          })(),
          isFeatured: editingToken.isFeatured === 'true' || editingToken.isFeatured === true,
        }),
      });

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const result = await response.json();
      if (result.success) {
        fetchTokens();
        setEditingToken(null);
        alert(`Updated! ${result.stats.uniqueTraders} traders, ${result.stats.totalSwaps} swaps`);
      } else {
        alert('Error: ' + result.error);
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Logout
  const handleLogout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
    } finally {
      setIsAuthenticated(false);
      setPassword('');
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[#00ff41] font-mono animate-pulse">Checking credentials...</div>
      </div>
    );
  }

  // Login ekranı
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="border-2 border-[#00ff41] bg-black p-8 rounded-lg neon-border">
            <h1 className="text-2xl font-bold neon-text text-center mb-6">
              {'>'} ADMIN ACCESS
            </h1>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs mb-2 opacity-70 font-mono">ENTER PASSWORD</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-black border-2 border-[#00ff41]/50 px-4 py-3 font-mono focus:border-[#00ff41] outline-none rounded"
                  autoFocus
                />
              </div>

              {error && (
                <div className="text-red-500 text-sm font-mono">{error}</div>
              )}

              <button
                type="submit"
                className="w-full py-3 border-2 border-[#00ff41] bg-[#00ff41] text-black font-bold hover:bg-transparent hover:text-[#00ff41] transition-all font-mono rounded"
              >
                [ AUTHENTICATE ]
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => router.push('/')}
                className="text-xs opacity-50 hover:opacity-100 font-mono"
              >
                {'<'} Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Admin panel
  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold neon-text">{'>'} ADMIN PANEL</h1>
            <p className="text-xs opacity-50 font-mono mt-1">Token Management System</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-white/5 rounded border border-white/10 px-2 py-1">
              <button
                onClick={() => setAdminView('tokens')}
                className={`px-3 py-1 text-xs font-mono rounded ${adminView === 'tokens' ? 'bg-[#00ff41] text-black font-bold' : 'text-white/70 hover:text-white'}`}
              >
                Campaigns Terminal
              </button>
              <button
                onClick={() => setAdminView('features')}
                className={`px-3 py-1 text-xs font-mono rounded ${adminView === 'features' ? 'bg-cyan-300 text-black font-bold' : 'text-white/70 hover:text-white'}`}
              >
                Feature Campaigns
              </button>
              <button
                onClick={() => setAdminView('tax')}
                className={`px-3 py-1 text-xs font-mono rounded ${adminView === 'tax' ? 'bg-purple-400 text-black font-bold' : 'text-white/70 hover:text-white'}`}
              >
                Tax Campaigns
              </button>
            </div>
            {currentBlock && (
              <div className="text-xs font-mono bg-[#00ff41]/10 px-3 py-2 rounded border border-[#00ff41]/30">
                <span className="opacity-50">CURRENT BLOCK:</span>
                <span className="ml-2 text-[#00ff41] font-bold">{parseInt(currentBlock).toLocaleString()}</span>
              </div>
            )}
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 border border-[#00ff41]/50 hover:border-[#00ff41] text-sm font-mono rounded transition-colors"
            >
              {'<'} Dashboard
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 border border-red-500/50 hover:border-red-500 text-red-500 text-sm font-mono rounded transition-colors"
            >
              Logout
            </button>
          </div>
        </div>

        {adminView === 'tokens' && (
          <>
            <div className="border border-[#00ff41]/30 bg-black/50 rounded-lg p-6 mb-8">
              <h2 className="text-lg font-bold text-[#00ff41] mb-4">{'>'} ADD NEW TOKEN</h2>

              <form onSubmit={handleAddToken} className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs mb-1 opacity-70 font-mono">TOKEN ID (slug) *</label>
                  <input
                    type="text"
                    value={formData.tokenId}
                    onChange={(e) => setFormData({ ...formData, tokenId: e.target.value })}
                    placeholder="my-token"
                    required
                    className="w-full bg-black border border-[#00ff41]/50 px-3 py-2 font-mono text-sm focus:border-[#00ff41] outline-none rounded"
                  />
                </div>

                <div>
                  <label className="block text-xs mb-1 opacity-70 font-mono">TOKEN NAME</label>
                  <input
                    type="text"
                    value={formData.tokenName}
                    onChange={(e) => setFormData({ ...formData, tokenName: e.target.value })}
                    placeholder="My Token"
                    className="w-full bg-black border border-[#00ff41]/50 px-3 py-2 font-mono text-sm focus:border-[#00ff41] outline-none rounded"
                  />
                </div>

                <div>
                  <label className="block text-xs mb-1 opacity-70 font-mono">TICKER</label>
                  <input
                    type="text"
                    value={formData.ticker}
                    onChange={(e) => setFormData({ ...formData, ticker: e.target.value })}
                    placeholder="$BTC"
                    className="w-full bg-black border border-[#00ff41]/50 px-3 py-2 font-mono text-sm focus:border-[#00ff41] outline-none rounded"
                  />
                </div>

                <div>
                  <label className="block text-xs mb-1 opacity-70 font-mono">TOKEN ADDRESS *</label>
                  <input
                    type="text"
                    value={formData.tokenAddress}
                    onChange={(e) => setFormData({ ...formData, tokenAddress: e.target.value })}
                    placeholder="0x..."
                    required
                    className="w-full bg-black border border-[#00ff41]/50 px-3 py-2 font-mono text-sm focus:border-[#00ff41] outline-none rounded"
                  />
                </div>

                <div>
                  <label className="block text-xs mb-1 opacity-70 font-mono">LP ADDRESS *</label>
                  <input
                    type="text"
                    value={formData.lpAddress}
                    onChange={(e) => setFormData({ ...formData, lpAddress: e.target.value })}
                    placeholder="0x..."
                    required
                    className="w-full bg-black border border-[#00ff41]/50 px-3 py-2 font-mono text-sm focus:border-[#00ff41] outline-none rounded"
                  />
                </div>

                <div>
                  <label className="block text-xs mb-1 opacity-70 font-mono">START BLOCK (optional)</label>
                  <input
                    type="number"
                    value={formData.startBlock}
                    onChange={(e) => setFormData({ ...formData, startBlock: e.target.value })}
                    placeholder="Leave empty for last 10000 blocks"
                    className="w-full bg-black border border-[#00ff41]/50 px-3 py-2 font-mono text-sm focus:border-[#00ff41] outline-none rounded"
                  />
                </div>

                <div>
                  <label className="block text-xs mb-1 opacity-70 font-mono">END BLOCK (optional)</label>
                  <input
                    type="number"
                    value={formData.endBlock}
                    onChange={(e) => setFormData({ ...formData, endBlock: e.target.value })}
                    placeholder="Leave empty for current block"
                    className="w-full bg-black border border-[#00ff41]/50 px-3 py-2 font-mono text-sm focus:border-[#00ff41] outline-none rounded"
                  />
                </div>

                <div>
                  <label className="block text-xs mb-1 opacity-70 font-mono">IMAGE URL (optional)</label>
                  <input
                    type="text"
                    value={formData.imageUrl}
                    onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                    placeholder="https://..."
                    className="w-full bg-black border border-[#00ff41]/50 px-3 py-2 font-mono text-sm focus:border-[#00ff41] outline-none rounded"
                  />
                </div>

                <div>
                  <label className="block text-xs mb-1 opacity-70 font-mono">TIMELINE</label>
                  <input
                    type="text"
                    value={formData.timeline}
                    onChange={(e) => setFormData({ ...formData, timeline: e.target.value })}
                    placeholder="e.g., Phase 1 - Phase 2"
                    className="w-full bg-black border border-[#00ff41]/50 px-3 py-2 font-mono text-sm focus:border-[#00ff41] outline-none rounded"
                  />
                </div>

                <div>
                  <label className="block text-xs mb-1 opacity-70 font-mono">DISTRIBUTION PERIOD</label>
                  <input
                    type="text"
                    value={formData.distributionPeriod}
                    onChange={(e) => setFormData({ ...formData, distributionPeriod: e.target.value })}
                    placeholder="e.g., 6 weeks"
                    className="w-full bg-black border border-[#00ff41]/50 px-3 py-2 font-mono text-sm focus:border-[#00ff41] outline-none rounded"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs mb-1 opacity-70 font-mono">DETAILS</label>
                  <textarea
                    value={formData.details}
                    onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                    placeholder="Campaign or token details"
                    className="w-full bg-black border border-[#00ff41]/50 px-3 py-2 font-mono text-sm focus:border-[#00ff41] outline-none rounded"
                    rows={3}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs mb-1 opacity-70 font-mono">CAMPAIGN LINKS (comma-separated)</label>
                  <input
                    type="text"
                    value={formData.campaignLinks}
                    onChange={(e) => setFormData({ ...formData, campaignLinks: e.target.value })}
                    placeholder="https://twitter.com/... , https://..."
                    className="w-full bg-black border border-[#00ff41]/50 px-3 py-2 font-mono text-sm focus:border-[#00ff41] outline-none rounded"
                  />
                </div>

                <div className="md:col-span-2 flex items-center gap-3">
                  <input
                    id="feature-flag"
                    type="checkbox"
                    checked={formData.isFeatured}
                    onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                    className="w-4 h-4 border border-[#00ff41]/50 bg-black rounded"
                  />
                  <label htmlFor="feature-flag" className="text-sm font-mono text-white/80">Show in Feature Campaigns</label>
                </div>

                <div className="md:col-span-2">
                  <button
                    type="submit"
                    disabled={scanning}
                    className="w-full py-3 border-2 border-[#00ff41] bg-[#00ff41] text-black font-bold hover:bg-transparent hover:text-[#00ff41] transition-all font-mono rounded disabled:opacity-50"
                  >
                    {scanning ? '[ SCANNING BLOCKCHAIN... ]' : '[ ADD & SCAN TOKEN ]'}
                  </button>
                </div>

                {scanProgress && (
                  <div className="md:col-span-2 text-sm font-mono p-3 bg-white/5 rounded">
                    {scanProgress}
                  </div>
                )}
              </form>
            </div>

            {/* Token List */}
            <div className="border border-[#00ff41]/30 bg-black/50 rounded-lg p-6">
              <h2 className="text-lg font-bold text-[#00ff41] mb-4">{'>'} MANAGED TOKENS ({tokens.length})</h2>

              {tokens.length === 0 ? (
                <div className="text-center py-8 opacity-50">
                  No tokens added yet
                </div>
              ) : (
                <div className="space-y-3">
                  {tokens.map((token) => (
                    <div
                      key={token.tokenId}
                      className="p-4 border border-white/10 rounded-lg hover:border-[#00ff41]/30 transition-colors"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#00ff41]">{token.tokenName || token.tokenId}</span>
                            <span className="text-xs opacity-40 font-mono">({token.tokenId})</span>
                          </div>
                          <div className="text-xs font-mono opacity-50 mt-1">
                            <span className="text-cyan-400">TOKEN:</span> {token.tokenAddress?.slice(0, 20)}...
                            <span className="mx-2">|</span>
                            <span className="text-purple-400">LP:</span> {token.lpAddress?.slice(0, 20)}...
                          </div>
                          <div className="text-xs font-mono opacity-40 mt-1">
                            Blocks: {parseInt(token.startBlock).toLocaleString()} - {parseInt(token.endBlock).toLocaleString()} |
                            Traders: {token.uniqueTraders} |
                            Swaps: {token.totalSwaps}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditToken(token)}
                            className="px-3 py-1 text-xs border border-yellow-500/50 text-yellow-500 hover:bg-yellow-500 hover:text-black font-mono rounded transition-colors"
                          >
                            EDIT
                          </button>
                          <button
                            onClick={() => handleRefreshToken(token)}
                            disabled={loading}
                            className="px-3 py-1 text-xs border border-cyan-500/50 text-cyan-500 hover:bg-cyan-500 hover:text-black font-mono rounded transition-colors disabled:opacity-50"
                          >
                            REFRESH
                          </button>
                          <button
                            onClick={() => handleDeleteToken(token.tokenId)}
                            className="px-3 py-1 text-xs border border-red-500/50 text-red-500 hover:bg-red-500 hover:text-black font-mono rounded transition-colors"
                          >
                            DELETE
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {adminView === 'features' && (
          <div className="border border-cyan-400/30 bg-black/50 rounded-lg p-6">
            <h2 className="text-lg font-bold text-cyan-300 mb-4">{'>'} FEATURE CAMPAIGNS</h2>

            <form onSubmit={handleAddFeatureCampaign} className="grid md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs mb-1 opacity-70 font-mono">CAMPAIGN ID (slug)</label>
                <input
                  type="text"
                  value={featureForm.id}
                  onChange={(e) => setFeatureForm({ ...featureForm, id: e.target.value })}
                  placeholder="ai-chars"
                  required
                  className="w-full bg-black border border-cyan-400/50 px-3 py-2 font-mono text-sm focus:border-cyan-300 outline-none rounded"
                />
              </div>

              <div>
                <label className="block text-xs mb-1 opacity-70 font-mono">CAMPAIGN NAME</label>
                <input
                  type="text"
                  value={featureForm.name}
                  onChange={(e) => setFeatureForm({ ...featureForm, name: e.target.value })}
                  placeholder="AIChars"
                  className="w-full bg-black border border-cyan-400/50 px-3 py-2 font-mono text-sm focus:border-cyan-300 outline-none rounded"
                />
              </div>

              <div>
                <label className="block text-xs mb-1 opacity-70 font-mono">TICKER</label>
                <input
                  type="text"
                  value={featureForm.ticker}
                  onChange={(e) => setFeatureForm({ ...featureForm, ticker: e.target.value })}
                  placeholder="$AICH"
                  className="w-full bg-black border border-cyan-400/50 px-3 py-2 font-mono text-sm focus:border-cyan-300 outline-none rounded"
                />
              </div>

              <div>
                <label className="block text-xs mb-1 opacity-70 font-mono">IMAGE URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={featureForm.imageUrl}
                    onChange={(e) => setFeatureForm({ ...featureForm, imageUrl: e.target.value })}
                    placeholder="https://... or upload below"
                    className="flex-1 bg-black border border-cyan-400/50 px-3 py-2 font-mono text-sm focus:border-cyan-300 outline-none rounded"
                  />
                  <label className="px-3 py-2 text-xs border border-cyan-400/60 text-cyan-200 hover:bg-cyan-400/20 font-mono rounded cursor-pointer whitespace-nowrap">
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFeatureImageUpload}
                      className="hidden"
                    />
                  </label>
                </div>
                {featureForm.imageUrl && (
                  <div className="mt-2 text-xs font-mono text-cyan-200 break-all">Preview set</div>
                )}
              </div>

              <div>
                <label className="block text-xs mb-1 opacity-70 font-mono">TIMELINE</label>
                <input
                  type="text"
                  value={featureForm.timeline}
                  onChange={(e) => setFeatureForm({ ...featureForm, timeline: e.target.value })}
                  placeholder="e.g., Phase 1 - Phase 2"
                  className="w-full bg-black border border-cyan-400/50 px-3 py-2 font-mono text-sm focus:border-cyan-300 outline-none rounded"
                />
              </div>

              <div>
                <label className="block text-xs mb-1 opacity-70 font-mono">DISTRIBUTION PERIOD</label>
                <input
                  type="text"
                  value={featureForm.distributionPeriod}
                  onChange={(e) => setFeatureForm({ ...featureForm, distributionPeriod: e.target.value })}
                  placeholder="e.g., 6 weeks"
                  className="w-full bg-black border border-cyan-400/50 px-3 py-2 font-mono text-sm focus:border-cyan-300 outline-none rounded"
                />
              </div>

              <div>
                <label className="block text-xs mb-1 opacity-70 font-mono">TOTAL REWARD</label>
                <input
                  type="text"
                  value={featureForm.totalReward}
                  onChange={(e) => setFeatureForm({ ...featureForm, totalReward: e.target.value })}
                  placeholder="Rewards TBA"
                  className="w-full bg-black border border-cyan-400/50 px-3 py-2 font-mono text-sm focus:border-cyan-300 outline-none rounded"
                />
              </div>

              <div>
                <label className="block text-xs mb-1 opacity-70 font-mono">UNIQUE TRADERS (optional)</label>
                <input
                  type="number"
                  value={featureForm.uniqueTraders}
                  onChange={(e) => setFeatureForm({ ...featureForm, uniqueTraders: e.target.value })}
                  placeholder="0"
                  className="w-full bg-black border border-cyan-400/50 px-3 py-2 font-mono text-sm focus:border-cyan-300 outline-none rounded"
                />
              </div>

              <div>
                <label className="block text-xs mb-1 opacity-70 font-mono">TOTAL SWAPS (optional)</label>
                <input
                  type="number"
                  value={featureForm.totalSwaps}
                  onChange={(e) => setFeatureForm({ ...featureForm, totalSwaps: e.target.value })}
                  placeholder="0"
                  className="w-full bg-black border border-cyan-400/50 px-3 py-2 font-mono text-sm focus:border-cyan-300 outline-none rounded"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs mb-1 opacity-70 font-mono">DETAILS</label>
                <textarea
                  value={featureForm.details}
                  onChange={(e) => setFeatureForm({ ...featureForm, details: e.target.value })}
                  placeholder="Campaign details"
                  className="w-full bg-black border border-cyan-400/50 px-3 py-2 font-mono text-sm focus:border-cyan-300 outline-none rounded"
                  rows={3}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs mb-1 opacity-70 font-mono">CAMPAIGN LINKS (comma-separated)</label>
                <input
                  type="text"
                  value={featureForm.campaignLinks}
                  onChange={(e) => setFeatureForm({ ...featureForm, campaignLinks: e.target.value })}
                  placeholder="https://twitter.com/..., https://..."
                  className="w-full bg-black border border-cyan-400/50 px-3 py-2 font-mono text-sm focus:border-cyan-300 outline-none rounded"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs mb-1 opacity-70 font-mono">CALL TO ACTION URL (optional)</label>
                <input
                  type="text"
                  value={featureForm.ctaUrl}
                  onChange={(e) => setFeatureForm({ ...featureForm, ctaUrl: e.target.value })}
                  placeholder="https://landing.page"
                  className="w-full bg-black border border-cyan-400/50 px-3 py-2 font-mono text-sm focus:border-cyan-300 outline-none rounded"
                />
              </div>

              <div className="md:col-span-2">
                <button
                  type="submit"
                  className="w-full py-3 border-2 border-cyan-400 bg-cyan-300 text-black font-bold hover:bg-transparent hover:text-cyan-300 transition-all font-mono rounded"
                >
                  [ SAVE FEATURE CAMPAIGN ]
                </button>
              </div>
            </form>

            <div className="space-y-3">
              {featureItems.length === 0 ? (
                <div className="text-center py-8 opacity-50">No feature campaigns yet</div>
              ) : (
                featureItems.map((item) => (
                  <div key={item.id} className="p-4 border border-cyan-400/30 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded bg-white/5 border border-cyan-400/40 overflow-hidden flex items-center justify-center">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs text-white/50">IMG</span>
                        )}
                      </div>
                      <div>
                        <div className="text-cyan-300 font-bold">{item.name}</div>
                        <div className="text-xs font-mono opacity-60">/{item.id}</div>
                        <div className="text-xs font-mono opacity-50 mt-1">Traders: {item.uniqueTraders || 0} | Swaps: {item.totalSwaps || 0}</div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDeleteFeatureCampaign(item.id)}
                        className="px-3 py-1 text-xs border border-red-400/60 text-red-300 hover:bg-red-500 hover:text-black font-mono rounded transition-colors"
                      >
                        DELETE
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {adminView === 'tax' && (
          <div className="border border-purple-400/30 bg-black/50 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-purple-300">{'>'} TAX LEADERBOARD CAMPAIGNS</h2>
              <button
                onClick={async () => {
                  if (!confirm('⚠️ This will clear ALL tax campaign data from Redis. Continue?')) return;
                  try {
                    const res = await fetch('/api/admin/clear-tax-data', { method: 'POST' });
                    const data = await res.json();
                    if (data.success) {
                      alert(`✅ Cleared ${data.keys.length} keys`);
                      fetchTaxCampaigns();
                    }
                  } catch (err) {
                    alert('Error: ' + err.message);
                  }
                }}
                className="px-3 py-1 text-xs border border-red-400/60 text-red-300 hover:bg-red-500 hover:text-black font-mono rounded transition-colors"
              >
                CLEAR ALL
              </button>
            </div>

            <form onSubmit={handleAddTaxCampaign} className="grid md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs mb-1 opacity-70 font-mono">CAMPAIGN ID (slug)</label>
                <input
                  type="text"
                  value={taxForm.id}
                  onChange={(e) => setTaxForm({ ...taxForm, id: e.target.value })}
                  placeholder="wonderworld-tax"
                  required
                  className="w-full bg-black border border-purple-400/50 px-3 py-2 font-mono text-sm focus:border-purple-300 outline-none rounded"
                />
              </div>

              <div>
                <label className="block text-xs mb-1 opacity-70 font-mono">CAMPAIGN NAME</label>
                <input
                  type="text"
                  value={taxForm.name}
                  onChange={(e) => setTaxForm({ ...taxForm, name: e.target.value })}
                  placeholder="WonderWorld Tax Campaign"
                  className="w-full bg-black border border-purple-400/50 px-3 py-2 font-mono text-sm focus:border-purple-300 outline-none rounded"
                />
              </div>

              <div>
                <label className="block text-xs mb-1 opacity-70 font-mono">TARGET TOKEN ADDRESS *</label>
                <input
                  type="text"
                  value={taxForm.targetToken}
                  onChange={(e) => setTaxForm({ ...taxForm, targetToken: e.target.value })}
                  placeholder="0x..."
                  required
                  className="w-full bg-black border border-purple-400/50 px-3 py-2 font-mono text-sm focus:border-purple-300 outline-none rounded"
                />
              </div>

              <div>
                <label className="block text-xs mb-1 opacity-70 font-mono">TAX WALLET ADDRESS *</label>
                <input
                  type="text"
                  value={taxForm.taxWallet}
                  onChange={(e) => setTaxForm({ ...taxForm, taxWallet: e.target.value })}
                  placeholder="0x..."
                  required
                  className="w-full bg-black border border-purple-400/50 px-3 py-2 font-mono text-sm focus:border-purple-300 outline-none rounded"
                />
              </div>

              <div>
                <label className="block text-xs mb-1 opacity-70 font-mono">TIME WINDOW (minutes) - Auto-calculates blocks</label>
                <input
                  type="number"
                  value={taxForm.timeWindowMinutes}
                  onChange={(e) => setTaxForm({ ...taxForm, timeWindowMinutes: e.target.value })}
                  placeholder="99 (default)"
                  className="w-full bg-black border border-purple-400/50 px-3 py-2 font-mono text-sm focus:border-purple-300 outline-none rounded"
                />
              </div>

              <div>
                <label className="block text-xs mb-1 opacity-70 font-mono">START BLOCK (optional - overrides time window)</label>
                <input
                  type="number"
                  value={taxForm.startBlock}
                  onChange={(e) => setTaxForm({ ...taxForm, startBlock: e.target.value })}
                  placeholder="Leave empty to use time window"
                  className="w-full bg-black border border-purple-400/50 px-3 py-2 font-mono text-sm focus:border-purple-300 outline-none rounded"
                />
              </div>

              <div>
                <label className="block text-xs mb-1 opacity-70 font-mono">END BLOCK (optional - defaults to current block)</label>
                <input
                  type="number"
                  value={taxForm.endBlock}
                  onChange={(e) => setTaxForm({ ...taxForm, endBlock: e.target.value })}
                  placeholder="Leave empty for current block"
                  className="w-full bg-black border border-purple-400/50 px-3 py-2 font-mono text-sm focus:border-purple-300 outline-none rounded"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs mb-1 opacity-70 font-mono">LOGO URL (optional - filename only)</label>
                <input
                  type="text"
                  value={taxForm.logoUrl}
                  onChange={(e) => setTaxForm({ ...taxForm, logoUrl: e.target.value })}
                  placeholder="e.g., ploi.png (will use /images/ploi.png)"
                  className="w-full bg-black border border-purple-400/50 px-3 py-2 font-mono text-sm focus:border-purple-300 outline-none rounded"
                />
                <div className="text-[10px] opacity-50 font-mono mt-1">
                  💡 Enter filename only (e.g., ploi.png). Path will be: public/images/your-file.png
                </div>
              </div>

              <div className="md:col-span-2">
                <button
                  type="submit"
                  className="w-full py-3 border-2 border-purple-400 bg-purple-400 text-black font-bold hover:bg-transparent hover:text-purple-300 transition-all font-mono rounded"
                >
                  [ CREATE TAX CAMPAIGN ]
                </button>
              </div>
            </form>

            <div className="mb-4 p-3 bg-purple-500/10 border border-purple-400/30 rounded text-xs text-purple-200 font-mono">
              <div className="font-bold mb-1">ℹ️ How it works:</div>
              <ol className="list-decimal list-inside space-y-1 opacity-80">
                <li>Create a campaign with target token & tax wallet addresses</li>
                <li>Click "RUN SCRIPT" to scan blockchain (Base: ~2 sec/block)</li>
                <li>View live leaderboard at /tax-leaderboard/[campaign-id]</li>
                <li>Re-run anytime to update with latest data</li>
              </ol>
            </div>

            <div className="space-y-3">
              {taxCampaigns.length === 0 ? (
                <div className="text-center py-8 opacity-50">No tax campaigns yet</div>
              ) : (
                taxCampaigns.map((campaign) => {
                  const jobStatus = taxJobStatuses[campaign.id];
                  const isScanning = jobStatus?.status === 'active';
                  const isStopped = jobStatus?.status === 'stopped';
                  const isCompleted = jobStatus?.status === 'completed';
                  
                  return (
                  <div key={campaign.id} className="p-4 border border-purple-400/30 rounded-lg">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-3">
                      <div className="flex items-start gap-3 flex-1">
                        {campaign.logoUrl && (
                          <div className="w-12 h-12 rounded bg-white/5 border border-purple-400/40 overflow-hidden flex items-center justify-center flex-shrink-0">
                            <img 
                              src={`/images/${campaign.logoUrl}`} 
                              alt={campaign.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'flex';
                              }}
                            />
                            <span className="text-xs text-white/50 hidden">IMG</span>
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="text-purple-300 font-bold text-lg">{campaign.name}</div>
                            {isScanning && (
                              <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 border border-green-400/50 rounded font-mono animate-pulse">
                                🟢 SCANNING
                              </span>
                            )}
                            {isCompleted && (
                              <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 border border-blue-400/50 rounded font-mono">
                                ✓ COMPLETED
                              </span>
                            )}
                            {isStopped && (
                              <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-400/50 rounded font-mono">
                                ⏸ PAUSED
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-mono opacity-60 mb-2">/{campaign.id}</div>
                          <div className="space-y-1 text-xs font-mono">
                            <div className="text-cyan-400">Target: {campaign.targetToken?.slice(0, 10)}...{campaign.targetToken?.slice(-8)}</div>
                            <div className="text-yellow-400">Tax Wallet: {campaign.taxWallet?.slice(0, 10)}...{campaign.taxWallet?.slice(-8)}</div>
                            {campaign.logoUrl && (
                              <div className="text-pink-400">Logo: /images/{campaign.logoUrl}</div>
                            )}
                            <div className="text-white/50">
                              {campaign.startBlock && campaign.endBlock
                                ? `Blocks: ${campaign.startBlock} → ${campaign.endBlock}`
                                : `Time Window: ${campaign.timeWindowMinutes || 99} minutes`}
                            </div>
                            <div className="text-green-400">Users: {campaign.totalUsers || 0} | Total Tax: {campaign.totalTax || campaign.totalTaxPaid || '0.0000'} VIRTUAL</div>
                            
                            {jobStatus && jobStatus.stats && (
                              <div className="mt-2 p-2 bg-black/30 rounded border border-cyan-400/30">
                                <div className="text-cyan-300 font-bold mb-1">📊 Auto-Scan Progress</div>
                                <div className="space-y-0.5 text-xs">
                                  <div>Progress: {jobStatus.stats.progressPercent}% ({jobStatus.stats.scannedBlocks}/{jobStatus.stats.totalBlocks} blocks)</div>
                                  <div>Remaining: ~{jobStatus.stats.estimatedRemainingMinutes} minutes</div>
                                  <div className="w-full bg-gray-700 rounded-full h-2 mt-1">
                                    <div 
                                      className="bg-cyan-500 h-2 rounded-full transition-all duration-300"
                                      style={{ width: `${jobStatus.stats.progressPercent}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        {!isScanning && !isCompleted && (
                          <button
                            onClick={() => handleStartAutoScan(campaign)}
                            className="px-3 py-1 text-xs border border-green-400/60 text-green-300 hover:bg-green-500 hover:text-black font-mono rounded transition-colors"
                          >
                            ▶ AUTO-SCAN
                          </button>
                        )}
                        {isScanning && (
                          <button
                            onClick={() => handleStopAutoScan(campaign)}
                            className="px-3 py-1 text-xs border border-yellow-400/60 text-yellow-300 hover:bg-yellow-500 hover:text-black font-mono rounded transition-colors"
                          >
                            ⏸ STOP
                          </button>
                        )}
                        {isStopped && (
                          <button
                            onClick={() => handleResumeAutoScan(campaign)}
                            className="px-3 py-1 text-xs border border-green-400/60 text-green-300 hover:bg-green-500 hover:text-black font-mono rounded transition-colors"
                          >
                            ▶ RESUME
                          </button>
                        )}
                        <button
                          onClick={() => handleRunTaxScript(campaign)}
                          className="px-3 py-1 text-xs border border-purple-400/60 text-purple-300 hover:bg-purple-500 hover:text-black font-mono rounded transition-colors"
                        >
                          MANUAL SCAN
                        </button>
                        <button
                          onClick={() => handleDebugTaxScan(campaign)}
                          className="px-3 py-1 text-xs border border-yellow-400/60 text-yellow-300 hover:bg-yellow-500 hover:text-black font-mono rounded transition-colors"
                        >
                          DEBUG
                        </button>
                        <a
                          href={`/tax-leaderboard/${campaign.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1 text-xs border border-cyan-400/60 text-cyan-300 hover:bg-cyan-500 hover:text-black font-mono rounded transition-colors"
                        >
                          VIEW
                        </a>
                        <button
                          onClick={() => handleDeleteTaxCampaign(campaign.id)}
                          className="px-3 py-1 text-xs border border-red-400/60 text-red-300 hover:bg-red-500 hover:text-black font-mono rounded transition-colors"
                        >
                          DELETE
                        </button>
                      </div>
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editingToken && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-black border-2 border-[#00ff41] rounded-lg p-6 max-w-lg w-full">
              <h2 className="text-xl font-bold neon-text mb-4">
                {'>'} EDIT: {editingToken.tokenName || editingToken.tokenId}
              </h2>

              <div className="space-y-4">
                <div>


                  <label className="block text-xs mb-1 opacity-70 font-mono">TOKEN NAME</label>
                  <input
                    type="text"
                    value={editingToken.tokenName}
                    onChange={(e) => setEditingToken({ ...editingToken, tokenName: e.target.value })}
                    className="w-full bg-black border border-[#00ff41]/50 px-3 py-2 font-mono text-sm focus:border-[#00ff41] outline-none rounded"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs mb-1 opacity-70 font-mono">START BLOCK</label>
                    <input
                      type="number"
                      value={editingToken.newStartBlock}
                      onChange={(e) => setEditingToken({ ...editingToken, newStartBlock: e.target.value })}
                      className="w-full bg-black border border-[#00ff41]/50 px-3 py-2 font-mono text-sm focus:border-[#00ff41] outline-none rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1 opacity-70 font-mono">END BLOCK</label>
                    <input
                      type="number"
                      value={editingToken.newEndBlock}
                      onChange={(e) => setEditingToken({ ...editingToken, newEndBlock: e.target.value })}
                      placeholder={currentBlock ? `Current: ${currentBlock}` : 'Current block'}
                      className="w-full bg-black border border-[#00ff41]/50 px-3 py-2 font-mono text-sm focus:border-[#00ff41] outline-none rounded"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <input
                    id="feature-flag-edit"
                    type="checkbox"
                    checked={editingToken.isFeatured === 'true' || editingToken.isFeatured === true}
                    onChange={(e) => setEditingToken({ ...editingToken, isFeatured: e.target.checked })}
                    className="w-4 h-4 border border-[#00ff41]/50 bg-black rounded"
                  />
                  <label htmlFor="feature-flag-edit" className="text-sm font-mono text-white/80">Show in Feature Campaigns</label>
                </div>

                {currentBlock && (
                  <div className="text-xs font-mono opacity-50 p-2 bg-white/5 rounded">
                    💡 Current block: <span className="text-[#00ff41]">{parseInt(currentBlock).toLocaleString()}</span>
                    <br />
                    Leave END BLOCK empty to scan up to current block.
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingToken(null)}
                    className="flex-1 px-4 py-2 border border-white/30 hover:border-white text-sm font-mono rounded transition-colors"
                  >
                    [ CANCEL ]
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={loading}
                    className="flex-1 px-4 py-2 border-2 border-[#00ff41] bg-[#00ff41] text-black font-bold hover:bg-transparent hover:text-[#00ff41] transition-all font-mono rounded disabled:opacity-50"
                  >
                    {loading ? '[ SCANNING... ]' : '[ SAVE & RESCAN ]'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
