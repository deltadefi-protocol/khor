import {
  MeshTxBuilder,
  UTxO,
  MeshTxBuilderOptions,
  TxInput,
} from "@meshsdk/core";
import { OfflineEvaluator } from "@meshsdk/core-csl";
import { KhorConfig } from "./constant";

export interface TxParams {
  utxos: UTxO[];
  collateral: UTxO;
  changeAddress: string;
}

export interface TxComplete {
  txHex: string;
  spentUtxos: TxInput[];
}

export class KhorTxBuilder {
  constructor(public config: KhorConfig) {}

  newTxBuilder = (evaluateTx = true, fetcher?: any): MeshTxBuilder => {
    const txBuilderConfig: MeshTxBuilderOptions = {
      verbose: true,
    };

    if (evaluateTx && fetcher) {
      const evaluator = new OfflineEvaluator(fetcher, this.config.network);
      txBuilderConfig.evaluator = evaluator;
    }

    const txBuilder = new MeshTxBuilder(txBuilderConfig);
    txBuilder.setNetwork(this.config.networkId === 1 ? "mainnet" : "preprod");

    return txBuilder;
  };

  newTx = (params: TxParams): MeshTxBuilder => {
    const txBuilder = this.newTxBuilder(false);

    txBuilder.changeAddress(params.changeAddress).selectUtxosFrom(params.utxos);

    return txBuilder;
  };

  newValidationTx = (
    params: TxParams,
    fetcher?: any,
    evaluateTx = true,
  ): MeshTxBuilder => {
    const txBuilder = this.newTxBuilder(evaluateTx, fetcher);

    if (params.utxos.length === 0) {
      throw new Error("No UTxOs available for transaction");
    }

    txBuilder
      .txInCollateral(
        params.collateral.input.txHash,
        params.collateral.input.outputIndex,
        params.collateral.output.amount,
        params.collateral.output.address,
      )
      .setTotalCollateral("3000000")
      .changeAddress(params.changeAddress)
      .selectUtxosFrom(params.utxos);

    for (const utxo of params.utxos) {
      txBuilder.inputForEvaluation(utxo);
    }

    return txBuilder;
  };
}

export const sleep = (second: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, second * 1000));
