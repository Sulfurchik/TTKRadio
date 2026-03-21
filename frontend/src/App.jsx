import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import PlayerPage from './pages/PlayerPage'
import AdminPage from './pages/AdminPage'
import HostPage from './pages/HostPage'
import Navbar from './components/Navbar'

function App() {
  const { isAuthenticated, user, isLoading, checkAuth } = useAuthStore()

  useEffect(() => {
    checkAuth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasRole = (roles) => {
    if (!user) return false
    return user.roles.some(r => roles.includes(r.name))
  }

  if (isLoading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <div className="app">
        {isAuthenticated && <Navbar />}
        <Routes>
          <Route
            path="/login"
            element={!isAuthenticated ? <LoginPage /> : <Navigate to="/" />}
          />
          <Route
            path="/register"
            element={!isAuthenticated ? <RegisterPage /> : <Navigate to="/" />}
          />
          <Route
            path="/"
            element={isAuthenticated ? <PlayerPage /> : <Navigate to="/login" />}
          />
          <Route
            path="/admin"
            element={isAuthenticated && hasRole(['Администратор']) ? <AdminPage /> : <Navigate to="/login" />}
          />
          <Route
            path="/host"
            element={isAuthenticated && (hasRole(['Ведущий']) || hasRole(['Администратор'])) ? <HostPage /> : <Navigate to="/login" />}
          />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
