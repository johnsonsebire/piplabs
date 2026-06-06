import { Router, type IRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import OpenAI from "openai";
import { fetchDerivCandles } from "../lib/derivHistory";
import { runBacktestOnCandles, computeMaxDrawdown, computeSharpe, parseStrategyLegs } from "../lib/backtestEngine";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { conversations, messages as messagesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function getOpenAIClient(): OpenAI {
  return new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
  });
}

const SYSTEM_PROMPT = `You are an expert quantitative developer and AI Trading Strategy Generator for the Deriv algorithmic trading platform.
Your task is to help the user build, optionally backtest, and optimize algorithmic trading strategies based on their natural language requests.

### Tool Instructions
You have access to two tools:
1. \`run_backtest\`: Call this ONLY if the user explicitly asks to backtest, test, or optimize the strategy. It simulates trading the strategy on historical data. Do NOT call this if the user just asks to "create" or "build" a strategy.
2. \`finalize_strategy\`: Call this when you are done iterating or immediately if no backtest was requested. You MUST call this to send the final strategy to the user.

### Strategy Code Schema (JSON)
The strategy \`code\` you generate must be a strict JSON string matching this structure:
{
  "buy": { "enabled": boolean, "sessions": ["asian"|"london"|"newyork"|"overlap_london_ny"], "marketFilters": [...], "triggers": [...], "confirmations": [...], "htf": {...}, "rangingFilter": {...}, "exit": "opposite"|"target"|"manual" },
  "sell": { "enabled": boolean, "sessions": ["asian"|"london"|"newyork"|"overlap_london_ny"], "marketFilters": [...], "triggers": [...], "confirmations": [...], "htf": {...}, "rangingFilter": {...}, "exit": "opposite"|"target"|"manual" },
  "riskManagement": { "winCooldown": {...}, "lossCooldown": {...} }
}

### Indicators & Operators
Available Indicators: EMA(N), SMA(N), WMA(N), RSI(N), CCI(N), ATR(N), ADX(N), MACD, MACD_SIGNAL, STOCH_K, STOCH_D, BB_UPPER, BB_LOWER, BB_MIDDLE, CLOSE
Operators: ">", "<", "==", ">=", "<=", "crosses above", "crosses below", "is rising", "is declining"
Condition Object: { "id": "unique_string", "indicatorA": "RSI(14)", "operator": ">", "indicatorB": "50" }

### Process
1. Analyze the user's request.
2. If they ask for backtesting/optimization, draft an initial strategy and call \`run_backtest\`. Review the results (Win Rate, PnL, Drawdown) and modify the parameters if needed (max 3 iterations).
3. Call \`finalize_strategy\` with the final JSON to end the conversation.
`;

