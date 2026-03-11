'use client';

import { useTranslation } from '@/lib/i18n/LanguageContext';
import { motion } from 'framer-motion';

export function LanguageToggle() {
    const { language, setLanguage } = useTranslation();

    const toggleLang = () => {
        setLanguage(language === 'es' ? 'en' : 'es');
    };

    return (
        <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleLang}
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-secondary hover:bg-accent border text-sm font-bold border-border transition-colors text-foreground"
            aria-label="Toggle language"
        >
            {language.toUpperCase()}
        </motion.button>
    );
}
