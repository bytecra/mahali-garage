import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './i18n/index'
import './styles/globals.css'

interface ErrorBoundaryState {
  error: Error | null
}

class RootErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Root error boundary caught:', error, info)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', padding: '2rem',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <h1 style={{ color: '#f87171', marginBottom: '1rem' }}>Application Error</h1>
          <pre style={{
            background: '#1e293b', padding: '1rem', borderRadius: '8px',
            maxWidth: '800px', width: '100%', overflow: 'auto',
            fontSize: '0.8rem', color: '#fca5a5',
          }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <p style={{ marginTop: '1rem', color: '#94a3b8', fontSize: '0.875rem' }}>
            Press F12 to open DevTools for more details.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
)
