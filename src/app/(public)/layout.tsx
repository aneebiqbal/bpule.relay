import type { ReactNode } from "react";
import { PublicNav } from "@/components/public-nav";
import { PublicFooter } from "@/components/public-footer";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bone">
      <PublicNav />
      <main className="flex-1 pt-14">{children}</main>
      <PublicFooter />
    </div>
  );
}