router.post("/ai/strategy/generate", requireAuth, async (req: AuthenticatedRequest, res) => {
  const { messages, conversationId } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Invalid messages array" });
  }

  const userId = req.userId!;
  let activeConvId = conversationId;

  try {
    if (!activeConvId) {
      // Create new conversation
      const newTitle = messages[messages.length - 1]?.content.substring(0, 50) || "New Conversation";
      const [newConv] = await db.insert(conversations).values({
        userId,
        title: newTitle,
        model: "gpt-4o"
      }).returning();
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
    return res.status(500).json({ error: "Failed to setup conversation" });
  }

  // Setup SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  let sendEvent = (type: "message" | "tool_call" | "tool_result" | "final_strategy" | "error" | "done" | "conversation_id", data: any) => {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent("conversation_id", { id: activeConvId });

  const client = getOpenAIClient();
  const conversation: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages
  ];

  const tools: OpenAI.Chat.ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: "run_backtest",
        description: "Run a historical backtest for a strategy JSON to evaluate its performance.",
        parameters: {
          type: "object",
          properties: {
            strategyCode: { type: "string", description: "The stringified JSON of the strategy code." },
            symbol: { type: "string", description: "The Deriv symbol (e.g. R_100, R_50, 1HZ10V)." },
            timeframe: { type: "number", description: "Granularity in seconds (e.g., 60 for 1m, 300 for 5m)." },
            days: { type: "number", description: "Number of days of history to test (1 to 7)." }
          },
          required: ["strategyCode", "symbol", "timeframe", "days"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "finalize_strategy",
        description: "Finalize and present the generated strategy to the user. MUST be called to complete the request.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "A catchy name for the strategy." },
            description: { type: "string", description: "A short explanation of how the strategy works." },
            type: { type: "string", enum: ["vanilla_options", "forex", "multiplier", "universal"] },
            code: { type: "string", description: "The stringified JSON of the strategy code." }
          },
          required: ["name", "description", "type", "code"]
        }
      }
    }
  ];

  let iterations = 0;
  const maxIterations = 5;
  let fullAssistantMessage = "";

  const originalSendEvent = sendEvent;
  sendEvent = (type: any, data: any) => {
    if (type === "message" && data.delta) {
      fullAssistantMessage += data.delta;
    }
    originalSendEvent(type, data);
  };

  try {
    while (iterations < maxIterations) {
      iterations++;
      
      const stream = await client.chat.completions.create({
        model: "gpt-4o",
        messages: conversation,
        tools,
        tool_choice: "auto",
        stream: true,
      });

      let contentStr = "";
      let toolCallId = "";
      let toolName = "";
      let toolArgs = "";

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        
        if (delta?.content) {
          contentStr += delta.content;
          sendEvent("message", { delta: delta.content });
        }
        
        if (delta?.tool_calls) {
          const tc = delta.tool_calls[0];
          if (tc.id) toolCallId = tc.id;
          if (tc.function?.name) toolName = tc.function.name;
          if (tc.function?.arguments) {
            toolArgs += tc.function.arguments;
          }
        }
      }

      if (contentStr) {
        conversation.push({ role: "assistant", content: contentStr });
      }

      if (toolName) {
        conversation.push({
          role: "assistant",
          content: null,
          tool_calls: [{
            id: toolCallId,
            type: "function",
            function: { name: toolName, arguments: toolArgs }
          }]
        });

        sendEvent("tool_call", { name: toolName, arguments: toolArgs });

        if (toolName === "finalize_strategy") {
          // End loop, send final payload
          try {
            const args = JSON.parse(toolArgs);
            sendEvent("final_strategy", args);
          } catch (e) {
            sendEvent("error", { message: "Failed to parse finalize_strategy arguments" });
          }
          break;
        } 
        else if (toolName === "run_backtest") {
          try {
            const args = JSON.parse(toolArgs);
            sendEvent("message", { delta: `\n\n🔄 *Running backtest on ${args.symbol} for ${args.days} days...*\n` });
            
            // Execute backtest
            const nowSec = Math.floor(Date.now() / 1000);
            const fromSec = nowSec - (args.days * 24 * 60 * 60);
            const candles = await fetchDerivCandles(args.symbol, fromSec, nowSec, args.timeframe);
            
            if (candles.length < 50) {
              const errMsg = "Not enough candle data returned from Deriv.";
              sendEvent("tool_result", { id: toolCallId, result: errMsg });
              conversation.push({ role: "tool", tool_call_id: toolCallId, content: errMsg });
            } else {
              const params = { tradeType: "CALL", duration: 1, durationUnit: "m", stakePerTrade: 10, initialBalance: 1000 };
              const { trades } = await runBacktestOnCandles(candles, args.strategyCode, params, args.timeframe);
              
              const wins = trades.filter(t => t.pnl > 0).length;
              const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
              const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
              const maxDrawdown = computeMaxDrawdown(trades);
              
              const resultStr = `Backtest Results for ${args.symbol}:\nTrades: ${trades.length}\nWin Rate: ${winRate.toFixed(1)}%\nTotal PnL: $${totalPnl.toFixed(2)}\nMax Drawdown: $${maxDrawdown.toFixed(2)}`;
              
              sendEvent("message", { delta: `✅ *Backtest Complete: ${winRate.toFixed(1)}% Win Rate over ${trades.length} trades.*\n` });
              sendEvent("tool_result", { id: toolCallId, result: resultStr });
              conversation.push({ role: "tool", tool_call_id: toolCallId, content: resultStr });
            }
          } catch (e: any) {
            sendEvent("tool_result", { id: toolCallId, result: `Backtest Failed: ${e.message}` });
            conversation.push({ role: "tool", tool_call_id: toolCallId, content: `Backtest Failed: ${e.message}` });
          }
        }
      } else {
        // No tool called, we should exit
        break;
      }
    }
  } catch (err: any) {
    logger.error({ err }, "AI Strategy Generator Error");
    sendEvent("error", { message: err.message || "An unexpected error occurred." });
  }

  // Save the assistant's final accumulated message
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
