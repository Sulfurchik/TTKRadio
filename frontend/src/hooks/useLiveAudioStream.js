import { useEffect, useRef, useState } from 'react'

import { buildWebSocketUrl } from '../utils/liveStream'


function revokeQueue(queue) {
  queue.forEach((item) => {
    if (item?.url) {
      URL.revokeObjectURL(item.url)
    }
  })
}

export function useLiveAudioStream({
  enabled,
  websocketUrl,
  volume = 1,
  initiallyActive = false,
}) {
  const audioRef = useRef(null)
  const websocketRef = useRef(null)
  const pingIntervalRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const shouldReconnectRef = useRef(false)
  const chunkQueueRef = useRef([])
  const isChunkPlayingRef = useRef(false)

  const [isConnected, setIsConnected] = useState(false)
  const [isStreamActive, setIsStreamActive] = useState(Boolean(initiallyActive))

  const playNextChunk = () => {
    const audio = audioRef.current
    if (!audio || isChunkPlayingRef.current || chunkQueueRef.current.length === 0) {
      return
    }

    const nextChunk = chunkQueueRef.current.shift()
    if (!nextChunk) {
      return
    }

    isChunkPlayingRef.current = true
    audio.src = nextChunk.url
    audio.play().catch(() => {
      isChunkPlayingRef.current = false
      URL.revokeObjectURL(nextChunk.url)
      playNextChunk()
    })
  }

  useEffect(() => {
    const audio = audioRef.current
    if (audio) {
      audio.volume = Math.max(0, Math.min(1, volume))
    }
  }, [volume])

  useEffect(() => {
    setIsStreamActive(Boolean(initiallyActive))
  }, [initiallyActive])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !enabled || !websocketUrl) {
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
      isChunkPlayingRef.current = false
      revokeQueue(chunkQueueRef.current)
      chunkQueueRef.current = []
      if (audio) {
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
      }
      return undefined
    }

    shouldReconnectRef.current = true

    const connect = () => {
      const socket = new WebSocket(buildWebSocketUrl(websocketUrl))
      socket.binaryType = 'blob'
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
          if (event.data.includes('live_audio_start')) {
            setIsStreamActive(true)
          }
          if (event.data.includes('live_audio_stop')) {
            setIsStreamActive(false)
            audio.pause()
            audio.removeAttribute('src')
            audio.load()
            isChunkPlayingRef.current = false
            revokeQueue(chunkQueueRef.current)
            chunkQueueRef.current = []
          }
          return
        }

        const blob = event.data instanceof Blob ? event.data : new Blob([await event.data.arrayBuffer()], { type: 'audio/webm' })
        if (blob.size === 0) {
          return
        }

        const url = URL.createObjectURL(blob)
        chunkQueueRef.current.push({ url })
        setIsStreamActive(true)
        playNextChunk()
      }

      socket.onclose = () => {
        setIsConnected(false)
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current)
        }
        if (shouldReconnectRef.current) {
          reconnectTimeoutRef.current = window.setTimeout(connect, 1600)
        }
      }

      socket.onerror = () => {
        socket.close()
      }
    }

    const handleEnded = () => {
      const currentUrl = audio.currentSrc
      if (currentUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(currentUrl)
      }
      isChunkPlayingRef.current = false
      playNextChunk()
    }

    connect()
    audio.addEventListener('ended', handleEnded)

    return () => {
      shouldReconnectRef.current = false
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      audio.removeEventListener('ended', handleEnded)
      websocketRef.current?.close()
      websocketRef.current = null
      revokeQueue(chunkQueueRef.current)
      chunkQueueRef.current = []
      isChunkPlayingRef.current = false
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
  }, [enabled, websocketUrl])

  return {
    audioRef,
    isConnected,
    isStreamActive,
  }
}
