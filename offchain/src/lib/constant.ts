import { TxInput } from "@meshsdk/core";

export type Network = "preprod" | "mainnet";

// Preprod constants
export const preprodOracleNftPolicyId =
  "53470fd23b305c4bda20e94194eec890d35570b3c8ab140e91b0a95d";
export const preprodRefScriptTxHash =
  "7e6e27e0e847871cea708d5eaf00dd1d5263eb0c01d79473dc08a8b66583e7e5";
export const preprodRefScriptOutputIndex = 0;
export const preprodOracleUtxoTxHash =
  "d03a1a76789af931d4af4deb3babada849d0a79a21d2a14e4f1c4066382cec6d";
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
