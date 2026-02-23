import { TxInput } from "@meshsdk/core";

export type Network = "preprod" | "mainnet";

export interface KhorConfig {
  network: Network;
  networkId: 0 | 1;
  oracleNftPolicyId: string;
  refScripts: {
    swapIntent: TxInput;
  };
}

export const createConfig = (params: {
  network: Network;
  oracleNftPolicyId: string;
  refScripts: {
    swapIntent: TxInput;
  };
}): KhorConfig => ({
  network: params.network,
  networkId: params.network === "mainnet" ? 1 : 0,
  oracleNftPolicyId: params.oracleNftPolicyId,
  refScripts: params.refScripts,
});

export const minUtxos = {
  swapIntent: "2000000",
};
