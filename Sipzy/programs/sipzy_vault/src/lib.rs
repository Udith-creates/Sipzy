use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("22RS3cJfjadwGqLdqCTJ4xfYRbjA5n4baamC28v8675r");

/// Sipzy Vault Program
/// Implements a Linear Bonding Curve for Creator Token Economy
/// Formula: Price = (Supply * 0.0001) + 0.01 SOL

#[program]
pub mod sipzy_vault {
    use super::*;

    /// Initialize a new token pool for a YouTube video/creator
    /// Creates a PDA that holds the bonding curve state
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        youtube_id: String,
        creator_wallet: Pubkey,
    ) -> Result<()> {
        require!(youtube_id.len() <= 32, SipzyError::YouTubeIdTooLong);
        
        let pool = &mut ctx.accounts.pool;
        pool.youtube_id = youtube_id;
        pool.creator_wallet = creator_wallet;
        pool.total_reserve_sol = 0;
        pool.circulating_supply = 0;
        pool.is_claimed = false;
        pool.bump = ctx.bumps.pool;
        pool.authority = ctx.accounts.authority.key();
        
        emit!(PoolInitialized {
            pool: pool.key(),
            youtube_id: pool.youtube_id.clone(),
            creator_wallet,
        });
        
        Ok(())
    }

    /// Buy tokens from the bonding curve
    /// Price = (Supply * 0.0001) + 0.01 SOL (in lamports: supply * 100_000 + 10_000_000)
    /// 1% fee goes to creator wallet
    pub fn buy_tokens(ctx: Context<BuyTokens>, amount: u64) -> Result<()> {
        require!(amount > 0, SipzyError::InvalidAmount);
        
        // Read current supply (immutable access first)
        let start_supply = ctx.accounts.pool.circulating_supply;
        let current_reserve = ctx.accounts.pool.total_reserve_sol;
        let end_supply = start_supply.checked_add(amount).ok_or(SipzyError::Overflow)?;
        
        // Calculate total cost using linear bonding curve integral
        // For buying 'amount' tokens starting from current supply:
        // Total = sum of prices from supply to supply + amount
        // Price(n) = n * 100_000 + 10_000_000 lamports
        // Integral of linear function: sum from start to end-1
        // = amount * base_price + slope * (sum of i from start to end-1)
        // = amount * 10_000_000 + 100_000 * (start + start+1 + ... + end-1)
        // = amount * 10_000_000 + 100_000 * amount * (start + end - 1) / 2
        let base_price_lamports: u64 = 10_000_000; // 0.01 SOL
        let slope_lamports: u64 = 100_000; // 0.0001 SOL
        
        let base_cost = amount.checked_mul(base_price_lamports).ok_or(SipzyError::Overflow)?;
        
        // Sum of arithmetic sequence: n * (first + last) / 2
        // where first = start_supply, last = end_supply - 1
        let sum_indices = if amount > 0 {
            let first = start_supply;
            let last = end_supply.checked_sub(1).ok_or(SipzyError::Overflow)?;
            amount.checked_mul(first.checked_add(last).ok_or(SipzyError::Overflow)?)
                .ok_or(SipzyError::Overflow)?
                .checked_div(2)
                .ok_or(SipzyError::Overflow)?
        } else {
            0
        };
        
        let slope_cost = sum_indices.checked_mul(slope_lamports).ok_or(SipzyError::Overflow)?;
        let total_cost = base_cost.checked_add(slope_cost).ok_or(SipzyError::Overflow)?;
        
        // Calculate 1% creator fee
        let creator_fee = total_cost.checked_div(100).ok_or(SipzyError::Overflow)?;
        let pool_deposit = total_cost.checked_sub(creator_fee).ok_or(SipzyError::Overflow)?;
        
        // Transfer SOL to pool (99%)
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.pool.to_account_info(),
                },
            ),
            pool_deposit,
        )?;
        
        // Transfer 1% fee to creator wallet
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.creator_wallet.to_account_info(),
                },
            ),
            creator_fee,
        )?;
        
        // Update pool state (mutable access after transfers)
        let pool = &mut ctx.accounts.pool;
        pool.total_reserve_sol = current_reserve.checked_add(pool_deposit).ok_or(SipzyError::Overflow)?;
        pool.circulating_supply = end_supply;
        
        emit!(TokensPurchased {
            pool: pool.key(),
            buyer: ctx.accounts.buyer.key(),
            amount,
            total_cost,
            creator_fee,
            new_supply: pool.circulating_supply,
        });
        
        Ok(())
    }

    /// Sell tokens back to the bonding curve
    /// Returns SOL to user and burns tokens
    pub fn sell_tokens(ctx: Context<SellTokens>, amount: u64) -> Result<()> {
        require!(amount > 0, SipzyError::InvalidAmount);
        
        let pool = &mut ctx.accounts.pool;
        require!(pool.circulating_supply >= amount, SipzyError::InsufficientSupply);
        
        // Calculate refund using same formula (in reverse)
        let end_supply = pool.circulating_supply;
        let start_supply = end_supply.checked_sub(amount).ok_or(SipzyError::Overflow)?;
        
        let base_price_lamports: u64 = 10_000_000;
        let slope_lamports: u64 = 100_000;
        
        let base_refund = amount.checked_mul(base_price_lamports).ok_or(SipzyError::Overflow)?;
        
        let sum_indices = if amount > 0 {
            let first = start_supply;
            let last = end_supply.checked_sub(1).ok_or(SipzyError::Overflow)?;
            amount.checked_mul(first.checked_add(last).ok_or(SipzyError::Overflow)?)
                .ok_or(SipzyError::Overflow)?
                .checked_div(2)
                .ok_or(SipzyError::Overflow)?
        } else {
            0
        };
        
        let slope_refund = sum_indices.checked_mul(slope_lamports).ok_or(SipzyError::Overflow)?;
        let gross_refund = base_refund.checked_add(slope_refund).ok_or(SipzyError::Overflow)?;
        
        // 1% fee on sell as well
        let creator_fee = gross_refund.checked_div(100).ok_or(SipzyError::Overflow)?;
        let net_refund = gross_refund.checked_sub(creator_fee).ok_or(SipzyError::Overflow)?;
        
        require!(pool.total_reserve_sol >= net_refund, SipzyError::InsufficientReserve);
        
        // Transfer SOL from pool to seller
        // Note: Direct lamport manipulation is used here since pool is a PDA owned by this program
        
        **pool.to_account_info().try_borrow_mut_lamports()? -= net_refund;
        **ctx.accounts.seller.to_account_info().try_borrow_mut_lamports()? += net_refund;
        
        // Transfer fee to creator (from pool reserves)
        **pool.to_account_info().try_borrow_mut_lamports()? -= creator_fee;
        **ctx.accounts.creator_wallet.to_account_info().try_borrow_mut_lamports()? += creator_fee;
        
        // Update pool state
        pool.total_reserve_sol = pool.total_reserve_sol
            .checked_sub(net_refund)
            .ok_or(SipzyError::Overflow)?
            .checked_sub(creator_fee)
            .ok_or(SipzyError::Overflow)?;
        pool.circulating_supply = start_supply;
        
        emit!(TokensSold {
            pool: pool.key(),
            seller: ctx.accounts.seller.key(),
            amount,
            net_refund,
            creator_fee,
            new_supply: pool.circulating_supply,
        });
        
        Ok(())
    }

    /// Get current token price (for display purposes)
    pub fn get_current_price(ctx: Context<GetPrice>) -> Result<u64> {
        let pool = &ctx.accounts.pool;
        let price = calculate_price(pool.circulating_supply);
        Ok(price)
    }
}

