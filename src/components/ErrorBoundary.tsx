import * as React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  isDark?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  prefersDark: boolean;
}

// Theme colors for error boundary
const themes = {
  light: {
    bg: '#ffffff',
    text: '#333333',
    textMuted: '#666666',
    textSubtle: '#999999',
    errorBg: '#f5f5f5',
    buttonBg: '#333333',
    buttonText: '#ffffff',
  },
  dark: {
    bg: '#1a1a1a',
    text: '#ffffff',
    textMuted: '#a3a3a3',
    textSubtle: '#666666',
    errorBg: '#2a2a2a',
    buttonBg: '#3b82f6',
    buttonText: '#ffffff',
  },
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private mediaQuery: MediaQueryList | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    // Check system preference on initialization
    const prefersDark =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    this.state = { hasError: false, error: null, prefersDark };
  }

  componentDidMount() {
    // Listen for system theme changes
    if (typeof window !== 'undefined' && window.matchMedia) {
      this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.mediaQuery.addEventListener('change', this.handleThemeChange);
    }
  }

  componentWillUnmount() {
    if (this.mediaQuery) {
      this.mediaQuery.removeEventListener('change', this.handleThemeChange);
    }
  }

  handleThemeChange = (e: MediaQueryListEvent) => {
    this.setState({ prefersDark: e.matches });
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
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

      // Use prop if provided, otherwise fall back to system preference
      const isDark = this.props.isDark ?? this.state.prefersDark;
      const theme = isDark ? themes.dark : themes.light;

      return (
        <div
          style={{
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            textAlign: 'center',
            fontFamily: 'Inter, system-ui, sans-serif',
            backgroundColor: theme.bg,
            color: theme.text,
          }}
          role="alert"
          aria-live="assertive"
        >
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>Something went wrong</div>
          <div
            style={{
              fontSize: '14px',
              color: theme.textMuted,
              marginBottom: '24px',
              maxWidth: '300px',
            }}
          >
            The plugin encountered an error. Please try again or reload the plugin.
          </div>
          <div
            style={{
              fontSize: '12px',
              color: theme.textSubtle,
              marginBottom: '16px',
              padding: '8px 12px',
              background: theme.errorBg,
              borderRadius: '4px',
              maxWidth: '300px',
              wordBreak: 'break-word',
            }}
          >
            {this.state.error?.message || 'Unknown error'}
          </div>
          <button
            onClick={this.handleRetry}
            aria-label="Retry loading the plugin"
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 500,
              color: theme.buttonText,
              backgroundColor: theme.buttonBg,
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
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
