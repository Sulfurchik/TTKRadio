import { useEffect, useRef, useState } from 'react'

import {
  getSyncedPositionSeconds,
  getTrackKey,
  getTrackSource,
  SYNC_TOLERANCE_SECONDS,
} from '../utils/broadcastSync'


function absolutizeSource(source) {
  if (!source || typeof window === 'undefined') {
    return source
  }

  return new URL(source, window.location.origin).toString()
}


function waitForAudioMetadata(audio) {
  if (!audio) {
    return Promise.resolve()
  }

  if (audio.readyState >= 1) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    let timeoutId = null

    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', handleReady)
      audio.removeEventListener('canplay', handleReady)
      audio.removeEventListener('error', handleError)
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
    }

    const handleReady = () => {
      cleanup()
      resolve()
    }

    const handleError = () => {
      cleanup()
      reject(new Error('Не удалось загрузить метаданные аудиофайла'))
    }

    timeoutId = window.setTimeout(() => {
      cleanup()
      resolve()
    }, 3000)

    audio.addEventListener('loadedmetadata', handleReady)
    audio.addEventListener('canplay', handleReady)
    audio.addEventListener('error', handleError)
  })
}


export function useBroadcastPlayback({
  fetchStatus,
  pollIntervalMs = 1000,
  volume = 1,
  autoResume = true,
  enableAudio = true,
}) {
  const audioRef = useRef(null)
  const loadStatusRef = useRef(null)
  const currentStatusRef = useRef(null)
  const currentTrackKeyRef = useRef(null)
  const userPausedRef = useRef(false)
  const requestIdRef = useRef(0)

  const [broadcastStatus, setBroadcastStatus] = useState(null)
  const [currentTrack, setCurrentTrack] = useState(null)
  const [playbackSeconds, setPlaybackSeconds] = useState(0)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)

  const syncAudioElement = async (status, options = {}) => {
    const audio = audioRef.current
    if (!audio || !status?.current_media) {
      return
    }

    const source = getTrackSource(status.current_media)
    if (!source) {
      return
    }

    const absoluteSource = absolutizeSource(source)
    const hasSourceChanged = audio.src !== absoluteSource
    if (audio.src !== absoluteSource) {
      audio.src = source
      audio.load()
    }

    audio.volume = volume

    if (hasSourceChanged || audio.readyState < 1) {
      setIsBuffering(true)
      try {
        await waitForAudioMetadata(audio)
      } catch (error) {
        console.debug('Не удалось дождаться метаданных аудио', error)
      }
    }

    const targetPosition = getSyncedPositionSeconds(status)
    const shouldSeek =
      options.forceSeek || Math.abs((audio.currentTime || 0) - targetPosition) > SYNC_TOLERANCE_SECONDS

    if (shouldSeek) {
      try {
        audio.currentTime = targetPosition
      } catch (error) {
        console.debug('Не удалось установить позицию воспроизведения', error)
      }
    }

    const shouldPlay =
      status.is_broadcasting && (options.forcePlay || (autoResume && !userPausedRef.current))

    if (!shouldPlay) {
      setIsBuffering(false)
      return
    }

    if (!audio.paused && !options.forcePlay && !hasSourceChanged) {
      return
    }

    try {
      await audio.play()
      setIsAudioPlaying(true)
      setIsBuffering(false)
    } catch (error) {
      setIsAudioPlaying(false)
      setIsBuffering(false)
      console.debug('Автовоспроизведение было заблокировано браузером', error)
    }
  }

  loadStatusRef.current = async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    try {
      const status = await fetchStatus()
      if (requestId !== requestIdRef.current) {
        return
      }

      currentStatusRef.current = status
      setBroadcastStatus(status)
      setCurrentTrack(status?.current_media || null)
      setPlaybackSeconds(getSyncedPositionSeconds(status))

      const nextTrackKey = getTrackKey(status)
      const hasTrackChanged = currentTrackKeyRef.current !== nextTrackKey
      currentTrackKeyRef.current = nextTrackKey

      if (!status?.is_broadcasting || !status.current_media) {
        const audio = audioRef.current
        if (audio) {
          audio.pause()
          audio.removeAttribute('src')
          audio.load()
        }
        currentTrackKeyRef.current = null
        setIsAudioPlaying(false)
        setIsBuffering(false)
        return
      }

      if (!enableAudio) {
        const audio = audioRef.current
        if (audio) {
          audio.pause()
          audio.removeAttribute('src')
          audio.load()
        }
        setIsAudioPlaying(false)
        setIsBuffering(false)
        return
      }

      await syncAudioElement(status, {
        forceSeek: hasTrackChanged,
        forcePlay: hasTrackChanged && autoResume,
      })
    } catch (error) {
      console.error('Ошибка синхронизации эфира:', error)
    }
  }

  useEffect(() => {
    loadStatusRef.current?.()

    const intervalId = setInterval(() => {
      loadStatusRef.current?.()
    }, pollIntervalMs)

    return () => clearInterval(intervalId)
  }, [pollIntervalMs])

  useEffect(() => {
    const syncOnVisibilityReturn = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return
      }
      loadStatusRef.current?.()
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', syncOnVisibilityReturn)
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', syncOnVisibilityReturn)
      window.addEventListener('pageshow', syncOnVisibilityReturn)
      window.addEventListener('online', syncOnVisibilityReturn)
    }

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', syncOnVisibilityReturn)
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', syncOnVisibilityReturn)
        window.removeEventListener('pageshow', syncOnVisibilityReturn)
        window.removeEventListener('online', syncOnVisibilityReturn)
      }
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) {
      return undefined
    }

    audio.volume = volume
    return undefined
  }, [volume])

  useEffect(() => {
    if (enableAudio) {
      loadStatusRef.current?.()
      return undefined
    }

    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    setIsAudioPlaying(false)
    setIsBuffering(false)
    return undefined
  }, [enableAudio])

  useEffect(() => {
    const timerId = setInterval(() => {
      setPlaybackSeconds(getSyncedPositionSeconds(currentStatusRef.current))
    }, 250)

    return () => clearInterval(timerId)
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) {
      return undefined
    }

    const handlePlay = () => {
      setIsAudioPlaying(true)
      setIsBuffering(false)
    }
    const handlePause = () => {
      setIsAudioPlaying(false)
      setIsBuffering(false)
    }
    const handleWaiting = () => {
      if (!audio.paused) {
        setIsBuffering(true)
      }
    }
    const handlePlaying = () => setIsBuffering(false)
    const handleEnded = () => {
      setIsAudioPlaying(false)
      setIsBuffering(true)
      loadStatusRef.current?.()
    }
    const handleError = (error) => {
      console.error('Ошибка воспроизведения эфира:', error)
      setIsAudioPlaying(false)
      setIsBuffering(false)
    }

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('waiting', handleWaiting)
    audio.addEventListener('playing', handlePlaying)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)

    return () => {
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('waiting', handleWaiting)
      audio.removeEventListener('playing', handlePlaying)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
  }, [])

  const play = async () => {
    const status = currentStatusRef.current
    if (!enableAudio || !status?.is_broadcasting || !status.current_media) {
      return
    }

    userPausedRef.current = false
    await syncAudioElement(status, { forceSeek: true, forcePlay: true })
  }

  const pause = () => {
    userPausedRef.current = true
    if (audioRef.current) {
      audioRef.current.pause()
    }
    setIsAudioPlaying(false)
  }

  const resumeAutomaticPlayback = () => {
    userPausedRef.current = false
  }

  return {
    audioRef,
    broadcastStatus,
    currentTrack,
    playbackSeconds,
    isAudioPlaying,
    isBuffering,
    play,
    pause,
    refreshStatus: () => loadStatusRef.current?.(),
    resumeAutomaticPlayback,
  }
}
