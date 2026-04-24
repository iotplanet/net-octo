import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  catalogs,
  initialLocale,
  LEGACY_LOCALE_STORAGE_KEY,
  LOCALE_STORAGE_KEY,
  writeStoredLocale,
  type Locale,
  type MessageId,
} from './catalog'

export type Translate = (id: MessageId) => string

type I18nContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Translate
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale())

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    writeStoredLocale(next)
  }, [])

  const t = useCallback(
    (id: MessageId) => {
      const table = catalogs[locale]
      return table[id] ?? catalogs.en[id] ?? id
    },
    [locale],
  )

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  useLayoutEffect(() => {
    try {
      document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
    } catch {
      /* ignore */
    }
  }, [locale])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== LOCALE_STORAGE_KEY && e.key !== LEGACY_LOCALE_STORAGE_KEY) return
      const v = e.newValue
      if (v === 'zh' || v === 'en') setLocaleState(v)
    }
    globalThis.addEventListener('storage', onStorage)
    return () => globalThis.removeEventListener('storage', onStorage)
  }, [])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
