# Sipzy Setup Guide

Complete setup instructions for the Sipzy Watch-to-Trade platform.

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

---

## 🚀 Quick Start (Localnet)

### Step 1: Install Dependencies

```bash
cd Sipzy
pnpm install
```

### Step 2: Build the Anchor Program

```bash
anchor build
```

### Step 3: Run Tests (includes local validator)

```bash
anchor test
```

If all tests pass, your program is working! ✅

### Step 4: Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your values (see [Environment Variables Guide](#-environment-variables-guide) below).

### Step 5: Start Development Server

```bash
pnpm dev
```

Visit `http://localhost:3000`

---

## 🔧 Environment Variables Guide

Here's how to get each value for your `.env.local`:

### For Localnet Development

```env
# ========================================
# SOLANA CONFIGURATION
# ========================================

# Your program ID (already set after anchor build)
NEXT_PUBLIC_PROGRAM_ID=22RS3cJfjadwGqLdqCTJ4xfYRbjA5n4baamC28v8675r

# Your wallet address (for receiving trading fees)
# Get it by running: solana address
NEXT_PUBLIC_TREASURY_ADDRESS=<your_wallet_address>

# LOCALNET RPC URL (local validator)
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8899

# Cluster setting
NEXT_PUBLIC_CLUSTER=localnet

# ========================================
# x402 CONFIGURATION (Optional for localnet)
# ========================================

# Same as treasury address
NEXT_PUBLIC_RECEIVER_ADDRESS=<your_wallet_address>

# For localnet, x402 won't work (needs real network)
# Use devnet for testing x402 payments
NEXT_PUBLIC_NETWORK=solana-devnet

NEXT_PUBLIC_FACILITATOR_URL=https://x402.org/facilitator

# Get from https://portal.cdp.coinbase.com/ (free)
NEXT_PUBLIC_CDP_CLIENT_KEY=<your_cdp_key>

# ========================================
# APP CONFIGURATION
# ========================================

NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=Sipzy
```

### How to Get Each Value

