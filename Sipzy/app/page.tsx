'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { SearchBar } from '@/components/search-bar'
import { CoinCard } from '@/components/coin-card'
import { WalletAuthButton } from '@/components/wallet-auth-button'

interface PoolData {
  poolAddress: string
  poolType: string
  identifier: string
  displayName?: string
  currentPrice: string
  priceChange24h: number
  totalSupply: string
  holders: number
  totalVolume24h: string
  creator?: {
    channelName: string
    channelImage: string | null
  }
  video?: {
    title: string
    thumbnail: string
    creator?: {
      channelName: string
    }
  }
}

export default function HomePage() {
  const [topCreators, setTopCreators] = useState<PoolData[]>([])
  const [topStreams, setTopStreams] = useState<PoolData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'creators' | 'streams'>('creators')

  useEffect(() => {
    async function fetchData() {
      try {
        const [creatorsRes, streamsRes] = await Promise.all([
          fetch('/api/discover/creators?limit=8'),
          fetch('/api/discover/streams?limit=8'),
        ])
        
        const creatorsData = await creatorsRes.json()
        const streamsData = await streamsRes.json()
        
        setTopCreators(creatorsData.pools || [])
        setTopStreams(streamsData.pools || [])
      } catch (error) {
        console.error('Failed to fetch data:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchData()
  }, [])

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center font-bold text-black text-lg shadow-lg shadow-emerald-500/20">
              S
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              Sipzy
            </span>
          </Link>
          
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/search" className="text-zinc-400 hover:text-white transition">
              Explore
            </Link>
            <Link href="/dashboard" className="text-zinc-400 hover:text-white transition">
              Dashboard
            </Link>
          </nav>
          
          <WalletAuthButton />
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-7xl font-bold mb-6">
            <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-purple-500 bg-clip-text text-transparent">
              Watch. Trade. Earn.
            </span>
          </h1>
          <p className="text-xl text-zinc-400 mb-10 max-w-2xl mx-auto">
            The creator economy, tokenized. Buy $CREATOR coins for long-term support 
            or $STREAM coins for viral moment hype. Every trade, every view, every moment matters.
          </p>
          
          <SearchBar className="max-w-2xl mx-auto" />
          
          <div className="flex items-center justify-center gap-4 mt-8">
            <div className="flex items-center gap-2 px-4 py-2 bg-purple-500/10 rounded-full border border-purple-500/30">
              <span className="text-purple-400 font-semibold">$CREATOR</span>
              <span className="text-zinc-500 text-sm">Linear Curve</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 rounded-full border border-cyan-500/30">
              <span className="text-cyan-400 font-semibold">$STREAM</span>
              <span className="text-zinc-500 text-sm">Exponential Curve</span>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Banner */}
      <section className="border-y border-zinc-800 bg-zinc-900/50">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <p className="text-3xl font-bold text-white">$0</p>
              <p className="text-zinc-500 text-sm">Total Volume</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-white">0</p>
              <p className="text-zinc-500 text-sm">Creators</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-white">0</p>
              <p className="text-zinc-500 text-sm">Active Pools</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-white">0</p>
              <p className="text-zinc-500 text-sm">Traders</p>
            </div>
          </div>
        </div>
      </section>

      {/* Leaderboard Section */}
      <section className="py-16 px-6">
        <div className="max-w-7xl mx-auto">
          {/* Tabs */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('creators')}
                className={`px-5 py-2.5 rounded-xl font-semibold transition ${
                  activeTab === 'creators'
                    ? 'bg-purple-500 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                $CREATOR Coins
              </button>
              <button
                onClick={() => setActiveTab('streams')}
                className={`px-5 py-2.5 rounded-xl font-semibold transition ${
                  activeTab === 'streams'
                    ? 'bg-cyan-500 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                $STREAM Coins
              </button>
            </div>
            
            <Link
              href={activeTab === 'creators' ? '/search?type=creator' : '/search?type=stream'}
              className="text-sm text-zinc-400 hover:text-emerald-400 transition"
            >
              View All →
            </Link>
          </div>

          {/* Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5 animate-pulse">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-14 h-14 rounded-xl bg-zinc-800"></div>
                    <div className="flex-1">
                      <div className="h-5 bg-zinc-800 rounded w-3/4 mb-2"></div>
                      <div className="h-4 bg-zinc-800 rounded w-1/2"></div>
                    </div>
                  </div>
                  <div className="h-8 bg-zinc-800 rounded mb-4"></div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="h-10 bg-zinc-800 rounded"></div>
                    <div className="h-10 bg-zinc-800 rounded"></div>
                    <div className="h-10 bg-zinc-800 rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {(activeTab === 'creators' ? topCreators : topStreams).length > 0 ? (
                (activeTab === 'creators' ? topCreators : topStreams).map((pool) => (
                  <CoinCard
                    key={pool.poolAddress}
                    type={activeTab === 'creators' ? 'creator' : 'stream'}
                    address={pool.poolAddress}
                    identifier={pool.identifier}
                    displayName={
                      activeTab === 'creators'
                        ? pool.creator?.channelName || pool.displayName || pool.identifier
                        : pool.video?.title || pool.displayName || pool.identifier
                    }
                    image={
                      activeTab === 'creators'
                        ? pool.creator?.channelImage
                        : pool.video?.thumbnail
                    }
                    currentPrice={parseInt(pool.currentPrice || '0')}
                    priceChange24h={pool.priceChange24h || 0}
                    totalSupply={pool.totalSupply || '0'}
                    holders={pool.holders || 0}
                    volume24h={pool.totalVolume24h || '0'}
                    channelName={pool.video?.creator?.channelName}
                  />
                ))
              ) : (
                <div className="col-span-full text-center py-16">
                  <p className="text-zinc-500 text-lg mb-4">
                    No {activeTab === 'creators' ? 'creator' : 'stream'} coins yet
                  </p>
                  <Link
                    href="/dashboard"
                    className="inline-block px-6 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl font-semibold text-white hover:opacity-90 transition"
                  >
                    Be the first creator!
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-6 bg-zinc-900/50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-2xl font-bold text-white mx-auto mb-6">
                1
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">Connect & Discover</h3>
              <p className="text-zinc-400">
                Connect your Solana wallet, search for your favorite creators or paste any YouTube video URL.
              </p>
            </div>
            
            <div className="text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-2xl font-bold text-white mx-auto mb-6">
                2
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">Choose Your Coin</h3>
              <p className="text-zinc-400">
                Buy $CREATOR coins for steady growth or $STREAM coins for exponential hype on viral content.
              </p>
            </div>
            
            <div className="text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-2xl font-bold text-white mx-auto mb-6">
                3
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">Trade & Earn</h3>
              <p className="text-zinc-400">
                Buy low, sell high. Early supporters benefit most from the bonding curve. 1% of every trade goes to creators.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA for Creators */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">
            Are you a <span className="text-purple-400">Creator</span>?
          </h2>
          <p className="text-xl text-zinc-400 mb-8">
            Link your YouTube channel, create your $CREATOR coin, and let your community invest in your success.
            Every video can have its own $STREAM coin - you approve which ones go live.
          </p>
          <Link
            href="/dashboard"
            className="inline-block px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-semibold text-white text-lg hover:opacity-90 transition shadow-lg shadow-purple-500/20"
          >
            Join as Creator
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center font-bold text-black text-sm">
              S
            </div>
            <span className="text-zinc-400">© 2024 Sipzy. Built on Solana.</span>
          </div>
          
          <div className="flex items-center gap-6">
            <a href="#" className="text-zinc-400 hover:text-white transition">Docs</a>
            <a href="#" className="text-zinc-400 hover:text-white transition">Twitter</a>
            <a href="#" className="text-zinc-400 hover:text-white transition">Discord</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
