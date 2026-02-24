// Test environment setup for Khor
// eslint-disable-next-line @typescript-eslint/no-var-requires
require("dotenv").config();
// eslint-disable-next-line @typescript-eslint/no-var-requires
const _sodium = require("libsodium-wrappers-sumo");

// Initialize libsodium before any tests run
beforeAll(async () => {
  await _sodium.ready;
}, 30000);

// Set default environment variables for testing
process.env.NETWORK_ID = process.env.NETWORK_ID || "0";
