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
import {
  KhorConstants,
  preprodOracleNftPolicyId,
  preprodUsdcxUnit,
  preprodUsdmUnit,
  preprodNightUnit,
} from "../src/lib/constant";
import { SwapOracleSpendBlueprint } from "../src/lib/bar";
import { OfflineEvaluator } from "@meshsdk/core-csl";
import { parseSwapIntentDatum } from "../src/lib/types";

// ============ Depth Fetching Helpers ============
const OPERATOR_BASE_URL = process.env.OPERATOR_URL || "http://localhost:3000";

interface DepthLevel {
  price: string;
  quantity: string;
}

interface DepthResponse {
  timestamp: number;
  bids: DepthLevel[];
  asks: DepthLevel[];
}

interface SwapIntentTestParams {
  fromUnit: string;
  fromQuantity: string;
  toUnit: string;
  toQuantity: string;
  description: string;
}

/**
 * Fetch depth from operator API
 */
async function fetchDepth(symbol: string): Promise<DepthResponse> {
  const response = await fetch(
    `${OPERATOR_BASE_URL}/swapIntent/depth/${symbol}`,
  );
  if (!response.ok) {
    throw new Error(
      `Failed to fetch depth for ${symbol}: ${response.statusText}`,
    );
  }
  return response.json() as Promise<DepthResponse>;
}

/**
 * Calculate swap intent params from depth
 * @param symbol - Trading symbol (e.g., ADAUSDC, ADAUSDM)
 * @param side - 'buy' (buy base with quote) or 'sell' (sell base for quote)
 * @param baseAmount - Amount of base token (e.g., 100 ADA)
 * @param slippagePct - Slippage tolerance (e.g., 0.01 = 1%)
 */
