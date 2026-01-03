'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { SearchBar } from '@/components/search-bar'
import { CoinCard } from '@/components/coin-card'

function SearchContent() {
  const searchParams = useSearchParams()
  const initialQuery = searchParams.get('q') || ''
  const initialType = searchParams.get('type') || ''
  
  const [query, setQuery] = useState(initialQuery)
  const [filterType, setFilterType] = useState<'all' | 'creator' | 'stream'>(
    (initialType as any) || 'all'
  )
  const [sortBy, setSortBy] = useState('volume')
  const [results, setResults] = useState<any>({ creators: [], streams: [] })
  const [isLoading, setIsLoading] = useState(false)
  const [searchMessage, setSearchMessage] = useState<string | null>(null)

  const handleSearch = async (searchQuery: string) => {
    setQuery(searchQuery)
    setIsLoading(true)
    setSearchMessage(null)
    
    try {
      const type = filterType === 'all' ? '' : filterType
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&type=${type}`)
      const data = await res.json()
      
      if (data.type === 'video' || data.type === 'creator') {
        setSearchMessage(data.message)
        setResults({
          creators: data.creator ? [data.creator] : [],
          streams: data.video ? [data.video] : [],
        })
      } else {
        setResults(data.results || { creators: [], streams: [] })
      }
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (initialQuery) {
      handleSearch(initialQuery)
    } else {
      // Load default listings
      async function loadDefault() {
        setIsLoading(true)
        try {
          const [creatorsRes, streamsRes] = await Promise.all([
            fetch(`/api/discover/creators?sort=${sortBy}&limit=12`),
            fetch(`/api/discover/streams?sort=${sortBy}&limit=12`),
          ])
          const creators = await creatorsRes.json()
          const streams = await streamsRes.json()
          setResults({
            creators: creators.pools || [],
            streams: streams.pools || [],
          })
        } catch (error) {
          console.error('Load error:', error)
        } finally {
          setIsLoading(false)
        }
      }
      loadDefault()
    }
  }, [initialQuery, sortBy])

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
          
          <nav className="flex items-center gap-6">
            <Link href="/" className="text-zinc-400 hover:text-white transition">
              Home
            </Link>
            <Link href="/dashboard" className="text-zinc-400 hover:text-white transition">
              Dashboard
            </Link>
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="pt-24 px-6 pb-16">
        <div className="max-w-7xl mx-auto">
          {/* Search */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-6">Explore Coins</h1>
            <SearchBar onSearch={handleSearch} />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-4 mb-8">
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 text-sm">Type:</span>
              {['all', 'creator', 'stream'].map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type as any)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    filterType === type
                      ? type === 'creator'
                        ? 'bg-purple-500 text-white'
                        : type === 'stream'
                        ? 'bg-cyan-500 text-white'
                        : 'bg-emerald-500 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  {type === 'all' ? 'All' : type === 'creator' ? '$CREATOR' : '$STREAM'}
                </button>
              ))}
            </div>
            
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-zinc-500 text-sm">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="volume">Volume</option>
                <option value="holders">Holders</option>
                <option value="price_change">Price Change</option>
                <option value="newest">Newest</option>
              </select>
            </div>
          </div>

          {/* Search Message */}
          {searchMessage && (
            <div className="mb-6 p-4 bg-zinc-900 rounded-xl border border-zinc-800">
              <p className="text-zinc-300">{searchMessage}</p>
            </div>
          )}

          {/* Results */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5 animate-pulse">
                  <div className="h-32 bg-zinc-800 rounded"></div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Creator Coins */}
              {(filterType === 'all' || filterType === 'creator') && results.creators.length > 0 && (
                <div className="mb-12">
                  {filterType === 'all' && (
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                      <span className="text-purple-400">$CREATOR</span> Coins
                    </h2>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {results.creators.map((pool: any) => (
                      <CoinCard
                        key={pool.poolAddress || pool.coinAddress || pool.channelId}
                        type="creator"
                        address={pool.poolAddress || pool.coinAddress || ''}
                        identifier={pool.identifier || pool.channelId}
                        displayName={pool.creator?.channelName || pool.channelName || pool.displayName}
                        image={pool.creator?.channelImage || pool.channelImage}
                        currentPrice={parseInt(pool.currentPrice || pool.stats?.currentPrice || '0')}
                        priceChange24h={pool.priceChange24h || pool.stats?.priceChange24h || 0}
                        totalSupply={pool.totalSupply?.toString() || pool.stats?.totalSupply?.toString() || '0'}
                        holders={pool.holders || pool.stats?.holders || 0}
                        volume24h={pool.totalVolume24h?.toString() || pool.stats?.totalVolume24h?.toString() || '0'}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Stream Coins */}
              {(filterType === 'all' || filterType === 'stream') && results.streams.length > 0 && (
                <div>
                  {filterType === 'all' && (
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                      <span className="text-cyan-400">$STREAM</span> Coins
                    </h2>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {results.streams.map((pool: any) => (
                      <CoinCard
                        key={pool.poolAddress || pool.coinAddress || pool.videoId}
                        type="stream"
                        address={pool.poolAddress || pool.coinAddress || ''}
                        identifier={pool.identifier || pool.videoId}
                        displayName={pool.video?.title || pool.title || pool.displayName}
                        image={pool.video?.thumbnail || pool.thumbnail}
                        currentPrice={parseInt(pool.currentPrice || pool.stats?.currentPrice || '0')}
                        priceChange24h={pool.priceChange24h || pool.stats?.priceChange24h || 0}
                        totalSupply={pool.totalSupply?.toString() || pool.stats?.totalSupply?.toString() || '0'}
                        holders={pool.holders || pool.stats?.holders || 0}
                        volume24h={pool.totalVolume24h?.toString() || pool.stats?.totalVolume24h?.toString() || '0'}
                        channelName={pool.video?.creator?.channelName || pool.creator?.channelName}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* No Results */}
              {results.creators.length === 0 && results.streams.length === 0 && !isLoading && (
                <div className="text-center py-16">
                  <p className="text-zinc-500 text-lg mb-4">
                    {query ? `No results found for "${query}"` : 'No coins available yet'}
                  </p>
                  <Link
                    href="/dashboard"
                    className="inline-block px-6 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl font-semibold text-white hover:opacity-90 transition"
                  >
                    Create the first coin!
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <SearchContent />
    </Suspense>
  )
}

