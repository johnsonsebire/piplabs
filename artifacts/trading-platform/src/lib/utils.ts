import { clsx, type ClassValue } from "clsx"

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function getSymbolDisplayName(symbol: string): string {
  if (!symbol) return "";

  // Forex & Crypto formats like frxAUDCAD -> AUD/CAD
  if (symbol.startsWith("frx") || symbol.startsWith("cry")) {
    const pair = symbol.substring(3);
    if (pair.length === 6) {
      return `${pair.substring(0, 3)}/${pair.substring(3)}`;
    }
    return pair;
  }

  // Volatility Indices like R_10, R_100
  if (symbol.startsWith("R_")) {
    const num = symbol.substring(2);
    return `Volatility ${num} Index`;
  }

  // 1s Volatility Indices like 1HZ10V, 1HZ100V
  if (symbol.startsWith("1HZ") && symbol.endsWith("V")) {
    const num = symbol.substring(3, symbol.length - 1);
    return `Volatility ${num} (1s) Index`;
  }

  // Crash / Boom
  if (symbol.startsWith("CRASH")) {
    const num = symbol.substring(5);
    return `Crash ${num} Index`;
  }
  if (symbol.startsWith("BOOM")) {
    const num = symbol.substring(4);
    return `Boom ${num} Index`;
  }

  // Jump Indices
  if (symbol.startsWith("JD")) {
    const num = symbol.substring(2);
    return `Jump ${num} Index`;
  }

  // Step Indices
  if (symbol === "STEP") return "Step Index";
  if (symbol === "STEPINDEX") return "Step Index";

  // Others
  if (symbol === "SPC") return "S&P 500";
  if (symbol === "NDX") return "US Tech 100";
  if (symbol === "AS51") return "Australia 200";

  return symbol;
}
