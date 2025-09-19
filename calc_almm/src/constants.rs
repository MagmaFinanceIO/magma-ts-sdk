use alloy_primitives::U256;

pub const SCALE_OFFSET: u8 = 128;

pub const PRECISION_N: u8 = 9;
pub const PRECISION: u128 = 1000000000;
pub const SQUARED_PRECISION: u128 = PRECISION * PRECISION;

pub const FEE_DENOM: u64 = 100000000;
pub const MAX_FEE_RATE: u64 = 10000000; // 10%
pub const BASIS_POINT_MAX: u16 = 10000;
pub const MAX_PROTOCOL_SHARE: u16 = 2500; // 25%

pub const DAY: u64 = 86400;

pub fn scale() -> U256 {
    U256::from(1) << SCALE_OFFSET
}

pub fn scale_offset() -> u8 {
    SCALE_OFFSET
}

pub fn basis_point_max() -> u16 {
    BASIS_POINT_MAX
}

pub fn precision() -> u128 {
    PRECISION
}

pub fn precision_n() -> u8 {
    PRECISION_N
}

pub fn max_liquidity_per_bin() -> U256 {
    U256::from_str_radix(
        "65251743116719673010965625540244653191619923014385985379600384103134737",
        10,
    )
    .unwrap()
}
