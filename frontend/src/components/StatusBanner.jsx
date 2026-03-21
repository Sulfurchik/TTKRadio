import { useLanguage } from '../hooks/useLanguage'

function StatusBanner({ notice, onDismiss }) {
  const t = useLanguage(state => state.t)

  if (!notice?.text) {
    return null
  }

  const title =
    notice.title ||
    (notice.type === 'error' || notice.type === 'warning'
      ? t('common.attention')
      : notice.type === 'success'
        ? t('common.done')
        : t('common.info'))

  return (
    <div className={`status-banner status-banner--${notice.type || 'info'}`} role="status">
      <div>
        <div className="status-banner__title">
          {title}
        </div>
        <div className="status-banner__text">{notice.text}</div>
      </div>
      <div className="status-banner__actions">
        {notice.action && (
          <button type="button" className="btn btn-outline btn-sm" onClick={notice.action.onClick}>
            {notice.action.label}
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            className="status-banner__close"
            onClick={onDismiss}
            aria-label={t('common.closeMessage')}
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}

export default StatusBanner
