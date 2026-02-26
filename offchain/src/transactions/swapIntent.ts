import {
  Asset,
  byteString,
  MeshValue,
  resolveSlotNo,
  TxInput,
  UTxO,
} from "@meshsdk/core";
import { KhorTxBuilder, TxParams, TxComplete } from "../lib/common";
import { KhorConfig } from "../lib/constant";
import { SwapIntentSpendBlueprint } from "../lib/bar";
import {
  swapIntentDatum,
  cancelIntent,
  processIntent,
  parseSwapIntentDatum,
  parseVaultOracleDatum,
  processSwap,
} from "../lib/types";
import { csl, OfflineEvaluator } from "@meshsdk/core-csl";

const extractSpentUtxos = (txHex: string): TxInput[] => {
  const cslTx = csl.Transaction.from_hex(txHex);
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

const selectUtxosForWithdrawal = (
  availableUtxos: UTxO[],
  withdrawalAmount: Asset[],
): { selectedUtxos: UTxO[]; returnValue: Asset[] } => {
  const selectedUtxos: UTxO[] = [];
  const selectedValue = new MeshValue();

  // Build target: withdrawal amount + 2 ADA buffer for tx fees/min UTxO
  const targetValue = MeshValue.fromAssets(withdrawalAmount).addAsset({
    unit: "lovelace",
    quantity: "2000000",
  });
  const targetAssets = targetValue.toAssets();

  // Prioritize UTxOs containing needed assets
  const neededUnits = new Set(targetAssets.map((a) => a.unit));
  const sortedUtxos = [...availableUtxos].sort((a, b) => {
    const aScore = a.output.amount.filter((x) =>
      neededUnits.has(x.unit),
    ).length;
    const bScore = b.output.amount.filter((x) =>
      neededUnits.has(x.unit),
    ).length;
    return bScore - aScore;
  });

  // Single pass selection
  for (const utxo of sortedUtxos) {
    if (neededUnits.size === 0) break;
    selectedUtxos.push(utxo);
    selectedValue.addAssets(
      utxo.output.amount.filter((a) => neededUnits.has(a.unit)),
    );
    // Remove satisfied assets from neededUnits
    for (const unit of [...neededUnits]) {
      const unitTarget = targetAssets.find((a) => a.unit === unit);
      if (unitTarget && selectedValue.geq(MeshValue.fromAssets([unitTarget]))) {
        neededUnits.delete(unit);
      }
    }
  }

  // Calculate return value from full UTxO values
  const returnValue = MeshValue.fromAssets(
    selectedUtxos.flatMap((u) => u.output.amount),
  )
    .negateAssets(withdrawalAmount)
    .toAssets();

  return { selectedUtxos, returnValue };
};

export interface CreateSwapIntentParams extends TxParams {
  oracleUtxo: UTxO;
  accountAddress: string;
  fromAmount: Asset[];
  toAmount: Asset[];
  createdAt: number;
  deposit: number;
}

export interface CancelSwapIntentParams extends TxParams {
  oracleUtxo: UTxO;
  swapIntentUtxo: UTxO;
}

export interface ProcessSwapIntentsParams extends TxParams {
  oracleUtxo: UTxO;
  swapIntentUtxos: UTxO[];
  vaultInputUtxos: UTxO[];
}

export class SwapIntentTx extends KhorTxBuilder {
  private swapIntentSpend: SwapIntentSpendBlueprint;
  private swapIntentScriptHash: string;
  private swapIntentAddress: string;

  constructor(config: KhorConfig) {
    super(config);

    const oracleNftPolicyId = config.oracleNftPolicyId;

    this.swapIntentSpend = new SwapIntentSpendBlueprint(config.networkId, [
      byteString(oracleNftPolicyId),
    ]);

    this.swapIntentScriptHash = this.swapIntentSpend.hash;
    this.swapIntentAddress = this.swapIntentSpend.address;
  }

  getSwapIntentAddress = (): string => this.swapIntentAddress;
  getSwapIntentScriptHash = (): string => this.swapIntentScriptHash;

  /**
   * Create a new swap intent - mints intent token and locks assets
   */
  createSwapIntent = async (
    params: CreateSwapIntentParams,
    fetcher?: any,
  ): Promise<TxComplete> => {
    const txBuilder = this.newValidationTx(params, fetcher);
    const networkName = this.config.networkId === 0 ? "preprod" : "mainnet";
    const slot = resolveSlotNo(networkName, params.createdAt * 1000 + 600); // 10 minutes after creation

    const datum = swapIntentDatum({
      accountAddress: params.accountAddress,
      fromAmount: params.fromAmount,
      toAmount: params.toAmount,
      createdAt: Number(slot),
      deposit: params.deposit,
    });

    const outputValue = MeshValue.fromAssets(params.fromAmount);
    outputValue.addAssets([
      { unit: "lovelace", quantity: params.deposit.toString() },
    ]); // Add deposit to output value

    txBuilder
      .readOnlyTxInReference(
        params.oracleUtxo.input.txHash,
        params.oracleUtxo.input.outputIndex,
        0,
      )
      .txOut(this.swapIntentAddress, outputValue.toAssets())
      .txOutInlineDatumValue(datum, "JSON");

    const txHex = await txBuilder.complete();

    return {
      txHex,
      spentUtxos: extractSpentUtxos(txHex),
    };
  };

  /**
   * Cancel a swap intent - burns intent token and reclaims assets
   * Can only be done 10+ minutes after creation
   */
  cancelSwapIntent = async (
    params: CancelSwapIntentParams,
    fetcher?: any,
  ): Promise<TxComplete> => {
    const txBuilder = this.newValidationTx(params, fetcher);

    const intentUtxo = params.swapIntentUtxo;
    const intentInfo = parseSwapIntentDatum(intentUtxo);
    if (!intentInfo) {
      throw new Error("Invalid swap intent UTxO");
    }

    txBuilder
      .readOnlyTxInReference(
        params.oracleUtxo.input.txHash,
        params.oracleUtxo.input.outputIndex,
        0,
      )
      // Spend the swap intent UTxO
      .spendingPlutusScriptV3()
      .txIn(
        intentUtxo.input.txHash,
        intentUtxo.input.outputIndex,
        intentUtxo.output.amount,
        intentUtxo.output.address,
        0,
      )
      .txInInlineDatumPresent()
      .txInRedeemerValue(cancelIntent(), "JSON")
      .spendingTxInReference(
        this.config.refScripts.swapIntent.txHash,
        this.config.refScripts.swapIntent.outputIndex,
        (this.swapIntentSpend.cbor.length / 2).toString(),
        this.swapIntentSpend.hash,
      )
      // Send locked funds back to user's account address
      .txOut(intentInfo.accountAddress, intentUtxo.output.amount)
      .invalidBefore(intentInfo.createdAt + 600); // 10 minutes after creation

    const txHex = await txBuilder.complete();

    return {
      txHex,
      spentUtxos: extractSpentUtxos(txHex),
    };
  };

  /**
   * Process multiple swap intents in a batch
   */
  processSwapIntents = async (
    params: ProcessSwapIntentsParams,
    fetcher?: any,
  ): Promise<TxComplete> => {
    // Parse oracle datum to check if vault is a script
    const oracleInfo = parseVaultOracleDatum(params.oracleUtxo);
    if (!oracleInfo) {
      throw new Error("Invalid oracle UTxO");
    }

    // Sort swap intent UTxOs by txHash and outputIndex (ascending) to match Cardano input ordering
    const sortedSwapIntentUtxos = [...params.swapIntentUtxos].sort((a, b) => {
      const txHashCompare = a.input.txHash.localeCompare(b.input.txHash);
      if (txHashCompare !== 0) return txHashCompare;
      return a.input.outputIndex - b.input.outputIndex;
    });

    // Parse all intent datums for user outputs (in sorted order)
    const intentInfos = sortedSwapIntentUtxos.map((utxo) => {
      const info = parseSwapIntentDatum(utxo);
      if (!info) {
        throw new Error("Invalid swap intent UTxO");
      }
      return info;
    });

    // Calculate total amounts
    const totalFromAmount = new MeshValue();
    const totalToAmount = new MeshValue();
    for (const intentInfo of intentInfos) {
      totalFromAmount.addAssets(intentInfo.fromAmount);
      totalToAmount.addAssets(intentInfo.toAmount);
    }

    // Select vault UTxOs to cover totalToAmount (what users receive)
    const { selectedUtxos, returnValue } = selectUtxosForWithdrawal(
      params.vaultInputUtxos,
      totalToAmount.toAssets(),
    );

    // Vault return = returnValue + totalFromAmount (from intents)
    const vaultReturnValue = MeshValue.fromAssets(returnValue)
      .addAssets(totalFromAmount.toAssets())
      .toAssets();

    const burnAmount = (-sortedSwapIntentUtxos.length).toString();
    let outputIndex = 1; // vault change is at index 0
    const userOutputIndices: number[] = [];
    for (let i = 0; i < intentInfos.length; i++) {
      userOutputIndices.push(outputIndex);
      outputIndex++;
    }

    // Helper to build tx with given exUnits
    const buildTx = async (exUnits?: {
      spend: { mem: number; steps: number };
      mint: { mem: number; steps: number };
      withdraw: { mem: number; steps: number };
    }) => {
      const txBuilder = this.newValidationTx(params, fetcher, false);

      txBuilder.readOnlyTxInReference(
        params.oracleUtxo.input.txHash,
        params.oracleUtxo.input.outputIndex,
      );

      // Add vault inputs - handle script vs pubkey vault
      if (oracleInfo.isVaultScript) {
        throw new Error("Script vault not yet implemented");
      } else {
        for (const vaultUtxo of selectedUtxos) {
          txBuilder.txIn(
            vaultUtxo.input.txHash,
            vaultUtxo.input.outputIndex,
            vaultUtxo.output.amount,
            vaultUtxo.output.address,
            0,
          );
        }
      }

      // Spend all swap intent UTxOs
      for (const intentUtxo of sortedSwapIntentUtxos) {
        txBuilder
          .spendingPlutusScriptV3()
          .txIn(
            intentUtxo.input.txHash,
            intentUtxo.input.outputIndex,
            intentUtxo.output.amount,
            intentUtxo.output.address,
            0,
          )
          .txInInlineDatumPresent()
          .txInRedeemerValue(processSwap(), "JSON", exUnits?.spend)
          .spendingTxInReference(
            this.config.refScripts.swapIntent.txHash,
            this.config.refScripts.swapIntent.outputIndex,
            (this.swapIntentSpend.cbor.length / 2).toString(),
            this.swapIntentSpend.hash,
          );
      }

      // Add vault return output
      if (vaultReturnValue.length > 0) {
        txBuilder.txOut(
          params.vaultInputUtxos[0]!.output.address,
          vaultReturnValue,
        );
      }

      // Add user outputs
      for (const intentInfo of intentInfos) {
        const outputValue = MeshValue.fromAssets(intentInfo.toAmount);
        outputValue.addAssets([
          { unit: "lovelace", quantity: intentInfo.deposit.toString() },
        ]);
        txBuilder.txOut(intentInfo.accountAddress, outputValue.toAssets());
      }

      // Withdrawal validator for batch processing
      txBuilder
        .withdrawalPlutusScriptV3()
        .withdrawal(this.swapIntentSpend.address, "0")
        .withdrawalTxInReference(
          this.config.refScripts.swapIntent.txHash,
          this.config.refScripts.swapIntent.outputIndex,
          (this.swapIntentSpend.cbor.length / 2).toString(),
          this.swapIntentSpend.hash,
        )
        .withdrawalRedeemerValue(
          processIntent(userOutputIndices),
          "JSON",
          exUnits?.withdraw,
        )
        .requiredSignerHash(oracleInfo.ddKey)
        .requiredSignerHash(oracleInfo.operatorKey);

      return txBuilder.complete();
    };

    // First pass: build tx with placeholder exUnits to evaluate
    const initialTxHex = await buildTx();

    const evaluator = new OfflineEvaluator(
      fetcher,
      this.config.networkId === 0 ? "preprod" : "mainnet",
    );

    const evalResult = await evaluator.evaluateTx(initialTxHex, [], []);

    // Parse evaluation result into exUnits
    const exUnits = {
      spend: { mem: 0, steps: 0 },
      mint: { mem: 0, steps: 0 },
      withdraw: { mem: 0, steps: 0 },
    };
    for (const result of evalResult) {
      if (result.tag === "SPEND") {
        exUnits.spend = { mem: result.budget.mem, steps: result.budget.steps };
      } else if (result.tag === "REWARD") {
        exUnits.withdraw = {
          mem: result.budget.mem,
          steps: result.budget.steps,
        };
      }
    }

    // Second pass: build tx with actual exUnits
    const txHex = await buildTx(exUnits);

    return {
      txHex,
      spentUtxos: extractSpentUtxos(txHex),
    };
  };
}
