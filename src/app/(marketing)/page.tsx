import { Hero } from "@/components/marketing/hero";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { PricingTeaser } from "@/components/marketing/pricing-teaser";

// PricingTeaser reads Plan rows from the database — render this page at
// request time rather than prerendering it at build time. A build-time DB
// query makes every deploy depend on the database being reachable from the
// build machine, which is an unnecessary coupling (and the actual cause of
// a real deploy failure once already).
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <>
      <Hero />
      <FeatureGrid />
      <PricingTeaser />
    </>
  );
}
