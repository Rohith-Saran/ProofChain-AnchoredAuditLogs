import React from "react";

interface ErrorBoundaryProps {
  fallback?: React.ReactNode;
  /** Skip quietly even in development (for purely decorative pieces). */
  silent?: boolean;
  children: React.ReactNode;
}

// Keeps one failing piece (e.g. a WebGL-only visual on a machine without WebGL, or a lazy
// chunk that can't load offline) from unmounting the whole dashboard.
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown) {
    console.warn("Section failed to render and was skipped:", error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // In development, say what was skipped instead of failing silently; production stays clean.
    if (import.meta.env.DEV && !this.props.silent) {
      return (
        <div role="alert" style={{ margin: "12px 24px", padding: "10px 14px", border: "1px dashed var(--warn)", borderRadius: "8px", fontSize: "0.82rem", color: "var(--warn)" }}>
          A section was skipped because it failed to load: {error.message}. Reload the page (Ctrl+Shift+R) to retry.
        </div>
      );
    }
    return this.props.fallback ?? null;
  }
}
