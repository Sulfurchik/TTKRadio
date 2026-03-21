import { create } from 'zustand'

const STORAGE_KEY = 'theme'

function applyTheme(theme, animate = false) {
  if (typeof document === 'undefined') {
    return
  }

  const root = document.documentElement
  if (animate) {
    root.style.animation = 'themeFade 0.4s ease'
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        root.style.animation = ''
      }, 400)
    }
  }
  root.setAttribute('data-theme', theme)
}

const initialTheme =
  typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) || 'light' : 'light'

applyTheme(initialTheme)

export const useTheme = create((set, get) => ({
  theme: initialTheme,
  setTheme: (theme) => {
    const nextTheme = theme === 'dark' ? 'dark' : 'light'
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, nextTheme)
    }
    applyTheme(nextTheme, true)
    set({ theme: nextTheme })
  },
  toggleTheme: () => {
    const nextTheme = get().theme === 'dark' ? 'light' : 'dark'
    get().setTheme(nextTheme)
  },
}))
