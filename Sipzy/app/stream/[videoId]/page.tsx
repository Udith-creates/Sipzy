'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { YouTubePlayer } from '@/components/youtube-player'
import { BondingCurveChart } from '@/components/bonding-curve-chart'
import { 
  deriveStreamPoolPDA, 
  fetchPoolState, 
  calculateBuyCost, 
  calculateSellRefund,
  LAMPORTS_PER_SOL,
  PoolType,
} from '@/lib/program'

interface PageParams {
  videoId: string
}

export default function StreamPage({ params }: { params: Promise<PageParams> }) {
  const { videoId } = use(params)
  const { connection } = useConnection()
  const { publicKey, connected } = useWallet()
  
  const [poolData, setPoolData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [tradeTab, setTradeTab] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')
  const [estimatedCost, setEstimatedCost] = useState(0)

  useEffect(() => {
    async function fetchPool() {
      try {
        const [poolAddress] = deriveStreamPoolPDA(videoId)
        const state = await fetchPoolState(connection, poolAddress)
        
        if (state) {
          setPoolData({
            ...state,
            address: poolAddress.toString(),
          })
        } else {
          // Fetch from API for video metadata
          const res = await fetch(`/api/search?q=${videoId}`)
          const data = await res.json()
          if (data.youtube) {
            setPoolData({ youtube: data.youtube, notCreated: true })
          }
        }
      } catch (error) {
        console.error('Failed to fetch pool:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchPool()
  }, [videoId, connection])

  useEffect(() => {
    if (!poolData || poolData.notCreated || !amount) {
      setEstimatedCost(0)
      return
    }
    
    const qty = parseInt(amount) || 0
    if (qty <= 0) {
      setEstimatedCost(0)
      return
    }
    
    if (tradeTab === 'buy') {
      const { total } = calculateBuyCost(poolData, qty)
      setEstimatedCost(total)
    } else {
      const { net } = calculateSellRefund(poolData, qty)
      setEstimatedCost(net)
    }
  }, [amount, tradeTab, poolData])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  const currentSupply = poolData?.totalSupply?.toNumber() || 0
  const currentPrice = poolData?.totalSupply 
    ? Math.floor(poolData.basePrice.toNumber() * Math.pow(1 + poolData.curveParam.toNumber() / 10000, currentSupply))
    : 1000000

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-zinc-800">
        <div className="flex items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center font-bold text-black text-lg">
              S
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              Sipzy
            </span>
          </Link>
          
          <div className="flex items-center gap-4">
            <span className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-full text-sm font-semibold">
              $STREAM
            </span>
            <WalletMultiButton className="!bg-zinc-800 !rounded-xl !h-10" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex pt-[73px] min-h-screen">
        {/* Video Section */}
        <main className="flex-1 p-6 lg:p-8">
          <div className="max-w-4xl mx-auto">
            <YouTubePlayer videoId={videoId} />
            
            {/* Video Info */}
            <div className="mt-6 p-6 bg-zinc-900 rounded-2xl border border-zinc-800">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 text-xs rounded-full font-semibold">
                  $STREAM Coin
                </span>
                <span className="text-zinc-500 text-sm">Exponential Curve</span>
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">
                {poolData?.displayName || poolData?.youtube?.title || 'Video'}
              </h1>
              <p className="text-zinc-400 mb-4">
                Stream coins use an exponential bonding curve - price starts cheap but moons rapidly!
                Early supporters get the best prices.
              </p>
              
              {/* Curve Explanation */}
              <div className="p-4 bg-zinc-800 rounded-xl">
                <p className="text-sm text-zinc-400">
                  <span className="text-cyan-400 font-mono">Price = Base × (1.05)^Supply</span>
                  <br />
                  Each token purchase increases the price by 5%. First movers advantage!
                </p>
              </div>
            </div>
          </div>
        </main>

        {/* Trading Sidebar */}
        <aside className="hidden lg:block w-[400px] flex-shrink-0">
          <div className="fixed top-[73px] right-0 w-[400px] h-[calc(100vh-73px)] overflow-y-auto p-6 border-l border-zinc-800">
            {poolData?.notCreated ? (
              /* Pool Not Created */
              <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold mb-2">Coin Not Available</h3>
                <p className="text-zinc-400 text-sm">
                  {poolData?.youtube?.channelName 
                    ? `The creator "${poolData.youtube.channelName}" hasn't enabled $STREAM coins for this video yet.`
                    : 'This video does not have a $STREAM coin yet.'}
                </p>
              </div>
            ) : (
              /* Trading Panel */
              <>
                <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 mb-6">
                  <h2 className="text-lg font-bold text-cyan-400 mb-4">
                    HYPE CURVE
                  </h2>
                  
                  {/* Price & Stats */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <p className="text-zinc-500 text-xs mb-1">Current Price</p>
                      <p className="text-2xl font-bold text-white">
                        {(currentPrice / LAMPORTS_PER_SOL).toFixed(4)} SOL
                      </p>
                    </div>
                    <div>
                      <p className="text-zinc-500 text-xs mb-1">Supply</p>
                      <p className="text-2xl font-bold text-white">
                        {currentSupply.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Chart */}
                  <div className="mb-6">
                    <BondingCurveChart
                      type="stream"
                      currentSupply={currentSupply}
                      basePrice={poolData?.basePrice?.toNumber()}
                      curveParam={poolData?.curveParam?.toNumber()}
                      width={340}
                      height={160}
                    />
                  </div>

                  {/* Trade Tabs */}
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => setTradeTab('buy')}
                      className={`flex-1 py-2.5 rounded-xl font-semibold transition ${
                        tradeTab === 'buy'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      Buy
                    </button>
                    <button
                      onClick={() => setTradeTab('sell')}
                      className={`flex-1 py-2.5 rounded-xl font-semibold transition ${
                        tradeTab === 'sell'
                          ? 'bg-red-500 text-white'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      Sell
                    </button>
                  </div>

                  {/* Amount Input */}
                  <div className="mb-4">
                    <label className="text-zinc-500 text-xs mb-2 block">
                      Amount (tokens)
                    </label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-lg focus:border-cyan-500 focus:outline-none"
                    />
                  </div>

                  {/* Estimated Cost */}
                  <div className="p-4 bg-zinc-800 rounded-xl mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">
                        {tradeTab === 'buy' ? 'Total Cost' : 'You Receive'}
                      </span>
                      <span className="text-white font-semibold">
                        {(estimatedCost / LAMPORTS_PER_SOL).toFixed(4)} SOL
                      </span>
                    </div>
                    <div className="flex justify-between text-xs mt-2">
                      <span className="text-zinc-500">Fee (1%)</span>
                      <span className="text-zinc-500">
                        {((estimatedCost * 0.01) / LAMPORTS_PER_SOL).toFixed(6)} SOL
                      </span>
                    </div>
                  </div>

                  {/* Trade Button */}
                  {!connected ? (
                    <WalletMultiButton className="!w-full !bg-gradient-to-r !from-emerald-500 !to-cyan-500 !rounded-xl !h-12 !font-semibold !justify-center" />
                  ) : (
                    <button
                      disabled={!amount || parseInt(amount) <= 0}
                      className={`w-full py-3 rounded-xl font-semibold transition ${
                        tradeTab === 'buy'
                          ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:opacity-90'
                          : 'bg-gradient-to-r from-red-500 to-orange-500 text-white hover:opacity-90'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {tradeTab === 'buy' ? 'Buy Tokens' : 'Sell Tokens'}
                    </button>
                  )}
                </div>

                {/* Reserve Info */}
                <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Total Reserve</span>
                    <span className="text-white">
                      {((poolData?.reserveSol?.toNumber() || 0) / LAMPORTS_PER_SOL).toFixed(4)} SOL
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

