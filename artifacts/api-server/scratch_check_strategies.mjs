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
    const strategiesRes = await cf.configurationApi.getStrategiesWithClassicPagination({ limit: 10 });
    console.log("Strategies count:", strategiesRes.items.length);
    if (strategiesRes.items.length > 0) {
      console.log("First strategy detail:", JSON.stringify(strategiesRes.items[0], null, 2));
    }
  } catch (error) {
    console.error("Test failed:", error);
  }
}

test();
