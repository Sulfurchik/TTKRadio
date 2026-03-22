import { create } from 'zustand'
import { authService } from '../services'
import { clearSession, getSessionToken, setSessionToken, setStoredUser } from '../utils/session'

export const useAuthStore = create((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (login, password) => {
    const normalizedLogin = login.trim()
    const data = await authService.login(normalizedLogin, password)
    setSessionToken(data.access_token)
    setStoredUser(data.user)
    set({
      user: data.user,
      token: data.access_token,
      isAuthenticated: true,
      isLoading: false
    })
    authService.updatePresence().catch(() => {})
    return data
  },

  register: async (userData) => {
    const data = await authService.register(userData)
    return data
  },

  logout: async () => {
    try {
      await authService.markOffline()
    } catch (error) {
      void error
    }
    authService.logout()
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false
    })
  },

  checkAuth: async () => {
    const token = getSessionToken()

    if (!token) {
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      })
      return
    }

    set({ token, isLoading: true })

    try {
      const user = await authService.getMe()
      setStoredUser(user)
      set({
        user,
        token,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (error) {
      clearSession()
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false
      })
    }
  },

  updateUser: (user) => {
    setStoredUser(user)
    set({ user })
  },

  syncPresence: async () => {
    try {
      const user = await authService.updatePresence()
      setStoredUser(user)
      set({ user })
    } catch (error) {
      void error
    }
  }
}))
