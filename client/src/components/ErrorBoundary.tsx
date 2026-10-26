import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <div className="page">
          <div className="rounded-card border border-danger bg-danger-soft p-6" role="alert">
            <p className="font-bold text-danger">Something broke on this page.</p>
            <p className="mt-1 text-sm text-charcoal">Reload to try again. Your data is safe.</p>
            <button className="btn-secondary btn-sm mt-3" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      );
    return this.props.children;
  }
}
