const LIVE_INPUT_WORKLET_NAME = 'transcom-live-input-processor'
const LIVE_INPUT_FRAME_SIZE = 2048
const LIVE_INPUT_WORKLET_SOURCE = `
class TranscomLiveInputProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.frameSize = ${LIVE_INPUT_FRAME_SIZE}
    this.buffer = new Float32Array(this.frameSize)
    this.offset = 0
  }

  process(inputs) {
    const channel = inputs?.[0]?.[0]
    if (!channel || !channel.length) {
      return true
    }

    let sourceOffset = 0
    while (sourceOffset < channel.length) {
      const available = this.frameSize - this.offset
      const copyLength = Math.min(available, channel.length - sourceOffset)
      this.buffer.set(channel.subarray(sourceOffset, sourceOffset + copyLength), this.offset)
      this.offset += copyLength
      sourceOffset += copyLength

      if (this.offset >= this.frameSize) {
        this.port.postMessage(this.buffer.slice(0))
        this.offset = 0
      }
    }

    return true
  }
}

registerProcessor('${LIVE_INPUT_WORKLET_NAME}', TranscomLiveInputProcessor)
`

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

export function clampUnitValue(value, fallback = 1) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) {
    return fallback
  }

  return Math.max(0, Math.min(1, numericValue))
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

export async function createLiveInputProcessor(audioContext, onChunk) {
  const safeOnChunk = (chunk) => {
    if (!chunk) {
      return
    }

    if (chunk instanceof Float32Array) {
      onChunk(chunk)
      return
    }

    onChunk(Float32Array.from(chunk))
  }

  const silentGainNode = audioContext.createGain()
  silentGainNode.gain.value = 0

  if (audioContext.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
    const moduleUrl = URL.createObjectURL(new Blob([LIVE_INPUT_WORKLET_SOURCE], { type: 'application/javascript' }))

    try {
      await audioContext.audioWorklet.addModule(moduleUrl)
      const processorNode = new AudioWorkletNode(audioContext, LIVE_INPUT_WORKLET_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: 'explicit',
      })

      processorNode.port.onmessage = (event) => {
        safeOnChunk(event.data)
      }
      processorNode.connect(silentGainNode)
      silentGainNode.connect(audioContext.destination)

      return {
        processorNode,
        keepAliveNode: silentGainNode,
        cleanup: () => {
          processorNode.port.onmessage = null
          URL.revokeObjectURL(moduleUrl)
        },
      }
    } catch (error) {
      URL.revokeObjectURL(moduleUrl)
      console.debug('Не удалось инициализировать AudioWorklet для live-микрофона, используется fallback', error)
    }
  }

  if (typeof audioContext.createScriptProcessor !== 'function') {
    silentGainNode.disconnect()
    throw new Error('Audio processor is not supported')
  }

  const processorNode = audioContext.createScriptProcessor(LIVE_INPUT_FRAME_SIZE, 1, 1)
  processorNode.onaudioprocess = (event) => {
    safeOnChunk(event.inputBuffer.getChannelData(0).slice())
  }
  processorNode.connect(silentGainNode)
  silentGainNode.connect(audioContext.destination)

  return {
    processorNode,
    keepAliveNode: silentGainNode,
    cleanup: () => {
      processorNode.onaudioprocess = null
    },
  }
}
