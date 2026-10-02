import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  /** Rendered instead of `children` after an error; `reset` clears it and re-renders `children`. */
  fallback: (reset: () => void, error: unknown) => ReactNode;
  onReset?: () => void;
  onError?: (error: unknown, info: ErrorInfo) => void;
  children: ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
  error: unknown;
}

/** Isolates a failing subtree (one view) so the rest of the lab keeps working. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false, error: undefined };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { failed: true, error };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  private readonly reset = (): void => {
    this.props.onReset?.();
    this.setState({ failed: false, error: undefined });
  };

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback(this.reset, this.state.error) : this.props.children;
  }
}
