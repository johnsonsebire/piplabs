import MetaApi, {
  MetaApiConnection,
  PendingTradeOptions,
  MarketTradeOptions
} from "metaapi.cloud-sdk/esm-node";

export class MetaApiWrapper {
  private api: MetaApi;

  constructor(token: string) {
    if (!token) {
      throw new Error("MetaAPI token is required");
    }
    this.api = new MetaApi(token);
  }

  /**
   * Retrieves an account connection
   */
  async getAccountConnection(accountId: string): Promise<MetaApiConnection> {
    const account = await this.api.metatraderAccountApi.getAccount(accountId);
    if (account.state !== "DEPLOYED") {
      await account.deploy();
      await account.waitConnected();
    }
    const connection = account.getRPCConnection();
    await connection.connect();
    await connection.waitSynchronized();
    return connection;
  }

  /**
   * Retrieves all accounts
   */
  async getAccounts() {
    return await this.api.metatraderAccountApi.getAccountsWithInfiniteScrollPagination();
  }

  /**
   * Provisions a new MetaTrader account
   */
  async provisionAccount(options: {
    name: string;
    login: string;
    password?: string;
    server: string;
    magic?: number;
    platform?: "mt4" | "mt5";
  }): Promise<string> {
    const account = await this.api.metatraderAccountApi.createAccount({
      name: options.name,
      type: "cloud",
      login: options.login,
      password: options.password,
      server: options.server,
      magic: options.magic || 1000,
      platform: options.platform || "mt5",
    });
    return account.id;
  }

  /**
   * Set account as a CopyFactory Provider
   */
  async setProviderRole(accountId: string, resourceSlots: number = 1): Promise<void> {
    const account = await this.api.metatraderAccountApi.getAccount(accountId);
    const existingRoles = account.copyFactoryRoles || [];
    const newRoles = Array.from(new Set([...existingRoles, 'PROVIDER'])) as Array<'PROVIDER' | 'SUBSCRIBER'>;
    await account.enableCopyFactoryApi(newRoles, resourceSlots);
  }

  /**
   * Executes a market order
   */
  async executeMarketOrder(
    accountId: string,
    symbol: string,
    action: "ORDER_TYPE_BUY" | "ORDER_TYPE_SELL",
    volume: number,
    options?: MarketTradeOptions
  ) {
    const connection = await this.getAccountConnection(accountId);
    try {
      let result;
      if (action === "ORDER_TYPE_BUY") {
        result = await connection.createMarketBuyOrder(symbol, volume, options?.stopLoss, options?.takeProfit, options);
      } else {
        result = await connection.createMarketSellOrder(symbol, volume, options?.stopLoss, options?.takeProfit, options);
      }
      return result;
    } finally {
      // Disconnecting immediately might not be optimal if doing many trades,
      // but safe for one-off operations.
      // await connection.close(); // Not closing immediately for performance, maybe cache connection later
    }
  }
}

let defaultWrapper: MetaApiWrapper | null = null;

export const getMetaApiWrapper = () => {
  if (!defaultWrapper) {
    const token = process.env.META_API;
    if (!token) {
      throw new Error("META_API environment variable is not set");
    }
    defaultWrapper = new MetaApiWrapper(token);
  }
  return defaultWrapper;
};
