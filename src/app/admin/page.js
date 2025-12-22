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
  const [editingFeature, setEditingFeature] = useState(null);
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

  const [trbJob, setTrbJob] = useState(null);
  const [trbMeta, setTrbMeta] = useState({});
  const [trbForm, setTrbForm] = useState({
    startBlock: '',
    endBlock: '',
    blocksPerScan: '200',
  });

  // TrenchShare state
  const [trenchshareCampaigns, setTrenchshareCampaigns] = useState([]);
  const [trenchshareSubmissions, setTrenchshareSubmissions] = useState([]);
  const [selectedTrenchshareCampaign, setSelectedTrenchshareCampaign] = useState(null);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [trenchshareForm, setTrenchshareForm] = useState({
    name: '',
    description: '',
    startDate: '',
    endDate: '',
    maxPosts: 10,
    imageUrl: '',
  });

  const trbStatus = trbJob?.status;
  const trbHasJob = !!trbJob;
  const trbIsActive = trbStatus === 'active';
  const trbIsStopped = trbStatus === 'stopped';
  const trbIsFailed = trbStatus === 'failed';

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
    fetchTrbStatus();
    fetchTrenchshareCampaigns();

    // Poll job statuses every 10 seconds
    const interval = setInterval(() => {
      fetchJobStatuses();
      fetchTrbStatus();
    }, 4000);

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
      const data = await safeJson(res);

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load tokens');
      }

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
        setEditingFeature(null);
        fetchFeatureCampaigns();
      } else {
        alert(result.error || 'Failed to save feature campaign');
      }
    } catch (err) {
      console.error('Error saving feature campaign:', err);
      alert('Error: ' + err.message);
    }
  };

  const handleEditFeature = (item) => {
    setEditingFeature(item.id);
    let links = '';
    if (item.campaignLinks) {
      try {
        const parsed = typeof item.campaignLinks === 'string' ? JSON.parse(item.campaignLinks) : item.campaignLinks;
        links = Array.isArray(parsed) ? parsed.join(', ') : parsed;
      } catch (e) {
        links = item.campaignLinks;
      }
    }

    setFeatureForm({
      id: item.id,
      name: item.name || '',
      ticker: item.ticker || '',
      imageUrl: item.imageUrl || '',
      timeline: item.timeline || '',
      distributionPeriod: item.distributionPeriod || '',
      details: item.details || '',
      totalReward: item.totalReward || '',
      campaignLinks: links,
      uniqueTraders: item.uniqueTraders || '',
      totalSwaps: item.totalSwaps || '',
      ctaUrl: item.ctaUrl || '',
    });
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  const handleResetTaxCampaign = async (id) => {
    if (!confirm(`⚠️ RESET tax campaign "${id}"?\n\nThis will clear:\n- Leaderboard data\n- Processed transactions (duplicates)\n- Job status\n\nCampaign config will remain.`)) return;

    try {
      const response = await fetch('/api/admin/reset-tax-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ campaignId: id }),
      });

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const result = await safeJson(response);
      if (result.success) {
        alert(`✅ Reset complete. Deleted ${result.deletedKeys?.length || 0} keys.`);
        fetchTaxCampaigns();
      } else {
        alert(`❌ Reset failed: ${result.error}`);
      }
    } catch (err) {
      console.error('Error resetting tax campaign:', err);
      alert('Error: ' + err.message);
    }
  };

  const handleRunTaxScript = async (campaign) => {
    let blockInfo, totalBlocks;
    if (campaign.startBlock && campaign.endBlock) {
      totalBlocks = parseInt(campaign.endBlock) - parseInt(campaign.startBlock);
      blockInfo = `🎯 START: ${campaign.startBlock}\n🏁 END: ${campaign.endBlock}\n📊 TOTAL: ${totalBlocks} blocks`;
    } else {
      blockInfo = `⏰ Last ${campaign.timeWindowMinutes || 99} minutes\n⚠️ Results will vary each time!`;
    }

    if (!confirm(`🔍 MANUEL SCAN\n\n${blockInfo}\n\nThis will scan ALL transactions in this range.\n\nContinue?`)) return;

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

      const partialWarning = data.partial ? `\n\n⚠️ PARTIAL SCAN: ${data.warning}` : '';
      const executionInfo = data.stats.executionTime ? `\n⏱️ Execution: ${data.stats.executionTime}` : '';
      const processedInfo = data.stats.processedTxCount && data.stats.totalTxFound
        ? `\n📊 Processed: ${data.stats.processedTxCount}/${data.stats.totalTxFound} transactions`
        : '';
      const incrementalInfo = data.stats.isIncremental && data.stats.newUsersThisScan
        ? `\n➕ New users this scan: ${data.stats.newUsersThisScan}`
        : '';

      const blockScanInfo = data.stats.scannedBlocks !== data.stats.requestedBlocks
        ? `📦 ACTUALLY SCANNED: ${data.stats.scannedBlocks} (${data.stats.coveragePercentage}%)\n🎯 REQUESTED: ${data.stats.requestedBlocks}\n${data.partial ? '⚠️ PARTIAL - Not all blocks scanned!' : ''}\n`
        : `📦 Scanned Blocks: ${data.stats.scannedBlocks} (✅ 100%)\n`;

      alert(`✅ Tax Leaderboard ${data.partial ? 'Partially ' : ''}Generated!\n\n` +
        blockScanInfo +
        `👥 Total Users: ${data.stats.totalUsers}` + incrementalInfo + `\n` +
        `💰 Total Tax: ${data.stats.totalTaxPaid} VIRTUAL\n` +
        `✓ Valid Transactions: ${data.stats.validTxCount}\n` +
        `⏭️ Skipped: ${data.stats.skippedTxCount}` +
        processedInfo +
        executionInfo +
        partialWarning +
        (data.stats.isIncremental ? `\n\n✨ Incremental update: Added to existing leaderboard` : '') +
        `\n\nView at: /tax-leaderboard/${campaign.id}`
      );

      fetchTaxCampaigns(); // Refresh to show updated stats
    } catch (err) {
      setScanProgress('');
      setScanning(false);
      alert(`❌ Error: ${err.message}`);
      console.error('Tax scan error:', err);
    }
  };

  const handleFastTaxScan = async (campaign) => {
    if (!campaign.startBlock || !campaign.endBlock) {
      alert('⚠️ Please configure START and END blocks first!');
      return;
    }

    const totalBlocks = parseInt(campaign.endBlock) - parseInt(campaign.startBlock);
    const estimatedMinutes = Math.ceil(totalBlocks / 500); // ~500 blocks per 55 seconds

    if (!confirm(`🚀 FAST SCAN\n\n🎯 START: ${campaign.startBlock}\n🏁 END: ${campaign.endBlock}\n📊 TOTAL: ${totalBlocks} blocks\n\n⏱️ Estimated: ~${estimatedMinutes} minutes\n⚡ Scans ~500-1000 blocks per iteration\n\n✨ Best for historical data backfill.\n\nContinue?`)) return;

    setScanning(true);
    setScanProgress(`⚡ Fast scanning blockchain for ${campaign.name}...`);

    try {
      const response = await fetch('/api/admin/fast-tax-scan', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: campaign.id }),
      });

      const data = await safeJson(response);

      if (!response.ok) {
        throw new Error(data.error || 'Fast scan failed');
      }

      setScanProgress('');
      setScanning(false);

      const partialWarning = data.partial ? `\n\n⚠️ PARTIAL SCAN: ${data.warning}` : '';
      const speedInfo = data.stats.blocksPerSecond ? `\n⚡ Speed: ${data.stats.blocksPerSecond} blocks/sec` : '';
      const incrementalInfo = data.stats.isIncremental && data.stats.newUsersThisScan
        ? `\n➕ New users this scan: ${data.stats.newUsersThisScan}`
        : '';

      const scannedInfo = data.stats.scannedBlocks !== data.stats.requestedBlocks
        ? `📦 ACTUALLY SCANNED: ${data.stats.scannedBlocks} (${data.stats.coveragePercentage}%)\n🎯 REQUESTED: ${data.stats.requestedBlocks}\n${data.partial ? '⚠️ PARTIAL SCAN' : ''}\n`
        : `📦 Scanned Blocks: ${data.stats.scannedBlocks} (✅ 100%)\n`;

      alert(`🚀 Fast Scan ${data.partial ? 'Partially ' : ''}Completed!\n\n` +
        scannedInfo +
        `👥 Total Users: ${data.stats.totalUsers}` + incrementalInfo + `\n` +
        `💰 Total Tax: ${data.stats.totalTaxPaid} VIRTUAL\n` +
        `✓ Valid Transactions: ${data.stats.validTxCount}\n` +
        `⏭️ Skipped: ${data.stats.skippedTxCount}\n` +
        `📊 Processed: ${data.stats.processedTxCount}/${data.stats.totalTxFound} transactions\n` +
        `⏱️ Time: ${data.stats.executionTime}` +
        speedInfo +
        partialWarning +
        (data.stats.isIncremental ? `\n\n✨ Incremental update: Added to existing leaderboard` : '') +
        `\n\nView at: /tax-leaderboard/${campaign.id}`
      );

      fetchTaxCampaigns();
    } catch (err) {
      setScanProgress('');
      setScanning(false);
      alert(`❌ Error: ${err.message}`);
      console.error('Fast scan error:', err);
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
    if (!campaign.startBlock || !campaign.endBlock) {
      alert('⚠️ Please configure START and END blocks first!');
      return;
    }

    const totalBlocks = parseInt(campaign.endBlock) - parseInt(campaign.startBlock);
    const estimatedMinutes = Math.ceil(totalBlocks / 20); // 20 blocks per minute

    if (!confirm(`⚡ AUTO-SCAN (Background)\n\n🎯 START: ${campaign.startBlock}\n🏁 END: ${campaign.endBlock}\n📊 TOTAL: ${totalBlocks} blocks\n\n⏱️ Estimated: ~${estimatedMinutes} minutes\n🔄 Scans 20 blocks per minute\n\n📌 Runs in background via cron job.\n⚠️ Can resume from partial scans.\n\nStart?`)) return;

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

      const resumeEmoji = data.job.isResuming ? '🔄' : '✅';
      const resumeText = data.job.isResuming ? 'RESUMED' : 'STARTED';

      alert(`${resumeEmoji} Auto-Scan ${resumeText}!\n\n` +
        `📦 Scanning: ${data.job.startBlock} → ${data.job.endBlock}\n` +
        `📊 Total Blocks: ${data.job.totalBlocks}\n` +
        `⏱️ Estimated: ~${data.job.estimatedMinutes} minutes\n` +
        `🔄 Current: ${data.job.currentBlock}\n\n` +
        (data.job.isResuming ? `♻️ Continuing from previous partial scan\n\n` : '') +
        `The system will automatically scan every minute.\n` +
        `Check progress below!`
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

  const fetchTrbStatus = async () => {
    try {
      const res = await fetch('/api/admin/trb-lp-scan/status', {
        cache: 'no-store',
        credentials: 'include',
      });

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      const data = await safeJson(res);
      if (data.ok) {
        setTrbJob(data.job || null);
        setTrbMeta(data.meta || {});
      }
    } catch (err) {
      console.error('Error fetching TRB status:', err);
    }
  };

  // TrenchShare Functions
  const fetchTrenchshareCampaigns = async () => {
    try {
      const res = await fetch('/api/admin/trenchshare-campaigns', {
        cache: 'no-store',
        credentials: 'include',
      });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      const data = await safeJson(res);
      console.log('Fetched campaigns:', data.campaigns);

      // Apply localStorage overrides
      const campaigns = (data.campaigns || []).map(campaign => {
        const override = localStorage.getItem(`campaign_${campaign.id}_active`);
        if (override !== null) {
          return { ...campaign, active: override === 'true' };
        }
        return campaign;
      });

      setTrenchshareCampaigns(campaigns);
    } catch (err) {
      console.error('Error fetching TrenchShare campaigns:', err);
    }
  };

  const fetchTrenchshareSubmissions = async (campaignId) => {
    try {
      const res = await fetch(`/api/admin/trenchshare-submissions?campaignId=${campaignId}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      const data = await safeJson(res);
      setTrenchshareSubmissions(data.submissions || []);
    } catch (err) {
      console.error('Error fetching submissions:', err);
    }
  };

  const handleCreateTrenchshareCampaign = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/trenchshare-campaigns', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trenchshareForm),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to create campaign');
      alert('✅ Campaign created!');
      setTrenchshareForm({ name: '', description: '', startDate: '', endDate: '', maxPosts: 10, imageUrl: '' });
      fetchTrenchshareCampaigns();
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    }
  };

  const handleToggleTrenchshareCampaign = async (campaign) => {
    const newActive = !campaign.active;

    try {
      console.log('Toggling campaign:', campaign.id, 'from', campaign.active, 'to', newActive);

      // Store in localStorage FIRST
      localStorage.setItem(`campaign_${campaign.id}_active`, newActive.toString());

      // Update local state immediately
      setTrenchshareCampaigns(prev =>
        prev.map(c => c.id === campaign.id ? { ...c, active: newActive } : c)
      );

      // Try to update Redis in background (don't wait)
      fetch('/api/admin/trenchshare-campaigns', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: campaign.id, active: newActive }),
      }).catch(err => console.error('Background update failed:', err));

    } catch (err) {
      console.error('Toggle error:', err);
      alert(`❌ Error: ${err.message}`);
    }
  };

  const handleDeleteTrenchshareCampaign = async (campaignId) => {
    if (!confirm('Are you sure you want to delete this campaign and all its submissions?')) return;
    try {
      const res = await fetch(`/api/admin/trenchshare-campaigns?id=${campaignId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to delete campaign');
      alert('✅ Campaign deleted!');
      fetchTrenchshareCampaigns();
      if (selectedTrenchshareCampaign?.id === campaignId) {
        setSelectedTrenchshareCampaign(null);
        setTrenchshareSubmissions([]);
      }
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    }
  };

  const handleEditCampaign = (campaign) => {
    // Convert ISO dates to datetime-local format
    const formatDateTime = (isoString) => {
      const date = new Date(isoString);
      return date.toISOString().slice(0, 16);
    };

    setEditingCampaign({
      id: campaign.id,
      name: campaign.name,
      description: campaign.description || '',
      startDate: formatDateTime(campaign.startDate),
      endDate: formatDateTime(campaign.endDate),
      maxPosts: campaign.maxPosts,
      imageUrl: campaign.imageUrl || '',
    });
  };

  const handleUpdateCampaign = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/trenchshare-campaigns', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingCampaign),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to update campaign');
      alert('✅ Campaign updated!');
      setEditingCampaign(null);
      fetchTrenchshareCampaigns();
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    }
  };

  const handleUpdateSubmission = async (campaignId, wallet, status, points) => {
    try {
      const res = await fetch('/api/admin/trenchshare-submissions', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, wallet, status, points: parseInt(points) }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to update submission');
      fetchTrenchshareSubmissions(campaignId);
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    }
  };

  const handleStartTrbScan = async () => {
    try {
      const payload = {
        startBlock: trbForm.startBlock ? parseInt(trbForm.startBlock, 10) : undefined,
        endBlock: trbForm.endBlock ? parseInt(trbForm.endBlock, 10) : undefined,
        blocksPerScan: trbForm.blocksPerScan ? parseInt(trbForm.blocksPerScan, 10) : undefined,
      };

      if (!payload.startBlock || Number.isNaN(payload.startBlock)) {
        alert('❌ startBlock is required');
        return;
      }

      const res = await fetch('/api/admin/trb-lp-scan/start', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await safeJson(res);
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to start TRB scan job');
      }

      alert('✅ TRB scan job started');
      fetchTrbStatus();
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    }
  };

  const handleStopTrbScan = async () => {
    if (!confirm('Stop TRB scan job?')) return;
    try {
      const res = await fetch('/api/admin/trb-lp-scan/stop', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await safeJson(res);
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to stop TRB scan job');
      }
      alert('✅ TRB scan job stopped');
      fetchTrbStatus();
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    }
  };

  const handleResumeTrbScan = async () => {
    try {
      const res = await fetch('/api/admin/trb-lp-scan/resume', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await safeJson(res);
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to resume TRB scan job');
      }
      alert('✅ TRB scan job resumed');
      fetchTrbStatus();
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    }
  };

  const handleRunTrbOnce = async () => {
    try {
      if (!trbIsActive) {
        alert('❌ TRB scan job must be ACTIVE to run once');
        return;
      }

      const res = await fetch('/api/admin/trb-lp-scan/run-once', {
        method: 'POST',
        credentials: 'include',
      });

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      const data = await safeJson(res);
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || data?.message || 'Failed to run scan');
      }

      const scanned = data?.scanned;
      if (scanned?.fromBlock && scanned?.toBlock) {
        alert(`✅ Scan done: ${scanned.fromBlock} → ${scanned.toBlock} (processed ${scanned.processedTransfers || 0})`);
      } else {
        alert(`✅ ${data?.message || 'Scan executed'}`);
      }

      fetchTrbStatus();
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    }
  };

  const handleResetTrbScan = async () => {
    if (!confirm('Reset TRB LP scan data? This will clear leaderboard + tx counts + seen cache and remove the job.')) return;
    try {
      const res = await fetch('/api/admin/trb-lp-scan/reset', {
        method: 'POST',
        credentials: 'include',
      });

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      const data = await safeJson(res);
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to reset TRB scan data');
      }

      alert(`✅ Reset complete. Deleted keys: ${data.deleted || 0}`);
      fetchTrbStatus();
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
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
        if (editingFeature === id) {
          setEditingFeature(null);
          setFeatureForm({ id: '', name: '', ticker: '', imageUrl: '', timeline: '', distributionPeriod: '', details: '', totalReward: '', campaignLinks: '', uniqueTraders: '', totalSwaps: '', ctaUrl: '' });
        }
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
              <button
                onClick={() => setAdminView('trb')}
                className={`px-3 py-1 text-xs font-mono rounded ${adminView === 'trb' ? 'bg-[#00ff41] text-black font-bold' : 'text-white/70 hover:text-white'}`}
              >
                TRB LP Scan
              </button>
              <button
                onClick={() => setAdminView('trenchshare')}
                className={`px-3 py-1 text-xs font-mono rounded ${adminView === 'trenchshare' ? 'bg-pink-400 text-black font-bold' : 'text-white/70 hover:text-white'}`}
              >
                TrenchShare
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
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-cyan-300">{'>'} {editingFeature ? 'EDIT' : 'ADD'} FEATURE CAMPAIGN</h2>
              {editingFeature && (
                <button
                  onClick={() => {
                    setEditingFeature(null);
                    setFeatureForm({ id: '', name: '', ticker: '', imageUrl: '', timeline: '', distributionPeriod: '', details: '', totalReward: '', campaignLinks: '', uniqueTraders: '', totalSwaps: '', ctaUrl: '' });
                  }}
                  className="px-3 py-1 text-xs border border-white/30 text-white/70 hover:bg-white/10 font-mono rounded"
                >
                  CANCEL EDIT
                </button>
              )}
            </div>

            <form onSubmit={handleAddFeatureCampaign} className="grid md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs mb-1 opacity-70 font-mono">CAMPAIGN ID (slug)</label>
                <input
                  type="text"
                  value={featureForm.id}
                  onChange={(e) => setFeatureForm({ ...featureForm, id: e.target.value })}
                  placeholder="ai-chars"
                  required
                  disabled={!!editingFeature}
                  className={`w-full bg-black border border-cyan-400/50 px-3 py-2 font-mono text-sm focus:border-cyan-300 outline-none rounded ${editingFeature ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                  [ {editingFeature ? 'UPDATE' : 'SAVE'} FEATURE CAMPAIGN ]
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
                        onClick={() => handleEditFeature(item)}
                        className="px-3 py-1 text-xs border border-yellow-400/60 text-yellow-300 hover:bg-yellow-500 hover:text-black font-mono rounded transition-colors"
                      >
                        EDIT
                      </button>
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
                <div className="text-[10px] opacity-50 font-mono mt-1">
                  ⚠️ For consistent results, always specify BOTH start and end block
                </div>
              </div>

              <div>
                <label className="block text-xs mb-1 opacity-70 font-mono">END BLOCK (optional - for fixed range)</label>
                <input
                  type="number"
                  value={taxForm.endBlock}
                  onChange={(e) => setTaxForm({ ...taxForm, endBlock: e.target.value })}
                  placeholder="Leave empty to auto-calculate (+2950 blocks)"
                  className="w-full bg-black border border-purple-400/50 px-3 py-2 font-mono text-sm focus:border-purple-300 outline-none rounded"
                />
                <div className="text-[10px] opacity-50 font-mono mt-1">
                  💡 If empty and startBlock given, will use startBlock + 2950 blocks (98 min)
                </div>
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
                <li>Click RUN SCRIPT to scan blockchain (Base: ~2 sec/block)</li>
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
                            <>
                              <button
                                onClick={() => handleFastTaxScan(campaign)}
                                className="px-3 py-1 text-xs border border-orange-400/60 text-orange-300 hover:bg-orange-500 hover:text-black font-mono rounded transition-colors font-bold"
                              >
                                🚀 FAST SCAN
                              </button>
                              <button
                                onClick={() => handleStartAutoScan(campaign)}
                                className="px-3 py-1 text-xs border border-green-400/60 text-green-300 hover:bg-green-500 hover:text-black font-mono rounded transition-colors"
                              >
                                ▶ AUTO-SCAN
                              </button>
                            </>
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
                            onClick={() => handleResetTaxCampaign(campaign.id)}
                            className="px-3 py-1 text-xs border border-orange-400/60 text-orange-300 hover:bg-orange-500 hover:text-black font-mono rounded transition-colors"
                          >
                            RESET DATA
                          </button>
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

        {adminView === 'trb' && (
          <>
            <div className="border border-[#00ff41]/30 bg-black/50 rounded-lg p-6 mb-8">
              <h2 className="text-lg font-bold text-[#00ff41] mb-4">{'>'} TRB LP-LIKE SCANNER</h2>
              <p className="text-xs text-white/60 font-mono mb-4">
                Start a scan job, then call /api/cron/trb-lp-scanner from cron-job.org.
              </p>

              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs mb-1 opacity-70 font-mono">START BLOCK *</label>
                  <input
                    type="number"
                    value={trbForm.startBlock}
                    onChange={(e) => setTrbForm({ ...trbForm, startBlock: e.target.value })}
                    placeholder="e.g. 20000000"
                    className="w-full bg-black border border-[#00ff41]/50 px-3 py-2 font-mono text-sm focus:border-[#00ff41] outline-none rounded"
                  />
                </div>

                <div>
                  <label className="block text-xs mb-1 opacity-70 font-mono">END BLOCK (optional)</label>
                  <input
                    type="number"
                    value={trbForm.endBlock}
                    onChange={(e) => setTrbForm({ ...trbForm, endBlock: e.target.value })}
                    placeholder="leave blank for ongoing"
                    className="w-full bg-black border border-[#00ff41]/50 px-3 py-2 font-mono text-sm focus:border-[#00ff41] outline-none rounded"
                  />
                </div>

                <div>
                  <label className="block text-xs mb-1 opacity-70 font-mono">BLOCKS PER SCAN</label>
                  <input
                    type="number"
                    value={trbForm.blocksPerScan}
                    onChange={(e) => setTrbForm({ ...trbForm, blocksPerScan: e.target.value })}
                    className="w-full bg-black border border-[#00ff41]/50 px-3 py-2 font-mono text-sm focus:border-[#00ff41] outline-none rounded"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3 mt-5">
                <button
                  onClick={handleStartTrbScan}
                  className="px-4 py-2 bg-[#00ff41] text-black font-bold font-mono text-xs rounded hover:opacity-90"
                >
                  START JOB
                </button>
                <button
                  onClick={handleRunTrbOnce}
                  disabled={!trbIsActive}
                  className={`px-4 py-2 border text-cyan-200 font-mono text-xs rounded ${trbIsActive ? 'border-cyan-300/50 hover:border-cyan-300' : 'border-cyan-300/20 opacity-50 cursor-not-allowed'}`}
                >
                  RUN ONCE
                </button>
                <button
                  onClick={handleResumeTrbScan}
                  disabled={!trbHasJob || !(trbIsStopped || trbIsFailed)}
                  className={`px-4 py-2 border text-white font-mono text-xs rounded ${trbHasJob && (trbIsStopped || trbIsFailed) ? 'border-[#00ff41]/50 hover:border-[#00ff41]' : 'border-[#00ff41]/20 opacity-50 cursor-not-allowed'}`}
                >
                  RESUME
                </button>
                <button
                  onClick={handleStopTrbScan}
                  disabled={!trbIsActive}
                  className={`px-4 py-2 border text-red-400 font-mono text-xs rounded ${trbIsActive ? 'border-red-500/50 hover:border-red-500' : 'border-red-500/20 opacity-50 cursor-not-allowed'}`}
                >
                  STOP
                </button>
                <button
                  onClick={handleResetTrbScan}
                  className="px-4 py-2 border border-red-500/40 hover:border-red-500 text-red-300 font-mono text-xs rounded"
                >
                  RESET / CLEAR
                </button>
                <button
                  onClick={fetchTrbStatus}
                  className="px-4 py-2 border border-white/20 hover:border-white/40 text-white/80 font-mono text-xs rounded"
                >
                  REFRESH
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="border border-white/10 bg-black/30 rounded-lg p-5">
                <h3 className="text-sm font-bold text-white mb-3 font-mono">JOB STATUS</h3>
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between"><span className="text-white/50">status</span><span className="text-white">{trbJob?.status || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-white/50">startBlock</span><span className="text-white">{trbJob?.startBlock || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-white/50">currentBlock</span><span className="text-white">{trbJob?.currentBlock || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-white/50">endBlock</span><span className="text-white">{trbJob?.endBlock || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-white/50">lastScanAt</span><span className="text-white">{trbJob?.lastScanAt ? new Date(trbJob.lastScanAt).toLocaleString() : '-'}</span></div>
                  <div className="flex justify-between"><span className="text-white/50">lastError</span><span className="text-red-400 truncate max-w-[60%]">{trbJob?.lastError || '-'}</span></div>
                </div>
              </div>

              <div className="border border-white/10 bg-black/30 rounded-lg p-5">
                <h3 className="text-sm font-bold text-white mb-3 font-mono">LEADERBOARD META</h3>
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between"><span className="text-white/50">lpLikeAddress</span><span className="text-white truncate max-w-[60%]">{trbMeta?.lpLikeAddress || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-white/50">lastScanned</span><span className="text-white">{trbMeta?.lastScannedFrom ? `${trbMeta.lastScannedFrom} → ${trbMeta.lastScannedTo}` : '-'}</span></div>
                  <div className="flex justify-between"><span className="text-white/50">totalBuysTrb</span><span className="text-[#00ff41]">{trbMeta?.totalBuysTrb || '0'}</span></div>
                  <div className="flex justify-between"><span className="text-white/50">totalSellsTrb</span><span className="text-cyan-300">{trbMeta?.totalSellsTrb || '0'}</span></div>
                  <div className="flex justify-between"><span className="text-white/50">lastUpdated</span><span className="text-white">{trbMeta?.lastUpdated ? new Date(parseInt(trbMeta.lastUpdated, 10)).toLocaleString() : '-'}</span></div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* TrenchShare Admin Panel */}
        {adminView === 'trenchshare' && (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-pink-400 font-mono">TrenchShare Campaign Management</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push('/admin/review-tweets')}
                  className="flex items-center gap-2 px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white font-bold text-sm font-mono rounded transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  REVIEW TWEETS
                </button>
                <button
                  onClick={fetchTrenchshareCampaigns}
                  className="px-4 py-2 bg-pink-500/20 border border-pink-500/50 text-pink-400 text-sm font-mono rounded hover:bg-pink-500/30 transition"
                >
                  REFRESH
                </button>
              </div>
            </div>

            {/* Create Campaign Form */}
            <div className="border border-pink-500/30 bg-black/30 rounded-lg p-6 mb-6">
              <h3 className="text-sm font-bold text-white mb-4 font-mono">CREATE NEW CAMPAIGN</h3>
              <form onSubmit={handleCreateTrenchshareCampaign} className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-white/50 mb-1 font-mono">Campaign Name</label>
                  <input
                    type="text"
                    value={trenchshareForm.name}
                    onChange={(e) => setTrenchshareForm({ ...trenchshareForm, name: e.target.value })}
                    placeholder="TrenchShare 1"
                    required
                    className="w-full bg-black/50 border border-white/20 rounded px-3 py-2 text-sm text-white font-mono focus:border-pink-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1 font-mono">Description (optional)</label>
                  <input
                    type="text"
                    value={trenchshareForm.description}
                    onChange={(e) => setTrenchshareForm({ ...trenchshareForm, description: e.target.value })}
                    placeholder="Share about $TRB on X, earn points!"
                    className="w-full bg-black/50 border border-white/20 rounded px-3 py-2 text-sm text-white font-mono focus:border-pink-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1 font-mono">Start Date & Time</label>
                  <input
                    type="datetime-local"
                    value={trenchshareForm.startDate}
                    onChange={(e) => setTrenchshareForm({ ...trenchshareForm, startDate: e.target.value })}
                    required
                    className="w-full bg-black/50 border border-white/20 rounded px-3 py-2 text-sm text-white font-mono focus:border-pink-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1 font-mono">End Date & Time</label>
                  <input
                    type="datetime-local"
                    value={trenchshareForm.endDate}
                    onChange={(e) => setTrenchshareForm({ ...trenchshareForm, endDate: e.target.value })}
                    required
                    className="w-full bg-black/50 border border-white/20 rounded px-3 py-2 text-sm text-white font-mono focus:border-pink-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1 font-mono">Max Posts Per User</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={trenchshareForm.maxPosts}
                    onChange={(e) => setTrenchshareForm({ ...trenchshareForm, maxPosts: parseInt(e.target.value) })}
                    className="w-full bg-black/50 border border-white/20 rounded px-3 py-2 text-sm text-white font-mono focus:border-pink-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1 font-mono">Image URL (optional)</label>
                  <input
                    type="text"
                    value={trenchshareForm.imageUrl}
                    onChange={(e) => setTrenchshareForm({ ...trenchshareForm, imageUrl: e.target.value })}
                    placeholder="/images/trenchshare1.png"
                    className="w-full bg-black/50 border border-white/20 rounded px-3 py-2 text-sm text-white font-mono focus:border-pink-500 outline-none"
                  />
                  <p className="text-xs text-white/30 mt-1 font-mono">Dosya yolu: /images/dosyaadi.png (public/images/ klasöründen)</p>
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white font-bold text-sm font-mono rounded transition"
                  >
                    CREATE CAMPAIGN
                  </button>
                </div>
              </form>
            </div>

            {/* Campaigns List */}
            <div className="border border-white/10 bg-black/30 rounded-lg p-6 mb-6">
              <h3 className="text-sm font-bold text-white mb-4 font-mono">CAMPAIGNS</h3>
              {trenchshareCampaigns.length === 0 ? (
                <p className="text-white/50 text-sm font-mono">No campaigns yet.</p>
              ) : (
                <div className="space-y-3">
                  {trenchshareCampaigns.map((campaign) => (
                    <div
                      key={campaign.id}
                      className={`border rounded-lg p-4 transition ${selectedTrenchshareCampaign?.id === campaign.id
                        ? 'border-pink-500 bg-pink-500/10'
                        : 'border-white/10 hover:border-white/30'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <div
                          className="cursor-pointer flex-1"
                          onClick={() => {
                            setSelectedTrenchshareCampaign(campaign);
                            fetchTrenchshareSubmissions(campaign.id);
                          }}
                        >
                          <div className="flex items-center gap-3">
                            {campaign.imageUrl && (
                              <div className="w-8 h-8 rounded bg-[#00ff41]/10 border border-[#00ff41]/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                                <img
                                  src={campaign.imageUrl}
                                  alt={campaign.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                            <span className="text-white font-bold font-mono">{campaign.name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${campaign.active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                              {campaign.active ? 'ACTIVE' : 'INACTIVE'}
                            </span>
                          </div>
                          <p className="text-xs text-white/50 mt-1 font-mono">
                            {new Date(campaign.startDate).toLocaleDateString('en-US')} - {new Date(campaign.endDate).toLocaleDateString('en-US')} | {campaign.participantCount} participants
                          </p>
                        </div>
                        <div className="flex items-center gap-2 relative z-10">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditCampaign(campaign);
                            }}
                            className="px-3 py-1 text-xs font-mono rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                          >
                            EDIT
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleTrenchshareCampaign(campaign);
                            }}
                            className={`px-3 py-1 text-xs font-mono rounded transition-colors ${campaign.active ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}`}
                          >
                            {campaign.active ? 'DEACTIVATE' : 'ACTIVATE'}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTrenchshareCampaign(campaign.id);
                            }}
                            className="px-3 py-1 text-xs font-mono rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
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

            {/* Edit Campaign Modal */}
            {editingCampaign && (
              <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-[#0a0a0a] border border-pink-500/50 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-white font-mono">EDIT CAMPAIGN</h3>
                    <button
                      onClick={() => setEditingCampaign(null)}
                      className="text-white/50 hover:text-white transition-colors"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <form onSubmit={handleUpdateCampaign} className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-white/50 mb-1 font-mono">Campaign Name</label>
                      <input
                        type="text"
                        value={editingCampaign.name}
                        onChange={(e) => setEditingCampaign({ ...editingCampaign, name: e.target.value })}
                        required
                        className="w-full bg-black/50 border border-white/20 rounded px-3 py-2 text-sm text-white font-mono focus:border-pink-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-white/50 mb-1 font-mono">Description (optional)</label>
                      <input
                        type="text"
                        value={editingCampaign.description}
                        onChange={(e) => setEditingCampaign({ ...editingCampaign, description: e.target.value })}
                        className="w-full bg-black/50 border border-white/20 rounded px-3 py-2 text-sm text-white font-mono focus:border-pink-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-white/50 mb-1 font-mono">Start Date & Time</label>
                      <input
                        type="datetime-local"
                        value={editingCampaign.startDate}
                        onChange={(e) => setEditingCampaign({ ...editingCampaign, startDate: e.target.value })}
                        required
                        className="w-full bg-black/50 border border-white/20 rounded px-3 py-2 text-sm text-white font-mono focus:border-pink-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-white/50 mb-1 font-mono">End Date & Time</label>
                      <input
                        type="datetime-local"
                        value={editingCampaign.endDate}
                        onChange={(e) => setEditingCampaign({ ...editingCampaign, endDate: e.target.value })}
                        required
                        className="w-full bg-black/50 border border-white/20 rounded px-3 py-2 text-sm text-white font-mono focus:border-pink-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-white/50 mb-1 font-mono">Max Posts Per User</label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={editingCampaign.maxPosts}
                        onChange={(e) => setEditingCampaign({ ...editingCampaign, maxPosts: parseInt(e.target.value) })}
                        className="w-full bg-black/50 border border-white/20 rounded px-3 py-2 text-sm text-white font-mono focus:border-pink-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-white/50 mb-1 font-mono">Image URL (optional)</label>
                      <input
                        type="text"
                        value={editingCampaign.imageUrl}
                        onChange={(e) => setEditingCampaign({ ...editingCampaign, imageUrl: e.target.value })}
                        placeholder="/images/trenchshare1.png"
                        className="w-full bg-black/50 border border-white/20 rounded px-3 py-2 text-sm text-white font-mono focus:border-pink-500 outline-none"
                      />
                    </div>
                    <div className="md:col-span-2 flex gap-3">
                      <button
                        type="button"
                        onClick={() => setEditingCampaign(null)}
                        className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-sm font-mono rounded transition"
                      >
                        CANCEL
                      </button>
                      <button
                        type="submit"
                        className="flex-1 px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white font-bold text-sm font-mono rounded transition"
                      >
                        UPDATE CAMPAIGN
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Submissions for Selected Campaign */}
            {selectedTrenchshareCampaign && (
              <div className="border border-pink-500/30 bg-black/30 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white font-mono">
                    {selectedTrenchshareCampaign.name} - SUBMISSIONS
                  </h3>
                  <button
                    onClick={() => fetchTrenchshareSubmissions(selectedTrenchshareCampaign.id)}
                    className="px-3 py-1 text-xs font-mono rounded bg-pink-500/20 text-pink-400"
                  >
                    REFRESH
                  </button>
                </div>
                {trenchshareSubmissions.length === 0 ? (
                  <p className="text-white/50 text-sm font-mono">No submissions yet.</p>
                ) : (
                  <div className="space-y-4 max-h-[500px] overflow-y-auto">
                    {trenchshareSubmissions.map((sub, idx) => (
                      <div key={idx} className="border border-white/10 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="text-white font-mono text-sm">{sub.wallet.slice(0, 6)}...{sub.wallet.slice(-4)}</p>
                            <p className="text-xs text-white/50 font-mono">{new Date(sub.submittedAt).toLocaleString('en-US')}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded ${sub.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                              sub.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                                'bg-yellow-500/20 text-yellow-400'
                              }`}>
                              {sub.status === 'approved' ? 'APPROVED' : sub.status === 'rejected' ? 'REJECTED' : 'PENDING'}
                            </span>
                            <span className="text-xs text-purple-400 font-mono">{sub.points} Points</span>
                          </div>
                        </div>
                        <div className="space-y-1 mb-3">
                          {sub.posts.map((post, pIdx) => {
                            let postUrl = '';
                            if (typeof post === 'string') {
                              postUrl = post;
                            } else if (post && typeof post === 'object') {
                              // Ensure url is a string, otherwise stringify the object to debug
                              postUrl = typeof post.url === 'string' ? post.url : JSON.stringify(post);
                            }

                            return (
                              <a
                                key={pIdx}
                                href={typeof postUrl === 'string' && postUrl.startsWith('http') ? postUrl : '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block text-xs text-cyan-400 hover:underline font-mono truncate"
                              >
                                {postUrl}
                              </a>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            placeholder="Points"
                            defaultValue={sub.points}
                            className="w-20 bg-black/50 border border-white/20 rounded px-2 py-1 text-xs text-white font-mono"
                            id={`points-${idx}`}
                          />
                          <button
                            onClick={() => {
                              const points = document.getElementById(`points-${idx}`).value;
                              handleUpdateSubmission(selectedTrenchshareCampaign.id, sub.wallet, 'approved', points);
                            }}
                            className="px-3 py-1 text-xs font-mono rounded bg-green-500/20 text-green-400 hover:bg-green-500/30"
                          >
                            APPROVE
                          </button>
                          <button
                            onClick={() => handleUpdateSubmission(selectedTrenchshareCampaign.id, sub.wallet, 'rejected', 0)}
                            className="px-3 py-1 text-xs font-mono rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
                          >
                            REJECT
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
