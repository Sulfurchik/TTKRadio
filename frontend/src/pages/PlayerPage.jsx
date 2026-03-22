import { useEffect, useRef, useState } from 'react'

import MessagesList from '../components/MessagesList'
import StatusBanner from '../components/StatusBanner'
import { useLanguage } from '../hooks/useLanguage'
import { useBroadcastPlayback } from '../hooks/useBroadcastPlayback'
import { useLiveAudioStream } from '../hooks/useLiveAudioStream'
import { playerService } from '../services'
import { formatPlaybackTime, getSyncedPositionSeconds, SYNC_TOLERANCE_SECONDS } from '../utils/broadcastSync'
import { clampUnitValue } from '../utils/liveStream'
import { getMediaDisplayName } from '../utils/media'
import { buildRecordedAudioFile, createAudioRecorder, stopMediaStream } from '../utils/recording'

function waitForVideoMetadata(video) {
  if (!video) {
    return Promise.resolve()
  }

  if (video.readyState >= 1) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    let timeoutId = null

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', handleReady)
      video.removeEventListener('canplay', handleReady)
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
    }

    const handleReady = () => {
      cleanup()
      resolve()
    }

    timeoutId = window.setTimeout(() => {
      cleanup()
      resolve()
    }, 3000)

    video.addEventListener('loadedmetadata', handleReady)
    video.addEventListener('canplay', handleReady)
  })
}

