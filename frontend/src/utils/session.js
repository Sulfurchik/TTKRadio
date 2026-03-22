const TOKEN_KEY = 'token'
const USER_KEY = 'user'

function getStorage() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch (error) {
    return null
  }
}

export function getSessionToken() {
  const storage = getStorage()
  if (!storage) {
    return null
  }

  try {
    return storage.getItem(TOKEN_KEY)
  } catch (error) {
    return null
  }
}

export function setSessionToken(token) {
  const storage = getStorage()
  if (!storage) {
    return
  }

  try {
    storage.setItem(TOKEN_KEY, token)
  } catch (error) {
    void error
  }
}

export function setStoredUser(user) {
  const storage = getStorage()
  if (!storage) {
    return
  }

  try {
    storage.setItem(USER_KEY, JSON.stringify(user))
  } catch (error) {
    void error
  }
}

export function getStoredUser() {
  const storage = getStorage()
  if (!storage) {
    return null
  }

  try {
    const raw = storage.getItem(USER_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      storage.removeItem(USER_KEY)
      return null
    }

    return parsed
  } catch (error) {
    try {
      storage.removeItem(USER_KEY)
    } catch (removeError) {
      void removeError
    }
    return null
  }
}

export function clearSession() {
  const storage = getStorage()
  if (!storage) {
    return
  }

  try {
    storage.removeItem(TOKEN_KEY)
    storage.removeItem(USER_KEY)
  } catch (error) {
    void error
  }
}
