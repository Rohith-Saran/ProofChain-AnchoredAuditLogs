import React, { lazy, Suspense } from "react";
import { useStore } from "../store/useStore";
import { ErrorBoundary } from "./ErrorBoundary";

// Originkit "ASCII Rain", used unchanged; only its props are set here to match the site's palette.
const AsciiRain = lazy(() => import("@/components/originkit/ui/ascii-rain"));

// Fixed, full-viewport, behind all content and never catches clicks. Kept faint so tables stay readable.
export const RainBackground: React.FC = () => {
  const isDarkMode = useStore((s) => s.isDarkMode);
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        opacity: isDarkMode ? 0.45 : 0.25,
        maskImage: "linear-gradient(to bottom, #000 0%, rgba(0,0,0,0.8) 75%, rgba(0,0,0,0.35) 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, #000 0%, rgba(0,0,0,0.8) 75%, rgba(0,0,0,0.35) 100%)",
      }}
    >
      <ErrorBoundary silent>
        <Suspense fallback={null}>
          <AsciiRain
            headColor={isDarkMode ? "#ffd2ad" : "#7c2d12"}
            trailColor={isDarkMode ? "#ff7614" : "#c2410c"}
            glyphSize={14}
            speed={4}
            density={30}
            style={{ width: "100%", height: "100%" }}
          />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
};
