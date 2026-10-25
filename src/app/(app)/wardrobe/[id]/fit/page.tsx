import { Suspense } from "react";
import { FitEditor } from "./FitEditor";

export default function FitPage() {
  return (
    <Suspense>
      <FitEditor />
    </Suspense>
  );
}
