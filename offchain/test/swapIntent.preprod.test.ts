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
import { KhorConstants, preprodOracleNftPolicyId } from "../src/lib/constant";
import { SwapOracleSpendBlueprint } from "../src/lib/bar";
import { OfflineEvaluator } from "@meshsdk/core-csl";
import { parseSwapIntentDatum } from "../src/lib/types";

// Skip tests if env vars not set
const BLOCKFROST_API_KEY = process.env.BLOCKFROST_API_KEY;

const describeIfConfigured = BLOCKFROST_API_KEY ? describe : describe.skip;

describeIfConfigured("SwapIntentTx (preprod)", () => {
  let blockfrost: BlockfrostProvider;
  let ddWallet: MeshWallet;
  let operatorWallet: MeshWallet;
  let userWallet: MeshWallet;
  let ddAddress: string;
  let operatorAddress: string;
  let userAddress: string;
  let khorConstants: KhorConstants;
  let swapIntentTx: SwapIntentTx;
  let oracleUtxo: UTxO; // Full UTxO needed for processSwapIntents

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

    khorConstants = new KhorConstants("preprod");
    swapIntentTx = new SwapIntentTx(khorConstants);

    // Fetch full oracle UTxO (needed for processSwapIntents which parses datum)
    const oracleSpend = new SwapOracleSpendBlueprint(0, [
      byteString(preprodOracleNftPolicyId),
    ]);
    const oracleAddress = oracleSpend.address;

    const oracleUtxos = await blockfrost.fetchAddressUTxOs(
      oracleAddress,
      preprodOracleNftPolicyId,
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
        accountAddress: userAddress,
        fromAmount: [
          {
            unit: "3363b99384d6ee4c4b009068af396c8fdf92dafd111e58a857af04294e49474854",
            quantity: "500000000",
          },
        ],
        toAmount: [
          {
            unit: "lovelace",
            quantity: "85000000",
          },
        ],
        // expiry defaults to 10 mins, deposit defaults to 2 ADA
      };

      console.log("Building createSwapIntent transaction...");
      const result = await swapIntentTx.createSwapIntent(params, blockfrost);

      console.log("txHex length:", result.txHex);
      expect(result.txHex).toBeDefined();
      expect(result.txHex.length).toBeGreaterThan(0);

      console.log("Transaction spent UTxOs:", result.spentUtxos);
      console.log("Transaction new UTxOs:", JSON.stringify(result.newUtxos));

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
        oracleUtxo: khorConstants.oracleUtxo, // TxInput from config
        swapIntentUtxo,
        operatorKeyHash:
          "7fbf89e18a0bbb1cf0f4d91cb70d4f99460c4375881c0a9ecb52a1c0",
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

      // Build swap intent fills (pair each intent with its output amount)
      // In practice, outputAmount would come from oracle/price calculation
      const swapIntentFills = intentUtxos.map((utxo) => ({
        utxo,
        outputAmount: [
          {
            unit: "c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c9135553444d",
            quantity: "200000",
          },
        ], // Example: fill with the expected toAmount
      }));

      const params = {
        utxos: operatorUtxos,
        collateral: collateralUtxo,
        changeAddress: operatorAddress,
        oracleUtxo,
        swapIntentFills,
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
      // const txHash = await operatorWallet.submitTx(signedTx);
      // console.log("Submitted tx:", txHash);
    }, 120000);
  });

  describe("fetchSwapIntentUtxos", () => {
    it("should fetch all swap intent UTxOs", async () => {
      const intentUtxos = await swapIntentTx.fetchSwapIntentUtxos(blockfrost);

      console.log(`Found ${intentUtxos.length} swap intent UTxO(s)`);
      expect(Array.isArray(intentUtxos)).toBe(true);

      // Verify each UTxO has valid swap intent datum
      for (const utxo of intentUtxos) {
        const info = parseSwapIntentDatum(utxo);
        expect(info).not.toBeNull();
        expect(info?.accountAddress).toBeDefined();
        expect(info?.fromAmount).toBeDefined();
        expect(info?.toAmount).toBeDefined();
        expect(info?.createdAt).toBeGreaterThan(0);
      }
    }, 60000);
  });

  describe("fetchSwapIntentUtxosByAddress", () => {
    it("should fetch swap intent UTxOs filtered by user address", async () => {
      const userIntents = await swapIntentTx.fetchSwapIntentUtxosByAddress(
        blockfrost,
        userAddress,
      );

      console.log(
        `Found ${userIntents.length} swap intent UTxO(s) for user ${userAddress}`,
      );
      expect(Array.isArray(userIntents)).toBe(true);

      // Verify all returned UTxOs belong to the user
      for (const utxo of userIntents) {
        const info = parseSwapIntentDatum(utxo);
        expect(info).not.toBeNull();
        expect(info?.accountAddress).toBe(userAddress);
      }
    }, 60000);

    it("should return empty array for address with no intents", async () => {
      const randomAddress =
        "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp";
      const intents = await swapIntentTx.fetchSwapIntentUtxosByAddress(
        blockfrost,
        randomAddress,
      );

      expect(intents).toEqual([]);
    }, 60000);
  });

  describe("isCancellable", () => {
    it("should return true for intents older than 10 minutes", async () => {
      const intentUtxos = await swapIntentTx.fetchSwapIntentUtxos(blockfrost);

      if (intentUtxos.length === 0) {
        console.log("No swap intent UTxOs found - skipping");
        return;
      }

      for (const utxo of intentUtxos) {
        const isCancellable = swapIntentTx.isCancellable(utxo);
        const info = parseSwapIntentDatum(utxo);
        const cancellableAt = swapIntentTx.getCancellableAt(utxo);

        console.log(`Intent created at slot ${info?.createdAt}`);
        console.log(`Cancellable at: ${new Date(cancellableAt!)}`);
        console.log(`Is cancellable: ${isCancellable}`);

        expect(typeof isCancellable).toBe("boolean");
      }
    }, 60000);

    it("should return false for invalid UTxO", () => {
      const invalidUtxo: UTxO = {
        input: { txHash: "abc", outputIndex: 0 },
        output: { address: "addr_test1...", amount: [] },
      };

      const isCancellable = swapIntentTx.isCancellable(invalidUtxo);
      expect(isCancellable).toBe(false);
    });
  });

  describe("getCancellableAt", () => {
    it("should return valid timestamp for swap intent UTxOs", async () => {
      const intentUtxos = await swapIntentTx.fetchSwapIntentUtxos(blockfrost);

      if (intentUtxos.length === 0) {
        console.log("No swap intent UTxOs found - skipping");
        return;
      }

      for (const utxo of intentUtxos) {
        const cancellableAt = swapIntentTx.getCancellableAt(utxo);

        expect(cancellableAt).not.toBeNull();
        expect(typeof cancellableAt).toBe("number");
        expect(cancellableAt).toBeGreaterThan(0);

        // Verify timestamp is reasonable (after year 2020)
        const year2020 = new Date("2020-01-01").getTime();
        expect(cancellableAt).toBeGreaterThan(year2020);

        console.log(`Cancellable at: ${new Date(cancellableAt!)}`);
      }
    }, 60000);

    it("should return null for invalid UTxO", () => {
      const invalidUtxo: UTxO = {
        input: { txHash: "abc", outputIndex: 0 },
        output: { address: "addr_test1...", amount: [] },
      };

      const cancellableAt = swapIntentTx.getCancellableAt(invalidUtxo);
      expect(cancellableAt).toBeNull();
    });
  });
});
