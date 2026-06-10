import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const metaApiSDK = require("metaapi.cloud-sdk");
const CopyFactory = metaApiSDK.CopyFactory;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function test() {
  try {
    const cf = new CopyFactory(process.env.META_API);
    console.log("Calling getUserLog...");
    try {
      const logs = await cf.tradingApi.getUserLog("dummy-id");
      console.log("getUserLog result:", logs);
    } catch (e) {
      console.log("getUserLog failed (expected for dummy):", e.message || e);
    }
    
    console.log("Calling getSubscriptionTransactions...");
    try {
      const transactions = await cf.historyApi.getSubscriptionTransactions(new Date(Date.now() - 86400000), new Date());
      console.log("getSubscriptionTransactions result:", transactions.length, "transactions");
    } catch (e) {
      console.log("getSubscriptionTransactions failed:", e.message || e);
    }
  } catch (error) {
    console.error("Test failed:", error);
  }
}

test();
