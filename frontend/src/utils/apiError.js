function formatValidationEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return ''
  }

  const location = Array.isArray(entry.loc) ? entry.loc.join(' -> ') : ''
  const message = typeof entry.msg === 'string' ? entry.msg : ''

  if (location && message) {
    return `${location}: ${message}`
  }
  return message || ''
}

export function getApiErrorMessage(error, fallbackMessage) {
  const detail = error?.response?.data?.detail

  if (typeof detail === 'string' && detail.trim()) {
    return detail
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map(formatValidationEntry)
      .filter(Boolean)
    if (messages.length > 0) {
      return messages.join('; ')
    }
  }

  if (detail && typeof detail === 'object') {
    const objectMessage = formatValidationEntry(detail)
    if (objectMessage) {
      return objectMessage
    }
  }

  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message
  }

  return fallbackMessage
}
