"use client";
import React, { createContext, useState, useEffect } from 'react';
import { LANG_STORAGE_KEY, LangCodes, langConfig as importedLangConfig } from "@/lang";

export interface LangContextProps {
  lang: LangCodes;
  setLang: (lang: LangCodes) => void;
  langConfig: typeof importedLangConfig;
}

export const LangContext = createContext<LangContextProps | undefined>(undefined);

interface LangProviderProps {
  children: React.ReactNode;
  initialLang?: LangCodes;
  langConfig?: typeof importedLangConfig;
}

export const LangProvider: React.FC<LangProviderProps> = ({ 
  children, 
  initialLang = 'en', 
  langConfig 
}) => {
  const [mounted, setMounted] = useState(false);
  const [lang, setLang] = useState<LangCodes>(initialLang);
  const config = langConfig || importedLangConfig;

  const isSupportedLang = (value: string): value is LangCodes => {
    return config.listLangs.some((item) => item.code === value);
  };

  useEffect(() => {
    setMounted(true);
    const storedLang = localStorage.getItem(LANG_STORAGE_KEY);
    if (storedLang && isSupportedLang(storedLang)) {
      setLang(storedLang);
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
      document.documentElement.lang = lang;
    }
  }, [lang, mounted]);

  return (
    <LangContext.Provider value={{ lang, setLang, langConfig: config }}>
      {children}
    </LangContext.Provider>
  );
};