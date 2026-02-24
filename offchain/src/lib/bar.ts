import blueprint from "./plutus.json";

import {
  PolicyId,
  ConStr0,
  Credential,
  ByteString,
  PubKeyHash,
  SpendingBlueprint,
  OutputReference,
  ConStr1,
  MintingBlueprint,
  PubKeyAddress,
  ScriptAddress,
  Pairs,
  AssetName,
  Integer,
  ConStr2,
  List,
  WithdrawalBlueprint,
} from "@meshsdk/core";

const version = "V3";
// Every spending validator would compile into an address with an staking key hash
// Recommend replace with your own stake key / script hash
const stakeKeyHash = "";
const isStakeScriptCredential = false;

export class SwapOracleSpendBlueprint extends SpendingBlueprint {
  compiledCode: string;

  constructor(networkId: 0 | 1, params: [PolicyId]) {
    const compiledCode = blueprint.validators[0]!.compiledCode;
    super(version, networkId, stakeKeyHash, isStakeScriptCredential);
    this.compiledCode = compiledCode;
    this.paramScript(compiledCode, params, "JSON");
  }

  params = (data: [PolicyId]): [PolicyId] => data;
  datum = (data: VaultOracleDatum): VaultOracleDatum => data;
  redeemer = (data: Data): Data => data;
}

export class OracleNftMintBlueprint extends MintingBlueprint {
  compiledCode: string;

  constructor(params: [OutputReference]) {
    const compiledCode = blueprint.validators[2]!.compiledCode;
    super(version);
    this.compiledCode = compiledCode;
    this.paramScript(compiledCode, params, "JSON");
  }

  params = (data: [OutputReference]): [OutputReference] => data;
}

export class SwapIntentSpendBlueprint extends SpendingBlueprint {
  compiledCode: string;

  constructor(networkId: 0 | 1, params: [PolicyId]) {
    const compiledCode = blueprint.validators[4]!.compiledCode;
    super(version, networkId, stakeKeyHash, isStakeScriptCredential);
    this.compiledCode = compiledCode;
    this.paramScript(compiledCode, params, "JSON");
  }

  params = (data: [PolicyId]): [PolicyId] => data;
  datum = (data: SwapIntentDatum): SwapIntentDatum => data;
  redeemer = (data: Data): Data => data;
}

export class SwapIntentMintBlueprint extends MintingBlueprint {
  compiledCode: string;

  constructor(params: [PolicyId]) {
    const compiledCode = blueprint.validators[5]!.compiledCode;
    super(version);
    this.compiledCode = compiledCode;
    this.paramScript(compiledCode, params, "JSON");
  }

  params = (data: [PolicyId]): [PolicyId] => data;
}

export class SwapIntentWithdrawBlueprint extends WithdrawalBlueprint {
  compiledCode: string;

  constructor(networkId: 0 | 1, params: [PolicyId]) {
    const compiledCode = blueprint.validators[6]!.compiledCode;
    super(version, networkId);
    this.compiledCode = compiledCode;
    this.paramScript(compiledCode, params, "JSON");
  }

  params = (data: [PolicyId]): [PolicyId] => data;
}

export class SwapIntentPublishBlueprint extends WithdrawalBlueprint {
  compiledCode: string;

  constructor(networkId: 0 | 1, params: [PolicyId]) {
    const compiledCode = blueprint.validators[7]!.compiledCode;
    super(version, networkId);
    this.compiledCode = compiledCode;
    this.paramScript(compiledCode, params, "JSON");
  }

  params = (data: [PolicyId]): [PolicyId] => data;
}

export type Data = any;

export type VaultOracleDatum = ConStr0<
  [Credential, ByteString, PubKeyHash, PubKeyHash]
>;

export type MintPolarity = RMint | RBurn;

export type RMint = ConStr0<[]>;

export type RBurn = ConStr1<[]>;

export type SwapIntentDatum = ConStr0<
  [
    PubKeyAddress | ScriptAddress,
    Pairs<PolicyId, Pairs<AssetName, Integer>>,
    Pairs<PolicyId, Pairs<AssetName, Integer>>,
    Integer,
  ]
>;

export type MValue = Pairs<PolicyId, Pairs<AssetName, Integer>>;

export type IntentRedeemer = MintIntent | BurnIntent | CancelIntent;

export type MintIntent = ConStr0<[]>;

export type BurnIntent = ConStr1<[]>;

export type CancelIntent = ConStr2<[]>;

export type SwapIntentWithdrawRedeemer = ProcessIntent;

export type ProcessIntent = ConStr0<[List<Integer>]>;
