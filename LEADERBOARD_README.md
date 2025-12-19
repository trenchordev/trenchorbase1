# 🎮 Crypto Trading Leaderboard Dashboard

A dark-themed, cyberpunk-style cryptocurrency trading leaderboard built with Next.js 16, Tailwind CSS 4, and Upstash Redis.

## ✨ Features

- **Real-time Leaderboard**: Displays traders ranked by total trading volume
- **Cyberpunk UI**: Dark theme with neon green terminal aesthetics
- **Responsive Design**: Mobile-first design that works on all screen sizes
- **Live Data**: Fetches data from Upstash Redis (ZSET for rankings, HASH for user details)
- **Refresh Functionality**: Manual refresh button to update stats from blockchain
- **Net Buy/Sell Tracking**: Shows net buy position for each trader

## 🚀 Getting Started

### Prerequisites

- Node.js 20.9.0 or higher (recommended)
- npm or yarn
- Upstash Redis account ([Get one free](https://console.upstash.com/))

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   
   Copy `.env.local.example` to `.env.local` and fill in your Upstash Redis credentials:
   ```bash
   cp .env.local.example .env.local
   ```

   Update the following values in `.env.local`:
   ```env
   NEXT_PUBLIC_UPSTASH_REDIS_REST_URL=your_redis_rest_url_here
   NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN=your_redis_rest_token_here
   UPSTASH_REDIS_REST_URL=your_redis_rest_url_here
   UPSTASH_REDIS_REST_TOKEN=your_redis_rest_token_here
   NEXT_PUBLIC_RPC_URL=https://mainnet.base.org
   ```

3. **Update API configuration:**
   
   Edit `src/app/api/update-stats/route.js` and set your pool address:
   ```javascript
   const POOL_ADDRESS = "0x....."; // Your LP pool address
   ```

### Running the Application

**Development mode:**
```bash
npm run dev
```

**Production build:**
```bash
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

## 📊 Data Structure

### Redis ZSET: `leaderboard:volume`
Stores trader addresses with their total trading volume as the score.

### Redis HASH: `user:{address}`
Stores individual user statistics:
- `totalVolume`: Total USD volume traded
- `netBuy`: Net buy position (positive = net buyer, negative = net seller)

## 🎨 Design Features

- **Monospace Font**: Terminal-style typography
- **Neon Green (#00ff41)**: Primary accent color with glow effects
- **Black Background**: Pure black (#000000) base
- **Scanline Effect**: Subtle horizontal lines for CRT monitor aesthetic
- **Hover Effects**: Interactive table rows with smooth transitions
- **Custom Scrollbar**: Themed scrollbar matching the cyberpunk aesthetic

## 🔄 API Routes

### `GET /api/update-stats`
Fetches recent blockchain transactions, processes them, and updates Redis with:
- Total volume per trader
- Net buy/sell positions
- Leaderboard rankings

## 📱 Responsive Breakpoints

- **Mobile**: < 768px
- **Tablet**: 768px - 1024px
- **Desktop**: > 1024px

## 🛠️ Tech Stack

- **Framework**: Next.js 16.0.7
- **UI**: React 19.2.0
- **Styling**: Tailwind CSS 4
- **Database**: Upstash Redis
- **Blockchain**: viem (for Base chain interaction)

## 📝 Table Columns

1. **RANK**: Position in the leaderboard (1, 2, 3...)
2. **ADDRESS**: Wallet address (formatted as 0x1234...5678)
3. **TOTAL VOLUME**: Total USD trading volume
4. **NET BUY**: Net buy position (green = buyer, red = seller)

## 🔧 Customization

### Change Colors
Edit `src/app/globals.css` to modify the color scheme:
```css
/* Change neon green to another color */
body {
  @apply text-[#00ff41]; /* Change this hex code */
}
```

### Adjust Data Refresh Rate
Modify the useEffect in `src/app/page.js` to add auto-refresh:
```javascript
useEffect(() => {
  fetchLeaderboardData();
  
  // Auto-refresh every 30 seconds
  const interval = setInterval(fetchLeaderboardData, 30000);
  return () => clearInterval(interval);
}, []);
```

## 🐛 Troubleshooting

**No data showing?**
- Ensure you've run the `/api/update-stats` endpoint at least once
- Check your Redis credentials in `.env.local`
- Verify the pool address in `route.js` is correct

**Node version warning?**
- Update to Node.js 20.9.0 or higher for best compatibility

## 📄 License

MIT License - feel free to use this project for your own purposes!

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

---

Built with 💚 using Next.js and Tailwind CSS
