import { useEffect, useState } from 'react'
import { notifyRequest } from '../api/client'

const KEY = 'faind.accessibility.v1'
type Preferences = { highContrast: boolean; reducedMotion: boolean; textScale: number }

export function AccessibilityControls() {
  const [preferences, setPreferences] = useState<Preferences>(() => {
    try { return JSON.parse(localStorage.getItem(KEY) ?? '') as Preferences } catch { return { highContrast: false, reducedMotion: false, textScale: 1 } }
  })
  useEffect(() => {
    document.documentElement.dataset.highContrast = String(preferences.highContrast)
    document.documentElement.dataset.reducedMotion = String(preferences.reducedMotion)
    document.documentElement.style.fontSize = `${preferences.textScale * 100}%`
    localStorage.setItem(KEY, JSON.stringify(preferences))
  }, [preferences])
  const save = (next: Preferences) => {
    setPreferences(next)
    void notifyRequest('/governance/preferences', { method: 'POST', body: { ...next, locale: navigator.language, roleLayout: { compact: true } } }).catch(() => undefined)
  }
  return <div className="accessibility-controls" aria-label="접근성 설정">
    <button type="button" className="wf-btn small" aria-pressed={preferences.highContrast} onClick={() => save({ ...preferences, highContrast: !preferences.highContrast })}>고대비</button>
    <button type="button" className="wf-btn small" aria-pressed={preferences.reducedMotion} onClick={() => save({ ...preferences, reducedMotion: !preferences.reducedMotion })}>모션 축소</button>
    <button type="button" className="wf-btn small" onClick={() => save({ ...preferences, textScale: preferences.textScale >= 1.5 ? 1 : preferences.textScale + .25 })}>글자 {Math.round(preferences.textScale * 100)}%</button>
  </div>
}
