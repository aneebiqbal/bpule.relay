import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current";
import { GrowthDashboard } from "@/components/admin/growth-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminGrowthPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.rep.role !== "admin") redirect("/");

  return <GrowthDashboard />;
}
