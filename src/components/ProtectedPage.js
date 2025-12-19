'use client';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useTokenGate } from '@/hooks/useTokenGate';

export function ProtectedPage({ children, title = 'Protected Content' }) {
  const { isConnected, hasAccess, isLoading, formattedBalance, requiredFormatted } = useTokenGate();

  // Not connected - show connect wallet
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-gradient-to-b from-emerald-900/30 to-black border border-emerald-500/30 rounded-2xl p-8 max-w-md w-full text-center shadow-[0_0_40px_-20px_#00ff41]">
          <div className="w-20 h-20 mx-auto mb-6 bg-emerald-500/20 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">{title}</h1>
          <p className="text-gray-400 mb-6">
            To access this page, connect your wallet and hold minimum <span className="text-emerald-300 font-semibold">{requiredFormatted} $TRB</span>.
          </p>
          <ConnectButton chainStatus="icon" showBalance={false} accountStatus="address" />
        </div>
      </div>
    );
  }

  // Loading balance
  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-gradient-to-b from-emerald-900/30 to-black border border-emerald-500/30 rounded-2xl p-8 max-w-md w-full text-center shadow-[0_0_40px_-20px_#00ff41]">
          <div className="w-20 h-20 mx-auto mb-6 bg-emerald-500/20 rounded-full flex items-center justify-center animate-pulse">
            <svg className="w-10 h-10 text-emerald-300 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Checking Balance</h1>
          <p className="text-gray-400">Verifying your $TRB balance...</p>
        </div>
      </div>
    );
  }

  // No access - insufficient balance
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-gradient-to-b from-red-900/30 to-black border border-red-500/30 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-red-500/20 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Insufficient $TRB Balance</h1>
          <p className="text-gray-400 mb-4">
            To access this page, you need to hold minimum <span className="text-emerald-300 font-semibold">{requiredFormatted} $TRB</span>.
          </p>
          <div className="bg-black/50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-500">Your Current Balance</p>
            <p className="text-2xl font-bold text-white">{formattedBalance} <span className="text-emerald-300">$TRB</span></p>
          </div>
          <a
            href="https://app.uniswap.org/swap?chain=base&outputCurrency=0x2baaD38A80FfDd8D195d2B4eef0bC8E0f319c63a"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-6 py-3 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            Buy $TRB
          </a>
          <div className="mt-4">
            <ConnectButton chainStatus="icon" showBalance={false} accountStatus="address" />
          </div>
        </div>
      </div>
    );
  }

  // Has access - render children
  return <>{children}</>;
}
