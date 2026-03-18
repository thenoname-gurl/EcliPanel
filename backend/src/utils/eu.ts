const EU_COUNTRIES = new Set([
  'austria', 'at',
  'belgium', 'be',
  'bulgaria', 'bg',
  'croatia', 'hr',
  'cyprus', 'cy',
  'czech republic', 'cz', 'czechia',
  'denmark', 'dk',
  'estonia', 'ee',
  'finland', 'fi',
  'france', 'fr',
  'germany', 'de',
  'greece', 'gr',
  'hungary', 'hu',
  'ireland', 'ie',
  'italy', 'it',
  'latvia', 'lv',
  'lithuania', 'lt',
  'luxembourg', 'lu',
  'malta', 'mt',
  'netherlands', 'nl',
  'poland', 'pl',
  'portugal', 'pt',
  'romania', 'ro',
  'slovakia', 'sk',
  'slovenia', 'si',
  'spain', 'es',
  'sweden', 'se',
]);

export function isEUCountry(country?: string | null): boolean {
  if (!country) return false;
  const value = country.toString().trim().toLowerCase();
  return EU_COUNTRIES.has(value);
}

export function isEUIdVerificationDisabledForCountry(country?: string | null): boolean {
  if ((process.env.EU_ID_DISABLED || '').toLowerCase() !== 'true') return false;
  return isEUCountry(country);
}
