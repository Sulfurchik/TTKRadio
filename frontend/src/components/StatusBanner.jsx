function StatusBanner({ notice, onDismiss }) {
  if (!notice?.text) {
    return null
  }

  return (
    <div className={`status-banner status-banner--${notice.type || 'info'}`} role="status">
      <div>
        <div className="status-banner__title">
          {notice.type === 'error' ? 'Нужно внимание' : notice.type === 'success' ? 'Готово' : 'Информация'}
        </div>
        <div className="status-banner__text">{notice.text}</div>
      </div>
      {onDismiss && (
        <button type="button" className="status-banner__close" onClick={onDismiss} aria-label="Скрыть сообщение">
          ×
        </button>
      )}
    </div>
  )
}

export default StatusBanner
