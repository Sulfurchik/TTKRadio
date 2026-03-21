function MessagesList({ messages, onStatusChange, showArchive = false }) {
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
      case 'new': return 'Новое'
      case 'in_progress': return 'В работе'
      case 'completed': return 'Завершено'
      default: return status
    }
  }

  if (!messages || messages.length === 0) {
    return <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>Нет сообщений</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {messages.map(msg => (
        <div 
          key={msg.id} 
          style={{
            padding: '1rem',
            background: 'var(--bg-color)',
            borderRadius: '0.5rem',
            borderLeft: msg.status === 'new' ? '4px solid var(--primary-color)' : '4px solid transparent'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span className={`status-badge ${getStatusClass(msg.status)}`}>
              {getStatusText(msg.status)}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {new Date(msg.created_at).toLocaleString('ru-RU')}
            </span>
          </div>
          <p style={{ marginBottom: '0.75rem' }}>{msg.text}</p>
          {!showArchive && msg.status !== 'completed' && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {msg.status === 'new' && (
                <button 
                  className="btn btn-primary btn-sm"
                  onClick={() => onStatusChange(msg.id, 'in_progress')}
                >
                  В работу
                </button>
              )}
              {msg.status === 'in_progress' && (
                <button 
                  className="btn btn-success btn-sm"
                  onClick={() => onStatusChange(msg.id, 'completed')}
                >
                  Завершить
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
