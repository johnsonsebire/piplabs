import { create } from "zustand";

interface AiContextState {
  globalContext: string | null;
  setGlobalContext: (context: string | null) => void;
}

export const useAiContext = create<AiContextState>((set) => ({
  globalContext: null,
  setGlobalContext: (context) => set({ globalContext: context }),
}));
