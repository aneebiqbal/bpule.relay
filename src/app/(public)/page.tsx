import type { Metadata } from "next";
import { RelayLaunchPage } from "@/components/relay-launch-page";
import { RelayStructuredData } from "@/components/structured-data";
import { canonicalUrl, siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `${siteConfig.name} - Know what to do next`,
  description:
    "Studio creates demand. Relay captures it. One growth loop where AI prepares and people make the move.",
  alternates: { canonical: canonicalUrl("/") },
  openGraph: {
    title: `${siteConfig.name} - Know what to do next`,
    description:
      "Studio creates demand. Relay captures it. One growth loop where AI prepares and people make the move.",
    url: canonicalUrl("/"),
    images: [
      {
        url: canonicalUrl("/og"),
        width: siteConfig.ogImage.width,
        height: siteConfig.ogImage.height,
        alt: `${siteConfig.name} launch website`,
      },
    ],
  },
  twitter: {
    title: `${siteConfig.name} - Know what to do next`,
    description:
      "Studio creates demand. Relay captures it. One growth loop where AI prepares and people make the move.",
    images: [canonicalUrl("/og")],
  },
};

export default function LandingPage() {
  return (
    <>
      <RelayStructuredData />
      <RelayLaunchPage />
    </>
  );
}
