import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The canonical conversations view is /relay. Redirect to avoid two competing
// implementations.
export default function ConversationsPage() {
  redirect("/relay");
}
