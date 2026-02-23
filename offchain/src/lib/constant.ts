import { TxInput } from "@meshsdk/core";

export type Network = "preprod" | "mainnet";

export interface KhorConfig {
  network: Network;
  networkId: 0 | 1;
  refScripts: {
    swapIntent: TxInput;
  };
}

// Preprod config - TODO: update with actual deployed ref script locations
const preprodConfig: KhorConfig = {
  network: "preprod",
  networkId: 0,
  refScripts: {
    swapIntent: {
      txHash: "",
      outputIndex: 0,
    },
  },
};

// Mainnet config - TODO: update with actual deployed ref script locations
const mainnetConfig: KhorConfig = {
  network: "mainnet",
  networkId: 1,
  refScripts: {
    swapIntent: {
      txHash: "",
      outputIndex: 0,
    },
  },
};

export const getConfig = (network: Network): KhorConfig => {
  switch (network) {
    case "preprod":
      return preprodConfig;
    case "mainnet":
      return mainnetConfig;
  }
};

export const minUtxos = {
  swapIntent: "2000000",
};
