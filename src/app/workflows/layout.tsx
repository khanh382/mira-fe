import { Suspense } from "react";

export default function WorkflowsLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="p-4 text-sm text-zinc-500">Loading…</div>}>{children}</Suspense>;
}
