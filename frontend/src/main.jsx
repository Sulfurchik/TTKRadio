import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import AppErrorBoundary from './components/AppErrorBoundary'
import faviconUrl from './assets/favicon.png'
import { getStoredValue } from './utils/browserStorage'
import './index.css'

const savedLanguage = getStoredValue('language', 'ru')
document.documentElement.setAttribute('lang', savedLanguage)

const savedTheme = getStoredValue('theme', 'light')
document.documentElement.setAttribute('data-theme', savedTheme)

const faviconLink = document.querySelector("link[rel='icon']") || document.createElement('link')
faviconLink.setAttribute('rel', 'icon')
faviconLink.setAttribute('type', 'image/png')
faviconLink.setAttribute('href', faviconUrl)
document.head.appendChild(faviconLink)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
)
