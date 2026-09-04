import { Component, type ErrorInfo, type ReactNode } from "react";

/** A render error must leave a recovery action, not a blank installed iPhone app. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Workout Tracker could not render", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="app-recovery" role="alert">
        <p className="eyebrow">Workout Tracker</p>
        <h1>Let&apos;s reopen your tracker.</h1>
        <p>Something interrupted this screen. Reloading will not clear your saved progress.</p>
        <button type="button" onClick={() => window.location.reload()}>Reload tracker</button>
      </main>
    );
  }
}
