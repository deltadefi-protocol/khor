import { TxInput } from "@meshsdk/core";

export type Network = "preprod" | "mainnet";

// Preprod constants
export const preprodOracleNftPolicyId =
  "4071dec53b6aefb0d89d9090691454ee47022d55f57fc1ff80795d04";
export const preprodRefScriptTxHash =
  "e3526aea88bd0fc67b0cf868538560daca81850ee09351c1fd8e4c9355ae68ed";
export const preprodRefScriptOutputIndex = 0;
export const preprodOracleUtxoTxHash =
  "5b311a7858f594c98576abed301e24f4c750c55d5f77d621fc7ec4345d48f8f1";
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
