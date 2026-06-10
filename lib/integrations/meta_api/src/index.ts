import MetaApi, {
  CopyFactory
} from "metaapi.cloud-sdk/esm-node";

export class MetaApiWrapper {
  public api: MetaApi;
  public copyFactory: CopyFactory;

  constructor(token: string) {
    if (!token) {
      throw new Error("MetaAPI token is required");
    }
    this.api = new MetaApi(token);
    this.copyFactory = new CopyFactory(token);
  }

  /**
   * Retrieves an account connection
   */
  async getAccountConnection(accountId: string): Promise<any> {
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
      type: "cloud" as any,
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
   * Ensure a CopyFactory strategy exists for the provider account
   */
  async createOrGetStrategy(providerAccountId: string): Promise<string> {
    try {
      // Ensure the provider role is enabled on the MT5 account in MetaAPI
      const account = await this.api.metatraderAccountApi.getAccount(providerAccountId);
      const existingRoles = account.copyFactoryRoles || [];
      if (!existingRoles.includes('PROVIDER')) {
        const newRoles = Array.from(new Set([...existingRoles, 'PROVIDER'])) as Array<'PROVIDER' | 'SUBSCRIBER'>;
        await account.enableCopyFactoryApi(newRoles, 1);
      }

      // First, get strategies and check if one exists for this account
      const strategiesRes = await this.copyFactory.configurationApi.getStrategiesWithClassicPagination({ limit: 1000 });
      const existing = strategiesRes.items.find((s: any) => s.accountId === providerAccountId);
      if (existing) {
        return (existing as any).id || (existing as any)._id;
      }
      
      // If not, create a new one using an upsert (updateStrategy) with a generated ID
      const { id } = await this.copyFactory.configurationApi.generateStrategyId();
      await this.copyFactory.configurationApi.updateStrategy(id, {
        name: `Strategy for ${providerAccountId.substring(0, 8)}`,
        accountId: providerAccountId,
        description: 'Auto-generated strategy by AI Trader Platform'
      });
      return id;
    } catch (error) {
      console.error("Error creating/getting strategy:", error);
      throw error;
    }
  }

  /**
   * Update Subscriber configuration in CopyFactory
   */
  async updateSubscriber(subscriberAccountId: string, strategyId: string, riskType: string, riskMultiplier: number): Promise<void> {
    try {
      // Ensure the subscriber role is enabled
      const account = await this.api.metatraderAccountApi.getAccount(subscriberAccountId);
      const existingRoles = account.copyFactoryRoles || [];
      if (!existingRoles.includes('SUBSCRIBER')) {
        const newRoles = Array.from(new Set([...existingRoles, 'SUBSCRIBER'])) as Array<'PROVIDER' | 'SUBSCRIBER'>;
        await account.enableCopyFactoryApi(newRoles, 1);
      }

      // In CopyFactory, you define a list of subscriptions for a subscriber
      const subscriptionInfo: any = {
        strategyId: strategyId,
        multiplier: riskMultiplier,
      };

      if (riskType === 'fixed') {
        subscriptionInfo.tradeSizeScaling = {
          mode: 'none'
        };
      } else if (riskType === 'proportional') {
        subscriptionInfo.tradeSizeScaling = {
          mode: 'balance'
        };
      }
      
      await this.copyFactory.configurationApi.updateSubscriber(subscriberAccountId, {
        name: `Subscriber ${subscriberAccountId.substring(0, 8)}`,
        subscriptions: [
          subscriptionInfo
        ]
      });
    } catch (error) {
      console.error("Error configuring subscriber:", error);
      throw error;
    }
  }

  /**
   * Pause or remove a subscriber by clearing their active subscriptions
   */
  async clearSubscriber(subscriberAccountId: string): Promise<void> {
    try {
      // Just send an empty subscriptions array to effectively stop copying
      await this.copyFactory.configurationApi.updateSubscriber(subscriberAccountId, {
        name: `Subscriber ${subscriberAccountId.substring(0, 8)}`,
        subscriptions: []
      });
    } catch (error: any) {
      // If it throws a 404 (Not Found), it means the subscriber was never registered
      // in CopyFactory to begin with (like orphaned subscriptions). 
      // We can safely ignore this and proceed.
      if (error?.status === 404 || error?.message?.includes('404')) {
        console.warn(`Subscriber ${subscriberAccountId} not found in CopyFactory. Safely ignoring.`);
      } else {
        console.error("Error clearing subscriber:", error);
        throw error;
      }
    }
  }

  /**
   * Executes a market order
   */
  async executeMarketOrder(
    accountId: string,
    symbol: string,
    action: "ORDER_TYPE_BUY" | "ORDER_TYPE_SELL",
    volume: number,
    options?: any
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
