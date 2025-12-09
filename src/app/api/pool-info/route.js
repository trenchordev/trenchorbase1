import { NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const client = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL),
});

const POOL_ADDRESS = "0x780eeb55c05c9611987f839f5fb6c67b0312d2e5";

// Uniswap V2 Pair ABI (sadece gerekli fonksiyonlar)
const PAIR_ABI = [
  {
    "constant": true,
    "inputs": [],
    "name": "token0",
    "outputs": [{ "name": "", "type": "address" }],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "token1", 
    "outputs": [{ "name": "", "type": "address" }],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "getReserves",
    "outputs": [
      { "name": "_reserve0", "type": "uint112" },
      { "name": "_reserve1", "type": "uint112" },
      { "name": "_blockTimestampLast", "type": "uint32" }
    ],
    "type": "function"
  }
];

// ERC20 ABI (symbol ve decimals için)
const ERC20_ABI = [
  {
    "constant": true,
    "inputs": [],
    "name": "symbol",
    "outputs": [{ "name": "", "type": "string" }],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "decimals",
    "outputs": [{ "name": "", "type": "uint8" }],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "name",
    "outputs": [{ "name": "", "type": "string" }],
    "type": "function"
  }
];

export async function GET() {
  try {
    // Pool'dan token adreslerini al
    const token0Address = await client.readContract({
      address: POOL_ADDRESS,
      abi: PAIR_ABI,
      functionName: 'token0'
    });

    const token1Address = await client.readContract({
      address: POOL_ADDRESS,
      abi: PAIR_ABI,
      functionName: 'token1'
    });

    const reserves = await client.readContract({
      address: POOL_ADDRESS,
      abi: PAIR_ABI,
      functionName: 'getReserves'
    });

    // Token bilgilerini al
    const [token0Symbol, token0Decimals, token0Name] = await Promise.all([
      client.readContract({ address: token0Address, abi: ERC20_ABI, functionName: 'symbol' }),
      client.readContract({ address: token0Address, abi: ERC20_ABI, functionName: 'decimals' }),
      client.readContract({ address: token0Address, abi: ERC20_ABI, functionName: 'name' })
    ]);

    const [token1Symbol, token1Decimals, token1Name] = await Promise.all([
      client.readContract({ address: token1Address, abi: ERC20_ABI, functionName: 'symbol' }),
      client.readContract({ address: token1Address, abi: ERC20_ABI, functionName: 'decimals' }),
      client.readContract({ address: token1Address, abi: ERC20_ABI, functionName: 'name' })
    ]);

    // Hangi token VIRTUAL?
    const isToken0Virtual = token0Symbol.toUpperCase() === 'VIRTUAL';
    const isToken1Virtual = token1Symbol.toUpperCase() === 'VIRTUAL';

    return NextResponse.json({
      poolAddress: POOL_ADDRESS,
      token0: {
        address: token0Address,
        symbol: token0Symbol,
        name: token0Name,
        decimals: token0Decimals,
        isVirtual: isToken0Virtual,
        reserve: reserves[0].toString()
      },
      token1: {
        address: token1Address,
        symbol: token1Symbol,
        name: token1Name,
        decimals: token1Decimals,
        isVirtual: isToken1Virtual,
        reserve: reserves[1].toString()
      },
      virtualPosition: isToken0Virtual ? 'token0' : (isToken1Virtual ? 'token1' : 'NOT_FOUND'),
      summary: `Pool: ${token0Symbol}/${token1Symbol}`
    });

  } catch (error) {
    return NextResponse.json({
      error: error.message
    }, { status: 500 });
  }
}
