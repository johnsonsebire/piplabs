import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { aiAnalysesTable } from "@workspace/db";
import {
  AnalyzeWithAIBody,
  AnalyzeWithAIResponse,
  ListAIAnalysesQueryParams,
  ListAIAnalysesResponse,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import OpenAI from "openai";

const router: IRouter = Router();

function getOpenAIClient(): OpenAI {
  return new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
  });
}

router.post("/ai/analyze", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = AnalyzeWithAIBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { symbol, tradeType, direction, indicatorData, timeframe, additionalContext, chartScreenshot } = parsed.data;

  const systemPrompt = `You are an expert financial trading analyst for the Deriv trading platform. 
You analyze market data and provide trading recommendations for Vanilla Options, Forex, and Multiplier contracts.
Always respond in valid JSON with this exact structure:
{
  "recommendation": "confirm" | "reject" | "wait" | "caution",
  "confidence": number between 0 and 1,
  "reasoning": "detailed explanation",
  "keySignals": "comma-separated list of key signals",
  "riskLevel": "low" | "medium" | "high",
  "suggestedEntry": number or null,
  "suggestedTarget": number or null,
  "suggestedStopLoss": number or null
}

IMPORTANT: In the 'reasoning' field, you must clearly start by specifying the Asset name and the Timeframe(s) considered, in the format: 'Asset: [Asset Name], Timeframe: [Timeframe]. [Detailed explanation...]'`;

  const userPrompt = `Analyze the following trade setup:
Asset: ${symbol}
Trade Type: ${tradeType}
Direction: ${direction ?? "not specified"}
Timeframe: ${timeframe ?? "not specified"}
Indicator Data: ${indicatorData ?? "none provided"}
Additional Context: ${additionalContext ?? "none"}

Provide a trading recommendation based on this information.`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  if (chartScreenshot) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: userPrompt },
        {
          type: "image_url",
          image_url: { url: chartScreenshot, detail: "high" },
        },
      ],
    });
  } else {
    messages.push({ role: "user", content: userPrompt });
  }

  const client = getOpenAIClient();

  let analysisResult: {
    recommendation: "confirm" | "reject" | "wait" | "caution";
    confidence: number;
    reasoning: string;
    keySignals: string;
    riskLevel: "low" | "medium" | "high";
    suggestedEntry: number | null;
    suggestedTarget: number | null;
    suggestedStopLoss: number | null;
  };

  try {
    const completion = await client.chat.completions.create({
      model: chartScreenshot ? "gpt-4o" : "gpt-4o-mini",
      messages,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content ?? "{}";
    const raw = JSON.parse(content);
    analysisResult = {
      recommendation: raw.recommendation ?? "wait",
      confidence: Math.min(1, Math.max(0, raw.confidence ?? 0.5)),
      reasoning: raw.reasoning ?? "Analysis incomplete",
      keySignals: raw.keySignals ?? "",
      riskLevel: raw.riskLevel ?? "medium",
      suggestedEntry: raw.suggestedEntry ?? null,
      suggestedTarget: raw.suggestedTarget ?? null,
      suggestedStopLoss: raw.suggestedStopLoss ?? null,
    };
  } catch (err) {
    req.log.error({ err }, "OpenAI API error during trade analysis");
    res.status(502).json({ error: "AI analysis service unavailable" });
    return;
  }

  const [analysis] = await db.insert(aiAnalysesTable).values({
    tradeId: parsed.data.tradeId ?? null,
    symbol,
    tradeType,
    direction: direction ?? null,
    recommendation: analysisResult.recommendation,
    confidence: analysisResult.confidence,
    reasoning: analysisResult.reasoning,
    keySignals: analysisResult.keySignals,
    riskLevel: analysisResult.riskLevel,
    suggestedEntry: analysisResult.suggestedEntry,
    suggestedTarget: analysisResult.suggestedTarget,
    suggestedStopLoss: analysisResult.suggestedStopLoss,
  }).returning();

  res.status(201).json(AnalyzeWithAIResponse.parse(analysis));
});

router.get("/ai/analyses", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = ListAIAnalysesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { symbol, limit = 20 } = params.data;
  const conditions = [];
  if (symbol) conditions.push(eq(aiAnalysesTable.symbol, symbol));

  const analyses = conditions.length > 0
    ? await db.select().from(aiAnalysesTable).where(and(...conditions)).orderBy(desc(aiAnalysesTable.createdAt)).limit(limit)
    : await db.select().from(aiAnalysesTable).orderBy(desc(aiAnalysesTable.createdAt)).limit(limit);

  res.json(ListAIAnalysesResponse.parse(analyses));
});

export default router;
