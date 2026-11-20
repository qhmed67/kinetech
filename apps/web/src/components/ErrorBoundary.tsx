import { Component, type ErrorInfo, type ReactNode } from "react";
import { STR, getInitialLang } from "../i18n";
import { log } from "../lib/logger";

type Props = { children: ReactNode };
type State = { failed: boolean };

/** Last-resort UI boundary. Logs once, then shows a plain bilingual fallback. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    log("error", "ui.error.boundary", "unhandled UI error", {
      module: "ui.error-boundary",
      ctx: { component: info.componentStack?.slice(0, 300) ?? null },
      error: { code: "SYS_001", type: error.name, message: error.message.slice(0, 500) },
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const t = STR[getInitialLang()];
    return (
      <main id="content" className="mx-auto max-w-xl px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">{t.errorTitle}</h1>
        <p className="mt-3 opacity-80">{t.errorBody}</p>
        <button
          type="button"
          className="mt-6 rounded-md border border-current px-4 py-2"
          onClick={() => window.location.reload()}
        >
          {t.reload}
        </button>
      </main>
    );
  }
}
