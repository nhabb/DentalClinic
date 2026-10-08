/** Inline error banner for failed loads and submits. */
export function ErrorNote({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-2xl border border-brick-200 bg-brick-50 px-4 py-3 text-sm font-medium text-brick-800">
      {message}
    </p>
  );
}
