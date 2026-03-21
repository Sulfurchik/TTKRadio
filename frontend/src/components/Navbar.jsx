import { Link, useLocation, useNavigate } from 'react-router-dom'

import ThemeToggle from './ThemeToggle'
import { useLanguage } from '../hooks/useLanguage'
import { useAuthStore } from '../store/authStore'
import logo from '../assets/login-logo.png'

const ROLE_KEY_BY_NAME = {
  Пользователь: 'user',
  Ведущий: 'host',
  Администратор: 'admin',
}

function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const language = useLanguage(state => state.language)
  const toggleLanguage = useLanguage(state => state.toggleLanguage)
  const t = useLanguage(state => state.t)

  const hasRole = (roles) => {
    return user?.roles.some(role => roles.includes(role.name))
  }

  const translateRoleName = (roleName) => {
    const roleKey = ROLE_KEY_BY_NAME[roleName]
    return roleKey ? t(`roles.${roleKey}`) : roleName
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <nav className="navbar">
      <div className="navbar-content">
        <Link to="/" className="navbar-brand">
          <img src={logo} alt="ТТК ТрансТелеКом" />
        </Link>

        <div className="navbar-menu">
          <Link
            to="/"
            className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            <span>{t('navbar.air')}</span>
          </Link>

          {hasRole(['Ведущий', 'Администратор']) && (
            <Link
              to="/host"
              className={`nav-link ${location.pathname === '/host' ? 'active' : ''}`}
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              <span>{t('navbar.panel')}</span>
            </Link>
          )}

          {hasRole(['Администратор']) && (
            <Link
              to="/admin"
              className={`nav-link ${location.pathname === '/admin' ? 'active' : ''}`}
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>{t('navbar.admin')}</span>
            </Link>
          )}
        </div>

        <div className="navbar-actions">
          <div className="navbar-controls">
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
            <button
              type="button"
              className="btn btn-outline btn-sm navbar-logout"
              onClick={handleLogout}
              title={t('navbar.logout')}
              aria-label={t('navbar.logout')}
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H9" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 20H6a2 2 0 01-2-2V6a2 2 0 012-2h7" />
              </svg>
              <span className="navbar-logout__label">{t('navbar.logout')}</span>
            </button>
          </div>

          <div className="user-info">
            <div className="navbar-user-copy">
              <div className="user-name">{user?.fio}</div>
              <div className="user-roles">
                {user?.roles.map(role => (
                  <span key={role.id} className="role-badge">
                    {translateRoleName(role.name)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}

export default Navbar