/// Calculate price for next token: Price = (Supply * 0.0001) + 0.01 SOL
fn calculate_price(supply: u64) -> u64 {
    let base_price: u64 = 10_000_000; // 0.01 SOL in lamports
    let slope: u64 = 100_000; // 0.0001 SOL in lamports
    base_price.saturating_add(supply.saturating_mul(slope))
}

// ============================================================================
// ACCOUNTS
// ============================================================================

#[derive(Accounts)]
#[instruction(youtube_id: String)]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + SipzyPool::INIT_SPACE,
        seeds = [b"sipzy_pool", youtube_id.as_bytes()],
        bump
    )]
    pub pool: Account<'info, SipzyPool>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyTokens<'info> {
    #[account(
        mut,
        seeds = [b"sipzy_pool", pool.youtube_id.as_bytes()],
        bump = pool.bump
    )]
    pub pool: Account<'info, SipzyPool>,
    
    #[account(mut)]
    pub buyer: Signer<'info>,
    
    /// CHECK: Creator wallet for fee transfer, validated against pool state
    #[account(
        mut,
        constraint = creator_wallet.key() == pool.creator_wallet @ SipzyError::InvalidCreatorWallet
    )]
    pub creator_wallet: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SellTokens<'info> {
    #[account(
        mut,
        seeds = [b"sipzy_pool", pool.youtube_id.as_bytes()],
        bump = pool.bump
    )]
    pub pool: Account<'info, SipzyPool>,
    
    #[account(mut)]
    pub seller: Signer<'info>,
    
    /// CHECK: Creator wallet for fee transfer
    #[account(
        mut,
        constraint = creator_wallet.key() == pool.creator_wallet @ SipzyError::InvalidCreatorWallet
    )]
    pub creator_wallet: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct GetPrice<'info> {
    #[account(
        seeds = [b"sipzy_pool", pool.youtube_id.as_bytes()],
        bump = pool.bump
    )]
    pub pool: Account<'info, SipzyPool>,
}

// ============================================================================
// STATE
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct SipzyPool {
    /// YouTube video ID (max 32 chars)
    #[max_len(32)]
    pub youtube_id: String,
    
    /// Creator wallet address for fee distribution
    pub creator_wallet: Pubkey,
    
    /// Total SOL locked in the bonding curve (in lamports)
    pub total_reserve_sol: u64,
    
    /// Number of tokens currently in circulation
    pub circulating_supply: u64,
    
    /// Whether creator has verified ownership
    pub is_claimed: bool,
    
    /// PDA bump seed
    pub bump: u8,
    
    /// Pool authority (initializer)
    pub authority: Pubkey,
}

// ============================================================================
// EVENTS
// ============================================================================

#[event]
pub struct PoolInitialized {
    pub pool: Pubkey,
    pub youtube_id: String,
    pub creator_wallet: Pubkey,
}

#[event]
pub struct TokensPurchased {
    pub pool: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
    pub total_cost: u64,
    pub creator_fee: u64,
    pub new_supply: u64,
}

#[event]
pub struct TokensSold {
    pub pool: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub net_refund: u64,
    pub creator_fee: u64,
    pub new_supply: u64,
}

// ============================================================================
// ERRORS
// ============================================================================

#[error_code]
pub enum SipzyError {
    #[msg("YouTube ID exceeds maximum length of 32 characters")]
    YouTubeIdTooLong,
    
    #[msg("Invalid amount: must be greater than zero")]
    InvalidAmount,
    
    #[msg("Arithmetic overflow")]
    Overflow,
    
    #[msg("Insufficient token supply for sell")]
    InsufficientSupply,
    
    #[msg("Insufficient reserve in pool")]
    InsufficientReserve,
    
    #[msg("Invalid creator wallet address")]
    InvalidCreatorWallet,
}

