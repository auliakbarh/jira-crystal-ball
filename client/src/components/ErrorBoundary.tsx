import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

// Catches render-time errors so a single broken view doesn't blank the whole app.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto mt-20 max-w-md text-center">
          <div className="text-5xl">🔮💥</div>
          <h1 className="mt-3 text-xl font-bold">Something went wrong</h1>
          <p className="mt-1 text-sm text-gray-500">{this.state.error.message}</p>
          <div className="mt-4 flex justify-center gap-2">
            <button className="btn-ghost" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            <button className="btn-primary" onClick={() => (window.location.href = "/")}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
