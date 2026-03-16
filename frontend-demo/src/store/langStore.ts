import { create } from 'zustand'
import { applyLanguage } from '../i18n/index'

type Lang = 'en' | 'ar'

interface LangState {
  lang: Lang
  setLang: (lang: Lang) => void
}

export const useLangStore = create<LangState>((set) => ({
  lang: 'en',

  setLang: (lang) => {
    set({ lang })
    applyLanguage(lang)
    window.electronAPI.settings.set('appearance.language', lang).catch(() => {})
  },
}))
