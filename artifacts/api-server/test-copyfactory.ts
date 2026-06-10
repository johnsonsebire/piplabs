import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { getMetaApiWrapper } from "../../lib/integrations/meta_api/src/index";

async function test() {
  try {
    const metaApi = getMetaApiWrapper();
    console.log("MetaApiWrapper initialized.");
    
    const cf = metaApi.copyFactory;
    
    if (cf.tradingApi) {
      console.log("\n--- tradingApi prototype keys ---");
      console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(cf.tradingApi)));
    } else {
      console.log("tradingApi is UNDEFINED");
    }

    if (cf.historyApi) {
      console.log("\n--- historyApi prototype keys ---");
      console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(cf.historyApi)));
    } else {
      console.log("historyApi is UNDEFINED");
    }
  } catch (error) {
    console.error("Test failed:", error);
  }
}

test();
