'use client';

import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center relative overflow-x-hidden">

      {/* Dynamic Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#00ff41]/5 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[20%] right-[-5%] w-[400px] h-[400px] bg-cyan-500/5 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-12 w-full flex flex-col justify-center items-center min-h-screen">

        {/* Hero Section */}
        <div className="text-center relative pt-20">

          {/* Status Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00ff41]/5 border border-[#00ff41]/20 mb-8 backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00ff41] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00ff41]"></span>
            </span>
            <span className="text-xs font-medium text-[#00ff41] tracking-widest uppercase">SYSTEM ONLINE</span>
          </div>

          <h1 className="text-6xl md:text-8xl lg:text-9xl font-bold mb-8 tracking-tight leading-none bg-clip-text text-transparent bg-gradient-to-b from-white via-white/90 to-white/50">
            TRENCHOR
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00ff41] to-cyan-400">BASE</span>
          </h1>

          <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto leading-relaxed font-light mt-8 mb-16 text-center">
            Dive deep into trading with Trenchor Base. Stay ahead of the competition with real-time campaign data, advanced analytics terminals, and exclusive tax tracking for Unicorn projects.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative z-50">
            <Link
              href="/tax-leaderboard"
              className="group relative px-8 py-4 bg-[#00ff41] text-black font-bold uppercase tracking-wider rounded-lg overflow-hidden hover:scale-105 transition-transform duration-300"
            >
              <span className="relative z-10">Connect Terminal</span>
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-0 bg-white/20 transition-transform duration-500 skew-x-12"></div>
            </Link>

            <Link
              href="/campaigns"
              className="group px-8 py-4 bg-transparent border border-white/20 text-white font-bold uppercase tracking-wider rounded-lg hover:bg-white/5 hover:border-[#00ff41]/50 transition-all duration-300 backdrop-blur-sm"
            >
              <span className="group-hover:text-[#00ff41] transition-colors">Explore Campaigns</span>
            </Link>
          </div>
        </div>

        {/* Features Section */}
        <div className="mb-20">

          <div className="flex items-center gap-4 mb-12">
            <div className="h-px bg-gradient-to-r from-transparent via-[#00ff41]/50 to-transparent flex-1"></div>
            <span className="text-[#00ff41] font-mono text-sm tracking-widest uppercase">Why Trenchor?</span>
            <div className="h-px bg-gradient-to-r from-transparent via-[#00ff41]/50 to-transparent flex-1"></div>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="group p-8 rounded-3xl bg-gradient-to-b from-white/[0.03] to-transparent border border-white/5 hover:border-[#00ff41]/30 transition-all duration-500 hover:shadow-[0_0_30px_rgba(0,255,65,0.05)]">
              <div className="w-14 h-14 rounded-2xl bg-[#00ff41]/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500 border border-[#00ff41]/10">
                <svg className="w-7 h-7 text-[#00ff41]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-[#00ff41] transition-colors">Real-time Campaign Analytics</h3>
              <p className="text-white/50 leading-relaxed text-sm">
                Trading isn't just buying and selling; it's a strategy. Trenchor allows you to track your real-time ranking, volume data, and competitive standing second-by-second in trading competitions hosted by projects. Set your target, execute your trades, and climb the leaderboard.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="group p-8 rounded-3xl bg-gradient-to-b from-white/[0.03] to-transparent border border-white/5 hover:border-cyan-500/30 transition-all duration-500 hover:shadow-[0_0_30px_rgba(6,182,212,0.05)]">
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500 border border-cyan-500/10">
                <svg className="w-7 h-7 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-cyan-400 transition-colors">The Tax Terminal (First 98 Minutes)</h3>
              <p className="text-white/50 leading-relaxed text-sm">
                Don't get lost in the launch chaos. We transparently monitor $VIRTUAL taxes paid during the critical first 98 minutes of Unicorn and Prototype launches within the Virtual ecosystem. By analyzing wallet contributions, we provide the essential data for projects to identify and reward their most loyal investors.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="group p-8 rounded-3xl bg-gradient-to-b from-white/[0.03] to-transparent border border-white/5 hover:border-purple-500/30 transition-all duration-500 hover:shadow-[0_0_30px_rgba(168,85,247,0.05)]">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500 border border-purple-500/10">
                <svg className="w-7 h-7 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-purple-400 transition-colors">Ecosystem Rewards & Security</h3>
              <p className="text-white/50 leading-relaxed text-sm">
                Trenchor is built to protect investors and expand the ecosystem. Revenues generated from partnerships and analytics are shared with $TRB token holders and stakers. With our bot-filtering algorithms, we guarantee organic growth and a fair campaign process.
              </p>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
