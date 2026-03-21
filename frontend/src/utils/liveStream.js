const LIVE_STREAM_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm; codecs=opus',
  'audio/webm',
]

export function buildWebSocketUrl(path) {
  if (typeof window === 'undefined') {
    return path
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return new URL(path, `${protocol}//${window.location.host}`).toString()
}

export function getSupportedLiveStreamPlaybackMimeType() {
  if (typeof window === 'undefined' || typeof MediaSource === 'undefined') {
    return null
  }

  return LIVE_STREAM_MIME_CANDIDATES.find(candidate => MediaSource.isTypeSupported(candidate)) || null
}

export function createStreamingAudioRecorder(stream) {
  const supportedMimeType = LIVE_STREAM_MIME_CANDIDATES.find((candidate) => {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
      return false
    }

    return MediaRecorder.isTypeSupported(candidate)
  })

  if (!supportedMimeType) {
    throw new Error('Live microphone streaming is not supported in this browser')
  }

  return {
    recorder: new MediaRecorder(stream, { mimeType: supportedMimeType }),
    mimeType: supportedMimeType,
  }
}
