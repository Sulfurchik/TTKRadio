import { useEffect, useRef, useState } from 'react'

import { getLocale, useLanguage } from '../hooks/useLanguage'
import { formatProjectDateTime } from '../utils/dateTime'

function MessagesList({ messages, onStatusChange, showArchive = false }) {
  const language = useLanguage(state => state.language)
  const t = useLanguage(state => state.t)
  const locale = getLocale(language)
  const audioRef = useRef(null)
  const [activeVoiceId, setActiveVoiceId] = useState(null)

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const getStatusClass = (status) => {
    switch (status) {
      case 'new': return 'status-new'
      case 'in_progress': return 'status-in_progress'
      case 'completed': return 'status-completed'
      default: return ''
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'new': return t('messageStatus.new')
      case 'in_progress': return t('messageStatus.inProgress')
      case 'completed': return t('messageStatus.completed')
      default: return status
    }
  }

  const toggleVoicePlayback = async (message) => {
    if (!message?.storage_url) {
      return
    }

    if (activeVoiceId === message.id && audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
      setActiveVoiceId(null)
      return
    }

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    const audio = new Audio(message.storage_url)
    audioRef.current = audio
    audio.onended = () => {
      if (audioRef.current === audio) {
        audioRef.current = null
      }
      setActiveVoiceId(null)
    }
    audio.onpause = () => {
      if (audio.ended) {
        return
      }
      if (audioRef.current === audio) {
        audioRef.current = null
      }
      setActiveVoiceId(prev => (prev === message.id ? null : prev))
    }

    try {
      await audio.play()
      setActiveVoiceId(message.id)
    } catch (error) {
      if (audioRef.current === audio) {
        audioRef.current = null
      }
      setActiveVoiceId(null)
    }
  }

  if (!messages || messages.length === 0) {
    return <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>{t('player.noMessages')}</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {messages.map(msg => (
        <div 
          key={`${msg.message_type || 'text'}-${msg.id}`} 
          style={{
            padding: '1rem',
            background: 'var(--player-message-card-bg)',
            border: '1px solid var(--player-message-card-border)',
            borderRadius: '0.5rem',
            borderLeft: msg.message_type === 'voice' || msg.status === 'new' ? '4px solid var(--primary-color)' : '4px solid transparent'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span className={`status-badge ${getStatusClass(msg.status)}`}>
              {getStatusText(msg.status)}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {formatProjectDateTime(msg.created_at, locale)}
            </span>
          </div>
          {msg.message_type === 'voice' ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ marginBottom: '0.35rem', color: 'var(--page-text)', fontWeight: 600 }}>
                  {t('common.voiceMessage')}
                </p>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  {msg.user_fio || msg.user_login || 'User'}
                  {msg.duration ? ` · ${Math.max(1, Math.round(msg.duration))}s` : ''}
                </p>
              </div>
              <button
                type="button"
                className={`btn btn-sm ${activeVoiceId === msg.id ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => toggleVoicePlayback(msg)}
                title={activeVoiceId === msg.id ? t('common.pauseAudio') : t('common.playAudio')}
                aria-label={activeVoiceId === msg.id ? t('common.pauseAudio') : t('common.playAudio')}
              >
                {activeVoiceId === msg.id ? t('player.pause') : t('player.play')}
              </button>
            </div>
          ) : (
            <p style={{ marginBottom: '0.75rem', color: 'var(--page-text)' }}>{msg.text}</p>
          )}
          {!showArchive && msg.status !== 'completed' && typeof onStatusChange === 'function' && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {msg.status === 'new' && (
                <button 
                  className="btn btn-primary btn-sm"
                  onClick={() => onStatusChange(msg, 'in_progress')}
                >
                  {t('messageStatus.takeInProgress')}
                </button>
              )}
              {msg.status === 'in_progress' && (
                <button 
                  className="btn btn-success btn-sm"
                  onClick={() => onStatusChange(msg, 'completed')}
                >
                  {t('messageStatus.finish')}
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default MessagesList
