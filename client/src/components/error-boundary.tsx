import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useThemeStore } from "@/store/theme-store";

interface ErrorBoundaryProps {
  children: ReactNode;
  // Rendered instead of the default fallback card when provided — lets a
  // caller (e.g. the Favorites modal) supply a close handler alongside retry.
  fallback?: (retry: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** Prevents a render-time exception anywhere below it from unmounting the
 *  whole React tree (which otherwise blanks the entire page — no dev overlay
 *  exists in a production/Replit build to mask it). Reads the theme store
 *  directly via getState() since class components can't use hooks; still
 *  matches the app's actual dark/light system instead of the inert
 *  Tailwind `dark:`/CSS-variable one this app doesn't activate. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Logging the raw Error object is useless in any pipeline that
    // JSON-serializes console arguments for transport (e.g. Replit's remote
    // log capture) — `message`/`stack` are non-enumerable on a native Error,
    // so `JSON.stringify(error)` collapses to "{}", which is exactly what
    // showed up in production logs here. Log plain strings instead so the
    // real reason survives any serialization step.
    console.error(
      `[ErrorBoundary] caught render error: ${error?.name ?? "Error"}: ${error?.message ?? String(error)}\n` +
      `${error?.stack ?? "(no stack)"}\n` +
      `Component stack:${info.componentStack}`
    );
  }

  retry = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.retry);

    const dk = useThemeStore.getState().isDark;
    return (
      <div className={`flex flex-col items-center justify-center gap-3 p-8 text-center h-full min-h-[240px] ${dk ? "bg-gray-900 text-gray-200" : "bg-white text-gray-700"}`}>
        <AlertTriangle className="w-8 h-8 text-amber-500" />
        <p className="font-semibold text-sm">Une erreur est survenue</p>
        <p className={`text-xs ${dk ? "text-gray-400" : "text-gray-500"}`}>Veuillez réessayer.</p>
        <button
          onClick={this.retry}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors ${dk ? "bg-gray-800 hover:bg-gray-700 text-gray-200" : "bg-gray-100 hover:bg-gray-200 text-gray-700"}`}
          data-testid="button-error-boundary-retry"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Réessayer
        </button>
      </div>
    );
  }
}
