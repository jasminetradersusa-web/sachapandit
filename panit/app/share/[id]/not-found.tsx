import { ShareNotFoundPage } from "@/components/share-not-found";

/** Ensures `notFound()` from this segment renders share-safe 404 (not the root layout). */
export default function ShareIdNotFound() {
  return <ShareNotFoundPage />;
}
