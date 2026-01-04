use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("Aa3NmVN4aHAbRRoR2kQm9xnUonkydrh96tcAa9riJwRP");

/// Sipzy Vault Program - Dual Token Bonding Curve System
/// 
/// Implements two types of bonding curves:
/// 1. $CREATOR Coin (Linear): Price = slope × supply + base_price
///    - Long-term "equity" in a creator's career
///    - Steady, predictable price growth
/// 
/// 2. $STREAM Coin (Exponential): Price = base_price × (1 + growth_rate)^supply
///    - Event-based "hype" for livestreams/videos
///    - Starts cheap, moons rapidly

// ============================================================================
// CONSTANTS
// ============================================================================

/// Fee in basis points (100 = 1%)
const FEE_BASIS_POINTS: u64 = 100;

/// Default base price for Creator coins: 0.01 SOL
const DEFAULT_CREATOR_BASE_PRICE: u64 = 10_000_000;

/// Default slope for Creator coins: 0.0001 SOL per token
const DEFAULT_CREATOR_SLOPE: u64 = 100_000;

/// Default base price for Stream coins: 0.001 SOL (starts cheap!)
const DEFAULT_STREAM_BASE_PRICE: u64 = 1_000_000;

/// Default growth rate for Stream coins: 5% (500 basis points)
const DEFAULT_STREAM_GROWTH_RATE: u64 = 500;

/// Fixed-point precision for exponential calculations (10^9)
const EXP_PRECISION: u128 = 1_000_000_000;

// ============================================================================
// PROGRAM
// ============================================================================

#[program]
pub mod sipzy_vault {
    use super::*;

    /// Initialize a Creator Pool (Linear Bonding Curve)
    /// Creates a PDA tied to the YouTube channel ID
    /// Price formula: Price(n) = slope × n + base_price
    pub fn initialize_creator_pool(
        ctx: Context<InitializeCreatorPool>,
        channel_id: String,
        channel_name: String,
        metadata_uri: String,
        base_price: Option<u64>,
        slope: Option<u64>,
    ) -> Result<()> {
        require!(channel_id.len() <= 32, SipzyError::IdentifierTooLong);
        require!(channel_name.len() <= 64, SipzyError::NameTooLong);
        require!(metadata_uri.len() <= 200, SipzyError::MetadataUriTooLong);
        
        let pool = &mut ctx.accounts.pool;
        let clock = Clock::get()?;
        
        pool.pool_type = PoolType::Creator;
        pool.identifier = channel_id;
        pool.display_name = channel_name;
        pool.parent_identifier = String::new(); // No parent for creator pools
        pool.creator_wallet = ctx.accounts.creator_wallet.key();
        pool.authority = ctx.accounts.authority.key();
        pool.total_supply = 0;
        pool.reserve_sol = 0;
        pool.base_price = base_price.unwrap_or(DEFAULT_CREATOR_BASE_PRICE);
        pool.curve_param = slope.unwrap_or(DEFAULT_CREATOR_SLOPE); // slope for linear
        pool.metadata_uri = metadata_uri;
        pool.bump = ctx.bumps.pool;
        pool.created_at = clock.unix_timestamp;
        pool.is_active = true;
        
        emit!(PoolCreated {
            pool: pool.key(),
            pool_type: PoolType::Creator,
            identifier: pool.identifier.clone(),
            creator_wallet: pool.creator_wallet,
            base_price: pool.base_price,
            curve_param: pool.curve_param,
        });
        
        Ok(())
    }

