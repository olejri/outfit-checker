import { Suspense } from "react";
import { OutfitList } from "./OutfitList";

export default function OutfitsPage() {
  return (
    <Suspense>
      <OutfitList />
    </Suspense>
  );
}
