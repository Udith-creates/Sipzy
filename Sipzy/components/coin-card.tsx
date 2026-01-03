'use client'

import { FC } from 'react'
import Link from 'next/link'
import { formatSol, formatPriceChange } from '@/lib/program'

interface CoinCardProps {
  type: 'creator' | 'stream'
  address: string
  identifier: string
  displayName: string
  image?: string | null
  currentPrice: number
  priceChange24h: number
  totalSupply: string
  holders: number
  volume24h: string
  channelName?: string
}

export const CoinCard: FC<CoinCardProps> = ({
  type,
  address,
  identifier,
  displayName,
  image,
  currentPrice,
  priceChange24h,
  totalSupply,
  holders,
  volume24h,
  channelName,
}) => {
  const isPositive = priceChange24h >= 0
  const href = type === 'creator' ? `/creator/${identifier}` : `/stream/${identifier}`
  
  return (
    <Link href={href}>
      <div className="group bg-zinc-900 rounded-2xl border border-zinc-800 p-5 hover:border-zinc-700 transition-all hover:bg-zinc-800/50 cursor-pointer">
        {/* Header */}
        <div className="flex items-start gap-4 mb-4">
          <div className="relative">
            {image ? (
              <img
                src={image}
                alt={displayName}
                className="w-14 h-14 rounded-xl object-cover"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
                <span className="text-2xl font-bold text-white">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <span className={`absolute -bottom-1 -right-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
              type === 'creator' 
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
            }`}>
              {type === 'creator' ? '$C' : '$S'}
            </span>
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white truncate group-hover:text-emerald-400 transition">
              {displayName}
            </h3>
            {channelName && type === 'stream' && (
              <p className="text-sm text-zinc-500 truncate">by {channelName}</p>
            )}
            <p className="text-xs text-zinc-600 truncate">{identifier}</p>
          </div>
        </div>
        
        {/* Price */}
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-xs text-zinc-500">Price</p>
            <p className="text-xl font-bold text-white">
              {formatSol(currentPrice)} SOL
            </p>
          </div>
          <div className={`px-2 py-1 rounded-lg text-sm font-semibold ${
            isPositive 
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'bg-red-500/10 text-red-400'
          }`}>
            {formatPriceChange(priceChange24h)}
          </div>
        </div>
        
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 pt-4 border-t border-zinc-800">
          <div>
            <p className="text-xs text-zinc-500">Supply</p>
            <p className="text-sm font-semibold text-zinc-300">
              {parseInt(totalSupply).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Holders</p>
            <p className="text-sm font-semibold text-zinc-300">
              {holders.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Vol 24h</p>
            <p className="text-sm font-semibold text-zinc-300">
              {formatSol(parseInt(volume24h))}
            </p>
          </div>
        </div>
      </div>
    </Link>
  )
}

export default CoinCard

