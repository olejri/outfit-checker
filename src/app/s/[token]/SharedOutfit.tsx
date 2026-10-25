"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { withUrls } from "@/lib/data";
import { SKIN_TONES, wear, type AvatarSettings, type Item, type Worn } from "@/lib/types";
import { AvatarView } from "@/components/AvatarView";

type Shared = { name: string; avatar: AvatarSettings; worn: Worn };

export function SharedOutfit() {
  const { token } = useParams<{ token: string }>();
  const [outfit, setOutfit] = useState<Shared | null | "missing">(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_shared_outfit", { token });
      if (error || !data) return setOutfit("missing");
      const items = await withUrls(supabase, (data.items as Item[]).map((i) => ({ ...i, tags: i.tags ?? [] }))).catch(() => []);
      setOutfit({ name: data.name, avatar: data.avatar ?? {}, worn: items.reduce(wear, {} as Worn) });
    })();
  }, [token]);

  if (outfit === "missing") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-6 text-center">
        <p className="text-4xl">🔒</p>
        <h1 className="text-xl font-bold">This outfit isn&apos;t shared</h1>
        <p className="text-muted">The owner may have turned off sharing.</p>
        <Link href="/" className="btn-primary">Make your own</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-dvh w-full max-w-3xl flex-col">
      <header className="flex items-center justify-between px-4 py-3">
        <h1 className="truncate text-lg font-bold">{outfit?.name ?? "Loading…"}</h1>
        <Link href="/" className="text-sm font-semibold text-accent">Outfit Checker</Link>
      </header>
      <div className="flex-1">
        {outfit && <AvatarView worn={outfit.worn} skin={outfit.avatar.skin ?? SKIN_TONES[1]} />}
      </div>
    </main>
  );
}
