'use client'

import { FC, useState, useEffect, useCallback, useMemo } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'
import {
  deriveStreamPoolPDA,
  deriveCreatorPoolPDA,
  fetchPoolState,
  calculateBuyCost,
  calculateSellRefund,
  getCurrentPrice,
  PROGRAM_ID,
  LAMPORTS_PER_SOL,
  PoolState,
  PoolType,
} from '@/lib/program'

// Helper to format numbers consistently (avoids hydration mismatch)
const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('en-US').format(num)
}

interface TradingSidebarProps {
  youtubeId: string
  creatorWallet?: string
}

export const TradingSidebar: FC<TradingSidebarProps> = ({ youtubeId, creatorWallet }) => {
  const { connection } = useConnection()
  const { publicKey, sendTransaction, connected } = useWallet()
  
  const [poolState, setPoolState] = useState<PoolState | null>(null)
  const [loading, setLoading] = useState(true)
  const [buyAmount, setBuyAmount] = useState(1)
  const [sellAmount, setSellAmount] = useState(1)
  const [txPending, setTxPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  // Detect network
  const networkName = useMemo(() => {
    const url = connection.rpcEndpoint
    if (url.includes('127.0.0.1') || url.includes('localhost')) return 'localnet'
    if (url.includes('devnet')) return 'devnet'
    if (url.includes('mainnet')) return 'mainnet'
    return 'custom'
  }, [connection.rpcEndpoint])

  // Fetch pool state
  const fetchPool = useCallback(async () => {
    try {
      setLoading(true)
      const [poolPDA] = deriveStreamPoolPDA(youtubeId)
      const state = await fetchPoolState(connection, poolPDA)
      setPoolState(state)
    } catch (err) {
      console.error('Failed to fetch pool:', err)
    } finally {
      setLoading(false)
    }
  }, [connection, youtubeId])

  useEffect(() => {
    fetchPool()
    // Poll for updates every 10 seconds
    const interval = setInterval(fetchPool, 10000)
    return () => clearInterval(interval)
  }, [fetchPool])

  // Current price and supply
  const currentSupply = poolState?.totalSupply?.toNumber() ?? 0
  const currentPrice = poolState ? getCurrentPrice(poolState) / LAMPORTS_PER_SOL : 0.01
  const totalReserve = poolState ? poolState.reserveSol.toNumber() / LAMPORTS_PER_SOL : 0

  // Calculate costs
  const buyCostData = poolState ? calculateBuyCost(poolState, buyAmount) : { total: buyAmount * 0.01 * LAMPORTS_PER_SOL }
  const buyCost = buyCostData.total / LAMPORTS_PER_SOL
  const buyCostWithFee = buyCost // Fee already included

  // Initialize pool (if not exists)
  const handleInitializePool = async () => {
    if (!publicKey || !creatorWallet) {
      setError('Please connect wallet and provide creator address')
      return
    }

    setTxPending(true)
    setError(null)
    setSuccess(null)

    try {
      const [poolPDA] = deriveStreamPoolPDA(youtubeId)
      
      // Build initialize instruction
      // Note: In production, use proper Anchor instruction building
      const instruction = await buildInitializeInstruction(
        publicKey,
        poolPDA,
        youtubeId,
        new PublicKey(creatorWallet)
      )

      const transaction = new Transaction().add(instruction)
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = publicKey

      const signature = await sendTransaction(transaction, connection)
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight })
      
      setSuccess(`Pool initialized! TX: ${signature.slice(0, 8)}...`)
      await fetchPool()
    } catch (err: any) {
      console.error('Initialize pool error:', err)
      // Provide helpful error messages
      let errorMsg = err.message || 'Failed to initialize pool'
      if (err.message?.includes('User rejected')) {
        errorMsg = 'Transaction rejected by user'
      } else if (err.message?.includes('0x1')) {
        errorMsg = 'Insufficient SOL balance'
      } else if (err.message?.includes('network')) {
        errorMsg = 'Network error - check if your wallet is on the same network (localnet/devnet)'
      }
      setError(errorMsg)
    } finally {
      setTxPending(false)
    }
  }

  // Buy tokens
  const handleBuy = async () => {
    if (!publicKey || !poolState) {
      setError('Please connect wallet')
      return
    }

    setTxPending(true)
    setError(null)
    setSuccess(null)

    try {
      const [poolPDA] = deriveStreamPoolPDA(youtubeId)
      
      const instruction = await buildBuyInstruction(
        publicKey,
        poolPDA,
        poolState.creatorWallet,
        buyAmount
      )

      const transaction = new Transaction().add(instruction)
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = publicKey

      const signature = await sendTransaction(transaction, connection)
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight })
      
      setSuccess(`Bought ${buyAmount} tokens! TX: ${signature.slice(0, 8)}...`)
      await fetchPool()
    } catch (err: any) {
      setError(err.message || 'Transaction failed')
    } finally {
      setTxPending(false)
    }
  }

  // Sell tokens
  const handleSell = async () => {
    if (!publicKey || !poolState) {
      setError('Please connect wallet')
      return
    }

    setTxPending(true)
    setError(null)
    setSuccess(null)

    try {
      const [poolPDA] = deriveStreamPoolPDA(youtubeId)
      
      const instruction = await buildSellInstruction(
        publicKey,
        poolPDA,
        poolState.creatorWallet,
        sellAmount
      )

      const transaction = new Transaction().add(instruction)
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = publicKey

      const signature = await sendTransaction(transaction, connection)
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight })
      
      setSuccess(`Sold ${sellAmount} tokens! TX: ${signature.slice(0, 8)}...`)
      await fetchPool()
    } catch (err: any) {
      setError(err.message || 'Transaction failed')
    } finally {
      setTxPending(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-l border-zinc-800 p-6 overflow-y-auto">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
          HYPE CURVE
        </h2>
        <p className="text-zinc-500 text-sm mt-1">Trade creator tokens instantly</p>
      </div>

      {/* Wallet Connection */}
      <div className="mb-6">
        <WalletMultiButton className="!bg-gradient-to-r !from-emerald-500 !to-cyan-500 !rounded-xl !h-12 !font-semibold hover:!opacity-90 !transition-opacity w-full !justify-center" />
        <div className="mt-2 flex items-center justify-center gap-2 text-xs">
          <span className={`w-2 h-2 rounded-full ${
            networkName === 'localnet' ? 'bg-yellow-500' : 
            networkName === 'devnet' ? 'bg-blue-500' : 'bg-green-500'
          }`} />
          <span className="text-zinc-500">{networkName.toUpperCase()}</span>
        </div>
        {networkName === 'localnet' && (
          <p className="text-xs text-yellow-500/80 text-center mt-1">
            Ensure Phantom is set to custom RPC: http://127.0.0.1:8899
          </p>
        )}
      </div>

      {/* Price Display */}
      <div className="bg-zinc-900 rounded-2xl p-5 mb-6 border border-zinc-800">
        <div className="flex justify-between items-center mb-4">
          <span className="text-zinc-400">Current Price</span>
          <span className="text-2xl font-bold text-emerald-400">
            {currentPrice.toFixed(4)} SOL
          </span>
        </div>
        <div className="flex justify-between items-center mb-4">
          <span className="text-zinc-400">Supply</span>
          <span className="text-lg font-semibold text-white">
            {formatNumber(currentSupply)} tokens
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-zinc-400">Total Reserve</span>
          <span className="text-lg font-semibold text-cyan-400">
            {totalReserve.toFixed(4)} SOL
          </span>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 mb-4">
          <p className="text-emerald-400 text-sm">{success}</p>
        </div>
      )}

      {/* Pool Not Initialized */}
      {!loading && !poolState && connected && (
        <div className="bg-zinc-900 rounded-2xl p-5 mb-6 border border-zinc-800">
          <p className="text-zinc-400 mb-4 text-sm">
            No pool exists for this video yet. Be the first to create it!
          </p>
          <button
            onClick={handleInitializePool}
            disabled={txPending}
            className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {txPending ? 'Creating...' : 'Initialize Pool'}
          </button>
        </div>
      )}

      {/* Trading Panel */}
      {poolState && (
        <>
          {/* Buy Section */}
          <div className="bg-zinc-900 rounded-2xl p-5 mb-4 border border-zinc-800">
            <h3 className="text-lg font-semibold text-white mb-4">Buy Tokens</h3>
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setBuyAmount(Math.max(1, buyAmount - 1))}
                className="w-10 h-10 rounded-lg bg-zinc-800 text-white font-bold hover:bg-zinc-700 transition"
              >
                -
              </button>
              <input
                type="number"
                value={buyAmount}
                onChange={(e) => setBuyAmount(Math.max(1, parseInt(e.target.value) || 1))}
                className="flex-1 bg-zinc-800 rounded-lg px-4 py-2 text-center text-white font-semibold text-lg border border-zinc-700 focus:border-emerald-500 focus:outline-none"
              />
              <button
                onClick={() => setBuyAmount(buyAmount + 1)}
                className="w-10 h-10 rounded-lg bg-zinc-800 text-white font-bold hover:bg-zinc-700 transition"
              >
                +
              </button>
            </div>
            <div className="text-sm text-zinc-400 mb-4">
              Cost: <span className="text-emerald-400 font-semibold">{buyCostWithFee.toFixed(4)} SOL</span>
              <span className="text-zinc-600 ml-2">(incl. 1% fee)</span>
            </div>
            <button
              onClick={handleBuy}
              disabled={txPending || !connected}
              className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {txPending ? 'Processing...' : `Buy ${buyAmount} Token${buyAmount > 1 ? 's' : ''}`}
            </button>
          </div>

          {/* Sell Section */}
          <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
            <h3 className="text-lg font-semibold text-white mb-4">Sell Tokens</h3>
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setSellAmount(Math.max(1, sellAmount - 1))}
                className="w-10 h-10 rounded-lg bg-zinc-800 text-white font-bold hover:bg-zinc-700 transition"
              >
                -
              </button>
              <input
                type="number"
                value={sellAmount}
                onChange={(e) => setSellAmount(Math.max(1, parseInt(e.target.value) || 1))}
                className="flex-1 bg-zinc-800 rounded-lg px-4 py-2 text-center text-white font-semibold text-lg border border-zinc-700 focus:border-pink-500 focus:outline-none"
              />
              <button
                onClick={() => setSellAmount(sellAmount + 1)}
                className="w-10 h-10 rounded-lg bg-zinc-800 text-white font-bold hover:bg-zinc-700 transition"
              >
                +
              </button>
            </div>
            <button
              onClick={handleSell}
              disabled={txPending || !connected || currentSupply < sellAmount}
              className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-pink-500 to-red-500 text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {txPending ? 'Processing...' : `Sell ${sellAmount} Token${sellAmount > 1 ? 's' : ''}`}
            </button>
          </div>
        </>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}

      {/* Bonding Curve Info */}
      <div className="mt-6 p-4 bg-zinc-900/50 rounded-xl border border-zinc-800/50">
        <h4 className="text-sm font-semibold text-zinc-400 mb-2">Bonding Curve</h4>
        <p className="text-xs text-zinc-500">
          Price = (Supply × 0.0001) + 0.01 SOL
        </p>
        <p className="text-xs text-zinc-500 mt-1">
          1% fee per trade → Creator wallet
        </p>
      </div>
    </div>
  )
}

