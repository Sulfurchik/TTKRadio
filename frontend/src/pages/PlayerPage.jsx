import { useEffect, useRef, useState } from 'react'

import StatusBanner from '../components/StatusBanner'
import { getLocale, useLanguage } from '../hooks/useLanguage'
import { useBroadcastPlayback } from '../hooks/useBroadcastPlayback'
import { useLiveAudioStream } from '../hooks/useLiveAudioStream'
import { playerService } from '../services'
import { formatPlaybackTime, getSyncedPositionSeconds, SYNC_TOLERANCE_SECONDS } from '../utils/broadcastSync'
import { getMediaDisplayName } from '../utils/media'
import { buildRecordedAudioFile, createAudioRecorder, stopMediaStream } from '../utils/recording'

function PlayerPage() {
  const language = useLanguage(state => state.language)
  const t = useLanguage(state => state.t)
  const locale = getLocale(language)

  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([])
  const [isRecording, setIsRecording] = useState(false)
  const [voiceFile, setVoiceFile] = useState(null)
  const [notice, setNotice] = useState(null)
  const [isPlayerManuallyPaused, setIsPlayerManuallyPaused] = useState(false)
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('player_volume')
    return saved ? parseFloat(saved) : 0.8
  })

  const mediaRecorderRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const audioChunksRef = useRef([])
  const recordingFormatRef = useRef({ mimeType: 'audio/webm', extension: 'webm' })
  const videoRef = useRef(null)
  const [liveMicHintVisible, setLiveMicHintVisible] = useState(false)

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
    audioRef: liveAudioRef,
    isStreamActive: isLiveStreamActive,
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
    const video = videoRef.current
    if (!video) {
      return undefined
    }

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
    if (video.src !== absoluteSource) {
      video.src = currentTrack.storage_url
      video.load()
    }

    const targetPosition = getSyncedPositionSeconds(broadcastStatus)
    if (Math.abs((video.currentTime || 0) - targetPosition) > SYNC_TOLERANCE_SECONDS) {
      try {
        video.currentTime = targetPosition
      } catch (error) {
        console.debug('Не удалось синхронизировать видеопоток', error)
      }
    }

    video.muted = true

    if (broadcastStatus?.is_broadcasting && isAudioPlaying) {
      video.play().catch(() => {})
    } else {
      video.pause()
    }

    return undefined
  }, [broadcastStatus, currentTrack, isAudioPlaying])

  const loadMessages = async () => {
    try {
      const data = await playerService.getMessages()
      setMessages(data.filter(msg => msg.status !== 'completed'))
    } catch (error) {
      console.error('Messages error:', error)
    }
  }

  const getMessageStatusText = (status) => {
    if (status === 'new') return t('messageStatus.new')
    if (status === 'in_progress') return t('messageStatus.inProgress')
    if (status === 'completed') return t('messageStatus.completed')
    return status
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
    if (!broadcastStatus?.is_broadcasting || !currentTrack) {
      return
    }

    if (isAudioPlaying) {
      setIsPlayerManuallyPaused(true)
      pause()
      liveAudioRef.current?.pause()
      return
    }

    setIsPlayerManuallyPaused(false)
    await play()
    liveAudioRef.current?.play().catch(() => {})
  }

  const handleVolumeChange = (event) => {
    setVolume(parseFloat(event.target.value))
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

  const canPlay = Boolean(broadcastStatus?.is_broadcasting && currentTrack)

  return (
    <div className="container page-shell">
      <audio ref={mediaRef} preload="auto" />
      <audio ref={liveAudioRef} preload="none" />

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
        <div className="surface-card surface-card--panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            className="card-header"
            style={{
              background: 'var(--panel-header-bg)',
              borderBottom: '2px solid var(--panel-header-border)',
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
                  <span className="recording-dot"></span>
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
                  <span className="recording-dot"></span>
                  <span style={{ fontWeight: 700, color: 'var(--page-text)', fontSize: '0.82rem' }}>
                    {t('player.liveMic')}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="player">
            {currentTrack?.file_type === 'video' ? (
              <div className="video-container">
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
              </div>
            ) : (
              <div
                className="player-cover"
                style={{
                  animation: isAudioPlaying ? 'pulse-glow 2s ease-in-out infinite' : 'playerFloat 5s ease-in-out infinite',
                  opacity: isBuffering ? 0.7 : 1,
                  transition: 'opacity 0.3s ease',
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
                aria-label={isAudioPlaying && canPlay ? t('player.pause') : t('player.play')}
                style={{
                  opacity: canPlay ? 1 : 0.5,
                  cursor: canPlay ? 'pointer' : 'not-allowed',
                  background: canPlay
                    ? 'linear-gradient(135deg, var(--ttk-red) 0%, var(--ttk-red-light) 100%)'
                    : 'linear-gradient(135deg, #666 0%, #888 100%)',
                }}
              >
                {isAudioPlaying && canPlay ? (
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

            {currentTrack && (
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
                  {getMediaDisplayName(currentTrack.original_name)}
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
                      background: isAudioPlaying ? 'var(--ttk-red)' : 'var(--text-secondary)',
                      borderRadius: '50%',
                      display: 'inline-block',
                      animation: isAudioPlaying ? 'pulse 1s infinite' : 'none',
                    }}
                  ></span>
                  {currentTrack.file_type === 'video' ? t('player.videoStream') : t('player.syncedAudioStream')}
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

        <div className="surface-card surface-card--panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="card-header surface-panel-header" style={{ padding: '1rem 1.5rem', margin: 0 }}>
            <h2 className="card-title" style={{ fontSize: '1rem' }}>{t('player.communication')}</h2>
          </div>

          <div style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <form onSubmit={handleSendMessage} style={{ marginBottom: '1.5rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <textarea
                  className="messages-input"
                  value={message}
                  onChange={event => setMessage(event.target.value)}
                  placeholder={t('player.messagePlaceholder')}
                  rows={4}
                  style={{ width: '100%', resize: 'vertical' }}
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
                  <span className="recording-dot"></span>{t('player.recording')}
                </div>
              )}
            </form>

            <div style={{ flex: 1, overflowY: 'auto', borderTop: '2px solid var(--ttk-border)', paddingTop: '1rem' }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {messages.length > 0 ? (
                  messages.map(msg => (
                    <div
                      key={msg.id}
                      style={{
                        padding: '1rem',
                        background: 'var(--player-message-card-bg)',
                        border: '1px solid var(--player-message-card-border)',
                        borderLeft: msg.status === 'new' ? '4px solid var(--ttk-red)' : '4px solid transparent',
                        borderRadius: 'var(--radius)',
                        transition: 'all 0.2s',
                      }}
                    >
                      <p style={{ fontSize: '0.9rem', marginBottom: '0.75rem', lineHeight: 1.5, color: 'var(--page-text)' }}>{msg.text}</p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className={`status-badge status-${msg.status}`}>
                          {getMessageStatusText(msg.status)}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'PT Sans Caption, sans-serif' }}>
                          {new Date(msg.created_at).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                    <p style={{ fontSize: '0.85rem' }}>{t('player.noMessages')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PlayerPage
