import { siteConfig } from "@/lib/site-config";

/**
 * JSON-LD structured data for Relay.
 * Implements Organization and SoftwareApplication schemas.
 */
export function RelayStructuredData() {
  const orgSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.name,
    url: siteConfig.origin,
    logo: `${siteConfig.origin}/icon.svg`,
    description: siteConfig.description,
    sameAs: [siteConfig.github, siteConfig.linkedin],
  };

  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: siteConfig.name,
    url: siteConfig.origin,
    applicationCategory: "BusinessApplication",
    description: siteConfig.description,
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };

  const webSiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    url: siteConfig.origin,
    description: siteConfig.description,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteSchema) }}
      />
    </>
  );
}
