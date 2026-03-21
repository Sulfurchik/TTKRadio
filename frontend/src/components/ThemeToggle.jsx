import { useTheme } from '../hooks/useTheme'
import { useLanguage } from '../hooks/useLanguage'

function ThemeToggle() {
  const theme = useTheme(state => state.theme)
  const toggleTheme = useTheme(state => state.toggleTheme)
  const t = useLanguage(state => state.t)
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      className="btn btn-outline btn-sm theme-toggle"
      onClick={toggleTheme}
      aria-label={t('navbar.toggleTheme')}
      title={t('navbar.toggleTheme')}
    >
      <span className="theme-toggle__icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {isDark ? (
            <>
              <circle cx="12" cy="12" r="4.2" />
              <path d="M12 2.5v2.2M12 19.3v2.2M4.93 4.93l1.56 1.56M17.51 17.51l1.56 1.56M2.5 12h2.2M19.3 12h2.2M4.93 19.07l1.56-1.56M17.51 6.49l1.56-1.56" />
            </>
          ) : (
            <path d="M20 15.2A8.5 8.5 0 0 1 8.8 4a8.9 8.9 0 1 0 11.2 11.2Z" />
          )}
        </svg>
      </span>
      <span>{t('navbar.theme')}</span>
    </button>
  )
}

export default ThemeToggle
