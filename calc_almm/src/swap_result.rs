use std::collections::HashMap;

use alloy_primitives::U256;
use serde::{Deserialize, Serialize, de};
use serde_json::Value;
use wasm_bindgen::prelude::*;

use crate::{constants, price, uint_safe};

#[wasm_bindgen]
#[derive(Debug, Serialize, Deserialize)]
pub struct SwapOutResult {
    pub success: bool,
    #[wasm_bindgen(getter_with_clone)]
    pub error: String,
    pub amount_in_left: u64,
    pub amount_out: u64,
    pub fee: u64,
}

#[wasm_bindgen]
impl SwapOutResult {
    #[wasm_bindgen(js_name = toString)]
    pub fn to_string(&self) -> String {
        format!(
            "SwapOutResult {{ success: {}, error: \"{}\", amount_in_left: {}, amount_out: {}, fee: {} }}",
            self.success, self.error, self.amount_in_left, self.amount_out, self.fee
        )
    }
}

#[wasm_bindgen]
impl SwapOutResult {
    #[wasm_bindgen(js_name = format)]
    pub fn format(&self) -> String {
        format!(
            "SwapOutResult {{\n  success: {},\n  error: \"{}\",\n  amount_in_left: {},\n  amount_out: {},\n  fee: {}\n}}",
            self.success, self.error, self.amount_in_left, self.amount_out, self.fee
        )
    }
}

#[wasm_bindgen]
#[derive(Debug, Serialize, Deserialize)]
pub struct SwapInResult {
    pub success: bool,
    #[wasm_bindgen(getter_with_clone)]
    pub error: String,
    pub amount_in: u64,
    pub amount_out_left: u64,
    pub fee: u64,
}

#[wasm_bindgen]
impl SwapInResult {
    #[wasm_bindgen(js_name = toString)]
    pub fn to_string(&self) -> String {
        format!(
            "SwapInResult {{ success: {}, error: \"{}\", amount_in: {}, amount_out_left: {}, fee: {} }}",
            self.success, self.error, self.amount_in, self.amount_out_left, self.fee
        )
    }
}

#[wasm_bindgen]
impl SwapInResult {
    #[wasm_bindgen(js_name = format)]
    pub fn format(&self) -> String {
        format!(
            "SwapInResult {{\n  success: {},\n  error: \"{}\",\n  amount_in: {},\n  amount_out_left: {},\n  fee: {}\n}}",
            self.success, self.error, self.amount_in, self.amount_out_left, self.fee
        )
    }
}

#[wasm_bindgen]
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct AlmmPair {
    params: AlmmPairParameter,
    bins: Vec<Bin>,
    #[serde(skip)]
    bins_map: HashMap<u32, Bin>,
    bin_step: u16,
}

#[wasm_bindgen]
pub fn get_swap_out(
    pair: &str,
    amount_in: u64,
    swap_for_y: bool,
    timestamp_ms: u64,
) -> SwapOutResult {
    let mut amount_in_left = amount_in;

    let pair: AlmmPair = serde_json::from_str(pair).unwrap();

    let mut params = pair.params.clone();
    let mut id = params.active_index;

    // TODO: Should use realtime timestamp
    params.update_references(timestamp_ms / 1000);

    let mut fee = 0;
    let mut amount_out = 0;
    let mut success = true;
    let mut error_msg = None;

    loop {
        let bin = pair.bins_map.get(&id).unwrap();
        let bin_reserve = if swap_for_y {
            bin.reserve_y
        } else {
            bin.reserve_x
        };

        if bin_reserve > 0 {
            params.update_volatility_accumulator(id);

            let total_fee = params.get_total_fee(pair.bin_step);
            let (
                amounts_in_with_fees_x,
                amounts_in_with_fees_y,
                amounts_out_of_bin_x,
                amounts_out_of_bin_y,
                total_fees_x,
                total_fees_y,
            ) = bin::get_amounts(
                bin.reserve_x,
                bin.reserve_y,
                pair.bin_step,
                total_fee,
                swap_for_y,
                id,
                amount_in_left,
            );

            if amounts_in_with_fees_x > 0 && swap_for_y {
                amount_in_left -= amounts_in_with_fees_x;
                amount_out += amounts_out_of_bin_y;
                fee += total_fees_x;
            } else if amounts_in_with_fees_y > 0 && !swap_for_y {
                amount_in_left -= amounts_in_with_fees_y;
                amount_out += amounts_out_of_bin_x;
                fee += total_fees_y;
            };
        };

        if amount_in_left == 0 {
            break;
        } else {
            let (next_id, found) = pair.get_next_non_empty_bin_internal(swap_for_y, id);
            if !found {
                success = false;
                error_msg = Some(format!("No next bin available: {}, {}", id, next_id));
                break;
            };
            id = next_id;
        };
    }

    SwapOutResult {
        success,
        error: error_msg.unwrap_or_else(|| "".to_string()),
        amount_in_left,
        amount_out,
        fee,
    }
}

