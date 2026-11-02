import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

/**
 * Shown the instant the route is navigated to, before its code and data
 * arrive. Without it, the first visit to a patient's money page in
 * development (where the route is compiled on demand) showed nothing for
 * several seconds and read as stuck.
 */
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <LoadingSpinner label="Opening the money file" />
    </div>
  );
}
