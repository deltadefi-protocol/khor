import {
  Asset,
  byteString,
  MeshValue,
  resolveSlotNo,
  IFetcher,
  UTxO,
  TxInput,
  SLOT_CONFIG_NETWORK,
} from "@meshsdk/core";
import {
  KhorTxBuilder,
  TxParams,
  TxComplete,
  extractSpentUtxos,
  extractNewUtxos,
} from "../lib/common";
import { KhorConstants } from "../lib/constant";
import {
  SwapIntentSpendBlueprint,
  SwapIntentWithdrawBlueprint,
} from "../lib/bar";
import {
  swapIntentDatum,
  cancelIntent,
  processIntent,
  parseSwapIntentDatum,
  parseVaultOracleDatum,
  processSwap,
  DEFAULT_DEPOSIT,
} from "../lib/types";
import { csl, OfflineEvaluator } from "@meshsdk/core-csl";

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

export const DEFAULT_EXPIRY_MS = 10 * 60 * 1000;

export interface CreateSwapIntentParams extends TxParams {
  accountAddress: string;
  fromAmount: Asset[];
  toAmount: Asset[];
  deposit?: number;
  expiry?: number; // Duration in ms until intent expires (default: 10 mins)
}

export interface CancelSwapIntentParams extends TxParams {
  oracleUtxo: TxInput;
  swapIntentUtxo: UTxO;
  operatorKeyHash?: string; // If provided, enables immediate cancel (bypasses 10-min time lock)
}

export interface SwapIntentFill {
  utxo: UTxO;
  outputAmount: Asset[]; // Output amount for this intent (can be >= toAmount)
}

export interface ProcessSwapIntentsParams extends TxParams {
  oracleUtxo: UTxO;
  swapIntentFills: SwapIntentFill[];
  vaultInputUtxos: UTxO[];
}

export interface ProcessSwapIntentsResult extends TxComplete {
  feePerIntent: string;
  intentCount: number;
}

export class SwapIntentTx extends KhorTxBuilder {
  private swapIntentSpend: SwapIntentSpendBlueprint;
  private swapIntentWithdraw: SwapIntentWithdrawBlueprint;
  private swapIntentScriptHash: string;
  private swapIntentAddress: string;

  constructor(config: KhorConstants) {
    super(config);

    const oracleNftPolicyId = config.oracleNftPolicyId;

    this.swapIntentSpend = new SwapIntentSpendBlueprint(config.networkId, [
      byteString(oracleNftPolicyId),
    ]);
    this.swapIntentWithdraw = new SwapIntentWithdrawBlueprint(
      config.networkId,
      [byteString(oracleNftPolicyId)],
    );

    this.swapIntentScriptHash = this.swapIntentSpend.hash;
    this.swapIntentAddress = this.swapIntentSpend.address;
  }

  getSwapIntentAddress = (): string => this.swapIntentAddress;
  getSwapIntentScriptHash = (): string => this.swapIntentScriptHash;

  /**
   * Fetch all swap intent UTxOs at the script address
   * Excludes invalid intents (negative deposit, insufficient value)
   */
  fetchSwapIntentUtxos = async (fetcher: IFetcher): Promise<UTxO[]> => {
    const allUtxos = await fetcher.fetchAddressUTxOs(this.swapIntentAddress);
    return allUtxos.filter((utxo) => {
      const info = parseSwapIntentDatum(utxo, this.config.networkId);
      if (!info) return false;
      if (info.deposit !== undefined && info.deposit < 0) return false;
      // Check output value >= deposit + fromAmount
      const utxoValue = MeshValue.fromAssets(utxo.output.amount);
      const expectedValue = MeshValue.fromAssets(info.fromAmount).addAsset({
        unit: "lovelace",
        quantity: (info.deposit ?? DEFAULT_DEPOSIT).toString(),
      });
      if (!utxoValue.geq(expectedValue)) return false;
      return true;
    });
  };

  /**
   * Fetch swap intent UTxOs filtered by account address
   * Excludes invalid intents (negative deposit, insufficient value)
   */
  fetchSwapIntentUtxosByAddress = async (
    fetcher: IFetcher,
    accountAddress: string,
  ): Promise<UTxO[]> => {
    const allUtxos = await this.fetchSwapIntentUtxos(fetcher);
    return allUtxos.filter((utxo) => {
      const info = parseSwapIntentDatum(utxo, this.config.networkId);
      return info?.accountAddress === accountAddress;
    });
  };

  /**
   * Check if a swap intent UTxO is cancellable (10+ minutes after creation)
   * Returns true if cancellable now, false otherwise
   */
  isCancellable = (swapIntentUtxo: UTxO): boolean => {
    const info = parseSwapIntentDatum(swapIntentUtxo, this.config.networkId);
    if (!info) return false;

    const networkName = this.config.networkId === 0 ? "preprod" : "mainnet";
    const currentSlot = Number(resolveSlotNo(networkName, Date.now()));
    const cancellableAfterSlot = info.createdAt + 600;

    return currentSlot >= cancellableAfterSlot;
  };

