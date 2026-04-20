import {
  BlockfrostProvider,
  MeshWallet,
  UTxO,
  byteString,
  outputReference,
} from "@meshsdk/core";
import { SetupTx } from "../src/transactions/setup";
import { KhorConstants, Network } from "../src/lib/constant";
import { OracleInfo, parseVaultOracleDatum } from "../src/lib/types";
import {
  OracleNftMintBlueprint,
  SwapIntentSpendBlueprint,
  SwapOracleSpendBlueprint,
} from "../src/lib/bar";

// Skip tests if env vars not set
const BLOCKFROST_API_KEY = process.env.BLOCKFROST_API_KEY;
const NETWORK = (process.env.NETWORK || "preprod") as Network;
const NETWORK_ID = NETWORK === "mainnet" ? 1 : 0;
const OWNER_VKEY = process.env.OWNER_VKEY;
const OPERATOR_VKEY = process.env.OPERATOR_VKEY;

const describeIfConfigured = BLOCKFROST_API_KEY ? describe : describe.skip;

describeIfConfigured(`SetupTx (${NETWORK})`, () => {
  let blockfrost: BlockfrostProvider;
  let wallet: MeshWallet;
  let walletAddress: string;

  beforeAll(async () => {
    blockfrost = new BlockfrostProvider(BLOCKFROST_API_KEY!);

    const walletMnemonic = process.env.TEST_OPERATOR_MNEMONIC;

    if (!walletMnemonic) {
      throw new Error("TEST_WALLET_MNEMONIC environment variable required");
    }

    wallet = new MeshWallet({
      networkId: NETWORK_ID,
      fetcher: blockfrost,
      submitter: blockfrost,
      key: {
        type: "mnemonic",
        words: walletMnemonic.split(" "),
      },
    });

    walletAddress = await wallet.getChangeAddress();
    console.log(walletAddress);

    console.log(`Network: ${NETWORK} (networkId: ${NETWORK_ID})`);
    console.log("Test wallet address:", walletAddress);
  }, 60000);

  describe("mintOracleNft", () => {
    it("should mint oracle NFT and create oracle UTxO", async () => {
      if (!OWNER_VKEY || !OPERATOR_VKEY) {
        console.log("OWNER_VKEY or OPERATOR_VKEY not set - skipping");
        return;
      }

      const utxos = await wallet.getUtxos("payment");
      const collateral = await wallet.getCollateral("enterprise");

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
      const tempConfig = new KhorConstants(NETWORK);
      tempConfig.oracleNftPolicyId = oracleNftPolicyId;

      const setupTx = new SetupTx(tempConfig);

      // Get the swap intent script hash (needed for oracle datum)
      const swapIntentSpend = new SwapIntentSpendBlueprint(NETWORK_ID, [
        byteString(oracleNftPolicyId),
      ]);

      const oracleInfo: OracleInfo = {
        vaultScriptHash: OPERATOR_VKEY, // Use operator vkey as vault (pubkey vault)
        isVaultScript: false,
        swapIntentScriptHash: swapIntentSpend.hash,
        operatorKey: OPERATOR_VKEY,
        ddKey: OWNER_VKEY,
      };

      const params = {
        utxos,
        collateral: collateralUtxo,
        changeAddress: walletAddress,
        paramUtxo,
        oracleInfo,
      };

      console.log("Building mintOracleNft transaction...");
      console.log("Using paramUtxo:", paramUtxo!.input);
      console.log("OWNER_VKEY:", OWNER_VKEY);
      console.log("OPERATOR_VKEY:", OPERATOR_VKEY);

      const result = await setupTx.mintOracleNft(params, blockfrost);

      console.log("Oracle NFT Policy ID:", result.oracleNftPolicyId);
      console.log("txHex length:", result.txHex.length);

      expect(result.txHex).toBeDefined();
      expect(result.oracleNftPolicyId).toBeDefined();
      expect(result.oracleNftPolicyId.length).toBe(56);

      // Sign the transaction
      const signedTx = await wallet.signTx(result.txHex);
      console.log("Transaction signed successfully");

      // Uncomment to submit:
      const txHash = await wallet.submitTx(signedTx);
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

      const utxos = await wallet.getUtxos("payment");
      const collateral = await wallet.getCollateral("enterprise");

      if (!collateral || collateral.length === 0) {
        throw new Error("No collateral set in test wallet");
      }
      const collateralUtxo = collateral[0]!;

      const config = new KhorConstants(NETWORK);
      config.oracleNftPolicyId = oracleNftPolicyId;

      const setupTx = new SetupTx(config);

      const refScriptAddress = process.env.REF_SCRIPT_ADDRESS || walletAddress;

      const params = {
        utxos,
        collateral: collateralUtxo,
        changeAddress: walletAddress,
        refScriptAddress, // Send ref scripts to specified address or own address
      };

      console.log("Building txOutRefScripts transaction...");

      const txHex = await setupTx.txOutRefScripts(params, blockfrost);

      console.log("txHex length:", txHex.length);
      expect(txHex).toBeDefined();
      expect(txHex.length).toBeGreaterThan(0);

      // Sign the transaction
      const signedTx = await wallet.signTx(txHex);
      console.log("Transaction signed successfully");

      // Uncomment to submit:
      const txHash = await wallet.submitTx(signedTx);
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

      const utxos = await wallet.getUtxos("payment");
      const collateral = await wallet.getCollateral("enterprise");

      if (!collateral || collateral.length === 0) {
        throw new Error("No collateral set in test wallet");
      }
      const collateralUtxo = collateral[0]!;

      const config = new KhorConstants(NETWORK);
      config.oracleNftPolicyId = oracleNftPolicyId;

      const setupTx = new SetupTx(config);

      const params = {
        utxos,
        collateral: collateralUtxo,
        changeAddress: walletAddress,
      };

      console.log("Building registerCerts transaction...");

      const txHex = await setupTx.registerCerts(params, blockfrost);

      console.log("txHex length:", txHex.length);
      expect(txHex).toBeDefined();
      expect(txHex.length).toBeGreaterThan(0);

      // Sign the transaction
      const signedTx = await wallet.signTx(txHex);
      console.log("Transaction signed successfully");

      // Uncomment to submit:
      const txHash = await wallet.submitTx(signedTx);
      console.log("Submitted tx:", txHash);
    }, 120000);
  });

  describe("updateOracleConfig", () => {
    it("should update oracle vault cred and swap intent script hash", async () => {
      const oracleNftPolicyId = process.env.ORACLE_NFT_POLICY_ID;
      if (!oracleNftPolicyId) {
        console.log("ORACLE_NFT_POLICY_ID not set - skipping");
        return;
      }

      const utxos = await wallet.getUtxos("payment");
      const collateral = await wallet.getCollateral("enterprise");

      if (!collateral || collateral.length === 0) {
        throw new Error("No collateral set in test wallet");
      }
      const collateralUtxo = collateral[0]!;

      const config = new KhorConstants(NETWORK);
      config.oracleNftPolicyId = oracleNftPolicyId;

      const setupTx = new SetupTx(config);

      // Fetch oracle UTxO (holds the oracle NFT)
      const oracleSpend = new SwapOracleSpendBlueprint(NETWORK_ID, [
        byteString(oracleNftPolicyId),
      ]);
      const oracleAddress = oracleSpend.address;

      const oracleUtxos = await blockfrost.fetchAddressUTxOs(
        oracleAddress,
        oracleNftPolicyId,
      );

      if (oracleUtxos.length === 0) {
        throw new Error("No oracle UTxO found");
      }
      const oracleUtxo: UTxO = oracleUtxos[0]!;
      console.log("Oracle UTxO:", oracleUtxo.input);

      const currentInfo = parseVaultOracleDatum(oracleUtxo);
      if (!currentInfo) {
        throw new Error("Failed to parse current oracle datum");
      }
      console.log("Current oracle info:", currentInfo);

      // New swap intent script hash derived from current policy id (same in this test)
      const swapIntentSpend = new SwapIntentSpendBlueprint(NETWORK_ID, [
        byteString(oracleNftPolicyId),
      ]);

      // Allow overrides via env; defaults keep operator vault cred, rotate swap intent
      const newVaultScriptHash =
        process.env.NEW_VAULT_SCRIPT_HASH ?? currentInfo.vaultScriptHash;
      const newIsVaultScript =
        process.env.NEW_IS_VAULT_SCRIPT !== undefined
          ? process.env.NEW_IS_VAULT_SCRIPT === "true"
          : currentInfo.isVaultScript;
      const newSwapIntentScriptHash =
        process.env.NEW_SWAP_INTENT_SCRIPT_HASH ?? swapIntentSpend.hash;

      const params = {
        utxos,
        collateral: collateralUtxo,
        changeAddress: walletAddress,
        oracleUtxo,
        newVaultScriptHash,
        newIsVaultScript,
        newSwapIntentScriptHash,
      };

      console.log("Building updateOracleConfig transaction...");
      console.log("New vaultScriptHash:", newVaultScriptHash);
      console.log("New isVaultScript:", newIsVaultScript);
      console.log("New swapIntentScriptHash:", newSwapIntentScriptHash);

      const result = await setupTx.updateOracleConfig(params, blockfrost);

      console.log("txHex length:", result.txHex.length);
      expect(result.txHex).toBeDefined();
      expect(result.txHex.length).toBeGreaterThan(0);

      // Sign with test wallet (must hold both operator and dd keys, or sign
      // externally — otherwise the submitted tx will fail signature checks).
      const signedTx = await wallet.signTx(result.txHex, true);
      console.log("Transaction signed successfully");

      // Uncomment to submit:

      const ddWalletMnemonic = process.env.TEST_DD_MNEMONIC!;

      const ddWallet = new MeshWallet({
        networkId: NETWORK_ID,
        fetcher: blockfrost,
        submitter: blockfrost,
        key: {
          type: "mnemonic",
          words: ddWalletMnemonic.split(" "),
        },
      });
      const fullySignedTx = await ddWallet.signTx(signedTx, true);
      const txHash = await ddWallet.submitTx(fullySignedTx);
      console.log("Submitted tx:", txHash);
    }, 120000);
  });
});
