import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import loginLogo from '../assets/login-logo.png'

function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [formData, setFormData] = useState({ login: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(formData.login, formData.password)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка входа')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Логотип ТТК */}
        <div style={{ 
          textAlign: 'left',
          marginBottom: '2rem',
          paddingBottom: '1.5rem',
          borderBottom: '2px solid #e0e0e0'
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
          Вход в систему
          </h1>
          <p className="auth-subtitle">Доступ к системе вещания</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label">Логин</label>
            <input
              type="text"
              className="form-input"
              value={formData.login}
              onChange={e => setFormData({ ...formData, login: e.target.value })}
              placeholder="Введите ваш логин"
              required
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Пароль</label>
            <input
              type="password"
              className="form-input"
              value={formData.password}
              onChange={e => setFormData({ ...formData, password: e.target.value })}
              placeholder="Введите ваш пароль"
              required
              autoComplete="current-password"
            />
          </div>

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
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        <div style={{
          textAlign: 'center',
          marginTop: '1.5rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid #e0e0e0'
        }}>
          <p className="auth-footer">
            Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
          </p>
        </div>

        {/* Информация о системе */}
        <div style={{
          marginTop: '2rem',
          padding: '1rem',
          background: '#f8f9fa',
          border: '1px solid #e0e0e0',
          textAlign: 'center',
          borderRadius: 'var(--radius)'
        }}>
          <p style={{ fontSize: '0.75rem', color: '#666', margin: 0 }}>
            Pixel Minds
          </p>
          <p style={{ fontSize: '0.7rem', color: '#999', margin: '0.25rem 0 0' }}>
            Платформа потокового вещания
          </p>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
