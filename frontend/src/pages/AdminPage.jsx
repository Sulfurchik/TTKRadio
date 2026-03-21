import { useState, useEffect } from 'react'
import { adminService } from '../services'
import Modal from '../components/Modal'
import StatusBanner from '../components/StatusBanner'


const ROLE_DESCRIPTIONS = {
  Пользователь: 'Доступ к эфиру и отправке сообщений.',
  Ведущий: 'Управление медиатекой, плейлистами и эфиром.',
  Администратор: 'Администрирование пользователей и прав доступа.',
}


function ActionIconButton({ title, onClick, children }) {
  return (
    <button
      type="button"
      className="btn btn-outline btn-sm"
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        width: '36px',
        height: '36px',
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
  )
}


function AdminPage() {
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [filters, setFilters] = useState({})
  const [selectedUser, setSelectedUser] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalType, setModalType] = useState('')
  const [formData, setFormData] = useState({})
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    loadUsers()
    loadRoles()
  }, [])

  const loadUsers = async (activeFilters = filters) => {
    try {
      const data = await adminService.getUsers(activeFilters)
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

  const applyFilters = () => loadUsers(filters)
  const clearFilters = () => {
    const emptyFilters = {}
    setFilters(emptyFilters)
    loadUsers(emptyFilters)
  }

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
      setNotice(null)
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.detail || 'Не удалось удалить пользователя.' })
    }
  }

  const handleBlock = async (userId, nextDeletedState) => {
    try {
      await adminService.updateUser(userId, { is_deleted: nextDeletedState })
      await loadUsers()
      setNotice(null)
    } catch (error) {
      setNotice({ type: 'error', text: 'Не удалось изменить статус пользователя.' })
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
      setNotice(null)
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.detail || 'Не удалось сохранить изменения.' })
    } finally {
      setLoading(false)
    }
  }

  const handleRoleCheckbox = (roleId) => {
    const rolesByName = Object.fromEntries(roles.map(role => [role.name, role]))
    const userRoleId = rolesByName['Пользователь']?.id
    const hostRoleId = rolesByName['Ведущий']?.id
    const adminRoleId = rolesByName['Администратор']?.id

    setFormData(prev => {
      const selectedIds = new Set(prev.role_ids || [])
      const hasHost = hostRoleId ? selectedIds.has(hostRoleId) : false
      const hasAdmin = adminRoleId ? selectedIds.has(adminRoleId) : false

      let nextRoleIds = []

      if (roleId === userRoleId) {
        nextRoleIds = userRoleId ? [userRoleId] : []
      } else if (roleId === hostRoleId) {
        if (hasHost) {
          nextRoleIds = hasAdmin && adminRoleId ? [adminRoleId] : (userRoleId ? [userRoleId] : [])
        } else {
          nextRoleIds = hasAdmin && adminRoleId ? [adminRoleId, hostRoleId] : [hostRoleId]
        }
      } else if (roleId === adminRoleId) {
        if (hasAdmin) {
          nextRoleIds = hasHost && hostRoleId ? [hostRoleId] : (userRoleId ? [userRoleId] : [])
        } else {
          nextRoleIds = hasHost && hostRoleId ? [adminRoleId, hostRoleId] : [adminRoleId]
        }
      }

      return {
        ...prev,
        role_ids: nextRoleIds,
      }
    })
  }

  const getUserStateLabel = (user) => (user.is_deleted ? 'Заблокирован' : 'Активен')

  const renderUserActions = (user) => (
    <div className="table-actions" style={{ flexWrap: 'wrap', gap: '0.375rem' }}>
      <ActionIconButton title="Редактировать профиль" onClick={() => openEditModal(user)}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M16.586 3.586a2 2 0 112.828 2.828L11.5 14.328 8 15l.672-3.5 7.914-7.914z" />
        </svg>
      </ActionIconButton>
      <ActionIconButton title="Сменить пароль" onClick={() => openPasswordModal(user)}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a5 5 0 00-9.584 2H4a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2v-1m4-10l-3 3m0 0l-3-3m3 3V4" />
        </svg>
      </ActionIconButton>
      <ActionIconButton title="Назначить роли" onClick={() => openRolesModal(user)}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h8a2 2 0 012 2v2h2a2 2 0 012 2v8a2 2 0 01-2 2h-6l-3 2v-2H6a2 2 0 01-2-2V6zm4 3h4m-4 4h4m5 1l1.5 1.5L18 12" />
        </svg>
      </ActionIconButton>
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => handleBlock(user.id, !user.is_deleted)}
        title={user.is_deleted ? 'Разблокировать пользователя' : 'Заблокировать пользователя'}
        aria-label={user.is_deleted ? 'Разблокировать пользователя' : 'Заблокировать пользователя'}
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
        type="button"
        className="btn btn-danger btn-sm"
        onClick={() => handleDelete(user.id)}
        title="Удалить пользователя"
        aria-label="Удалить пользователя"
        style={{
          width: '36px',
          height: '36px',
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  )

  return (
    <div className="container page-shell">
      <section className="page-hero page-hero--admin">
        <div className="page-hero__content">
          <span className="page-hero__eyebrow">Администрирование</span>
          <h1 className="page-hero__title">Администрирование</h1>
          <p className="page-hero__description">
            Управление пользователями, ролями и доступом.
          </p>
          <div className="page-hero__chips">
            <span className="hero-chip">Пользователей: {users.length}</span>
            <span className="hero-chip">Ролей: {roles.length}</span>
          </div>
        </div>
      </section>

      <StatusBanner notice={notice} onDismiss={() => setNotice(null)} />

      <div className="surface-card" style={{
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
        <div className="table-container admin-users-table" style={{
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
                    {renderUserActions(user)}
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

        <div className="admin-users-mobile">
          {users.length > 0 ? (
            users.map(user => (
              <article key={`mobile-${user.id}`} className="admin-user-card">
                <div className="admin-user-card__header">
                  <div>
                    <div className="admin-user-card__login">{user.login}</div>
                    <div className="admin-user-card__fio">{user.fio}</div>
                  </div>
                  <span className={`status-badge ${user.is_deleted ? 'status-completed' : 'status-new'}`}>
                    {getUserStateLabel(user)}
                  </span>
                </div>

                <div className="admin-user-card__meta">
                  <div>
                    <span className="admin-user-card__label">Роли</span>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                      {user.roles.map(role => (
                        <span key={`mobile-role-${user.id}-${role.id}`} className="status-badge status-new">
                          {role.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="admin-user-card__label">Дата регистрации</span>
                    <div className="admin-user-card__value">
                      {new Date(user.created_at).toLocaleDateString('ru-RU')}
                    </div>
                  </div>
                </div>

                <div className="admin-user-card__actions">
                  {renderUserActions(user)}
                </div>
              </article>
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--ttk-gray-light)' }}>
              Пользователи не найдены
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
        <div style={{
          marginBottom: '1rem',
          padding: '0.875rem 1rem',
          borderRadius: 'var(--radius)',
          background: 'rgba(229, 39, 19, 0.05)',
          border: '1px solid rgba(229, 39, 19, 0.12)',
          color: 'var(--ttk-gray)',
          fontSize: '0.9rem',
          lineHeight: 1.5,
        }}>
          Пользователь не совмещается с ведущим и администратором. Администратор может дополнительно быть ведущим.
        </div>

        <div className="checkbox-group">
          {roles.map(role => (
            <button
              key={role.id}
              type="button"
              className="checkbox-label"
              onClick={() => handleRoleCheckbox(role.id)}
              title={ROLE_DESCRIPTIONS[role.name] || role.name}
              aria-pressed={formData.role_ids?.includes(role.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                background: formData.role_ids?.includes(role.id)
                  ? 'linear-gradient(135deg, rgba(229, 39, 19, 0.12), rgba(229, 39, 19, 0.05))'
                  : '#fff',
                border: formData.role_ids?.includes(role.id)
                  ? '1px solid rgba(229, 39, 19, 0.35)'
                  : '1px solid rgba(0, 0, 0, 0.08)',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontWeight: 700, marginBottom: '0.2rem', color: 'var(--ttk-black)' }}>
                  {role.name}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--ttk-gray-light)', lineHeight: 1.45 }}>
                  {ROLE_DESCRIPTIONS[role.name] || 'Роль без описания'}
                </div>
              </div>
              <div style={{
                minWidth: '88px',
                textAlign: 'right',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: formData.role_ids?.includes(role.id) ? 'var(--ttk-red)' : 'var(--ttk-gray-light)',
              }}>
                {formData.role_ids?.includes(role.id) ? 'Выбрано' : 'Назначить'}
              </div>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  )
}

export default AdminPage
