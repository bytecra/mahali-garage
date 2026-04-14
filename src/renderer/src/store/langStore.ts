import { create } from 'zustand'
import { applyLanguage } from '../i18n/index'
import { useAuthStore } from './authStore'

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
    const loggedIn = useAuthStore.getState().user != null
    if (loggedIn) {
      void window.electronAPI.users.updateMyPreferences({ language: lang }).catch(() => {})
    } else {
      void window.electronAPI.settings.set('appearance.language', lang).catch(() => {})
    }
  },
}))
