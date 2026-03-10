import {
  MeshTxBuilder,
  UTxO,
  MeshTxBuilderOptions,
  TxInput,
  Asset,
} from "@meshsdk/core";
import { OfflineEvaluator, csl } from "@meshsdk/core-csl";
import { KhorConstants } from "./constant";

export interface TxParams {
  utxos: UTxO[];
  collateral: UTxO;
  changeAddress: string;
}

export interface TxComplete {
  txHex: string;
  spentUtxos: TxInput[];
  newUtxos: UTxO[];
}

export const extractSpentUtxos = (txHex: string): TxInput[] => {
  const cslTx = csl.FixedTransaction.from_hex(txHex);
  const spentUtxos: TxInput[] = [];

  for (let i = 0; i < cslTx.body().inputs().len(); i++) {
    const input = cslTx.body().inputs().get(i);
    spentUtxos.push({
      txHash: input.transaction_id().to_hex(),
      outputIndex: input.index(),
    });
  }

  return spentUtxos;
};

export const extractNewUtxos = (txHex: string): UTxO[] => {
  const cslTx = csl.FixedTransaction.from_hex(txHex);
  const txHash = cslTx.transaction_hash().to_hex();
  const outputs = cslTx.body().outputs();
  const newUtxos: UTxO[] = [];

  for (let i = 0; i < outputs.len(); i++) {
    const output = outputs.get(i);
    const address = output.address().to_bech32();

    // Parse amount
    const amount: Asset[] = [];
    const coin = output.amount().coin().to_str();
    amount.push({ unit: "lovelace", quantity: coin });

    const multiAsset = output.amount().multiasset();
    if (multiAsset) {
      const policyIds = multiAsset.keys();
      for (let p = 0; p < policyIds.len(); p++) {
        const policyId = policyIds.get(p);
        const assets = multiAsset.get(policyId);
        if (assets) {
          const assetNames = assets.keys();
          for (let a = 0; a < assetNames.len(); a++) {
            const assetName = assetNames.get(a);
            const qty = assets.get(assetName);
            if (qty) {
              const unit = policyId.to_hex() + assetName.to_hex();
              amount.push({ unit, quantity: qty.to_str() });
            }
          }
        }
      }
    }

    let plutusData: string | undefined;

    const plutusDataField = output.plutus_data();
    if (plutusDataField) {
      plutusData = plutusDataField.to_hex();
    }

    newUtxos.push({
      input: {
        txHash,
        outputIndex: i,
      },
      output: {
        address,
        amount,
        plutusData,
      },
    });
  }

  return newUtxos;
};

export class KhorTxBuilder {
  constructor(public config: KhorConstants) {}

  newTxBuilder = (evaluateTx = true, fetcher?: any): MeshTxBuilder => {
    const txBuilderConfig: MeshTxBuilderOptions = {
      verbose: false,
    };

    if (fetcher) {
      txBuilderConfig.fetcher = fetcher;
    }

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
