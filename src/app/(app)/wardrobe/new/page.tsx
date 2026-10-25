"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BUCKET } from "@/lib/data";
import { downscale, removeBackground, trimAndAnalyse } from "@/lib/image";
import { CAPTURE_STEPS, CATEGORIES, allTags, type Category, type View } from "@/lib/types";
import { TagEditor } from "@/components/Tags";

type Shot = { blob: Blob; preview: string; color: string };

type Stage =
  | { kind: "category" }
  | { kind: "capture"; step: number }
  | { kind: "working"; step: number; label: string; progress: number }
  | { kind: "details" }
  | { kind: "saving" };

const VIEW_LABELS: Record<View, string> = { front: "Front", back: "Back", left: "Left side", right: "Right side" };

/** What to photograph at each step. */
function instructions(category: Category, view: View) {
  if (category === "shoes") {
    return {
      front: "From the front, with the toe pointing at you.",
      back: "From behind, with the heel pointing at you.",
      left: "From the side, with the toe pointing left. Lay it on the floor and shoot from its level.",
      right: "The other side, with the toe pointing right.",
    }[view];
  }
  return {
    front: "Lay it flat or hang it against a plain wall, front facing you, with the whole piece in the frame.",
    back: "Turn it around and photograph the back the same way.",
    left: "Turn it so its front points to your left. Easiest on a hanger or a chair; skip it if the item lies flat.",
    right: "Turn it so its front points to your right.",
  }[view];
}

