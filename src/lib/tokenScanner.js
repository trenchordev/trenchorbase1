import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { fetchVirtualUsdPrice } from './virtualPrice';

const SWAP_TOPIC = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const VIRTUAL_ADDRESS = '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b'.toLowerCase();

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://base.llamarpc.com';

const defaultClient = createPublicClient({
  chain: base,
  transport: http(rpcUrl),
});

export async function scanToken({
  tokenId,
  tokenName,
  ticker,
  tokenAddress,
  lpAddress,
  startBlock,
  endBlock,
  redis,
  client: customClient,
  imageUrl,
  timeline,
  distributionPeriod,
  details,
  campaignLinks,
  isFeatured,
}) {
  if (!redis) throw new Error('Redis client required');
  if (!tokenId || !tokenAddress || !lpAddress) {
    throw new Error('tokenId, tokenAddress ve lpAddress gerekli!');
  }

  const lpAddr = lpAddress.toLowerCase();
  const tokenAddr = tokenAddress.toLowerCase();

  const client = customClient || defaultClient;

  const currentBlock = await client.getBlockNumber();
  const virtualPrice = await fetchVirtualUsdPrice();
  const toBlock = endBlock ? BigInt(endBlock) : currentBlock;
  const fromBlock = startBlock ? BigInt(startBlock) : currentBlock - 10000n;
  const totalBlocks = toBlock - fromBlock;
  const chunkSize = 1000n;

  let allSwapLogs = [];

  for (let from = fromBlock; from < toBlock; from += chunkSize) {
    const to = from + chunkSize > toBlock ? toBlock : from + chunkSize;
    try {
      const logs = await client.request({
        method: 'eth_getLogs',
        params: [{
          address: lpAddr,
          fromBlock: `0x${from.toString(16)}`,
          toBlock: `0x${to.toString(16)}`,
          topics: [SWAP_TOPIC],
        }],
      });
      allSwapLogs = allSwapLogs.concat(logs);
    } catch (err) {
      console.error(`Error in chunk ${from}-${to}:`, err.message);
    }
  }

  const traders = new Map();

  for (const log of allSwapLogs) {
    const txHash = log.transactionHash;

    try {
      const receipt = await client.getTransactionReceipt({ hash: txHash });
      const trader = receipt.from.toLowerCase();

      let virtualIn = 0n;
      let virtualOut = 0n;
      let tokenIn = 0n;
      let tokenOut = 0n;
      let traderTouchedToken = false;

      for (const txLog of receipt.logs) {
        if (txLog.topics[0] !== TRANSFER_TOPIC) continue;

        const tokenAddressLog = txLog.address.toLowerCase();
        const from = '0x' + txLog.topics[1].slice(26).toLowerCase();
        const to = '0x' + txLog.topics[2].slice(26).toLowerCase();
        const amount = BigInt(txLog.data);

        if (tokenAddressLog === VIRTUAL_ADDRESS) {
          if (to === lpAddr) virtualIn += amount;
          if (from === lpAddr) virtualOut += amount;
        }

        if (tokenAddressLog === tokenAddr) {
          if (from === trader || to === trader) {
            traderTouchedToken = true;
          }
          if (to === lpAddr) tokenIn += amount;
          if (from === lpAddr) tokenOut += amount;
        }
      }

      let type = 'UNKNOWN';
      let virtualAmount = 0;
      let tokenAmount = 0;

      if (virtualIn > 0n && tokenOut > 0n) {
        type = 'BUY';
        virtualAmount = Number(virtualIn) / 1e18;
        tokenAmount = Number(tokenOut) / 1e18;
      } else if (tokenIn > 0n && virtualOut > 0n) {
        type = 'SELL';
        virtualAmount = Number(virtualOut) / 1e18;
        tokenAmount = Number(tokenIn) / 1e18;
      }

      if (type === 'UNKNOWN') continue;

      const usdAmount = virtualAmount * virtualPrice;

      if (usdAmount < 0.01) continue;
      if (!traderTouchedToken) continue;

      if (!traders.has(trader)) {
        traders.set(trader, {
          buyVirtual: 0,
          sellVirtual: 0,
          buyUsd: 0,
          sellUsd: 0,
          buyToken: 0,
          sellToken: 0,
          txCount: 0,
        });
      }

      const data = traders.get(trader);
      data.txCount++;

      if (type === 'BUY') {
        data.buyVirtual += virtualAmount;
        data.buyUsd += usdAmount;
        data.buyToken += tokenAmount;
      } else {
        data.sellVirtual += virtualAmount;
        data.sellUsd += usdAmount;
        data.sellToken += tokenAmount;
      }
    } catch (err) {
      console.error(`Error processing tx ${txHash}:`, err.message);
    }
  }

  const tokenMeta = {
    tokenId,
    tokenName: tokenName || tokenId,
    tokenAddress: tokenAddr,
    lpAddress: lpAddr,
    startBlock: fromBlock.toString(),
    endBlock: toBlock.toString(),
    lastUpdated: Date.now().toString(),
    totalSwaps: allSwapLogs.length.toString(),
    uniqueTraders: traders.size.toString(),
    virtualPrice: virtualPrice.toString(),
    isFeatured: isFeatured ? 'true' : 'false',
  };

  if (ticker) tokenMeta.ticker = ticker;
  if (imageUrl) tokenMeta.imageUrl = imageUrl;
  if (timeline) tokenMeta.timeline = timeline;
  if (distributionPeriod) tokenMeta.distributionPeriod = distributionPeriod;
  if (details) tokenMeta.details = details;
  if (campaignLinks) {
    try {
      tokenMeta.campaignLinks = Array.isArray(campaignLinks)
        ? JSON.stringify(campaignLinks)
        : campaignLinks;
    } catch (err) {
      console.error('campaignLinks serialization error:', err.message);
    }
  }

  await redis.hset(`token:${tokenId}`, tokenMeta);

  await redis.sadd('tokens:list', tokenId);
  await redis.del(`leaderboard:${tokenId}`);
  const oldKeys = await redis.keys(`user:${tokenId}:*`);
  if (oldKeys && oldKeys.length > 0) {
    await redis.del(...oldKeys);
  }

  for (const [trader, data] of traders.entries()) {
    const totalVirtual = data.buyVirtual + data.sellVirtual;
    const totalUsd = data.buyUsd + data.sellUsd;
    const totalToken = data.buyToken + data.sellToken;
    const netBuyVirtual = data.buyVirtual - data.sellVirtual;
    const netBuyUsd = data.buyUsd - data.sellUsd;

    await redis.zadd(`leaderboard:${tokenId}`, {
      score: totalUsd,
      member: trader,
    });

    await redis.hset(`user:${tokenId}:${trader}`, {
      totalVirtualVolume: totalVirtual.toFixed(4),
      totalTokenVolume: totalToken.toFixed(4),
      totalUsdVolume: totalUsd.toFixed(2),
      buyVirtualVolume: data.buyVirtual.toFixed(4),
      sellVirtualVolume: data.sellVirtual.toFixed(4),
      buyUsdVolume: data.buyUsd.toFixed(2),
      sellUsdVolume: data.sellUsd.toFixed(2),
      netBuyVirtual: netBuyVirtual.toFixed(4),
      netBuyUsd: netBuyUsd.toFixed(2),
      txCount: data.txCount.toString(),
    });
  }

  return {
    tokenId,
    stats: {
      blocksScanned: `${fromBlock} - ${toBlock}`,
      totalBlocks: Number(totalBlocks),
      totalSwaps: allSwapLogs.length,
      uniqueTraders: traders.size,
      virtualPrice,
    },
  };
}
