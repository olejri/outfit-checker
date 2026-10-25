"use client";

import dynamic from "next/dynamic";

// three.js needs the browser, so preview pictures are only drawn there.
export const OutfitSnapshots = dynamic(() => import("./three/SnapshotScene"), { ssr: false });
