import api from './api'

export const authService = {
  login: async (login, password) => {
    const response = await api.post('/auth/login', { login, password })
    return response.data
  },

  register: async (data) => {
    const response = await api.post('/auth/register', data)
    return response.data
  },

  getMe: async () => {
    const response = await api.get('/auth/me')
    return response.data
  },

  updatePresence: async () => {
    const response = await api.post('/auth/presence')
    return response.data
  },

  markOffline: async () => {
    const response = await api.post('/auth/presence/offline')
    return response.data
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }
}

export const adminService = {
  getUsers: async (filters = {}) => {
    const params = new URLSearchParams()
    if (filters.login) params.append('login', filters.login)
    if (filters.fio) params.append('fio', filters.fio)
    if (filters.role_id) params.append('role_id', filters.role_id)
    if (filters.date_from) params.append('date_from', `${filters.date_from}T00:00:00`)
    if (filters.date_to) params.append('date_to', `${filters.date_to}T23:59:59`)
    const response = await api.get(`/admin/users?${params}`)
    return response.data
  },

  getUser: async (userId) => {
    const response = await api.get(`/admin/users/${userId}`)
    return response.data
  },

  updateUser: async (userId, data) => {
    const response = await api.put(`/admin/users/${userId}`, data)
    return response.data
  },

  deleteUser: async (userId) => {
    const response = await api.delete(`/admin/users/${userId}`)
    return response.data
  },

  changePassword: async (userId, passwords) => {
    const response = await api.post(`/admin/users/${userId}/password`, passwords)
    return response.data
  },

  assignRoles: async (userId, roleIds) => {
    const response = await api.post(`/admin/users/${userId}/roles`, { role_ids: roleIds })
    return response.data
  },

  getRoles: async () => {
    const response = await api.get('/admin/roles')
    return response.data
  }
}

export const playerService = {
  sendMessage: async (text) => {
    const response = await api.post('/player/messages', { text })
    return response.data
  },

  sendVoiceMessage: async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post('/player/voice', formData)
    return response.data
  },

  getMessages: async () => {
    const response = await api.get('/player/messages')
    return response.data
  },

  getVoiceMessages: async () => {
    const response = await api.get('/player/voice-messages')
    return response.data
  },

  getBroadcastStatus: async () => {
    const response = await api.get('/player/broadcast-status')
    return response.data
  }
}

export const hostService = {
  // Медиатека
  getMedia: async () => {
    const response = await api.get('/host/media')
    return response.data
  },

  uploadMedia: async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post('/host/media/upload', formData)
    return response.data
  },

  deleteMedia: async (mediaId) => {
    const response = await api.delete(`/host/media/${mediaId}`)
    return response.data
  },

  renameMedia: async (mediaId, originalName) => {
    const response = await api.put(`/host/media/${mediaId}`, { original_name: originalName })
    return response.data
  },

  // Плейлисты
  getPlaylists: async () => {
    const response = await api.get('/host/playlists')
    return response.data
  },

  createPlaylist: async (name) => {
    const response = await api.post('/host/playlists', { name })
    return response.data
  },

  addItemToPlaylist: async (playlistId, mediaId) => {
    const response = await api.post(`/host/playlists/${playlistId}/items`, { media_id: mediaId })
    return response.data
  },

  deleteItemFromPlaylist: async (playlistId, itemId) => {
    const response = await api.delete(`/host/playlists/${playlistId}/items/${itemId}`)
    return response.data
  },

  deletePlaylist: async (playlistId) => {
    const response = await api.delete(`/host/playlists/${playlistId}`)
    return response.data
  },

  toggleLoop: async (playlistId) => {
    const response = await api.put(`/host/playlists/${playlistId}/toggle-loop`)
    return response.data
  },

  toggleShuffle: async (playlistId) => {
    const response = await api.put(`/host/playlists/${playlistId}/toggle-shuffle`)
    return response.data
  },

  activatePlaylist: async (playlistId) => {
    const response = await api.post(`/host/playlists/${playlistId}/activate`)
    return response.data
  },

  // Вещание
  getBroadcastStatus: async () => {
    const response = await api.get('/host/broadcast/status')
    return response.data
  },

  startBroadcast: async (playlistId) => {
    const formData = new FormData()
    if (playlistId) formData.append('playlist_id', playlistId)
    const response = await api.post('/host/broadcast/start', formData)
    return response.data
  },

  stopBroadcast: async () => {
    const response = await api.post('/host/broadcast/stop')
    return response.data
  },

  nextBroadcastTrack: async () => {
    const response = await api.post('/host/broadcast/next')
    return response.data
  },

  previousBroadcastTrack: async () => {
    const response = await api.post('/host/broadcast/previous')
    return response.data
  },

  setCurrentMedia: async (mediaId) => {
    const response = await api.put('/host/broadcast/current-media', { media_id: mediaId })
    return response.data
  },

  updateBroadcastVolume: async (volume) => {
    const response = await api.put('/host/broadcast/volume', { volume })
    return response.data
  },

  pauseBroadcast: async () => {
    const response = await api.post('/host/broadcast/pause')
    return response.data
  },

  resumeBroadcast: async () => {
    const response = await api.post('/host/broadcast/resume')
    return response.data
  },

  finishBroadcastMedia: async () => {
    const response = await api.post('/host/broadcast/finish')
    return response.data
  },

  startLiveAudioBroadcast: async () => {
    const response = await api.post('/host/broadcast/live-audio/start')
    return response.data
  },

  stopLiveAudioBroadcast: async () => {
    const response = await api.post('/host/broadcast/live-audio/stop')
    return response.data
  },

  // Сообщения
  getMessages: async (statusFilter) => {
    const params = statusFilter ? `?status=${statusFilter}` : ''
    const response = await api.get(`/host/messages${params}`)
    return response.data
  },

  updateMessageStatus: async (messageId, status) => {
    const response = await api.put(`/host/messages/${messageId}/status`, { status })
    return response.data
  },

  getArchivedMessages: async () => {
    const response = await api.get('/host/messages/archive')
    return response.data
  },

  getVoiceMessages: async () => {
    const response = await api.get('/host/voice-messages')
    return response.data
  },

  getArchivedVoiceMessages: async () => {
    const response = await api.get('/host/voice-messages/archive')
    return response.data
  },

  updateVoiceMessageStatus: async (voiceMessageId, status) => {
    const response = await api.put(`/host/voice-messages/${voiceMessageId}/status`, { status })
    return response.data
  },

  // Запись
  recordAudio: async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post('/host/record', formData)
    return response.data
  }
}