export default function NewItemPage() {
  const router = useRouter();
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: "category" });
  const [category, setCategory] = useState<Category>("tops");
  const [shots, setShots] = useState<Partial<Record<View, Shot>>>({});
  const [original, setOriginal] = useState<Blob | null>(null);
  const [cutout, setCutout] = useState(true);
  const [name, setName] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const steps = CAPTURE_STEPS[category];
  const main = shots[steps[0]];

  useEffect(() => {
    createClient()
      .from("items")
      .select("tags")
      .then(({ data }) => setKnownTags(allTags((data as { tags: string[] }[]) ?? [])));
  }, []);

  // Free the local previews when leaving the page.
  const shotsRef = useRef(shots);
  useEffect(() => { shotsRef.current = shots; }, [shots]);
  useEffect(() => () => Object.values(shotsRef.current).forEach((s) => URL.revokeObjectURL(s.preview)), []);

  function setShot(view: View, shot: Shot | null) {
    setShots((all) => {
      const next = { ...all };
      if (next[view]) URL.revokeObjectURL(next[view].preview);
      if (shot) next[view] = shot;
      else delete next[view];
      return next;
    });
  }

  /** After a step, go to the next one that has no photo yet, or to the details. */
  function advance(from: number, taken: Partial<Record<View, Shot>>) {
    const next = steps.findIndex((v, i) => i > from && !taken[v]);
    setStage(next === -1 ? { kind: "details" } : { kind: "capture", step: next });
  }

  function chooseCategory(c: Category) {
    Object.values(shots).forEach((s) => URL.revokeObjectURL(s.preview));
    setShots({});
    setCategory(c);
    setError(null);
    setStage({ kind: "capture", step: 0 });
  }

  async function process(step: number, file: Blob, removeBg: boolean) {
    setError(null);
    setStage({ kind: "working", step, label: "Preparing photo", progress: 0 });
    try {
      const small = await downscale(file);
      const png = removeBg
        ? await removeBackground(small, (label, progress) => setStage({ kind: "working", step, label, progress }))
        : await toPng(small);
      const { blob, color } = await trimAndAnalyse(png);
      const shot = { blob, preview: URL.createObjectURL(blob), color };
      setShot(steps[step], shot);
      setOriginal(null);
      advance(step, { ...shots, [steps[step]]: shot });
    } catch (e) {
      console.error(e);
      setError(
        removeBg
          ? "Background removal failed on this device. You can use the photo without removing it."
          : e instanceof Error ? e.message : "Could not process that photo.",
      );
      setStage({ kind: "capture", step });
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || stage.kind !== "capture") return;
    setOriginal(file);
    process(stage.step, file, cutout);
  }

  async function save() {
    if (!main) return;
    setStage({ kind: "saving" });
    setError(null);
    const supabase = createClient();
    const uploaded: string[] = [];
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("You are signed out. Please sign in again.");
      const views: Partial<Record<View, string>> = {};
      for (const view of steps) {
        const shot = shots[view];
        if (!shot) continue;
        const path = `${auth.user.id}/${crypto.randomUUID()}.png`;
        const up = await supabase.storage.from(BUCKET).upload(path, shot.blob, { contentType: "image/png" });
        if (up.error) throw up.error;
        uploaded.push(path);
        views[view] = path;
      }
      const { error } = await supabase
        .from("items")
        .insert({ name: name.trim(), category, image_path: views[steps[0]], color: main.color, tags, views });
      if (error) throw error;
      router.push("/wardrobe");
      router.refresh();
    } catch (e) {
      if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
      setError(e instanceof Error ? e.message : "Saving failed.");
      setStage({ kind: "details" });
    }
  }

  const step = stage.kind === "capture" || stage.kind === "working" ? stage.step : -1;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Add an item</h1>

      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={onFile} />

      {stage.kind === "category" && (
        <div className="space-y-3">
          <p className="text-muted">What are you adding? You will then take a few photos from different sides so it looks right in 3D.</p>
          <CategoryPicker onChange={chooseCategory} />
        </div>
      )}

      {stage.kind !== "category" && (
        <ShotStrip
          steps={steps}
          shots={shots}
          current={step}
          onPick={(i) => { setError(null); setStage({ kind: "capture", step: i }); }}
          disabled={stage.kind === "working" || stage.kind === "saving"}
        />
      )}

      {stage.kind === "capture" && (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Photo {step + 1} of {steps.length}
              {step > 0 && " · optional"}
            </p>
            <h2 className="text-lg font-bold">{VIEW_LABELS[steps[step]]}</h2>
            <p className="text-muted">{instructions(category, steps[step])}</p>
          </div>
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
                <button className="mt-2 block font-semibold underline" onClick={() => process(step, original, false)}>
                  Use the photo as it is
                </button>
              )}
            </div>
          )}
          <div className="flex gap-2">
            {step === 0 ? (
              <button className="btn-ghost" onClick={() => setStage({ kind: "category" })}>
                Change type
              </button>
            ) : (
              <>
                {shots[steps[step]] && (
                  <button className="btn-ghost" onClick={() => setShot(steps[step], null)}>
                    Remove photo
                  </button>
                )}
                <button className="btn-ghost flex-1" onClick={() => advance(step, shots)}>
                  {shots[steps[step]] ? "Keep this photo" : "Skip this side"}
                </button>
              </>
            )}
            {main && (
              <button className="btn-ghost" onClick={() => setStage({ kind: "details" })}>
                Done
              </button>
            )}
          </div>
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

      {(stage.kind === "details" || stage.kind === "saving") && main && (
        <div className="space-y-4">
          <div className="checker relative aspect-square overflow-hidden rounded-2xl border border-line p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
            <img src={main.preview} alt="Preview" className="h-full w-full object-contain" />
            <span className="absolute bottom-3 right-3 h-7 w-7 rounded-full border-2 border-white shadow" style={{ background: main.color }} title="Detected colour" />
          </div>
          <p className="text-sm text-muted">
            {CATEGORIES.find((c) => c.id === category)?.emoji} {CATEGORIES.find((c) => c.id === category)?.label} ·{" "}
            {Object.keys(shots).length} of {steps.length} sides photographed. Tap a side above to add or retake it.
          </p>
          <input className="input" placeholder="Name (e.g. White linen shirt)" value={name} onChange={(e) => setName(e.target.value)} />
          <div>
            <p className="mb-2 text-sm font-medium">Tags</p>
            <TagEditor value={tags} onChange={setTags} extra={knownTags} />
          </div>
          {error && <p className="rounded-xl bg-white p-3 text-sm text-red-700">{error}</p>}
          <button className="btn-primary w-full" onClick={save} disabled={stage.kind === "saving"}>
            {stage.kind === "saving" ? "Saving…" : "Save to wardrobe"}
          </button>
        </div>
      )}
    </div>
  );
}

function CategoryPicker({ onChange }: { onChange: (c: Category) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {CATEGORIES.map((c) => (
        <button
          key={c.id}
          onClick={() => onChange(c.id)}
          className="flex flex-col items-center rounded-xl border border-line bg-white px-1 py-3 text-xs"
        >
          <span className="text-2xl">{c.emoji}</span>
          {c.label}
        </button>
      ))}
    </div>
  );
}

/** One tile per side: the photo once taken, otherwise a placeholder. Tap to (re)take. */
function ShotStrip({
  steps,
  shots,
  current,
  onPick,
  disabled,
}: {
  steps: View[];
  shots: Partial<Record<View, Shot>>;
  current: number;
  onPick: (step: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {steps.map((view, i) => {
        const shot = shots[view];
        return (
          <button
            key={view}
            onClick={() => onPick(i)}
            disabled={disabled}
            className={`flex flex-col items-center gap-1 rounded-xl border p-1.5 text-[11px] ${
              i === current ? "border-accent bg-accent/10 font-semibold" : "border-line bg-white"
            }`}
          >
            <span className="checker flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg">
              {shot ? (
                // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                <img src={shot.preview} alt="" className="h-full w-full object-contain" />
              ) : (
                <span className="text-lg text-muted">{i === 0 ? "＋" : "·"}</span>
              )}
            </span>
            {VIEW_LABELS[view]}
          </button>
        );
      })}
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
