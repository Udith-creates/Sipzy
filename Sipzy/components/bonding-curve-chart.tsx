'use client'

import { FC, useMemo } from 'react'
import { 
  calculateLinearPrice, 
  calculateExponentialPrice,
  DEFAULT_CREATOR_BASE_PRICE,
  DEFAULT_CREATOR_SLOPE,
  DEFAULT_STREAM_BASE_PRICE,
  DEFAULT_STREAM_GROWTH_RATE,
  LAMPORTS_PER_SOL,
} from '@/lib/program'

interface BondingCurveChartProps {
  type: 'creator' | 'stream'
  currentSupply: number
  basePrice?: number
  curveParam?: number
  width?: number
  height?: number
}

export const BondingCurveChart: FC<BondingCurveChartProps> = ({
  type,
  currentSupply,
  basePrice,
  curveParam,
  width = 300,
  height = 150,
}) => {
  const bp = basePrice || (type === 'creator' ? DEFAULT_CREATOR_BASE_PRICE : DEFAULT_STREAM_BASE_PRICE)
  const cp = curveParam || (type === 'creator' ? DEFAULT_CREATOR_SLOPE : DEFAULT_STREAM_GROWTH_RATE)
  
  const points = useMemo(() => {
    const pts: { x: number; y: number; supply: number; price: number }[] = []
    const maxSupply = Math.max(currentSupply * 2, 100)
    const steps = 50
    
    let maxPrice = 0
    
    for (let i = 0; i <= steps; i++) {
      const supply = Math.floor((i / steps) * maxSupply)
      const price = type === 'creator'
        ? calculateLinearPrice(supply, bp, cp)
        : calculateExponentialPrice(supply, bp, cp)
      
      maxPrice = Math.max(maxPrice, price)
      pts.push({ supply, price, x: 0, y: 0 })
    }
    
    // Normalize to SVG coordinates
    const padding = 20
    const chartWidth = width - padding * 2
    const chartHeight = height - padding * 2
    
    return pts.map(pt => ({
      ...pt,
      x: padding + (pt.supply / maxSupply) * chartWidth,
      y: padding + chartHeight - (pt.price / maxPrice) * chartHeight,
    }))
  }, [type, currentSupply, bp, cp, width, height])
  
  const currentPoint = useMemo(() => {
    const price = type === 'creator'
      ? calculateLinearPrice(currentSupply, bp, cp)
      : calculateExponentialPrice(currentSupply, bp, cp)
    
    const maxSupply = Math.max(currentSupply * 2, 100)
    const maxPrice = Math.max(...points.map(p => p.price))
    const padding = 20
    const chartWidth = width - padding * 2
    const chartHeight = height - padding * 2
    
    return {
      x: padding + (currentSupply / maxSupply) * chartWidth,
      y: padding + chartHeight - (price / maxPrice) * chartHeight,
      price,
    }
  }, [type, currentSupply, bp, cp, points, width, height])
  
  const pathD = points.length > 0
    ? `M ${points[0].x} ${points[0].y} ${points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')}`
    : ''
  
  const gradientId = `curve-gradient-${type}`
  const curveColor = type === 'creator' ? '#a855f7' : '#06b6d4' // purple / cyan
  
  return (
    <div className="relative">
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={curveColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={curveColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        
        {/* Filled area */}
        <path
          d={`${pathD} L ${points[points.length - 1]?.x || 0} ${height - 20} L 20 ${height - 20} Z`}
          fill={`url(#${gradientId})`}
        />
        
        {/* Curve line */}
        <path
          d={pathD}
          fill="none"
          stroke={curveColor}
          strokeWidth="2"
          strokeLinecap="round"
        />
        
        {/* Current position indicator */}
        <circle
          cx={currentPoint.x}
          cy={currentPoint.y}
          r="6"
          fill={curveColor}
          stroke="white"
          strokeWidth="2"
        />
        
        {/* Vertical line to current position */}
        <line
          x1={currentPoint.x}
          y1={currentPoint.y}
          x2={currentPoint.x}
          y2={height - 20}
          stroke={curveColor}
          strokeWidth="1"
          strokeDasharray="4,4"
          opacity="0.5"
        />
      </svg>
      
      {/* Labels */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-zinc-500 px-5">
        <span>0</span>
        <span>Supply: {currentSupply}</span>
      </div>
      
      {/* Current price tooltip */}
      <div 
        className="absolute px-2 py-1 bg-zinc-800 rounded text-xs text-white border border-zinc-700"
        style={{
          left: `${currentPoint.x}px`,
          top: `${currentPoint.y - 30}px`,
          transform: 'translateX(-50%)',
        }}
      >
        {(currentPoint.price / LAMPORTS_PER_SOL).toFixed(4)} SOL
      </div>
    </div>
  )
}

export default BondingCurveChart

