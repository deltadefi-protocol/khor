import {
  Asset,
  byteString,
  conStr0,
  conStr1,
  conStr2,
  integer,
  list,
  UTxO,
  credential,
  MeshValue,
  serializeAddressObj,
} from "@meshsdk/core";
import { SwapOracleSpendBlueprint } from "./bar";
import {
  CancelIntent,
  ProcessIntent,
  RMint,
  RBurn,
  ProcessSwap,
  OracleDatum,
  SwapIntentDatum,
  SpamPrevention,
} from "./bar";
import { addrBech32ToPlutusDataObj, parseDatumCbor } from "@meshsdk/core-csl";

export interface OracleInfo {
  vaultScriptHash: string;
  isVaultScript: boolean;
  swapIntentScriptHash: string;
  operatorKey: string;
  ddKey: string;
}

/** Default deposit amount in lovelace (2 ADA) */
export const DEFAULT_DEPOSIT = 2_000_000;

export interface SwapIntentInfo {
  /** Bech32 address where output will be sent after swap */
  accountAddress: string;
  /** Assets the user is swapping from */
  fromAmount: Asset[];
  /** Assets the user expects to receive */
  toAmount: Asset[];
  /** Slot number used for expiry calculation. Intent is cancellable at createdAt + 600 slots */
  createdAt: number;
  /** Deposit in lovelace returned to user after swap/cancel (default: 2 ADA) */
  deposit?: number;
}

export const oracleDatum = (info: OracleInfo): OracleDatum =>
  conStr0([
    credential(info.vaultScriptHash, info.isVaultScript),
    byteString(info.swapIntentScriptHash),
    byteString(info.operatorKey),
    byteString(info.ddKey),
  ]) as OracleDatum;

/**
 * Constructs a SwapIntentDatum for on-chain storage.
 *
 * @param info - Swap intent information
 * @returns Plutus datum with structure:
 *   - [0] accountAddress: Address receiving output tokens
 *   - [1] fromAmount: Value being swapped
 *   - [2] toAmount: Expected value to receive
 *   - [3] createdAt: Slot number for expiry (cancellable at createdAt + 600)
 *   - [4] deposit: Lovelace deposit returned after swap/cancel
 */
export const swapIntentDatum = (info: SwapIntentInfo): SwapIntentDatum => {
  return conStr0([
    addrBech32ToPlutusDataObj(info.accountAddress), // [0] accountAddress
    MeshValue.fromAssets(info.fromAmount).toJSON(), // [1] fromAmount
    MeshValue.fromAssets(info.toAmount).toJSON(), // [2] toAmount
    integer(info.createdAt), // [3] createdAt (slot)
    integer(info.deposit ?? DEFAULT_DEPOSIT), // [4] deposit (lovelace)
  ]) as SwapIntentDatum;
};

export const rMint = (): RMint => conStr0([]) as RMint;
export const rBurn = (): RBurn => conStr1([]) as RBurn;

export const processSwap = (): ProcessSwap => conStr0([]) as ProcessSwap;
export const cancelIntent = (): CancelIntent => conStr1([]) as CancelIntent;
export const spamPrevention = (): SpamPrevention =>
  conStr2([]) as SpamPrevention;

export const processIntent = (indices: number[]): ProcessIntent =>
  conStr0([list(indices.map((i) => integer(i)))]) as ProcessIntent;

export const parseSwapIntentDatum = (utxo: UTxO, networkId: 0 | 1): SwapIntentInfo | null => {
  if (!utxo.output.plutusData) return null;

  try {
    const datum = parseDatumCbor(utxo.output.plutusData) as SwapIntentDatum;

    const addressData = datum.fields[0];
    const fromAmountData = datum.fields[1];
    const toAmountData = datum.fields[2];
    const createdAt = Number(datum.fields[3].int);
    const deposit = Number(datum.fields[4].int);

    return {
      accountAddress: serializeAddressObj(addressData, networkId),
      fromAmount: MeshValue.fromValue(fromAmountData).toAssets(),
      toAmount: MeshValue.fromValue(toAmountData).toAssets(),
      createdAt,
      deposit,
    };
  } catch (e) {
    console.error("Failed to parse SwapIntentDatum:", e);
    return null;
  }
};

export const parseVaultOracleDatum = (utxo: UTxO): OracleInfo | null => {
  if (!utxo.output.plutusData) return null;

  try {
    const datum = parseDatumCbor(utxo.output.plutusData) as OracleDatum;

    const vaultCredData = datum.fields[0];
    const isVaultScript = vaultCredData.constructor === 1;
    const vaultScriptHash = vaultCredData.fields[0].bytes;
    const swapIntentScriptHash = datum.fields[1].bytes;
    const operatorKey = datum.fields[2].bytes;
    const ddKey = datum.fields[3].bytes;

    return {
      vaultScriptHash,
      isVaultScript,
      swapIntentScriptHash,
      operatorKey,
      ddKey,
    };
  } catch (e) {
    console.error("Failed to parse VaultOracleDatum:", e);
    return null;
  }
};

export const getOracleAddress = (
  oracleNftPolicyId: string,
  networkId: 0 | 1,
): string => {
  const oracleSpend = new SwapOracleSpendBlueprint(networkId, [
    byteString(oracleNftPolicyId),
  ]);
  return oracleSpend.address;
};
