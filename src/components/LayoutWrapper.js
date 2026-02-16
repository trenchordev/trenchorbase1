'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Navbar from './Navbar';

export default function LayoutWrapper({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const pathname = usePathname();

  const showNavbar = !(pathname && pathname.startsWith('/admin'));

  return (
    <div className="min-h-screen flex flex-col">
      {showNavbar && <Navbar />}
      <main className={`flex-1 w-full mx-auto transition-all duration-300 relative ${showNavbar ? 'pt-64 px-4 sm:px-6 lg:px-8' : ''}`}>
        {children}
      </main>
    </div>
  );
}
