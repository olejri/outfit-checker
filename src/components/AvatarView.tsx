"use client";

import dynamic from "next/dynamic";

// three.js needs the browser, so the scene is never rendered on the server.
export const AvatarView = dynamic(() => import("./three/AvatarScene"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted">Loading 3D model…</div>,
});
