import ThemeToggle from './ThemeToggle'
import { useLanguage } from '../hooks/useLanguage'

function AuthToolbar() {
  const language = useLanguage(state => state.language)
  const setLanguage = useLanguage(state => state.setLanguage)
  const t = useLanguage(state => state.t)

  return (
    <div className="auth-toolbar">
      <div className="language-switch" role="group" aria-label={t('navbar.switchLanguage')}>
        <button
          type="button"
          className={`btn btn-outline btn-sm language-switch__button ${language === 'ru' ? 'language-switch__button--active' : ''}`}
          onClick={() => setLanguage('ru')}
        >
          RU
        </button>
        <button
          type="button"
          className={`btn btn-outline btn-sm language-switch__button ${language === 'en' ? 'language-switch__button--active' : ''}`}
          onClick={() => setLanguage('en')}
        >
          EN
        </button>
      </div>
      <ThemeToggle />
    </div>
  )
}

export default AuthToolbar
