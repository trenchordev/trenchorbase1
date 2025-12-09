'use client';

import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center pt-[250px] pb-20 px-6">
      
      {/* Hero Section - Centered Container */}
      <div className="max-w-6xl mx-auto w-full text-center space-y-6">
        
        {/* Status Badge */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-[#00ff41]/5 border border-[#00ff41]/30 backdrop-blur-sm shadow-[0_0_20px_rgba(0,255,65,0.15)]">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00ff41] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[#00ff41]"></span>
            </div>
            <span className="text-sm font-mono text-[#00ff41] tracking-wider uppercase font-semibold">System Online</span>
          </div>
        </div>

        {/* Spacer between badge and heading */}
        <div className="h-[50px]"></div>

        {/* Main Heading */}
        <h1 className="text-7xl md:text-8xl lg:text-9xl font-black tracking-tight pt-6">
          <span className="inline-block bg-gradient-to-br from-[#00ff41] via-[#00ff41] to-[#00cc33] bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(0,255,65,0.5)] animate-pulse">
            TRENCHOR
          </span>
          <span className="inline-block" style={{width: '2rem'}}></span>
          <span className="inline-block bg-gradient-to-br from-cyan-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(6,182,212,0.5)] animate-pulse" style={{animationDelay: '0.5s'}}>
            BASE
          </span>
        </h1>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-5 justify-center items-center pt-4">
          <Link 
            href="/terminal" 
            className="group relative px-10 py-5 bg-[#00ff41] text-black text-lg font-bold rounded-xl overflow-hidden transition-all duration-300 hover:scale-105 shadow-[0_0_40px_rgba(0,255,65,0.4)] hover:shadow-[0_0_60px_rgba(0,255,65,0.6)]"
          >
            <span className="relative z-10 flex items-center gap-3">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Connect Terminal
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-[#00ff41] to-[#00cc33] opacity-0 group-hover:opacity-100 transition-opacity"></div>
          </Link>

          <Link 
            href="/campaigns" 
            className="group px-10 py-5 bg-transparent border-2 border-[#00ff41] text-[#00ff41] text-lg font-bold rounded-xl transition-all duration-300 hover:bg-[#00ff41]/10 hover:scale-105 backdrop-blur-sm"
          >
            <span className="flex items-center gap-3">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Explore Campaigns
            </span>
          </Link>
        </div>

      </div>

      {/* Description Section */}
      <div className="h-[200px] flex items-center justify-center px-4">
        <p className="text-xl md:text-2xl text-white max-w-5xl mx-auto leading-relaxed font-normal text-center">
          Dive deep into trading with Trenchor Base. Stay ahead of the competition with real-time campaign data, advanced analytics terminals, and exclusive tax tracking for Unicorn projects.
        </p>
      </div>

      {/* Why Trenchor Section */}
      <div className="max-w-7xl mx-auto w-full space-y-10">
        
        {/* Features Grid */}
        <div className="grid lg:grid-cols-3 gap-8 px-4">
          
          {/* Feature 1 - Real-time Campaign Analytics */}
          <div className="group relative">
            <div className="absolute inset-0 bg-gradient-to-br from-[#00ff41]/20 to-transparent rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="relative h-full p-8 rounded-3xl bg-gradient-to-br from-[#0d1520] to-[#00ff41]/5 border-2 border-[#00ff41]/20 hover:border-[#00ff41]/60 transition-all duration-300 backdrop-blur-sm">
              
              {/* Icon */}
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#00ff41]/10 border border-[#00ff41]/30 mb-6 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                <svg className="w-9 h-9 text-[#00ff41]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>

              {/* Title */}
              <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-[#00ff41] transition-colors duration-300">
                Real-time Campaign Analytics
              </h3>

              {/* Description */}
              <p className="text-gray-400 text-base leading-relaxed">
                Trading isn't just buying and selling; it's a strategy. Trenchor allows you to track your real-time ranking, volume data, and competitive standing second-by-second in trading competitions hosted by projects. Set your target, execute your trades, and climb the leaderboard.
              </p>
            </div>
          </div>

          {/* Feature 2 - Tax Terminal */}
          <div className="group relative">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/20 to-transparent rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="relative h-full p-8 rounded-3xl bg-gradient-to-br from-[#0d1520] to-cyan-500/5 border-2 border-cyan-400/20 hover:border-cyan-400/60 transition-all duration-300 backdrop-blur-sm">
              
              {/* Icon */}
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-400/30 mb-6 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                <svg className="w-9 h-9 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>

              {/* Title */}
              <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-cyan-400 transition-colors duration-300">
                The Tax Terminal (First 98 Minutes)
              </h3>

              {/* Description */}
              <p className="text-gray-400 text-base leading-relaxed">
                Don't get lost in the launch chaos. We transparently monitor $VIRTUAL taxes paid during the critical first 98 minutes of Unicorn and Prototype launches within the Virtual ecosystem. By analyzing wallet contributions, we provide the essential data for projects to identify and reward their most loyal investors.
              </p>
            </div>
          </div>

          {/* Feature 3 - Ecosystem Rewards */}
          <div className="group relative">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-transparent rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="relative h-full p-8 rounded-3xl bg-gradient-to-br from-[#0d1520] to-purple-500/5 border-2 border-purple-400/20 hover:border-purple-400/60 transition-all duration-300 backdrop-blur-sm">
              
              {/* Icon */}
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-400/30 mb-6 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                <svg className="w-9 h-9 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>

              {/* Title */}
              <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-purple-400 transition-colors duration-300">
                Ecosystem Rewards & Security
              </h3>

              {/* Description */}
              <p className="text-gray-400 text-base leading-relaxed">
                Trenchor is built to protect investors and expand the ecosystem. Revenues generated from partnerships and analytics are shared with $TRB token holders and stakers. With our bot-filtering algorithms, we guarantee organic growth and a fair campaign process.
              </p>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