// Helper functions to build instructions
// In production, use Anchor's instruction builders

async function buildInitializeInstruction(
  authority: PublicKey,
  pool: PublicKey,
  youtubeId: string,
  creatorWallet: PublicKey
) {
  // Discriminator for initialize_pool (from IDL)
  const discriminator = Buffer.from([95, 180, 10, 172, 84, 174, 232, 40])
  
  // Serialize youtube_id (4 bytes length + string bytes)
  const youtubeIdBytes = Buffer.from(youtubeId, 'utf8')
  const youtubeIdLen = Buffer.alloc(4)
  youtubeIdLen.writeUInt32LE(youtubeIdBytes.length)
  
  // Serialize creator_wallet (32 bytes)
  const creatorWalletBytes = creatorWallet.toBuffer()
  
  const data = Buffer.concat([discriminator, youtubeIdLen, youtubeIdBytes, creatorWalletBytes])
  
  return {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  }
}

async function buildBuyInstruction(
  buyer: PublicKey,
  pool: PublicKey,
  creatorWallet: PublicKey,
  amount: number
) {
  // Discriminator for buy_tokens (from IDL)
  const discriminator = Buffer.from([189, 21, 230, 133, 247, 2, 110, 42])
  
  // Serialize amount (u64, 8 bytes)
  const amountBuf = Buffer.alloc(8)
  amountBuf.writeBigUInt64LE(BigInt(amount))
  
  const data = Buffer.concat([discriminator, amountBuf])
  
  return {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: buyer, isSigner: true, isWritable: true },
      { pubkey: creatorWallet, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  }
}

async function buildSellInstruction(
  seller: PublicKey,
  pool: PublicKey,
  creatorWallet: PublicKey,
  amount: number
) {
  // Discriminator for sell_tokens (from IDL)
  const discriminator = Buffer.from([114, 242, 25, 12, 62, 126, 92, 2])
  
  // Serialize amount (u64, 8 bytes)
  const amountBuf = Buffer.alloc(8)
  amountBuf.writeBigUInt64LE(BigInt(amount))
  
  const data = Buffer.concat([discriminator, amountBuf])
  
  return {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: seller, isSigner: true, isWritable: true },
      { pubkey: creatorWallet, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  }
}

