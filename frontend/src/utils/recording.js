const AUDIO_FORMAT_CANDIDATES = [
  { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg' },
  { mimeType: 'audio/ogg', extension: 'ogg' },
  { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
  { mimeType: 'audio/webm', extension: 'webm' },
  { mimeType: 'audio/mp4;codecs=mp4a.40.2', extension: 'm4a' },
  { mimeType: 'audio/mp4', extension: 'm4a' },
]

function inferFormat(mimeType = '') {
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

  const resolvedFormat = inferFormat(recorder.mimeType || supportedFormat?.mimeType)
  return {
    recorder,
    mimeType: resolvedFormat.mimeType,
    extension: resolvedFormat.extension,
  }
}

export function buildRecordedAudioFile(blob, baseName, format) {
  const resolvedFormat = format?.extension ? format : inferFormat(blob.type)
  const fileName = `${baseName}.${resolvedFormat.extension}`
  const fileType = blob.type || resolvedFormat.mimeType

  try {
    return new File([blob], fileName, {
      type: fileType,
    })
  } catch (error) {
    const fallbackBlob = blob.slice(0, blob.size, fileType)
    Object.defineProperty(fallbackBlob, 'name', {
      configurable: true,
      enumerable: true,
      value: fileName,
      writable: false,
    })
    Object.defineProperty(fallbackBlob, 'lastModified', {
      configurable: true,
      enumerable: true,
      value: Date.now(),
      writable: false,
    })
    return fallbackBlob
  }
}

export function stopMediaStream(stream) {
  stream?.getTracks().forEach((track) => track.stop())
}
