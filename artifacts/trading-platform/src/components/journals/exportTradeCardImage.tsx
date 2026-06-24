import { createRoot } from "react-dom/client";
import { JournalEntry } from "@workspace/api-client-react";
import { TradeCard } from "./TradeCard";
import html2canvas from "html2canvas";

export async function exportTradeCardImage(trade: JournalEntry) {
  // Create a container off-screen
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "-9999px";
  document.body.appendChild(container);

  const root = createRoot(container);
  
  // Render the component
  root.render(<TradeCard trade={trade} />);

  // Wait a bit for it to mount, render, and fonts to apply
  await new Promise(resolve => setTimeout(resolve, 300));

  try {
    const canvas = await html2canvas(container.firstChild as HTMLElement, {
      backgroundColor: null,
      scale: 2, // High resolution
      useCORS: true,
      logging: false,
    });

    const url = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = url;
    link.download = `Trade_${trade.symbol}_${new Date(trade.openTime).getTime()}.png`;
    link.click();
  } catch (error) {
    console.error("Failed to generate trade card", error);
  } finally {
    root.unmount();
    document.body.removeChild(container);
  }
}
