'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

export default function LayoutWrapper({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const pathname = usePathname();

  const showSidebar = !(pathname && pathname.startsWith('/admin'));

  return (
    <div className="min-h-screen flex">
      {showSidebar && (
        <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      )}
      <main
        style={{ marginLeft: showSidebar ? (sidebarOpen ? '220px' : '80px') : '0' }}
        className="flex-1 transition-all duration-300 min-h-screen relative"
      >
        {children}
      </main>
    </div>
  );
}
