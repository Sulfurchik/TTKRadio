import { useRef } from 'react'

function FileUpload({ onUpload, accept, maxSize, multiple = false }) {
  const fileInputRef = useRef(null)

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleChange = async (e) => {
    const files = Array.from(e.target.files || [])
    
    for (const file of files) {
      if (file.size > maxSize * 1024 * 1024) {
        alert(`Файл ${file.name} слишком большой. Максимум ${maxSize} МБ`)
        continue
      }
      await onUpload(file)
    }
    
    e.target.value = ''
  }

  const formatAccept = () => {
    if (!accept) return '*/*'
    return accept.map(ext => `.${ext}`).join(',')
  }

  return (
    <div className="upload-zone" onClick={handleClick}>
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
      <p>
        <strong>Нажмите для загрузки</strong> или перетащите файл
      </p>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
        Форматы: {accept?.join(', ') || 'Любые'}, Макс. размер: {maxSize} МБ
      </p>
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
