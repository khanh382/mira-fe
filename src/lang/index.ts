import en from './locales/en.json';
import vi from './locales/vi.json';
import { useLang } from '@/lang/useLang';
import { LangProvider } from '@/lang/LangProvider';

export type LangCodes = 'en' | 'vi';
export const LANG_STORAGE_KEY = 'appLang';

// Định nghĩa kiểu dữ liệu có thể chứa object lồng nhau
type Translations = { [key: string]: string | Translations };

export const langConfig: { 
  listLangs: { id: number; name: string; code: LangCodes }[];
  langsApp: Partial<Record<LangCodes, Translations>>;
} = {
  listLangs: [
    { id: 1, name: "English", code: "en" },
    { id: 2, name: "Tiếng Việt", code: "vi" },
  ],
  langsApp: {
    en,
    vi,
  }
};

// Hàm hỗ trợ lấy dữ liệu từ object lồng nhau
const getNestedTranslation = (translations: Translations, key: string): string => {
  return key.split('.').reduce((obj: any, k) => {
    if (typeof obj === 'object' && obj !== null && k in obj) {
      return obj[k] as Translations;
    }
    return undefined;
  }, translations as Translations) as string || key;
};

// Hàm thay thế các tham số trong chuỗi
const replaceParameters = (text: string, params?: Record<string, any>): string => {
  if (!params) return text;
  
  return text.replace(/\{(\w+)\}/g, (match, key) => {
    return params[key] !== undefined ? String(params[key]) : match;
  });
};

// Export the translation function that takes language as a parameter
export const getTranslation = (lang: LangCodes) => (key: string, params?: Record<string, any>) => {
  const translations = langConfig.langsApp[lang] || {};
  const translation = getNestedTranslation(translations, key);
  return replaceParameters(translation, params);
};

// Re-export useLang and LangProvider
export { useLang, LangProvider };