    /// Initialize a Stream Pool (Exponential Bonding Curve)
    /// Creates a PDA tied to the YouTube video ID
    /// Price formula: Price(n) = base_price × (1 + growth_rate)^n
    pub fn initialize_stream_pool(
        ctx: Context<InitializeStreamPool>,
        video_id: String,
        channel_id: String,
        video_title: String,
        metadata_uri: String,
        base_price: Option<u64>,
        growth_rate: Option<u64>,
    ) -> Result<()> {
        require!(video_id.len() <= 32, SipzyError::IdentifierTooLong);
        require!(channel_id.len() <= 32, SipzyError::IdentifierTooLong);
        require!(video_title.len() <= 64, SipzyError::NameTooLong);
        require!(metadata_uri.len() <= 200, SipzyError::MetadataUriTooLong);
        
        let pool = &mut ctx.accounts.pool;
        let clock = Clock::get()?;
        
        pool.pool_type = PoolType::Stream;
        pool.identifier = video_id;
        pool.display_name = video_title;
        pool.parent_identifier = channel_id; // Reference to creator's channel
        pool.creator_wallet = ctx.accounts.creator_wallet.key();
        pool.authority = ctx.accounts.authority.key();
        pool.total_supply = 0;
        pool.reserve_sol = 0;
        pool.base_price = base_price.unwrap_or(DEFAULT_STREAM_BASE_PRICE);
        pool.curve_param = growth_rate.unwrap_or(DEFAULT_STREAM_GROWTH_RATE); // growth rate for exponential
        pool.metadata_uri = metadata_uri;
        pool.bump = ctx.bumps.pool;
        pool.created_at = clock.unix_timestamp;
        pool.is_active = true;
        
        emit!(PoolCreated {
            pool: pool.key(),
            pool_type: PoolType::Stream,
            identifier: pool.identifier.clone(),
            creator_wallet: pool.creator_wallet,
            base_price: pool.base_price,
            curve_param: pool.curve_param,
        });
        
        Ok(())
    }

