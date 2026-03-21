import { create } from 'zustand'
import { authService } from '../services'

export const useAuthStore = create((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (login, password) => {
    const data = await authService.login(login, password)
    localStorage.setItem('token', data.access_token)
    localStorage.setItem('user', JSON.stringify(data.user))
    set({
      user: data.user,
      token: data.access_token,
      isAuthenticated: true,
      isLoading: false
    })
    return data
  },

  register: async (userData) => {
    const data = await authService.register(userData)
    return data
  },

  logout: () => {
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
    const userStr = localStorage.getItem('user')
    
    if (!token) {
      set({ isLoading: false })
      return
    }

    if (userStr) {
      try {
        const user = JSON.parse(userStr)
        set({ user, isAuthenticated: true, isLoading: false })
        return
      } catch (e) {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
      }
    }

    try {
      const user = await authService.getMe()
      set({ user, isAuthenticated: true, isLoading: false })
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
  }
}))
