import {
  BlockfrostProvider,
  MeshWallet,
  byteString,
  deserializeAddress,
  outputReference,
} from "@meshsdk/core";
import { SetupTx } from "../src/transactions/setup";
import { createConfig } from "../src/lib/constant";
import { OracleInfo } from "../src/lib/types";
import {
  OracleNftMintBlueprint,
  SwapIntentSpendBlueprint,
} from "../src/lib/bar";

// Skip tests if env vars not set
const BLOCKFROST_API_KEY = process.env.BLOCKFROST_API_KEY;

const describeIfConfigured = BLOCKFROST_API_KEY ? describe : describe.skip;

describeIfConfigured("SetupTx (preprod)", () => {
  let blockfrost: BlockfrostProvider;
  let ddWallet: MeshWallet;
  let ddAddress: string;
  let ddVKey: string;

  beforeAll(async () => {
    blockfrost = new BlockfrostProvider(BLOCKFROST_API_KEY!);

    const ddMnemonic = process.env.TEST_DD_MNEMONIC;
    const operatorMnemonic = process.env.TEST_OPERATOR_MNEMONIC;
    if (!ddMnemonic || !operatorMnemonic) {
      throw new Error(
        "TEST_DD_MNEMONIC or TEST_OPERATOR_MNEMONIC environment variable required",
      );
    }

    ddWallet = new MeshWallet({
      networkId: 0,
      fetcher: blockfrost,
      submitter: blockfrost,
      key: {
        type: "mnemonic",
        words: ddMnemonic.split(" "),
      },
    });

    ddAddress = await ddWallet.getChangeAddress();
    ddVKey = deserializeAddress(ddAddress).pubKeyHash;
    console.log("Test wallet address:", ddAddress);
  }, 60000);

  describe("mintOracleNft", () => {
    it("should mint oracle NFT and create oracle UTxO", async () => {
      const utxos = await ddWallet.getUtxos();
      const collateral = await ddWallet.getCollateral("enterprise");

      if (utxos.length === 0) {
        throw new Error("No UTxOs available in test wallet");
      }
      if (!collateral || collateral.length === 0) {
        throw new Error("No collateral set in test wallet");
      }

      // Use first UTxO as parameter UTxO (determines policy ID)
      const paramUtxo = utxos[0]!;
      const collateralUtxo = collateral[0]!;

      const oracleNftPolicyId = new OracleNftMintBlueprint([
        outputReference(paramUtxo.input.txHash, paramUtxo.input.outputIndex),
      ]).hash;

      // Create a temporary config (oracle NFT policy ID will be determined by paramUtxo)
      const tempConfig = createConfig({
        network: "preprod",
        oracleNftPolicyId,
        refScripts: {
          swapIntent: { txHash: "", outputIndex: 0 },
        },
      });

      const setupTx = new SetupTx(tempConfig);

      // Get the swap intent script hash (needed for oracle datum)
      // Note: This uses a placeholder oracle NFT policy ID, which means
      // the actual swap intent script hash will need the real policy ID
      const swapIntentSpend = new SwapIntentSpendBlueprint(0, [
        byteString(oracleNftPolicyId),
      ]);

      const operatorMnemonic = process.env.TEST_OPERATOR_MNEMONIC!;
      const operatorWallet = new MeshWallet({
        networkId: 0,
        fetcher: blockfrost,
        submitter: blockfrost,
        key: {
          type: "mnemonic",
          words: operatorMnemonic.split(" "),
        },
      });
      const operatorAddress = await operatorWallet.getChangeAddress();
      const operatorVKey = deserializeAddress(operatorAddress).pubKeyHash;

      const oracleInfo: OracleInfo = {
        vaultScriptHash: operatorVKey, // Use wallet address as vault (pubkey vault)
        isVaultScript: false,
        swapIntentScriptHash: swapIntentSpend.hash,
        operatorKey: operatorVKey,
        ddKey: ddVKey,
      };

      const params = {
        utxos,
        collateral: collateralUtxo,
        changeAddress: ddAddress,
        paramUtxo,
        oracleInfo,
      };

      console.log("Building mintOracleNft transaction...");
      console.log("Using paramUtxo:", paramUtxo!.input);

      const result = await setupTx.mintOracleNft(params, blockfrost);

      console.log("Oracle NFT Policy ID:", result.oracleNftPolicyId);
      console.log("txHex length:", result.txHex.length);

      expect(result.txHex).toBeDefined();
      expect(result.oracleNftPolicyId).toBeDefined();
      expect(result.oracleNftPolicyId.length).toBe(56);

      // Sign the transaction
      const signedTx = await ddWallet.signTx(result.txHex);
      console.log("Transaction signed successfully");

      // Uncomment to submit:
      const txHash = await ddWallet.submitTx(signedTx);
      console.log("Submitted tx:", txHash);
      console.log("Set ORACLE_NFT_POLICY_ID=" + result.oracleNftPolicyId);
    }, 120000);
  });

  describe("txOutRefScripts", () => {
    it("should create reference script outputs", async () => {
      const oracleNftPolicyId = process.env.ORACLE_NFT_POLICY_ID;
      if (!oracleNftPolicyId) {
        console.log("ORACLE_NFT_POLICY_ID not set - skipping");
        return;
      }

      const utxos = await ddWallet.getUtxos();
      const collateral = await ddWallet.getCollateral("enterprise");

      if (!collateral || collateral.length === 0) {
        throw new Error("No collateral set in test wallet");
      }
      const collateralUtxo = collateral[0]!;

      const config = createConfig({
        network: "preprod",
        oracleNftPolicyId,
        refScripts: {
          swapIntent: { txHash: "", outputIndex: 0 },
        },
      });

      const setupTx = new SetupTx(config);

      const params = {
        utxos,
        collateral: collateralUtxo,
        changeAddress: ddAddress,
        refScriptAddress:
          "addr_test1qrt4eqny7x5p3ef2p564amsqkpq8xymt3qrhj753njk9knarp2tyv20ff79pqmw3rkg656f67t3m76drluak83ggd69qqleqsc", // Send ref scripts to own address
      };

      console.log("Building txOutRefScripts transaction...");

      const txHex = await setupTx.txOutRefScripts(params, blockfrost);

      console.log("txHex length:", txHex.length);
      expect(txHex).toBeDefined();
      expect(txHex.length).toBeGreaterThan(0);

      // Sign the transaction
      const signedTx = await ddWallet.signTx(txHex);
      console.log("Transaction signed successfully");

      // Uncomment to submit:
      const txHash = await ddWallet.submitTx(signedTx);
      console.log("Submitted tx:", txHash);
      console.log("Set REF_SCRIPT_TX_HASH=" + txHash);
    }, 120000);
  });

  describe("registerCerts", () => {
    it("should register stake certificates for withdrawal validators", async () => {
      const oracleNftPolicyId = process.env.ORACLE_NFT_POLICY_ID;
      if (!oracleNftPolicyId) {
        console.log("ORACLE_NFT_POLICY_ID not set - skipping");
        return;
      }

      const utxos = await ddWallet.getUtxos();
      const collateral = await ddWallet.getCollateral("enterprise");

      if (!collateral || collateral.length === 0) {
        throw new Error("No collateral set in test wallet");
      }
      const collateralUtxo = collateral[0]!;

      const config = createConfig({
        network: "preprod",
        oracleNftPolicyId,
        refScripts: {
          swapIntent: { txHash: "", outputIndex: 0 },
        },
      });

      const setupTx = new SetupTx(config);

      const params = {
        utxos,
        collateral: collateralUtxo,
        changeAddress: ddAddress,
      };

      console.log("Building registerCerts transaction...");

      const txHex = await setupTx.registerCerts(params, blockfrost);

      console.log("txHex length:", txHex.length);
      expect(txHex).toBeDefined();
      expect(txHex.length).toBeGreaterThan(0);

      // Sign the transaction
      const signedTx = await ddWallet.signTx(txHex);
      console.log("Transaction signed successfully");

      // Uncomment to submit:
      const txHash = await ddWallet.submitTx(signedTx);
      console.log("Submitted tx:", txHash);
    }, 120000);
  });
});
