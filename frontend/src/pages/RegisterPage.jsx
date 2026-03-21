import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import loginLogo from '../assets/login-logo.png'

function RegisterPage() {
  const navigate = useNavigate()
  const { register } = useAuthStore()
  const [formData, setFormData] = useState({
    login: '',
    fio: '',
    password: '',
    password_confirm: ''
  })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const validate = () => {
    const newErrors = {}

    if (!/^[a-zA-Z]+$/.test(formData.login)) {
      newErrors.login = 'Логин должен содержать только латинские буквы'
    }

    if (!/^[а-яА-ЯёЁ\s]+$/.test(formData.fio)) {
      newErrors.fio = 'ФИО должно содержать только русские буквы'
    }

    if (!/^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+$/.test(formData.password)) {
      newErrors.password = 'Пароль может содержать только латинские буквы, цифры и символы'
    }

    if (formData.password.length < 4) {
      newErrors.password = 'Пароль должен быть не менее 4 символов'
    }

    if (formData.password !== formData.password_confirm) {
      newErrors.password_confirm = 'Пароли не совпадают'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!validate()) return

    setLoading(true)

    try {
      await register(formData)
      navigate('/login')
    } catch (err) {
      setErrors({ submit: err.response?.data?.detail || 'Ошибка регистрации' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: '520px' }}>
        {/* Логотип ТТК */}
        <div style={{ 
          textAlign: 'center', 
          marginBottom: '2rem',
          paddingBottom: '1.5rem',
          borderBottom: '2px solid #e0e0e0'
        }}>
          <img 
            src={loginLogo} 
            alt="ТТК ТрансТелеКом" 
            style={{ 
              height: '70px', 
              maxWidth: '100%',
              marginBottom: '1rem'
            }}
          />
          <h1 className="auth-title">Регистрация</h1>
          <p className="auth-subtitle">Регистрация учетной записи</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label">Логин</label>
            <input
              type="text"
              className="form-input"
              value={formData.login}
              onChange={e => setFormData({ ...formData, login: e.target.value })}
              placeholder="Только латинские буквы"
              pattern="[a-zA-Z]+"
              required
              autoComplete="username"
            />
            {errors.login && <p className="form-error">{errors.login}</p>}
            <p style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>
              Пример: ivan, petr, alexey
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">ФИО</label>
            <input
              type="text"
              className="form-input"
              value={formData.fio}
              onChange={e => setFormData({ ...formData, fio: e.target.value })}
              placeholder="Иванов Иван Иванович"
              pattern="[а-яА-ЯёЁ\s]+"
              required
              autoComplete="name"
            />
            {errors.fio && <p className="form-error">{errors.fio}</p>}
            <p style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>
              Только русские буквы и пробелы
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">Пароль</label>
            <input
              type="password"
              className="form-input"
              value={formData.password}
              onChange={e => setFormData({ ...formData, password: e.target.value })}
              placeholder="Минимум 4 символа"
              required
              autoComplete="new-password"
            />
            {errors.password && <p className="form-error">{errors.password}</p>}
          </div>

          <div className="form-group">
            <label className="form-label">Подтверждение пароля</label>
            <input
              type="password"
              className="form-input"
              value={formData.password_confirm}
              onChange={e => setFormData({ ...formData, password_confirm: e.target.value })}
              placeholder="Повторите пароль"
              required
              autoComplete="new-password"
            />
            {errors.password_confirm && <p className="form-error">{errors.password_confirm}</p>}
          </div>

          {errors.submit && (
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
              {errors.submit}
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
            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>
        </form>

        <div style={{
          textAlign: 'center',
          marginTop: '1.5rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid #e0e0e0'
        }}>
          <p className="auth-footer">
            Уже есть аккаунт? <Link to="/login">Войти</Link>
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
            АО «Компания ТрансТелеКом»
          </p>
          <p style={{ fontSize: '0.7rem', color: '#999', margin: '0.25rem 0 0' }}>
            Платформа потокового вещания
          </p>
        </div>
      </div>
    </div>
  )
}

export default RegisterPage
