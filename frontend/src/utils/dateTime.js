export const PROJECT_TIME_ZONE = 'Europe/Moscow'

function normalizeDateValue(value) {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.trim()
    if (!normalized) {
      return null
    }
    const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized)
    return new Date(hasTimezone ? normalized : `${normalized}Z`)
  }

  return new Date(value)
}

export function formatProjectDate(value, locale, options = {}) {
  const date = normalizeDateValue(value)
  if (!date || Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: PROJECT_TIME_ZONE,
    ...options,
  }).format(date)
}

export function formatProjectDateTime(value, locale, options = {}) {
  const date = normalizeDateValue(value)
  if (!date || Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: PROJECT_TIME_ZONE,
    ...options,
  }).format(date)
}
