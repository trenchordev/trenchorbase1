'use client';

import Image from 'next/image';

export default function LitepaperPage() {
  const year = new Date().getFullYear();

  return (
    <div className="relative min-h-screen text-white">
      {/* Soft gradient overlay on top of global background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 left-8 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-10 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

<div
  className="
    relative z-10
    max-w-5xl
    mx-auto
    px-4 sm:px-6 lg:px-8
    py-10 lg:py-14
    transform lg:translate-x-16
  "
>

        {/* Header */}
        <header className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between mb-10 lg:mb-12 bg-black/30 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
          <div className="flex items-center gap-4">
            <div className="relative h-14 w-14 rounded-2xl bg-black/40 border border-emerald-400/40 shadow-[0_0_40px_rgba(16,185,129,0.35)] overflow-hidden">
              <Image
                src="/images/trenchor-logo.png"
                alt="Trenchor Logo"
                fill
                className="object-contain p-2"
                sizes="56px"
              />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
                Trenchor Litepaper
              </h1>
              <p className="mt-1 text-sm text-slate-300 max-w-xl">
                Onchain Trade &amp; Tax Campaign Terminal for the Virtuals ecosystem, built on Base and Virtuals Protocol.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-start md:items-end gap-2 text-xs text-slate-300">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/5 px-3 py-1 uppercase tracking-[0.16em] text-[10px] text-emerald-300">
              <span className="h-1 w-1 rounded-full bg-emerald-300" />
              v0.1 • Draft
            </div>
            <div className="space-y-1 text-[11px]">
              <p>
                <span className="text-slate-400">Website:</span>{' '}
                <a
                  href="https://www.trenchorbase.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-300 hover:text-emerald-200 underline underline-offset-2"
                >
                  trenchorbase.com
                </a>
              </p>
              <p>
                <span className="text-slate-400">X (Twitter):</span>{' '}
                <a
                  href="https://x.com/trenchorbase"
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-300 hover:text-emerald-200"
                >
                  @trenchorbase
                </a>
              </p>
              <p className="text-slate-400">
                Network: <span className="text-slate-200">Base / Virtuals Protocol</span> • Token:{' '}
                <span className="text-slate-200">$TRB</span>
              </p>
            </div>
          </div>
        </header>

        {/* Sections navigation (desktop) */}
        <nav className="sticky top-3 z-20 mb-8 hidden md:flex flex-wrap gap-3 text-[11px] text-slate-400 bg-black/40 backdrop-blur-md rounded-xl p-4 border border-white/10">
          {[
            '1. Introduction',
            '2. Background & Problem',
            '3. What is Trenchor?',
            '4. Core Use Cases',
            '5. Trenchor Token: $TRB',
            '6. Tokenomics',
            '7. Roadmap',
            '8. Vision & Disclaimer',
          ].map((label) => {
            const id = label
              .toLowerCase()
              .split('.')[1]
              .trim()
              .replace(/[^a-z0-9]+/g, '-');
            return (
              <a
                key={label}
                href={`#${id}`}
                className="rounded-full border border-white/10 bg-black/40 px-3 py-1 hover:border-emerald-400/60 hover:text-emerald-300 transition-colors"
              >
                {label}
              </a>
            );
          })}
        </nav>

        {/* Content */}
        <div className="space-y-10 lg:space-y-12 text-sm leading-relaxed text-slate-200">
          {/* 1. Introduction */}
          <section
            id="introduction"
            className="rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-black/60 to-emerald-900/10 p-8 lg:p-10 shadow-[0_18px_60px_rgba(0,0,0,0.65)] hover:border-emerald-400/40 transition-all duration-300"
          >
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-4">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/10 text-[11px] text-emerald-300">
                1
              </span>
              <span className="text-2xl">📖</span> Introduction
            </h2>
            <p className="mb-3">
              Trenchor is an onchain data and campaign platform built on the Virtuals Protocol and the Base network. It
              analyzes trading activity and Unicorn Launch taxes for tokens in the Virtuals ecosystem and transforms
              these raw onchain events into transparent leaderboards, reward campaigns and actionable insights for both
              projects and users.
            </p>
            <p className="mb-3">By focusing on trade volume and Unicorn Launch tax flows, Trenchor enables:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-500/5 border border-emerald-400/20">
                <span className="text-3xl">🏢</span>
                <div>
                  <p className="font-semibold text-emerald-300 mb-1">For Projects</p>
                  <p className="text-sm text-slate-300">Design and run onchain-native trading and tax campaigns</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-lg bg-cyan-500/5 border border-cyan-400/20">
                <span className="text-3xl">👥</span>
                <div>
                  <p className="font-semibold text-cyan-300 mb-1">For Users</p>
                  <p className="text-sm text-slate-300">Compete, plan and be rewarded based on verifiable onchain behavior</p>
                </div>
              </div>
            </div>
          </section>

          {/* 2. Background & Problem */}
          <section
            id="background-problem"
            className="rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-black/60 to-cyan-900/10 p-8 lg:p-10 shadow-lg hover:border-cyan-400/40 transition-all duration-300"
          >
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-4">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/10 text-[11px] text-emerald-300">
                2
              </span>
              <span className="text-2xl">🔍</span> Background &amp; Problem
            </h2>
            <p className="mb-3">
              The Virtuals ecosystem is growing quickly, with multiple tokens launching via the Unicorn model and
              leveraging high initial tax windows to manage volatility and speculation. However, there is currently no
              dedicated terminal that:
            </p>
            <ul className="list-disc list-inside space-y-1 mb-4 text-slate-300">
              <li>Tracks user-level trade volume across configurable time windows.</li>
              <li>Breaks down Unicorn Launch taxes on a per-wallet basis for campaigns.</li>
            </ul>
            <p className="mb-4 font-semibold text-red-400">⚠️ This creates three main problems for projects and users:</p>
            <div className="grid grid-cols-1 gap-3">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/5 border border-red-400/20">
                <span className="text-2xl flex-shrink-0">📊</span>
                <div>
                  <p className="font-semibold text-red-300 mb-1">1. Fragmented data</p>
                  <p className="text-sm text-slate-300">Onchain data is available but not structured for campaigns, leaderboards or user-specific analytics.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/5 border border-red-400/20">
                <span className="text-2xl flex-shrink-0">⚙️</span>
                <div>
                  <p className="font-semibold text-red-300 mb-1">2. No standardized campaign framework</p>
                  <p className="text-sm text-slate-300">Each project must manually design and validate trade or tax competitions, which is error-prone and time-consuming.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/5 border border-red-400/20">
                <span className="text-2xl flex-shrink-0">📱</span>
                <div>
                  <p className="font-semibold text-red-300 mb-1">3. Limited onchain mindshare tools</p>
                  <p className="text-sm text-slate-300">Most campaigns are still driven by social metrics (mentions, likes, reposts) rather than real onchain behavior.</p>
                </div>
              </div>
            </div>
          </section>

          {/* 3. What is Trenchor? */}
          <section
            id="what-is-trenchor"
            className="rounded-2xl border border-purple-400/20 bg-gradient-to-br from-black/60 to-purple-900/10 p-8 lg:p-10 shadow-lg hover:border-purple-400/40 transition-all duration-300"
          >
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-4">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/10 text-[11px] text-emerald-300">
                3
              </span>
              <span className="text-2xl">🎯</span> What is Trenchor?
            </h2>
            <p className="mb-3">
              Trenchor is a campaign and data layer for the Virtuals ecosystem. It analyzes onchain trading and launch
              tax flows for selected tokens and exposes them as:
            </p>
            <ul className="list-disc list-inside space-y-1 mb-4 text-slate-300">
              <li>User-level leaderboards.</li>
              <li>Configurable reward campaigns for partner projects.</li>
            </ul>
            <p className="mb-4 font-semibold text-purple-300">💎 The core pillars of Trenchor are:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-purple-500/5 border border-purple-400/20 hover:border-purple-400/40 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">📈</span>
                  <h4 className="font-semibold text-purple-300">Trade Volume Analytics</h4>
                </div>
                <p className="text-xs text-slate-400">Real-time tracking of trading activity</p>
              </div>
              <div className="p-4 rounded-lg bg-cyan-500/5 border border-cyan-400/20 hover:border-cyan-400/40 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🦄</span>
                  <h4 className="font-semibold text-cyan-300">Unicorn Launch Tax Analytics</h4>
                </div>
                <p className="text-xs text-slate-400">Per-wallet tax breakdown for campaigns</p>
              </div>
              <div className="p-4 rounded-lg bg-yellow-500/5 border border-yellow-400/20 hover:border-yellow-400/40 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🎁</span>
                  <h4 className="font-semibold text-yellow-300">Campaign &amp; Reward Engine</h4>
                </div>
                <p className="text-xs text-slate-400">Automated reward distribution system</p>
              </div>
              <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-400/20 hover:border-emerald-400/40 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🚀</span>
                  <h4 className="font-semibold text-emerald-300">Trencshare Platform</h4>
                </div>
                <p className="text-xs text-slate-400">Future: Onchain mindshare hub</p>
              </div>
            </div>
            <p className="mt-4 text-slate-300">
              <span className="font-medium text-slate-100">Trenchor Base</span> refers to the live platform at{' '}
              <span className="text-emerald-300">www.trenchorbase.com</span>, where users can explore live and
              historical leaderboards, projects can integrate their tokens and campaigns, and the ecosystem can monitor
              who is most active onchain.
            </p>
          </section>

          {/* 4. Core Use Cases */}
          <section
            id="core-use-cases"
            className="rounded-2xl border border-yellow-400/20 bg-gradient-to-br from-black/60 to-yellow-900/10 p-8 lg:p-10 shadow-lg hover:border-yellow-400/40 transition-all duration-300"
          >
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-4">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/10 text-[11px] text-emerald-300">
                4
              </span>
              <span className="text-2xl">💼</span> Core Use Cases
            </h2>

            <div className="space-y-6">
              <div className="border-l-4 border-yellow-400 pl-4 bg-yellow-500/5 p-4 rounded-r-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-3xl">🏆</span>
                  <h3 className="text-sm font-semibold text-yellow-300">
                    4.1 Trade Volume Campaigns
                  </h3>
                </div>
                <p className="mb-2">
                  Projects can launch Trade Volume Campaigns in partnership with Trenchor, using configurable time
                  windows and thresholds.
                </p>
                <p className="mb-2">How it works:</p>
                <ol className="list-decimal list-inside space-y-1 text-slate-300">
                  <li>
                    The project selects the token, time or block range, volume thresholds and reward logic.
                  </li>
                  <li>Trenchor indexes trades, aggregates volume per wallet and generates a public leaderboard.</li>
                  <li>
                    Users track their rank on <span className="text-emerald-300">www.trenchorbase.com</span>, adjust
                    trading behavior to climb the leaderboard and claim rewards if they meet the campaign rules.
                  </li>
                </ol>
              </div>

              <div className="border-l-4 border-purple-400 pl-4 bg-purple-500/5 p-4 rounded-r-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-3xl">🦄</span>
                  <h3 className="text-sm font-semibold text-purple-300">
                    4.2 Unicorn Launch Tax Campaigns
                  </h3>
                </div>
                <p className="mb-2">
                  For Unicorn Launch projects, Trenchor converts the first 98-minute high-tax window into a campaign
                  surface.
                </p>
                <p className="mb-2">How it works:</p>
                <ol className="list-decimal list-inside space-y-1 text-slate-300">
                  <li>
                    At launch, Trenchor tracks all relevant trades and taxes paid per wallet during the 98-minute
                    high-tax phase.
                  </li>
                  <li>
                    The project configures reward logic, for example: top wallets by total tax paid or all wallets who
                    paid at least a certain amount of tax.
                  </li>
                  <li>
                    Trenchor provides tax leaderboards and exportable lists of eligible wallets for rewards.
                  </li>
                </ol>
              </div>

              <div className="border-l-4 border-cyan-400 pl-4 bg-cyan-500/5 p-4 rounded-r-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-3xl">🚀</span>
                  <h3 className="text-sm font-semibold text-cyan-300">
                    4.3 Future: Trencshare Mindshare
                  </h3>
                </div>
                <p className="text-slate-300">
                  Long-term, Trenchor aims to evolve into <span className="font-medium text-slate-100">Trencshare</span>{' '}
                  – a platform where onchain metrics (volume, taxes, participation) become the primary signal for
                  reputation, campaign access and ecosystem incentives across Virtuals.
                </p>
              </div>
            </div>
          </section>

          {/* 5. Trenchor Token: $TRB */}
          <section
            id="trenchor-token-trb"
            className="rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-black/60 to-emerald-900/10 p-8 lg:p-10 shadow-lg hover:border-emerald-400/40 transition-all duration-300"
          >
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-4">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/10 text-[11px] text-emerald-300">
                5
              </span>
              <span className="text-2xl">💎</span> Trenchor Token: $TRB
            </h2>
            <p className="mb-3">
              <span className="font-medium text-slate-100">$TRB</span> is the native utility and incentives token of the
              Trenchor ecosystem. It powers project integrations, user access and long-term growth.
            </p>
            <p className="mb-4 font-semibold text-emerald-300">✨ Key utility dimensions:</p>
            <div className="grid grid-cols-1 gap-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-500/5 border border-emerald-400/20">
                <span className="text-3xl flex-shrink-0">💰</span>
                <div>
                  <p className="font-semibold text-emerald-300 mb-1">Project payments & collaborations</p>
                  <p className="text-sm text-slate-300">Projects pay Trenchor fees primarily in $TRB when launching campaigns. If payment is made in USDC, funds go to the treasury for $TRB buybacks, burns and incentives.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-lg bg-cyan-500/5 border border-cyan-400/20">
                <span className="text-3xl flex-shrink-0">🔐</span>
                <div>
                  <p className="font-semibold text-cyan-300 mb-1">User access & gating</p>
                  <p className="text-sm text-slate-300">Holding a minimum amount of $TRB may be required to view full leaderboards, access the Tax Terminal and unlock advanced analytics. Individual campaigns can define additional holding thresholds for reward eligibility.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-lg bg-yellow-500/5 border border-yellow-400/20">
                <span className="text-3xl flex-shrink-0">🔥</span>
                <div>
                  <p className="font-semibold text-yellow-300 mb-1">Treasury, burns & incentives</p>
                  <p className="text-sm text-slate-300">$TRB paid by projects is held in the treasury and used for controlled burn events, incentivized campaigns and long-term ecosystem growth.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-lg bg-purple-500/5 border border-purple-400/20">
                <span className="text-3xl flex-shrink-0">🤝</span>
                <div>
                  <p className="font-semibold text-purple-300 mb-1">Ecosystem alignment</p>
                  <p className="text-sm text-slate-300">$TRB aligns incentives between projects seeking onchain activations, users contributing volume and taxes, and Trenchor as the underlying infrastructure layer.</p>
                </div>
              </div>
            </div>
          </section>

          {/* 6. Tokenomics */}
          <section
            id="tokenomics"
            className="rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-black/60 to-cyan-900/10 p-8 lg:p-10 shadow-lg hover:border-cyan-400/40 transition-all duration-300"
          >
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-4">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/10 text-[11px] text-emerald-300">
                6
              </span>
              <span className="text-2xl">📊</span> Tokenomics
            </h2>
            <p className="mb-3">
              <span className="font-medium text-slate-100">Token name:</span> Trenchor &nbsp;•&nbsp;
              <span className="font-medium text-slate-100">Ticker:</span> $TRB
            </p>
            <div className="grid gap-3 text-slate-300 sm:grid-cols-2">
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-4 hover:border-emerald-400/40 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">💧</span>
                  <p className="font-medium text-emerald-300">35% – Liquidity Pool</p>
                </div>
                <p className="text-xs mt-1">For initial onchain liquidity and sustainable trading.</p>
              </div>
              <div className="rounded-xl border border-purple-400/20 bg-purple-500/5 p-4 hover:border-purple-400/40 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🎁</span>
                  <p className="font-medium text-purple-300">2% – veVIRTUAL Airdrop</p>
                </div>
                <p className="text-xs mt-1">Dedicated airdrop allocation for veVIRTUAL holders.</p>
              </div>
              <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/5 p-4 hover:border-cyan-400/40 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🌈</span>
                  <p className="font-medium text-cyan-300">3% – Ecosystem Airdrop</p>
                </div>
                <p className="text-xs mt-1">
                  For early adopters, strategic partners and community incentives.
                </p>
              </div>
              <div className="rounded-xl border border-yellow-400/20 bg-yellow-500/5 p-4 hover:border-yellow-400/40 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🏭</span>
                  <p className="font-medium text-yellow-300">25% – Automated Capital Formation (ACF)</p>
                </div>
                <p className="text-xs mt-1">
                  Supporting the Virtuals Automated Capital Formation framework.
                </p>
              </div>
              <div className="rounded-xl border border-blue-400/20 bg-blue-500/5 p-4 hover:border-blue-400/40 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">👥</span>
                  <p className="font-medium text-blue-300">25% – Team</p>
                </div>
                <p className="text-xs mt-1">
                  6 months cliff followed by 1 year of linear vesting to ensure long-term commitment.
                </p>
              </div>
              <div className="rounded-xl border border-pink-400/20 bg-pink-500/5 p-4 hover:border-pink-400/40 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🎨</span>
                  <p className="font-medium text-pink-300">0.3% – Virgen Club NFT Holders</p>
                </div>
                <p className="text-xs mt-1">
                  Special allocation for Virgen Club NFT holders as early supporters of Trenchor.
                </p>
              </div>
              <div className="rounded-xl border border-orange-400/20 bg-orange-500/5 p-4 hover:border-orange-400/40 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🔧</span>
                  <p className="font-medium text-orange-300">4% – Development Costs &amp; Technical Infrastructure</p>
                </div>
                <p className="text-xs mt-1">
                  Funding for ongoing development, technical operations and infrastructure maintenance.
                </p>
              </div>
              <div className="rounded-xl border border-red-400/20 bg-red-500/5 p-4 hover:border-red-400/40 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🎯</span>
                  <p className="font-medium text-red-300">5% – Ecosystem Campaigns &amp; Incentives and Treasury</p>
                </div>
                <p className="text-xs mt-1">
                  Reserved for campaign budgets, incentive programs and treasury-managed strategic initiatives.
                </p>
              </div>
              <div className="rounded-xl border border-slate-400/20 bg-slate-500/5 p-4 hover:border-slate-400/40 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🤝</span>
                  <p className="font-medium text-slate-300">0.7% – Partnership &amp; Marketing</p>
                </div>
                <p className="text-xs mt-1">
                  Allocated for strategic partnerships, marketing initiatives and ecosystem growth.
                </p>
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-400">Total distribution: 100%</p>
          </section>

          {/* 7. Roadmap */}
          <section
            id="roadmap"
            className="rounded-2xl border border-purple-400/20 bg-gradient-to-br from-black/60 to-purple-900/10 p-8 lg:p-10 shadow-lg hover:border-purple-400/40 transition-all duration-300"
          >
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-4">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/10 text-[11px] text-emerald-300">
                7
              </span>
              <span className="text-2xl">🗺️</span> Roadmap
            </h2>
            <div className="space-y-6">
              <div className="relative pl-8 border-l-4 border-emerald-400">
                <div className="absolute -left-3 top-6 w-6 h-6 rounded-full bg-emerald-400 flex items-center justify-center text-black font-bold text-xs">1</div>
                <div className="bg-emerald-500/5 p-4 rounded-lg border border-emerald-400/20">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">🚀</span>
                    <h3 className="text-sm font-semibold text-emerald-300">
                      Phase 1 – Launch &amp; Foundations
                    </h3>
                  </div>
                <ul className="list-disc list-inside text-slate-300 text-sm space-y-1">
                  <li>Launch $TRB via Unicorn Launch on Virtuals Protocol.</li>
                  <li>Deploy www.trenchorbase.com with Trade Volume leaderboards and Unicorn tax analytics.</li>
                  <li>Run the first native campaign for $TRB (Tax Campaign in the first 98 minutes).</li>
                </ul>
                </div>
              </div>
              <div className="relative pl-8 border-l-4 border-cyan-400">
                <div className="absolute -left-3 top-6 w-6 h-6 rounded-full bg-cyan-400 flex items-center justify-center text-black font-bold text-xs">2</div>
                <div className="bg-cyan-500/5 p-4 rounded-lg border border-cyan-400/20">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">🤝</span>
                    <h3 className="text-sm font-semibold text-cyan-300">
                      Phase 2 – Ecosystem Integrations
                    </h3>
                  </div>
                <ul className="list-disc list-inside text-slate-300 text-sm space-y-1">
                  <li>Onboard partner projects from the Virtuals ecosystem.</li>
                  <li>Offer Trade Volume Campaigns and Unicorn Tax Campaigns as a service.</li>
                  <li>Expand leaderboard features and historical campaign archives.</li>
                </ul>
                </div>
              </div>
              <div className="relative pl-8 border-l-4 border-purple-400">
                <div className="absolute -left-3 top-6 w-6 h-6 rounded-full bg-purple-400 flex items-center justify-center text-black font-bold text-xs">3</div>
                <div className="bg-purple-500/5 p-4 rounded-lg border border-purple-400/20">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">🤖</span>
                    <h3 className="text-sm font-semibold text-purple-300">
                      Phase 3 – ACP Integration &amp; Agent
                    </h3>
                  </div>
                <ul className="list-disc list-inside text-slate-300 text-sm space-y-1">
                  <li>Launch the Trenchor Agent via ACP (Agent Commerce Protocol).</li>
                  <li>Provide project-specific analytics: trade stats, tax flows and campaign performance.</li>
                </ul>
                </div>
              </div>
              <div className="relative pl-8 border-l-4 border-yellow-400">
                <div className="absolute -left-3 top-6 w-6 h-6 rounded-full bg-yellow-400 flex items-center justify-center text-black font-bold text-xs">4</div>
                <div className="bg-yellow-500/5 p-4 rounded-lg border border-yellow-400/20">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">✨</span>
                    <h3 className="text-sm font-semibold text-yellow-300">
                      Phase 4 – Toward Trencshare
                    </h3>
                  </div>
                <ul className="list-disc list-inside text-slate-300 text-sm space-y-1">
                  <li>Expand from single-token campaign views to ecosystem-wide mindshare.</li>
                  <li>Create cross-project leaderboards and reputation scores based on onchain behavior.</li>
                  <li>Transition Trenchor Base into Trencshare, a broader onchain activity platform.</li>
                </ul>
                </div>
              </div>
            </div>
          </section>

          {/* 8. Vision & Disclaimer */}
          <section
            id="vision-disclaimer"
            className="rounded-2xl border border-red-400/20 bg-gradient-to-br from-black/60 to-red-900/10 p-8 lg:p-10 shadow-lg hover:border-red-400/40 transition-all duration-300"
          >
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-4">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/10 text-[11px] text-emerald-300">
                8
              </span>
              <span className="text-2xl">🔮</span> Vision &amp; Disclaimer
            </h2>
            <div className="space-y-6">
              <div className="border-l-4 border-emerald-400 pl-4 bg-emerald-500/5 p-4 rounded-r-lg">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-3xl">🌟</span>
                  <h3 className="text-sm font-semibold text-emerald-300">Vision</h3>
                </div>
                <p className="mb-3">
                  Trenchor&apos;s long-term vision is to make onchain behavior the primary signal for campaign access, rewards
                  and reputation across the Virtuals ecosystem. By combining trade volume analytics, Unicorn tax breakdowns,
                  a flexible campaign engine and a native utility token ($TRB), Trenchor aims to become the standard layer
                  for measuring and rewarding real onchain activity.
                </p>
              </div>

              <div className="border-l-4 border-red-400 pl-4 bg-red-500/5 p-4 rounded-r-lg">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-3xl">⚠️</span>
                  <h3 className="text-sm font-semibold text-red-300">Disclaimer</h3>
                </div>
                <p className="mb-2 text-slate-300">
                  This litepaper is a conceptual and technical overview of the Trenchor project. It is not financial,
                  investment, legal or tax advice. $TRB does not represent equity, ownership or any claim on future profits
                  in Trenchor or any affiliated entity.
                </p>
                <p className="text-slate-300">
                  Token allocations, mechanisms and roadmap items described in this document may change as the project
                  evolves and as technical, regulatory and ecosystem conditions require. Users and projects are strongly
                  encouraged to conduct their own research and to comply with all applicable laws and regulations in their
                  respective jurisdictions.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer className="mt-12 border-t border-white/10 pt-6 pb-10 text-center text-[11px] text-slate-500">
          <p>&copy; {year} Trenchor. This document is a non-binding conceptual overview.</p>
        </footer>
      </div>
    </div>
  );
}
