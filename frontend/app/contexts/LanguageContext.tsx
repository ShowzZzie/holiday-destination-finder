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
    'origin': 'Departure Location',
    'travelDates': 'Travel Dates',
    'startDate': 'Start Date',
    'endDate': 'End Date',
    'tripLength': 'Trip Length (days)',
    'topN': 'Number of results to show',
    'flightProviders': 'Flight price providers',
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
    // Sorting & Filtering
    'sortBy': 'Sort by',
    'filters': 'Filters',
    'clearFilters': 'Clear all',
    'price': 'Price',
    'region': 'Region',
    'country': 'Country',
    'directFlightsOnly': 'Direct flights only',
    'maxPrice': 'Max price',
    'minTemperature': 'Min temperature',
    'noResults': 'No results match your filters',
    'showingResults': 'Showing {count} of {total} results',
    // Regions
    'Iberia': 'Iberia',
    'Southern Europe': 'Southern Europe',
    'Western Europe': 'Western Europe',
    'Northern Europe': 'Northern Europe',
    // Sidebar
    'newSearch': 'New Search',
    'jobHistory': 'Job History',
    // Score explanation
    'scoreExplanation': 'Combines price (40%) and weather (60%). Higher = better value.',
    // Daily averages note
    'dailyAverages': 'Weather values are daily averages for your trip dates',
    // Departure info
    'departingFrom': 'Departing from',
    'anyAirport': 'any airport',
  },
  pl: {
    'title': 'Wyszukiwarka Destynacji Wakacyjnych',
    'subtitle': 'Odkryj idealną destynację wakacyjną na podstawie cen lotów i pogody',
    'origin': 'Miejsce wylotu',
    'travelDates': 'Daty podróży',
    'startDate': 'Data rozpoczęcia',
    'endDate': 'Data zakończenia',
    'tripLength': 'Długość wyjazdu (dni)',
    'topN': 'Liczba wyników do pokazania',
    'flightProviders': 'Źródła cen lotów',
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
    'direct': 'Bezp.',
    'stop': 'przesiadka',
    'stops': 'przesiadki',
    'departure': 'Wylot',
    'return': 'Powrót',
    'score': 'Punktacja',
    // Sorting & Filtering
    'sortBy': 'Sortuj według',
    'filters': 'Filtry',
    'clearFilters': 'Wyczyść wszystkie',
    'price': 'Cena',
    'region': 'Region',
    'country': 'Kraj',
    'directFlightsOnly': 'Tylko loty bezpośrednie',
    'maxPrice': 'Maksymalna cena',
    'minTemperature': 'Minimalna temperatura',
    'noResults': 'Brak wyników pasujących do filtrów',
    'showingResults': 'Wyświetlanie {count} z {total} wyników',
    // Regions
    'Iberia': 'Półwysep Iberyjski',
    'Southern Europe': 'Europa Południowa',
    'Western Europe': 'Europa Zachodnia',
    'Northern Europe': 'Europa Północna',
    // Sidebar
    'newSearch': 'Nowe wyszukiwanie',
    'jobHistory': 'Historia wyszukiwań',
    // Score explanation
    'scoreExplanation': 'Łączy cenę (40%) i pogodę (60%). Wyższy = lepsza oferta.',
    // Daily averages note
    'dailyAverages': 'Wartości pogodowe to średnie dzienne dla Twojego wyjazdu',
    // Departure info
    'departingFrom': 'Wylot z',
    'anyAirport': 'dowolne lotnisko',
  },
  es: {
    'title': 'Buscador de Destinos Vacacionales',
    'subtitle': 'Descubre el destino vacacional perfecto basado en precios de vuelos y clima',
    'origin': 'Aeropuerto de Origen (IATA)',
    'travelDates': 'Fechas de Viaje',
    'startDate': 'Fecha de Inicio',
    'endDate': 'Fecha de Fin',
    'tripLength': 'Duración del Viaje (días)',
    'topN': 'Número de resultados para mostrar',
    'flightProviders': 'Proveedores de precios de vuelos',
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
    // Sorting & Filtering
    'sortBy': 'Ordenar por',
    'filters': 'Filtros',
    'clearFilters': 'Limpiar todo',
    'price': 'Precio',
    'region': 'Región',
    'country': 'País',
    'directFlightsOnly': 'Solo vuelos directos',
    'maxPrice': 'Precio máximo',
    'minTemperature': 'Temperatura mínima',
    'noResults': 'No hay resultados que coincidan con tus filtros',
    'showingResults': 'Mostrando {count} de {total} resultados',
    // Regions
    'Iberia': 'Iberia',
    'Southern Europe': 'Europa del Sur',
    'Western Europe': 'Europa Occidental',
    'Northern Europe': 'Europa del Norte',
    // Sidebar
    'newSearch': 'Nueva búsqueda',
    'jobHistory': 'Historial',
    // Score explanation
    'scoreExplanation': 'Combina precio (40%) y clima (60%). Mayor = mejor valor.',
    // Daily averages note
    'dailyAverages': 'Los valores climáticos son promedios diarios para tus fechas de viaje',
    // Departure info
    'departingFrom': 'Saliendo desde',
    'anyAirport': 'cualquier aeropuerto',
  },
  pt: {
    'title': 'Localizador de Destinos de Férias',
    'subtitle': 'Descubra o destino de férias perfeito com base em preços de voos e clima',
    'origin': 'Aeroporto de Origem (IATA)',
    'travelDates': 'Datas de Viagem',
    'startDate': 'Data de Início',
    'endDate': 'Data de Fim',
    'tripLength': 'Duração da Viagem (dias)',
    'topN': 'Número de resultados a mostrar',
    'flightProviders': 'Fontes de preços de voos',
    'searchDestinations': 'Pesquisar Destinos',
    'searching': 'A pesquisar...',
    'apiUnreachable': '⚠️ O servidor API não está acessível. Certifique-se de que o backend está em execução.',
    'searchProgress': 'Progresso da Pesquisa',
    'status': 'Estado',
    'queuePosition': 'Posição na Fila',
    'nextInQueue': '(Próximo na fila)',
    'processing': 'A processar',
    'destinations': 'destinos',
    'topDestinations': 'Top {count} Destinos',
    'noDestinations': 'Nenhum destino encontrado. Tente ajustar os parâmetros de pesquisa.',
    'searchFailed': 'A pesquisa falhou',
    'temperature': 'Temperatura',
    'rainfall': 'Precipitação',
    'stopsLabel': 'Escalas',
    'airline': 'Companhia Aérea',
    'direct': 'Direto',
    'stop': 'escala',
    'stops': 'escalas',
    'departure': 'Partida',
    'return': 'Regresso',
    'score': 'Pontuação',
    // Sorting & Filtering
    'sortBy': 'Ordenar por',
    'filters': 'Filtros',
    'clearFilters': 'Limpar tudo',
    'price': 'Preço',
    'region': 'Região',
    'country': 'País',
    'directFlightsOnly': 'Apenas voos diretos',
    'maxPrice': 'Preço máximo',
    'minTemperature': 'Temperatura mínima',
    'noResults': 'Nenhum resultado corresponde aos seus filtros',
    'showingResults': 'A mostrar {count} de {total} resultados',
    // Regions
    'Iberia': 'Ibéria',
    'Southern Europe': 'Europa do Sul',
    'Western Europe': 'Europa Ocidental',
    'Northern Europe': 'Europa do Norte',
    // Sidebar
    'newSearch': 'Nova pesquisa',
    'jobHistory': 'Histórico',
    // Score explanation
    'scoreExplanation': 'Combina preço (40%) e clima (60%). Maior = melhor valor.',
    // Daily averages note
    'dailyAverages': 'Os valores climáticos são médias diárias para as datas da sua viagem',
    // Departure info
    'departingFrom': 'Partindo de',
    'anyAirport': 'qualquer aeroporto',
  },
  de: {
    'title': 'Urlaubsziel-Finder',
    'subtitle': 'Entdecke das perfekte Urlaubsziel basierend auf Flugpreisen und Wetter',
    'origin': 'Abflughafen (IATA)',
    'travelDates': 'Reisedaten',
    'startDate': 'Startdatum',
    'endDate': 'Enddatum',
    'tripLength': 'Reisedauer (Tage)',
    'topN': 'Anzahl der Ergebnisse',
    'flightProviders': 'Preisquellen für Flüge',
    'searchDestinations': 'Ziele suchen',
    'searching': 'Suche läuft...',
    'apiUnreachable': '⚠️ API-Server ist nicht erreichbar. Bitte stelle sicher, dass das Backend läuft.',
    'searchProgress': 'Suchfortschritt',
    'status': 'Status',
    'queuePosition': 'Warteschlangenposition',
    'nextInQueue': '(Nächster in Warteschlange)',
    'processing': 'Verarbeitung',
    'destinations': 'Ziele',
    'topDestinations': 'Top {count} Ziele',
    'noDestinations': 'Keine Ziele gefunden. Versuche, deine Suchparameter anzupassen.',
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
    // Sorting & Filtering
    'sortBy': 'Sortieren nach',
    'filters': 'Filter',
    'clearFilters': 'Alle löschen',
    'price': 'Preis',
    'region': 'Region',
    'country': 'Land',
    'directFlightsOnly': 'Nur Direktflüge',
    'maxPrice': 'Höchstpreis',
    'minTemperature': 'Mindesttemperatur',
    'noResults': 'Keine Ergebnisse entsprechen deinen Filtern',
    'showingResults': '{count} von {total} Ergebnissen',
    // Regions
    'Iberia': 'Iberien',
    'Southern Europe': 'Südeuropa',
    'Western Europe': 'Westeuropa',
    'Northern Europe': 'Nordeuropa',
    // Sidebar
    'newSearch': 'Neue Suche',
    'jobHistory': 'Suchverlauf',
    // Score explanation
    'scoreExplanation': 'Kombiniert Preis (40%) und Wetter (60%). Höher = besserer Wert.',
    // Daily averages note
    'dailyAverages': 'Wetterwerte sind Tagesdurchschnitte für deine Reisedaten',
    // Departure info
    'departingFrom': 'Abflug von',
    'anyAirport': 'beliebiger Flughafen',
  },
  fr: {
    'title': 'Recherche de Destinations de Vacances',
    'subtitle': 'Découvrez la destination de vacances parfaite basée sur les prix des vols et la météo',
    'origin': 'Aéroport d\'Origine (IATA)',
    'travelDates': 'Dates de Voyage',
    'startDate': 'Date de Début',
    'endDate': 'Date de Fin',
    'tripLength': 'Durée du Voyage (jours)',
    'topN': 'Nombre de résultats à afficher',
    'flightProviders': 'Sources de prix de vols',
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
    // Sorting & Filtering
    'sortBy': 'Trier par',
    'filters': 'Filtres',
    'clearFilters': 'Tout effacer',
    'price': 'Prix',
    'region': 'Région',
    'country': 'Pays',
    'directFlightsOnly': 'Vols directs uniquement',
    'maxPrice': 'Prix maximum',
    'minTemperature': 'Température minimale',
    'noResults': 'Aucun résultat ne correspond à vos filtres',
    'showingResults': 'Affichage de {count} sur {total} résultats',
    // Regions
    'Iberia': 'Ibérie',
    'Southern Europe': 'Europe du Sud',
    'Western Europe': 'Europe de l\'Ouest',
    'Northern Europe': 'Europe du Nord',
    // Sidebar
    'newSearch': 'Nouvelle recherche',
    'jobHistory': 'Historique',
    // Score explanation
    'scoreExplanation': 'Combine prix (40%) et météo (60%). Plus élevé = meilleure valeur.',
    // Daily averages note
    'dailyAverages': 'Les valeurs météo sont des moyennes journalières pour vos dates de voyage',
    // Departure info
    'departingFrom': 'Départ de',
    'anyAirport': 'n\'importe quel aéroport',
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
