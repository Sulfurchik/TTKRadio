import { create } from 'zustand'
import { authService } from '../services'

export const useAuthStore = create((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (login, password) => {
    const normalizedLogin = login.trim()
    const data = await authService.login(normalizedLogin, password)
    localStorage.setItem('token', data.access_token)
    localStorage.setItem('user', JSON.stringify(data.user))
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
    const token = localStorage.getItem('token')

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
      localStorage.setItem('user', JSON.stringify(user))
      set({
        user,
        token,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (error) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false
      })
    }
  },

  updateUser: (user) => {
    localStorage.setItem('user', JSON.stringify(user))
    set({ user })
  },

  syncPresence: async () => {
    try {
      const user = await authService.updatePresence()
      localStorage.setItem('user', JSON.stringify(user))
      set({ user })
    } catch (error) {
      void error
    }
  }
}))
