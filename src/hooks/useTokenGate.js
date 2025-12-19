'use client';
import { useAccount, useReadContract } from 'wagmi';
import { TRB_TOKEN_ADDRESS, REQUIRED_TRB_BALANCE, ERC20_ABI } from '@/lib/wagmiConfig';

export function useTokenGate() {
  const { address, isConnected } = useAccount();

  const { data: balance, isLoading, error } = useReadContract({
    address: TRB_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    enabled: !!address,
  });

  const hasAccess = balance !== undefined && balance >= REQUIRED_TRB_BALANCE;
  
  const formattedBalance = balance !== undefined 
    ? Number(balance / 10n ** 18n).toLocaleString()
    : '0';

  const requiredFormatted = Number(REQUIRED_TRB_BALANCE / 10n ** 18n).toLocaleString();

  return {
    isConnected,
    address,
    balance,
    formattedBalance,
    requiredFormatted,
    hasAccess,
    isLoading,
    error,
  };
}
