import { useEffect, useRef, useState } from 'react'

import { buildWebSocketUrl, getSupportedLiveStreamPlaybackMimeType } from '../utils/liveStream'


function safelyParseMessage(value) {
  try {
    return JSON.parse(value)
  } catch (error) {
    return null
  }
}

function resetAudioElement(audio) {
  if (!audio) {
    return
  }

  audio.pause()
  audio.removeAttribute('src')
  audio.load()
}

export function useLiveAudioStream({
  enabled,
  websocketUrl,
  volume = 1,
  initiallyActive = false,
}) {
  const audioRef = useRef(null)
  const websocketRef = useRef(null)
  const mediaSourceRef = useRef(null)
  const sourceBufferRef = useRef(null)
  const queueRef = useRef([])
  const objectUrlRef = useRef(null)
  const streamIdleTimeoutRef = useRef(null)
  const pingIntervalRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const shouldReconnectRef = useRef(false)
  const isActiveRef = useRef(Boolean(initiallyActive))

  const [isConnected, setIsConnected] = useState(false)
  const [isStreamActive, setIsStreamActive] = useState(Boolean(initiallyActive))

  const updateActiveState = (nextState) => {
    isActiveRef.current = nextState
    setIsStreamActive(nextState)
  }

  const flushQueue = () => {
    const sourceBuffer = sourceBufferRef.current
    if (!sourceBuffer || sourceBuffer.updating || queueRef.current.length === 0) {
      return
    }

    const nextChunk = queueRef.current.shift()
    try {
      sourceBuffer.appendBuffer(nextChunk)
    } catch (error) {
      queueRef.current = []
      console.error('Не удалось добавить live-аудио в буфер', error)
    }
  }

  useEffect(() => {
    const audio = audioRef.current
    if (audio) {
      audio.volume = Math.max(0, Math.min(1, volume))
    }
  }, [volume])

  useEffect(() => {
    updateActiveState(Boolean(initiallyActive))
  }, [initiallyActive])

  useEffect(() => {
    if (!enabled || !websocketUrl) {
      shouldReconnectRef.current = false
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
      }
      if (streamIdleTimeoutRef.current) {
        clearTimeout(streamIdleTimeoutRef.current)
      }
      websocketRef.current?.close()
      websocketRef.current = null
      sourceBufferRef.current = null
      mediaSourceRef.current = null
      queueRef.current = []
      setIsConnected(false)
      updateActiveState(false)

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
      resetAudioElement(audioRef.current)
      return undefined
    }

    const audio = audioRef.current
    const playbackMimeType = getSupportedLiveStreamPlaybackMimeType()
    if (!audio || !playbackMimeType) {
      return undefined
    }

    shouldReconnectRef.current = true
    queueRef.current = []

    const mediaSource = new MediaSource()
    mediaSourceRef.current = mediaSource
    objectUrlRef.current = URL.createObjectURL(mediaSource)
    audio.src = objectUrlRef.current
    audio.autoplay = true
    audio.playsInline = true

    const connect = () => {
      const socket = new WebSocket(buildWebSocketUrl(websocketUrl))
      socket.binaryType = 'arraybuffer'
      websocketRef.current = socket

      socket.onopen = () => {
        setIsConnected(true)
        socket.send('ping')
        pingIntervalRef.current = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send('ping')
          }
        }, 15000)
      }

      socket.onmessage = async (event) => {
        if (typeof event.data === 'string') {
          const payload = safelyParseMessage(event.data)
          if (payload?.type === 'live_audio_start') {
            updateActiveState(true)
          }
          if (payload?.type === 'live_audio_stop') {
            updateActiveState(false)
            audio.pause()
          }
          return
        }

        const arrayBuffer = event.data instanceof ArrayBuffer
          ? event.data
          : await event.data.arrayBuffer()
        queueRef.current.push(new Uint8Array(arrayBuffer))
        updateActiveState(true)

        if (streamIdleTimeoutRef.current) {
          clearTimeout(streamIdleTimeoutRef.current)
        }
        streamIdleTimeoutRef.current = window.setTimeout(() => {
          updateActiveState(false)
          audio.pause()
        }, 1600)

        flushQueue()
        audio.play().catch(() => {})
      }

      socket.onclose = () => {
        setIsConnected(false)
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current)
        }
        if (shouldReconnectRef.current) {
          reconnectTimeoutRef.current = window.setTimeout(connect, 1800)
        }
      }

      socket.onerror = () => {
        socket.close()
      }
    }

    const handleSourceOpen = () => {
      if (!mediaSourceRef.current || mediaSourceRef.current.readyState !== 'open') {
        return
      }

      try {
        const sourceBuffer = mediaSourceRef.current.addSourceBuffer(playbackMimeType)
        sourceBuffer.mode = 'sequence'
        sourceBuffer.addEventListener('updateend', flushQueue)
        sourceBufferRef.current = sourceBuffer
        connect()
      } catch (error) {
        console.error('Не удалось подготовить live-аудио поток', error)
      }
    }

    mediaSource.addEventListener('sourceopen', handleSourceOpen)

    return () => {
      shouldReconnectRef.current = false
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (streamIdleTimeoutRef.current) {
        clearTimeout(streamIdleTimeoutRef.current)
      }
      mediaSource.removeEventListener('sourceopen', handleSourceOpen)
      websocketRef.current?.close()
      websocketRef.current = null
      sourceBufferRef.current = null
      mediaSourceRef.current = null
      queueRef.current = []
      setIsConnected(false)
      updateActiveState(false)
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
      resetAudioElement(audio)
    }
  }, [enabled, websocketUrl])

  return {
    audioRef,
    isConnected,
    isStreamActive,
  }
}
