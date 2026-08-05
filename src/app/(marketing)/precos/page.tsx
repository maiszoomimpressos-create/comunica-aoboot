import type { Metadata } from "next";
import { PricingTeaser } from "@/components/marketing/pricing-teaser";

export const metadata: Metadata = { title: "Preços" };

// See (marketing)/page.tsx for why this is request-time, not build-time.
export const dynamic = "force-dynamic";

export default function PrecosPage() {
  return (
    <div className="py-8">
      <PricingTeaser />
    </div>
  );
}
