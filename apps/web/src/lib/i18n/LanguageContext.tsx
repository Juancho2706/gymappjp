'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import en from './en.json';
import es from './es.json';

type Language = 'en' | 'es';
type Translations = Record<string, string>;

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
}

const dictionaries: Record<Language, Translations> = {
    en,
    es,
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguageState] = useState<Language>('es');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const storedLang = localStorage.getItem('omni-lang') as Language;
        if (storedLang && (storedLang === 'en' || storedLang === 'es')) {
            setLanguageState(storedLang);
        } else {
            const browserLang = navigator.language.startsWith('es') ? 'es' : 'en';
            setLanguageState(browserLang);
        }
        setMounted(true);
    }, []);

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        localStorage.setItem('omni-lang', lang);
        // Force refresh to handle server components if necessary
        // window.location.reload(); 
    };

    const t = (key: string) => {
        return dictionaries[language][key] || key;
    };

    // We MUST return the Provider even if not mounted so that children calling
    // useTranslation() during SSR or initial hydration don't crash.
    // The initial state 'es' matches SSR, preventing hydration mismatches.
    // When mounted is true, the useEffect will update the state if needed.
    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useTranslation() {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useTranslation must be used within a LanguageProvider');
    }
    return context;
}
