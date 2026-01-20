'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Language = 'en' | 'pl' | 'es' | 'pt' | 'de' | 'fr';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Translation dictionary
const translations: Record<Language, Record<string, string>> = {
  en: {
    'title': 'Holiday Destination Finder',
    'subtitle': 'Discover the perfect holiday destination based on flight prices and weather',
    'origin': 'Origin Airport (IATA)',
    'startDate': 'Start Date',
    'endDate': 'End Date',
    'tripLength': 'Trip Length (days)',
    'topN': 'Top N Results',
    'flightProviders': 'Flight Providers',
    'searchDestinations': 'Search Destinations',
    'searching': 'Searching...',
    'apiUnreachable': '⚠️ API server is not reachable. Please ensure the backend is running.',
    'searchProgress': 'Search Progress',
    'status': 'Status',
    'queuePosition': 'Queue Position',
    'nextInQueue': '(Next in queue)',
    'processing': 'Processing',
    'destinations': 'destinations',
    'topDestinations': 'Top {count} Destinations',
    'noDestinations': 'No destinations found. Try adjusting your search parameters.',
    'searchFailed': 'Search Failed',
    'temperature': 'Temperature',
    'rainfall': 'Rainfall',
    'stopsLabel': 'Stops',
    'airline': 'Airline',
    'direct': 'Direct',
    'stop': 'stop',
    'stops': 'stops',
    'departure': 'Departure',
    'return': 'Return',
    'score': 'Score',
  },
  pl: {
    'title': 'Wyszukiwarka Destynacji Wakacyjnych',
    'subtitle': 'Odkryj idealną destynację wakacyjną na podstawie cen lotów i pogody',
    'origin': 'Lotnisko wylotu (IATA)',
    'startDate': 'Data rozpoczęcia',
    'endDate': 'Data zakończenia',
    'tripLength': 'Długość wyjazdu (dni)',
    'topN': 'Liczba wyników',
    'flightProviders': 'Linie lotnicze',
    'searchDestinations': 'Szukaj destynacji',
    'searching': 'Wyszukiwanie...',
    'apiUnreachable': '⚠️ Serwer API jest niedostępny. Upewnij się, że backend działa.',
    'searchProgress': 'Postęp wyszukiwania',
    'status': 'Status',
    'queuePosition': 'Pozycja w kolejce',
    'nextInQueue': '(Następny w kolejce)',
    'processing': 'Przetwarzanie',
    'destinations': 'destynacji',
    'topDestinations': 'Top {count} destynacji',
    'noDestinations': 'Nie znaleziono destynacji. Spróbuj zmienić parametry wyszukiwania.',
    'searchFailed': 'Wyszukiwanie nie powiodło się',
    'temperature': 'Temperatura',
    'rainfall': 'Opady',
    'stopsLabel': 'Przesiadki',
    'airline': 'Linia lotnicza',
    'direct': 'Bezpośredni',
    'stop': 'przesiadka',
    'stops': 'przesiadki',
    'departure': 'Wylot',
    'return': 'Powrót',
    'score': 'Punktacja',
  },
  es: {
    'title': 'Buscador de Destinos Vacacionales',
    'subtitle': 'Descubre el destino vacacional perfecto basado en precios de vuelos y clima',
    'origin': 'Aeropuerto de Origen (IATA)',
    'startDate': 'Fecha de Inicio',
    'endDate': 'Fecha de Fin',
    'tripLength': 'Duración del Viaje (días)',
    'topN': 'Top N Resultados',
    'flightProviders': 'Proveedores de Vuelos',
    'searchDestinations': 'Buscar Destinos',
    'searching': 'Buscando...',
    'apiUnreachable': '⚠️ El servidor API no es accesible. Asegúrate de que el backend esté funcionando.',
    'searchProgress': 'Progreso de Búsqueda',
    'status': 'Estado',
    'queuePosition': 'Posición en Cola',
    'nextInQueue': '(Siguiente en cola)',
    'processing': 'Procesando',
    'destinations': 'destinos',
    'topDestinations': 'Top {count} Destinos',
    'noDestinations': 'No se encontraron destinos. Intenta ajustar los parámetros de búsqueda.',
    'searchFailed': 'Búsqueda Fallida',
    'temperature': 'Temperatura',
    'rainfall': 'Precipitación',
    'stopsLabel': 'Escalas',
    'airline': 'Aerolínea',
    'direct': 'Directo',
    'stop': 'escala',
    'stops': 'escalas',
    'departure': 'Salida',
    'return': 'Regreso',
    'score': 'Puntuación',
  },
  pt: {
    'title': 'Localizador de Destinos de Férias',
    'subtitle': 'Descubra o destino de férias perfeito com base em preços de voos e clima',
    'origin': 'Aeroporto de Origem (IATA)',
    'startDate': 'Data de Início',
    'endDate': 'Data de Fim',
    'tripLength': 'Duração da Viagem (dias)',
    'topN': 'Top N Resultados',
    'flightProviders': 'Provedores de Voos',
    'searchDestinations': 'Buscar Destinos',
    'searching': 'Buscando...',
    'apiUnreachable': '⚠️ O servidor API não está acessível. Certifique-se de que o backend está em execução.',
    'searchProgress': 'Progresso da Busca',
    'status': 'Status',
    'queuePosition': 'Posição na Fila',
    'nextInQueue': '(Próximo na fila)',
    'processing': 'Processando',
    'destinations': 'destinos',
    'topDestinations': 'Top {count} Destinos',
    'noDestinations': 'Nenhum destino encontrado. Tente ajustar os parâmetros de busca.',
    'searchFailed': 'Busca Falhou',
    'temperature': 'Temperatura',
    'rainfall': 'Precipitação',
    'stopsLabel': 'Escalas',
    'airline': 'Companhia Aérea',
    'direct': 'Direto',
    'stop': 'escala',
    'stops': 'escalas',
    'departure': 'Partida',
    'return': 'Retorno',
    'score': 'Pontuação',
  },
  de: {
    'title': 'Urlaubsziel-Finder',
    'subtitle': 'Entdecken Sie das perfekte Urlaubsziel basierend auf Flugpreisen und Wetter',
    'origin': 'Abflughafen (IATA)',
    'startDate': 'Startdatum',
    'endDate': 'Enddatum',
    'tripLength': 'Reisedauer (Tage)',
    'topN': 'Top N Ergebnisse',
    'flightProviders': 'Fluganbieter',
    'searchDestinations': 'Ziele Suchen',
    'searching': 'Suche läuft...',
    'apiUnreachable': '⚠️ API-Server ist nicht erreichbar. Bitte stellen Sie sicher, dass das Backend läuft.',
    'searchProgress': 'Suchfortschritt',
    'status': 'Status',
    'queuePosition': 'Warteschlangenposition',
    'nextInQueue': '(Nächster in Warteschlange)',
    'processing': 'Verarbeitung',
    'destinations': 'Ziele',
    'topDestinations': 'Top {count} Ziele',
    'noDestinations': 'Keine Ziele gefunden. Versuchen Sie, Ihre Suchparameter anzupassen.',
    'searchFailed': 'Suche fehlgeschlagen',
    'temperature': 'Temperatur',
    'rainfall': 'Niederschlag',
    'stopsLabel': 'Zwischenstopps',
    'airline': 'Fluggesellschaft',
    'direct': 'Direkt',
    'stop': 'Zwischenstopp',
    'stops': 'Zwischenstopps',
    'departure': 'Abflug',
    'return': 'Rückflug',
    'score': 'Punktzahl',
  },
  fr: {
    'title': 'Recherche de Destinations de Vacances',
    'subtitle': 'Découvrez la destination de vacances parfaite basée sur les prix des vols et la météo',
    'origin': 'Aéroport d\'Origine (IATA)',
    'startDate': 'Date de Début',
    'endDate': 'Date de Fin',
    'tripLength': 'Durée du Voyage (jours)',
    'topN': 'Top N Résultats',
    'flightProviders': 'Compagnies Aériennes',
    'searchDestinations': 'Rechercher des Destinations',
    'searching': 'Recherche en cours...',
    'apiUnreachable': '⚠️ Le serveur API n\'est pas accessible. Veuillez vous assurer que le backend est en cours d\'exécution.',
    'searchProgress': 'Progression de la Recherche',
    'status': 'Statut',
    'queuePosition': 'Position dans la File',
    'nextInQueue': '(Suivant dans la file)',
    'processing': 'Traitement',
    'destinations': 'destinations',
    'topDestinations': 'Top {count} Destinations',
    'noDestinations': 'Aucune destination trouvée. Essayez d\'ajuster vos paramètres de recherche.',
    'searchFailed': 'Recherche Échouée',
    'temperature': 'Température',
    'rainfall': 'Précipitations',
    'stopsLabel': 'Escales',
    'airline': 'Compagnie Aérienne',
    'direct': 'Direct',
    'stop': 'escale',
    'stops': 'escales',
    'departure': 'Départ',
    'return': 'Retour',
    'score': 'Score',
  },
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check localStorage for saved language preference
    const savedLanguage = localStorage.getItem('language') as Language | null;
    if (savedLanguage && ['en', 'pl', 'es', 'pt', 'de', 'fr'].includes(savedLanguage)) {
      setLanguageState(savedLanguage);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('language', language);
  }, [language, mounted]);

  const setLanguage = (lang: string) => {
    if (['en', 'pl', 'es', 'pt', 'de', 'fr'].includes(lang)) {
      setLanguageState(lang as Language);
    }
  };

  const t = (key: string, params?: Record<string, string | number>): string => {
    let text = translations[language][key] || translations.en[key] || key;
    
    // Replace placeholders like {count} with actual values
    if (params) {
      Object.entries(params).forEach(([paramKey, value]) => {
        text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(value));
      });
    }
    
    return text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
