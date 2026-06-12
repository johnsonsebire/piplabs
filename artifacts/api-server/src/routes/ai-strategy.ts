import { Router, type IRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import OpenAI from "openai";
import { fetchDerivCandles } from "../lib/derivHistory";
import { runBacktestOnCandles, computeMaxDrawdown, parseStrategyLegs } from "../lib/backtestEngine";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { conversations, messages as messagesTable } from "@workspace/db/schema";
import { strategiesTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";

const router: IRouter = Router();

function getOpenAIClient(): OpenAI {
  return new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
  });
}

const SYSTEM_PROMPT = `You are an expert quantitative developer and AI Trading Strategy Builder for the Deriv algorithmic trading platform.
Your task is to help the user build, optionally backtest, and optimize algorithmic trading strategies based on their natural language requests.

### Tool Instructions
You have access to three tools:

1. \`list_strategies\`: Call this to retrieve the user's saved strategies when they refer to an existing strategy by name (e.g. "backtest my RSI strategy"). Returns a list of {id, name, description} objects. Call this BEFORE \`run_backtest\` when you need to look up an existing strategy.

2. \`run_backtest\`: Run a historical backtest. Provide EITHER:
   - \`strategyCode\` (raw JSON string) for a NEW strategy you have just generated, OR
   - \`strategyId\` (integer) for an EXISTING saved strategy you found via \`list_strategies\`.
   Call this ONLY if the user explicitly asks to backtest, test, validate, or optimize a strategy. Do NOT call this if the user just asks to "create" or "build" a strategy without testing.

3. \`finalize_strategy\`: Call this when you are done iterating, or immediately if no backtest was requested. You MUST call this to complete the request and deliver the final strategy to the user.

### Strategy Code Schema (JSON)
The strategy \`code\` you generate must be a strict JSON string matching this structure:
{
  "smcConfig": { "swingLookback": "auto", "obLookback": 100, "fvgLookback": 100 },
  "buy": { "enabled": boolean, "sessions": ["asian"|"london"|"newyork"|"overlap_london_ny"], "marketFilters": [...], "triggers": [...], "confirmations": [...], "htf": {...}, "rangingFilter": { "enabled": boolean, "threshold": number, "adx": {"enabled": boolean, "weight": number, "period": number, "value": number}, "bb": {"enabled": boolean, "weight": number, "period": number, "percentile": number}, "atr": {"enabled": boolean, "weight": number, "period": number, "smaPeriod": number, "ratio": number}, "rsi": {"enabled": boolean, "weight": number, "period": number, "min": number, "max": number} }, "exit": "opposite"|"target"|"manual" },
  "sell": { "enabled": boolean, "sessions": ["asian"|"london"|"newyork"|"overlap_london_ny"], "marketFilters": [...], "triggers": [...], "confirmations": [...], "htf": {...}, "rangingFilter": { "enabled": boolean, "threshold": number, "adx": {"enabled": boolean, "weight": number, "period": number, "value": number}, "bb": {"enabled": boolean, "weight": number, "period": number, "percentile": number}, "atr": {"enabled": boolean, "weight": number, "period": number, "smaPeriod": number, "ratio": number}, "rsi": {"enabled": boolean, "weight": number, "period": number, "min": number, "max": number} }, "exit": "opposite"|"target"|"manual" },
  "riskManagement": { "winCooldown": {...}, "lossCooldown": {...} }
}

### Indicators & Operators
Available Indicators: EMA(N), SMA(N), WMA(N), RSI(N), CCI(N), ATR(N), ADX(N), MACD, MACD_SIGNAL, STOCH_K, STOCH_D, BB_UPPER, BB_LOWER, BB_MIDDLE, CLOSE
SMC / Price Action Series (Binary 1/0): SWING_HIGH, SWING_LOW, BOS_BULL, BOS_BEAR, CHOCH_BULL, CHOCH_BEAR, OB_BULL, OB_BEAR, FVG_BULL, FVG_BEAR, PREMIUM, DISCOUNT, LIQSWEEP_HIGH, LIQSWEEP_LOW, DISP_BULL, DISP_BEAR, WICK_BULL, WICK_BEAR, MSS_BULL, MSS_BEAR
Operators: ">", "<", "==", ">=", "<=", "crosses above", "crosses below", "is rising", "is declining"
Condition Object: { "id": "unique_string", "indicatorA": "RSI(14)", "operator": ">", "indicatorB": "50" }

### Process
1. Analyze the user's request.
2. If they refer to an existing strategy, call \`list_strategies\` first to find its id.
3. If backtesting/optimization is requested, draft an initial strategy (or use the found strategyId) and call \`run_backtest\`. Review the results (Win Rate, PnL, Drawdown) and modify the parameters if needed (max 3 iterations).
4. If backtest fails, explain the error clearly to the user and suggest fixes (different symbol, timeframe, or simplified conditions).
5. Call \`finalize_strategy\` with the final JSON to end the conversation.
`;