#[wasm_bindgen]
pub fn get_swap_in(
    pair: &str,
    amount_out: u64,
    swap_for_y: bool,
    timestamp_ms: u64,
) -> SwapInResult {
    let pair: AlmmPair = serde_json::from_str(pair).unwrap();

    let mut params = pair.params.clone();
    let mut amount_out_left = amount_out;
    let mut id = params.active_index;

    params.update_references(timestamp_ms / 1000);

    let mut amount_in = 0;
    let mut fee = 0;
    let mut success = true;
    let mut error_msg = None;

    loop {
        let bin = pair.bins_map.get(&id).unwrap();
        let bin_reserve = if swap_for_y {
            bin.reserve_y
        } else {
            bin.reserve_x
        };

        if bin_reserve > 0 {
            let price_q128 = price::get_price_x128_from_storage_id(id, pair.bin_step);
            let amount_out_of_bin = if bin_reserve > amount_out_left {
                amount_out_left
            } else {
                bin_reserve
            };

            params.update_volatility_accumulator(id);

            let amount_in_without_fee = if swap_for_y {
                (U256::from(amount_out_of_bin) << U256::from(constants::SCALE_OFFSET)) / price_q128
            } else {
                (U256::from(amount_out_of_bin) * price_q128) >> U256::from(constants::SCALE_OFFSET)
            };
            let amount_in_without_fee = uint_safe::safe64(amount_in_without_fee);

            let total_fee = params.get_total_fee(pair.bin_step);
            let fee_amount = fee::get_fee_amount_by_net_input(amount_in_without_fee, total_fee);

            amount_in = amount_in + amount_in_without_fee + fee_amount;
            amount_out_left -= amount_out_of_bin;
            fee += fee_amount;
        };

        if amount_out_left == 0 {
            break;
        } else {
            let (next_id, found) = pair.get_next_non_empty_bin_internal(swap_for_y, id);
            if !found {
                success = false;
                error_msg = Some(format!("No next bin available: {}, {}", id, next_id));
                break;
            };
            id = next_id;
        };
    }

    SwapInResult {
        success,
        error: error_msg.unwrap_or_else(|| "".to_string()),
        amount_in,
        amount_out_left,
        fee,
    }
}

impl AlmmPair {
    fn get_next_non_empty_bin_internal(&self, swap_for_y: bool, id: u32) -> (u32, bool) {
        if swap_for_y {
            self.find_first_left(id)
        } else {
            self.find_first_right(id)
        }
    }

    fn find_first_left(&self, id: u32) -> (u32, bool) {
        let mut out = (1u32 << 24, false);
        for _id in &self.bins {
            if _id.storage_id > id && _id.storage_id < out.0 {
                out = (_id.storage_id, true);
            }
        }
        out
    }

