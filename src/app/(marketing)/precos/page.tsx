import type { Metadata } from "next";
import { PricingTeaser } from "@/components/marketing/pricing-teaser";

export const metadata: Metadata = { title: "Preços" };

export default function PrecosPage() {
  return (
    <div className="py-8">
      <PricingTeaser />
    </div>
  );
}
