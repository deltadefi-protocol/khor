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
import {
  VaultOracleDatum,
  SwapIntentDatum,
  MintIntent,
  BurnIntent,
  CancelIntent,
  ProcessIntent,
  RMint,
  RBurn,
} from "./bar";
import { addrBech32ToPlutusDataObj, parseDatumCbor } from "@meshsdk/core-csl";

export interface VaultOracleInfo {
  vaultOracleNft: string;
  vaultScriptHash: string;
  isVaultScript: boolean;
  swapIntentScriptHash: string;
  operatorKey: string;
  ddKey: string;
}

export interface SwapIntentInfo {
  accountAddress: string;
  fromAmount: Asset[];
  toAmount: Asset[];
  createdAt: number;
}

export const vaultOracleDatum = (info: VaultOracleInfo): VaultOracleDatum =>
  conStr0([
    byteString(info.vaultOracleNft),
    credential(info.vaultScriptHash, info.isVaultScript),
    byteString(info.swapIntentScriptHash),
    byteString(info.operatorKey),
    byteString(info.ddKey),
  ]) as VaultOracleDatum;

export const swapIntentDatum = (info: SwapIntentInfo): SwapIntentDatum => {
  return conStr0([
    addrBech32ToPlutusDataObj(info.accountAddress),
    MeshValue.fromAssets(info.fromAmount).toJSON(),
    MeshValue.fromAssets(info.toAmount).toJSON(),
    integer(info.createdAt),
  ]) as SwapIntentDatum;
};

export const rMint = (): RMint => conStr0([]) as RMint;
export const rBurn = (): RBurn => conStr1([]) as RBurn;

export const mintIntent = (): MintIntent => conStr0([]) as MintIntent;
export const burnIntent = (): BurnIntent => conStr1([]) as BurnIntent;
export const cancelIntent = (): CancelIntent => conStr2([]) as CancelIntent;

export const processIntent = (indices: number[]): ProcessIntent =>
  conStr0([list(indices.map((i) => integer(i)))]) as ProcessIntent;

export const parseSwapIntentDatum = (utxo: UTxO): SwapIntentInfo | null => {
  if (!utxo.output.plutusData) return null;

  try {
    const datum = parseDatumCbor(utxo.output.plutusData) as SwapIntentDatum;

    const addressData = datum.fields[0];
    const fromAmountData = datum.fields[1];
    const toAmountData = datum.fields[2];
    const createdAt = Number(datum.fields[3].int);

    return {
      accountAddress: serializeAddressObj(addressData),
      fromAmount: MeshValue.fromValue(fromAmountData).toAssets(),
      toAmount: MeshValue.fromValue(toAmountData).toAssets(),
      createdAt,
    };
  } catch (e) {
    console.error("Failed to parse SwapIntentDatum:", e);
    return null;
  }
};

export const parseVaultOracleDatum = (utxo: UTxO): VaultOracleInfo | null => {
  if (!utxo.output.plutusData) return null;

  try {
    const datum = parseDatumCbor(utxo.output.plutusData) as VaultOracleDatum;

    const vaultOracleNft = datum.fields[0].bytes;
    const vaultCredData = datum.fields[1];
    const isVaultScript = vaultCredData.constructor === 1;
    const vaultScriptHash = vaultCredData.fields[0].bytes;
    const swapIntentScriptHash = datum.fields[2].bytes;
    const operatorKey = datum.fields[3].bytes;
    const ddKey = datum.fields[4].bytes;

    return {
      vaultOracleNft,
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
