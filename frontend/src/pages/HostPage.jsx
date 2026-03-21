import { useEffect, useMemo, useRef, useState } from 'react'

import FileUpload from '../components/FileUpload'
import MessagesList from '../components/MessagesList'
import StatusBanner from '../components/StatusBanner'
import { useBroadcastPlayback } from '../hooks/useBroadcastPlayback'
import { hostService } from '../services'
import { formatPlaybackTime } from '../utils/broadcastSync'


function HostPage() {
  const [media, setMedia] = useState([])
  const [playlists, setPlaylists] = useState([])
  const [messages, setMessages] = useState([])
  const [isRecording, setIsRecording] = useState(false)
  const [showArchive, setShowArchive] = useState(false)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false)
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null)
  const [notice, setNotice] = useState(null)
  const [monitorEnabled, setMonitorEnabled] = useState(() => localStorage.getItem('host_monitor_enabled') === 'true')
  const [monitorVolume, setMonitorVolume] = useState(() => {
    const savedVolume = localStorage.getItem('host_monitor_volume')
    return savedVolume ? parseFloat(savedVolume) : 0.55
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
    refreshStatus,
    resumeAutomaticPlayback,
  } = useBroadcastPlayback({
    fetchStatus: hostService.getBroadcastStatus,
    pollIntervalMs: 1000,
    volume: monitorVolume,
    autoResume: monitorEnabled,
    enableAudio: monitorEnabled,
  })

  const selectedPlaylist = useMemo(
    () => playlists.find(playlist => playlist.id === selectedPlaylistId) || null,
    [playlists, selectedPlaylistId],
  )

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    localStorage.setItem('host_monitor_enabled', monitorEnabled.toString())
  }, [monitorEnabled])

  useEffect(() => {
    localStorage.setItem('host_monitor_volume', monitorVolume.toString())
  }, [monitorVolume])

  useEffect(() => {
    const intervalId = setInterval(() => {
      loadMessages(showArchive)
    }, 3000)

    return () => clearInterval(intervalId)
  }, [showArchive])

  const loadInitialData = async () => {
    try {
      await Promise.all([loadMedia(), loadPlaylists(), loadMessages(false), refreshStatus()])
    } catch (error) {
      setNotice({ type: 'error', text: 'Не удалось загрузить данные ведущего. Попробуйте обновить страницу.' })
    }
  }

  const loadMedia = async () => {
    try {
      const data = await hostService.getMedia()
      setMedia(data)
    } catch (error) {
      console.error('Ошибка загрузки медиатеки:', error)
    }
  }

  const loadPlaylists = async () => {
    try {
      const data = await hostService.getPlaylists()
      setPlaylists(data)

      const selectedStillExists = data.some(playlist => playlist.id === selectedPlaylistId)
      if (selectedStillExists) {
        return
      }

      const activePlaylist = data.find(playlist => playlist.is_active)
      if (activePlaylist) {
        setSelectedPlaylistId(activePlaylist.id)
      } else if (data[0]) {
        setSelectedPlaylistId(data[0].id)
      } else {
        setSelectedPlaylistId(null)
      }
    } catch (error) {
      console.error('Ошибка загрузки плейлистов:', error)
    }
  }

  const loadMessages = async (archiveMode = showArchive) => {
    try {
      const data = archiveMode
        ? await hostService.getArchivedMessages()
        : await hostService.getMessages()
      setMessages(data)
    } catch (error) {
      console.error('Ошибка загрузки сообщений:', error)
    }
  }

  const handleUpload = async (file) => {
    try {
      await hostService.uploadMedia(file)
      await loadMedia()
      setNotice(null)
    } catch (error) {
      setNotice({
        type: 'error',
        text: error.response?.data?.detail || 'Не удалось загрузить файл в медиатеку.',
      })
    }
  }

  const handleDeleteMedia = async (mediaId) => {
    if (!confirm('Удалить файл?')) {
      return
    }

    try {
      await hostService.deleteMedia(mediaId)
      await Promise.all([loadMedia(), loadPlaylists(), refreshStatus()])
      setNotice(null)
    } catch (error) {
      setNotice({ type: 'error', text: 'Не удалось удалить файл из медиатеки.' })
    }
  }

  const handleDeletePlaylist = async (playlistId, event) => {
    event.stopPropagation()
    if (!confirm('Удалить плейлист?')) {
      return
    }

    try {
      await hostService.deletePlaylist(playlistId)
      await Promise.all([loadPlaylists(), refreshStatus()])
      setNotice(null)
    } catch (error) {
      setNotice({ type: 'error', text: 'Не удалось удалить плейлист.' })
    }
  }

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) {
      setNotice({ type: 'error', text: 'Введите название плейлиста, прежде чем создавать его.' })
      return
    }

    try {
      const playlist = await hostService.createPlaylist(newPlaylistName)
      setNewPlaylistName('')
      setShowCreatePlaylist(false)
      setSelectedPlaylistId(playlist.id)
      await loadPlaylists()
      setNotice(null)
    } catch (error) {
      setNotice({ type: 'error', text: 'Не удалось создать плейлист.' })
    }
  }

  const handleAddToPlaylist = async (mediaId) => {
    if (!selectedPlaylist) {
      setNotice({ type: 'error', text: 'Сначала выберите плейлист слева, а потом добавляйте в него треки.' })
      return
    }

    try {
      await hostService.addItemToPlaylist(selectedPlaylist.id, mediaId)
      await loadPlaylists()
      setNotice(null)
    } catch (error) {
      setNotice({ type: 'error', text: 'Не удалось добавить трек в плейлист.' })
    }
  }

  const handleToggleLoop = async () => {
    if (!selectedPlaylist) {
      return
    }

    try {
      await hostService.toggleLoop(selectedPlaylist.id)
      await Promise.all([loadPlaylists(), refreshStatus()])
    } catch (error) {
      console.error(error)
    }
  }

  const handleToggleShuffle = async () => {
    if (!selectedPlaylist) {
      return
    }

    try {
      await hostService.toggleShuffle(selectedPlaylist.id)
      await Promise.all([loadPlaylists(), refreshStatus()])
    } catch (error) {
      console.error(error)
    }
  }

  const handleActivatePlaylist = async () => {
    if (!selectedPlaylist) {
      return
    }

    try {
      await hostService.activatePlaylist(selectedPlaylist.id)
      await loadPlaylists()
      setNotice(null)
    } catch (error) {
      setNotice({ type: 'error', text: 'Не удалось активировать выбранный плейлист.' })
    }
  }

  const handleStartBroadcast = async () => {
    if (!selectedPlaylist) {
      setNotice({ type: 'error', text: 'Для старта эфира нужен выбранный плейлист.' })
      return
    }

    try {
      await hostService.startBroadcast(selectedPlaylist.id)
      if (monitorEnabled) {
        resumeAutomaticPlayback()
      }
      await Promise.all([refreshStatus(), loadPlaylists()])
      setNotice(null)
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.detail || 'Не удалось запустить вещание.' })
    }
  }

  const handleStopBroadcast = async () => {
    try {
      await hostService.stopBroadcast()
      await refreshStatus()
      setNotice(null)
    } catch (error) {
      console.error(error)
      setNotice({ type: 'error', text: 'Не удалось остановить эфир.' })
    }
  }

  const handlePreviousTrack = async () => {
    try {
      await hostService.previousBroadcastTrack()
      await refreshStatus()
      setNotice(null)
    } catch (error) {
      setNotice({ type: 'error', text: 'Не удалось переключить эфир на предыдущий трек.' })
    }
  }

  const handleNextTrack = async () => {
    try {
      await hostService.nextBroadcastTrack()
      await refreshStatus()
      setNotice(null)
    } catch (error) {
      setNotice({ type: 'error', text: 'Не удалось переключить эфир на следующий трек.' })
    }
  }

  const handleSelectTrack = async (mediaId) => {
    try {
      await hostService.setCurrentMedia(mediaId)
      await refreshStatus()
      setNotice(null)
    } catch (error) {
      setNotice({ type: 'error', text: 'Не удалось выбрать этот трек для эфира.' })
    }
  }

  const handleMessageStatusChange = async (messageId, status) => {
    try {
      await hostService.updateMessageStatus(messageId, status)
      await loadMessages(showArchive)
    } catch (error) {
      console.error(error)
    }
  }

  const handleToggleArchive = async () => {
    const nextArchiveMode = !showArchive
    setShowArchive(nextArchiveMode)
    await loadMessages(nextArchiveMode)
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream)
      audioChunksRef.current = []

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data)
      }

      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
        const file = new File([blob], 'recording.wav', { type: 'audio/wav' })
        try {
          await hostService.recordAudio(file)
          await loadMedia()
          setNotice(null)
        } catch (error) {
          setNotice({ type: 'error', text: 'Не удалось сохранить запись с микрофона.' })
        }
      }

      mediaRecorderRef.current.start()
      setIsRecording(true)
    } catch (error) {
      setNotice({ type: 'error', text: 'Не удалось получить доступ к микрофону.' })
    }
  }

  const stopRecording = () => {
    if (!mediaRecorderRef.current) {
      return
    }

    mediaRecorderRef.current.stop()
    setIsRecording(false)
  }

  const currentTrackId = currentTrack?.id
  const canSwitchTracks = Boolean(broadcastStatus?.is_broadcasting && currentTrackId)
  const isLive = Boolean(broadcastStatus?.is_broadcasting)

  return (
    <div className="container page-shell">
      <audio ref={audioRef} preload="auto" />

      <section className="page-hero">
        <div className="page-hero__content">
          <span className="page-hero__eyebrow">Studio Control</span>
          <h1 className="page-hero__title">Панель ведущего</h1>
          <p className="page-hero__description">
            Управляйте эфиром, плейлистами и сообщениями слушателей с одной панели без лишних скачков громкости.
          </p>
          <div className="page-hero__chips">
            <span className={`hero-chip ${isLive ? 'hero-chip--live' : ''}`}>
              <span className="recording-dot" style={{ opacity: isLive ? 1 : 0.35 }}></span>
              {isLive ? `В эфире ${formatPlaybackTime(playbackSeconds)}` : 'Эфир остановлен'}
            </span>
            <span className="hero-chip">Плейлист: {selectedPlaylist?.name || 'не выбран'}</span>
            <span className="hero-chip">Мониторинг: {monitorEnabled ? 'включён' : 'выключен'}</span>
          </div>
        </div>

        <div className="page-hero__actions">
          {!isLive ? (
            <button className="btn btn-success" onClick={handleStartBroadcast}>
              Начать вещание
            </button>
          ) : (
            <button className="btn btn-danger" onClick={handleStopBroadcast}>
              Остановить эфир
            </button>
          )}
        </div>
      </section>

      <StatusBanner notice={notice} onDismiss={() => setNotice(null)} />

      <div className="surface-card surface-card--monitor">
        <div className="surface-card__header">
          <div>
            <h2 className="card-title" style={{ margin: 0 }}>Монитор эфира</h2>
            <p className="section-subtitle">
              Локальное прослушивание для ведущего теперь включается отдельно и не перетягивает громкость при переходах между разделами.
            </p>
          </div>
          <div className="surface-card__actions">
            <button className="btn btn-outline btn-sm" onClick={handlePreviousTrack} disabled={!canSwitchTracks}>
              ← Назад
            </button>
            <button className="btn btn-outline btn-sm" onClick={handleNextTrack} disabled={!canSwitchTracks}>
              Вперёд →
            </button>
            <button
              type="button"
              className={`btn btn-sm ${monitorEnabled ? 'btn-outline' : 'btn-primary'}`}
              onClick={() => setMonitorEnabled(prev => !prev)}
            >
              {monitorEnabled ? 'Выключить мониторинг' : 'Включить мониторинг'}
            </button>
          </div>
        </div>

        {monitorEnabled && (
          <div className="monitor-volume">
            <label className="form-label" htmlFor="host-monitor-volume">Громкость мониторинга</label>
            <div className="volume-control" style={{ borderLeft: 'none', paddingLeft: 0 }}>
              <input
                id="host-monitor-volume"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={monitorVolume}
                onChange={(event) => setMonitorVolume(parseFloat(event.target.value))}
                className="volume-slider"
                aria-label="Громкость мониторинга"
              />
              <span className="mono-value">{Math.round(monitorVolume * 100)}%</span>
            </div>
          </div>
        )}

        <div className="monitor-summary">
          {currentTrack ? (
            <div className="monitor-summary__grid">
              <div>
                <div className="monitor-summary__title">{currentTrack.original_name}</div>
                <div className="monitor-summary__meta">
                  {currentTrack.file_type === 'video' ? 'Видеоэфир' : 'Аудиоэфир'}
                  {' · '}
                  {formatPlaybackTime(playbackSeconds)} / {formatPlaybackTime(currentTrack.duration)}
                </div>
              </div>
              <div className="monitor-status">
                <span className="recording-dot" style={{ opacity: isLive || isBuffering ? 1 : 0.35 }}></span>
                {monitorEnabled
                  ? isBuffering
                    ? 'Локальный мониторинг синхронизируется'
                    : isAudioPlaying
                      ? 'Мониторинг активен'
                      : 'Ожидание воспроизведения'
                  : 'Мониторинг выключен'}
              </div>
            </div>
          ) : (
            <p className="section-muted">Эфир ещё не запущен.</p>
          )}
        </div>
      </div>

      <div className="host-layout">
        <div className="surface-card host-layout__sidebar">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 className="card-title" style={{ fontSize: '1.1rem', margin: 0 }}>Плейлисты</h2>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreatePlaylist(true)}>+</button>
          </div>

          {showCreatePlaylist && (
            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--ttk-gray-100)', borderRadius: 'var(--radius-lg)' }}>
              <input
                type="text"
                className="form-input"
                value={newPlaylistName}
                onChange={(event) => setNewPlaylistName(event.target.value)}
                placeholder="Название плейлиста"
                autoFocus
                style={{ marginBottom: '0.75rem' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-primary btn-sm" onClick={handleCreatePlaylist}>Создать</button>
                <button className="btn btn-outline btn-sm" onClick={() => setShowCreatePlaylist(false)}>Отмена</button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {playlists.map(playlist => (
              <div
                key={playlist.id}
                onClick={() => setSelectedPlaylistId(playlist.id)}
                style={{
                  padding: '1rem',
                  background: selectedPlaylistId === playlist.id
                    ? 'linear-gradient(135deg, rgba(229, 39, 19, 0.1), rgba(229, 39, 19, 0.05))'
                    : 'var(--ttk-gray-100)',
                  border: selectedPlaylistId === playlist.id ? '2px solid var(--ttk-red)' : '2px solid transparent',
                  borderRadius: 'var(--radius-lg)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.25rem', fontSize: '0.95rem' }}>
                      {playlist.name}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--ttk-gray-light)' }}>
                      Треков: {playlist.items?.length || 0}
                      {playlist.is_active && (
                        <span style={{ color: 'var(--ttk-red)', marginLeft: '0.5rem', fontWeight: 600 }}>
                          • Активен
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(event) => handleDeletePlaylist(playlist.id, event)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#999' }}
                  >
                    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {selectedPlaylist && (
            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '2px solid rgba(229, 39, 19, 0.2)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                <button className="btn btn-success btn-sm" onClick={handleActivatePlaylist}>
                  Активировать для эфира
                </button>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-outline btn-sm" onClick={handleToggleLoop} style={{ flex: 1 }}>
                    Loop: {selectedPlaylist.is_looping ? 'ВКЛ' : 'ВЫКЛ'}
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={handleToggleShuffle} style={{ flex: 1 }}>
                    Shuffle: {selectedPlaylist.is_shuffle ? 'ВКЛ' : 'ВЫКЛ'}
                  </button>
                </div>
              </div>

              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--ttk-gray)' }}>
                Треки в плейлисте
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '250px', overflowY: 'auto' }}>
                {selectedPlaylist.items?.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectTrack(item.media_id)}
                    style={{
                      padding: '0.75rem',
                      background: currentTrackId === item.media_id
                        ? 'linear-gradient(135deg, rgba(229, 39, 19, 0.14), rgba(229, 39, 19, 0.06))'
                        : 'var(--ttk-gray-100)',
                      border: currentTrackId === item.media_id ? '1px solid var(--ttk-red)' : '1px solid transparent',
                      borderRadius: 'var(--radius)',
                      fontSize: '0.85rem',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{item.original_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--ttk-gray-light)' }}>
                      {formatPlaybackTime(item.duration)}
                      {currentTrackId === item.media_id && (
                        <span style={{ marginLeft: '0.5rem', color: 'var(--ttk-red)', fontWeight: 700 }}>
                          Сейчас в эфире
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="host-layout__main">
          <div className="surface-card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header" style={{ marginBottom: '1.5rem' }}>
              <h2 className="card-title" style={{ margin: 0 }}>Медиатека</h2>
              <button
                className={`btn ${isRecording ? 'btn-danger' : 'btn-primary'}`}
                onClick={isRecording ? stopRecording : startRecording}
              >
                {isRecording ? 'Стоп' : 'Записать с микрофона'}
              </button>
            </div>

            <FileUpload
              onUpload={handleUpload}
              onError={(text) => setNotice({ type: 'error', text })}
              accept={['mp3', 'wav', 'ogg', 'mp4', 'webm']}
              maxSize={1000}
            />

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '1rem',
                marginTop: '1.5rem',
                maxHeight: '350px',
                overflowY: 'auto',
              }}
            >
              {media.map(item => (
                <div
                  key={item.id}
                  style={{
                    padding: '1rem',
                    background: 'var(--ttk-gray-100)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.original_name}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--ttk-gray-light)', marginBottom: '0.75rem' }}>
                    {item.file_type.toUpperCase()} | {(item.file_size / 1024 / 1024).toFixed(2)} МБ
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => handleAddToPlaylist(item.id)} style={{ flex: 1 }}>
                      + В плейлист
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteMedia(item.id)}>
                      Удалить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="surface-card">
            <div className="card-header" style={{ marginBottom: '1.5rem' }}>
              <h2 className="card-title" style={{ margin: 0 }}>Сообщения</h2>
              <button className="btn btn-outline btn-sm" onClick={handleToggleArchive}>
                {showArchive ? 'Назад' : 'Архив'}
              </button>
            </div>

            <MessagesList messages={messages} onStatusChange={handleMessageStatusChange} showArchive={showArchive} />
          </div>
        </div>
      </div>
    </div>
  )
}


export default HostPage
