'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useWallet } from '@solana/wallet-adapter-react'
import { useConnection } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { useSearchParams } from 'next/navigation'
import bs58 from 'bs58'
import { 
  deriveCreatorPoolPDA, 
  createInitializeCreatorPoolTx,
  poolExists,
  fetchPoolInfo,
  formatSol,
  DEFAULT_CREATOR_BASE_PRICE,
  DEFAULT_CREATOR_SLOPE,
  LAMPORTS_PER_SOL,
} from '@/lib/anchor-client'

interface CreatorData {
  id: string
  channelId: string
  channelName: string
  channelImage: string | null
  subscriberCount: number
  coinCreated: boolean
  coinAddress: string | null
  autoApproveVideos: boolean
}

interface VideoData {
  id: string
  videoId: string
  title: string
  thumbnail: string
  publishedAt: string
  status: string
  viewCount: number
}

interface CoinInfo {
  poolAddress: string
  totalSupply: number
  reserveSol: number
  currentPrice: number
  marketCap: number
}

export default function DashboardPage() {
  const { publicKey, signMessage, connected, sendTransaction } = useWallet()
  const { connection } = useConnection()
  const searchParams = useSearchParams()
  
  // Mounted state to prevent hydration mismatch
  const [mounted, setMounted] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [creator, setCreator] = useState<CreatorData | null>(null)
  const [pendingVideos, setPendingVideos] = useState<VideoData[]>([])
  const [stats, setStats] = useState({ totalVideos: 0, approvedVideos: 0, pendingVideos: 0 })
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isCreatingCoin, setIsCreatingCoin] = useState(false)
  const [coinInfo, setCoinInfo] = useState<CoinInfo | null>(null)
  const [showCoinModal, setShowCoinModal] = useState(false)

  // Handle mounted state and check RPC connection
  useEffect(() => {
    setMounted(true)
    
    // Check RPC connection on mount
    const checkRpcConnection = async () => {
      try {
        console.log('Checking RPC connection to:', connection.rpcEndpoint)
        const slot = await connection.getSlot()
        console.log('RPC connection successful. Current slot:', slot)
      } catch (err: any) {
        console.error('RPC connection failed:', err.message)
        console.log('Make sure solana-test-validator is running!')
      }
    }
    
    checkRpcConnection()
  }, [connection])

  // Handle URL params (success/error from OAuth)
  useEffect(() => {
    const success = searchParams.get('success')
    const errorParam = searchParams.get('error')
    
    if (success === 'youtube_connected') {
      setSuccessMessage('YouTube channel connected successfully!')
      window.history.replaceState({}, '', '/dashboard')
    }
    
    if (errorParam) {
      const errorMessages: Record<string, string> = {
        'oauth_denied': 'YouTube authorization was denied',
        'invalid_callback': 'Invalid OAuth callback',
        'no_tokens': 'Failed to get YouTube tokens',
        'channel_taken': 'This YouTube channel is already registered by another user',
        'callback_failed': 'YouTube connection failed. Please try again.',
      }
      setError(errorMessages[errorParam] || 'An error occurred')
      window.history.replaceState({}, '', '/dashboard')
    }
  }, [searchParams])

  // Check existing session
  const checkSession = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/session')
      const data = await res.json()
      
      if (data.authenticated) {
        setIsAuthenticated(true)
        return true
      }
      return false
    } catch (err) {
      console.error('Session check error:', err)
      return false
    }
  }, [])

  // Authenticate with wallet signature
  const authenticate = useCallback(async (): Promise<boolean> => {
    if (!publicKey || !signMessage || isAuthenticating) return false
    
    setIsAuthenticating(true)
    try {
      const walletAddress = publicKey.toBase58()
      
      const nonceRes = await fetch(`/api/auth/nonce?wallet=${walletAddress}`)
      if (!nonceRes.ok) {
        throw new Error('Failed to get nonce')
      }
      const { nonce, message } = await nonceRes.json()
      
      if (!nonce || !message) {
        throw new Error('Invalid nonce response')
      }
      
      const encodedMessage = new TextEncoder().encode(message)
      const signatureBytes = await signMessage(encodedMessage)
      const signature = bs58.encode(signatureBytes)
      
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, signature, nonce }),
      })
      
      const result = await verifyRes.json()
      
      if (result.success) {
        setIsAuthenticated(true)
        return true
      }
      return false
    } catch (err: any) {
      console.error('Auth error:', err)
      if (!err.message?.includes('User rejected')) {
        setError('Authentication failed. Please try again.')
      }
      return false
    } finally {
      setIsAuthenticating(false)
    }
  }, [publicKey, signMessage, isAuthenticating])

  const fetchCreatorData = useCallback(async () => {
    try {
      const res = await fetch('/api/creator/profile')
      if (res.status === 404) {
        setCreator(null)
        return
      }
      if (!res.ok) throw new Error('Failed to fetch')
      
      const data = await res.json()
      setCreator(data.creator)
      setStats(data.stats)
      
      // If coin exists, fetch on-chain data
      if (data.creator?.coinCreated && data.creator?.coinAddress) {
        await fetchCoinInfo(data.creator.channelId)
      }
      
      // Fetch pending videos
      const videosRes = await fetch('/api/creator/videos?status=pending')
      if (videosRes.ok) {
        const videosData = await videosRes.json()
        setPendingVideos(videosData.videos || [])
      }
    } catch (err: any) {
      console.error('Fetch error:', err)
    }
  }, [])

  // Fetch coin info from chain
  const fetchCoinInfo = async (channelId: string) => {
    try {
      const [poolPDA] = deriveCreatorPoolPDA(channelId)
      const info = await fetchPoolInfo(connection, poolPDA)
      
      if (info) {
        const currentPrice = info.basePrice + info.totalSupply * info.curveParam
        setCoinInfo({
          poolAddress: poolPDA.toBase58(),
          totalSupply: info.totalSupply,
          reserveSol: info.reserveSol,
          currentPrice,
          marketCap: info.totalSupply * currentPrice,
        })
      }
    } catch (err) {
      console.error('Failed to fetch coin info:', err)
    }
  }

  // Main initialization effect
  useEffect(() => {
    async function init() {
      if (!mounted) return
      
      setIsLoading(true)
      
      if (connected && publicKey) {
        const hasSession = await checkSession()
        
        if (hasSession) {
          await fetchCreatorData()
        }
      }
      
      setIsLoading(false)
    }
    
    init()
  }, [mounted, connected, publicKey, checkSession, fetchCreatorData])

  const handleSignIn = async () => {
    const authed = await authenticate()
    if (authed) {
      await fetchCreatorData()
    }
  }

  const handleConnectYouTube = async () => {
    try {
      const res = await fetch('/api/auth/youtube')
      const { authUrl } = await res.json()
      window.location.href = authUrl
    } catch (err: any) {
      setError('Failed to start YouTube connection')
    }
  }

  const handleCreateCoin = async () => {
    if (!creator || !publicKey || !sendTransaction) return
    
    setIsCreatingCoin(true)
    setError(null)
    
    try {
      // Derive the pool PDA
      const [poolPDA, bump] = deriveCreatorPoolPDA(creator.channelId)
      
      console.log('Creating pool:', {
        channelId: creator.channelId,
        channelName: creator.channelName,
        poolPDA: poolPDA.toBase58(),
        authority: publicKey.toBase58(),
      })
      
      // Check if pool already exists
      const exists = await poolExists(connection, poolPDA)
      if (exists) {
        // Pool already exists on-chain, just update database
        const updateRes = await fetch('/api/creator/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            coinCreated: true,
            coinAddress: poolPDA.toBase58()
          })
        })
        
        if (updateRes.ok) {
          setCreator(prev => prev ? { ...prev, coinCreated: true, coinAddress: poolPDA.toBase58() } : null)
          await fetchCoinInfo(creator.channelId)
          setShowCoinModal(true)
          setSuccessMessage('$CREATOR coin already exists! Connected to your profile.')
        }
        setIsCreatingCoin(false)
        return
      }
      
      // Create metadata URI (placeholder for now - would use Pinata in production)
      const metadataUri = `ipfs://creator-${creator.channelId}`
      
      // Build the transaction
      const transaction = createInitializeCreatorPoolTx(
        poolPDA,
        publicKey, // Creator wallet receives fees
        publicKey, // Authority (signer)
        creator.channelId,
        creator.channelName,
        metadataUri,
        null, // Use default base price
        null  // Use default slope
      )
      
      // Get recent blockhash with retry
      console.log('Getting recent blockhash from:', connection.rpcEndpoint)
      let blockhash: string
      let lastValidBlockHeight: number
      
      try {
        const result = await connection.getLatestBlockhash('confirmed')
        blockhash = result.blockhash
        lastValidBlockHeight = result.lastValidBlockHeight
      } catch (rpcError: any) {
        console.error('RPC Error:', rpcError)
        // Check if it's a network issue
        if (rpcError.message?.includes('Failed to fetch') || rpcError.message?.includes('NetworkError')) {
          throw new Error(`Cannot connect to Solana network. Make sure:\n1. Solana validator is running (solana-test-validator)\n2. You're on the right network in Phantom (Localhost)`)
        }
        throw new Error(`RPC Error: ${rpcError.message}`)
      }
      
      transaction.recentBlockhash = blockhash
      transaction.feePayer = publicKey
      
      console.log('Sending transaction...')
      
      // Send transaction
      const signature = await sendTransaction(transaction, connection)
      
      console.log('Transaction sent:', signature)
      console.log('Waiting for confirmation...')
      
      // Wait for confirmation
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      }, 'confirmed')
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
      }
      
      console.log('Transaction confirmed!')
      
      // Update database with coin address
      const updateRes = await fetch('/api/creator/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coinCreated: true,
          coinAddress: poolPDA.toBase58()
        })
      })
      
      if (updateRes.ok) {
        setCreator(prev => prev ? { ...prev, coinCreated: true, coinAddress: poolPDA.toBase58() } : null)
      }
      
      // Fetch and show coin info
      setCoinInfo({
        poolAddress: poolPDA.toBase58(),
        totalSupply: 0,
        reserveSol: 0,
        currentPrice: DEFAULT_CREATOR_BASE_PRICE,
        marketCap: 0,
      })
      
      setShowCoinModal(true)
      setSuccessMessage(`$CREATOR coin created! TX: ${signature.slice(0, 8)}...`)
      
    } catch (err: any) {
      console.error('Create coin error:', err)
      
      // Parse error message
      let errorMsg = 'Failed to create coin'
      
      if (err.message?.includes('User rejected')) {
        errorMsg = 'Transaction cancelled by user'
      } else if (err.message?.includes('insufficient')) {
        errorMsg = 'Insufficient SOL balance. You need at least 0.01 SOL for transaction fees.'
      } else if (err.message?.includes('0x0')) {
        errorMsg = 'Transaction simulation failed. Make sure localnet is running.'
      } else if (err.logs) {
        // Anchor error logs
        const anchorError = err.logs.find((l: string) => l.includes('Error'))
        if (anchorError) errorMsg = anchorError
      } else if (err.message) {
        errorMsg = err.message
      }
      
      setError(errorMsg)
    } finally {
      setIsCreatingCoin(false)
    }
  }

  const handleApproveVideo = async (videoId: string) => {
    try {
      const res = await fetch(`/api/creator/videos/${videoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'approve',
          coinAddress: 'pending',
        }),
      })
      
      if (res.ok) {
        setPendingVideos(prev => prev.filter(v => v.id !== videoId))
        setStats(prev => ({
          ...prev,
          pendingVideos: prev.pendingVideos - 1,
          approvedVideos: prev.approvedVideos + 1,
        }))
        setSuccessMessage('Video approved!')
      }
    } catch (err: any) {
      setError('Failed to approve video')
    }
  }

  const handleRejectVideo = async (videoId: string) => {
    try {
      const res = await fetch(`/api/creator/videos/${videoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      })
      
      if (res.ok) {
        setPendingVideos(prev => prev.filter(v => v.id !== videoId))
        setStats(prev => ({ ...prev, pendingVideos: prev.pendingVideos - 1 }))
      }
    } catch (err: any) {
      setError('Failed to reject video')
    }
  }

  // Clear messages after 5 seconds
  useEffect(() => {
    if (error || successMessage) {
      const timer = setTimeout(() => {
        setError(null)
        setSuccessMessage(null)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [error, successMessage])

  // Don't render anything until mounted
  if (!mounted) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  // Not connected
  if (!connected) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
        <h1 className="text-3xl font-bold mb-6">Creator Dashboard</h1>
        <p className="text-zinc-400 mb-8">Connect your wallet to access the dashboard</p>
        <WalletMultiButton className="!bg-gradient-to-r !from-emerald-500 !to-cyan-500 !rounded-xl !h-12 !font-semibold" />
      </div>
    )
  }

  // Connected but not authenticated
  if (!isAuthenticated && !isLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
        <h1 className="text-3xl font-bold mb-6">Creator Dashboard</h1>
        <p className="text-zinc-400 mb-4">Wallet connected: {publicKey?.toBase58().slice(0, 8)}...</p>
        <p className="text-zinc-500 mb-8">Sign a message to authenticate and access your dashboard</p>
        <button
          onClick={handleSignIn}
          disabled={isAuthenticating}
          className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl font-semibold text-black hover:opacity-90 transition disabled:opacity-50"
        >
          {isAuthenticating ? (
            <span className="flex items-center gap-2">
              <div className="animate-spin w-4 h-4 border-2 border-black border-t-transparent rounded-full"></div>
              Signing...
            </span>
          ) : (
            'Sign In with Wallet'
          )}
        </button>
        <p className="text-zinc-600 text-sm mt-4">This signature request is free and won't cost any gas</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Coin Created Modal */}
      {showCoinModal && coinInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 rounded-2xl border border-zinc-700 p-8 max-w-md w-full">
            <div className="text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              
              <h2 className="text-2xl font-bold mb-2">$CREATOR Coin Created!</h2>
              <p className="text-zinc-400 mb-6">Your token is now live on Solana</p>
              
              <div className="bg-zinc-800 rounded-xl p-4 mb-6 text-left space-y-3">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Pool Address</span>
                  <span className="text-sm font-mono text-emerald-400">
                    {coinInfo.poolAddress.slice(0, 8)}...{coinInfo.poolAddress.slice(-6)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Base Price</span>
                  <span className="text-white">{formatSol(DEFAULT_CREATOR_BASE_PRICE)} SOL</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Slope</span>
                  <span className="text-white">{formatSol(DEFAULT_CREATOR_SLOPE)} SOL/token</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Total Supply</span>
                  <span className="text-white">{coinInfo.totalSupply}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Reserve</span>
                  <span className="text-white">{formatSol(coinInfo.reserveSol)} SOL</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Market Cap</span>
                  <span className="text-emerald-400 font-semibold">
                    {formatSol(coinInfo.marketCap)} SOL
                  </span>
                </div>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCoinModal(false)}
                  className="flex-1 px-6 py-3 bg-zinc-700 rounded-xl font-semibold text-white hover:bg-zinc-600 transition"
                >
                  Close
                </button>
                <Link
                  href={`/creator/${creator?.channelId}`}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-semibold text-white hover:opacity-90 transition text-center"
                >
                  View Coin
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-black/80 backdrop-blur-xl border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center font-bold text-black text-lg">
              S
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              Sipzy
            </span>
          </Link>
          
          <WalletMultiButton className="!bg-zinc-800 !rounded-xl !h-10" />
        </div>
      </header>

      {/* Content */}
      <main className="pt-24 px-6 pb-16">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Creator Dashboard</h1>

          {/* Success Message */}
          {successMessage && (
            <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              {successMessage}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
              {error}
            </div>
          )}

          {!creator ? (
            /* Not a Creator Yet */
            <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-8 text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-4">Become a Creator</h2>
              <p className="text-zinc-400 mb-8 max-w-md mx-auto">
                Connect your YouTube channel to create your $CREATOR coin and start letting your community invest in your success.
              </p>
              <button
                onClick={handleConnectYouTube}
                className="px-8 py-4 bg-gradient-to-r from-red-500 to-red-600 rounded-xl font-semibold text-white hover:opacity-90 transition inline-flex items-center gap-3"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
                Connect YouTube Channel
              </button>
            </div>
          ) : (
            /* Creator Dashboard */
            <>
              {/* Creator Profile */}
              <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 mb-8">
                <div className="flex items-start gap-6">
                  {creator.channelImage ? (
                    <img
                      src={creator.channelImage}
                      alt={creator.channelName}
                      className="w-20 h-20 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <span className="text-3xl font-bold text-white">
                        {creator.channelName.charAt(0)}
                      </span>
                    </div>
                  )}
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-2xl font-bold">{creator.channelName}</h2>
                      <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded-full">
                        Creator
                      </span>
                    </div>
                    <p className="text-zinc-400 mb-4">
                      {creator.subscriberCount.toLocaleString()} subscribers
                    </p>
                    
                    {!creator.coinCreated ? (
                      <button 
                        onClick={handleCreateCoin}
                        disabled={isCreatingCoin}
                        className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-semibold text-white hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isCreatingCoin ? (
                          <span className="flex items-center gap-2">
                            <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                            Creating Coin...
                          </span>
                        ) : (
                          'Create $CREATOR Coin'
                        )}
                      </button>
                    ) : (
                      <div className="flex items-center gap-4">
                        <span className="text-emerald-400 flex items-center gap-2">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          $CREATOR Coin Active
                        </span>
                        <Link
                          href={`/creator/${creator.channelId}`}
                          className="text-sm text-purple-400 hover:text-purple-300"
                        >
                          View Trading Page →
                        </Link>
                        <button
                          onClick={() => setShowCoinModal(true)}
                          className="text-sm text-zinc-400 hover:text-white"
                        >
                          View Stats
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Coin Holdings Section */}
              {creator.coinCreated && coinInfo && (
                <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 mb-8">
                  <h3 className="text-xl font-semibold mb-4">Your $CREATOR Coin Stats</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-zinc-800 rounded-xl p-4">
                      <p className="text-zinc-500 text-sm mb-1">Current Price</p>
                      <p className="text-xl font-bold text-emerald-400">
                        {formatSol(coinInfo.currentPrice)} SOL
                      </p>
                    </div>
                    <div className="bg-zinc-800 rounded-xl p-4">
                      <p className="text-zinc-500 text-sm mb-1">Total Supply</p>
                      <p className="text-xl font-bold">{coinInfo.totalSupply}</p>
                    </div>
                    <div className="bg-zinc-800 rounded-xl p-4">
                      <p className="text-zinc-500 text-sm mb-1">Reserve</p>
                      <p className="text-xl font-bold">{formatSol(coinInfo.reserveSol)} SOL</p>
                    </div>
                    <div className="bg-zinc-800 rounded-xl p-4">
                      <p className="text-zinc-500 text-sm mb-1">Market Cap</p>
                      <p className="text-xl font-bold text-purple-400">
                        {formatSol(coinInfo.marketCap)} SOL
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
                  <p className="text-zinc-500 text-sm mb-1">Total Videos</p>
                  <p className="text-2xl font-bold">{stats.totalVideos}</p>
                </div>
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
                  <p className="text-zinc-500 text-sm mb-1">Active Coins</p>
                  <p className="text-2xl font-bold text-emerald-400">{stats.approvedVideos}</p>
                </div>
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
                  <p className="text-zinc-500 text-sm mb-1">Pending Approval</p>
                  <p className="text-2xl font-bold text-yellow-400">{stats.pendingVideos}</p>
                </div>
              </div>

              {/* Pending Videos */}
              {pendingVideos.length > 0 && (
                <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6">
                  <h3 className="text-xl font-semibold mb-6">Pending Video Coins</h3>
                  <div className="space-y-4">
                    {pendingVideos.map((video) => (
                      <div
                        key={video.id}
                        className="flex items-center gap-4 p-4 bg-zinc-800 rounded-xl"
                      >
                        <img
                          src={video.thumbnail}
                          alt={video.title}
                          className="w-32 h-20 rounded-lg object-cover"
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-white truncate">{video.title}</h4>
                          <p className="text-sm text-zinc-400">
                            {new Date(video.publishedAt).toLocaleDateString()} • {video.viewCount.toLocaleString()} views
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleApproveVideo(video.id)}
                            className="px-4 py-2 bg-emerald-500 rounded-lg font-medium text-white hover:bg-emerald-600 transition"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleRejectVideo(video.id)}
                            className="px-4 py-2 bg-zinc-700 rounded-lg font-medium text-white hover:bg-zinc-600 transition"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pendingVideos.length === 0 && (
                <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-8 text-center">
                  <p className="text-zinc-400">
                    No pending videos. New videos will appear here for approval when detected.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
