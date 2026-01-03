-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PoolType" AS ENUM ('CREATOR', 'STREAM');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('BUY', 'SELL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Creator" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "channelImage" TEXT,
    "channelBanner" TEXT,
    "subscriberCount" INTEGER NOT NULL DEFAULT 0,
    "videoCount" INTEGER NOT NULL DEFAULT 0,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiry" TIMESTAMP(3) NOT NULL,
    "coinCreated" BOOLEAN NOT NULL DEFAULT false,
    "coinAddress" TEXT,
    "metadataUri" TEXT,
    "autoApproveVideos" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Creator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "thumbnail" TEXT NOT NULL,
    "duration" INTEGER,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "isLiveStream" BOOLEAN NOT NULL DEFAULT false,
    "status" "VideoStatus" NOT NULL DEFAULT 'PENDING',
    "coinAddress" TEXT,
    "metadataUri" TEXT,
    "rejectedReason" TEXT,
    "tokenSupply" BIGINT NOT NULL DEFAULT 0,
    "reserveSol" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "poolType" "PoolType" NOT NULL,
    "poolAddress" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "avgBuyPrice" BIGINT NOT NULL DEFAULT 0,
    "totalCost" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "poolType" "PoolType" NOT NULL,
    "poolAddress" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "txType" "TransactionType" NOT NULL,
    "tokenAmount" BIGINT NOT NULL,
    "solAmount" BIGINT NOT NULL,
    "fee" BIGINT NOT NULL,
    "pricePerToken" BIGINT NOT NULL,
    "signature" TEXT NOT NULL,
    "slot" BIGINT,
    "blockTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolStats" (
    "id" TEXT NOT NULL,
    "poolAddress" TEXT NOT NULL,
    "poolType" "PoolType" NOT NULL,
    "identifier" TEXT NOT NULL,
    "displayName" TEXT,
    "totalSupply" BIGINT NOT NULL DEFAULT 0,
    "reserveSol" BIGINT NOT NULL DEFAULT 0,
    "currentPrice" BIGINT NOT NULL DEFAULT 0,
    "totalVolume24h" BIGINT NOT NULL DEFAULT 0,
    "totalVolumeAll" BIGINT NOT NULL DEFAULT 0,
    "totalTrades" INTEGER NOT NULL DEFAULT 0,
    "holders" INTEGER NOT NULL DEFAULT 0,
    "priceChange1h" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priceChange24h" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priceChange7d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "marketCap" BIGINT NOT NULL DEFAULT 0,
    "allTimeHigh" BIGINT NOT NULL DEFAULT 0,
    "allTimeLow" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoolStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceSnapshot" (
    "id" TEXT NOT NULL,
    "poolAddress" TEXT NOT NULL,
    "poolType" "PoolType" NOT NULL,
    "price" BIGINT NOT NULL,
    "supply" BIGINT NOT NULL,
    "reserve" BIGINT NOT NULL,
    "volume" BIGINT NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncState" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "lastSync" TIMESTAMP(3) NOT NULL,
    "lastProcessedId" TEXT,
    "metadata" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE INDEX "User_walletAddress_idx" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Creator_userId_key" ON "Creator"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Creator_channelId_key" ON "Creator"("channelId");

-- CreateIndex
CREATE INDEX "Creator_channelId_idx" ON "Creator"("channelId");

-- CreateIndex
CREATE INDEX "Creator_coinAddress_idx" ON "Creator"("coinAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Video_videoId_key" ON "Video"("videoId");

-- CreateIndex
CREATE INDEX "Video_videoId_idx" ON "Video"("videoId");

-- CreateIndex
CREATE INDEX "Video_creatorId_idx" ON "Video"("creatorId");

-- CreateIndex
CREATE INDEX "Video_status_idx" ON "Video"("status");

-- CreateIndex
CREATE INDEX "Video_coinAddress_idx" ON "Video"("coinAddress");

-- CreateIndex
CREATE INDEX "Holding_poolAddress_idx" ON "Holding"("poolAddress");

-- CreateIndex
CREATE INDEX "Holding_poolType_idx" ON "Holding"("poolType");

-- CreateIndex
CREATE UNIQUE INDEX "Holding_userId_poolAddress_key" ON "Holding"("userId", "poolAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_signature_key" ON "Transaction"("signature");

-- CreateIndex
CREATE INDEX "Transaction_poolAddress_idx" ON "Transaction"("poolAddress");

-- CreateIndex
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");

-- CreateIndex
CREATE INDEX "Transaction_signature_idx" ON "Transaction"("signature");

-- CreateIndex
CREATE UNIQUE INDEX "PoolStats_poolAddress_key" ON "PoolStats"("poolAddress");

-- CreateIndex
CREATE INDEX "PoolStats_poolType_totalVolume24h_idx" ON "PoolStats"("poolType", "totalVolume24h");

-- CreateIndex
CREATE INDEX "PoolStats_poolType_holders_idx" ON "PoolStats"("poolType", "holders");

-- CreateIndex
CREATE INDEX "PoolStats_poolType_priceChange24h_idx" ON "PoolStats"("poolType", "priceChange24h");

-- CreateIndex
CREATE INDEX "PriceSnapshot_poolAddress_timestamp_idx" ON "PriceSnapshot"("poolAddress", "timestamp");

-- CreateIndex
CREATE INDEX "PriceSnapshot_poolType_timestamp_idx" ON "PriceSnapshot"("poolType", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "SyncState_key_key" ON "SyncState"("key");

-- AddForeignKey
ALTER TABLE "Creator" ADD CONSTRAINT "Creator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
