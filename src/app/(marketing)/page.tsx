import { Hero } from "@/components/marketing/hero";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { PricingTeaser } from "@/components/marketing/pricing-teaser";

export default function HomePage() {
  return (
    <>
      <Hero />
      <FeatureGrid />
      <PricingTeaser />
    </>
  );
}
