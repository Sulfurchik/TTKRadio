function EyeIcon({ hidden }) {
  return (
    <span className="password-field__icon-stack" aria-hidden="true">
      <svg
        className={`password-field__icon ${hidden ? 'password-field__icon--visible' : 'password-field__icon--hidden'}`}
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <svg
        className={`password-field__icon ${hidden ? 'password-field__icon--hidden' : 'password-field__icon--visible'}`}
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 3l18 18" />
        <path d="M10.6 10.7a3 3 0 0 0 4 4" />
        <path d="M9.9 5.1A11.4 11.4 0 0 1 12 5c6.5 0 10 7 10 7a18.7 18.7 0 0 1-4 4.9" />
        <path d="M6.6 6.7C4 8.4 2 12 2 12a18.3 18.3 0 0 0 10 7 11.7 11.7 0 0 0 5.1-1.1" />
      </svg>
    </span>
  )
}

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  required = false,
  visible,
  onToggleVisibility,
  toggleLabel,
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div className="password-field">
        <input
          type={visible ? 'text' : 'password'}
          className="form-input password-field__input"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="password-field__toggle"
          onClick={onToggleVisibility}
          title={toggleLabel}
          aria-label={toggleLabel}
          aria-pressed={visible}
        >
          <EyeIcon hidden={!visible} />
        </button>
      </div>
    </div>
  )
}

export default PasswordField
