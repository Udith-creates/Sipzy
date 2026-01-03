'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import bs58 from 'bs58'

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

export default function DashboardPage() {
  const { publicKey, signMessage, connected } = useWallet()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [creator, setCreator] = useState<CreatorData | null>(null)
  const [pendingVideos, setPendingVideos] = useState<VideoData[]>([])
  const [stats, setStats] = useState({ totalVideos: 0, approvedVideos: 0, pendingVideos: 0 })
  const [error, setError] = useState<string | null>(null)

  const authenticate = useCallback(async () => {
    if (!publicKey || !signMessage) return
    
    try {
      const walletAddress = publicKey.toBase58()
      
      const nonceRes = await fetch(`/api/auth/nonce?wallet=${walletAddress}`)
      const { nonce, message } = await nonceRes.json()
      
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
      return false
    }
  }, [publicKey, signMessage])

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
      
      // Fetch pending videos
      const videosRes = await fetch('/api/creator/videos?status=pending')
      if (videosRes.ok) {
        const videosData = await videosRes.json()
        setPendingVideos(videosData.videos)
      }
    } catch (err: any) {
      console.error('Fetch error:', err)
    }
  }, [])

  useEffect(() => {
    async function init() {
      setIsLoading(true)
      if (connected && publicKey) {
        const authed = await authenticate()
        if (authed) {
          await fetchCreatorData()
        }
      }
      setIsLoading(false)
    }
    init()
  }, [connected, publicKey, authenticate, fetchCreatorData])

  const handleConnectYouTube = async () => {
    try {
      const res = await fetch('/api/auth/youtube')
      const { authUrl } = await res.json()
      window.location.href = authUrl
    } catch (err: any) {
      setError('Failed to start YouTube connection')
    }
  }

  const handleApproveVideo = async (videoId: string) => {
    try {
      // In production, you'd create the on-chain pool first
      // For now, just mark as approved
      const res = await fetch(`/api/creator/videos/${videoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'approve',
          coinAddress: 'pending', // Would be set after on-chain creation
        }),
      })
      
      if (res.ok) {
        setPendingVideos(prev => prev.filter(v => v.id !== videoId))
        setStats(prev => ({
          ...prev,
          pendingVideos: prev.pendingVideos - 1,
          approvedVideos: prev.approvedVideos + 1,
        }))
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

  if (!connected) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
        <h1 className="text-3xl font-bold mb-6">Creator Dashboard</h1>
        <p className="text-zinc-400 mb-8">Connect your wallet to access the dashboard</p>
        <WalletMultiButton className="!bg-gradient-to-r !from-emerald-500 !to-cyan-500 !rounded-xl !h-12 !font-semibold" />
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
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-zinc-800">
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
                      <button className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-semibold text-white hover:opacity-90 transition">
                        Create $CREATOR Coin
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400">✓ $CREATOR Coin Active</span>
                        <Link
                          href={`/creator/${creator.channelId}`}
                          className="text-sm text-zinc-400 hover:text-white"
                        >
                          View →
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </div>

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

