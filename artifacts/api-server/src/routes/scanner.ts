import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { usersTable } from "@workspace/db";
import { db } from "@workspace/db";
import { eq } from "drizzle-orm";
// Assume using some fetch or axios for webhooks, and perhaps logging for emails

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

export default router;
