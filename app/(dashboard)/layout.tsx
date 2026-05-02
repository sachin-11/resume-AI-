import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DashboardLayout } from "@/components/layout/dashboard-layout";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Candidates landing on /dashboard → redirect to candidate home
  // (This layout wraps all dashboard pages, so we just let it render)
  return <DashboardLayout>{children}</DashboardLayout>;
}
