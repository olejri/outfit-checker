"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { withUrls } from "@/lib/data";
import {
  CAPTURE_STEPS,
  CATEGORIES,
  SHAPE_CONTROLS,
  VIEWS,
  shapeWithDefaults,
  type Item,
  type ItemFit,
  type ItemWithUrl,
  type PhotoFit,
  type ShapeKey,
  type View,
} from "@/lib/types";
import { CropSheet } from "./CropSheet";

// three.js needs the browser, so the scene is never rendered on the server.
const FitScene = dynamic(() => import("@/components/three/FitScene"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted">Loading 3D model…</div>,
});

const VIEW_LABELS: Record<View, string> = { front: "Front", back: "Back", left: "Left", right: "Right" };
const STEP = 0.01;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function FitEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<ItemWithUrl | null | "missing">(null);
  const [fit, setFit] = useState<ItemFit>({});
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<"photos" | "shape">("photos");
  const [side, setSide] = useState<View>("front");
  const [cropping, setCropping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("items")
        .select("id, name, category, image_path, color, tags, views, fit, created_at")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) return setItem("missing");
      const [loaded] = await withUrls(supabase, [data as Item]).catch(() => []);
      if (!loaded) return setItem("missing");
      setItem(loaded);
      setFit(loaded.fit);
      setSide(CAPTURE_STEPS[loaded.category].find((v) => loaded.viewUrls[v]) ?? "front");
    })();
  }, [id]);

  if (item === "missing") {
    return (
      <div className="rounded-2xl bg-white p-6 text-center">
        <p className="mb-4 text-muted">This item couldn&apos;t be found.</p>
        <Link href="/wardrobe" className="btn-primary">Back to wardrobe</Link>
      </div>
    );
  }
  if (!item) return <p className="text-sm text-muted">Loading item…</p>;

  const sides = [...CAPTURE_STEPS[item.category], ...VIEWS].filter((v, i, all) => item.viewUrls[v] && all.indexOf(v) === i);
  const photo = fit.photos?.[side] ?? {};
  const shape = shapeWithDefaults(item.category, fit);
  const preview = { ...item, fit };

  function change(next: (f: ItemFit) => ItemFit) {
    setFit(next);
    setDirty(true);
  }

  function changePhoto(next: (p: PhotoFit) => PhotoFit) {
    change((f) => ({ ...f, photos: { ...f.photos, [side]: next(f.photos?.[side] ?? {}) } }));
  }

  function place(dx: number, dy: number, scale: number) {
    changePhoto((p) => {
      const [x, y] = p.offset ?? [0, 0];
      return { ...p, offset: [clamp(x + dx, -1, 1), clamp(y + dy, -1, 1)], scale: clamp((p.scale ?? 1) * scale, 0.2, 5) };
    });
  }

  function setShape(key: ShapeKey, value: number) {
    change((f) => ({ ...f, shape: { ...f.shape, [key]: value } }));
  }

  function leave() {
    if (dirty && !confirm("Leave without saving your changes?")) return;
    if (window.history.length > 1) router.back();
    else router.push("/wardrobe");
  }

  async function save() {
    setSaving(true);
    setError(null);
    const next: ItemFit = { ...fit, source: "manual" };
    const { error } = await createClient().from("items").update({ fit: next }).eq("id", id);
    setSaving(false);
    if (error) return setError(error.message);
    setDirty(false);
    if (window.history.length > 1) router.back();
    else router.push("/wardrobe");
  }

  const category = CATEGORIES.find((c) => c.id === item.category);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={leave} className="text-sm text-muted">
          ‹ Back
        </button>
        <h1 className="truncate text-lg font-bold">Fit · {item.name || category?.label}</h1>
        <button className="btn-primary shrink-0 px-4 py-2" disabled={saving || !dirty} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <p className="rounded-xl bg-white p-3 text-sm text-red-700">{error}</p>}

      <div className="relative -mx-4 h-[48dvh] min-h-72 overflow-hidden bg-canvas sm:mx-0 sm:rounded-3xl">
        <FitScene item={preview} side={side} mode={tab === "photos" && !cropping ? "place" : "orbit"} onPlace={place} />
        <p className="pointer-events-none absolute bottom-2 w-full text-center text-xs text-muted">
          {tab === "photos" ? "Drag to move the photo · pinch to resize" : "Drag to turn · pinch to zoom"}
        </p>
      </div>

      <div className="grid grid-cols-2 rounded-full border border-line bg-white p-1 text-sm">
        {(["photos", "shape"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full py-2 font-medium ${tab === t ? "bg-ink text-white" : "text-ink"}`}
          >
            {t === "photos" ? "Photo placement" : "Shape"}
          </button>
        ))}
      </div>

      {tab === "photos" ? (
        <div className="space-y-4">
          <div className="flex gap-2 overflow-x-auto">
            {sides.map((v) => (
              <button
                key={v}
                onClick={() => setSide(v)}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm ${
                  side === v ? "border-ink bg-ink text-white" : "border-line bg-white"
                }`}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <button onClick={() => setCropping(true)} className="checker h-24 w-24 shrink-0 rounded-2xl border border-line p-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
              <img src={item.viewUrls[side]} alt="" className="h-full w-full object-contain" />
            </button>
            <div className="flex-1 space-y-2">
              <button className="btn-ghost w-full py-2.5" onClick={() => setCropping(true)}>
                ✂️ Crop & straighten
              </button>
              <button
                className="btn-ghost w-full py-2.5"
                disabled={!fit.photos?.[side]}
                onClick={() =>
                  change((f) => {
                    const photos = { ...f.photos };
                    delete photos[side];
                    return { ...f, photos };
                  })
                }
              >
                Reset this side
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-2xl bg-white p-3">
            <div className="grid grid-cols-3 gap-1.5">
              <span />
              <Nudge label="Move up" onClick={() => place(0, STEP, 1)}>↑</Nudge>
              <span />
              <Nudge label="Move left" onClick={() => place(-STEP, 0, 1)}>←</Nudge>
              <Nudge label="Center" onClick={() => changePhoto((p) => ({ ...p, offset: [0, 0] }))}>•</Nudge>
              <Nudge label="Move right" onClick={() => place(STEP, 0, 1)}>→</Nudge>
              <span />
              <Nudge label="Move down" onClick={() => place(0, -STEP, 1)}>↓</Nudge>
              <span />
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <Nudge label="Bigger" onClick={() => place(0, 0, 1.03)}>＋</Nudge>
              <span className="text-xs tabular-nums text-muted">{Math.round((photo.scale ?? 1) * 100)}%</span>
              <Nudge label="Smaller" onClick={() => place(0, 0, 1 / 1.03)}>－</Nudge>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl bg-white p-4">
          {SHAPE_CONTROLS[item.category].map((c) => (
            <label key={c.key + c.label} className="block">
              <span className="mb-1 block text-sm font-medium">{c.label}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={shape[c.key]}
                onChange={(e) => setShape(c.key, Number(e.target.value))}
                className="w-full accent-accent"
              />
              <span className="flex justify-between text-xs text-muted">
                <span>{c.low}</span>
                <span>{c.high}</span>
              </span>
            </label>
          ))}
          <button
            className="btn-ghost w-full"
            disabled={!fit.shape}
            onClick={() =>
              change((f) => {
                const next = { ...f };
                delete next.shape;
                return next;
              })
            }
          >
            Reset shape
          </button>
        </div>
      )}

      {cropping && item.viewUrls[side] && (
        <CropSheet
          url={item.viewUrls[side]!}
          value={photo}
          onCancel={() => setCropping(false)}
          onDone={(next) => {
            changePhoto((p) => ({ ...p, ...next }));
            setCropping(false);
          }}
        />
      )}
    </div>
  );
}

function Nudge({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-canvas text-lg active:bg-line"
    >
      {children}
    </button>
  );
}
