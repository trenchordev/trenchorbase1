import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { redis } from '@/lib/redis';

const VIRTUAL_ADDRESS = '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export async function POST(request) {
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('ADMIN_PASSWORD');

  if (adminAuth?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { campaignId } = await request.json();

    if (!campaignId) {
      return NextResponse.json({ error: 'Campaign ID required' }, { status: 400 });
    }

    const config = await redis.get(`tax-campaign-config:${campaignId}`);
    if (!config) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const { targetToken, taxWallet, timeWindowMinutes, startBlock: configStartBlock, endBlock: configEndBlock, name } = config;
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

    const client = createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    });

    const currentBlock = await client.getBlockNumber();
    let fromBlock, toBlock;

    if (configStartBlock && configEndBlock) {
      fromBlock = BigInt(configStartBlock);
      toBlock = BigInt(configEndBlock);
    } else if (configStartBlock) {
      fromBlock = BigInt(configStartBlock);
      toBlock = currentBlock;
    } else {
      const timeWindow = (timeWindowMinutes || 99) * 60;
      const estimatedBlocks = Math.ceil(timeWindow / 2);
      fromBlock = currentBlock - BigInt(estimatedBlocks);
      toBlock = currentBlock;
    }

    const debugInfo = {
      config: {
        campaignId,
        name,
        targetToken,
        taxWallet,
        configStartBlock,
        configEndBlock,
        timeWindowMinutes,
      },
      blockRange: {
        currentBlock: currentBlock.toString(),
        fromBlock: fromBlock.toString(),
        toBlock: toBlock.toString(),
        totalBlocks: (toBlock - fromBlock).toString(),
      },
      rpcUrl,
      virtualAddress: VIRTUAL_ADDRESS,
      transferTopic: TRANSFER_TOPIC,
      taxWalletPadded: `0x000000000000000000000000${taxWallet.slice(2).toLowerCase()}`,
    };

    // Step 1: Check for ANY VIRTUAL transfers to tax wallet
    console.log('Fetching VIRTUAL transfers to tax wallet...');
    
    const taxTransferLogs = [];
    const chunkSize = 1000n;
    
    for (let from = fromBlock; from < toBlock; from += chunkSize) {
      const to = from + chunkSize > toBlock ? toBlock : from + chunkSize;
      
      try {
        const logs = await client.request({
          method: 'eth_getLogs',
          params: [{
            address: VIRTUAL_ADDRESS,
            fromBlock: `0x${from.toString(16)}`,
            toBlock: `0x${to.toString(16)}`,
            topics: [
              TRANSFER_TOPIC,
              null, // from any
              `0x000000000000000000000000${taxWallet.slice(2).toLowerCase()}`, // to taxWallet
            ],
          }],
        });
        
        taxTransferLogs.push(...logs);
      } catch (err) {
        debugInfo.fetchError = err.message;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    debugInfo.step1_virtualToTaxWallet = {
      count: taxTransferLogs.length,
      sampleLogs: taxTransferLogs.slice(0, 3).map(log => ({
        txHash: log.transactionHash,
        blockNumber: parseInt(log.blockNumber, 16),
        data: log.data,
      })),
    };

    // Step 2: For each transfer, check if transaction contains target token
    const targetTokenLower = targetToken.toLowerCase();
    let matchingTxs = 0;
    let notMatchingTxs = 0;
    const sampleReceipts = [];

    for (const log of taxTransferLogs.slice(0, 5)) { // Check first 5 only for debug
      try {
        const receipt = await client.getTransactionReceipt({ hash: log.transactionHash });
        
        let hasTargetToken = false;
        const tokenAddresses = [];
        
        for (const txLog of receipt.logs) {
          const tokenAddr = txLog.address.toLowerCase();
          tokenAddresses.push(tokenAddr);
          
          if (tokenAddr === targetTokenLower) {
            hasTargetToken = true;
          }
        }
        
        if (hasTargetToken) {
          matchingTxs++;
        } else {
          notMatchingTxs++;
        }
        
        sampleReceipts.push({
          txHash: log.transactionHash,
          from: receipt.from,
          hasTargetToken,
          tokenAddressesInTx: [...new Set(tokenAddresses)],
        });
        
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (err) {
        sampleReceipts.push({
          txHash: log.transactionHash,
          error: err.message,
        });
      }
    }

    debugInfo.step2_targetTokenCheck = {
      checkedTxs: sampleReceipts.length,
      matchingTxs,
      notMatchingTxs,
      targetTokenLower,
      sampleReceipts,
    };

    // Step 3: Also check for target token transfers directly
    console.log('Checking for target token transfers...');
    
    const targetTokenLogs = [];
    for (let from = fromBlock; from < toBlock; from += chunkSize) {
      const to = from + chunkSize > toBlock ? toBlock : from + chunkSize;
      
      try {
        const logs = await client.request({
          method: 'eth_getLogs',
          params: [{
            address: targetToken,
            fromBlock: `0x${from.toString(16)}`,
            toBlock: `0x${to.toString(16)}`,
            topics: [TRANSFER_TOPIC],
          }],
        });
        
        targetTokenLogs.push(...logs);
      } catch (err) {
        debugInfo.targetTokenFetchError = err.message;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    debugInfo.step3_targetTokenTransfers = {
      count: targetTokenLogs.length,
      sampleLogs: targetTokenLogs.slice(0, 3).map(log => ({
        txHash: log.transactionHash,
        blockNumber: parseInt(log.blockNumber, 16),
      })),
    };

    return NextResponse.json({
      success: true,
      debug: debugInfo,
    });

  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
