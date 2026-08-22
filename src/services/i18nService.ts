import tr from '../i18n/tr.json';
import en from '../i18n/en.json';
import de from '../i18n/de.json';
import fr from '../i18n/fr.json';
import es from '../i18n/es.json';
import ru from '../i18n/ru.json';

const translations: Record<string, any> = { tr, en, de, fr, es, ru };
const LANG_KEY = 'app_lang';
let currentLang = localStorage.getItem(LANG_KEY) || 'tr';
if (!translations[currentLang]) currentLang = 'tr';

export const i18n = {
    setLanguage: (lang: string) => {
        currentLang = translations[lang] ? lang : 'tr';
        localStorage.setItem(LANG_KEY, currentLang);
        document.dispatchEvent(new CustomEvent('lang-changed', { detail: { lang: currentLang } }));
    },
    t: (key: string): string => {
        const value = translations[currentLang]?.[key];
        if (value !== undefined) return value;
        // Aktif dilde yoksa İngilizce'ye düş; o da yoksa anahtarı göster
        return translations['en']?.[key] ?? key;
    },
    getCurrentLang: () => currentLang,
    /**
     * DOM'daki [data-i18n] etiketli elemanların metnini (veya placeholder'ını)
     * aktif dile göre günceller. [data-i18n-title] ile title da güncellenir.
     */
    applyI18n: (root: ParentNode = document) => {
        root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
            const key = el.getAttribute("data-i18n");
            if (!key) return;
            const val = translations[currentLang]?.[key] ?? translations['en']?.[key] ?? key;
            if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
                el.setAttribute("placeholder", val);
            } else {
                el.textContent = val;
            }
        });
        root.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
            const key = el.getAttribute("data-i18n-title");
            if (!key) return;
            const val = translations[currentLang]?.[key] ?? translations['en']?.[key] ?? key;
            el.title = val;
        });
    }
};
