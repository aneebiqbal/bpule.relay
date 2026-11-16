import { redirect } from "next/navigation";
import { requireProductAdmin } from "@/lib/auth/admin-page";

export const dynamic = "force-dynamic";

/**
 * Admin landing. People & Roles is the first administrative surface; the Team
 * command center lives at /team and is not an Admin page.
 */
export default async function AdminPage() {
  await requireProductAdmin();
  redirect("/admin/people");
}
