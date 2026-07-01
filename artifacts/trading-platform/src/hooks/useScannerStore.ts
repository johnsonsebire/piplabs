import { create } from "zustand";

const SCANNER_STRATEGY_KEY = "scanner_selected_strategy";
const SCANNER_AUTOSTART_KEY = "scanner_autostart";

export interface ScannerLog {
  time: string;
  msg: string;
  type: "info" | "alert" | "error" | "tick";
}

export interface LivePrice {
  price: number;
  prevPrice: number;
  change: number;
  pctChange: number;
}

interface ScannerState {
  isScanning: boolean;
  isConnected: boolean;
  livePrices: Record<string, LivePrice>;
  logs: ScannerLog[];
  selectedStrategyId: string;
  watchedSymbols: string[]; // symbols currently subscribed via WS

  // Actions
  setIsScanning: (v: boolean) => void;
  setIsConnected: (v: boolean) => void;
  setLivePrice: (symbol: string, price: LivePrice) => void;
  addLog: (msg: string, type?: ScannerLog["type"]) => void;
  clearLogs: () => void;
  setSelectedStrategyId: (id: string) => void;
  setWatchedSymbols: (symbols: string[]) => void;
}

export const useScannerStore = create<ScannerState>((set) => ({
  isScanning: false,
  isConnected: false,
  livePrices: {},
  logs: [],
  selectedStrategyId:
    typeof window !== "undefined"
      ? localStorage.getItem(SCANNER_STRATEGY_KEY) || ""
      : "",
  watchedSymbols: [],

  setIsScanning: (v) => set({ isScanning: v }),
  setIsConnected: (v) => set({ isConnected: v }),

  setLivePrice: (symbol, livePrice) =>
    set((state) => ({
      livePrices: { ...state.livePrices, [symbol]: livePrice },
    })),

  addLog: (msg, type = "info") =>
    set((state) => {
      const next = [
        ...state.logs,
        { time: new Date().toLocaleTimeString(), msg, type },
      ];
      return { logs: next.length > 200 ? next.slice(next.length - 200) : next };
    }),

  clearLogs: () => set({ logs: [] }),

  setSelectedStrategyId: (id) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(SCANNER_STRATEGY_KEY, id);
    }
    set({ selectedStrategyId: id });
  },

  setWatchedSymbols: (symbols) => set({ watchedSymbols: symbols }),
}));

export { SCANNER_STRATEGY_KEY, SCANNER_AUTOSTART_KEY };
