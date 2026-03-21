import { useEffect, useRef, useState } from 'react'

import { buildWebSocketUrl, getAudioContextClass, int16BufferToFloat32Array } from '../utils/liveStream'


function safelyParseJson(value) {
  try {
    return JSON.parse(value)
  } catch (error) {
    return null
  }
}

export function useLiveAudioStream({
  enabled,
  websocketUrl,
  volume = 1,
  initiallyActive = false,
}) {
  const websocketRef = useRef(null)
  const audioContextRef = useRef(null)
  const gainNodeRef = useRef(null)
  const nextStartTimeRef = useRef(0)
  const pingIntervalRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const shouldReconnectRef = useRef(false)
  const streamConfigRef = useRef({ sampleRate: 48000, channels: 1 })
  const sourceNodesRef = useRef(new Set())

  const [isConnected, setIsConnected] = useState(false)
  const [isStreamActive, setIsStreamActive] = useState(Boolean(initiallyActive))

  const ensureAudioContext = async () => {
    if (!audioContextRef.current) {
      const AudioContextClass = getAudioContextClass()
      if (!AudioContextClass) {
        throw new Error('AudioContext is not supported')
      }

      const audioContext = new AudioContextClass()
      const gainNode = audioContext.createGain()
      gainNode.gain.value = Math.max(0, Math.min(1, volume))
      gainNode.connect(audioContext.destination)
      audioContextRef.current = audioContext
      gainNodeRef.current = gainNode
    }

    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume()
    }

    return audioContextRef.current
  }

  const scheduleChunkPlayback = async (arrayBuffer) => {
    const audioContext = await ensureAudioContext()
    const float32Samples = int16BufferToFloat32Array(arrayBuffer)
    const { sampleRate } = streamConfigRef.current
    const audioBuffer = audioContext.createBuffer(1, float32Samples.length, sampleRate)
    audioBuffer.copyToChannel(float32Samples, 0)

    const sourceNode = audioContext.createBufferSource()
    sourceNode.buffer = audioBuffer
    sourceNode.connect(gainNodeRef.current)
    sourceNodesRef.current.add(sourceNode)
    sourceNode.onended = () => {
      sourceNodesRef.current.delete(sourceNode)
      sourceNode.disconnect()
    }

    const safeLeadTime = 0.08
    const startedAt = Math.max(audioContext.currentTime + safeLeadTime, nextStartTimeRef.current)
    sourceNode.start(startedAt)
    nextStartTimeRef.current = startedAt + audioBuffer.duration
  }

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = Math.max(0, Math.min(1, volume))
    }
  }, [volume])

  useEffect(() => {
    setIsStreamActive(Boolean(initiallyActive))
  }, [initiallyActive])

  useEffect(() => {
    if (!enabled || !websocketUrl || !getAudioContextClass()) {
      shouldReconnectRef.current = false
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      websocketRef.current?.close()
      websocketRef.current = null
      setIsConnected(false)
      setIsStreamActive(false)
      nextStartTimeRef.current = 0
      sourceNodesRef.current.forEach(sourceNode => {
        try {
          sourceNode.stop()
        } catch (error) {
          void error
        }
        sourceNode.disconnect()
      })
      sourceNodesRef.current.clear()
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
        audioContextRef.current = null
        gainNodeRef.current = null
      }
      return undefined
    }

    shouldReconnectRef.current = true

    const connect = () => {
      const socket = new WebSocket(buildWebSocketUrl(websocketUrl))
      socket.binaryType = 'arraybuffer'
      websocketRef.current = socket

      socket.onopen = async () => {
        setIsConnected(true)
        await ensureAudioContext().catch(() => {})
        socket.send('ping')
        pingIntervalRef.current = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send('ping')
          }
        }, 15000)
      }

      socket.onmessage = async (event) => {
        if (typeof event.data === 'string') {
          const payload = safelyParseJson(event.data)
          if (payload?.type === 'live_audio_start') {
            streamConfigRef.current = {
              sampleRate: payload.sampleRate || 48000,
              channels: payload.channels || 1,
            }
            setIsStreamActive(true)
            nextStartTimeRef.current = 0
          }
          if (payload?.type === 'live_audio_stop') {
            setIsStreamActive(false)
            nextStartTimeRef.current = 0
          }
          return
        }

        setIsStreamActive(true)
        await scheduleChunkPlayback(event.data)
      }

      socket.onclose = () => {
        setIsConnected(false)
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current)
        }
        if (shouldReconnectRef.current) {
          reconnectTimeoutRef.current = window.setTimeout(connect, 1500)
        }
      }

      socket.onerror = () => {
        socket.close()
      }
    }

    connect()

    return () => {
      shouldReconnectRef.current = false
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      websocketRef.current?.close()
      websocketRef.current = null
      setIsConnected(false)
      setIsStreamActive(false)
      nextStartTimeRef.current = 0
      sourceNodesRef.current.forEach(sourceNode => {
        try {
          sourceNode.stop()
        } catch (error) {
          void error
        }
        sourceNode.disconnect()
      })
      sourceNodesRef.current.clear()
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
        audioContextRef.current = null
        gainNodeRef.current = null
      }
    }
  }, [enabled, websocketUrl])

  return {
    isConnected,
    isStreamActive,
    resume: () => ensureAudioContext().catch(() => {}),
    pause: async () => {
      if (audioContextRef.current?.state === 'running') {
        await audioContextRef.current.suspend()
      }
      nextStartTimeRef.current = 0
    },
  }
}
