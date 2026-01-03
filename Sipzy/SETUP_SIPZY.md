# Sipzy Setup Guide

Complete setup instructions for the Sipzy Dual-Token Creator Economy Platform.

---

## 📋 Prerequisites

Install the following before starting:

| Tool | Version | Installation |
|------|---------|--------------|
| Node.js | v18+ | [nodejs.org](https://nodejs.org/) |
| pnpm | v8+ | `npm install -g pnpm` |
| Rust | latest | [rustup.rs](https://rustup.rs/) |
| Solana CLI | v1.18+ | [docs.solana.com](https://docs.solana.com/cli/install-solana-cli-tools) |
| Anchor CLI | v0.30.1 | `cargo install --git https://github.com/coral-xyz/anchor anchor-cli --tag v0.30.1` |
| PostgreSQL | v14+ | [postgresql.org](https://www.postgresql.org/download/) |

---

## 🚀 Quick Start

### Step 1: Clone & Install Dependencies

```bash
cd Sipzy
pnpm install
```

### Step 2: Set Up PostgreSQL Database

#### Option A: Local PostgreSQL

```bash
# Install PostgreSQL (Ubuntu/Debian)
sudo apt update
sudo apt install postgresql postgresql-contrib

# Start PostgreSQL
sudo systemctl start postgresql

# Create database
sudo -u postgres psql
```

```sql
-- In PostgreSQL shell:
CREATE DATABASE sipzy;
CREATE USER sipzy_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE sipzy TO sipzy_user;
\q
```

#### Option B: Docker PostgreSQL

```bash
docker run --name sipzy-postgres \
  -e POSTGRES_DB=sipzy \
  -e POSTGRES_USER=sipzy_user \
  -e POSTGRES_PASSWORD=your_secure_password \
  -p 5432:5432 \
  -d postgres:14
```

#### Option C: Cloud PostgreSQL (Recommended for Production)

Use services like:
- [Supabase](https://supabase.com/) (Free tier available)
- [Neon](https://neon.tech/) (Serverless PostgreSQL)
- [Railway](https://railway.app/)
- [PlanetScale](https://planetscale.com/) (MySQL alternative)

### Step 3: Configure Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local` with your values (see detailed guide below).

### Step 4: Run Database Migrations

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev --name init

# (Optional) View database in browser
npx prisma studio
```

### Step 5: Build Solana Program

```bash
anchor build
```

### Step 6: Start Development

**Terminal 1 - Local Validator (for localnet):**
```bash
solana-test-validator
```

**Terminal 2 - Deploy & Run:**
```bash
# Deploy program
anchor deploy --provider.cluster localnet

# Start Next.js dev server
pnpm dev
```

Visit `http://localhost:3000`

---

## 🔧 Environment Variables Guide

### Complete `.env.local` Example

```env
# ============================================
# DATABASE
# ============================================

# PostgreSQL connection string
# Format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE
DATABASE_URL="postgresql://sipzy_user:your_secure_password@localhost:5432/sipzy"

# ============================================
# SOLANA CONFIGURATION
# ============================================

# Program ID (generated after first `anchor build`)
NEXT_PUBLIC_PROGRAM_ID=22RS3cJfjadwGqLdqCTJ4xfYRbjA5n4baamC28v8675r

# Treasury wallet (receives platform fees)
# Get by running: solana address
NEXT_PUBLIC_TREASURY_ADDRESS=<your_wallet_address>

# RPC URL
# Localnet: http://127.0.0.1:8899
# Devnet: https://api.devnet.solana.com
# Mainnet: Use private RPC (Helius, QuickNode, etc.)
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8899

# Cluster (localnet, devnet, mainnet-beta)
NEXT_PUBLIC_CLUSTER=localnet

# ============================================
# YOUTUBE OAUTH (Required for Creators)
# ============================================

# Get from Google Cloud Console
YOUTUBE_CLIENT_ID=<your_google_client_id>
YOUTUBE_CLIENT_SECRET=<your_google_client_secret>
YOUTUBE_REDIRECT_URI=http://localhost:3000/api/auth/youtube/callback

# Public YouTube API key (for fetching video info)
YOUTUBE_API_KEY=<your_youtube_api_key>

# ============================================
# PINATA / IPFS (Token Metadata Storage)
# ============================================

# Get from https://app.pinata.cloud/
PINATA_JWT=<your_pinata_jwt>
NEXT_PUBLIC_PINATA_GATEWAY=gateway.pinata.cloud

# ============================================
# AUTHENTICATION
# ============================================

# Generate with: openssl rand -hex 32
JWT_SECRET=<your_random_32_byte_hex_string>

# Cron job authentication (for video sync)
CRON_SECRET=<your_cron_secret>

# ============================================
# x402 CONFIGURATION (Optional - Premium Content)
# ============================================

NEXT_PUBLIC_RECEIVER_ADDRESS=<your_wallet_address>
NEXT_PUBLIC_NETWORK=solana-devnet
NEXT_PUBLIC_FACILITATOR_URL=https://x402.org/facilitator
NEXT_PUBLIC_CDP_CLIENT_KEY=<your_cdp_key>

# ============================================
# APP CONFIGURATION
# ============================================

NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=Sipzy
```

---

## 🎬 Setting Up YouTube OAuth

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (e.g., "Sipzy")
3. Enable the **YouTube Data API v3**:
   - Go to "APIs & Services" → "Enable APIs and Services"
   - Search for "YouTube Data API v3"
   - Click "Enable"

### Step 2: Configure OAuth Consent Screen

1. Go to "APIs & Services" → "OAuth consent screen"
2. Choose "External" user type
3. Fill in app information:
   - App name: Sipzy
   - User support email: your email
   - Developer contact: your email
4. Add scopes:
   - `https://www.googleapis.com/auth/youtube.readonly`
   - `https://www.googleapis.com/auth/userinfo.profile`
5. Add test users (your email) if in testing mode

### Step 3: Create OAuth Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: **Web application**
4. Name: "Sipzy Web"
5. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/youtube/callback` (development)
   - `https://yourdomain.com/api/auth/youtube/callback` (production)
6. Copy the **Client ID** and **Client Secret**

### Step 4: Create API Key (for public video data)

1. Go to "Credentials" → "Create Credentials" → "API Key"
2. (Optional) Restrict to YouTube Data API v3
3. Copy the API key

---

## 📌 Setting Up Pinata (IPFS)

### Step 1: Create Account

1. Go to [Pinata](https://app.pinata.cloud/)
2. Sign up for a free account

### Step 2: Generate JWT Token

1. Go to "API Keys" section
2. Click "New Key"
3. Enable all permissions (or customize)
4. Copy the **JWT** token

### Step 3: Configure Gateway

By default, use `gateway.pinata.cloud` or set up a dedicated gateway for production.

---

## 🔐 Authentication Flow

### Wallet Authentication (Users)

```
1. User clicks "Connect Wallet"
2. Phantom/Solflare connects
3. User clicks "Sign In"
4. Frontend requests nonce from /api/auth/nonce
5. User signs message with wallet
6. Backend verifies signature
7. JWT token issued, stored in cookie
```

### YouTube OAuth (Creators)

```
1. Creator clicks "Become Creator"
2. Redirect to Google OAuth
3. Creator grants YouTube access
4. Callback receives tokens
5. Fetch channel info from YouTube API
6. Store in Creator database record
```

---

## 💰 Dual Token System

### $CREATOR Coins (Linear Curve)

- **Formula:** `Price = Slope × Supply + BasePrice`
- **Default Base:** 0.01 SOL
- **Default Slope:** 0.0001 SOL per token
- **Use Case:** Long-term equity in creator's career

### $STREAM Coins (Exponential Curve)

- **Formula:** `Price = BasePrice × (1 + GrowthRate)^Supply`
- **Default Base:** 0.001 SOL
- **Default Growth:** 5% per token
- **Use Case:** Event-based hype for videos/streams

### Fee Structure

- **1% on every trade** sent to creator wallet
- Creator receives fees from both their $CREATOR and all their $STREAM coins

---

## 🗃️ Database Schema Overview

```
User
├── walletAddress (unique)
├── holdings[] (token balances)
├── transactions[] (trade history)
└── creator? (if they're a creator)

Creator
├── channelId (YouTube)
├── channelName
├── coinCreated (bool)
├── coinAddress (on-chain PDA)
├── videos[] (detected videos)
└── OAuth tokens

Video
├── videoId (YouTube)
├── title, thumbnail
├── status (PENDING/APPROVED/REJECTED)
├── coinAddress (if approved)
└── creator relation

PoolStats
├── poolAddress (on-chain)
├── poolType (CREATOR/STREAM)
├── price, volume, holders
└── priceChange24h
```

---

## 📊 API Routes Reference

### Authentication
| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/nonce` | GET | Get signing nonce |
| `/api/auth/verify` | POST | Verify wallet signature |
| `/api/auth/youtube` | GET | Start YouTube OAuth |
| `/api/auth/youtube/callback` | GET | OAuth callback |
| `/api/auth/logout` | POST | Clear session |

### Creator
| Route | Method | Description |
|-------|--------|-------------|
| `/api/creator/profile` | GET | Get creator profile |
| `/api/creator/profile` | PATCH | Update settings |
| `/api/creator/videos` | GET | List videos |
| `/api/creator/videos/[id]` | PATCH | Approve/reject video |

### Discovery
| Route | Method | Description |
|-------|--------|-------------|
| `/api/discover/creators` | GET | Top creator coins |
| `/api/discover/streams` | GET | Top stream coins |
| `/api/discover/trending` | GET | Combined trending |
| `/api/search` | GET | Search by URL/name |

### Pools
| Route | Method | Description |
|-------|--------|-------------|
| `/api/pool/[address]` | GET | Get pool details |

### Cron Jobs
| Route | Method | Description |
|-------|--------|-------------|
| `/api/cron/sync-videos` | POST | Sync new videos |
| `/api/cron/update-stats` | POST | Update pool stats |

---

## 🧪 Testing

### Run Solana Tests

```bash
anchor test
```

### Test Database Connection

```bash
npx prisma db push --force-reset
npx prisma studio
```

### Test API Endpoints

```bash
# Health check
curl http://localhost:3000/api/discover/trending

# Search
curl "http://localhost:3000/api/search?q=https://youtube.com/watch?v=dQw4w9WgXcQ"
```

---

## 🐛 Troubleshooting

### Database Connection Failed

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test connection
psql -h localhost -U sipzy_user -d sipzy
```

### YouTube OAuth Error

- Check redirect URI matches exactly (including trailing slash)
- Ensure API is enabled in Google Cloud Console
- Check OAuth consent screen is configured

### Prisma Migration Issues

```bash
# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# Regenerate client
npx prisma generate
```

### "Pool not found" Error

- Ensure local validator is running: `solana-test-validator`
- Check program is deployed: `anchor deploy`
- Verify NEXT_PUBLIC_PROGRAM_ID matches deployed address

---

## 🚢 Production Deployment

### 1. Deploy Database

Use a managed PostgreSQL service (Supabase, Neon, etc.)

### 2. Deploy Solana Program

```bash
# Configure for mainnet
solana config set --url mainnet-beta

# Deploy (requires ~2-3 SOL)
anchor deploy --provider.cluster mainnet
```

### 3. Configure Production Environment

```env
DATABASE_URL="postgresql://..."
NEXT_PUBLIC_RPC_URL="https://your-private-rpc.com"
NEXT_PUBLIC_CLUSTER="mainnet-beta"
JWT_SECRET="<secure-random-string>"
```

### 4. Set Up Cron Jobs

Use Vercel Cron, Railway Cron, or external services:

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/sync-videos",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/cron/update-stats",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

### 5. Security Checklist

- [ ] Smart contract audited
- [ ] Rate limiting on API routes
- [ ] HTTPS enabled
- [ ] Environment variables secured
- [ ] YouTube OAuth in production mode
- [ ] Database backups configured

---

## 📚 Resources

- [Solana Docs](https://docs.solana.com/)
- [Anchor Book](https://www.anchor-lang.com/)
- [Prisma Docs](https://www.prisma.io/docs)
- [YouTube API Docs](https://developers.google.com/youtube/v3)
- [Pinata Docs](https://docs.pinata.cloud/)
- [x402 Protocol](https://x402.org/)

---

**Built with ❤️ for the Creator Economy**
