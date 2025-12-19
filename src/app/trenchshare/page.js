'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TrenchShareRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to campaigns page
    router.replace('/trenchshare/campaigns');
  }, [router]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#00ff41] border-t-transparent rounded-full animate-spin"></div>
        <span className="text-sm text-white/50">Redirecting...</span>
      </div>
    </div>
  );
}
