use std::str::FromStr;

use alloy_primitives::U256;
use wasm_bindgen::prelude::*;

use crate::{
    constants,
    u128x128::{log2, pow, to_u128x128},
    uint_safe,
};

#[wasm_bindgen]
// Return 2^128 price
pub fn get_price_x128_from_real_id(real_id: i32, bin_step: u16) -> String {
    let storage_id = get_storage_id_from_real_id(real_id);
    let price = get_price_x128_from_storage_id(storage_id, bin_step);
    price.to_string()
}

const REAL_ID_SHIFT: u32 = 1 << 23;

#[wasm_bindgen]
pub fn get_storage_id_from_real_id(id: i32) -> u32 {
    if id >= 0i32 {
        id as u32 + REAL_ID_SHIFT
    } else {
        REAL_ID_SHIFT - id.unsigned_abs()
    }
}

#[wasm_bindgen]
pub fn get_real_id(storage_id: u32) -> i32 {
    assert!(storage_id < (REAL_ID_SHIFT << 1), "ErrStorageIDTooBig");
    if storage_id >= REAL_ID_SHIFT {
        (storage_id - REAL_ID_SHIFT) as i32
    } else {
        i32_neg_from(REAL_ID_SHIFT - storage_id)
    }
}

fn get_base(bin_step: u16) -> U256 {
    U256::from(constants::scale())
        + (U256::from(bin_step) << constants::scale_offset())
            / U256::from(constants::basis_point_max())
}

fn get_exponent(storage_id: u32) -> i32 {
    get_real_id(storage_id)
}

// NOTE: price is a 128.128-binary fixed-point number
pub fn get_price_x128_from_storage_id(storage_id: u32, bin_step: u16) -> U256 {
    let base = get_base(bin_step);
    let exp = get_exponent(storage_id);
    pow(base, exp)
}

// NOTE: price is a 128.128-binary fixed-point number
//price_x2^128: is int string
#[wasm_bindgen]
pub fn get_real_id_from_price_x128(price_x128: String, bin_step: u16) -> i32 {
    let price = U256::from_str(&price_x128).unwrap();
    let base = get_base(bin_step);
    let (price_abs, price_positive) = log2(price);
    let (base_abs, base_positive) = log2(base);
    let real_id_abs = uint_safe::safe32(price_abs / base_abs);

    if price_positive != base_positive {
        i32_neg_from(real_id_abs)
    } else {
        real_id_abs as i32
    }
}

pub fn convert_decimal_price_to_128x128(price: U256) -> U256 {
    to_u128x128(uint_safe::safe128(price), constants::precision_n())
}

pub fn convert_128x128_price_to_decimal(price: U256) -> U256 {
    (price * U256::from(constants::precision())) >> constants::scale_offset()
}

#[test]
fn test_get_base() {
    assert!(to_u128x128(10001, 4) == get_base(1));
    assert!(to_u128x128(10005, 4) == get_base(5));
}

#[test]
fn test_get_real_id() {
    assert!(get_real_id(REAL_ID_SHIFT + 1) == 1i32);
    assert!(get_real_id(REAL_ID_SHIFT - 1) == i32_neg_from(1));
    assert!(get_real_id(REAL_ID_SHIFT) == 0i32);
    assert!(get_real_id(8396395) == 7787);
}

#[test]
#[should_panic(expected = "ErrStorageIDTooBig")]
fn test_invalid_storage_id() {
    get_real_id(1 << 24);
}

#[test]
fn test_get_storage_id() {
    assert!(get_storage_id_from_real_id(1i32) == (1 + REAL_ID_SHIFT));
    assert!(get_storage_id_from_real_id(0i32) == REAL_ID_SHIFT);
    assert!(get_storage_id_from_real_id(i32_neg_from(1)) == (REAL_ID_SHIFT - 1));
    assert!(get_storage_id_from_real_id(7787) == 8396395);
    assert!(
        get_price_x128_from_storage_id(8391240, 50).to_string()
            == "170967668064246121537697181132590453180080978"
    );
}

fn i32_neg_from(n: u32) -> i32 {
    -(n as i32)
}
