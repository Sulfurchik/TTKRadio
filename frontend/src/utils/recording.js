const AUDIO_FORMAT_CANDIDATES = [
  { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg' },
  { mimeType: 'audio/ogg', extension: 'ogg' },
  { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
  { mimeType: 'audio/webm', extension: 'webm' },
  { mimeType: 'audio/mp4;codecs=mp4a.40.2', extension: 'm4a' },
  { mimeType: 'audio/mp4', extension: 'm4a' },
]

function detectFormat(mimeType = '') {
  const normalized = mimeType.toLowerCase()
  if (normalized.includes('ogg')) {
    return { mimeType: 'audio/ogg', extension: 'ogg' }
  }
  if (normalized.includes('wav') || normalized.includes('wave')) {
    return { mimeType: 'audio/wav', extension: 'wav' }
  }
  if (normalized.includes('mp4') || normalized.includes('m4a') || normalized.includes('aac')) {
    return { mimeType: 'audio/mp4', extension: 'm4a' }
  }
  if (normalized.includes('mpeg') || normalized.includes('mp3')) {
    return { mimeType: 'audio/mpeg', extension: 'mp3' }
  }
  return null
}

export function inferFormat(mimeType = '') {
  return detectFormat(mimeType) || { mimeType: 'audio/webm', extension: 'webm' }
}

export function resolveRecordedAudioFormat(...mimeCandidates) {
  for (const mimeCandidate of mimeCandidates) {
    const detectedFormat = detectFormat(mimeCandidate || '')
    if (detectedFormat) {
      return detectedFormat
    }
  }
  return { mimeType: 'audio/webm', extension: 'webm' }
}

export function createAudioRecorder(stream) {
  const supportedFormat = AUDIO_FORMAT_CANDIDATES.find((candidate) => {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
      return false
    }
    return MediaRecorder.isTypeSupported(candidate.mimeType)
  })

  const recorder = supportedFormat?.mimeType
    ? new MediaRecorder(stream, { mimeType: supportedFormat.mimeType })
    : new MediaRecorder(stream)

  const resolvedFormat = resolveRecordedAudioFormat(recorder.mimeType, supportedFormat?.mimeType)
  return {
    recorder,
    mimeType: resolvedFormat.mimeType,
    extension: resolvedFormat.extension,
  }
}

export function buildRecordedAudioFile(blob, baseName, format) {
  const resolvedFormat = format?.extension ? format : resolveRecordedAudioFormat(blob.type)
  return new File([blob], `${baseName}.${resolvedFormat.extension}`, {
    type: blob.type || resolvedFormat.mimeType,
  })
}

export function getBlobMediaDuration(blob) {
  if (!blob || typeof window === 'undefined') {
    return Promise.resolve(0)
  }

  return new Promise((resolve) => {
    const media = document.createElement('audio')
    const objectUrl = URL.createObjectURL(blob)
    let timeoutId = null

    const cleanup = (duration = 0) => {
      media.removeEventListener('loadedmetadata', handleLoadedMetadata)
      media.removeEventListener('durationchange', handleLoadedMetadata)
      media.removeEventListener('error', handleError)
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
      URL.revokeObjectURL(objectUrl)
      resolve(Number.isFinite(duration) && duration > 0 ? duration : 0)
    }

    const handleLoadedMetadata = () => cleanup(media.duration)
    const handleError = () => cleanup(0)

    timeoutId = window.setTimeout(() => cleanup(media.duration), 4000)

    media.preload = 'metadata'
    media.src = objectUrl
    media.addEventListener('loadedmetadata', handleLoadedMetadata)
    media.addEventListener('durationchange', handleLoadedMetadata)
    media.addEventListener('error', handleError)
    media.load()
  })
}

export function stopMediaStream(stream) {
  stream?.getTracks().forEach((track) => track.stop())
}
