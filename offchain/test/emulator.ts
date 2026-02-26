import { UTxO, OfflineFetcher } from "@meshsdk/core";
import { Serialization, toTxUnspentOutput } from "@meshsdk/core-cst";
import { AddressType, MeshCardanoHeadlessWallet } from "@meshsdk/wallet";
import { Emulator, SlotConfig } from "scalus";

export const utxosToCborMap = (utxos: UTxO[]): string => {
  const cborWriter = new Serialization.CborWriter();
  cborWriter.writeStartMap(utxos.length);
  for (const utxo of utxos) {
    const cardanoUtxo = toTxUnspentOutput(utxo);
    cborWriter.writeEncodedValue(
      Buffer.from(cardanoUtxo.input().toCbor(), "hex"),
    );
    cborWriter.writeEncodedValue(
      Buffer.from(cardanoUtxo.output().toCbor(), "hex"),
    );
  }
  return cborWriter.encodeAsHex();
};

// Test mnemonic (DO NOT use in production)
const TEST_MNEMONIC = [
  "horror",
  "hand",
  "pulp",
  "market",
  "slight",
  "photo",
  "frown",
  "pulp",
  "crawl",
  "day",
  "senior",
  "property",
  "calm",
  "inner",
  "reflect",
  "stage",
  "spot",
  "before",
  "charge",
  "artist",
  "together",
  "heavy",
  "quote",
  "soup",
];

export interface TestContext {
  emulator: Emulator;
  fetcher: OfflineFetcher;
  wallet: MeshCardanoHeadlessWallet;
  address: string;
  utxos: UTxO[];
  collateral: UTxO;
}

export const createTestContext = async (
  initialUtxos?: UTxO[],
): Promise<TestContext> => {
  const fetcher = new OfflineFetcher("preprod");

  const wallet = await MeshCardanoHeadlessWallet.fromMnemonic({
    networkId: 0,
    fetcher,
    walletAddressType: AddressType.Base,
    mnemonic: TEST_MNEMONIC,
  });

  const address = await wallet.getChangeAddressBech32();

  // Default UTxOs if not provided
  const utxos: UTxO[] = initialUtxos || [
    {
      input: {
        txHash:
          "886cd5fcb80ed1fd01d3c4eb409035295fc54ee9c37e71f100af9e1282b035af",
        outputIndex: 0,
      },
      output: {
        address,
        amount: [{ unit: "lovelace", quantity: "1000000000000" }],
      },
    },
    {
      input: {
        txHash:
          "886cd5fcb80ed1fd01d3c4eb409035295fc54ee9c37e71f100af9e1282b035af",
        outputIndex: 1,
      },
      output: {
        address,
        amount: [{ unit: "lovelace", quantity: "10000000" }], // 10 ADA for collateral
      },
    },
  ];

  fetcher.addUTxOs(utxos);

  const emulator = new Emulator(
    Buffer.from(utxosToCborMap(utxos), "hex"),
    SlotConfig.preprod,
  );

  // Use second UTxO as collateral (pure ADA)
  const collateral = utxos[1]!;

  return {
    emulator,
    fetcher,
    wallet,
    address,
    utxos,
    collateral,
  };
};

export const submitAndSign = async (ctx: TestContext, txHex: string) => {
  const signedTx = await ctx.wallet.signTxReturnFullTx(txHex);
  const result = ctx.emulator.submitTx(Buffer.from(signedTx, "hex"));
  return result;
};
