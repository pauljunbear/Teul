import * as React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Plugin Error:', error);
    console.error('Component Stack:', errorInfo.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          textAlign: 'center',
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#333'
        }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>
            Something went wrong
          </div>
          <div style={{
            fontSize: '14px',
            color: '#666',
            marginBottom: '24px',
            maxWidth: '300px'
          }}>
            The plugin encountered an error. Please try again or reload the plugin.
          </div>
          <div style={{
            fontSize: '12px',
            color: '#999',
            marginBottom: '16px',
            padding: '8px 12px',
            background: '#f5f5f5',
            borderRadius: '4px',
            maxWidth: '300px',
            wordBreak: 'break-word'
          }}>
            {this.state.error?.message || 'Unknown error'}
          </div>
          <button
            onClick={this.handleRetry}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#fff',
              backgroundColor: '#333',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
