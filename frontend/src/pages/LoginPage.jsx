import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthToolbar from '../components/AuthToolbar'
import PasswordField from '../components/PasswordField'
import { useLanguage } from '../hooks/useLanguage'
import { useAuthStore } from '../store/authStore'
import { getApiErrorMessage } from '../utils/apiError'
import loginLogo from '../assets/login-logo.svg'

function LoginPage() {
  const navigate = useNavigate()
  useLanguage(state => state.language)
  const t = useLanguage(state => state.t)
  const { login } = useAuthStore()
  const [formData, setFormData] = useState({ login: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(formData.login.trim(), formData.password)
      navigate('/')
    } catch (err) {
      setError(getApiErrorMessage(err, t('auth.loginError')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-page__controls">
        <AuthToolbar />
      </div>
      <div className="auth-card">
        {/* Логотип ТТК */}
        <div style={{ 
          textAlign: 'left',
          marginBottom: '2rem',
          paddingBottom: '1.5rem',
          borderBottom: '2px solid var(--ttk-border)'
        }}>
          <img 
            src={loginLogo} 
            alt="ТТК ТрансТелеКом" 
            style={{ 
              height: '80px', 
              maxWidth: '100%',
              marginBottom: '1rem'
            }}
          />
          <h1 className="auth-title" style={{ fontSize: '45px', fontWeight: 'bold' }}>
          {t('auth.loginTitle')}
          </h1>
          <p className="auth-subtitle">{t('auth.loginSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label">{t('auth.login')}</label>
            <input
              type="text"
              className="form-input"
              value={formData.login}
              onChange={e => setFormData({ ...formData, login: e.target.value })}
              placeholder={t('auth.loginPlaceholder')}
              required
              autoComplete="username"
            />
          </div>

          <PasswordField
            label={t('auth.password')}
            value={formData.password}
            onChange={e => setFormData({ ...formData, password: e.target.value })}
            placeholder={t('auth.passwordPlaceholder')}
            required
            autoComplete="current-password"
            visible={isPasswordVisible}
            onToggleVisibility={() => setIsPasswordVisible(prev => !prev)}
            toggleLabel={isPasswordVisible ? t('auth.hidePassword') : t('auth.showPassword')}
          />

          {error && (
            <div style={{
              padding: '0.75rem 1rem',
              background: 'rgba(229, 39, 19, 0.08)',
              border: '1px solid rgba(229, 39, 19, 0.2)',
              borderRadius: 'var(--radius)',
              color: 'var(--ttk-red)',
              fontSize: '0.85rem',
              fontWeight: 500,
              marginBottom: '1.25rem'
            }}>
              {error}
            </div>
          )}

          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ 
              width: '100%', 
              padding: '0.875rem',
              fontSize: '0.9rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              fontWeight: 600
            }} 
            disabled={loading}
          >
            {loading ? `${t('auth.loginButton')}...` : t('auth.loginButton')}
          </button>
        </form>

        <div style={{
          textAlign: 'center',
          marginTop: '1.5rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid var(--ttk-border)'
        }}>
          <p className="auth-footer">
            {t('auth.noAccount')} <Link to="/register">{t('auth.register')}</Link>
          </p>
        </div>

        {/* Информация о системе */}
        <div style={{
          marginTop: '2rem',
          padding: '1rem',
          background: 'var(--muted-bg)',
          border: '1px solid var(--ttk-border)',
          textAlign: 'center',
          borderRadius: 'var(--radius)'
        }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
            Pixel Minds
          </p>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
            {t('auth.platformName')}
          </p>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
