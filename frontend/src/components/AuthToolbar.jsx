import LanguageSwitch from './LanguageSwitch'
import ThemeToggle from './ThemeToggle'
import { useLanguage } from '../hooks/useLanguage'

function AuthToolbar() {
  useLanguage(state => state.language)

  return (
    <div className="auth-toolbar">
      <LanguageSwitch />
      <ThemeToggle />
    </div>
  )
}

export default AuthToolbar
