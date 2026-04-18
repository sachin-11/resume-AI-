"use client";
import dynamic from "next/dynamic";
import { ErrorBoundary } from "@/components/error-boundary";

// Sidebar must be client-only — it uses useSession which causes hydration mismatch on SSR
const Sidebar = dynamic(() => import("./sidebar").then((m) => ({ default: m.Sidebar })), { ssr: false });

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-4 pt-16 lg:pt-6 lg:p-6 lg:px-8">
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
