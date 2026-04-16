export type SupportedLang = "en" | "hi" | "es" | "fr";

export const LANGUAGES: Record<SupportedLang, { label: string; nativeLabel: string; flag: string; sttCode: string }> = {
  en: { label: "English",  nativeLabel: "English",  flag: "🇺🇸", sttCode: "en-US" },
  hi: { label: "Hindi",    nativeLabel: "हिंदी",     flag: "🇮🇳", sttCode: "hi-IN" },
  es: { label: "Spanish",  nativeLabel: "Español",   flag: "🇪🇸", sttCode: "es-ES" },
  fr: { label: "French",   nativeLabel: "Français",  flag: "🇫🇷", sttCode: "fr-FR" },
};

// UI strings per language
export const UI_STRINGS: Record<SupportedLang, {
  welcome: string;
  startInterview: string;
  submitInterview: string;
  allAnswered: string;
  submitToComplete: string;
  listening: string;
  typeAnswer: string;
  voiceOn: string;
  voiceOff: string;
  speaking: string;
  questionsAnswered: string;
  interviewComplete: string;
  thankYou: string;
  chooseLanguage: string;
}> = {
  en: {
    welcome: "Welcome to your AI interview!",
    startInterview: "Start Interview",
    submitInterview: "Submit Interview",
    allAnswered: "All questions answered!",
    submitToComplete: "Submit to complete your interview",
    listening: "🎤 Listening… auto-sends when you stop",
    typeAnswer: "Type your answer or click Speak…",
    voiceOn: "Voice On",
    voiceOff: "Voice Off",
    speaking: "Speaking…",
    questionsAnswered: "answered",
    interviewComplete: "Interview Complete!",
    thankYou: "Thank you! Your responses have been submitted.",
    chooseLanguage: "Choose your language",
  },
  hi: {
    welcome: "आपके AI इंटरव्यू में आपका स्वागत है!",
    startInterview: "इंटरव्यू शुरू करें",
    submitInterview: "इंटरव्यू जमा करें",
    allAnswered: "सभी प्रश्नों के उत्तर दिए!",
    submitToComplete: "इंटरव्यू पूरा करने के लिए जमा करें",
    listening: "🎤 सुन रहा हूँ… रुकने पर अपने आप भेजेगा",
    typeAnswer: "अपना उत्तर टाइप करें या बोलें…",
    voiceOn: "आवाज़ चालू",
    voiceOff: "आवाज़ बंद",
    speaking: "बोल रहा है…",
    questionsAnswered: "उत्तर दिए",
    interviewComplete: "इंटरव्यू पूरा!",
    thankYou: "धन्यवाद! आपके उत्तर सफलतापूर्वक जमा हो गए।",
    chooseLanguage: "अपनी भाषा चुनें",
  },
  es: {
    welcome: "¡Bienvenido a tu entrevista con IA!",
    startInterview: "Iniciar entrevista",
    submitInterview: "Enviar entrevista",
    allAnswered: "¡Todas las preguntas respondidas!",
    submitToComplete: "Envía para completar tu entrevista",
    listening: "🎤 Escuchando… se envía automáticamente al parar",
    typeAnswer: "Escribe tu respuesta o haz clic en Hablar…",
    voiceOn: "Voz activada",
    voiceOff: "Voz desactivada",
    speaking: "Hablando…",
    questionsAnswered: "respondidas",
    interviewComplete: "¡Entrevista completa!",
    thankYou: "¡Gracias! Tus respuestas han sido enviadas.",
    chooseLanguage: "Elige tu idioma",
  },
  fr: {
    welcome: "Bienvenue à votre entretien IA !",
    startInterview: "Commencer l'entretien",
    submitInterview: "Soumettre l'entretien",
    allAnswered: "Toutes les questions répondues !",
    submitToComplete: "Soumettez pour terminer votre entretien",
    listening: "🎤 Écoute… envoi automatique à l'arrêt",
    typeAnswer: "Tapez votre réponse ou cliquez sur Parler…",
    voiceOn: "Voix activée",
    voiceOff: "Voix désactivée",
    speaking: "En train de parler…",
    questionsAnswered: "répondues",
    interviewComplete: "Entretien terminé !",
    thankYou: "Merci ! Vos réponses ont été soumises.",
    chooseLanguage: "Choisissez votre langue",
  },
};

// Prompt instruction per language
export function getLangInstruction(lang: SupportedLang): string {
  if (lang === "en") return "";
  const map: Record<string, string> = {
    hi: "IMPORTANT: Generate all questions in Hindi (हिंदी). Use Devanagari script.",
    es: "IMPORTANT: Generate all questions in Spanish (Español).",
    fr: "IMPORTANT: Generate all questions in French (Français).",
  };
  return map[lang] ?? "";
}

export function getFeedbackLangInstruction(lang: SupportedLang): string {
  if (lang === "en") return "";
  const map: Record<string, string> = {
    hi: "IMPORTANT: Write all text fields (summary, strengths, weakAreas, improvementRoadmap, betterAnswers) in Hindi (हिंदी).",
    es: "IMPORTANT: Write all text fields in Spanish (Español).",
    fr: "IMPORTANT: Write all text fields in French (Français).",
  };
  return map[lang] ?? "";
}
