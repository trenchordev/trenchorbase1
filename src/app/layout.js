import './globals.css';
import Image from 'next/image';
import LayoutWrapper from '../components/LayoutWrapper';

export const metadata = {
  title: 'Crypto Trading Leaderboard',
  description: 'Dark-themed cryptocurrency trading leaderboard dashboard',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased text-white">
        {/* Global Background Image System */}
        <div className="fixed inset-0 z-[-50] bg-black pointer-events-none">

          {/* 1. Filler Layer (Texture for left side) */}
          <div className="absolute inset-0 z-[-60]">
            <Image
              src="/images/trenchor-background.png"
              alt="Background Texture"
              fill
              quality={50}
              priority
              className="object-cover opacity-30 blur-sm"
            />
            <div className="absolute inset-0 bg-black/50" />
          </div>

          {/* 2. Character Layer (Right Side) */}
          <div
            className="absolute right-0 top-0 h-full w-full md:w-[85%] translate-x-[20%]"
            style={{
              maskImage: 'linear-gradient(to right, transparent, black 20%)',
              WebkitMaskImage: 'linear-gradient(to right, transparent, black 20%)'
            }}
          >
            <Image
              src="/images/trenchor-background.png"
              alt="Trenchor Character"
              fill
              quality={100}
              priority
              className="object-cover object-[50%_25%] opacity-60"
            />
            {/* Top/Bottom Overlay for text readability */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/60 to-black/90" />
          </div>
        </div>

        <LayoutWrapper>
          {children}
        </LayoutWrapper>
      </body>
    </html>
  );
}