    /// Buy tokens from any pool type
    /// Calculates cost via integral based on pool_type
    /// Deducts 1% fee to creator_wallet
    pub fn buy_tokens(ctx: Context<Trade>, amount: u64) -> Result<()> {
        require!(amount > 0, SipzyError::InvalidAmount);
        require!(ctx.accounts.pool.is_active, SipzyError::PoolInactive);
        
        let pool = &ctx.accounts.pool;
        let start_supply = pool.total_supply;
        let end_supply = start_supply.checked_add(amount).ok_or(SipzyError::Overflow)?;
        
        // Calculate total cost based on pool type
        let total_cost = match pool.pool_type {
            PoolType::Creator => calculate_linear_integral(
                start_supply,
                end_supply,
                pool.base_price,
                pool.curve_param,
            )?,
            PoolType::Stream => calculate_exponential_integral(
                start_supply,
                end_supply,
                pool.base_price,
                pool.curve_param,
            )?,
        };
        
        // Calculate 1% creator fee
        let (creator_fee, pool_deposit) = calculate_fee(total_cost)?;
        
        // Transfer SOL to pool (99%)
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.trader.to_account_info(),
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
                    from: ctx.accounts.trader.to_account_info(),
                    to: ctx.accounts.creator_wallet.to_account_info(),
                },
            ),
            creator_fee,
        )?;
        
        // Update pool state
        let pool = &mut ctx.accounts.pool;
        pool.reserve_sol = pool.reserve_sol
            .checked_add(pool_deposit)
            .ok_or(SipzyError::Overflow)?;
        pool.total_supply = end_supply;
        
        emit!(TokensTraded {
            pool: pool.key(),
            trader: ctx.accounts.trader.key(),
            trade_type: TradeType::Buy,
            amount,
            sol_amount: total_cost,
            fee: creator_fee,
            new_supply: pool.total_supply,
            new_reserve: pool.reserve_sol,
        });
        
        Ok(())
    }

    /// Sell tokens back to any pool type
    /// Burns tokens and returns SOL from reserve
    /// Deducts 1% fee to creator_wallet
    pub fn sell_tokens(ctx: Context<Trade>, amount: u64) -> Result<()> {
        require!(amount > 0, SipzyError::InvalidAmount);
        require!(ctx.accounts.pool.is_active, SipzyError::PoolInactive);
        
        let pool = &ctx.accounts.pool;
        require!(pool.total_supply >= amount, SipzyError::InsufficientSupply);
        
        let end_supply = pool.total_supply;
        let start_supply = end_supply.checked_sub(amount).ok_or(SipzyError::Overflow)?;
        
        // Calculate refund based on pool type (same formula as buy, in reverse)
        let gross_refund = match pool.pool_type {
            PoolType::Creator => calculate_linear_integral(
                start_supply,
                end_supply,
                pool.base_price,
                pool.curve_param,
            )?,
            PoolType::Stream => calculate_exponential_integral(
                start_supply,
                end_supply,
                pool.base_price,
                pool.curve_param,
            )?,
        };
        
        // Calculate 1% fee on sell
        let (creator_fee, net_refund) = calculate_fee(gross_refund)?;
        
        require!(
            pool.reserve_sol >= net_refund.checked_add(creator_fee).ok_or(SipzyError::Overflow)?,
            SipzyError::InsufficientReserve
        );
        
        // Transfer SOL from pool to seller (using lamport manipulation for PDA)
        let pool_info = ctx.accounts.pool.to_account_info();
        **pool_info.try_borrow_mut_lamports()? -= net_refund;
        **ctx.accounts.trader.to_account_info().try_borrow_mut_lamports()? += net_refund;
        
        // Transfer fee to creator
        **pool_info.try_borrow_mut_lamports()? -= creator_fee;
        **ctx.accounts.creator_wallet.to_account_info().try_borrow_mut_lamports()? += creator_fee;
        
        // Update pool state
        let pool = &mut ctx.accounts.pool;
        pool.reserve_sol = pool.reserve_sol
            .checked_sub(net_refund)
            .ok_or(SipzyError::Overflow)?
            .checked_sub(creator_fee)
            .ok_or(SipzyError::Overflow)?;
        pool.total_supply = start_supply;
        
        emit!(TokensTraded {
            pool: pool.key(),
            trader: ctx.accounts.trader.key(),
            trade_type: TradeType::Sell,
            amount,
            sol_amount: gross_refund,
            fee: creator_fee,
            new_supply: pool.total_supply,
            new_reserve: pool.reserve_sol,
        });
        
        Ok(())
    }

    /// Get current token price (view function)
    pub fn get_price(ctx: Context<GetPoolInfo>) -> Result<u64> {
        let pool = &ctx.accounts.pool;
        let price = match pool.pool_type {
            PoolType::Creator => calculate_linear_price(
                pool.total_supply,
                pool.base_price,
                pool.curve_param,
            ),
            PoolType::Stream => calculate_exponential_price(
                pool.total_supply,
                pool.base_price,
                pool.curve_param,
            )?,
        };
        Ok(price)
    }

    /// Get cost to buy a specific amount of tokens
    pub fn get_buy_cost(ctx: Context<GetPoolInfo>, amount: u64) -> Result<u64> {
        let pool = &ctx.accounts.pool;
        let start = pool.total_supply;
        let end = start.checked_add(amount).ok_or(SipzyError::Overflow)?;
        
        let cost = match pool.pool_type {
            PoolType::Creator => calculate_linear_integral(start, end, pool.base_price, pool.curve_param)?,
            PoolType::Stream => calculate_exponential_integral(start, end, pool.base_price, pool.curve_param)?,
        };
        
        // Add fee
        let total_with_fee = cost
            .checked_mul(10000 + FEE_BASIS_POINTS)
            .ok_or(SipzyError::Overflow)?
            .checked_div(10000)
            .ok_or(SipzyError::Overflow)?;
        
        Ok(total_with_fee)
    }

    /// Deactivate a pool (creator only)
    pub fn deactivate_pool(ctx: Context<ManagePool>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.is_active = false;
        
        emit!(PoolStatusChanged {
            pool: pool.key(),
            is_active: false,
        });
        
        Ok(())
    }

    /// Reactivate a pool (creator only)
    pub fn reactivate_pool(ctx: Context<ManagePool>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.is_active = true;
        
        emit!(PoolStatusChanged {
            pool: pool.key(),
            is_active: true,
        });
        
        Ok(())
    }

    // ========================================================================
    // LEGACY SUPPORT - Keep backward compatibility with existing pools
    // ========================================================================

    /// Legacy initialize_pool (maps to Creator pool with youtube_id as channel)
    pub fn initialize_pool(
        ctx: Context<InitializeCreatorPool>,
        youtube_id: String,
        creator_wallet: Pubkey,
    ) -> Result<()> {
        initialize_creator_pool(
            ctx,
            youtube_id.clone(),
            youtube_id, // Use ID as name for legacy
            String::new(), // No metadata URI
            None,
            None,
        )
    }
}