| Variable | How to Get It |
|----------|---------------|
| `NEXT_PUBLIC_PROGRAM_ID` | Already set! Your program ID is `22RS3cJfjadwGqLdqCTJ4xfYRbjA5n4baamC28v8675r` |
| `NEXT_PUBLIC_TREASURY_ADDRESS` | Run `solana address` in terminal |
| `NEXT_PUBLIC_RPC_URL` | **Localnet:** `http://127.0.0.1:8899`<br>**Devnet:** `https://api.devnet.solana.com` |
| `NEXT_PUBLIC_CLUSTER` | `localnet`, `devnet`, or `mainnet-beta` |
| `NEXT_PUBLIC_RECEIVER_ADDRESS` | Same as treasury address (your wallet) |
| `NEXT_PUBLIC_CDP_CLIENT_KEY` | See [Getting CDP Key](#getting-cdp-client-key) below |

---

## 🔑 Getting CDP Client Key

The CDP (Coinbase Developer Platform) key is needed for x402 payments. Here's how to get one:

1. Go to [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com/)
2. Sign up or log in
3. Create a new project
4. Go to **API Keys** section
5. Create a new API key
6. Copy the **Client Key** (not the secret!)

**Note:** For localnet testing without x402, you can skip this or use a placeholder.

---

## 🖥️ Running on Localnet

### Option A: Using `anchor test` (Recommended)

This automatically starts a local validator, deploys your program, and runs tests:

```bash
anchor test
```

### Option B: Manual Setup

**Terminal 1 - Start Local Validator:**
```bash
solana-test-validator
```

**Terminal 2 - Deploy and Run:**
```bash
# Configure for localnet
solana config set --url localhost

# Check your balance (should have SOL on localnet)
solana balance

# Deploy the program
anchor deploy --provider.cluster localnet

# Start the app
pnpm dev
```

---

## 🌐 Running on Devnet

### Step 1: Configure Solana CLI

```bash
solana config set --url devnet
```

### Step 2: Create/Check Wallet

```bash
# Check if you have a wallet
solana address

# If not, create one
solana-keygen new -o ~/.config/solana/id.json
```

### Step 3: Get Devnet SOL

```bash
# Try CLI airdrop
solana airdrop 2

# If rate limited, use the web faucet:
# https://faucet.solana.com
# Paste your address from: solana address
```

### Step 4: Update Anchor.toml

```toml
[provider]
cluster = "devnet"  # Change from "localnet"
wallet = "~/.config/solana/id.json"
```

### Step 5: Deploy to Devnet

```bash
anchor deploy
```

### Step 6: Update .env.local

```env
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_CLUSTER=devnet
NEXT_PUBLIC_NETWORK=solana-devnet
```

---

## 📁 Project Structure

```
Sipzy/
├── app/                          # Next.js pages
│   ├── api/actions/              # Solana Blinks API
│   │   ├── route.ts              # Actions discovery
│   │   └── trade/route.ts        # Trading endpoint
│   ├── watch/[id]/               # Watch & trade pages
│   │   ├── page.tsx              # Main watch page
│   │   └── premium/page.tsx      # x402 gated content
│   └── page.tsx                  # Home page
├── components/                   # React components
│   ├── providers/
│   │   └── wallet-provider.tsx   # Wallet adapter setup
│   ├── trading-sidebar.tsx       # Buy/sell widget
│   └── youtube-player.tsx        # Video embed
├── lib/                          # Utilities
│   ├── idl/sipzy_vault.json      # Program IDL
│   └── program.ts                # Program helpers
├── programs/sipzy_vault/         # Anchor program
│   └── src/lib.rs                # Smart contract (Rust)
├── tests/                        # Integration tests
│   └── sipzy_vault.ts            # Test suite
├── target/                       # Build output
│   ├── deploy/                   # Deployed program files
│   ├── idl/                      # Generated IDL
│   └── types/                    # TypeScript types
├── middleware.ts                 # x402 payment gate
├── Anchor.toml                   # Anchor config
├── .env.example                  # Environment template
└── package.json                  # Dependencies
```

---

## 🧪 Testing

### Run All Tests

```bash
anchor test
```

### Expected Output

```
  sipzy_vault
    ✔ Initializes a pool
    ✔ Buys tokens from the bonding curve
    ✔ Gets current token price
    ✔ Sells tokens back to the curve

  4 passing
```

### Test Individual Features

```bash
# Just build (no deploy/test)
anchor build

# Deploy only
anchor deploy --provider.cluster localnet

# Run tests against existing deployment
pnpm test
```

---

## 📈 Bonding Curve Formula

```
Price = (Supply × 0.0001) + 0.01 SOL
```

| Supply | Price (SOL) | Price (Lamports) |
|--------|-------------|------------------|
| 0 | 0.01 | 10,000,000 |
| 10 | 0.011 | 11,000,000 |
| 100 | 0.02 | 20,000,000 |
| 1,000 | 0.11 | 110,000,000 |

### Fee Structure

- **1% Trade Fee** — Every buy/sell sends 1% to creator wallet
- **x402 Premium Gate** — $0.01 USDC for premium content (optional)

---

## 🔗 Solana Actions (Blinks)

Share trading links that work on X/Twitter:

```
https://your-domain.com/api/actions/trade?id=<youtube_video_id>
```

### Example
```
https://sipzy.app/api/actions/trade?id=dQw4w9WgXcQ
```

When shared on X/Twitter, users see a trading card and can buy tokens directly!

---

## 🐛 Troubleshooting

### "Connection refused" on localhost:8899

The local validator isn't running. Start it:
```bash
solana-test-validator
```

Or use `anchor test` which starts it automatically.

### "Insufficient funds" error

**Localnet:** Local validator gives you free SOL. Check balance:
```bash
solana balance
```

**Devnet:** Get SOL from faucet:
```bash
solana airdrop 2
# Or use: https://faucet.solana.com
```

### "Program not found" error

The program isn't deployed to your current cluster:
```bash
# Check which cluster you're on
solana config get

# Deploy to that cluster
anchor deploy --provider.cluster <cluster>
```

### x402 payments not working on localnet

x402 requires a real Solana network (devnet/mainnet). For localnet:
- Skip x402 testing, OR
- Switch to devnet for x402 features

### Wallet won't connect

1. Make sure your wallet (Phantom/Solflare) is set to the same network
2. For localnet: Use Phantom → Settings → Developer Settings → Change Network to Localhost
3. Refresh the page

### Anchor build fails

```bash
# Update Rust
rustup update

# Clean and rebuild
anchor clean
anchor build
```

---

## 🚢 Production Deployment

### 1. Deploy Program to Mainnet

```bash
# Configure for mainnet
solana config set --url mainnet-beta

# Ensure you have SOL for deployment (~2-3 SOL)
solana balance

# Deploy
anchor deploy --provider.cluster mainnet
```

### 2. Update Environment

```env
NEXT_PUBLIC_RPC_URL=https://api.mainnet-beta.solana.com
NEXT_PUBLIC_CLUSTER=mainnet-beta
NEXT_PUBLIC_NETWORK=solana-mainnet-beta
```

### 3. Deploy Frontend

Deploy to Vercel, Netlify, or your preferred platform:
- Add all environment variables
- Update `NEXT_PUBLIC_BASE_URL` to your domain

### 4. Security Checklist

- [ ] Smart contract audited
- [ ] Rate limiting on API routes
- [ ] Error monitoring (Sentry, etc.)
- [ ] SSL/HTTPS enabled
- [ ] Environment variables secured

---

## 📚 Resources

- [Solana Docs](https://docs.solana.com/)
- [Anchor Book](https://www.anchor-lang.com/)
- [x402 Protocol](https://x402.org/)
- [Solana Actions](https://solana.com/docs/advanced/actions)
- [Wallet Adapter](https://github.com/solana-labs/wallet-adapter)

---

**Built with ❤️ for the Creator Economy**
