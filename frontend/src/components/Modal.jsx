function Modal({ isOpen, onClose, title, children, actions }) {
  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button
            className="modal-close"
            onClick={onClose}
            type="button"
            aria-label="Закрыть окно"
          >
            ×
          </button>
        </div>
        <div className="modal-content">
          {children}
        </div>
        {actions && (
          <div className="modal-actions">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}

export default Modal
