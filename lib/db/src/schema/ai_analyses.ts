import { pgTable, text, integer, real, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aiRecommendationEnum = pgEnum("ai_recommendation", ["confirm", "reject", "wait", "caution"]);
export const aiRiskLevelEnum = pgEnum("ai_risk_level", ["low", "medium", "high"]);

export const aiAnalysesTable = pgTable("ai_analyses", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tradeId: integer("trade_id"),
  symbol: text("symbol").notNull(),
  tradeType: text("trade_type").notNull(),
  direction: text("direction"),
  recommendation: aiRecommendationEnum("recommendation").notNull(),
  confidence: real("confidence").notNull(),
  reasoning: text("reasoning").notNull(),
  keySignals: text("key_signals").notNull(),
  riskLevel: aiRiskLevelEnum("risk_level").notNull(),
  suggestedEntry: real("suggested_entry"),
  suggestedTarget: real("suggested_target"),
  suggestedStopLoss: real("suggested_stop_loss"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAIAnalysisSchema = createInsertSchema(aiAnalysesTable);
export type InsertAIAnalysis = z.infer<typeof insertAIAnalysisSchema>;
export type AIAnalysis = typeof aiAnalysesTable.$inferSelect;
