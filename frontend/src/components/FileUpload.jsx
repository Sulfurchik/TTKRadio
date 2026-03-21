import { useRef, useState } from 'react'
import { useLanguage } from '../hooks/useLanguage'

function FileUpload({ onUpload, onError, accept, maxSize, multiple = false, details = [] }) {
  const t = useLanguage(state => state.t)
  const language = useLanguage(state => state.language)
  const fileInputRef = useRef(null)
  const [isDragActive, setIsDragActive] = useState(false)

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const processFiles = async (files) => {
    for (const file of files) {
      if (file.size > maxSize * 1024 * 1024) {
        onError?.(t('fileUpload.fileTooLarge')(file.name, maxSize))
        continue
      }
      await onUpload(file)
    }
  }

  const handleChange = async (e) => {
    const files = Array.from(e.target.files || [])
    await processFiles(files)
    e.target.value = ''
  }

  const handleDrop = async (event) => {
    event.preventDefault()
    setIsDragActive(false)
    const files = Array.from(event.dataTransfer.files || [])
    await processFiles(files)
  }

  const formatAccept = () => {
    if (!accept) return '*/*'
    return accept.map(ext => `.${ext}`).join(',')
  }

  return (
    <div
      className={`upload-zone ${isDragActive ? 'upload-zone--active' : ''}`}
      onClick={handleClick}
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragActive(true)
      }}
      onDragLeave={() => setIsDragActive(false)}
      onDrop={handleDrop}
    >
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
      <p>
        <strong>{t('fileUpload.clickOrDrag')}</strong>
      </p>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
        {t('fileUpload.formats')}: {accept?.join(', ') || t('fileUpload.any')}, {t('fileUpload.maxSize')}: {maxSize} {language === 'en' ? 'MB' : 'МБ'}
      </p>
      {details.length > 0 && (
        <div className="upload-zone__details">
          {details.map((detail) => (
            <p key={detail} className="upload-zone__detail">
              {detail}
            </p>
          ))}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={formatAccept()}
        onChange={handleChange}
        multiple={multiple}
        style={{ display: 'none' }}
      />
    </div>
  )
}

export default FileUpload