  /**
   * Get cancellable timestamp for a swap intent UTxO
   * Returns the Unix timestamp (in ms) when the intent becomes cancellable
   */
  getCancellableAt = (swapIntentUtxo: UTxO): number | null => {
    const info = parseSwapIntentDatum(swapIntentUtxo, this.config.networkId);
    if (!info) return null;

    const networkName = this.config.networkId === 0 ? "preprod" : "mainnet";
    const cancellableAfterSlot = info.createdAt + 600;
    const slotConfig = SLOT_CONFIG_NETWORK[networkName];

    return (
      (cancellableAfterSlot - slotConfig.zeroSlot) * slotConfig.slotLength +
      slotConfig.zeroTime
    );
  };

  /**
   * Create a new swap intent - mints intent token and locks assets
   */
  createSwapIntent = async (
    params: CreateSwapIntentParams,
    fetcher?: any,
  ): Promise<TxComplete> => {
    const txBuilder = this.newValidationTx(params, fetcher);
    const networkName = this.config.networkId === 0 ? "preprod" : "mainnet";

    const expiryDuration = params.expiry ?? DEFAULT_EXPIRY_MS;
    const expirySlot = Number(
      resolveSlotNo(networkName, Date.now() + expiryDuration),
    );
    // createdAt is 600 slots before expiry so that createdAt + 600 = expiry
    const createdAtSlot = expirySlot - 600;

    const deposit = params.deposit ?? DEFAULT_DEPOSIT;

    const datum = swapIntentDatum({
      accountAddress: params.accountAddress,
      fromAmount: params.fromAmount,
      toAmount: params.toAmount,
      createdAt: createdAtSlot,
      deposit,
    });

    const outputValue = MeshValue.fromAssets(params.fromAmount);
    outputValue.addAssets([{ unit: "lovelace", quantity: deposit.toString() }]); // Add deposit to output value

    txBuilder
      .txOut(this.swapIntentAddress, outputValue.toAssets())
      .txOutInlineDatumValue(datum, "JSON");

    const txHex = await txBuilder.complete();

    return {
      txHex,
      spentUtxos: extractSpentUtxos(txHex),
      newUtxos: extractNewUtxos(txHex),
    };
  };

  /**
   * Cancel a swap intent - burns intent token and reclaims assets
   * Can be done:
   * - After 10+ minutes from creation (user self-cancel)
   * - Immediately if operator signs (pass operator key hash in requiredSigners)
   */
  cancelSwapIntent = async (
    params: CancelSwapIntentParams,
    fetcher?: any,
  ): Promise<TxComplete> => {
    const intentUtxo = params.swapIntentUtxo;
    const intentInfo = parseSwapIntentDatum(intentUtxo, this.config.networkId);
    if (!intentInfo) {
      throw new Error("Invalid swap intent UTxO");
    }

    // Helper to build tx with given exUnits
    const buildTx = async (exUnits?: { mem: number; steps: number }) => {
      const txBuilder = this.newValidationTx(params, fetcher, false);

      txBuilder
        .readOnlyTxInReference(
          params.oracleUtxo.txHash,
          params.oracleUtxo.outputIndex,
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
        .txInRedeemerValue(cancelIntent(), "JSON", exUnits)
        .spendingTxInReference(
          this.config.refScripts.swapIntent.txHash,
          this.config.refScripts.swapIntent.outputIndex,
          (this.swapIntentSpend.cbor.length / 2).toString(),
          this.swapIntentSpend.hash,
        )
        .inputForEvaluation(intentUtxo)
        // Send locked funds back to user's account address
        .txOut(intentInfo.accountAddress, intentUtxo.output.amount);

      // If operator key hash provided, add as required signer for immediate cancel
      // Otherwise, require time lock (10 minutes after creation)
      if (params.operatorKeyHash) {
        txBuilder.requiredSignerHash(params.operatorKeyHash);
      } else {
        txBuilder.invalidBefore(intentInfo.createdAt + 600);
      }

      return txBuilder.complete();
    };

    // First pass: build tx with placeholder exUnits to evaluate
    const initialTxHex = await buildTx();

    const evaluator = new OfflineEvaluator(
      fetcher,
      this.config.networkId === 0 ? "preprod" : "mainnet",
    );

    // Collect all UTxOs needed for evaluation
    const additionalUtxos: UTxO[] = [...params.utxos, intentUtxo];

    const evalResult = await evaluator.evaluateTx(
      initialTxHex,
      additionalUtxos,
      [],
    );

    // Parse evaluation result into exUnits
    let exUnits = { mem: 0, steps: 0 };
    for (const result of evalResult) {
      if (result.tag === "SPEND") {
        exUnits = { mem: result.budget.mem, steps: result.budget.steps };
      }
    }

    // Second pass: build tx with actual exUnits
    const txHex = await buildTx(exUnits);

    return {
      txHex,
      spentUtxos: extractSpentUtxos(txHex),
      newUtxos: extractNewUtxos(txHex),
    };
  };

  /**
   * Process multiple swap intents in a batch
   */
  processSwapIntents = async (
    params: ProcessSwapIntentsParams,
    fetcher?: any,
  ): Promise<ProcessSwapIntentsResult> => {
    // Parse oracle datum to check if vault is a script
    const oracleInfo = parseVaultOracleDatum(params.oracleUtxo);
    if (!oracleInfo) {
      throw new Error("Invalid oracle UTxO");
    }

    // Sort swap intent fills by utxo txHash and outputIndex (ascending) to match Cardano input ordering
    const sortedFills = [...params.swapIntentFills].sort((a, b) => {
      const txHashCompare = a.utxo.input.txHash.localeCompare(
        b.utxo.input.txHash,
      );
      if (txHashCompare !== 0) return txHashCompare;
      return a.utxo.input.outputIndex - b.utxo.input.outputIndex;
    });

    // Parse all intent datums for user outputs (in sorted order)
    const intentInfos = sortedFills.map((fill) => {
      const info = parseSwapIntentDatum(fill.utxo, this.config.networkId);
      if (!info) {
        throw new Error("Invalid swap intent UTxO");
      }
      return info;
    });

    // Calculate total amounts
    const totalFromAmount = new MeshValue();
    const totalOutputAmount = new MeshValue();
    for (const intentInfo of intentInfos) {
      totalFromAmount.addAssets(intentInfo.fromAmount);
    }
    for (const fill of sortedFills) {
      totalOutputAmount.addAssets(fill.outputAmount);
    }

    // Select vault UTxOs to cover totalOutputAmount (what users receive)
    const { selectedUtxos, returnValue } = selectUtxosForWithdrawal(
      params.vaultInputUtxos,
      totalOutputAmount.toAssets(),
    );

    // Vault return = returnValue + totalFromAmount (from intents)
    const vaultReturnValue = MeshValue.fromAssets(returnValue)
      .addAssets(totalFromAmount.toAssets())
      .toAssets();

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
          txBuilder
            .txIn(
              vaultUtxo.input.txHash,
              vaultUtxo.input.outputIndex,
              vaultUtxo.output.amount,
              vaultUtxo.output.address,
              0,
            )
            .inputForEvaluation(vaultUtxo);
        }
      }

