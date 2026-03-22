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

function buildStatusMessage(status, fallbackMessage, retryAfterSeconds) {
  switch (status) {
    case 400:
      return fallbackMessage
    case 401:
      return 'Сессия истекла. Войдите снова.'
    case 403:
      return 'Недостаточно прав для выполнения действия.'
    case 404:
      return 'Запрошенный ресурс не найден.'
    case 429:
      return retryAfterSeconds
        ? `Слишком много запросов. Повторите через ${retryAfterSeconds} сек.`
        : 'Слишком много запросов. Повторите позже.'
    default:
      if (status >= 500) {
        return 'Сервер временно недоступен. Повторите попытку позже.'
      }
      return fallbackMessage
  }
}

export function getApiErrorMessage(error, fallbackMessage) {
  if (!error?.response) {
    return 'Не удалось связаться с сервером. Проверьте подключение и повторите попытку.'
  }

  const status = Number(error.response?.status || 0)
  const detail = error?.response?.data?.detail
  const retryAfterHeader = error?.response?.headers?.['retry-after']
  const retryAfterSeconds = Number.parseInt(retryAfterHeader, 10)

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

  if (
    typeof error?.message === 'string' &&
    error.message.trim() &&
    !/^request failed with status code/i.test(error.message.trim())
  ) {
    return error.message
  }

  return buildStatusMessage(status, fallbackMessage, Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 0)
}
