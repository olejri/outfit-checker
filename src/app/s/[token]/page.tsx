import { Suspense } from "react";
import { SharedOutfit } from "./SharedOutfit";

export default function SharedOutfitPage() {
  return (
    <Suspense>
      <SharedOutfit />
    </Suspense>
  );
}
