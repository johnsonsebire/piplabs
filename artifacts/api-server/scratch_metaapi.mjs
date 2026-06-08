import dotenv from "dotenv";
import path from "path";
import MetaApi from "metaapi.cloud-sdk/esm-node";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

async function main() {
  const token = process.env.META_API;
  const api = new MetaApi(token);
  try {
    const accounts = await api.metatraderAccountApi.getAccountsWithInfiniteScrollPagination();
    for (const acc of accounts) {
      console.log(`acc.id = ${acc.id}, acc._id = ${acc._id}`);
    }
  } catch (error) {
    console.error(error);
  }
}
main();
