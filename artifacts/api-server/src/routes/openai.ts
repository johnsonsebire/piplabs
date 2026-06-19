import { Router, type IRouter } from "express";
import { eq, and, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db";
import {
  ListOpenaiConversationsResponse,
  CreateOpenaiConversationBody,
  GetOpenaiConversationParams,
  GetOpenaiConversationResponse,
  DeleteOpenaiConversationParams,
  ListOpenaiMessagesParams,
  ListOpenaiMessagesResponse,
  SendOpenaiMessageParams,
  SendOpenaiMessageBody,
  GenerateOpenaiImageBody,
  GenerateOpenaiImageResponse,
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

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

router.get("/openai/conversations", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const convs = await db.select().from(conversations).where(eq(conversations.userId, req.userId!));
  res.json(ListOpenaiConversationsResponse.parse(convs));
});

router.post("/openai/conversations", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = CreateOpenaiConversationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [conv] = await db.insert(conversations).values({
    userId: req.userId!,
    title: parsed.data.title ?? "New Conversation",
  }).returning();
  res.status(201).json(conv);
});

router.get("/openai/conversations/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const params = GetOpenaiConversationParams.safeParse({ id });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [conv] = await db.select().from(conversations)
    .where(and(eq(conversations.id, params.data.id), eq(conversations.userId, req.userId!)));
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
  res.json(GetOpenaiConversationResponse.parse(conv));
});

router.delete("/openai/conversations/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const params = DeleteOpenaiConversationParams.safeParse({ id });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [conv] = await db.delete(conversations)
    .where(and(eq(conversations.id, params.data.id), eq(conversations.userId, req.userId!)))
    .returning();
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
  res.sendStatus(204);
});

router.get("/openai/conversations/:id/messages", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const params = ListOpenaiMessagesParams.safeParse({ id });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const msgs = await db.select().from(messages)
    .where(eq(messages.conversationId, params.data.id))
    .orderBy(asc(messages.createdAt));
  res.json(ListOpenaiMessagesResponse.parse(msgs));
});

router.post("/openai/conversations/:id/messages", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = parseId(req.params.id);
  const params = SendOpenaiMessageParams.safeParse({ id });
  const body = SendOpenaiMessageBody.safeParse(req.body);
  if (!params.success || !body.success) { 
    req.log.error({ paramsError: params.error, bodyError: body.error }, "Invalid request payload");
    res.status(400).json({ error: "Invalid request" }); 
    return; 
  }

  const [conv] = await db.select().from(conversations)
    .where(and(eq(conversations.id, params.data.id), eq(conversations.userId, req.userId!)));
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

  await db.insert(messages).values({
    conversationId: params.data.id,
    role: "user",
    content: body.data.content,
  }).returning();

  const history = await db.select().from(messages)
    .where(eq(messages.conversationId, params.data.id))
    .orderBy(asc(messages.createdAt));
  const client = getOpenAIClient();

  let systemPrompt = "You are a helpful trading assistant specializing in PipLabs platform trading, technical analysis, and financial markets. Be extremely brief and concise in your responses. When analyzing a chart or providing trade suggestions, your response must clearly include at the very top:\n1. Asset: [analyzed asset name/symbol]\n2. Timeframe: [timeframe(s) considered in your decision]\n3. Direction: [BUY or SELL]\nThen strictly output the recommended Entry, Take Profit (TP), and Stop Loss (SL) levels clearly formatted, followed by a 1-2 sentence reasoning behind your decision.";
  if (body.data.contextPayload) {
    systemPrompt += `\n\n[USER CURRENT PLATFORM CONTEXT]:\n${body.data.contextPayload}\n\nUse this context (which includes multi-timeframe analysis) to inform your responses, as the user is currently viewing this data. Ensure you check the higher timeframes to make an unbiased and informed decision.`;
  }

  let assistantContent: string;
  try {
    const completion = await client.chat.completions.create({
      model: conv.model ?? "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        ...history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      ],
    });
    assistantContent = completion.choices[0]?.message?.content ?? "I could not generate a response.";
  } catch (err) {
    req.log.error({ err }, "OpenAI API error");
    res.status(502).json({ error: "AI service unavailable" });
    return;
  }

  const [assistantMsg] = await db.insert(messages).values({
    conversationId: params.data.id,
    role: "assistant",
    content: assistantContent,
  }).returning();

  res.status(201).json(assistantMsg);
});

router.post("/openai/analyze-trend", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { MultiTimeframeTrendInput, MultiTimeframeTrendOutput } = await import("@workspace/api-zod");
  const parsed = MultiTimeframeTrendInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { symbol, candleDepth, timeframesData } = parsed.data;

  const systemPrompt = `You are an expert quantitative trader and market analyst.
You will be provided with historical price data (OHLC) for multiple timeframes for the asset ${symbol}.
Your task is to analyze the data and determine:
1. The trend (bullish or bearish) and its strength (1 to 100) for each provided timeframe.
2. The overall market state (RANGING or TRENDING).
3. The overall volatility (Low, Medium, or High).
4. A brief 1-2 sentence reasoning for your conclusion.

Respond ONLY with valid JSON matching the exact schema requested.`;

  const userPrompt = `Asset: ${symbol}\nCandle Depth: ${candleDepth}\n\nTimeframes Data:\n${JSON.stringify(timeframesData, null, 2)}`;

  const client = getOpenAIClient();
  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const aiContent = completion.choices[0]?.message?.content || "{}";
    const result = JSON.parse(aiContent);
    res.json(MultiTimeframeTrendOutput.parse(result));
  } catch (err) {
    req.log.error({ err }, "OpenAI trend analysis error");
    res.status(502).json({ error: "Trend analysis service unavailable" });
  }
});

router.post("/openai/images", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = GenerateOpenaiImageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const client = getOpenAIClient();
  try {
    const response = await client.images.generate({
      model: "dall-e-3",
      prompt: parsed.data.prompt,
      size: (parsed.data.size as any) ?? "1024x1024",
      response_format: "b64_json",
    });
    const b64Json = response.data?.[0]?.b64_json ?? "";
    res.json(GenerateOpenaiImageResponse.parse({ b64_json: b64Json }));
  } catch (err) {
    req.log.error({ err }, "OpenAI image generation error");
    res.status(502).json({ error: "Image generation service unavailable" });
  }
});

export default router;
