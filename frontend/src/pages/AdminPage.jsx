import { useState, useEffect } from 'react'
import { adminService } from '../services'
import Modal from '../components/Modal'

function AdminPage() {
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [filters, setFilters] = useState({})
  const [selectedUser, setSelectedUser] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalType, setModalType] = useState('')
  const [formData, setFormData] = useState({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadUsers()
    loadRoles()
  }, [])

  const loadUsers = async () => {
    try {
      const data = await adminService.getUsers(filters)
      setUsers(data)
    } catch (error) {
      console.error('Ошибка загрузки пользователей:', error)
    }
  }

  const loadRoles = async () => {
    try {
      const data = await adminService.getRoles()
      setRoles(data)
    } catch (error) {
      console.error('Ошибка загрузки ролей:', error)
    }
  }

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const applyFilters = () => loadUsers()
  const clearFilters = () => { setFilters({}); setTimeout(loadUsers, 100) }

  const openEditModal = (user) => {
    setSelectedUser(user)
    setFormData({ login: user.login, fio: user.fio })
    setModalType('edit')
    setIsModalOpen(true)
  }

  const openPasswordModal = (user) => {
    setSelectedUser(user)
    setFormData({ new_password: '', new_password_confirm: '' })
    setModalType('password')
    setIsModalOpen(true)
  }

  const openRolesModal = (user) => {
    setSelectedUser(user)
    setFormData({ role_ids: user.roles.map(r => r.id) })
    setModalType('roles')
    setIsModalOpen(true)
  }

  const handleDelete = async (userId) => {
    if (!confirm('Удалить пользователя?')) return
    try {
      await adminService.deleteUser(userId)
      await loadUsers()
    } catch (error) {
      alert('Ошибка: ' + error.response?.data?.detail)
    }
  }

  const handleBlock = async (userId, isBlocked) => {
    try {
      await adminService.updateUser(userId, { is_deleted: isBlocked ? 0 : 1 })
      await loadUsers()
    } catch (error) {
      alert('Ошибка блокировки')
    }
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      if (modalType === 'edit') {
        await adminService.updateUser(selectedUser.id, formData)
      } else if (modalType === 'password') {
        await adminService.changePassword(selectedUser.id, formData)
      } else if (modalType === 'roles') {
        await adminService.assignRoles(selectedUser.id, formData.role_ids)
      }
      setIsModalOpen(false)
      await loadUsers()
    } catch (error) {
      alert('Ошибка: ' + error.response?.data?.detail)
    } finally {
      setLoading(false)
    }
  }

  const handleRoleCheckbox = (roleId) => {
    setFormData(prev => {
      const roleIds = prev.role_ids || []
      return {
        ...prev,
        role_ids: roleIds.includes(roleId)
          ? roleIds.filter(id => id !== roleId)
          : [...roleIds, roleId]
      }
    })
  }

  return (
    <div className="container">
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ 
          fontSize: '1.75rem', 
          fontWeight: 700,
          fontFamily: 'PT Sans Caption, sans-serif',
          background: 'linear-gradient(135deg, var(--ttk-red) 0%, var(--ttk-red-dark) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          margin: 0
        }}>
          Администрирование
        </h1>
        <p style={{ color: 'var(--ttk-gray-light)', marginTop: '0.5rem' }}>
          Управление пользователями системы
        </p>
      </div>

      <div className="card" style={{
        background: 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(229, 39, 19, 0.1)',
        boxShadow: '0 8px 32px rgba(229, 39, 19, 0.08)'
      }}>
        <div className="card-header">
          <h2 className="card-title">Пользователи</h2>
        </div>

        {/* Фильтры */}
        <div className="filters" style={{
          background: 'linear-gradient(135deg, rgba(229, 39, 19, 0.05), rgba(229, 39, 19, 0.02))',
          borderRadius: 'var(--radius-lg)',
          padding: '1.25rem',
          marginBottom: '1.5rem',
          border: '1px solid rgba(229, 39, 19, 0.1)'
        }}>
          <div>
            <label className="form-label">Логин</label>
            <input
              type="text"
              className="form-input"
              value={filters.login || ''}
              onChange={e => handleFilterChange('login', e.target.value)}
              placeholder="Поиск"
            />
          </div>
          <div>
            <label className="form-label">ФИО</label>
            <input
              type="text"
              className="form-input"
              value={filters.fio || ''}
              onChange={e => handleFilterChange('fio', e.target.value)}
              placeholder="Поиск"
            />
          </div>
          <div>
            <label className="form-label">Роль</label>
            <select
              className="form-input"
              value={filters.role_id || ''}
              onChange={e => handleFilterChange('role_id', e.target.value)}
            >
              <option value="">Все роли</option>
              {roles.map(role => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
            <button className="btn btn-primary" onClick={applyFilters}>
              Применить
            </button>
            <button className="btn btn-outline" onClick={clearFilters}>
              Сброс
            </button>
          </div>
        </div>

        {/* Таблица */}
        <div className="table-container" style={{
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          border: '1px solid var(--border-color)'
        }}>
          <table className="table">
            <thead style={{
              background: 'linear-gradient(135deg, rgba(229, 39, 19, 0.08), rgba(229, 39, 19, 0.03))',
              borderBottom: '2px solid var(--ttk-red)'
            }}>
              <tr>
                <th>Логин</th>
                <th>ФИО</th>
                <th>Роли</th>
                <th>Дата регистрации</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} style={{
                  background: user.is_deleted ? 'rgba(0,0,0,0.03)' : 'transparent',
                  opacity: user.is_deleted ? 0.6 : 1
                }}>
                  <td style={{ fontWeight: 600 }}>{user.login}</td>
                  <td>{user.fio}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {user.roles.map(role => (
                        <span key={role.id} className="status-badge status-new">{role.name}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--ttk-gray-light)' }}>
                    {new Date(user.created_at).toLocaleDateString('ru-RU')}
                  </td>
                  <td>
                    {user.is_deleted ? (
                      <span className="status-badge status-completed" style={{ background: '#ffebee', color: '#c62828' }}>
                        Заблокирован
                      </span>
                    ) : (
                      <span className="status-badge status-new" style={{ background: '#e8f5e9', color: '#2e7d32' }}>
                        Активен
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="table-actions" style={{ flexWrap: 'wrap', gap: '0.375rem' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => openEditModal(user)}>
                        ✏️
                      </button>
                      <button className="btn btn-outline btn-sm" onClick={() => openPasswordModal(user)}>
                        🔑
                      </button>
                      <button className="btn btn-outline btn-sm" onClick={() => openRolesModal(user)}>
                        📋
                      </button>
                      <button 
                        className="btn btn-sm" 
                        onClick={() => handleBlock(user.id, !user.is_deleted)}
                        style={{
                          background: user.is_deleted 
                            ? 'linear-gradient(135deg, #28a745, #34d058)'
                            : 'linear-gradient(135deg, #ffc107, #ffdb73)',
                          color: user.is_deleted ? 'white' : '#333',
                          border: 'none'
                        }}
                      >
                        {user.is_deleted ? 'Разблокировать' : 'Блок'}
                      </button>
                      <button 
                        className="btn btn-danger btn-sm" 
                        onClick={() => handleDelete(user.id)}
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--ttk-gray-light)' }}>
              <p>Пользователи не найдены</p>
            </div>
          )}
        </div>
      </div>

      {/* Модальное окно редактирования */}
      <Modal
        isOpen={isModalOpen && modalType === 'edit'}
        onClose={() => setIsModalOpen(false)}
        title="Редактирование пользователя"
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setIsModalOpen(false)}>
              Отмена
            </button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Логин</label>
          <input
            type="text"
            className="form-input"
            value={formData.login || ''}
            onChange={e => setFormData({ ...formData, login: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">ФИО</label>
          <input
            type="text"
            className="form-input"
            value={formData.fio || ''}
            onChange={e => setFormData({ ...formData, fio: e.target.value })}
          />
        </div>
      </Modal>

      {/* Модальное окно смены пароля */}
      <Modal
        isOpen={isModalOpen && modalType === 'password'}
        onClose={() => setIsModalOpen(false)}
        title="Смена пароля"
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setIsModalOpen(false)}>
              Отмена
            </button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Новый пароль</label>
          <input
            type="password"
            className="form-input"
            value={formData.new_password || ''}
            onChange={e => setFormData({ ...formData, new_password: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Подтверждение пароля</label>
          <input
            type="password"
            className="form-input"
            value={formData.new_password_confirm || ''}
            onChange={e => setFormData({ ...formData, new_password_confirm: e.target.value })}
          />
        </div>
      </Modal>

      {/* Модальное окно назначения ролей */}
      <Modal
        isOpen={isModalOpen && modalType === 'roles'}
        onClose={() => setIsModalOpen(false)}
        title="Назначение ролей"
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setIsModalOpen(false)}>
              Отмена
            </button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </>
        }
      >
        <div className="checkbox-group">
          {roles.map(role => (
            <label key={role.id} className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.role_ids?.includes(role.id)}
                onChange={() => handleRoleCheckbox(role.id)}
              />
              {role.name}
            </label>
          ))}
        </div>
      </Modal>
    </div>
  )
}

export default AdminPage