// ============================================================================
// BONDING CURVE MATH
// ============================================================================

/// Calculate linear price: Price(n) = slope × n + base_price
fn calculate_linear_price(supply: u64, base_price: u64, slope: u64) -> u64 {
    base_price.saturating_add(supply.saturating_mul(slope))
}

/// Calculate integral of linear curve for buying/selling k tokens
/// Cost = ∫[start to end] (slope × n + base) dn
///      = slope × (end² - start²)/2 + base × (end - start)
///      = slope × k × (start + end - 1)/2 + base × k  [where k = end - start]
fn calculate_linear_integral(
    start_supply: u64,
    end_supply: u64,
    base_price: u64,
    slope: u64,
) -> Result<u64> {
    let amount = end_supply.checked_sub(start_supply).ok_or(SipzyError::Overflow)?;
    if amount == 0 {
        return Ok(0);
    }
    
    // Base cost = amount × base_price
    let base_cost = amount.checked_mul(base_price).ok_or(SipzyError::Overflow)?;
    
    // Slope cost = slope × sum of indices from start to end-1
    // Sum = amount × (first + last) / 2 where first=start, last=end-1
    let first = start_supply;
    let last = end_supply.checked_sub(1).ok_or(SipzyError::Overflow)?;
    
    let sum_indices = amount
        .checked_mul(first.checked_add(last).ok_or(SipzyError::Overflow)?)
        .ok_or(SipzyError::Overflow)?
        .checked_div(2)
        .ok_or(SipzyError::Overflow)?;
    
    let slope_cost = sum_indices.checked_mul(slope).ok_or(SipzyError::Overflow)?;
    
    base_cost.checked_add(slope_cost).ok_or(SipzyError::Overflow.into())
}

/// Calculate exponential price: Price(n) = base_price × (1 + growth_rate)^n
/// growth_rate is in basis points (500 = 5% = 0.05)
fn calculate_exponential_price(
    supply: u64,
    base_price: u64,
    growth_rate_bps: u64,
) -> Result<u64> {
    // Convert to fixed-point: (1 + rate) = (10000 + growth_rate_bps) / 10000
    // We use EXP_PRECISION for high precision
    let rate_multiplier = 10000u128 + growth_rate_bps as u128; // e.g., 10500 for 5%
    
    // Calculate (rate_multiplier / 10000)^supply using iterative multiplication
    // For large supplies, we need to be careful about overflow
    let mut result: u128 = EXP_PRECISION;
    let mut exp = supply;
    let mut base: u128 = (rate_multiplier * EXP_PRECISION) / 10000;
    
    // Fast exponentiation using binary method
    while exp > 0 {
        if exp % 2 == 1 {
            result = (result * base) / EXP_PRECISION;
        }
        base = (base * base) / EXP_PRECISION;
        exp /= 2;
        
        // Check for overflow
        if result > u64::MAX as u128 * EXP_PRECISION {
            return Err(SipzyError::Overflow.into());
        }
    }
    
    // Final price = base_price × result / EXP_PRECISION
    let price = (base_price as u128 * result) / EXP_PRECISION;
    
    if price > u64::MAX as u128 {
        return Err(SipzyError::Overflow.into());
    }
    
    Ok(price as u64)
}

