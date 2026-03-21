export const SYNC_TOLERANCE_SECONDS = 0.75

export function getTrackSource(track) {
  if (!track) {
    return null
  }

  if (track.storage_url) {
    return track.storage_url
  }

  if (track.file_path) {
    return `/storage/${track.file_path}`
  }

  return null
}

export function getTrackKey(status) {
  if (!status?.current_media) {
    return null
  }

  return `${status.current_media.id}:${status.started_at || ''}`
}

export function getSyncedPositionSeconds(status, now = Date.now()) {
  if (!status?.is_broadcasting || !status.current_media) {
    return 0
  }

  let position = Number(status.position_seconds || 0)

  if (status.server_timestamp_ms) {
    position += Math.max(0, (now - Number(status.server_timestamp_ms)) / 1000)
  } else if (status.server_time) {
    const serverTime = new Date(status.server_time).getTime()
    if (!Number.isNaN(serverTime)) {
      position += Math.max(0, (now - serverTime) / 1000)
    }
  } else if (status.started_at) {
    const startedAt = new Date(status.started_at).getTime()
    if (!Number.isNaN(startedAt)) {
      position = Math.max(0, (now - startedAt) / 1000)
    }
  }

  const duration = Number(status.current_media.duration || 0)
  if (duration > 0) {
    return Math.min(position, duration)
  }

  return Math.max(position, 0)
}

export function formatPlaybackTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}
