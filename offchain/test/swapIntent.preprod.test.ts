import {
  BlockfrostProvider,
  byteString,
  deserializeAddress,
  MeshWallet,
  pubKeyAddress,
  serializeAddressObj,
  UTxO,
} from "@meshsdk/core";
import { SwapIntentTx } from "../src/transactions/swapIntent";
import { createConfig, KhorConfig } from "../src/lib/constant";
import { SwapOracleSpendBlueprint } from "../src/lib/bar";
import { OfflineEvaluator } from "@meshsdk/core-csl";

// Skip tests if env vars not set
const BLOCKFROST_API_KEY = process.env.BLOCKFROST_API_KEY;
const ORACLE_NFT_POLICY_ID = process.env.ORACLE_NFT_POLICY_ID;
const REF_SCRIPT_TX_HASH = process.env.REF_SCRIPT_TX_HASH;
const REF_SCRIPT_OUTPUT_INDEX = parseInt(
  process.env.REF_SCRIPT_OUTPUT_INDEX || "0",
);

const describeIfConfigured =
  BLOCKFROST_API_KEY && ORACLE_NFT_POLICY_ID && REF_SCRIPT_TX_HASH
    ? describe
    : describe.skip;

describeIfConfigured("SwapIntentTx (preprod)", () => {
  let blockfrost: BlockfrostProvider;
  let ddWallet: MeshWallet;
  let operatorWallet: MeshWallet;
  let userWallet: MeshWallet;
  let ddAddress: string;
  let operatorAddress: string;
  let userAddress: string;
  let testConfig: KhorConfig;
  let swapIntentTx: SwapIntentTx;
  let oracleUtxo: UTxO;

  beforeAll(async () => {
    blockfrost = new BlockfrostProvider(BLOCKFROST_API_KEY!);

    // Load DD, Operator, and User wallets
    const ddMnemonic = process.env.TEST_DD_MNEMONIC;
    const operatorMnemonic = process.env.TEST_OPERATOR_MNEMONIC;
    const userMnemonic = process.env.TEST_USER_MNEMONIC;

    if (!ddMnemonic || !operatorMnemonic || !userMnemonic) {
      throw new Error(
        "TEST_DD_MNEMONIC, TEST_OPERATOR_MNEMONIC, and TEST_USER_MNEMONIC environment variables required",
      );
    }

    // DD Wallet
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

    // Operator Wallet (also vault owner)
    operatorWallet = new MeshWallet({
      networkId: 0,
      fetcher: blockfrost,
      submitter: blockfrost,
      key: {
        type: "mnemonic",
        words: operatorMnemonic.split(" "),
      },
    });
    operatorAddress = await operatorWallet.getChangeAddress();

    // User Wallet (for creating/canceling swap intents)
    userWallet = new MeshWallet({
      networkId: 0,
      fetcher: blockfrost,
      submitter: blockfrost,
      key: {
        type: "mnemonic",
        words: userMnemonic.split(" "),
      },
    });
    userAddress = await userWallet.getChangeAddress();

    console.log("DD wallet address:", ddAddress);
    console.log("Operator wallet address:", operatorAddress);
    console.log("User wallet address:", userAddress);

    testConfig = createConfig({
      network: "preprod",
      oracleNftPolicyId: ORACLE_NFT_POLICY_ID!,
      refScripts: {
        swapIntent: {
          txHash: REF_SCRIPT_TX_HASH!,
          outputIndex: REF_SCRIPT_OUTPUT_INDEX,
        },
      },
    });

    swapIntentTx = new SwapIntentTx(testConfig);

    // Find oracle UTxO by NFT
    const oracleSpend = new SwapOracleSpendBlueprint(0, [
      byteString(ORACLE_NFT_POLICY_ID!),
    ]);
    const oracleAddress = oracleSpend.address;

    const oracleUtxos = await blockfrost.fetchAddressUTxOs(
      oracleAddress,
      ORACLE_NFT_POLICY_ID!,
    );

    if (oracleUtxos.length === 0) {
      console.warn("No oracle UTxO found - some tests may fail");
    } else {
      oracleUtxo = oracleUtxos[0]!;
      console.log("Oracle UTxO:", oracleUtxo.input);
    }
  }, 60000);

  describe("createSwapIntent", () => {
    it("should build and sign create swap intent transaction", async () => {
      const utxos = await userWallet.getUtxos();
      const collateral = await userWallet.getCollateral();

      if (utxos.length === 0) {
        throw new Error("No UTxOs available in User wallet");
      }
      if (!collateral || collateral.length === 0) {
        throw new Error("No collateral set in User wallet");
      }
      const collateralUtxo = collateral[0]!;

      const params = {
        utxos,
        collateral: collateralUtxo,
        changeAddress: userAddress,
        oracleUtxo,
        accountAddress: userAddress,
        fromAmount: [{ unit: "lovelace", quantity: "5000000" }], // 5 ADA
        toAmount: [
          {
            unit: "c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c9135553444d",
            quantity: "200000",
          },
        ],
        createdAt: Math.floor(Date.now() / 1000),
        deposit: 2000000, // 2 ADA deposit for swap intent
      };

      console.log("Building createSwapIntent transaction...");
      const result = await swapIntentTx.createSwapIntent(params, blockfrost);

      console.log("txHex length:", result.txHex.length);
      expect(result.txHex).toBeDefined();
      expect(result.txHex.length).toBeGreaterThan(0);

      // Sign with User wallet
      const signedTx = await userWallet.signTx(result.txHex);
      console.log("Transaction signed successfully");

      // Uncomment to submit:
      const txHash = await userWallet.submitTx(signedTx);
      console.log("Submitted tx:", txHash);
    }, 120000);
  });

  describe("cancelSwapIntent", () => {
    it("should build cancel swap intent transaction", async () => {
      const utxos = await ddWallet.getUtxos();
      const collateral = await ddWallet.getCollateral();

      // Find an existing swap intent UTxO
      const swapIntentAddress = swapIntentTx.getSwapIntentAddress();

      const intentUtxos = await blockfrost.fetchAddressUTxOs(swapIntentAddress);

      if (intentUtxos.length === 0 || !collateral || collateral.length === 0) {
        console.log("No swap intent UTxOs or collateral found - skipping");
        return;
      }

      const swapIntentUtxo = intentUtxos[0]!;
      const collateralUtxo = collateral[0]!;
      console.log("Found swap intent UTxO:", swapIntentUtxo.input);

      const params = {
        utxos,
        collateral: collateralUtxo,
        changeAddress: ddAddress,
        oracleUtxo,
        swapIntentUtxo,
      };

      console.log("Building cancelSwapIntent transaction...");
      const result = await swapIntentTx.cancelSwapIntent(params, blockfrost);

      console.log("txHex length:", result.txHex.length);
      expect(result.txHex).toBeDefined();
      expect(result.txHex.length).toBeGreaterThan(0);

      // Sign with ddWallet wallet
      const signedTx = await ddWallet.signTx(result.txHex);

      // Uncomment to submit:
      const txHash = await ddWallet.submitTx(signedTx);
      console.log("Submitted tx:", txHash);
    }, 120000);
  });

  describe("processSwapIntents", () => {
    it("should build and sign process swap intents transaction with DD and Operator", async () => {
      // Find swap intent UTxOs to process
      const swapIntentAddress = swapIntentTx.getSwapIntentAddress();

      const intentUtxos = await blockfrost.fetchAddressUTxOs(swapIntentAddress);

      if (intentUtxos.length === 0) {
        console.log("No swap intent UTxOs found to process - skipping");
        return;
      }

      console.log(`Found ${intentUtxos.length} swap intent UTxO(s) to process`);

      // Get operator's UTxOs (operator is vault owner)
      const operatorUtxos = await operatorWallet.getUtxos();
      const operatorCollateral = await operatorWallet.getCollateral();

      if (operatorUtxos.length === 0) {
        throw new Error("No UTxOs available in operator wallet (vault)");
      }
      if (!operatorCollateral || operatorCollateral.length === 0) {
        throw new Error("No collateral set in operator wallet");
      }

      const collateralUtxo = operatorCollateral[0]!;

      // Fetch vault UTxOs
      const vaultUtxos = await blockfrost.fetchAddressUTxOs(operatorAddress);

      const params = {
        utxos: operatorUtxos,
        collateral: collateralUtxo,
        changeAddress: operatorAddress,
        oracleUtxo,
        swapIntentUtxos: intentUtxos,
        vaultInputUtxos: vaultUtxos,
      };

      console.log("Building processSwapIntents transaction...");
      const result = await swapIntentTx.processSwapIntents(params, blockfrost);

      console.log("txHex length:", result.txHex.length);
      expect(result.txHex).toBeDefined();
      expect(result.txHex.length).toBeGreaterThan(0);

      // Sign with both wallets
      // 1. DD wallet signs (required signer: ddKey)
      console.log("Signing with DD wallet...");
      let signedTx = await ddWallet.signTx(result.txHex, true);

      // 2. Operator wallet signs (required signer: operatorKey + vault inputs)
      console.log("Signing with Operator wallet...");
      signedTx = await operatorWallet.signTx(signedTx, true);

      console.log(
        "Transaction signed by DD and Operator successfully",
        signedTx,
      );

      // Uncomment to submit:
      const txHash = await operatorWallet.submitTx(signedTx);
      console.log("Submitted tx:", txHash);
    }, 120000);
  });
});