/// Calculate integral of exponential curve for buying/selling
/// Cost = ∑(base_price × r^i) for i from start to end-1
/// This is a geometric series: base_price × (r^end - r^start) / (r - 1)
fn calculate_exponential_integral(
    start_supply: u64,
    end_supply: u64,
    base_price: u64,
    growth_rate_bps: u64,
) -> Result<u64> {
    let amount = end_supply.checked_sub(start_supply).ok_or(SipzyError::Overflow)?;
    if amount == 0 {
        return Ok(0);
    }
    
    // For small amounts, use summation to avoid precision issues
    if amount <= 100 {
        let mut total: u128 = 0;
        for i in start_supply..end_supply {
            let price = calculate_exponential_price(i, base_price, growth_rate_bps)? as u128;
            total = total.checked_add(price).ok_or(SipzyError::Overflow)?;
        }
        if total > u64::MAX as u128 {
            return Err(SipzyError::Overflow.into());
        }
        return Ok(total as u64);
    }
    
    // For larger amounts, use geometric series formula
    // Sum = base × (r^end - r^start) / (r - 1)
    let r_bps = 10000u128 + growth_rate_bps as u128;
    
    // Calculate r^start and r^end
    let r_start = exp_power(r_bps, start_supply, 10000)?;
    let r_end = exp_power(r_bps, end_supply, 10000)?;
    
    // Numerator: base_price × (r^end - r^start)
    let diff = r_end.checked_sub(r_start).ok_or(SipzyError::Overflow)?;
    let numerator = (base_price as u128)
        .checked_mul(diff)
        .ok_or(SipzyError::Overflow)?;
    
    // Denominator: r - 1 = growth_rate_bps / 10000
    // To avoid division by small number, we multiply numerator by 10000 first
    let denominator = growth_rate_bps as u128;
    
    if denominator == 0 {
        // If no growth rate, it's just constant price
        return Ok(base_price.checked_mul(amount).ok_or(SipzyError::Overflow)?);
    }
    
    let result = numerator
        .checked_mul(10000)
        .ok_or(SipzyError::Overflow)?
        .checked_div(denominator)
        .ok_or(SipzyError::Overflow)?
        .checked_div(EXP_PRECISION)
        .ok_or(SipzyError::Overflow)?;
    
    if result > u64::MAX as u128 {
        return Err(SipzyError::Overflow.into());
    }
    
    Ok(result as u64)
}

/// Helper: Calculate (base/scale)^exp with high precision
fn exp_power(base: u128, exp: u64, scale: u128) -> Result<u128> {
    let mut result: u128 = EXP_PRECISION;
    let mut b: u128 = (base * EXP_PRECISION) / scale;
    let mut e = exp;
    
    while e > 0 {
        if e % 2 == 1 {
            result = (result * b) / EXP_PRECISION;
        }
        b = (b * b) / EXP_PRECISION;
        e /= 2;
    }
    
    Ok(result)
}

/// Calculate fee (1% = 100 basis points)
fn calculate_fee(amount: u64) -> Result<(u64, u64)> {
    let fee = amount
        .checked_mul(FEE_BASIS_POINTS)
        .ok_or(SipzyError::Overflow)?
        .checked_div(10000)
        .ok_or(SipzyError::Overflow)?;
    let net = amount.checked_sub(fee).ok_or(SipzyError::Overflow)?;
    Ok((fee, net))
}

// ============================================================================
// ENUMS
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum PoolType {
    Creator, // Linear bonding curve - long-term equity
    Stream,  // Exponential bonding curve - event hype
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum TradeType {
    Buy,
    Sell,
}

// ============================================================================
// ACCOUNTS
// ============================================================================

#[derive(Accounts)]
#[instruction(channel_id: String)]
pub struct InitializeCreatorPool<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Pool::INIT_SPACE,
        seeds = [b"creator_pool", channel_id.as_bytes()],
        bump
    )]
    pub pool: Account<'info, Pool>,
    
    /// CHECK: Creator wallet to receive fees
    pub creator_wallet: AccountInfo<'info>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(video_id: String)]
