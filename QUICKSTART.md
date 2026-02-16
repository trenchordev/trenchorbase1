# 🚀 Quick Start Guide

## ⚠️ Important: Node.js Version Requirement

This project requires **Node.js 20.9.0 or higher**. You are currently using Node.js 18.18.2.

### How to Update Node.js

**Option 1: Download from nodejs.org**
1. Visit [https://nodejs.org/](https://nodejs.org/)
2. Download the LTS version (20.x or higher)
3. Run the installer
4. Restart your terminal

**Option 2: Use nvm (Node Version Manager)**
```bash
# Install nvm: https://github.com/coreybutler/nvm-windows
nvm install 20
nvm use 20
```

## 📋 Setup Steps

### 1. Configure Environment Variables

Create a `.env.local` file in the project root:

```env
# Get these from https://console.upstash.com/
NEXT_PUBLIC_UPSTASH_REDIS_REST_URL=https://your-redis-url.upstash.io
NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN=your_token_here

UPSTASH_REDIS_REST_URL=https://your-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token_here

NEXT_PUBLIC_RPC_URL=https://mainnet.base.org
```

### 2. Set Pool Address

Edit `src/app/api/update-stats/route.js` (line 21):

```javascript
const POOL_ADDRESS = "0xYourActualPoolAddress"; 
```

### 3. Install Dependencies (Already Done ✅)

```bash
npm install
```

### 4. Start Development Server

```bash
npm run dev
```

Visit: [http://localhost:3000](http://localhost:3000)

## 🎯 First Time Usage

1. **Populate Data**: First call the API to fetch blockchain data
   - Visit: `http://localhost:3000/api/update-stats`
   - Or use the "REFRESH DATA" button on the dashboard

2. **View Leaderboard**: Return to the home page to see the rankings

## 🎨 What You'll See

- **Cyberpunk Theme**: Black background with neon green text
- **Terminal Aesthetic**: Monospace font with scanline effects
- **Real-time Rankings**: Traders sorted by total volume
- **Net Buy/Sell**: Green for net buyers, red for net sellers
- **Formatted Addresses**: Clean display (0x1234...5678)

## 📱 Features

✅ Responsive design (mobile, tablet, desktop)
✅ Dark theme with neon glow effects
✅ Manual refresh functionality
✅ Real-time data from Upstash Redis
✅ Blockchain integration (Base network)

## 🔧 Files Created

- `src/app/page.js` - Main leaderboard component
- `src/app/layout.js` - Root layout with metadata
- `src/app/globals.css` - Cyberpunk styling
- `tailwind.config.js` - Tailwind configuration
- `.env.local.example` - Environment template

## 🐛 Troubleshooting

**"No data available"?**
- Run `/api/update-stats` first to populate Redis
- Check Redis credentials in `.env.local`

**Server won't start?**
- Update Node.js to version 20.9.0+
- Delete `node_modules` and run `npm install` again

**Styling looks broken?**
- Ensure `globals.css` is imported in `layout.js`
- Check Tailwind configuration

## 📊 Redis Data Structure

```
leaderboard:volume (ZSET)
├─ address1: 1500.50
├─ address2: 1200.75
└─ address3: 950.25

user:{address} (HASH)
├─ totalVolume: 1500.50
└─ netBuy: 450.25
```

## 🎮 Next Steps

1. Update Node.js to 20.9.0+
2. Add your Upstash Redis credentials
3. Set the correct pool address
4. Run `npm run dev`
5. Visit the dashboard and click "REFRESH DATA"

Enjoy your cyberpunk trading dashboard! 💚
