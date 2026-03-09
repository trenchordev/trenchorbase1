import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { base } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Trenchor',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '3ead5d7d1dec24729934773e6fbde9fa',
  chains: [base],
  ssr: true,
});

// $TRB Token Contract Address on Base
export const TRB_TOKEN_ADDRESS = '0x2baaD38A80FfDd8D195d2B4eef0bC8E0f319c63a';

// Minimum TRB required for access (1,000,000 TRB)
export const REQUIRED_TRB_BALANCE = 1000000n * 10n ** 18n; // 1M with 18 decimals

// ERC20 ABI for balanceOf
export const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
];
