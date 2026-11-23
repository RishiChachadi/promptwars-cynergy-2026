// Future providers can implement this boundary without touching bookings or the browser.
export function createProjectAssistant({ GEMINI_API_KEY, GEMINI_MODEL }) {
  const geminiConfigured = Boolean(GEMINI_API_KEY?.trim() && GEMINI_MODEL?.trim())
  return {
    status() {
      return {
        mode: 'unavailable',
        message: geminiConfigured
          ? 'Gemini configuration is present. Recommendations will be enabled in a later phase.'
          : 'AI recommendations will be enabled in a later phase. Browse the catalog to find equipment for your project.',
      }
    },
  }
}
