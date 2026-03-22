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

export function getStoredValue(key, fallbackValue = null) {
  const storage = getStorage()
  if (!storage) {
    return fallbackValue
  }

  try {
    const value = storage.getItem(key)
    return value ?? fallbackValue
  } catch (error) {
    return fallbackValue
  }
}

export function setStoredValue(key, value) {
  const storage = getStorage()
  if (!storage) {
    return
  }

  try {
    storage.setItem(key, value)
  } catch (error) {
    void error
  }
}

export function removeStoredValue(key) {
  const storage = getStorage()
  if (!storage) {
    return
  }

  try {
    storage.removeItem(key)
  } catch (error) {
    void error
  }
}
