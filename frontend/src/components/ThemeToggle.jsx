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
        {isDark ? '☀' : '☾'}
      </span>
      <span>{t('navbar.theme')}</span>
    </button>
  )
}

export default ThemeToggle
