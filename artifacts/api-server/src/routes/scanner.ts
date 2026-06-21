import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { usersTable } from "@workspace/db";
import { db } from "@workspace/db";
import { eq } from "drizzle-orm";
import OpenAI from "openai";

function getOpenAIClient(): OpenAI {
  return new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
  });
}

const router = Router();

router.post("/scanner/alert", requireAuth, async (req: any, res: any) => {
  try {
    const userId = req.userId;
    const { signal, payload } = req.body; // Expect payload to be defined by user's configuration

    if (!signal) {
      return res.status(400).json({ error: "Missing signal data" });
    }

    // Fetch user preferences
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const { scannerWebhookUrl, scannerEmailAlerts } = user;
    const results: any = { webhook: "skipped", email: "skipped" };

    // 1. Dispatch Webhook
    if (scannerWebhookUrl) {
      try {
        const webhookResponse = await fetch(scannerWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload || signal)
        });
        results.webhook = webhookResponse.ok ? "success" : `failed: ${webhookResponse.statusText}`;
      } catch (err: any) {
        results.webhook = `error: ${err.message}`;
      }
    }

    // 2. Dispatch Email Alert (Mock implementation for now)
    if (scannerEmailAlerts) {
      console.log(`[Email Alert Mock] Sending email to ${user.email} regarding signal:`, signal);
      results.email = "success (mocked)";
    }

    res.json({ success: true, results });
  } catch (error: any) {
    console.error("Error in /scanner/alert:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

router.post("/scanner/evaluate", requireAuth, async (req: any, res: any) => {
  try {
    const { prompt, symbol, direction } = req.body;
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });

    const client = getOpenAIClient();
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 150,
      temperature: 0.1, // Low temperature for consistent evaluation
    });

    const aiContent = completion.choices[0]?.message?.content || "";
    const lines = aiContent.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    const firstLine = lines[0]?.toUpperCase() || "";
    
    let result = "INVALID";
    if (firstLine.includes("VALID") && !firstLine.includes("INVALID")) {
      result = "VALID";
    }

    const reasoning = lines.slice(1).join(" ") || firstLine;

    res.json({ result, reasoning });
  } catch (error: any) {
    console.error("Error in /scanner/evaluate:", error);
    res.status(500).json({ error: "AI Evaluation failed" });
  }
});

export default router;
