import { TxInput } from "@meshsdk/core";

export type Network = "preprod" | "mainnet";

// Preprod constants
export const preprodOracleNftPolicyId =
  "29e9c1266ba82224daf561f771364ef0c11246c0b38645a4f1140dfd";
export const preprodRefScriptTxHash =
  "1bc3529922ced72dfafdead3bb28fb8129fc90c78c35ff2245246e0cc0ab4688";
export const preprodRefScriptOutputIndex = 0;
export const preprodOracleUtxoTxHash =
  "2f9d8c8fa9407ef0c0c0f67224600fca9619299876f09db4f3b846e7a93dff48";
export const preprodOracleUtxoOutputIndex = 0;

// Mainnet constants
export const mainnetOracleNftPolicyId = "";
export const mainnetRefScriptTxHash = "";
export const mainnetRefScriptOutputIndex = 0;
export const mainnetOracleUtxoTxHash = "";
export const mainnetOracleUtxoOutputIndex = 0;

// Preprod token units
export const preprodUsdmUnit =
  "c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c9135553444d";
export const preprodNightUnit =
  "3363b99384d6ee4c4b009068af396c8fdf92dafd111e58a857af04294e49474854";
export const preprodUsdcxUnit =
  "0483b457673b527c1b6e8ca680a5f3a5676f27cdfea0c9bf285d09385553444358";

// Mainnet token units
export const mainnetUsdmUnit =
  "c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad0014df105553444d";
export const mainnetNightUnit =
  "0691b2fecca1ac4f53cb6dfb00b7013e561d1f34403b957cbb5af1fa4e49474854";
export const mainnetUsdcxUnit =
  "1f3aec8bfe7ea4fe14c5f121e2a92e301afe414147860d557cac7e345553444378";

export class KhorConstants {
  network: Network;

  networkId: 0 | 1;

  oracleNftPolicyId: string;

  oracleUtxo: TxInput;

  refScripts: {
    swapIntent: TxInput;
  };

  tokens: {
    usdm: string;
    night: string;
    usdcx: string;
  };

  constructor(network: Network) {
    this.network = network;
    this.networkId = network === "mainnet" ? 1 : 0;
    this.oracleNftPolicyId =
      network === "mainnet"
        ? mainnetOracleNftPolicyId
        : preprodOracleNftPolicyId;
    this.oracleUtxo = {
      txHash:
        network === "mainnet"
          ? mainnetOracleUtxoTxHash
          : preprodOracleUtxoTxHash,
      outputIndex:
        network === "mainnet"
          ? mainnetOracleUtxoOutputIndex
          : preprodOracleUtxoOutputIndex,
    };
    this.refScripts = {
      swapIntent: {
        txHash:
          network === "mainnet"
            ? mainnetRefScriptTxHash
            : preprodRefScriptTxHash,
        outputIndex:
          network === "mainnet"
            ? mainnetRefScriptOutputIndex
            : preprodRefScriptOutputIndex,
      },
    };
    this.tokens = {
      usdm: network === "mainnet" ? mainnetUsdmUnit : preprodUsdmUnit,
      night: network === "mainnet" ? mainnetNightUnit : preprodNightUnit,
      usdcx: network === "mainnet" ? mainnetUsdcxUnit : preprodUsdcxUnit,
    };
  }
}
