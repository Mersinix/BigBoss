import { useEffect, useState } from "react";
import type { ServiceHeroConfig } from "@/hooks/use-service-hero-config";

// Shared rendering for the Admin-customizable part of every Coffee-Owner-
// facing service hero (SHOP/BARISTA/ACADEMY/MAINTENANCE/PRINT/MARKETING).
// Each page keeps its own icon/title/subtitle-default/info-row content —
// this only centralizes background (image rotation or gradient, falling
// back to the page's own existing default), height, and alignment so the
// six heroes don't each re-implement the same logic slightly differently.
// Precedence when both a gradient and background images are configured:
// the gradient wins (explicit admin choice overrides photos).

export const HERO_HEIGHT_PADDING: Record<ServiceHeroConfig["height"], string> = {
  compact: "pt-4 pb-6",
  medium: "pt-5 pb-12",
  large: "pt-8 pb-20",
};
const HERO_MIN_HEIGHT: Record<ServiceHeroConfig["height"], string> = {
  compact: "",
  medium: "",
  large: "min-h-[22rem]",
};
const H_ALIGN_WRAP: Record<ServiceHeroConfig["horizontalAlign"], string> = {
  left: "mx-0 text-left",
  center: "mx-auto text-center",
  right: "ml-auto text-right",
};
const H_ALIGN_ITEMS: Record<ServiceHeroConfig["horizontalAlign"], string> = {
  left: "items-start",
  center: "items-center",
  right: "items-end",
};
export const H_ALIGN_ICON_MX: Record<ServiceHeroConfig["horizontalAlign"], string> = {
  left: "mx-0",
  center: "mx-auto",
  right: "ml-auto",
};
export const H_ALIGN_ROW_JUSTIFY: Record<ServiceHeroConfig["horizontalAlign"], string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};
const V_JUSTIFY: Record<ServiceHeroConfig["verticalAlign"], string> = {
  top: "justify-start",
  center: "justify-center",
  bottom: "justify-end",
};

function isValidHexColor(c: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(c.trim());
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = isValidHexColor(hex) ? hex.trim() : "#000000";
  const r = parseInt(clean.slice(1, 3), 16);
  const g = parseInt(clean.slice(3, 5), 16);
  const b = parseInt(clean.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

// Subtitle text color override (Part 2.2) — each page renders its own
// subtitle <p>, so this just computes the style to merge onto it; an
// invalid/empty saved color safely falls back to the page's own existing
// Tailwind text-color classes (no inline style applied at all).
export function getHeroSubtitleColorStyle(config: ServiceHeroConfig, isDark: boolean): React.CSSProperties {
  const raw = isDark ? config.subtitleColorDark : config.subtitleColorLight;
  if (raw && isValidHexColor(raw)) return { color: raw.trim() };
  return {};
}

export function ServiceHeroBackground({ config, defaultBackground }: { config: ServiceHeroConfig; defaultBackground: React.ReactNode }) {
  const images = (config.backgroundImages ?? []).filter((u) => !!u && u.trim().length > 0);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    if (images.length < 2) return;
    const ms = Math.max(2, config.rotationIntervalSeconds || 6) * 1000;
    const id = setInterval(() => setIndex((i) => (i + 1) % images.length), ms);
    return () => clearInterval(id);
  }, [images.join("|"), config.rotationIntervalSeconds]);

  if (config.gradientEnabled && (config.gradientFrom.trim() || config.gradientTo.trim())) {
    const from = config.gradientFrom.trim() || "#111827";
    const via = config.gradientVia.trim() || from;
    const to = config.gradientTo.trim() || from;
    return (
      <div
        className="absolute inset-0"
        style={{ backgroundImage: `linear-gradient(${config.gradientDirection || "to bottom right"}, ${from}, ${via}, ${to})` }}
      />
    );
  }

  if (images.length > 0) {
    // Configurable overlay (Part 3) — defaults (enabled, black, 30%) match
    // the overlay this branch previously always rendered unconditionally,
    // so an unconfigured service's appearance is unchanged.
    const overlayOn = config.overlayEnabled !== false;
    const overlayAlpha = (config.overlayOpacity ?? 30) / 100;
    return (
      <>
        {images.map((url, i) => (
          <div
            key={`${url}-${i}`}
            className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000"
            style={{ backgroundImage: `url("${url}")`, opacity: i === index ? 1 : 0 }}
          />
        ))}
        {overlayOn && (
          <div className="absolute inset-0" style={{ backgroundColor: hexToRgba(config.overlayColor || "#000000", overlayAlpha) }} />
        )}
      </>
    );
  }

  return <>{defaultBackground}</>;
}

export function ServiceHeroShell({
  config,
  defaultBackground,
  controlsRow,
  children,
}: {
  config: ServiceHeroConfig;
  defaultBackground: React.ReactNode;
  controlsRow?: React.ReactNode;
  children: React.ReactNode;
}) {
  const heightPad = HERO_HEIGHT_PADDING[config.height] ?? HERO_HEIGHT_PADDING.medium;
  const minH = HERO_MIN_HEIGHT[config.height] ?? "";
  const vJustify = V_JUSTIFY[config.verticalAlign] ?? "justify-center";
  const hWrap = H_ALIGN_WRAP[config.horizontalAlign] ?? H_ALIGN_WRAP.center;
  const hItems = H_ALIGN_ITEMS[config.horizontalAlign] ?? H_ALIGN_ITEMS.center;

  return (
    <section className={`relative px-5 overflow-hidden flex flex-col ${heightPad} ${minH}`}>
      <ServiceHeroBackground config={config} defaultBackground={defaultBackground} />
      {controlsRow}
      <div className={`relative flex-1 flex flex-col ${vJustify} ${hItems}`}>
        <div className={`relative max-w-3xl w-full ${hWrap}`}>{children}</div>
      </div>
    </section>
  );
}
