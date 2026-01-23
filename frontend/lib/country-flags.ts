// Utility function to get country code from country name
// Maps common country names to ISO 3166-1 alpha-2 codes for flag display

const countryNameToCode: Record<string, string> = {
  'Spain': 'ES',
  'Portugal': 'PT',
  'Italy': 'IT',
  'Greece': 'GR',
  'Croatia': 'HR',
  'Thailand': 'TH',
  'USA': 'US',
  'United States': 'US',
  'United States of America': 'US',
  'France': 'FR',
  'Germany': 'DE',
  'United Kingdom': 'GB',
  'UK': 'GB',
  'Netherlands': 'NL',
  'Belgium': 'BE',
  'Switzerland': 'CH',
  'Austria': 'AT',
  'Poland': 'PL',
  'Czech Republic': 'CZ',
  'Hungary': 'HU',
  'Romania': 'RO',
  'Bulgaria': 'BG',
  'Turkey': 'TR',
  'Egypt': 'EG',
  'Morocco': 'MA',
  'Tunisia': 'TN',
  'Cyprus': 'CY',
  'Malta': 'MT',
  'Ireland': 'IE',
  'Denmark': 'DK',
  'Sweden': 'SE',
  'Norway': 'NO',
  'Finland': 'FI',
  'Iceland': 'IS',
};

// Region mapping based on backend CSV data
export type Region = 'Iberia' | 'Southern Europe' | 'Western Europe' | 'Northern Europe';

const countryToRegion: Record<string, Region> = {
  // Iberia
  'Spain': 'Iberia',
  'Portugal': 'Iberia',
  // Southern Europe
  'Italy': 'Southern Europe',
  'Greece': 'Southern Europe',
  'Croatia': 'Southern Europe',
  'Turkey': 'Southern Europe',
  'Malta': 'Southern Europe',
  'Cyprus': 'Southern Europe',
  // Western Europe
  'France': 'Western Europe',
  'Netherlands': 'Western Europe',
  'Belgium': 'Western Europe',
  'Austria': 'Western Europe',
  'Germany': 'Western Europe',
  'Switzerland': 'Western Europe',
  // Northern Europe
  'United Kingdom': 'Northern Europe',
  'Ireland': 'Northern Europe',
  'Denmark': 'Northern Europe',
  'Norway': 'Northern Europe',
  'Sweden': 'Northern Europe',
  'Finland': 'Northern Europe',
  'Iceland': 'Northern Europe',
};

export const ALL_REGIONS: Region[] = ['Iberia', 'Southern Europe', 'Western Europe', 'Northern Europe'];

export function getCountryCode(countryName: string): string {
  // Try direct lookup
  const code = countryNameToCode[countryName];
  if (code) return code.toLowerCase();

  // If not found, return 'XX' as fallback (will show a placeholder)
  return 'xx';
}

export function getRegion(countryName: string): Region | null {
  return countryToRegion[countryName] || null;
}

export function getFlagUrl(countryCode: string, size: 'w20' | 'w40' | 'w80' | 'w160' | 'w320' | 'w640' | 'w1280' | 'w2560' = 'w40'): string {
  return `https://flagcdn.com/${size}/${countryCode.toLowerCase()}.png`;
}
