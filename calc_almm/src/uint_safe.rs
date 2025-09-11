use alloy_primitives::U256;

pub fn safe32(x: U256) -> u32 {
    assert!(x >> 32 == U256::ZERO, "ErrSafe32");
    x.to()
}

pub fn safe64(x: U256) -> u64 {
    assert!(x >> U256::from(64) == U256::ZERO, "ErrSafe64");
    x.to()
}

pub fn safe128(x: U256) -> u128 {
    assert!(x >> 128 == U256::ZERO, "ErrSafe128");
    x.to()
}
