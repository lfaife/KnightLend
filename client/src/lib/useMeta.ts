import { useEffect, useState } from "react";
import { api, type Meta } from "./api";

let cache: Promise<Meta> | null = null;

/** Reference data (categories, pickup spots, hold tiers...) loaded once per session. */
export function useMeta(): Meta | null {
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => {
    cache ??= api.meta().catch((e) => {
      cache = null;
      throw e;
    });
    let live = true;
    cache.then((m) => live && setMeta(m)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return meta;
}