const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_strategies",
      description: "List the user's saved strategies. Call this when the user refers to an existing strategy by name.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_backtest",
      description:
        "Run a historical backtest for a strategy to evaluate its performance. Provide EITHER strategyCode (for a new strategy) OR strategyId (for an existing saved strategy).",
      parameters: {
        type: "object",
        properties: {
          strategyCode: {
            type: "string",
            description:
              "The stringified JSON of the strategy code. Required if strategyId is not provided.",
          },
          strategyId: {
            type: "number",
            description:
              "The ID of an existing saved strategy. Use this instead of strategyCode when backtesting a saved strategy.",
          },
          symbol: {
            type: "string",
            description: "The Deriv symbol (e.g. R_100, R_50, 1HZ10V, frxEURUSD).",
          },
          timeframe: {
            type: "number",
            description: "Granularity in seconds (60 for 1m, 300 for 5m, 900 for 15m).",
          },
          days: {
            type: "number",
            description: "Number of days of history to test (1 to 7).",
          },
        },
        required: ["symbol", "timeframe", "days"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finalize_strategy",
      description:
        "Finalize and present the generated strategy to the user. MUST be called to complete the request.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "A catchy name for the strategy." },
          description: {
            type: "string",
            description: "A short explanation of how the strategy works.",
          },
          type: {
            type: "string",
            enum: ["vanilla_options", "forex", "multiplier", "universal"],
          },
          code: {
            type: "string",
            description: "The stringified JSON of the strategy code.",
          },
        },
        required: ["name", "description", "type", "code"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Streaming helper — accumulates a streaming OpenAI response into a single
// content string + structured tool call, then returns both so the caller can
// build ONE properly-formed assistant message.
// ---------------------------------------------------------------------------
interface StreamResult {
  contentStr: string;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
}

async function consumeStream(
  stream: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>,
  onDelta: (text: string) => void,
): Promise<StreamResult> {
  let contentStr = "";

  // index → { id, name, arguments }
  const toolCallMap: Map<number, { id: string; name: string; arguments: string }> = new Map();

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (!delta) continue;

    // Text content
    if (delta.content) {
      contentStr += delta.content;
      onDelta(delta.content);
    }

    // Tool call deltas — keyed by index so multiple tool calls are handled
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        if (!toolCallMap.has(idx)) {
          toolCallMap.set(idx, { id: "", name: "", arguments: "" });
        }
        const entry = toolCallMap.get(idx)!;
        if (tc.id) entry.id = tc.id;
        if (tc.function?.name) entry.name += tc.function.name;
        if (tc.function?.arguments) entry.arguments += tc.function.arguments;
      }
    }
  }

  const toolCalls = [...toolCallMap.values()].filter((tc) => tc.name);
  return { contentStr, toolCalls };
}

