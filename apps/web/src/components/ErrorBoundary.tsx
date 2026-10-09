import { Component, type ErrorInfo, type ReactNode } from "react";
import { type WithTranslation, withTranslation } from "react-i18next";

interface State {
  failed: boolean;
}

/**
 * Keeps one broken component from blanking the whole page. The drawing is saved in the
 * browser, so reloading brings the person back to where they were.
 */
class Boundary extends Component<WithTranslation & { children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Chizma crashed", error, info.componentStack);
  }

  render() {
    const { t, children } = this.props;
    if (!this.state.failed) return children;
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-[var(--radius-card)] bg-card p-8 text-center shadow-[var(--shadow-soft)]">
          <p className="text-lg font-semibold">{t("crash.title")}</p>
          <p className="text-sm text-muted-foreground">{t("crash.body")}</p>
          <button
            type="button"
            className="h-10 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
            onClick={() => window.location.reload()}
          >
            {t("crash.reload")}
          </button>
        </div>
      </div>
    );
  }
}

export const ErrorBoundary = withTranslation()(Boundary);
