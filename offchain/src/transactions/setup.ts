import { byteString, UTxO, outputReference } from "@meshsdk/core";
import { KhorTxBuilder, TxParams } from "../lib/common";
import { KhorConstants } from "../lib/constant";
import {
  OracleNftMintBlueprint,
  SwapOracleSpendBlueprint,
  SwapIntentSpendBlueprint,
  SwapIntentWithdrawBlueprint,
} from "../lib/bar";
import { oracleDatum, OracleInfo, rMint } from "../lib/types";

export interface MintOracleNftParams extends TxParams {
  paramUtxo: UTxO;
  oracleInfo: OracleInfo;
}

export interface TxOutRefScriptsParams extends TxParams {
  refScriptAddress: string;
}

export interface RegisterCertsParams extends TxParams {}

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
}
