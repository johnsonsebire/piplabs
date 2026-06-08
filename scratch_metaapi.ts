import dotenv from "dotenv";
import path from "path";
import MetaApi from "metaapi.cloud-sdk/esm-node";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function main() {
  const token = process.env.META_API;
  if (!token) {
    console.error("No META_API token found.");
    return;
  }
  const api = new MetaApi(token);
  try {
    const accounts = await api.metatraderAccountApi.getAccounts();
    console.log(`Found ${accounts.length} accounts.`);
    for (const acc of accounts) {
      console.log({
        id: acc.id,
        name: acc.name,
        login: acc.login,
        server: acc.server,
        type: acc.type,
        state: acc.state,
        connectionStatus: acc.connectionStatus,
        copyFactoryRoles: acc.copyFactoryRoles
      });
    }
  } catch (error) {
    console.error("Error fetching accounts:", error);
  }
}

main();
