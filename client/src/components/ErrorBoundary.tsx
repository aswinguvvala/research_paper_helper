import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console in development
    if (import.meta.env.MODE === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
    
    this.setState({
      error,
      errorInfo
    });

    // Here you could log to an error reporting service
    // logErrorToService(error, errorInfo);
  }

  handleRefresh = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-secondary-50 flex items-center justify-center p-4">
          <div className="max-w-lg w-full text-center">
            <div className="card">
              <div className="card-body space-y-6">
                {/* Error icon */}
                <div className="flex justify-center">
                  <div className="w-16 h-16 bg-error-100 rounded-full flex items-center justify-center">
                    <AlertTriangle className="w-8 h-8 text-error-600" />
                  </div>
                </div>

                {/* Error message */}
                <div>
                  <h1 className="text-2xl font-bold text-secondary-900 mb-2">
                    Oops! Something went wrong
                  </h1>
                  <p className="text-secondary-600">
                    We encountered an unexpected error. Please try refreshing the page or go back to the home page.
                  </p>
                </div>

                {/* Error details in development */}
                {import.meta.env.MODE === 'development' && this.state.error && (
                  <details className="text-left bg-secondary-50 p-4 rounded-lg border">
                    <summary className="cursor-pointer text-sm font-medium text-secondary-700 mb-2">
                      Error Details (Development)
                    </summary>
                    <div className="space-y-2 text-xs font-mono text-secondary-600">
                      <div>
                        <strong>Error:</strong> {this.state.error.message}
                      </div>
                      {this.state.error.stack && (
                        <div>
                          <strong>Stack:</strong>
                          <pre className="whitespace-pre-wrap mt-1 text-xs">
                            {this.state.error.stack}
                          </pre>
                        </div>
                      )}
                      {this.state.errorInfo && (
                        <div>
                          <strong>Component Stack:</strong>
                          <pre className="whitespace-pre-wrap mt-1 text-xs">
                            {this.state.errorInfo.componentStack}
                          </pre>
                        </div>
                      )}
                    </div>
                  </details>
                )}

                {/* Action buttons */}
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    onClick={this.handleRefresh}
                    className="btn btn-primary"
                  >
                    <RefreshCcw className="w-4 h-4 mr-2" />
                    Refresh Page
                  </button>
                  <button
                    onClick={this.handleGoHome}
                    className="btn btn-outline"
                  >
                    <Home className="w-4 h-4 mr-2" />
                    Go Home
                  </button>
                </div>

                {/* Additional help */}
                <div className="text-sm text-secondary-500">
                  If this problem persists, please{' '}
                  <a 
                    href="mailto:support@example.com"
                    className="text-primary-600 hover:text-primary-700 underline"
                  >
                    contact support
                  </a>
                  .
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;