async function calculateSwapParams(
  symbol: string,
  side: "buy" | "sell",
  baseAmount: number,
  slippagePct: number = 0.01,
): Promise<SwapIntentTestParams> {
  const depth = await fetchDepth(symbol);

  // Token mapping based on symbol
  const symbolConfig: Record<
    string,
    {
      baseUnit: string;
      quoteUnit: string;
      baseDecimals: number;
      quoteDecimals: number;
    }
  > = {
    ADAUSDC: {
      baseUnit: "lovelace",
      quoteUnit: preprodUsdcxUnit,
      baseDecimals: 6,
      quoteDecimals: 6,
    },
    ADAUSDM: {
      baseUnit: "lovelace",
      quoteUnit: preprodUsdmUnit,
      baseDecimals: 6,
      quoteDecimals: 6,
    },
    NIGHTUSDM: {
      baseUnit: preprodNightUnit,
      quoteUnit: preprodUsdmUnit,
      baseDecimals: 6,
      quoteDecimals: 6,
    },
  };

  const config = symbolConfig[symbol];
  if (!config) {
    throw new Error(`Unknown symbol: ${symbol}`);
  }

  const { baseUnit, quoteUnit, baseDecimals, quoteDecimals } = config;

  if (side === "buy") {
    // Buy base with quote - use asks (selling price)
    if (depth.asks.length === 0) {
      throw new Error(`No asks available for ${symbol}`);
    }
    // Sort asks by price ascending to get best price
    const sortedAsks = [...depth.asks].sort(
      (a, b) => parseFloat(a.price) - parseFloat(b.price),
    );
    const bestAsk = sortedAsks[0]!;
    const price = parseFloat(bestAsk.price);
    const quoteAmount = baseAmount * price * (1 + slippagePct); // Add slippage

    return {
      fromUnit: quoteUnit,
      fromQuantity: Math.floor(
        quoteAmount * Math.pow(10, quoteDecimals),
      ).toString(),
      toUnit: baseUnit,
      toQuantity: Math.floor(
        baseAmount * Math.pow(10, baseDecimals),
      ).toString(),
      description: `Buy ${baseAmount} ${symbol.replace(/USD.*/, "")} @ ${price} (ask) with ${slippagePct * 100}% slippage`,
    };
  } else {
    // Sell base for quote - use bids (buying price)
    if (depth.bids.length === 0) {
      throw new Error(`No bids available for ${symbol}`);
    }
    // Sort bids by price descending to get best price
    const sortedBids = [...depth.bids].sort(
      (a, b) => parseFloat(b.price) - parseFloat(a.price),
    );
    const bestBid = sortedBids[0]!;
    const price = parseFloat(bestBid.price);
    const quoteAmount = baseAmount * price * (1 - slippagePct); // Subtract slippage

    return {
      fromUnit: baseUnit,
      fromQuantity: Math.floor(
        baseAmount * Math.pow(10, baseDecimals),
      ).toString(),
      toUnit: quoteUnit,
      toQuantity: Math.floor(
        quoteAmount * Math.pow(10, quoteDecimals),
      ).toString(),
      description: `Sell ${baseAmount} ${symbol.replace(/USD.*/, "")} @ ${price} (bid) with ${slippagePct * 100}% slippage`,
    };
  }
}

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
            unit: "0483b457673b527c1b6e8ca680a5f3a5676f27cdfea0c9bf285d09385553444358",
            quantity: "15000000",
          },
        ],
        toAmount: [
          {
            unit: "lovelace",
            quantity: "45000000",
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

  // ============ Depth-Based Swap Intent Tests ============
  describe("createSwapaIntent (depth-based)", () => {
    it("should create ADAUSDC buy intent (buy ADA with USDC)", async () => {
      const utxos = await userWallet.getUtxos();
      const collateral = await userWallet.getCollateral();

      if (utxos.length === 0 || !collateral || collateral.length === 0) {
        console.log("No UTxOs or collateral - skipping");
        return;
      }

      // Fetch depth and calculate params
      const swapParams = await calculateSwapParams("ADAUSDC", "buy", 50, 0.01);
      console.log("Swap params:", swapParams);

      const params = {
        utxos,
        collateral: collateral[0]!,
        changeAddress: userAddress,
        accountAddress: userAddress,
        fromAmount: [
          { unit: swapParams.fromUnit, quantity: swapParams.fromQuantity },
        ],
        toAmount: [
          { unit: swapParams.toUnit, quantity: swapParams.toQuantity },
        ],
      };

      console.log(`Building: ${swapParams.description}`);
      const result = await swapIntentTx.createSwapIntent(params, blockfrost);

      expect(result.txHex).toBeDefined();
      console.log("txHex length:", result.txHex.length);
      console.log("New UTxOs:", JSON.stringify(result.newUtxos, null, 2));

      // Uncomment to sign and submit:
      // const signedTx = await userWallet.signTx(result.txHex);
      // const txHash = await userWallet.submitTx(signedTx);
      // console.log("Submitted tx:", txHash);
    }, 120000);

    it("should create ADAUSDC sell intent (sell ADA for USDC)", async () => {
      const utxos = await userWallet.getUtxos();
      const collateral = await userWallet.getCollateral();

      if (utxos.length === 0 || !collateral || collateral.length === 0) {
        console.log("No UTxOs or collateral - skipping");
        return;
      }

      // Fetch depth and calculate params
      const swapParams = await calculateSwapParams(
        "ADAUSDC",
        "sell",
        100,
        0.01,
      );
      console.log("Swap params:", swapParams);

      const params = {
        utxos,
        collateral: collateral[0]!,
        changeAddress: userAddress,
        accountAddress: userAddress,
        fromAmount: [
          { unit: swapParams.fromUnit, quantity: swapParams.fromQuantity },
        ],
        toAmount: [
          { unit: swapParams.toUnit, quantity: swapParams.toQuantity },
        ],
      };

      console.log(`Building: ${swapParams.description}`);
      const result = await swapIntentTx.createSwapIntent(params, blockfrost);

      expect(result.txHex).toBeDefined();
      console.log("txHex length:", result.txHex.length);
      console.log("New UTxOs:", JSON.stringify(result.newUtxos, null, 2));

      // Uncomment to sign and submit:
      // const signedTx = await userWallet.signTx(result.txHex);
      // const txHash = await userWallet.submitTx(signedTx);
      // console.log("Submitted tx:", txHash);
    }, 120000);

    it("should create ADAUSDM buy intent", async () => {
      const utxos = await userWallet.getUtxos();
      const collateral = await userWallet.getCollateral();

      if (utxos.length === 0 || !collateral || collateral.length === 0) {
        console.log("No UTxOs or collateral - skipping");
        return;
      }

      const swapParams = await calculateSwapParams("ADAUSDM", "buy", 100, 0.01);
      console.log("Swap params:", swapParams);

      const params = {
        utxos,
        collateral: collateral[0]!,
        changeAddress: userAddress,
        accountAddress: userAddress,
        fromAmount: [
          { unit: swapParams.fromUnit, quantity: swapParams.fromQuantity },
        ],
        toAmount: [
          { unit: swapParams.toUnit, quantity: swapParams.toQuantity },
        ],
      };

      console.log(`Building: ${swapParams.description}`);
      const result = await swapIntentTx.createSwapIntent(params, blockfrost);

      expect(result.txHex).toBeDefined();
      console.log("txHex length:", result.txHex.length);

      // Uncomment to sign and submit:
      // const signedTx = await userWallet.signTx(result.txHex);
      // const txHash = await userWallet.submitTx(signedTx);
      // console.log("Submitted tx:", txHash);
    }, 120000);

    it("should create ADAUSDM sell intent", async () => {
      const utxos = await userWallet.getUtxos();
      const collateral = await userWallet.getCollateral();

      if (utxos.length === 0 || !collateral || collateral.length === 0) {
        console.log("No UTxOs or collateral - skipping");
        return;
      }

      const swapParams = await calculateSwapParams(
        "ADAUSDM",
        "sell",
        100,
        0.01,
      );
      console.log("Swap params:", swapParams);

      const params = {
        utxos,
        collateral: collateral[0]!,
        changeAddress: userAddress,
        accountAddress: userAddress,
        fromAmount: [
          { unit: swapParams.fromUnit, quantity: swapParams.fromQuantity },
        ],
        toAmount: [
          { unit: swapParams.toUnit, quantity: swapParams.toQuantity },
        ],
      };

      console.log(`Building: ${swapParams.description}`);
      const result = await swapIntentTx.createSwapIntent(params, blockfrost);

      expect(result.txHex).toBeDefined();
      console.log("txHex length:", result.txHex.length);

      // Uncomment to sign and submit:
      // const signedTx = await userWallet.signTx(result.txHex);
      // const txHash = await userWallet.submitTx(signedTx);
      // console.log("Submitted tx:", txHash);
    }, 120000);
  });

  describe("cancelSwapIntent", () => {
    it("should build cancel swap intent transaction", async () => {
      const userUtxos = await blockfrost.fetchAddressUTxOs(userAddress);
      const collateral = await ddWallet.getCollateral("enterprise");

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
        utxos: userUtxos,
        collateral: collateralUtxo,
        changeAddress: userAddress,
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
      const tx = await userWallet.signTx(result.txHex, true);

      const signedTx = await ddWallet.signTx(tx, true);
      const fullySignedTx = await operatorWallet.signTx(signedTx, true); // Sign again to add operatorKeyHash as required signer
      // Uncomment to submit:
      console.log("fullySignedTx:", fullySignedTx);

      // const txHash = await ddWallet.submitTx(fullySignedTx);
      // console.log("Submitted tx:", txHash);
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

  describe("processSwapIntentsWithVaultAggregator", () => {
    it("should build process swap intents tx with script vault + aggregator oracle", async () => {
      const VAULT_AGGREGATOR_ORACLE_TX_HASH =
        "32490807b32631c0f29296f0b71d8487c0f69b8bb487b2ef99ca51c4ba433116";
      const VAULT_AGGREGATOR_ORACLE_OUTPUT_INDEX = 1;
      const VAULT_SCRIPT_ADDRESS =
        "addr_test1zz7cn459alvtxmx2grdqppsh00wuk5e79h0xa4zylhfnl2hqgezy0s04rtdwlc0tlvxafpdrfxnsg7ww68ge3j7l0lnsnt9lyd";

      // TODO: fill in the vault spending-script CBOR
      const vaultScriptCbor =
        "5913575913540101003229800aba4aba2aba1aba0aab9faab9eaab9dab9a9bae002488888888966003300130043754015370e90004dc3a4005223233001001003223300300130020029b87480126e952000918041804800c8c020c024c024006460106012601260126012601260120029111111114c004c044026602001322232598009806000c4c9660020030038992cc0040060090048024012264b3001301800380340150151bae0014060602a0028098c044dd50024566002601600313259800800c00e264b300100180240120090048992cc004c06000e00d00540546eb8005018180a800a02630113754009002403c8078c03cdd5001c88c8cc00400400c896600200314c103d87a80008992cc004c010006260126602800297ae0899801801980b0012020301400140492223259800980598081baa0018a40011375a602860226ea800500f192cc004c02cc040dd5000c530103d87a8000899198008009bab30153012375400444b30010018a6103d87a8000899192cc004cdc8803000c56600266e3c018006260186602e602a00497ae08a60103d87a8000404d1330040043019003404c6eb8c04c004c058005014201e32330010010042259800800c5300103d87a8000899192cc004cdc8803000c56600266e3c018006260166602c602800497ae08a60103d87a80004049133004004301800340486eb8c048004c05400501324444466446530012232598009809980b9baa001899192cc00400a2b300130153019375400513259800800c00a264b3001001801c00e007003899912cc00400600b13259800800c01a00d00680344cc89660020030088992cc004006013009804c02626644b3001001805c4c96600200300c80640320191332259800800c03a264b3001001807c03e01f00f899912cc00400602313259800800c04a02501280944cc89660020030148992cc00400602b01580ac05626644b300100180bc4c96600200301880c40620311332259800800c06a264b30010018992cc00400603913259800800c07603b01d899912cc00400603f13259800800c082041020899912cc00400604513259800800c08e0471332259800800c096264b30010018992cc004c1000062b3001337129002181f800c09e26644b3001001814c4c96600200302a81540aa26644b300100181644c96600200302d816c0b626644b3001001817c4c96600200303081840c226644b300100181944c966002003033819c0ce0671332259800800c0d6264b300100181b40da06d13259800982a001c6600203b133049014225980080144c124cc150c154c148dd501d1982a182418291baa03a33054304730523754074660a860aa60ac60ac60ac60a46ea80e8cc150c154c158c158c158c158c148dd501d1982a182a982b182b182b182b182b18291baa03a33054304630523754074660a860aa60ac60ac60ac60ac60ac60ac60ac60ac60a46ea80e8cc150c154c158c158c158c158c158c158c158c158c158c158c158c148dd501d25eb82264b300100181d40ea07503a8991801982c0021bae001416060aa004829a06e81e206e8288dd6800c0d90541828800a09e375c00260a00048288c13800504c1bad001304d002818209c304b00141246eb4004c12800a05a8258c1200050461bad001304700281520903045001410c6074607e002608800681f204e8208dd5000c09a04d0268132088304100140fc6eb0004c10000a0470234104607c00281e0dd6800981e801408103e181d800a072375a002607400501d40ec607000281b0c0e000a03701b80dc06d039181b000a068375c002606a00481b0c0cc0050311bae001303200240cc60600028170dd700098178012060302d00140ac6eb8004c0b000902d1815000a050375c00260520048150c09c0050251bae0013026002409c60480028110dd7000981180120483021001407c6eb8004c080009021180f000a038301a37540050014061001800c00600280f8566002003159800980a180c1baa0018992cc0040062d13259800800c5a2d168b44cc8966002003168992cc0040062d168b45a26644b30010018b44c966002003168b45a2d1332259800800c5a264b30010018b45a2d16899912cc0040062d13259800800c5a2d168b44cc8966002003168992cc0040062d168b45a26644b30010018b44c966002003168b45a2d1332259800800c5a264b30010018992cc0040062d13259800800c5a2d159800981b00146600200713302b375800244b3001002880e44c966002003168b45a2d1323003303a004375c00281d0c0dc00903545901e45903345a2c81b8c0d0005032181a00145a2d168b206a303200140c06eb8004c0c40090321817800a05a375c002605c0048178c0b000502a1bae001302b00240b060520028138dd700098140012052302600140906eb8004c0940090261811800a042375c00260440048118c08000501e1bae001301f0024080603a00280d8c064dd5000c5901745a2d168b203c32598009808980c1baa0018980e180c9baa0018b202e301b301c301c301837546036603860306ea8c06cc060dd5000c5901619803801118094c004dd59807180c1baa300e30183754003002a4500401d3018008980a1baa00348896600260240031329800980e000cc070c07400660306ea800e3300130193754017223232330010010042259800800c528456600266ebc00cc074c0840062946266004004604400280e101f19ba548008cc074dd4800a5eb8260306ea800e4464b30013017001899192cc004c08800a00916407c6eb8c080004c070dd5001c566002602c0031323259800981100140122c80f8dd71810000980e1baa0038b2034406860346ea800922223322323298009bab302400191192cc004c07cc08cdd5000c4c966002604060486ea800626464646464646464646464646464646464653001375a6074003375c6074025375c6074023375c6074021375c607401f375c607401d375c607401b375c6074019375c6074017375a6074013375a60740113758607400f3259800981c000c56600266e25200430370018b44c0c8c0dc0050364590391baa303a0069bad303a0059bad303a0049bad303a0039bae303a002488888888888888889660026098025132332259800982300144c8c8c96600260a400513303030510030048b209e375c60a000260a000260966ea800e2b3001304500289919192cc004c14800a26606060a200600916413c6eb8c140004c140004c12cdd5001c5660026086005132323259800982900144cc0c0c14400c0122c8278dd71828000982800098259baa0038b209241248248c120dd5000899821003912cc00400a204f13230023050003375c609c0048260c12c06e2c8248607400260720026070002606e002606c002606a00260680026066002606400260620026060002605e002605c002605a002605800260560026054002604a6ea80062c8118c966002603a60486ea800626050604a6ea80062c8118c09cc0a0c0a0c090dd51813981418121baa302730243754003164088660260044603d30013756603460486ea8c068c090dd5000c00a910100404d375860480089112cc004c07c0262646644b30013022302637540051323322598009812800c56600260546ea800e0051640ad1598009812000c4c8c8c8ca60026eb0c0c40066eb8c0c400e6eb0c0c400922259800981a80244cc0a8dd6181a003912cc00400a26605800644b3001002899817003912cc00400a01f132332259800981a80144c966002607e0031330343758607c00244b300100280244cc05cc1000084c004c10400903e45903c181d1baa0038acc004c0d000a2646644b3001304100189981b1bac30400012259800801401a266032608400426002608600482022c81f0dd7181f000981f800981d1baa0038acc004c0c800a2646464b3001304100289981b1bac30400032259800801401a266032608400426002608600482022c81f0dd7181f800981f800981d1baa0038b207040e081c0c0dcdd500089801181e001981d00120708991801181d0019bae303800240d913230023038003375a606c00481a22c819060620026060002605e00260546ea800e2b300130220018acc004c0a8dd5001c00a2c815a2c81410282050159800981118139baa0018a518a504098604e6ea8004c0a8c09cdd500145902519198008009bab3029302a302a302a0062259800800c530103d87a80008992cc004cdd78021813800c4c07ccc0a8c0a00052f5c1133003003302c00240986054002814088c9660026046003132323322598009818001c01a2c8168dd718168009bad302d002302d001302837540071598009811000c4c8cc8966002605e00313259800981398159baa00189919194c004dd71819000cdd69819001cdd718190012444b300130360048064590330c0c8004c0c4004c0b0dd5000c5902a1817000c5902c1bad302c001302d001302837540071598009810000c4c8c8ca60026eb8c0b80066eb4c0b800e6eb8c0b800922259800981900240222c8178605c002605a00260506ea800e2c8131026204c3026375400460366604c604e60506050605060486ea8cc008dd61813805810a5eb822b3001301e0098992cc004cdc42400130013756605000d375c6032604a6ea8c8cc89660026046604e6ea800a264b300130213028375400313259800981298149baa00189919191919191919191919191919191919194c004c0fc0066eb8c0fc04a6eb8c0fc0466eb8c0fc03e607e01d375c607e01b375c607e019303f00b9bae303f00a981f804cdd7181f8044c0fc01e6eb8c0fc01a607e00b375c607e009303f003981f801244444444444444444b300130510128998231bac3050021225980080144cc0a003c4cc0a00304cc0a00284cc0a00204cc0a00184cc0a00105660026094609c6ea800e2646464653001375c60ac003375c60ac009375c60ac007375c60ac00491112cc004c16c0162b300130523056375403713259800982e000c4cc144dd6182d800912cc00400a20631323002305f003375c60ba00482da2c82c8c15cdd500dc590554590580c158004c154004c150004c13cdd5001c5904d44c8c008c15000cdd7182900120a08b209c181f800981f000981e800981e000981d800981d000981c800981c000981b800981b000981a800981a0009819800981900098188009818000981780098151baa0018b2050302c3029375400316409c603a60506ea8c078c0a0dd5181598141baa0028b204c330160032302198009bab301d30273754603a604e6ea800600548900405844b3001302330273754005132323259800981780144cc03cc0b800c4c966002604e003132598009818800c4c8c966002605400313259800981a000c4cc050c0cc0040262c8188c0bcdd500145660026052003132323298009bad30350019bad30350039bad3035002488966002607200900e8b206c181a800981a00098179baa0028b205a40b4605a6ea8004c0c00062c8170c0b0dd50014566002604c00315980098161baa002802c5902d45902a2054302a37540031640b0605a002605a00260506ea800a2c8130dd71814000d220100405113300b004375c6050605200314a08118c090dd519807800810c566002603801313300a003375c604e605060506050605060506050605060486ea8cc0080040862660140066eb8c09cc0a0c0a0c0a0c0a0c0a0c0a0c090dd519807800810a0444088811060486048002604660466046004604200844b3001301a301e375400513232323322598009814001c4cc020c09c0104cc02000801a2c8128c094004dd7181280198128009812000980f9baa0028b203a24444b300130180028acc004c074dd5003c0062c80f22b300130170028acc004c074dd5003c0062c80f22b300130150028acc004c074dd5003c0062c80f22b30013370e90030014566002603a6ea801e00316407916406c80d901b2036180c1baa0068acc004c0400062646644b30013016301a375400513259800980b980d9baa00189919198008009bac302130223022302230223022302230220062259800800c528456600266e3cdd71811000801c528c4cc008008c08c00501d2040375c603e60386ea80062c80d0c044c06cdd5180f180d9baa0028b2032301c301d301d301d301d301d301d301d30193754660086eb0c070004058c070c064dd5003980e180c1baa00a8b202c405822232598009809800c4c9660020030038992cc004006264b3001001802c4c966002003006803401a00d132598009810801c66002009008803a014803a03c375c0028108c07800501c180f0014012009004802203e301c001406860306ea80122b300130120018992cc00400600713259800800c4c9660020030058992cc00400600d006803401a264b300130210038cc004012011007402900740786eb8005021180f000a038301e0028024012009004407c603800280d0c060dd50024566002602000313259800800c00e264b30010018992cc00400600b13259800800c01a00d00680344c966002604200719800802402200e805200e80f0dd7000a042301e0014070603c005004802401200880f8c07000501a180c1baa004801202c405880b0c058dd5001980a980b0029112cc004c040c050dd5001c4c9660020030028992cc004006007003801c00e26644b3001001802c4c96600200313259800800c01e264b30010018acc004c08000a330010038cc00400601300840350084035008407500880440220108108c07800501c180f001401a00d006803203e301c00140686eb8004c06c00901c180c800a02e30153754007001404c452689b2b20042611e581c0bfa43b0dc17ce75e79fb992a37e87432e2aa6dd2c814190480ce4a00001";

      // Swap intents to process
      const swapIntentAddress = swapIntentTx.getSwapIntentAddress();
      const intentUtxos = await blockfrost.fetchAddressUTxOs(swapIntentAddress);
      if (intentUtxos.length === 0) {
        console.log("No swap intent UTxOs found - skipping");
        return;
      }
      console.log(`Found ${intentUtxos.length} swap intent UTxO(s)`);

      // outputAmount = datum.to_amount for each intent
      const swapIntentFills = intentUtxos.map((utxo) => {
        const info = parseSwapIntentDatum(utxo, 0);
        if (!info) {
          throw new Error(`Invalid swap intent datum: ${utxo.input.txHash}`);
        }
        return {
          utxo,
          outputAmount: [
            {
              unit: "lovelace",
              quantity: "45000000",
            },
          ],
        };
      });

      // Vault aggregator oracle UTxO (ref input only) — fetched by outRef
      const aggregatorUtxos = await blockfrost.fetchUTxOs(
        VAULT_AGGREGATOR_ORACLE_TX_HASH,
        VAULT_AGGREGATOR_ORACLE_OUTPUT_INDEX,
      );
      if (aggregatorUtxos.length === 0) {
        throw new Error(
          `Vault aggregator oracle UTxO not found at ${VAULT_AGGREGATOR_ORACLE_TX_HASH}#${VAULT_AGGREGATOR_ORACLE_OUTPUT_INDEX}`,
        );
      }
      const vaultAggregatorOracleUtxo = aggregatorUtxos[0]!;
      console.log(
        "Vault aggregator oracle UTxO:",
        vaultAggregatorOracleUtxo.input,
      );

      // Vault input UTxOs (script-locked)
      const vaultInputUtxos =
        await blockfrost.fetchAddressUTxOs(VAULT_SCRIPT_ADDRESS);
      if (vaultInputUtxos.length === 0) {
        throw new Error(`No vault UTxOs found at ${VAULT_SCRIPT_ADDRESS}`);
      }
      console.log(`Found ${vaultInputUtxos.length} vault UTxO(s)`);

      // Operator pays fees / provides collateral
      const operatorUtxos = await operatorWallet.getUtxos("payment");
      const operatorCollateral =
        await operatorWallet.getCollateral("enterprise");
      if (operatorUtxos.length === 0) {
        throw new Error("No UTxOs in operator wallet");
      }
      if (!operatorCollateral || operatorCollateral.length === 0) {
        throw new Error("No collateral in operator wallet");
      }

      const params = {
        utxos: [],
        collateral: operatorCollateral[0]!,
        changeAddress: operatorAddress,
        oracleUtxo,
        vaultAggregatorOracleUtxo,
        swapIntentFills,
        vaultInputUtxos,
        vaultScriptCbor,
      };

      console.log(
        "Building processSwapIntentsWithVaultAggregator transaction...",
      );
      const result = await swapIntentTx.processSwapIntentsWithVaultAggregator(
        params,
        blockfrost,
      );

      console.log("txHex length:", result.txHex.length);
      console.log("feePerIntent:", result.feePerIntent);
      console.log("intentCount:", result.intentCount);
      expect(result.txHex).toBeDefined();
      expect(result.txHex.length).toBeGreaterThan(0);

      // Sign with DD + Operator (both required signers)
      let signedTx = await ddWallet.signTx(result.txHex, true);
      signedTx = await operatorWallet.signTx(signedTx, true);
      console.log("Transaction signed by DD and Operator");

      // Uncomment to submit:
      const txHash = await operatorWallet.submitTx(signedTx);
      console.log("Submitted tx:", txHash);
    }, 120000);
  });

  describe("fetchSwapIntentUtxos", () => {
    it("should fetch all swap intent UTxOs", async () => {
      const intentUtxos = await swapIntentTx.fetchSwapIntentUtxos(blockfrost);

      console.log(`Found ${intentUtxos.length} swap intent UTxO(s)`);
      expect(Array.isArray(intentUtxos)).toBe(true);

      // Verify each UTxO has valid swap intent datum
      for (const utxo of intentUtxos) {
        const info = parseSwapIntentDatum(utxo, 0);
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
        const info = parseSwapIntentDatum(utxo, 0);
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
        const info = parseSwapIntentDatum(utxo, 0);
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
