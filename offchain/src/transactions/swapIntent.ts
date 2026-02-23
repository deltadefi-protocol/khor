import {
  Asset,
  byteString,
  MeshValue,
  pubKeyAddress,
  scriptAddress,
  serializeAddressObj,
  TxInput,
  UTxO,
} from "@meshsdk/core";
import { KhorTxBuilder, TxParams, TxComplete } from "../lib/common";
import { KhorConfig } from "../lib/constant";
import {
  SwapIntentSpendBlueprint,
  SwapIntentMintBlueprint,
  SwapIntentWithdrawBlueprint,
} from "../lib/bar";
import {
  swapIntentDatum,
  mintIntent,
  burnIntent,
  cancelIntent,
  processIntent,
  parseSwapIntentDatum,
  parseVaultOracleDatum,
} from "../lib/types";
import { csl } from "@meshsdk/core-csl";

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
    const aScore = a.output.amount.filter((x) => neededUnits.has(x.unit)).length;
    const bScore = b.output.amount.filter((x) => neededUnits.has(x.unit)).length;
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
  private swapIntentMint: SwapIntentMintBlueprint;
  private swapIntentWithdraw: SwapIntentWithdrawBlueprint;
  private swapIntentScriptHash: string;
  private swapIntentAddress: string;
  private swapIntentPolicyId: string;

  constructor(config: KhorConfig) {
    super(config);

    const oracleNftPolicyId = config.oracleNftPolicyId;

    this.swapIntentSpend = new SwapIntentSpendBlueprint(config.networkId, [
      byteString(oracleNftPolicyId),
    ]);
    this.swapIntentMint = new SwapIntentMintBlueprint([
      byteString(oracleNftPolicyId),
    ]);
    this.swapIntentWithdraw = new SwapIntentWithdrawBlueprint(
      config.networkId,
      [byteString(oracleNftPolicyId)],
    );

    this.swapIntentScriptHash = this.swapIntentSpend.hash;
    this.swapIntentAddress = this.swapIntentSpend.address;
    this.swapIntentPolicyId = this.swapIntentMint.hash;
  }

  getSwapIntentAddress = (): string => this.swapIntentAddress;
  getSwapIntentPolicyId = (): string => this.swapIntentPolicyId;
  getSwapIntentScriptHash = (): string => this.swapIntentScriptHash;

  /**
   * Create a new swap intent - mints intent token and locks assets
   */
  createSwapIntent = async (
    params: CreateSwapIntentParams,
    fetcher?: any,
  ): Promise<TxComplete> => {
    const txBuilder = this.newValidationTx(params, fetcher);

    const datum = swapIntentDatum({
      accountAddress: params.accountAddress,
      fromAmount: params.fromAmount,
      toAmount: params.toAmount,
      createdAt: params.createdAt,
    });

    const outputAssets: Asset[] = [
      { unit: this.swapIntentPolicyId, quantity: "1" },
      ...params.fromAmount,
    ];

    txBuilder
      .readOnlyTxInReference(
        params.oracleUtxo.input.txHash,
        params.oracleUtxo.input.outputIndex,
      )
      .mintPlutusScriptV3()
      .mint("1", this.swapIntentPolicyId, "")
      .mintTxInReference(
        this.config.refScripts.swapIntent.txHash,
        this.config.refScripts.swapIntent.outputIndex,
        (this.swapIntentMint.cbor.length / 2).toString(),
        this.swapIntentMint.hash,
      )
      .mintRedeemerValue(mintIntent(), "JSON")
      .txOut(this.swapIntentAddress, outputAssets)
      .txOutInlineDatumValue(datum);

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
      )
      // Spend the swap intent UTxO
      .spendingPlutusScriptV3()
      .txIn(intentUtxo.input.txHash, intentUtxo.input.outputIndex)
      .txInInlineDatumPresent()
      .txInRedeemerValue(cancelIntent(), "JSON")
      .spendingTxInReference(
        this.config.refScripts.swapIntent.txHash,
        this.config.refScripts.swapIntent.outputIndex,
        (this.swapIntentSpend.cbor.length / 2).toString(),
        this.swapIntentSpend.hash,
      )
      // Burn the intent token
      .mintPlutusScriptV3()
      .mint("-1", this.swapIntentPolicyId, "")
      .mintTxInReference(
        this.config.refScripts.swapIntent.txHash,
        this.config.refScripts.swapIntent.outputIndex,
        (this.swapIntentMint.cbor.length / 2).toString(),
        this.swapIntentMint.hash,
      )
      .mintRedeemerValue(burnIntent(), "JSON")
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
    const txBuilder = this.newValidationTx(params, fetcher);

    // Parse oracle datum to check if vault is a script
    const oracleInfo = parseVaultOracleDatum(params.oracleUtxo);
    if (!oracleInfo) {
      throw new Error("Invalid oracle UTxO");
    }

    // Parse all intent datums for user outputs
    const intentInfos = params.swapIntentUtxos.map((utxo) => {
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

    // Get vault address from oracle datum
    const vaultAddressObj = oracleInfo.isVaultScript
      ? scriptAddress(oracleInfo.vaultScriptHash)
      : pubKeyAddress(oracleInfo.vaultScriptHash);
    const vaultAddress = serializeAddressObj(vaultAddressObj, this.config.networkId);

    txBuilder.readOnlyTxInReference(
      params.oracleUtxo.input.txHash,
      params.oracleUtxo.input.outputIndex,
    );

    // Add vault inputs - handle script vs pubkey vault
    if (oracleInfo.isVaultScript) {
      // Script vault inputs
      throw new Error("Script vault not yet implemented");
    } else {
      // Pubkey vault - regular inputs (only selected UTxOs)
      for (const vaultUtxo of selectedUtxos) {
        txBuilder.txIn(vaultUtxo.input.txHash, vaultUtxo.input.outputIndex);
      }
    }

    // Spend all swap intent UTxOs
    for (const intentUtxo of params.swapIntentUtxos) {
      txBuilder
        .spendingPlutusScriptV3()
        .txIn(intentUtxo.input.txHash, intentUtxo.input.outputIndex)
        .txInInlineDatumPresent()
        .txInRedeemerValue(burnIntent(), "JSON")
        .spendingTxInReference(
          this.config.refScripts.swapIntent.txHash,
          this.config.refScripts.swapIntent.outputIndex,
          (this.swapIntentSpend.cbor.length / 2).toString(),
          this.swapIntentSpend.hash,
        );
    }

    // Burn all intent tokens
    const burnAmount = (-params.swapIntentUtxos.length).toString();
    txBuilder
      .mintPlutusScriptV3()
      .mint(burnAmount, this.swapIntentPolicyId, "")
      .mintTxInReference(
        this.config.refScripts.swapIntent.txHash,
        this.config.refScripts.swapIntent.outputIndex,
        (this.swapIntentMint.cbor.length / 2).toString(),
        this.swapIntentMint.hash,
      )
      .mintRedeemerValue(burnIntent(), "JSON");

    // Add vault return output
    if (vaultReturnValue.length > 0) {
      txBuilder.txOut(vaultAddress, vaultReturnValue);
    }

    // Add user outputs and track indices
    let outputIndex = 1; // vault change is at index 0
    const userOutputIndices: number[] = [];

    for (const intentInfo of intentInfos) {
      txBuilder.txOut(intentInfo.accountAddress, intentInfo.toAmount);
      userOutputIndices.push(outputIndex);
      outputIndex++;
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
      .withdrawalRedeemerValue(processIntent(userOutputIndices), "JSON");

    const txHex = await txBuilder.complete();

    return {
      txHex,
      spentUtxos: extractSpentUtxos(txHex),
    };
  };
}
