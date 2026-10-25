import { Suspense } from "react";
import { Studio } from "./Studio";

export default function StudioPage() {
  return (
    <Suspense>
      <Studio />
    </Suspense>
  );
}
