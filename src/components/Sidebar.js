'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar({ sidebarOpen, setSidebarOpen }) {
  const pathname = usePathname();

  // SVG Icons
  const icons = {
    home: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
    campaigns: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>,
    featured: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>,
    terminal: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
    tax: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
    litepaper: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  };

  const menuItems = [
    { icon: icons.home, label: 'Home', href: '/' },
    { icon: icons.campaigns, label: 'Campaigns Terminal', href: '/campaigns' },
    { icon: icons.featured, label: 'Feature Campaigns', href: '/feature-campaigns' },
    { icon: icons.terminal, label: 'Token Terminal', href: '/terminal' },
    { icon: icons.tax, label: 'Tax Terminal', href: '/tax-leaderboard' },
    { icon: icons.litepaper, label: 'Litepaper', href: '/litepaper' },
  ];

  return (
    <aside
      style={{ width: sidebarOpen ? '220px' : '80px' }}
      className="min-h-screen bg-[#0d1320] border-r border-[#00ff41]/10 flex flex-col transition-all duration-300 fixed left-0 top-0 z-50"
    >
      {/* Logo */}
      <div className="p-5 border-b border-[#00ff41]/20">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-black border border-[#00ff41] flex items-center justify-center overflow-hidden shadow-lg shadow-[#00ff41]/20 shrink-0">
            <img src="/images/trenchor-logo.png" alt="Trenchor Logo" className="w-full h-full object-cover" />
          </div>
          {sidebarOpen && (
            <div className="overflow-hidden whitespace-nowrap">
              <div className="text-[#00ff41] font-bold text-xl tracking-wider">TRENCHOR</div>
              <div className="text-xs text-white/50 tracking-wide">Trader Base</div>
            </div>
          )}
        </div>
      </div>

      {/* Toggle Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute -right-3 top-20 w-6 h-6 bg-[#00ff41] rounded-full flex items-center justify-center text-black text-xs hover:bg-[#00cc33] transition z-50"
      >
        {sidebarOpen ? '‹' : '›'}
      </button>

      {/* Menu */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto overflow-x-hidden">
        {menuItems.map((item, idx) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={idx}
              href={item.href}
              className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all group whitespace-nowrap ${isActive
                ? 'bg-[#00ff41]/10 text-[#00ff41] shadow-[0_0_15px_rgba(0,255,65,0.1)] border border-[#00ff41]/20'
                : 'text-white/60 hover:bg-[#00ff41]/5 hover:text-[#00ff41]'
                }`}
            >
              <div className={`${isActive ? 'text-[#00ff41]' : 'text-white/60 group-hover:text-[#00ff41]'}`}>
                {item.icon}
              </div>
              {sidebarOpen && (
                <span className="font-medium tracking-wide text-sm">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Social Links */}
      <div className="px-4 pb-2">
        <a
          href="https://x.com/trenchorbase"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-3 rounded-xl bg-black/40 border border-[#00ff41]/20 hover:border-[#00ff41] hover:bg-[#00ff41]/10 transition-all group"
        >
          <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition">
            {/* X Logo */}
            <svg className="w-4 h-4 text-white group-hover:text-[#00ff41]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path>
            </svg>
          </div>
          {sidebarOpen && (
            <div className="leading-tight">
              <div className="text-[#00ff41] font-bold text-xs tracking-wider">FOLLOW US</div>
              <div className="text-[10px] text-white/50">@trenchorbase</div>
            </div>
          )}
        </a>
      </div>

      {/* Footer Status */}
      <div className="p-4 border-t border-[#00ff41]/10 bg-[#0a0f1a]">
        {sidebarOpen ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-white/40">NETWORK STATUS</span>
              <span className="flex items-center gap-1 text-[#00ff41]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00ff41] animate-pulse"></span>
                ONLINE
              </span>
            </div>
            <div className="p-2 rounded bg-black/40 border border-[#00ff41]/10">
              <div className="text-[10px] text-white/40 mb-1">BASE CHAIN</div>
              <div className="text-xs text-[#00ff41] font-mono">CONNECTED</div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <span className="w-2 h-2 rounded-full bg-[#00ff41] animate-pulse"></span>
          </div>
        )}
      </div>
    </aside>
  );
}
