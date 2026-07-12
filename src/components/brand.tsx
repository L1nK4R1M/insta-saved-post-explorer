import { cn } from "@/lib/utils";

export const APP_LOGO_URL = process.env.NEXT_PUBLIC_APP_LOGO_URL?.trim() || "/api/brand/logo";

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("brand-lockup", compact && "brand-lockup-compact", className)}>
      {/* The configured route serves the replaceable source asset from resources/branding. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-logo" src={APP_LOGO_URL} alt="" width={40} height={40} />
      <span className="brand-name" aria-label="Insta Post Explorer">
        <span className="brand-insta">Insta</span>{" "}
        <span className="brand-post">Post</span>{" "}
        <span className="brand-explorer">Explorer</span>
      </span>
    </span>
  );
}