// ---------------------------------------------------------------------------
// Build a single assistant message that correctly contains BOTH content and
// tool_calls when both are present (OpenAI requires them in the same message).
// ---------------------------------------------------------------------------
function buildAssistantMessage(
  result: StreamResult,
): OpenAI.Chat.ChatCompletionMessageParam {
  if (result.toolCalls.length > 0) {
    return {
      role: "assistant",
      // content must be present (possibly empty / null) alongside tool_calls
      content: result.contentStr || null,
      tool_calls: result.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    };
  }
  return {
    role: "assistant",
    content: result.contentStr,
  };
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------
router.post("/ai/strategy/generate", requireAuth, async (req: AuthenticatedRequest, res) => {
  const { messages, conversationId } = req.body;
  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: "Invalid messages array" });
    return;
  }

  const userId = req.userId!;
  let activeConvId = conversationId;

  try {
    if (!activeConvId) {
      const newTitle =
        messages[messages.length - 1]?.content.substring(0, 50) || "New Conversation";
      const [newConv] = await db
        .insert(conversations)
        .values({ userId, title: newTitle, model: "gpt-4o" })
        .returning();
      activeConvId = newConv.id;
    }

    // Save the user's latest message
    const userMessage = messages[messages.length - 1];
    if (userMessage && userMessage.role === "user") {
      await db.insert(messagesTable).values({
        conversationId: activeConvId,
        role: "user",
        content: userMessage.content,
      });
    }
  } catch (error) {
    logger.error({ error }, "Error setting up conversation");
    res.status(500).json({ error: "Failed to setup conversation" });
    return;
  }

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const sendEvent = (
    type:
      | "message"
      | "tool_call"
      | "tool_result"
      | "final_strategy"
      | "error"
      | "done"
      | "conversation_id",
    data: unknown,
  ) => {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent("conversation_id", { id: activeConvId });

  const client = getOpenAIClient();
  const conversation: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages,
  ];

  const maxIterations = 6;
  let fullAssistantMessage = "";

  try {
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // ── Stream one turn ────────────────────────────────────────────────
      const stream = await client.chat.completions.create({
        model: "gpt-4o",
        messages: conversation,
        tools: TOOLS,
        tool_choice: "auto",
        stream: true,
      });

      const result = await consumeStream(stream, (delta) => {
        fullAssistantMessage += delta;
        sendEvent("message", { delta });
      });

      // ── Push a single, correctly-formed assistant message ──────────────
      const assistantMsg = buildAssistantMessage(result);
      conversation.push(assistantMsg);

      // ── No tool call → model is done talking, exit loop ───────────────
      if (result.toolCalls.length === 0) {
        break;
      }

      // ── Process each tool call ─────────────────────────────────────────
      let shouldFinalize = false;

      for (const tc of result.toolCalls) {
        sendEvent("tool_call", { name: tc.name, arguments: tc.arguments });

        let toolResult = "";

        // ── finalize_strategy ──────────────────────────────────────────
        if (tc.name === "finalize_strategy") {
          try {
            const args = JSON.parse(tc.arguments);
            sendEvent("final_strategy", args);
          } catch {
            sendEvent("error", { message: "Failed to parse finalize_strategy arguments" });
          }
          shouldFinalize = true;
          // Push a dummy tool result so the conversation stays valid
          conversation.push({
            role: "tool",
            tool_call_id: tc.id,
            content: "Strategy finalized and sent to the user.",
          });
          continue;
        }

        // ── list_strategies ────────────────────────────────────────────
        if (tc.name === "list_strategies") {
          try {
            const strategies = await db
              .select({
                id: strategiesTable.id,
                name: strategiesTable.name,
                description: strategiesTable.description,
                type: strategiesTable.type,
              })
              .from(strategiesTable)
              .where(
                or(
                  eq(strategiesTable.userId, userId),
                  eq(strategiesTable.isPublic, true),
                ),
              );

            if (strategies.length === 0) {
              toolResult = "The user has no saved strategies yet.";
            } else {
              toolResult = JSON.stringify(
                strategies.map((s) => ({
                  id: s.id,
                  name: s.name,
                  description: s.description ?? "",
                  type: s.type,
                })),
              );
            }
            sendEvent("message", {
              delta: `\n\n📋 *Found ${strategies.length} saved strategy(ies).*\n`,
            });
          } catch (e: any) {
            toolResult = `Failed to list strategies: ${e.message}`;
          }
        }

        // ── run_backtest ───────────────────────────────────────────────
        else if (tc.name === "run_backtest") {
          try {
            const args = JSON.parse(tc.arguments);

            // Resolve strategy code: either inline or from DB
            let strategyCode: string | null = args.strategyCode ?? null;

            if (!strategyCode && args.strategyId) {
              const [found] = await db
                .select({ code: strategiesTable.code, name: strategiesTable.name })
                .from(strategiesTable)
                .where(eq(strategiesTable.id, Number(args.strategyId)));

              if (!found) {
                toolResult = `Strategy with ID ${args.strategyId} not found. Use list_strategies to find the correct ID.`;
                conversation.push({
                  role: "tool",
                  tool_call_id: tc.id,
                  content: toolResult,
                });
                sendEvent("tool_result", { id: tc.id, result: toolResult });
                continue;
              }
              strategyCode = found.code;
              sendEvent("message", {
                delta: `\n\n🔍 *Loaded existing strategy: "${found.name}"*\n`,
              });
            }

            if (!strategyCode) {
              toolResult =
                "Backtest failed: no strategyCode or strategyId provided. Please provide the strategy JSON directly.";
              conversation.push({
                role: "tool",
                tool_call_id: tc.id,
                content: toolResult,
              });
              sendEvent("tool_result", { id: tc.id, result: toolResult });
              continue;
            }

            // Validate the strategy has enabled legs before fetching candles
            const { buy, sell } = parseStrategyLegs(strategyCode);
            const hasRules = (leg: typeof buy) => {
              if (!leg.enabled) return false;
              return (
                (leg.conditions?.length ?? 0) +
                  (leg.triggers?.length ?? 0) +
                  (leg.marketFilters?.length ?? 0) +
                  (leg.confirmations?.length ?? 0) >
                0
              );
            };
            if (!hasRules(buy) && !hasRules(sell)) {
              toolResult =
                "Backtest failed: The strategy has no enabled BUY or SELL leg with conditions. " +
                "Make sure the strategy JSON has at least one leg with 'enabled: true' and some triggers or conditions.";
              conversation.push({
                role: "tool",
                tool_call_id: tc.id,
                content: toolResult,
              });
              sendEvent("tool_result", { id: tc.id, result: toolResult });
              sendEvent("message", {
                delta: `\n\n❌ *Backtest failed: strategy has no enabled conditions. I will fix this.*\n`,
              });
              continue;
            }

            sendEvent("message", {
              delta: `\n\n🔄 *Running backtest on ${args.symbol} (${args.timeframe}s candles) for ${args.days} day(s)...*\n`,
            });

            const nowSec = Math.floor(Date.now() / 1000);
            const fromSec = nowSec - args.days * 24 * 60 * 60;

            const candles = await fetchDerivCandles(
              args.symbol,
              fromSec,
              nowSec,
              args.timeframe,
            );

            if (candles.length < 50) {
              toolResult = `Backtest failed: Only ${candles.length} candles returned for ${args.symbol}. ` +
                `Try a more liquid symbol (R_100, R_50, frxEURUSD), a longer timeframe, or more days.`;
              conversation.push({
                role: "tool",
                tool_call_id: tc.id,
                content: toolResult,
              });
              sendEvent("tool_result", { id: tc.id, result: toolResult });
              continue;
            }

            const params = {
              tradeType: "CALL",
              duration: 1,
              durationUnit: "m",
              stakePerTrade: 10,
              initialBalance: 1000,
            };

            const { trades } = runBacktestOnCandles(
              candles,
              strategyCode,
              params,
              args.timeframe,
            );

            const wins = trades.filter((t) => t.pnl > 0).length;
            const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
            const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
            const maxDrawdown = computeMaxDrawdown(params.initialBalance, trades);

            if (trades.length === 0) {
              toolResult =
                `Backtest on ${args.symbol} produced 0 trades over ${candles.length} candles. ` +
                `The strategy conditions may be too strict or no signals fired in this period. ` +
                `Consider relaxing the conditions or trying a different symbol/timeframe.`;
            } else {
              toolResult =
                `Backtest Results for ${args.symbol} (${args.days} days, ${candles.length} candles):\n` +
                `Trades: ${trades.length}\n` +
                `Win Rate: ${winRate.toFixed(1)}%\n` +
                `Total PnL: $${totalPnl.toFixed(2)}\n` +
                `Max Drawdown: $${maxDrawdown.toFixed(2)}\n` +
                `Average PnL/trade: $${(totalPnl / trades.length).toFixed(2)}`;
            }

            sendEvent("message", {
              delta:
                trades.length > 0
                  ? `✅ *Backtest Complete: ${winRate.toFixed(1)}% Win Rate over ${trades.length} trades, PnL: $${totalPnl.toFixed(2)}.*\n`
                  : `⚠️ *Backtest produced 0 trades — conditions may be too strict.*\n`,
            });

            sendEvent("tool_result", { id: tc.id, result: toolResult });
          } catch (e: any) {
            toolResult = `Backtest Failed: ${e.message}`;
            sendEvent("message", {
              delta: `\n\n❌ *Backtest error: ${e.message}*\n`,
            });
            sendEvent("tool_result", { id: tc.id, result: toolResult });
          }
        } else {
          toolResult = `Unknown tool: ${tc.name}`;
        }

        // Push tool result back into conversation for all tools except finalize_strategy
        if (tc.name !== "finalize_strategy") {
          conversation.push({
            role: "tool",
            tool_call_id: tc.id,
            content: toolResult,
          });
        }
      }

      if (shouldFinalize) break;
    }
  } catch (err: any) {
    logger.error({ err }, "AI Strategy Builder Error");
    sendEvent("error", { message: err.message || "An unexpected error occurred." });
  }

  // Save the assistant's final accumulated text
  if (fullAssistantMessage.trim().length > 0) {
    try {
      await db.insert(messagesTable).values({
        conversationId: activeConvId,
        role: "assistant",
        content: fullAssistantMessage,
      });
    } catch (dbErr) {
      logger.error({ dbErr }, "Failed to save assistant message");
    }
  }

  sendEvent("done", {});
  res.end();
});

export default router;