    fn find_first_right(&self, id: u32) -> (u32, bool) {
        let mut out = (0, false);
        for _id in &self.bins {
            if _id.storage_id < id && _id.storage_id > out.0 {
                out = (_id.storage_id, true);
            }
        }
        out
    }
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct Bin {
    pub storage_id: u32,
    pub price_q128: String,
    #[serde(deserialize_with = "deserialize_u64")]
    pub reserve_x: u64,
    #[serde(deserialize_with = "deserialize_u64")]
    pub reserve_y: u64,

    pub fee_growth_x: String,
    pub fee_growth_y: String,
    pub distribution_growth: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct RewardGrowth {
    pub contents: Vec<RewardGrowthContents>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RewardGrowthContents {
    key: RewardGrowthContentsKey,
    value: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RewardGrowthContentsKey {
    name: String,
}

#[derive(Debug, Clone)]
pub struct BinInner {
    pub storage_id: u32,
    pub price_q128: U256,
    pub reserve_x: u64,
    pub reserve_y: u64,

    pub fee_growth_x: U256,
    pub fee_growth_y: U256,
    pub distribution_growth: U256,
}

impl From<Bin> for BinInner {
    fn from(bin: Bin) -> Self {
        Self {
            storage_id: bin.storage_id,
            price_q128: bin.price_q128.parse().unwrap(),
            reserve_x: bin.reserve_x,
            reserve_y: bin.reserve_y,

            fee_growth_x: bin.fee_growth_x.parse().unwrap(),
            fee_growth_y: bin.fee_growth_y.parse().unwrap(),
            distribution_growth: bin.distribution_growth.parse().unwrap(),
        }
    }
}

#[wasm_bindgen]
#[derive(Clone, Default, Debug, Serialize, Deserialize)]
pub struct AlmmPairParameter {
    pub base_factor: u32,          // 32bit, basis_point
    pub filter_period: u16,        // 12bit
    pub decay_period: u16,         // 12bit
    pub reduction_factor: u16,     // 14bit
    pub variable_fee_control: u32, // 24bit, basis_point
    pub protocol_share: u16,       // 14bit
    pub protocol_variable_share: u16,
    pub max_volatility_accumulator: u32, // 20bit, basis_point
    pub volatility_accumulator: u32,     // 20bit, basis_point
    pub volatility_reference: u32,       // 20bit
    pub index_reference: u32,            // 24bit
    #[serde(deserialize_with = "deserialize_u64")]
    pub time_of_last_update: u64,
    pub oracle_index: u16,
    pub active_index: u32, // 24bit
}

impl AlmmPairParameter {
    pub fn get_total_fee(&self, bin_step: u16) -> u64 {
        self.get_base_fee(bin_step) + self.get_variable_fee(bin_step)
    }

    // target base fee rate 1e8 basis
    pub fn get_base_fee(&self, bin_step: u16) -> u64 {
        // Base factor is in basis points: 100000
        // binStep is in basis points: 10000
        // 1e9
        ((self.base_factor as u64) * (bin_step as u64) + 9) / 10
    }

    pub fn get_variable_fee(&self, bin_step: u16) -> u64 {
        if self.variable_fee_control != 0 {
            // The volatility accumulator is in basis points, binStep is in basis points.
            // The variable fee control is in 1e10 basis.
            // So the result is in 1e24th
            let prod = U256::from(self.volatility_accumulator) * U256::from(bin_step);
            ((prod * prod * U256::from(self.variable_fee_control)
                + U256::from(9_999_999_999_999_999u64))
                / U256::from(10_000_000_000_000_000u64))
            .to::<u64>()
        } else {
            0
        }
    }

    pub fn update_volatility_parameters(&mut self, active_id: u32, timestamp: u64) {
        self.update_references(timestamp);
        self.update_volatility_accumulator(active_id);
    }

    fn update_references(&mut self, timestamp: u64) {
        let dt = timestamp - self.time_of_last_update;
        if dt >= self.filter_period as u64 {
            self.update_id_reference();
            if dt < self.decay_period as u64 {
                self.update_volatility_reference();
            } else {
                self.volatility_reference = 0;
            };
        };
        self.update_time_of_last_update(timestamp);
    }

    fn update_volatility_accumulator(&mut self, active_id: u32) {
        let id_reference = self.index_reference;
        let delta_id = active_id.abs_diff(id_reference);
        let mut vol_acc =
            self.volatility_reference + delta_id * (constants::BASIS_POINT_MAX as u32);
        let max_vol_acc = self.max_volatility_accumulator;
        vol_acc = if vol_acc > max_vol_acc {
            max_vol_acc
        } else {
            vol_acc
        };
        self.volatility_accumulator = vol_acc;
    }

    fn update_id_reference(&mut self) {
        let active_id = self.active_index;
        self.index_reference = active_id;
    }

    fn update_volatility_reference(&mut self) {
        let vol_acc = self.volatility_accumulator;
        let reduction_factor = self.reduction_factor as u32;
        let vol_ref = full_math_u64::mul_div_floor(
            vol_acc as u64,
            reduction_factor as u64,
            constants::BASIS_POINT_MAX as u64,
        ) as u32;
        self.volatility_reference = vol_ref;
    }

    fn update_time_of_last_update(&mut self, timestamp: u64) {
        self.time_of_last_update = timestamp;
    }
}

mod full_math_u64 {
    // ref: https://github.com/CetusProtocol/integer-mate/blob/4d09c8ba0527274983c6664a5d5def2e784d4692/sui/sources/full_math_u64.move#L2-L5
    pub fn mul_div_floor(num1: u64, num2: u64, denom: u64) -> u64 {
        let r = (num1 as u128 * num2 as u128) / (denom as u128);
        r as u64
    }
}

mod bin {
    use crate::{constants, u128x128};

    use super::{fee, price, uint_safe};
    use alloy_primitives::U256;

    pub fn get_amounts(
        reserve_x: u64,
        reserve_y: u64,
        bin_step: u16,
        total_fee: u64,
        swap_for_y: bool,
        active_id: u32,
        amount_in_left: u64,
    ) -> (u64, u64, u64, u64, u64, u64) {
        let bin_price_q128 = price::get_price_x128_from_storage_id(active_id, bin_step);

        let bin_reserve_out = if swap_for_y { reserve_y } else { reserve_x };
        let max_amount_in = if swap_for_y {
            uint_safe::safe64(u128x128::to_u128x128(bin_reserve_out as u128, 0) / bin_price_q128)
        } else {
            let (amount, _) = u128x128::from_u128x128(U256::from(bin_reserve_out) * bin_price_q128);
            uint_safe::safe64(U256::from(amount))
        };

        let max_fee = fee::get_fee_amount_by_net_input(max_amount_in, total_fee);
        let max_amount_in = max_amount_in + max_fee;

        let (fee, amount_in, amount_out) = if amount_in_left >= max_amount_in {
            (max_fee, max_amount_in, bin_reserve_out)
        } else {
            let fee = fee::get_fee_amount_from(amount_in_left, total_fee);
            let amount_in = amount_in_left - fee;
            let mut amount_out = if swap_for_y {
                let (amount, _) = u128x128::from_u128x128(U256::from(amount_in) * bin_price_q128);
                uint_safe::safe64(U256::from(amount))
            } else {
                uint_safe::safe64(u128x128::to_u128x128(amount_in as u128, 0) / bin_price_q128)
            };
            if amount_out > bin_reserve_out {
                amount_out = bin_reserve_out;
            };
            (fee, amount_in_left, amount_out)
        };

        let (
            amounts_in_with_fees_x,
            amounts_in_with_fees_y,
            amounts_out_of_bin_x,
            amounts_out_of_bin_y,
            fee_x,
            fee_y,
        ) = if swap_for_y {
            assert!(
                get_liquidity(
                    reserve_x + amount_in,
                    reserve_y - amount_out,
                    bin_price_q128
                ) <= U256::from(constants::max_liquidity_per_bin()),
                "ErrMaxLiquidityPerBinExceeded"
            );
            (amount_in, 0, 0, amount_out, fee, 0)
        } else {
            assert!(
                get_liquidity(
                    reserve_x - amount_out,
                    reserve_y + amount_in,
                    bin_price_q128
                ) <= U256::from(constants::max_liquidity_per_bin()),
                "ErrMaxLiquidityPerBinExceeded"
            );
            (0, amount_in, amount_out, 0, 0, fee)
        };

        (
            amounts_in_with_fees_x,
            amounts_in_with_fees_y,
            amounts_out_of_bin_x,
            amounts_out_of_bin_y,
            fee_x,
            fee_y,
        )
    }

    pub fn get_liquidity(amount_x: u64, amount_y: u64, price_q128: U256) -> U256 {
        let mut liquidity = U256::ZERO;
        if amount_x > 0 {
            liquidity = price_q128 * U256::from(amount_x);
            assert!(
                liquidity / U256::from(amount_x) == price_q128,
                "ErrLiquidityOverflow"
            );
        };
        if amount_y > 0 {
            let amount_y_256 = U256::from(amount_y) << constants::SCALE_OFFSET;
            liquidity += amount_y_256;
            assert!(liquidity >= amount_y_256, "ErrLiquidityOverflow");
        };
        liquidity
    }
}

mod fee {
    use alloy_primitives::U256;

    use crate::constants;

    use super::uint_safe;

    const FEE_DENOM: u64 = 100000000;

    fn cap_fee_rate(fee_rate: u64) -> u64 {
        fee_rate.min(constants::MAX_FEE_RATE)
    }

    pub fn get_fee_amount_from(amount_with_fees: u64, total_fee_rate: u64) -> u64 {
        // verify_fee(total_fee);
        let total_fee_rate = cap_fee_rate(total_fee_rate);

        let amount = (U256::from(amount_with_fees) * U256::from(total_fee_rate)
            + U256::from(FEE_DENOM - 1))
            / U256::from(FEE_DENOM);

        uint_safe::safe64(amount)
    }

    pub fn get_fee_amount_by_net_input(amount: u64, total_fee_rate: u64) -> u64 {
        // verify_fee(total_fee_rate);
        let total_fee_rate = cap_fee_rate(total_fee_rate);

        let denominator = U256::from(FEE_DENOM - total_fee_rate);
        // Can't overflow, max(result) = (type(uint128).max * 0.1e18 + (1e18 - 1)) / 0.9e18 < 2^128
        let amount = (U256::from(amount) * U256::from(total_fee_rate) + U256::from(denominator)
            - U256::from(1))
            / denominator;

        uint_safe::safe64(amount)
    }

    pub fn verify_fee(fee: u64) -> Result<(), String> {
        if fee > constants::MAX_FEE_RATE {
            Err("ErrFeeTooLarge".to_string())
        } else {
            Ok(())
        }
    }
}

pub fn deserialize_u64<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: de::Deserializer<'de>,
{
    let value = Value::deserialize(deserializer)?;
    match value {
        Value::Number(num) => {
            if let Some(n) = num.as_u64() {
                Ok(n)
            } else {
                Err(serde::de::Error::custom("Number is not a u64"))
            }
        }
        Value::String(s) => s.parse::<u64>().map_err(serde::de::Error::custom),
        _ => Err(serde::de::Error::custom("Expected u64 or string")),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_first_higher() {
        let mut almm_pair = AlmmPair::default();

        almm_pair.bins.push(Bin {
            storage_id: 1 << 23,
            ..Default::default()
        });
        almm_pair.bins.push(Bin {
            storage_id: (1 << 23) + 1,
            ..Default::default()
        });
        almm_pair.bins.push(Bin {
            storage_id: (1 << 23) + 10,
            ..Default::default()
        });
        almm_pair.bins.push(Bin {
            storage_id: (1 << 23) - 1,
            ..Default::default()
        });
        almm_pair.bins.push(Bin {
            storage_id: (1 << 23) - 10,
            ..Default::default()
        });

        let (x, f) = almm_pair.find_first_left(1 << 23);
        assert!(f && x == (1 << 23) + 1);
    }

    #[test]
    fn test_first_lower() {
        let mut almm_pair = AlmmPair::default();

        almm_pair.bins.push(Bin {
            storage_id: 1 << 23,
            ..Default::default()
        });
        almm_pair.bins.push(Bin {
            storage_id: (1 << 23) + 1,
            ..Default::default()
        });
        almm_pair.bins.push(Bin {
            storage_id: (1 << 23) + 10,
            ..Default::default()
        });
        almm_pair.bins.push(Bin {
            storage_id: (1 << 23) - 1,
            ..Default::default()
        });
        almm_pair.bins.push(Bin {
            storage_id: (1 << 23) - 10,
            ..Default::default()
        });

        let (x, f) = almm_pair.find_first_right(1 << 23);
        assert!(f && x == (1 << 23) - 1);
    }

    use crate::swap_result::{AlmmPair, Bin};

    #[test]
    fn deserialize_pair() {
        let pair_str = r#"{"params":{"active_index":8397927,"base_factor":100000,"decay_period":600,"filter_period":30,"index_reference":8397927,"max_volatility_accumulator":1000000,"oracle_index":0,"protocol_share":1000,"protocol_variable_share":1000,"reduction_factor":5000,"time_of_last_update":"1754900084","variable_fee_control":80000000,"volatility_accumulator":0,"volatility_reference":0},"bins":[{"distribution_growth":"0","distribution_last_updated":"0","fee_growth_x":"0","fee_growth_y":"0","fee_x":"0","fee_y":"0","price_q128":"3768246633273078798697601732675797893713015","reserve_x":"0","reserve_y":"6337035218","rewarder_growth":{"contents":[]},"staked_liquidity":"0","staked_lp_amount":"0","storage_id":8397925,"real_bin_id":9317},{"distribution_growth":"0","distribution_last_updated":"0","fee_growth_x":"0","fee_growth_y":"0","fee_x":"0","fee_y":"0","price_q128":"3772014879906351877496299334408473781216772","reserve_x":"0","reserve_y":"7303502761","rewarder_growth":{"contents":[]},"staked_liquidity":"0","staked_lp_amount":"0","storage_id":8397926,"real_bin_id":9318},{"distribution_growth":"0","distribution_last_updated":"0","fee_growth_x":"69939395467293378764464362697779","fee_growth_y":"0","fee_x":"2395","fee_y":"0","price_q128":"3775786894786258229373795633742882229168175","reserve_x":"292841","reserve_y":"8403240371","rewarder_growth":{"contents":[]},"staked_liquidity":"0","staked_lp_amount":"0","storage_id":8397927,"real_bin_id":9319},{"distribution_growth":"0","distribution_last_updated":"0","fee_growth_x":"13820439444612931826627696963680","fee_growth_y":"528133168131016759986463295812","fee_x":"644","fee_y":"0","price_q128":"3779562681681044487603169429376625124584583","reserve_x":"1440665","reserve_y":"0","rewarder_growth":{"contents":[]},"staked_liquidity":"0","staked_lp_amount":"0","storage_id":8397928,"real_bin_id":9320},{"distribution_growth":"0","distribution_last_updated":"0","fee_growth_x":"0","fee_growth_y":"0","fee_x":"0","fee_y":"0","price_q128":"3783342244362725532090772598806001709080349","reserve_x":"1048060","reserve_y":"0","rewarder_growth":{"contents":[]},"staked_liquidity":"0","staked_lp_amount":"0","storage_id":8397929,"real_bin_id":9321},{"distribution_growth":"0","distribution_last_updated":"0","fee_growth_x":"0","fee_growth_y":"0","fee_x":"0","fee_y":"0","price_q128":"3787125586607088257622863371404807728112884","reserve_x":"656235","reserve_y":"0","rewarder_growth":{"contents":[]},"staked_liquidity":"0","staked_lp_amount":"0","storage_id":8397930,"real_bin_id":9322},{"distribution_growth":"0","distribution_last_updated":"0","fee_growth_x":"0","fee_growth_y":"0","fee_x":"0","fee_y":"0","price_q128":"3790912712193695345880486234776212543652150","reserve_x":"568824","reserve_y":"0","rewarder_growth":{"contents":[]},"staked_liquidity":"0","staked_lp_amount":"0","storage_id":8397931,"real_bin_id":9323}],"bin_step":10}"#;

        let pair: AlmmPair = serde_json::from_str(pair_str).unwrap();

        // change time_of_last_update to u64
        let pair_str = r#"{"params":{"active_index":8397927,"base_factor":100000,"decay_period":600,"filter_period":30,"index_reference":8397927,"max_volatility_accumulator":1000000,"oracle_index":0,"protocol_share":1000,"protocol_variable_share":1000,"reduction_factor":5000,"time_of_last_update":1754900084,"variable_fee_control":80000000,"volatility_accumulator":0,"volatility_reference":0},"bins":[{"distribution_growth":"0","distribution_last_updated":"0","fee_growth_x":"0","fee_growth_y":"0","fee_x":"0","fee_y":"0","price_q128":"3768246633273078798697601732675797893713015","reserve_x":"0","reserve_y":"6337035218","rewarder_growth":{"contents":[]},"staked_liquidity":"0","staked_lp_amount":"0","storage_id":8397925,"real_bin_id":9317},{"distribution_growth":"0","distribution_last_updated":"0","fee_growth_x":"0","fee_growth_y":"0","fee_x":"0","fee_y":"0","price_q128":"3772014879906351877496299334408473781216772","reserve_x":"0","reserve_y":"7303502761","rewarder_growth":{"contents":[]},"staked_liquidity":"0","staked_lp_amount":"0","storage_id":8397926,"real_bin_id":9318},{"distribution_growth":"0","distribution_last_updated":"0","fee_growth_x":"69939395467293378764464362697779","fee_growth_y":"0","fee_x":"2395","fee_y":"0","price_q128":"3775786894786258229373795633742882229168175","reserve_x":"292841","reserve_y":"8403240371","rewarder_growth":{"contents":[]},"staked_liquidity":"0","staked_lp_amount":"0","storage_id":8397927,"real_bin_id":9319},{"distribution_growth":"0","distribution_last_updated":"0","fee_growth_x":"13820439444612931826627696963680","fee_growth_y":"528133168131016759986463295812","fee_x":"644","fee_y":"0","price_q128":"3779562681681044487603169429376625124584583","reserve_x":"1440665","reserve_y":"0","rewarder_growth":{"contents":[]},"staked_liquidity":"0","staked_lp_amount":"0","storage_id":8397928,"real_bin_id":9320},{"distribution_growth":"0","distribution_last_updated":"0","fee_growth_x":"0","fee_growth_y":"0","fee_x":"0","fee_y":"0","price_q128":"3783342244362725532090772598806001709080349","reserve_x":"1048060","reserve_y":"0","rewarder_growth":{"contents":[]},"staked_liquidity":"0","staked_lp_amount":"0","storage_id":8397929,"real_bin_id":9321},{"distribution_growth":"0","distribution_last_updated":"0","fee_growth_x":"0","fee_growth_y":"0","fee_x":"0","fee_y":"0","price_q128":"3787125586607088257622863371404807728112884","reserve_x":"656235","reserve_y":"0","rewarder_growth":{"contents":[]},"staked_liquidity":"0","staked_lp_amount":"0","storage_id":8397930,"real_bin_id":9322},{"distribution_growth":"0","distribution_last_updated":"0","fee_growth_x":"0","fee_growth_y":"0","fee_x":"0","fee_y":"0","price_q128":"3790912712193695345880486234776212543652150","reserve_x":"568824","reserve_y":"0","rewarder_growth":{"contents":[]},"staked_liquidity":"0","staked_lp_amount":"0","storage_id":8397931,"real_bin_id":9323}],"bin_step":10}"#;

        let pair: AlmmPair = serde_json::from_str(pair_str).unwrap();
    }

    #[test]
    fn test_swap_out_no_next_bin_error() {
        // Create a minimal pair with only one bin to trigger the error
        let pair_str = r#"{"params":{"active_index":8397927,"base_factor":100000,"decay_period":600,"filter_period":30,"index_reference":8397927,"max_volatility_accumulator":1000000,"oracle_index":0,"protocol_share":1000,"protocol_variable_share":1000,"reduction_factor":5000,"time_of_last_update":1754900084,"variable_fee_control":80000000,"volatility_accumulator":0,"volatility_reference":0},"bins":[{"distribution_growth":"0","distribution_last_updated":"0","fee_growth_x":"0","fee_growth_y":"0","fee_x":"0","fee_y":"0","price_q128":"3775786894786258229373795633742882229168175","reserve_x":"100","reserve_y":"100","rewarder_growth":{"contents":[]},"staked_liquidity":"0","staked_lp_amount":"0","storage_id":8397927,"real_bin_id":9319}],"bin_step":10}"#;

        use crate::swap_result::get_swap_out;

        let result = get_swap_out(pair_str, 10000000, true, 1754900084000);

        // Should return error when no next bin is available
        assert!(!result.success);
        assert!(!result.error.is_empty());
        assert_eq!(result.error, "No next bin available");
        // Result fields are still provided even when there's an error
        assert!(result.amount_in_left > 0 || result.amount_out > 0 || result.fee >= 0);
    }
}
