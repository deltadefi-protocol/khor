import { TxInput } from "@meshsdk/core";

export type Network = "preprod" | "mainnet";

// Preprod constants
export const preprodOracleNftPolicyId =
  "4071dec53b6aefb0d89d9090691454ee47022d55f57fc1ff80795d04";
export const preprodRefScriptTxHash =
  "e3526aea88bd0fc67b0cf868538560daca81850ee09351c1fd8e4c9355ae68ed";
export const preprodRefScriptOutputIndex = 0;

// Mainnet constants
export const mainnetOracleNftPolicyId = "";
export const mainnetRefScriptTxHash = "";
export const mainnetRefScriptOutputIndex = 0;

export class KhorConstants {
  network: Network;

  networkId: 0 | 1;

  oracleNftPolicyId: string;

  refScripts: {
    swapIntent: TxInput;
  };

  constructor(network: Network) {
    this.network = network;
    this.networkId = network === "mainnet" ? 1 : 0;
    this.oracleNftPolicyId =
      network === "mainnet"
        ? mainnetOracleNftPolicyId
        : preprodOracleNftPolicyId;
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
  }
}

export const minUtxos = {
  swapIntent: "2000000",
};
