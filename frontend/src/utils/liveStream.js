export function buildWebSocketUrl(path) {
  if (typeof window === 'undefined') {
    return path
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return new URL(path, `${protocol}//${window.location.host}`).toString()
}

export function getAudioContextClass() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.AudioContext || window.webkitAudioContext || null
}

export function float32ToInt16Buffer(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2)
  const view = new DataView(buffer)

  for (let index = 0; index < float32Array.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, float32Array[index]))
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }

  return buffer
}

export function int16BufferToFloat32Array(buffer) {
  const view = new DataView(buffer)
  const samples = new Float32Array(buffer.byteLength / 2)

  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 0x7fff
  }

  return samples
}