pub struct InitializeStreamPool<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Pool::INIT_SPACE,
        seeds = [b"stream_pool", video_id.as_bytes()],
        bump
    )]
    pub pool: Account<'info, Pool>,
    
    /// CHECK: Creator wallet to receive fees
    pub creator_wallet: AccountInfo<'info>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Trade<'info> {
    #[account(
        mut,
        constraint = pool.is_active @ SipzyError::PoolInactive
    )]
    pub pool: Account<'info, Pool>,
    
    #[account(mut)]
    pub trader: Signer<'info>,
    
    /// CHECK: Creator wallet for fee transfer, validated against pool state
    #[account(
        mut,
        constraint = creator_wallet.key() == pool.creator_wallet @ SipzyError::InvalidCreatorWallet
    )]
    pub creator_wallet: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct GetPoolInfo<'info> {
    pub pool: Account<'info, Pool>,
}

#[derive(Accounts)]
pub struct ManagePool<'info> {
    #[account(
        mut,
        constraint = pool.creator_wallet == creator.key() @ SipzyError::Unauthorized
    )]
    pub pool: Account<'info, Pool>,
    
    pub creator: Signer<'info>,
}

// ============================================================================
// STATE
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct Pool {
    /// Type of pool (Creator or Stream)
    pub pool_type: PoolType,
    
    /// Unique identifier (channel_id for Creator, video_id for Stream)
    #[max_len(32)]
    pub identifier: String,
    
    /// Display name (channel name or video title)
    #[max_len(64)]
    pub display_name: String,
    
    /// Parent identifier (channel_id for Stream pools, empty for Creator)
    #[max_len(32)]
    pub parent_identifier: String,
    
    /// Creator wallet address for fee distribution
    pub creator_wallet: Pubkey,
    
    /// Pool authority (who initialized it)
    pub authority: Pubkey,
    
    /// Total tokens in circulation
    pub total_supply: u64,
    
    /// SOL locked in the bonding curve reserve (lamports)
    pub reserve_sol: u64,
    
    /// Base price in lamports
    pub base_price: u64,
    
    /// Curve parameter: slope (linear) or growth_rate in bps (exponential)
    pub curve_param: u64,
    
    /// IPFS URI for token metadata
    #[max_len(200)]
    pub metadata_uri: String,
    
    /// PDA bump seed
    pub bump: u8,
    
    /// Unix timestamp of creation
    pub created_at: i64,
    
    /// Whether pool is active for trading
    pub is_active: bool,
}

// ============================================================================
// EVENTS
// ============================================================================

#[event]
pub struct PoolCreated {
    pub pool: Pubkey,
    pub pool_type: PoolType,
    pub identifier: String,
    pub creator_wallet: Pubkey,
    pub base_price: u64,
    pub curve_param: u64,
}

#[event]
pub struct TokensTraded {
    pub pool: Pubkey,
    pub trader: Pubkey,
    pub trade_type: TradeType,
    pub amount: u64,
    pub sol_amount: u64,
    pub fee: u64,
    pub new_supply: u64,
    pub new_reserve: u64,
}

#[event]
pub struct PoolStatusChanged {
    pub pool: Pubkey,
    pub is_active: bool,
}

// ============================================================================
// ERRORS
// ============================================================================

#[error_code]
pub enum SipzyError {
    #[msg("Identifier exceeds maximum length of 32 characters")]
    IdentifierTooLong,
    
    #[msg("Name exceeds maximum length of 64 characters")]
    NameTooLong,
    
    #[msg("Metadata URI exceeds maximum length of 200 characters")]
    MetadataUriTooLong,
    
    #[msg("Invalid amount: must be greater than zero")]
    InvalidAmount,
    
    #[msg("Arithmetic overflow")]
    Overflow,
    
    #[msg("Insufficient token supply for sell")]
    InsufficientSupply,
    
    #[msg("Insufficient SOL reserve in pool")]
    InsufficientReserve,
    
    #[msg("Invalid creator wallet address")]
    InvalidCreatorWallet,
    
    #[msg("Pool is not active")]
    PoolInactive,
    
    #[msg("Unauthorized: only creator can perform this action")]
    Unauthorized,
}
