'use client'

import { useState, useEffect, use, useCallback } from 'react'
import Link from 'next/link'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import PriceChart from '@/components/price-chart'

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

interface TokenDetail {
  id: string
  type: 'CREATOR' | 'VIDEO'
  name: string
  symbol: string
  creatorId: string
  creatorName: string
  creatorImage: string | null
  videoId?: string
  videoTitle?: string
  videoThumbnail?: string
  subscriberCount: number
  supply: number
  currentPrice: number
  marketCap: number
  reserveSOL: number
  creatorEarnings: number
  platformEarnings: number
  holders: number
  totalTrades: number
  volume24h: number
  volumeAll: number
  allTimeHigh: number
  allTimeLow: number
  createdAt: number
  updatedAt: number
  params: {
    basePrice: number
    slope?: number
    growthRate?: number
    creatorFeePercent: number
    platformFeePercent: number
  }
}

interface PricePoint {
  price: number
  supply: number
  timestamp: number
}

interface Trade {
  id: string
  userId: string
  type: 'BUY' | 'SELL'
  amount: number
  price: number
  totalCost: number
  creatorFee: number
  platformFee: number
  timestamp: number
}

interface TradePreview {
  tokenCost?: number
  grossRefund?: number
  creatorFee: number
  platformFee: number
  totalCost?: number
  netRefund?: number
  pricePerToken: number
  newPrice: number
}

