import type { Metadata } from "next";
import { RelayStructuredData } from "@/components/structured-data";
import { canonicalUrl, siteConfig } from "@/lib/site-config";
import { MarketingLandingPage } from "@/components/marketing/marketing-landing-page";

export const metadata: Metadata = {
  title: `${siteConfig.name} — Know what to do next`,
  description:
    "Your leads, conversations, opportunities and team activity are already telling you what matters. Relay connects the context and turns it into the next useful action.",
  alternates: { canonical: canonicalUrl("/") },
  openGraph: {
    title: `${siteConfig.name} — Know what to do next`,
    description:
      "Your leads, conversations, opportunities and team activity are already telling you what matters. Relay connects the context and turns it into the next useful action.",
    url: canonicalUrl("/"),
    images: [
      {
        url: canonicalUrl("/og"),
        width: siteConfig.ogImage.width,
        height: siteConfig.ogImage.height,
        alt: `${siteConfig.name} — Know what to do next`,
      },
    ],
  },
  twitter: {
    title: `${siteConfig.name} — Know what to do next`,
    description:
      "Your leads, conversations, opportunities and team activity are already telling you what matters. Relay connects the context and turns it into the next useful action.",
    images: [canonicalUrl("/og")],
  },
};

export default function LandingPage() {
  return (
    <>
      <RelayStructuredData />
      <MarketingLandingPage />
    </>
  );
}
