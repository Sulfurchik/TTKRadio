export function getMediaDisplayName(name) {
  if (typeof name !== 'string') {
    return ''
  }

  const trimmed = name.trim()
  if (!trimmed) {
    return ''
  }

  return trimmed.replace(/\.[^./\\]+$/, '')
}