function PlayerPage() {
  const t = useLanguage(state => state.t)

  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([])
  const [isRecording, setIsRecording] = useState(false)
  const [voiceFile, setVoiceFile] = useState(null)
  const [notice, setNotice] = useState(null)
  const [isPlayerManuallyPaused, setIsPlayerManuallyPaused] = useState(false)
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('player_volume')
    return clampUnitValue(saved, 0.8)
  })

  const mediaRecorderRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const audioChunksRef = useRef([])
  const recordingFormatRef = useRef({ mimeType: 'audio/webm', extension: 'webm' })
  const videoRef = useRef(null)
  const videoContainerRef = useRef(null)
  const playerCardRef = useRef(null)
  const [liveMicHintVisible, setLiveMicHintVisible] = useState(false)
  const [communicationHeight, setCommunicationHeight] = useState(null)

  const buildCommunicationItems = (textMessages, voiceMessages) => (
    [
      ...(textMessages || []).map(message => ({ ...message, message_type: 'text' })),
      ...(voiceMessages || []).map(message => ({ ...message, message_type: 'voice' })),
    ].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
  )

  const {
    audioRef: mediaRef,
    broadcastStatus,
    currentTrack,
    playbackSeconds,
    isAudioPlaying,
    isBuffering,
    play,
    pause,
  } = useBroadcastPlayback({
    fetchStatus: playerService.getBroadcastStatus,
    pollIntervalMs: 1000,
    volume,
    autoResume: true,
    duckFactor: liveMicHintVisible ? 0.22 : 1,
  })

  const effectiveBroadcastVolume = Math.max(
    0,
    Math.min(1, volume * (typeof broadcastStatus?.volume === 'number' ? broadcastStatus.volume : 1)),
  )
  const {
    isStreamActive: isLiveStreamActive,
    resume: resumeLiveAudio,
    pause: pauseLiveAudio,
  } = useLiveAudioStream({
    enabled: Boolean(broadcastStatus?.is_broadcasting && broadcastStatus?.websocket_url && !isPlayerManuallyPaused),
    websocketUrl: broadcastStatus?.websocket_url || null,
    volume: effectiveBroadcastVolume,
    initiallyActive: Boolean(broadcastStatus?.live_audio_active),
  })

  useEffect(() => {
    localStorage.setItem('player_volume', volume.toString())
  }, [volume])

  useEffect(() => {
    loadMessages()
    const intervalId = setInterval(loadMessages, 5000)
    return () => clearInterval(intervalId)
  }, [])

  useEffect(() => {
    return () => {
      stopMediaStream(mediaStreamRef.current)
    }
  }, [])

  useEffect(() => {
    setLiveMicHintVisible(Boolean(broadcastStatus?.live_audio_active || isLiveStreamActive))
  }, [broadcastStatus?.live_audio_active, isLiveStreamActive])

  useEffect(() => {
    if (broadcastStatus?.is_broadcasting) {
      return
    }

    setIsPlayerManuallyPaused(false)
  }, [broadcastStatus?.is_broadcasting])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const updateHeight = () => {
      if (window.innerWidth < 1024) {
        setCommunicationHeight(null)
        return
      }

      setCommunicationHeight(playerCardRef.current?.offsetHeight || null)
    }

    updateHeight()

    let observer = null
    if (typeof ResizeObserver !== 'undefined' && playerCardRef.current) {
      observer = new ResizeObserver(updateHeight)
      observer.observe(playerCardRef.current)
    }

    window.addEventListener('resize', updateHeight)

    return () => {
      window.removeEventListener('resize', updateHeight)
      observer?.disconnect()
    }
  }, [currentTrack?.id, isBuffering, isAudioPlaying, liveMicHintVisible, messages.length])

  useEffect(() => {
    const video = videoRef.current
    if (!video) {
      return undefined
    }

    let cancelled = false

    if (currentTrack?.file_type !== 'video' || !currentTrack?.storage_url) {
      video.pause()
      video.removeAttribute('src')
      video.load()
      return undefined
    }

    if (typeof window === 'undefined') {
      return undefined
    }

    const absoluteSource = new URL(currentTrack.storage_url, window.location.origin).toString()
    const hasSourceChanged = video.src !== absoluteSource
    if (hasSourceChanged) {
      video.src = currentTrack.storage_url
      video.load()
    }

    const syncVideo = async () => {
      await waitForVideoMetadata(video)
      if (cancelled) {
        return
      }

      if (isPlayerManuallyPaused) {
        video.pause()
        return
      }

      const targetPosition = getSyncedPositionSeconds(broadcastStatus)
      if (
        Number.isFinite(targetPosition) &&
        Math.abs((video.currentTime || 0) - targetPosition) > SYNC_TOLERANCE_SECONDS
      ) {
        try {
          video.currentTime = Math.max(0, targetPosition)
        } catch (error) {
          console.debug('Не удалось синхронизировать видеопоток', error)
        }
      }

      video.muted = true

      if (broadcastStatus?.is_broadcasting && !broadcastStatus?.is_paused && isAudioPlaying) {
        video.play().catch(() => {})
      } else {
        video.pause()
      }
    }

    syncVideo().catch(() => {})

    return () => {
      cancelled = true
    }
  }, [broadcastStatus, currentTrack, isAudioPlaying, isPlayerManuallyPaused])

  const loadMessages = async () => {
    try {
      const [textMessages, voiceMessages] = await Promise.all([
        playerService.getMessages(),
        playerService.getVoiceMessages(),
      ])
      setMessages(buildCommunicationItems(
        textMessages.filter(msg => msg.status !== 'completed'),
        voiceMessages.filter(msg => msg.status !== 'completed'),
      ))
    } catch (error) {
      console.error('Messages error:', error)
    }
  }

  const showMicrophoneAccessNotice = () => {
    setNotice({
      type: 'warning',
      title: t('common.attention'),
      text: t('player.micAccessError'),
      action: {
        label: t('player.micRetry'),
        onClick: startRecording,
      },
    })
  }

  const handlePlayPause = async () => {
    if (!broadcastStatus?.is_broadcasting || (!currentTrack && !liveMicHintVisible)) {
      return
    }

    if (isPlaybackActive) {
      setIsPlayerManuallyPaused(true)
      pause()
      pauseLiveAudio().catch(() => {})
      videoRef.current?.pause?.()
      return
    }

    setIsPlayerManuallyPaused(false)
    await play()
    resumeLiveAudio().catch(() => {})
  }

  const handleToggleFullscreen = async () => {
    const container = videoContainerRef.current
    if (!container) {
      return
    }

    try {
      if (document.fullscreenElement === container) {
        await document.exitFullscreen()
        return
      }
      await container.requestFullscreen()
    } catch (error) {
      console.debug('Не удалось переключить полноэкранный режим видео', error)
    }
  }

  const handleVolumeChange = (event) => {
    setVolume(clampUnitValue(event.target.value, 0.8))
  }

  const handleSendMessage = async (event) => {
    event.preventDefault()
    if (!message.trim()) {
      return
    }

    try {
      await playerService.sendMessage(message)
      setMessage('')
      await loadMessages()
      setNotice(null)
    } catch (error) {
      setNotice({ type: 'error', text: t('player.textSendError') })
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream

      const { recorder, mimeType, extension } = createAudioRecorder(stream)
      recordingFormatRef.current = { mimeType, extension }
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data?.size) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        const chunkType = audioChunksRef.current[0]?.type
        const blobType = recorder.mimeType || chunkType || mimeType || 'audio/webm'
        const blob = new Blob(audioChunksRef.current, { type: blobType })
        stopMediaStream(mediaStreamRef.current)
        mediaStreamRef.current = null

        if (blob.size === 0) {
          setVoiceFile(null)
          return
        }

        setVoiceFile(buildRecordedAudioFile(blob, 'voice-message', { mimeType: blobType, extension }))
      }

      recorder.start()
      setVoiceFile(null)
      setIsRecording(true)
      setNotice(null)
    } catch (error) {
      showMicrophoneAccessNotice()
    }
  }

  const stopRecording = () => {
    if (!mediaRecorderRef.current) {
      return
    }

    mediaRecorderRef.current.stop()
    mediaRecorderRef.current = null
    setIsRecording(false)
  }

  const sendVoiceMessage = async () => {
    if (!voiceFile) {
      return
    }

    try {
      await playerService.sendVoiceMessage(voiceFile)
      setVoiceFile(null)
      setNotice(null)
    } catch (error) {
      setNotice({ type: 'error', text: t('player.voiceSendError') })
    }
  }

  const canPlay = Boolean(broadcastStatus?.is_broadcasting && (currentTrack || liveMicHintVisible))
  const isPlaybackActive = Boolean((currentTrack && isAudioPlaying) || isLiveStreamActive)

  return (
    <div className="container page-shell">
      <audio ref={mediaRef} preload="auto" />

      <section className="page-hero page-hero--player">
        <div className="page-hero__content">
          <span className="page-hero__eyebrow">{t('player.pageName')}</span>
          <h1 className="page-hero__title">{t('player.title')}</h1>
          <p className="page-hero__description">
            {t('player.subtitle')}
          </p>
        </div>
      </section>

      <StatusBanner notice={notice} onDismiss={() => setNotice(null)} />

      <div className="player-page-grid">
        <div ref={playerCardRef} className="surface-card surface-card--panel" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div
            className="card-header surface-panel-header player-panel-header"
            style={{
              padding: '1.25rem 1.5rem',
              margin: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <h2 className="card-title" style={{ fontSize: '1.1rem', margin: 0 }}>{t('player.player')}</h2>
              {broadcastStatus?.is_broadcasting && (
                <div
                  className="glass-badge"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.5rem 1rem',
                    background: 'var(--player-live-badge-bg)',
                    backdropFilter: 'blur(20px)',
                    borderRadius: '20px',
                    border: '1px solid var(--player-live-badge-border)',
                  }}
                >
                  <span className="recording-dot recording-dot--live"></span>
                  <span style={{ fontWeight: 700, color: 'var(--ttk-red)', fontSize: '0.85rem', letterSpacing: '0.5px' }}>
                    {t('player.live').toUpperCase()}
                  </span>
                  <div style={{ width: '1px', height: '16px', background: 'rgba(229, 39, 19, 0.3)' }}></div>
                  <span
                    style={{
                      fontWeight: 600,
                      color: 'var(--ttk-red)',
                      fontSize: '0.9rem',
                      fontFamily: 'PT Sans Caption, monospace',
                      minWidth: '48px',
                    }}
                  >
                    {formatPlaybackTime(playbackSeconds)}
                  </span>
                </div>
              )}
              {liveMicHintVisible && (
                <div className="glass-badge glass-badge--warn">
                  <span className="recording-dot recording-dot--live"></span>
                  <span style={{ fontWeight: 700, color: 'var(--page-text)', fontSize: '0.82rem' }}>
                    {t('player.liveMic')}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="player">
            {currentTrack?.file_type === 'video' ? (
              <div className="video-container" ref={videoContainerRef}>
                <video
                  ref={videoRef}
                  className="video-player"
                  playsInline
                  preload="auto"
                  controls={false}
                  style={{
                    opacity: isBuffering ? 0.7 : 1,
                    transition: 'opacity 0.3s ease',
                  }}
                />
                <button
                  type="button"
                  className="video-fullscreen-btn"
                  onClick={handleToggleFullscreen}
                  aria-label={t('player.fullscreen')}
                  title={t('player.fullscreen')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3H4a1 1 0 0 0-1 1v4M16 3h4a1 1 0 0 1 1 1v4M8 21H4a1 1 0 0 1-1-1v-4M16 21h4a1 1 0 0 0 1-1v-4" />
                  </svg>
                </button>
              </div>
            ) : (
              <div
                className="player-cover"
                style={{
                  animation: isPlaybackActive ? 'pulse-glow 2s ease-in-out infinite' : 'none',
                  opacity: isBuffering ? 0.7 : 1,
                  transition: 'opacity 0.3s ease',
                  background: isPlaybackActive
                    ? 'linear-gradient(135deg, var(--ttk-red), var(--ttk-red-light))'
                    : 'linear-gradient(135deg, #889096, #5f676d)',
                  boxShadow: isPlaybackActive
                    ? '0 28px 50px rgba(229, 39, 19, 0.2)'
                    : '0 18px 34px rgba(43, 49, 54, 0.2)',
                }}
              >
                {isBuffering && canPlay && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: '40px',
                      height: '40px',
                      border: '4px solid rgba(255,255,255,0.3)',
                      borderTopColor: 'white',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                    }}
                  ></div>
                )}
                <svg width="80" height="80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                  />
                </svg>
              </div>
            )}

            <div className="player-controls">
              <button
                className="player-btn"
                onClick={handlePlayPause}
                disabled={!canPlay}
                aria-label={isPlaybackActive && canPlay ? t('player.pause') : t('player.play')}
                style={{
                  opacity: canPlay ? 1 : 0.5,
                  cursor: canPlay ? 'pointer' : 'not-allowed',
                  background: canPlay
                    ? 'linear-gradient(135deg, var(--ttk-red) 0%, var(--ttk-red-light) 100%)'
                    : 'linear-gradient(135deg, #666 0%, #888 100%)',
                }}
              >
                {isPlaybackActive && canPlay ? (
                  <svg width="28" height="28" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                  </svg>
                ) : (
                  <svg width="28" height="28" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
              </button>

              <div className="volume-control">
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 14.142M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                </svg>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="volume-slider"
                  aria-label={t('player.volume')}
                />
                <span
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--ttk-gray)',
                    fontFamily: 'PT Sans Caption, monospace',
                    minWidth: '35px',
                    textAlign: 'right',
                  }}
                >
                  {Math.round(volume * 100)}%
                </span>
              </div>
            </div>

            {(currentTrack || liveMicHintVisible) && (
              <div
                className="track-summary-card"
                style={{
                  textAlign: 'center',
                  padding: '1.25rem',
                  background: 'var(--player-track-bg)',
                  borderTop: '1px solid var(--player-track-border)',
                  width: '100%',
                }}
              >
                <p
                  style={{
                    fontWeight: 700,
                    fontFamily: 'PT Sans Caption, sans-serif',
                    fontSize: '1rem',
                    color: 'var(--page-text)',
                    marginBottom: '0.5rem',
                    lineHeight: 1.4,
                  }}
                >
                  {currentTrack ? getMediaDisplayName(currentTrack.original_name) : t('player.micOnlyLive')}
                </p>
                <p
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    fontFamily: 'PT Sans Caption, sans-serif',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      background: isPlaybackActive ? 'var(--ttk-red)' : 'var(--text-secondary)',
                      borderRadius: '50%',
                      display: 'inline-block',
                      animation: isPlaybackActive ? 'pulse 1s infinite' : 'none',
                    }}
                  ></span>
                  {currentTrack
                    ? currentTrack.file_type === 'video'
                      ? t('player.videoStream')
                      : t('player.syncedAudioStream')
                    : t('player.liveMic')}
                </p>
              </div>
            )}

            {!broadcastStatus?.is_broadcasting && (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
                <svg width="56" height="56" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ opacity: 0.4, marginBottom: '1.5rem' }}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                  />
                </svg>
                <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>{t('player.noBroadcast')}</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('player.waitForBroadcast')}</p>
              </div>
            )}
          </div>
        </div>

        <div
          className="surface-card surface-card--panel communication-panel-shell"
          style={{ padding: 0, overflow: 'hidden', height: communicationHeight ? `${communicationHeight}px` : undefined }}
        >
          <div className="card-header surface-panel-header player-panel-header" style={{ padding: '1.25rem 1.5rem', margin: 0 }}>
            <h2 className="card-title" style={{ fontSize: '1.1rem', margin: 0 }}>{t('player.communication')}</h2>
          </div>

          <div className="communication-panel-body" style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <form onSubmit={handleSendMessage} style={{ marginBottom: '1.5rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <textarea
                  className="messages-input"
                  value={message}
                  onChange={event => setMessage(event.target.value)}
                  placeholder={t('player.messagePlaceholder')}
                  rows={4}
                  style={{ width: '100%', resize: 'none', minHeight: '7.5rem', maxHeight: '7.5rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                <button type="submit" className="btn btn-primary">{t('player.send')}</button>
                {!isRecording ? (
                  <button type="button" className="btn btn-outline" onClick={startRecording} style={{ borderColor: 'var(--ttk-gray-light)', color: 'var(--text-secondary)' }}>
                    {t('player.recordVoice')}
                  </button>
                ) : (
                  <button type="button" className="btn btn-danger" onClick={stopRecording}>{t('player.stop')}</button>
                )}
                {voiceFile && (
                  <button type="button" className="btn btn-success" onClick={sendVoiceMessage}>
                    {t('player.sendRecording')}
                  </button>
                )}
              </div>

              {isRecording && (
                <div className="recording-indicator" style={{ marginTop: '1rem' }}>
                  <span className="recording-dot recording-dot--live"></span>{t('player.recording')}
                </div>
              )}
            </form>

            <div className="player-chat-region">
              <h3
                style={{
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  fontFamily: 'PT Sans Caption, sans-serif',
                  marginBottom: '1rem',
                  color: 'var(--page-text)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                {t('player.messages')}
              </h3>
              <div className="player-chat-feed">
                <MessagesList messages={messages} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="page-footer">
        <p>© 2026 PixelCast, Все права защищены</p>
        <p>Не является коммерческим продуктом</p>
        <p>Платформа для управления потоковым вещанием для ТТК, сделано командой Pixel Minds</p>
      </footer>
    </div>
  )
}

export default PlayerPage
