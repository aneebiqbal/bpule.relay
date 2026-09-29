import { redirect } from "next/navigation";
import { requireProductAdmin } from "@/lib/auth/admin-page";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireProductAdmin();
  redirect("/admin/command-center");
}
