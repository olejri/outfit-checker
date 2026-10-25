"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BUCKET } from "@/lib/data";
import { downscale, removeBackground, trimAndAnalyse } from "@/lib/image";
import { CATEGORIES, type Category } from "@/lib/types";

type Stage =
  | { kind: "pick" }
  | { kind: "working"; label: string; progress: number }
  | { kind: "review"; blob: Blob; preview: string; color: string }
  | { kind: "saving" };

export default function NewItemPage() {
  const router = useRouter();
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: "pick" });
  const [original, setOriginal] = useState<Blob | null>(null);
  const [cutout, setCutout] = useState(true);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("tops");
  const [error, setError] = useState<string | null>(null);

  const preview = stage.kind === "review" ? stage.preview : null;
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function process(file: Blob, removeBg: boolean) {
    setError(null);
    setStage({ kind: "working", label: "Preparing photo", progress: 0 });
    try {
      const small = await downscale(file);
      const png = removeBg
        ? await removeBackground(small, (label, progress) => setStage({ kind: "working", label, progress }))
        : await toPng(small);
      const { blob, color } = await trimAndAnalyse(png);
      setStage({ kind: "review", blob, preview: URL.createObjectURL(blob), color });
    } catch (e) {
      console.error(e);
      setError(
        removeBg
          ? "Background removal failed on this device. You can save the photo without removing it."
          : e instanceof Error ? e.message : "Could not process that photo.",
      );
      setStage({ kind: "pick" });
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setOriginal(file);
    process(file, cutout);
  }

  async function save() {
    if (stage.kind !== "review") return;
    const { blob, color } = stage;
    setStage({ kind: "saving" });
    setError(null);
    const supabase = createClient();
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("You are signed out. Please sign in again.");
      const path = `${auth.user.id}/${crypto.randomUUID()}.png`;
      const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/png" });
      if (up.error) throw up.error;
      const { error } = await supabase.from("items").insert({ name: name.trim(), category, image_path: path, color });
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw error;
      }
      router.push("/wardrobe");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saving failed.");
      setStage({ kind: "review", blob, preview: URL.createObjectURL(blob), color });
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Add an item</h1>

      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={onFile} />

      {stage.kind === "pick" && (
        <div className="space-y-4">
          <p className="text-muted">
            Lay the item flat or hang it against a plain wall, with good light. The whole piece should be in the frame.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button className="btn-primary h-28 flex-col rounded-2xl text-base" onClick={() => cameraInput.current?.click()}>
              <span className="text-3xl">📸</span>Take photo
            </button>
            <button className="btn-ghost h-28 flex-col rounded-2xl text-base" onClick={() => fileInput.current?.click()}>
              <span className="text-3xl">🖼️</span>Upload
            </button>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={cutout} onChange={(e) => setCutout(e.target.checked)} className="h-5 w-5 accent-accent" />
            Remove the background automatically
          </label>
          {error && (
            <div className="rounded-xl bg-white p-3 text-sm text-red-700">
              {error}
              {original && cutout && (
                <button className="mt-2 block font-semibold underline" onClick={() => process(original, false)}>
                  Use the photo as it is
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {stage.kind === "working" && (
        <div className="space-y-3 rounded-2xl bg-white p-6 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-line border-t-accent" />
          <p className="font-medium">{stage.label}…</p>
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(stage.progress * 100)}%` }} />
          </div>
          <p className="text-xs text-muted">This runs on your device. Your photo is not sent anywhere until you save.</p>
        </div>
      )}

      {(stage.kind === "review" || stage.kind === "saving") && (
        <div className="space-y-4">
          {stage.kind === "review" && (
            <div className="checker relative aspect-square overflow-hidden rounded-2xl border border-line p-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img src={stage.preview} alt="Preview" className="h-full w-full object-contain" />
              <span className="absolute bottom-3 right-3 h-7 w-7 rounded-full border-2 border-white shadow" style={{ background: stage.color }} title="Detected colour" />
            </div>
          )}
          <input className="input" placeholder="Name (e.g. White linen shirt)" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid grid-cols-4 gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`flex flex-col items-center rounded-xl border px-1 py-2 text-xs ${
                  category === c.id ? "border-accent bg-accent/10 font-semibold" : "border-line bg-white"
                }`}
              >
                <span className="text-xl">{c.emoji}</span>
                {c.label}
              </button>
            ))}
          </div>
          {error && <p className="rounded-xl bg-white p-3 text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setStage({ kind: "pick" })} disabled={stage.kind === "saving"}>
              Retake
            </button>
            <button className="btn-primary flex-1" onClick={save} disabled={stage.kind === "saving"}>
              {stage.kind === "saving" ? "Saving…" : "Save to wardrobe"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

async function toPng(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), "image/png"));
}
