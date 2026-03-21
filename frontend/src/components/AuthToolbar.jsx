import ThemeToggle from './ThemeToggle'
import { useLanguage } from '../hooks/useLanguage'

function AuthToolbar() {
  const language = useLanguage(state => state.language)
  const toggleLanguage = useLanguage(state => state.toggleLanguage)
  const t = useLanguage(state => state.t)

  return (
    <div className="auth-toolbar">
      <button
        type="button"
        className="btn btn-outline btn-sm navbar-language"
        onClick={toggleLanguage}
        title={t('navbar.switchLanguage')}
        aria-label={t('navbar.switchLanguage')}
      >
        {language.toUpperCase()}
      </button>
      <ThemeToggle />
    </div>
  )
}

export default AuthToolbar
