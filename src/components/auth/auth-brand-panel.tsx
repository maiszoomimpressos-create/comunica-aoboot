import Link from "next/link";
import { siteConfig } from "@/config/site";

/**
 * Left panel of the (auth) split-screen shell. The "mesh of connected nodes"
 * motif is the platform's one recurring signature element — multiple
 * channels converging into a single plataforma — used sparingly here and in
 * the landing hero / empty states, nowhere else.
 */
export function AuthBrandPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-background lg:flex lg:w-1/2 lg:flex-col lg:justify-between lg:p-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 20% 15%, color-mix(in oklch, var(--primary) 22%, transparent), transparent 70%), radial-gradient(50% 40% at 85% 85%, color-mix(in oklch, var(--primary) 14%, transparent), transparent 70%)",
        }}
      />
      <MeshAccent />

      <Link href="/" className="relative z-10 text-lg font-semibold tracking-tight">
        {siteConfig.name}
      </Link>

      <div className="relative z-10 max-w-md">
        <h2 className="text-3xl font-semibold tracking-tight text-balance">
          {siteConfig.tagline}
        </h2>
        <p className="mt-4 text-muted-foreground text-balance">
          {siteConfig.description}
        </p>
      </div>
    </div>
  );
}

function MeshAccent() {
  const nodes = [
    [40, 60],
    [140, 30],
    [230, 90],
    [90, 160],
    [200, 200],
    [300, 140],
  ];
  return (
    <svg
      aria-hidden
      viewBox="0 0 340 260"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.35]"
    >
      {nodes.map(([x1, y1], i) =>
        nodes.slice(i + 1).map(([x2, y2], j) => (
          <line
            key={`${i}-${j}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="var(--primary)"
            strokeWidth="0.6"
            opacity={0.25}
          />
        ))
      )}
      {nodes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === 2 ? 5 : 3} fill="var(--primary)" />
      ))}
    </svg>
  );
}
