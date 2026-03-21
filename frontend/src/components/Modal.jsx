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
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'rgba(229, 39, 19, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              transition: 'all 0.3s ease',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--ttk-gray-light)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--ttk-red)'
              e.currentTarget.style.color = 'white'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(229, 39, 19, 0.1)'
              e.currentTarget.style.color = 'var(--ttk-gray-light)'
            }}
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