export default function TokenDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const tokenId = resolvedParams.id
  
  const { connected, publicKey } = useWallet()
  const [mounted, setMounted] = useState(false)
  const [token, setToken] = useState<TokenDetail | null>(null)
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([])
  const [recentTrades, setRecentTrades] = useState<Trade[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  
  // Trading state
  const [tradeAction, setTradeAction] = useState<'buy' | 'sell'>('buy')
  const [tradeAmount, setTradeAmount] = useState(10)
  const [isTrading, setIsTrading] = useState(false)
  const [tradePreview, setTradePreview] = useState<TradePreview | null>(null)
  const [userBalance, setUserBalance] = useState(0)
  const [userSolBalance, setUserSolBalance] = useState(10)
  
  // Chart state - now handled by PriceChart component

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || !tokenId) return
    fetchTokenData()
  }, [mounted, tokenId])

  useEffect(() => {
    if (!mounted || !token) return
    fetchTradePreview()
  }, [tradeAction, tradeAmount, token])

  const fetchTokenData = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/tokens/${tokenId}`)
      
      if (!res.ok) {
        if (res.status === 404) {
          setError('Token not found')
        } else {
          throw new Error('Failed to fetch token')
        }
        return
      }
      
      const data = await res.json()
      setToken(data.token)
      setPriceHistory(data.priceHistory || [])
      setRecentTrades(data.recentTrades || [])
      
      // Fetch user balance
      if (DEMO_MODE) {
        const portfolioRes = await fetch('/api/user/portfolio?userId=demo-investor')
        if (portfolioRes.ok) {
          const portfolioData = await portfolioRes.json()
          const holding = portfolioData.holdings.find((h: any) => h.tokenId === tokenId)
          setUserBalance(holding?.balance || 0)
          setUserSolBalance(portfolioData.user.solBalance)
        }
      }
    } catch (err) {
      console.error('Fetch token error:', err)
      setError('Failed to load token data')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchTradePreview = async () => {
    if (!token || tradeAmount <= 0) {
      setTradePreview(null)
      return
    }
    
    try {
      const res = await fetch(
        `/api/tokens/${tokenId}/trade?action=${tradeAction}&amount=${tradeAmount}`
      )
      
      if (res.ok) {
        const data = await res.json()
        setTradePreview(data)
      }
    } catch (err) {
      console.error('Preview error:', err)
    }
  }

  const executeTrade = async () => {
    if (!token || tradeAmount <= 0) return
    
    setIsTrading(true)
    setError(null)
    
    try {
      const res = await fetch(`/api/tokens/${tokenId}/trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: tradeAction,
          amount: tradeAmount,
          userId: 'demo-investor',
        }),
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Trade failed')
      }
      
      // Update state
      setToken(prev => prev ? {
        ...prev,
        supply: data.newSupply,
        currentPrice: data.newPrice,
        totalTrades: prev.totalTrades + 1,
      } : null)
      
      setUserBalance(data.newBalance)
      setUserSolBalance(data.newSolBalance)
      
      // Add trade to history
      if (data.trade) {
        setRecentTrades(prev => [data.trade, ...prev].slice(0, 20))
      }
      
      // Add new price point to chart
      setPriceHistory(prev => [...prev, {
        price: data.newPrice,
        supply: data.newSupply,
        timestamp: Date.now(),
      }])
      
      const actionWord = tradeAction === 'buy' ? 'Bought' : 'Sold'
      const costOrRefund = tradeAction === 'buy' 
        ? `for ${formatSol(data.cost?.totalCost || 0)} SOL`
        : `for ${formatSol(data.refund?.netRefund || 0)} SOL`
      
      setSuccessMessage(`${actionWord} ${tradeAmount} ${token.symbol} ${costOrRefund}`)
      setTradeAmount(10)
      
      // Refresh preview and token data
      fetchTradePreview()
      
      // Refresh full token data after a short delay to get updated stats
      setTimeout(() => fetchTokenData(), 500)
      
    } catch (err: any) {
      console.error('Trade error:', err)
      setError(err.message || 'Trade failed')
    } finally {
      setIsTrading(false)
    }
  }

  const formatSol = (amount: number | undefined | null) => {
    if (amount === undefined || amount === null || isNaN(amount)) return '0.0000'
    if (amount < 0.0001) return '< 0.0001'
    if (amount < 0.01) return amount.toFixed(6)
    if (amount < 1) return amount.toFixed(4)
    return amount.toFixed(2)
  }
  
  // Refresh chart data - wrapped in useCallback for stable reference (must be before conditional returns)
  const refreshChartData = useCallback(async () => {
    try {
      const res = await fetch(`/api/tokens/${tokenId}`)
      if (res.ok) {
        const data = await res.json()
        setPriceHistory(data.priceHistory || [])
        if (data.token) {
          setToken(data.token)
        }
      }
    } catch (err) {
      console.error('Chart refresh error:', err)
    }
  }, [tokenId])

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
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

  if (!mounted) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full"></div>
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

  if (error && !token) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
        <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mb-6">
          <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-2">Token Not Found</h1>
        <p className="text-zinc-400 mb-6">{error}</p>
        <Link
          href="/explore"
          className="px-6 py-3 bg-zinc-800 rounded-xl font-semibold hover:bg-zinc-700 transition"
        >
          Back to Explore
        </Link>
      </div>
    )
  }

  if (!token) return null

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Demo Mode Banner */}
      {DEMO_MODE && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 border-b border-amber-500/30 py-2 px-4 text-center">
          <span className="text-amber-400 text-sm font-medium">
            🎮 Demo Mode Active — All transactions are simulated
          </span>
        </div>
      )}

      {/* Header */}
      <header className={`fixed left-0 right-0 z-40 bg-black/80 backdrop-blur-xl border-b border-zinc-800 ${DEMO_MODE ? 'top-10' : 'top-0'}`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center font-bold text-black text-lg">
              S
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              Sipzy
            </span>
          </Link>
          
          <div className="flex items-center gap-4">
            <Link
              href="/explore"
              className="px-4 py-2 text-zinc-400 hover:text-white transition"
            >
              Explore
            </Link>
            <Link
              href="/dashboard"
              className="px-4 py-2 text-zinc-400 hover:text-white transition"
            >
              Dashboard
            </Link>
            <WalletMultiButton className="!bg-zinc-800 !rounded-xl !h-10" />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className={`px-6 pb-16 ${DEMO_MODE ? 'pt-32' : 'pt-24'}`}>
        <div className="max-w-7xl mx-auto">
          {/* Messages */}
          {successMessage && (
            <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              {successMessage}
            </div>
          )}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
              {error}
            </div>
          )}

          {/* Token Header */}
          <div className="flex flex-col md:flex-row gap-6 mb-8">
            <div className="flex items-start gap-4">
              {token.type === 'VIDEO' && token.videoThumbnail ? (
                <img
                  src={token.videoThumbnail}
                  alt={token.name}
                  className="w-20 h-20 rounded-xl object-cover"
                />
              ) : token.creatorImage ? (
                <img
                  src={token.creatorImage}
                  alt={token.creatorName}
                  className="w-20 h-20 rounded-xl object-cover"
                />
              ) : (
                <div className={`w-20 h-20 rounded-xl flex items-center justify-center ${
                  token.type === 'CREATOR' 
                    ? 'bg-gradient-to-br from-purple-500 to-pink-500' 
                    : 'bg-gradient-to-br from-cyan-500 to-blue-500'
                }`}>
                  <span className="text-3xl">
                    {token.type === 'CREATOR' ? '👤' : '🎬'}
                  </span>
                </div>
              )}
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-3xl font-bold">{token.symbol}</h1>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    token.type === 'CREATOR'
                      ? 'bg-purple-500/20 text-purple-400'
                      : 'bg-cyan-500/20 text-cyan-400'
                  }`}>
                    {token.type === 'CREATOR' ? 'Creator Token' : 'Video Token'}
                  </span>
                </div>
                <p className="text-zinc-400 text-lg">{token.name}</p>
                <p className="text-zinc-500 text-sm">by {token.creatorName}</p>
              </div>
            </div>
            
            <div className="md:ml-auto flex flex-col items-end">
              <p className="text-4xl font-bold text-emerald-400">{formatSol(token.currentPrice)} SOL</p>
              <p className="text-zinc-500">Current Price</p>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Left Column - Chart and Stats */}
            <div className="lg:col-span-2 space-y-6">
              {/* Price Chart - Enhanced component with axis labels and hover */}
              <PriceChart
                data={priceHistory}
                tokenType={token.type}
                currentPrice={token.currentPrice}
                currentSupply={token.supply}
                onRefresh={refreshChartData}
              />

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                  <p className="text-zinc-500 text-sm mb-1">Market Cap</p>
                  <p className="text-xl font-bold">{formatSol(token.marketCap)} SOL</p>
                </div>
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                  <p className="text-zinc-500 text-sm mb-1">Total Supply</p>
                  <p className="text-xl font-bold">{token.supply}</p>
                </div>
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                  <p className="text-zinc-500 text-sm mb-1">Holders</p>
                  <p className="text-xl font-bold">{token.holders}</p>
                </div>
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                  <p className="text-zinc-500 text-sm mb-1">Total Trades</p>
                  <p className="text-xl font-bold">{token.totalTrades}</p>
                </div>
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                  <p className="text-zinc-500 text-sm mb-1">Volume (All)</p>
                  <p className="text-xl font-bold text-emerald-400">{formatSol(token.volumeAll)} SOL</p>
                </div>
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                  <p className="text-zinc-500 text-sm mb-1">Reserve</p>
                  <p className="text-xl font-bold">{formatSol(token.reserveSOL)} SOL</p>
                </div>
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                  <p className="text-zinc-500 text-sm mb-1">All-Time High</p>
                  <p className="text-xl font-bold text-emerald-400">{formatSol(token.allTimeHigh)} SOL</p>
                </div>
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                  <p className="text-zinc-500 text-sm mb-1">All-Time Low</p>
                  <p className="text-xl font-bold text-red-400">{formatSol(token.allTimeLow)} SOL</p>
                </div>
              </div>

              {/* Token Economics */}
              <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6">
                <h2 className="text-xl font-semibold mb-4">Token Economics</h2>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm text-zinc-400 mb-2">Bonding Curve</h3>
                    <p className="text-lg font-semibold">
                      {token.type === 'CREATOR' ? 'Linear' : 'Exponential'}
                    </p>
                    <p className="text-sm text-zinc-500 mt-1">
                      {token.type === 'CREATOR' 
                        ? `Price = ${formatSol(token.params.basePrice)} + (Supply × ${formatSol(token.params.slope || 0)})`
                        : `Price = ${formatSol(token.params.basePrice)} × (1 + ${((token.params.growthRate || 0) * 100).toFixed(1)}%)^Supply`
                      }
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm text-zinc-400 mb-2">Fee Structure</h3>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Creator Fee</span>
                        <span className={token.type === 'CREATOR' ? 'text-purple-400' : 'text-cyan-400'}>
                          {(token.params.creatorFeePercent * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Platform Fee</span>
                        <span className="text-zinc-300">
                          {(token.params.platformFeePercent * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Trades */}
              <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6">
                <h2 className="text-xl font-semibold mb-4">Recent Trades</h2>
                {recentTrades.length > 0 ? (
                  <div className="space-y-2">
                    {recentTrades.map(trade => (
                      <div
                        key={trade.id}
                        className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            trade.type === 'BUY'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {trade.type}
                          </span>
                          <span className="text-zinc-300">{trade.amount} tokens</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            {formatSol(trade.totalCost)} SOL
                          </p>
                          <p className="text-xs text-zinc-500">
                            {formatDate(trade.timestamp)} {formatTime(trade.timestamp)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-zinc-500 text-center py-8">No trades yet</p>
                )}
              </div>
            </div>

            {/* Right Column - Trading Panel */}
            <div className="space-y-6">
              {/* Trading Panel */}
              <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 sticky top-28">
                <h2 className="text-xl font-semibold mb-4">Trade {token.symbol}</h2>
                
                {/* Buy/Sell Toggle */}
                <div className="flex bg-zinc-800 rounded-xl p-1 mb-6">
                  <button
                    onClick={() => setTradeAction('buy')}
                    className={`flex-1 py-2 rounded-lg font-semibold transition ${
                      tradeAction === 'buy'
                        ? 'bg-emerald-500 text-black'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Buy
                  </button>
                  <button
                    onClick={() => setTradeAction('sell')}
                    className={`flex-1 py-2 rounded-lg font-semibold transition ${
                      tradeAction === 'sell'
                        ? 'bg-red-500 text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Sell
                  </button>
                </div>

                {/* Amount Input */}
                <div className="mb-6">
                  <label className="block text-sm text-zinc-400 mb-2">Amount (tokens)</label>
                  <input
                    type="number"
                    value={tradeAmount}
                    onChange={(e) => setTradeAmount(Math.max(1, parseInt(e.target.value) || 0))}
                    min="1"
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-lg font-semibold focus:outline-none focus:border-zinc-500"
                  />
                  <div className="flex gap-2 mt-2">
                    {[10, 25, 50, 100].map(amount => (
                      <button
                        key={amount}
                        onClick={() => setTradeAmount(amount)}
                        className={`flex-1 py-1 rounded text-sm font-medium transition ${
                          tradeAmount === amount
                            ? 'bg-zinc-700 text-white'
                            : 'bg-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {amount}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cost Breakdown */}
                {tradePreview && (
                  <div className="bg-zinc-800 rounded-xl p-4 mb-6">
                    <h3 className="text-sm text-zinc-400 mb-3">
                      {tradeAction === 'buy' ? 'Cost Breakdown' : 'Refund Breakdown'}
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">
                          {tradeAction === 'buy' ? 'Token Cost' : 'Gross Refund'}
                        </span>
                        <span className="text-white">
                          {formatSol(tradePreview.tokenCost || tradePreview.grossRefund || 0)} SOL
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">
                          Creator Fee ({(token.params.creatorFeePercent * 100).toFixed(0)}%)
                        </span>
                        <span className={token.type === 'CREATOR' ? 'text-purple-400' : 'text-cyan-400'}>
                          {tradeAction === 'buy' ? '+' : '-'}{formatSol(tradePreview.creatorFee)} SOL
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">
                          Platform Fee ({(token.params.platformFeePercent * 100).toFixed(0)}%)
                        </span>
                        <span className="text-zinc-300">
                          {tradeAction === 'buy' ? '+' : '-'}{formatSol(tradePreview.platformFee)} SOL
                        </span>
                      </div>
                      <div className="border-t border-zinc-700 pt-2 mt-2">
                        <div className="flex justify-between font-semibold">
                          <span className="text-white">
                            {tradeAction === 'buy' ? 'Total Cost' : 'Net Refund'}
                          </span>
                          <span className={tradeAction === 'buy' ? 'text-emerald-400' : 'text-red-400'}>
                            {formatSol(tradePreview.totalCost || tradePreview.netRefund || 0)} SOL
                          </span>
                        </div>
                        <div className="flex justify-between text-xs mt-1">
                          <span className="text-zinc-500">Price per token</span>
                          <span className="text-zinc-400">{formatSol(tradePreview.pricePerToken)} SOL</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* User Balance */}
                {DEMO_MODE && (
                  <div className="bg-zinc-800/50 rounded-xl p-3 mb-4 text-sm">
                    <div className="flex justify-between mb-1">
                      <span className="text-zinc-400">Your SOL</span>
                      <span className="text-white">{formatSol(userSolBalance)} SOL</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Your {token.symbol}</span>
                      <span className="text-white">{userBalance} tokens</span>
                    </div>
                  </div>
                )}

                {/* Trade Button */}
                <button
                  onClick={executeTrade}
                  disabled={
                    isTrading || 
                    tradeAmount <= 0 || 
                    (tradeAction === 'sell' && userBalance < tradeAmount) ||
                    !!(tradeAction === 'buy' && tradePreview && userSolBalance < (tradePreview.totalCost || 0))
                  }
                  className={`w-full py-4 rounded-xl font-semibold text-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${
                    tradeAction === 'buy'
                      ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-black hover:opacity-90'
                      : 'bg-gradient-to-r from-red-500 to-orange-500 text-white hover:opacity-90'
                  }`}
                >
                  {isTrading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="animate-spin w-5 h-5 border-2 border-current border-t-transparent rounded-full"></div>
                      Processing...
                    </span>
                  ) : tradeAction === 'buy' ? (
                    `Buy ${tradeAmount} ${token.symbol}`
                  ) : (
                    `Sell ${tradeAmount} ${token.symbol}`
                  )}
                </button>

                {/* Validation Messages */}
                {tradeAction === 'sell' && userBalance < tradeAmount && (
                  <p className="text-red-400 text-sm mt-2 text-center">
                    Insufficient token balance
                  </p>
                )}
                {tradeAction === 'buy' && tradePreview && userSolBalance < (tradePreview.totalCost || 0) && (
                  <p className="text-red-400 text-sm mt-2 text-center">
                    Insufficient SOL balance
                  </p>
                )}

                {/* New Price After Trade */}
                {tradePreview && (
                  <p className="text-xs text-zinc-500 mt-3 text-center">
                    Price after trade: {formatSol(tradePreview.newPrice)} SOL
                  </p>
                )}
              </div>

              {/* Video Embed for Video Tokens */}
              {token.type === 'VIDEO' && token.videoId && (
                <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
                  <div className="aspect-video bg-zinc-800">
                    <iframe
                      src={`https://www.youtube.com/embed/${token.videoId}`}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