      // Spend all swap intent UTxOs
      for (const fill of sortedFills) {
        txBuilder
          .spendingPlutusScriptV3()
          .txIn(
            fill.utxo.input.txHash,
            fill.utxo.input.outputIndex,
            fill.utxo.output.amount,
            fill.utxo.output.address,
            0,
          )
          .txInInlineDatumPresent()
          .txInRedeemerValue(processSwap(), "JSON", exUnits?.spend)
          .spendingTxInReference(
            this.config.refScripts.swapIntent.txHash,
            this.config.refScripts.swapIntent.outputIndex,
            (this.swapIntentSpend.cbor.length / 2).toString(),
            this.swapIntentSpend.hash,
          )
          .inputForEvaluation(fill.utxo);
      }

      // Add vault return output
      if (vaultReturnValue.length > 0) {
        txBuilder.txOut(
          params.vaultInputUtxos[0]!.output.address,
          vaultReturnValue,
        );
      }

      // Add user outputs (using outputAmount from each fill, which can be >= toAmount)
      for (let i = 0; i < sortedFills.length; i++) {
        const fill = sortedFills[i]!;
        const intentInfo = intentInfos[i]!;
        const outputValue = MeshValue.fromAssets(fill.outputAmount);
        outputValue.addAssets([
          {
            unit: "lovelace",
            quantity: (intentInfo.deposit ?? DEFAULT_DEPOSIT).toString(),
          },
        ]);
        txBuilder.txOut(intentInfo.accountAddress, outputValue.toAssets());
      }

      // Withdrawal validator for batch processing
      txBuilder
        .withdrawalPlutusScriptV3()
        .withdrawal(this.swapIntentWithdraw.address, "0")
        .withdrawalTxInReference(
          this.config.refScripts.swapIntent.txHash,
          this.config.refScripts.swapIntent.outputIndex,
          (this.swapIntentWithdraw.cbor.length / 2).toString(),
          this.swapIntentWithdraw.hash,
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

    // Collect all UTxOs needed for evaluation
    const additionalUtxos: UTxO[] = [
      ...params.utxos,
      params.oracleUtxo,
      ...sortedFills.map((f) => f.utxo),
      ...selectedUtxos,
    ];

    const evalResult = await evaluator.evaluateTx(
      initialTxHex,
      additionalUtxos,
      [],
    );

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

    // Extract fee from transaction and calculate fee per intent
    const tx = csl.Transaction.from_hex(txHex);
    const totalFee = BigInt(tx.body().fee().to_str());
    const intentCount = sortedFills.length;
    const feePerIntent = (totalFee / BigInt(intentCount)).toString();

    return {
      txHex,
      spentUtxos: extractSpentUtxos(txHex),
      newUtxos: extractNewUtxos(txHex),
      feePerIntent,
      intentCount,
    };
  };
}
