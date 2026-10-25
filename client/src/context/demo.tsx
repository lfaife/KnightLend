import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type Health } from "../lib/api";

interface DemoState {
  health: Health | null;
  /** Changes whenever the demo user or clock changes, so pages reload their data. */
  tick: number;
  bump: () => void;
  refreshHealth: () => Promise<void>;
}

const DemoContext = createContext<DemoState | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [tick, setTick] = useState(0);
  const refreshHealth = useCallback(async () => {
    try {
      setHealth(await api.health());
    } catch {
      setHealth(null);
    }
  }, []);
  useEffect(() => {
    refreshHealth();
  }, [refreshHealth]);
  const bump = useCallback(() => {
    setTick((t) => t + 1);
    refreshHealth();
  }, [refreshHealth]);
  const value = useMemo(() => ({ health, tick, bump, refreshHealth }), [health, tick, bump, refreshHealth]);
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoState {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used inside DemoProvider");
  return ctx;
}
