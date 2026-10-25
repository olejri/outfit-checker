"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/wardrobe", label: "Wardrobe", icon: "👚" },
  { href: "/studio", label: "Try on", icon: "🧍" },
  { href: "/outfits", label: "Outfits", icon: "✨" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-canvas/90 px-4 py-3 backdrop-blur">
        <Link href="/wardrobe" className="text-lg font-bold tracking-tight">
          Outfit Checker
        </Link>
        <button onClick={signOut} className="text-sm text-muted hover:text-ink">
          Sign out
        </button>
      </header>
      <main className="flex-1 px-4 pb-28 pt-4">{children}</main>
      {/* The URL is only known at request time on dynamic routes, so the nav streams in. */}
      <Suspense fallback={<Nav pathname="" />}>
        <CurrentNav />
      </Suspense>
    </div>
  );
}

function CurrentNav() {
  return <Nav pathname={usePathname()} />;
}

function Nav({ pathname }: { pathname: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-3xl grid-cols-3">
        {NAV.map((n) => {
          const active = pathname === n.href || pathname.startsWith(n.href + "/");
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <span className="text-xl leading-none">{n.icon}</span>
                {n.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
