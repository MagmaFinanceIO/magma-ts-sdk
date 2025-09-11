use std::str::FromStr;

use alloy_primitives::U256;

use crate::bit_math;

const FIX_POINT_BITS: u8 = 128;
const INTEGER_BITS: u8 = 128;
const LOG_SCALE_OFFSET: u8 = 127;

fn log_scale() -> U256 {
    U256::from(1) << LOG_SCALE_OFFSET
}

// const LOG_SCALE_SQUARED: U256 = (1 << 127) * (1 << 127);
fn log_scale_squared() -> U256 {
    (U256::from(1) << 127) * (U256::from(1) << 127)
}

fn max_u256() -> U256 {
    U256::from_str("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF").unwrap()
}

pub fn from_u128x128(x: U256) -> (u128, u128) {
    (
        (x >> U256::from(128)).to::<u128>(),
        (x & ((U256::from(1) << U256::from(128)) - U256::from(1))).to::<u128>(),
    )
}

pub fn to_u128x128(x: u128, decimals: u8) -> U256 {
    (U256::from(x) << U256::from(128)) / U256::from(10).pow(U256::from(decimals))
}

// @return 128.128-binary fix-point number
pub fn log2(mut x: U256) -> (U256, bool) {
    if x == U256::from(1) {
        return (to_u128x128(128, 0), false);
    };
    if x == U256::ZERO {
        panic!("ErrLogUnderflow")
    };

    // drop the least significant bit of the fraction part
    x >>= 1;

    let sign_positive = if x >= log_scale() {
        true
    } else {
        x = log_scale_squared() / x;
        false
    };

    let n = bit_math::most_significant_bit(U256::from(x >> LOG_SCALE_OFFSET));
    let mut result = U256::from(n) << LOG_SCALE_OFFSET;
    let mut y = x >> n;
    if y != log_scale() {
        let mut delta = U256::from(1) << (LOG_SCALE_OFFSET - 1);
        while delta > U256::ZERO {
            y = (y * y) >> LOG_SCALE_OFFSET;
            if y >= (U256::from(1) << (LOG_SCALE_OFFSET + 1)) {
                result += delta;
                y >>= 1;
            };
            delta >>= 1;
        }
    };

    (result << 1, sign_positive)
}

pub fn pow(x: U256, y: i32) -> U256 {
    let mut invert = false;

    if x == U256::ZERO {
        return U256::ZERO;
    };

    if y == 0i32 {
        return U256::from(1) << FIX_POINT_BITS;
    };

    let abs_y = y.unsigned_abs() as u128;
    if y.is_negative() {
        invert = !invert;
    };
    let mut result = U256::ZERO;
    if abs_y < 0x100000 {
        result = U256::from(1) << FIX_POINT_BITS;

        let mut squared = x;
        if x > ((U256::from(1) << FIX_POINT_BITS) - U256::from(1)) {
            squared = max_u() / squared;
            invert = !invert;
        };

        if abs_y & 0x1 != 0 {
            result = (result * squared) >> FIX_POINT_BITS;
        };
        squared = (squared * squared) >> FIX_POINT_BITS;
        if abs_y & 0x2 != 0 {
            result = (result * squared) >> FIX_POINT_BITS;
        };
        squared = (squared * squared) >> FIX_POINT_BITS;
        if abs_y & 0x4 != 0 {
            result = (result * squared) >> FIX_POINT_BITS;
        };
        squared = (squared * squared) >> FIX_POINT_BITS;
        if abs_y & 0x8 != 0 {
            result = (result * squared) >> FIX_POINT_BITS;
        };
        squared = (squared * squared) >> FIX_POINT_BITS;
        if abs_y & 0x10 != 0 {
            result = (result * squared) >> FIX_POINT_BITS;
        };
        squared = (squared * squared) >> FIX_POINT_BITS;
        if abs_y & 0x20 != 0 {
            result = (result * squared) >> FIX_POINT_BITS;
        };
        squared = (squared * squared) >> FIX_POINT_BITS;
        if abs_y & 0x40 != 0 {
            result = (result * squared) >> FIX_POINT_BITS;
        };
        squared = (squared * squared) >> FIX_POINT_BITS;
        if abs_y & 0x80 != 0 {
            result = (result * squared) >> FIX_POINT_BITS;
        };
        squared = (squared * squared) >> FIX_POINT_BITS;
        if abs_y & 0x100 != 0 {
            result = (result * squared) >> FIX_POINT_BITS;
        };
        squared = (squared * squared) >> FIX_POINT_BITS;
        if abs_y & 0x200 != 0 {
            result = (result * squared) >> FIX_POINT_BITS;
        };
        squared = (squared * squared) >> FIX_POINT_BITS;
        if abs_y & 0x400 != 0 {
            result = (result * squared) >> FIX_POINT_BITS;
        };
        squared = (squared * squared) >> FIX_POINT_BITS;
        if abs_y & 0x800 != 0 {
            result = (result * squared) >> FIX_POINT_BITS;
        };
        squared = (squared * squared) >> FIX_POINT_BITS;
        if abs_y & 0x1000 != 0 {
            result = (result * squared) >> FIX_POINT_BITS;
        };
        squared = (squared * squared) >> FIX_POINT_BITS;
        if abs_y & 0x2000 != 0 {
            result = (result * squared) >> FIX_POINT_BITS;
        };
        squared = (squared * squared) >> FIX_POINT_BITS;
        if abs_y & 0x4000 != 0 {
            result = (result * squared) >> FIX_POINT_BITS;
        };
        squared = (squared * squared) >> FIX_POINT_BITS;
        if abs_y & 0x8000 != 0 {
            result = (result * squared) >> FIX_POINT_BITS;
        };
        squared = (squared * squared) >> FIX_POINT_BITS;
        if abs_y & 0x10000 != 0 {
            result = (result * squared) >> FIX_POINT_BITS;
        };
        squared = (squared * squared) >> FIX_POINT_BITS;
        if abs_y & 0x20000 != 0 {
            result = (result * squared) >> FIX_POINT_BITS;
        };
        squared = (squared * squared) >> FIX_POINT_BITS;
        if abs_y & 0x40000 != 0 {
            result = (result * squared) >> FIX_POINT_BITS;
        };
        squared = (squared * squared) >> FIX_POINT_BITS;
        if abs_y & 0x80000 != 0 {
            result = (result * squared) >> FIX_POINT_BITS;
        };
    };

    // revert if y is too big or if x^y underflowed
    if result == U256::ZERO {
        panic!("ErrPowUnderflow")
    };

    if invert { max_u() / result } else { result }
}

fn max_u() -> U256 {
    let bits = (FIX_POINT_BITS as u16) + (INTEGER_BITS as u16);
    assert!(bits <= 256);
    if bits == 256 {
        max_u256()
    } else {
        (U256::from(1) << (FIX_POINT_BITS + INTEGER_BITS)) - U256::from(1)
    }
}
