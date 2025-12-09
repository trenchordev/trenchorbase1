# Trenchor Base

Advanced crypto trading analytics and campaign management platform on Base Chain.

## Features
-   **Tax Terminal**: Real-time tax tracking and leaderboards.
-   **🆕 Tax Auto-Scan**: Automated 98-minute continuous blockchain scanning with real-time leaderboard updates.
-   **Data**: Powered by Upstash Redis for high-speed data persistence.
-   **Design**: Cyberpunk/Neon aesthetic with Matrix-style backgrounds...

## 🚀 New: Tax Auto-Scan System

Automatically scan blockchain for tax payments over 2940 blocks (~98 minutes) without Vercel timeouts!

**Quick Start**: See [TAX_AUTOSCAN_QUICKSTART.md](./TAX_AUTOSCAN_QUICKSTART.md)

**Full Guide**: See [TAX_AUTOSCAN_GUIDE.md](./TAX_AUTOSCAN_GUIDE.md)

### Key Features
- ✅ Continuous 98-minute scanning (2940 blocks on Base)
- ✅ No block skipping - scans every transaction
- ✅ Vercel timeout-safe (scans 5-10 blocks per minute)
- ✅ Real-time leaderboard updates
- ✅ Pause/Resume support
- ✅ Progress tracking in admin panel

## Deployment

### Vercel
1.  Push this repository to GitHub.
2.  Import into Vercel.
3.  **CRITICAL**: Add the Environment Variables listed in `SECURITY_GUIDE.md`.
4.  Deploy.

## Development
```bash
npm install
npm run dev
```

