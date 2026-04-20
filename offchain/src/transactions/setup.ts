import { byteString, conStr0, UTxO, outputReference } from "@meshsdk/core";
import {
  KhorTxBuilder,
  TxParams,
  TxComplete,
  extractSpentUtxos,
  extractNewUtxos,
} from "../lib/common";
import { KhorConstants } from "../lib/constant";
import {
  OracleNftMintBlueprint,
  SwapOracleSpendBlueprint,
  SwapIntentSpendBlueprint,
  SwapIntentWithdrawBlueprint,
} from "../lib/bar";
import {
  oracleDatum,
  OracleInfo,
  parseVaultOracleDatum,
  rMint,
} from "../lib/types";

export interface MintOracleNftParams extends TxParams {
  paramUtxo: UTxO;
  oracleInfo: OracleInfo;
}

export interface TxOutRefScriptsParams extends TxParams {
  refScriptAddress: string;
}

export interface RegisterCertsParams extends TxParams {}

export interface UpdateOracleConfigParams extends TxParams {
  oracleUtxo: UTxO;
  newVaultScriptHash: string;
  newIsVaultScript: boolean;
  newSwapIntentScriptHash: string;
}

export class SetupTx extends KhorTxBuilder {
  constructor(config: KhorConstants) {
    super(config);
  }

  /**
   * Mint oracle NFT and lock it at oracle address with datum
   */
  mintOracleNft = async (
    params: MintOracleNftParams,
    fetcher?: any,
  ): Promise<{ txHex: string; oracleNftPolicyId: string }> => {
    const txBuilder = this.newValidationTx(params, fetcher);

    const oracleNftMint = new OracleNftMintBlueprint([
      outputReference(
        params.paramUtxo.input.txHash,
        params.paramUtxo.input.outputIndex,
      ),
    ]);
    const oracleNftPolicyId = oracleNftMint.hash;

    const oracleSpend = new SwapOracleSpendBlueprint(this.config.networkId, [
      byteString(oracleNftPolicyId),
    ]);
    const oracleAddress = oracleSpend.address;

    const datum = oracleDatum(params.oracleInfo);

    txBuilder
      .txIn(
        params.paramUtxo.input.txHash,
        params.paramUtxo.input.outputIndex,
        params.paramUtxo.output.amount,
        params.paramUtxo.output.address,
        0,
      )
      // Mint oracle NFT
      .mintPlutusScriptV3()
      .mint("1", oracleNftPolicyId, "")
      .mintingScript(oracleNftMint.cbor)
      .mintRedeemerValue(rMint(), "JSON")
      // Send to oracle address with datum
      .txOut(oracleAddress, [{ unit: oracleNftPolicyId, quantity: "1" }])
      .txOutInlineDatumValue(datum, "JSON");

    const txHex = await txBuilder.complete();

    return { txHex, oracleNftPolicyId };
  };

  /**
   * Create reference script outputs for all swap intent validators
   */
  txOutRefScripts = async (
    params: TxOutRefScriptsParams,
    fetcher?: any,
  ): Promise<string> => {
    const txBuilder = this.newValidationTx(params, fetcher);

    const oracleNftPolicyId = this.config.oracleNftPolicyId;

    // Create all blueprints
    const swapIntentSpend = new SwapIntentSpendBlueprint(
      this.config.networkId,
      [byteString(oracleNftPolicyId)],
    );

    // Output all reference scripts to the specified address
    txBuilder
      .txOut(params.refScriptAddress, [])
      .txOutReferenceScript(swapIntentSpend.cbor);

    return txBuilder.complete();
  };

  /**
   * Register stake certificates for withdrawal validators
   */
  registerCerts = async (
    params: RegisterCertsParams,
    fetcher?: any,
  ): Promise<string> => {
    const txBuilder = this.newValidationTx(params, fetcher);

    const oracleNftPolicyId = this.config.oracleNftPolicyId;

    const swapIntentWithdraw = new SwapIntentWithdrawBlueprint(
      this.config.networkId,
      [byteString(oracleNftPolicyId)],
    );

    txBuilder.registerStakeCertificate(swapIntentWithdraw.address);

    return txBuilder.complete();
  };

  /**
   * Update oracle config - keeps operator_key and dd_key unchanged,
   * updates only the vault credential and swap intent script hash.
   * Output goes to the same oracle address with the same value.
   * Requires both operator and dd signatures.
   */
  updateOracleConfig = async (
    params: UpdateOracleConfigParams,
    fetcher?: any,
  ): Promise<TxComplete> => {
    const currentInfo = parseVaultOracleDatum(params.oracleUtxo);
    if (!currentInfo) {
      throw new Error("Invalid oracle UTxO");
    }

    const oracleNftPolicyId = this.config.oracleNftPolicyId;
    const oracleSpend = new SwapOracleSpendBlueprint(this.config.networkId, [
      byteString(oracleNftPolicyId),
    ]);

    const newDatum = oracleDatum({
      vaultScriptHash: params.newVaultScriptHash,
      isVaultScript: params.newIsVaultScript,
      swapIntentScriptHash: params.newSwapIntentScriptHash,
      operatorKey: currentInfo.operatorKey,
      ddKey: currentInfo.ddKey,
    });

    const txBuilder = this.newValidationTx(params, fetcher);

    txBuilder
      .spendingPlutusScriptV3()
      .txIn(
        params.oracleUtxo.input.txHash,
        params.oracleUtxo.input.outputIndex,
        params.oracleUtxo.output.amount,
        params.oracleUtxo.output.address,
        0,
      )
      .txInInlineDatumPresent()
      .txInRedeemerValue(conStr0([]), "JSON")
      .txInScript(oracleSpend.cbor)
      .inputForEvaluation(params.oracleUtxo)
      .txOut(params.oracleUtxo.output.address, params.oracleUtxo.output.amount)
      .txOutInlineDatumValue(newDatum, "JSON")
      .requiredSignerHash(currentInfo.operatorKey)
      .requiredSignerHash(currentInfo.ddKey);

    const txHex = await txBuilder.complete();

    return {
      txHex,
      spentUtxos: extractSpentUtxos(txHex),
      newUtxos: extractNewUtxos(txHex),
    };
  };
}
