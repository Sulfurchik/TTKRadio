import React from 'react'

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    console.error('Application error boundary caught an error:', error)
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    const isEnglish = typeof document !== 'undefined' && document.documentElement.lang === 'en'
    const title = isEnglish ? 'Application error' : 'Ошибка приложения'
    const text = isEnglish
      ? 'Something went wrong. Please reload the page.'
      : 'Произошла непредвиденная ошибка. Пожалуйста, обновите страницу.'
    const actionLabel = isEnglish ? 'Reload page' : 'Обновить страницу'

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          background: 'var(--page-background, #f5f7fb)',
          color: 'var(--page-text, #111827)',
        }}
      >
        <div
          style={{
            width: 'min(100%, 460px)',
            borderRadius: '1rem',
            border: '1px solid var(--player-card-border, rgba(15, 23, 42, 0.12))',
            background: 'var(--player-card-bg, rgba(255, 255, 255, 0.92))',
            boxShadow: '0 24px 80px rgba(15, 23, 42, 0.14)',
            padding: '1.5rem',
          }}
        >
          <h1 style={{ margin: '0 0 0.75rem', fontSize: '1.35rem' }}>{title}</h1>
          <p style={{ margin: '0 0 1rem', color: 'var(--text-secondary, #64748b)' }}>{text}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            {actionLabel}
          </button>
        </div>
      </div>
    )
  }
}

export default AppErrorBoundary
