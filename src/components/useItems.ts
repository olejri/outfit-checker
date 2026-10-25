"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadItems } from "@/lib/data";
import type { ItemWithUrl } from "@/lib/types";

export function useItems() {
  const [items, setItems] = useState<ItemWithUrl[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setItems(await loadItems(createClient()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your wardrobe.");
      setItems([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    reload();
  }, [reload]);

  return { items, setItems, error, reload };
}
