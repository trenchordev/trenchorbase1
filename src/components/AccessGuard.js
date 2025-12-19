'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useTokenGate } from '@/hooks/useTokenGate';

export function AccessGuard({ children }) {
  const { isConnected, hasAccess, isLoading, formattedBalance, requiredFormatted } = useTokenGate();

  const locked = !isConnected || !hasAccess;

  return (
    <div className="relative">
      <div className={locked ? 'blur-sm pointer-events-none select-none' : ''}>{children}</div>

      {locked && (
        <div className="absolute inset-0 z-50 flex items-center justify-center">
          <div className="max-w-md w-full mx-4 rounded-2xl border border-[#00ff41]/30 bg-black/80 backdrop-blur-md p-6 text-center shadow-[0_0_40px_-20px_#00ff41]">
            <div className="flex items-center justify-center gap-2 text-[#ff5555] font-mono text-xs mb-3">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff5555] opacity-60"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ff5555]"></span>
              </span>
              ACCESS LOCKED
            </div>
            <h3 className="text-white font-semibold text-lg mb-2">TRB balance insufficient</h3>
            <p className="text-white/70 text-sm mb-4">
              Please acquire the required amount of $TRB to unlock this section. Connected wallets will unlock automatically once the balance is sufficient.
            </p>
            <div className="bg-white/5 border border-white/10 rounded-lg p-3 flex items-center justify-between text-sm text-white">
              <div className="text-left">
                <div className="text-white/60">Your balance</div>
                <div className="font-mono text-[#00ff41]">{formattedBalance} $TRB</div>
              </div>
              <div className="text-right">
                <div className="text-white/60">Required</div>
                <div className="font-mono text-[#00ff41]">{requiredFormatted} $TRB</div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-center gap-3">
              <ConnectButton.Custom>
                {({ openConnectModal, authenticationStatus, mounted }) => {
                  const ready = mounted && authenticationStatus !== 'loading';
                  const connected = ready && authenticationStatus === 'authenticated';

                  return (
                    <button
                      onClick={openConnectModal}
                      disabled={connected}
                      className="px-4 py-2 rounded-lg bg-[#00ff41] text-black font-semibold text-sm hover:bg-[#00e63a] transition disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      Connect Wallet
                    </button>
                  );
                }}
              </ConnectButton.Custom>
              <a
                href="https://app.virtuals.io/prototypes/0x2baaD38A80FfDd8D195d2B4eef0bC8E0f319c63a"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#00ff41] underline"
              >
                Buy $TRB
              </a>
            </div>
            {isLoading && (
              <div className="mt-3 text-white/50 text-xs">Checking balance...</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
