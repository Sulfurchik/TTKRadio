import { useEffect, useRef, useState } from 'react'

import { useBroadcastPlayback } from '../hooks/useBroadcastPlayback'
import { playerService } from '../services'
import { formatPlaybackTime } from '../utils/broadcastSync'


function PlayerPage() {
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([])
  const [isRecording, setIsRecording] = useState(false)
  const [voiceBlob, setVoiceBlob] = useState(null)
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('player_volume')
    return saved ? parseFloat(saved) : 0.8
  })

  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  const {
    audioRef,
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
  })

  useEffect(() => {
    localStorage.setItem('player_volume', volume.toString())
  }, [volume])

  useEffect(() => {
    loadMessages()
    const intervalId = setInterval(loadMessages, 5000)
    return () => clearInterval(intervalId)
  }, [])

  const loadMessages = async () => {
    try {
      const data = await playerService.getMessages()
      setMessages(data.filter(msg => msg.status !== 'completed'))
    } catch (error) {
      console.error('Messages error:', error)
    }
  }

  const handlePlayPause = async () => {
    if (!broadcastStatus?.is_broadcasting || !currentTrack) {
      return
    }

    if (isAudioPlaying) {
      pause()
      return
    }

    await play()
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
      alert('Сообщение отправлено!')
    } catch (error) {
      alert('Ошибка отправки')
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream)
      audioChunksRef.current = []

      mediaRecorderRef.current.ondataavailable = (event) => audioChunksRef.current.push(event.data)
      mediaRecorderRef.current.onstop = () => {
        setVoiceBlob(new Blob(audioChunksRef.current, { type: 'audio/wav' }))
      }

      mediaRecorderRef.current.start()
      setIsRecording(true)
    } catch (error) {
      alert('Ошибка доступа к микрофону')
    }
  }

  const stopRecording = () => {
    if (!mediaRecorderRef.current) {
      return
    }

    mediaRecorderRef.current.stop()
    setIsRecording(false)
  }

  const sendVoiceMessage = async () => {
    if (!voiceBlob) {
      return
    }

    try {
      const file = new File([voiceBlob], 'voice-message.wav', { type: 'audio/wav' })
      await playerService.sendVoiceMessage(file)
      setVoiceBlob(null)
      alert('Голосовое сообщение отправлено!')
    } catch (error) {
      alert('Ошибка отправки')
    }
  }

  const canPlay = Boolean(broadcastStatus?.is_broadcasting && currentTrack)

  return (
    <div className="container">
      <audio ref={audioRef} preload="auto" />

      <div style={{ marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '2px solid #e0e0e0' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'PT Sans Caption, sans-serif', color: '#000', margin: 0 }}>
          Прямой эфир
        </h1>
        <p style={{ color: '#666', marginTop: '0.25rem', fontSize: '0.85rem' }}>
          Синхронизированное вещание в реальном времени
        </p>
      </div>

      <div className="player-page-grid">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            className="card-header"
            style={{
              background: 'linear-gradient(135deg, rgba(229, 39, 19, 0.08), rgba(229, 39, 19, 0.02))',
              borderBottom: '2px solid rgba(229, 39, 19, 0.2)',
              padding: '1.25rem 1.5rem',
              margin: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <h2 className="card-title" style={{ fontSize: '1.1rem', margin: 0 }}>Плеер</h2>
              {broadcastStatus?.is_broadcasting && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.5rem 1rem',
                    background: 'rgba(229, 39, 19, 0.15)',
                    backdropFilter: 'blur(20px)',
                    borderRadius: '20px',
                    border: '1px solid rgba(229, 39, 19, 0.3)',
                  }}
                >
                  <span className="recording-dot"></span>
                  <span style={{ fontWeight: 700, color: 'var(--ttk-red)', fontSize: '0.85rem', letterSpacing: '0.5px' }}>
                    В ЭФИРЕ
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
            </div>
          </div>

          <div className="player">
            <div
              className="player-cover"
              style={{
                animation: isAudioPlaying ? 'pulse-glow 2s ease-in-out infinite' : 'none',
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

            <div className="player-controls">
              <button
                className="player-btn"
                onClick={handlePlayPause}
                disabled={!canPlay}
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
                  aria-label="Громкость"
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
                style={{
                  textAlign: 'center',
                  padding: '1.25rem',
                  background: 'linear-gradient(135deg, rgba(229, 39, 19, 0.05), transparent)',
                  borderTop: '1px solid rgba(229, 39, 19, 0.1)',
                  width: '100%',
                }}
              >
                <p
                  style={{
                    fontWeight: 700,
                    fontFamily: 'PT Sans Caption, sans-serif',
                    fontSize: '1rem',
                    color: '#000',
                    marginBottom: '0.5rem',
                    lineHeight: 1.4,
                  }}
                >
                  {currentTrack.original_name}
                </p>
                <p
                  style={{
                    fontSize: '0.75rem',
                    color: '#666',
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
                      background: isAudioPlaying ? 'var(--ttk-red)' : '#999',
                      borderRadius: '50%',
                      display: 'inline-block',
                      animation: isAudioPlaying ? 'pulse 1s infinite' : 'none',
                    }}
                  ></span>
                  {currentTrack.file_type === 'video' ? 'Видеотрансляция' : 'Синхронный аудиопоток'}
                </p>
              </div>
            )}

            {!broadcastStatus?.is_broadcasting && (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#666' }}>
                <svg width="56" height="56" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ opacity: 0.4, marginBottom: '1.5rem' }}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                  />
                </svg>
                <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Вещание отсутствует</p>
                <p style={{ fontSize: '0.85rem', color: '#999' }}>Ожидайте начала прямого эфира</p>
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="card-header" style={{ background: '#f8f9fa', borderBottom: '2px solid #e0e0e0', padding: '1rem 1.5rem', margin: 0 }}>
            <h2 className="card-title" style={{ fontSize: '1rem' }}>Связь с ведущим</h2>
          </div>

          <div style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <form onSubmit={handleSendMessage} style={{ marginBottom: '1.5rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <textarea
                  className="messages-input"
                  value={message}
                  onChange={event => setMessage(event.target.value)}
                  placeholder="Введите текст сообщения..."
                  rows={4}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                <button type="submit" className="btn btn-primary">Отправить</button>
                {!isRecording ? (
                  <button type="button" className="btn btn-outline" onClick={startRecording} style={{ borderColor: '#666', color: '#666' }}>
                    Записать голос
                  </button>
                ) : (
                  <button type="button" className="btn btn-danger" onClick={stopRecording}>Стоп</button>
                )}
                {voiceBlob && (
                  <button type="button" className="btn btn-success" onClick={sendVoiceMessage}>
                    Отправить запись
                  </button>
                )}
              </div>

              {isRecording && (
                <div className="recording-indicator" style={{ marginTop: '1rem' }}>
                  <span className="recording-dot"></span>Идет запись...
                </div>
              )}
            </form>

            <div style={{ flex: 1, overflowY: 'auto', borderTop: '2px solid #e0e0e0', paddingTop: '1rem' }}>
              <h3
                style={{
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  fontFamily: 'PT Sans Caption, sans-serif',
                  marginBottom: '1rem',
                  color: '#000',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Сообщения
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {messages.length > 0 ? (
                  messages.map(msg => (
                    <div
                      key={msg.id}
                      style={{
                        padding: '1rem',
                        background: '#f8f9fa',
                        border: '1px solid #e0e0e0',
                        borderLeft: msg.status === 'new' ? '4px solid var(--ttk-red)' : '4px solid transparent',
                        borderRadius: 'var(--radius)',
                        transition: 'all 0.2s',
                      }}
                    >
                      <p style={{ fontSize: '0.9rem', marginBottom: '0.75rem', lineHeight: 1.5, color: '#333' }}>{msg.text}</p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className={`status-badge status-${msg.status}`}>
                          {msg.status === 'new' ? 'Новое' : msg.status === 'in_progress' ? 'В работе' : 'Завершено'}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#999', fontFamily: 'PT Sans Caption, sans-serif' }}>
                          {new Date(msg.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
                    <p style={{ fontSize: '0.85rem' }}>Нет сообщений</p>
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
