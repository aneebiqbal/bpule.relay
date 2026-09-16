import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "cn";

type CtaProps = {
  href: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  quiet?: boolean;
};

export function RelayCta({ href, children, className, onClick, quiet }: CtaProps) {
  if (quiet) {
    return (
      <Link href={href} onClick={onClick} className={cn("relay-cta-quiet", className)}>
        {children}
      </Link>
    );
  }

  return (
    <Link href={href} onClick={onClick} className={cn("relay-cta", className)}>
      <span className="relay-cta-pulse" aria-hidden="true" />
      <span className="relative">{children}</span>
      <ArrowRight className="relay-cta-arrow relative size-4" aria-hidden="true" />
    </Link>
  );
}

export function RelayButton({
  children,
  className,
  onClick,
  type = "button",
  disabled,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cn("relay-cta", className)}>
      <span className="relay-cta-pulse" aria-hidden="true" />
      <span className="relative">{children}</span>
      <ArrowRight className="relay-cta-arrow relative size-4" aria-hidden="true" />
    </button>
  );
}
