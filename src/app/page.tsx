import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-12">
      <div className="text-6xl">👕👖👟</div>
      <div className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">Outfit Checker</h1>
        <p className="text-lg text-muted">
          Snap your clothes, sort them into a wardrobe, and try outfits on a 3D model before you get dressed.
        </p>
      </div>
      <ul className="space-y-2 text-muted">
        <li>📸 Take a photo or upload one. The background is removed on your phone.</li>
        <li>🗂️ Sort items into tops, bottoms, shoes and more.</li>
        <li>🧍 Mix and match on a 3D model, then save or share the look.</li>
      </ul>
      <Link href="/login" className="btn-primary text-base">
        Get started
      </Link>
    </main>
  );
}
