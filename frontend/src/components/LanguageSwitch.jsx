import { useMemo, useState } from 'react'

import { useLanguage } from '../hooks/useLanguage'

function LanguageSwitch() {
  const language = useLanguage(state => state.language)
  const setLanguage = useLanguage(state => state.setLanguage)
  const t = useLanguage(state => state.t)
  const [isExpanded, setIsExpanded] = useState(false)

  const secondaryLanguage = useMemo(() => (language === 'ru' ? 'en' : 'ru'), [language])

  const collapse = () => setIsExpanded(false)
  const expand = () => setIsExpanded(true)
  const handleBlur = (event) => {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return
    }
    collapse()
  }

  const handleCurrentClick = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches) {
      return
    }
    setIsExpanded(prev => !prev)
  }

  const handleLanguageSelect = (nextLanguage) => {
    setLanguage(nextLanguage)
    collapse()
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  }

  return (
    <div
      className={`language-switch ${isExpanded ? 'language-switch--expanded' : ''}`}
      role="group"
      aria-label={t('navbar.switchLanguage')}
      onMouseEnter={expand}
      onMouseLeave={collapse}
      onFocus={expand}
      onBlur={handleBlur}
    >
      <button
        type="button"
        className="btn btn-outline btn-sm language-switch__button language-switch__button--secondary"
        onClick={() => handleLanguageSelect(secondaryLanguage)}
        tabIndex={isExpanded ? 0 : -1}
        aria-hidden={!isExpanded}
      >
        {secondaryLanguage.toUpperCase()}
      </button>
      <button
        type="button"
        className="btn btn-outline btn-sm language-switch__button language-switch__button--active"
        onClick={handleCurrentClick}
        aria-label={t('navbar.switchLanguage')}
        aria-expanded={isExpanded}
      >
        {language.toUpperCase()}
      </button>
    </div>
  )
}

export default LanguageSwitch
