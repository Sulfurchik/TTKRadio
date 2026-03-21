import { getLocale, useLanguage } from '../hooks/useLanguage'

function MessagesList({ messages, onStatusChange, showArchive = false }) {
  const language = useLanguage(state => state.language)
  const t = useLanguage(state => state.t)
  const locale = getLocale(language)

  const getStatusClass = (status) => {
    switch (status) {
      case 'new': return 'status-new'
      case 'in_progress': return 'status-in_progress'
      case 'completed': return 'status-completed'
      default: return ''
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'new': return t('messageStatus.new')
      case 'in_progress': return t('messageStatus.inProgress')
      case 'completed': return t('messageStatus.completed')
      default: return status
    }
  }

  if (!messages || messages.length === 0) {
    return <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>{t('player.noMessages')}</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {messages.map(msg => (
        <div 
          key={msg.id} 
          style={{
            padding: '1rem',
            background: 'var(--player-message-card-bg)',
            border: '1px solid var(--player-message-card-border)',
            borderRadius: '0.5rem',
            borderLeft: msg.status === 'new' ? '4px solid var(--primary-color)' : '4px solid transparent'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span className={`status-badge ${getStatusClass(msg.status)}`}>
              {getStatusText(msg.status)}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {new Date(msg.created_at).toLocaleString(locale)}
            </span>
          </div>
          <p style={{ marginBottom: '0.75rem', color: 'var(--page-text)' }}>{msg.text}</p>
          {!showArchive && msg.status !== 'completed' && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {msg.status === 'new' && (
                <button 
                  className="btn btn-primary btn-sm"
                  onClick={() => onStatusChange(msg.id, 'in_progress')}
                >
                  {t('messageStatus.takeInProgress')}
                </button>
              )}
              {msg.status === 'in_progress' && (
                <button 
                  className="btn btn-success btn-sm"
                  onClick={() => onStatusChange(msg.id, 'completed')}
                >
                  {t('messageStatus.finish')}
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default MessagesList
