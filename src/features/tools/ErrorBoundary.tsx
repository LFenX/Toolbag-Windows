import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "../../shared/ui/button";

interface State {
  error: Error | null;
}

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

export class ToolErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
     
    console.error("[tool error]", error, info);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }
    return (
      <section className="grid h-full place-items-center p-10">
        <div className="max-w-lg rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center">
          <h2 className="text-base font-semibold text-destructive">
            {this.props.fallbackTitle ?? "工具崩溃了"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {this.state.error.message || "未知错误"}
          </p>
          <Button
            className="mt-4"
            variant="outline"
            size="sm"
            onClick={() => {
              this.setState({ error: null });
            }}
          >
            重试加载
          </Button>
        </div>
      </section>
    );
  }
}
