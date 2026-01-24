export interface Airport {
  iata: string;
  name: string;
  city: string;
  city_kgmid?: string;
}

export interface Country {
  name: string;
  kgmid: string;
  airports: Airport[];
}

export const COUNTRIES: Country[] = [
  {
    name: "Poland",
    kgmid: "/m/05qhw",
    airports: [
      { iata: "WRO", name: "Wrocław Nicolaus Copernicus Airport", city: "Wroclaw", city_kgmid: "/m/0861k" },
      { iata: "WAW", name: "Warsaw Chopin Airport", city: "Warsaw", city_kgmid: "/m/0827_" },
      { iata: "WMI", name: "Warsaw Modlin Airport", city: "Warsaw", city_kgmid: "/m/0827_" },
      { iata: "KRK", name: "John Paul II International Airport Kraków-Balice", city: "Krakow", city_kgmid: "/m/0491p" },
      { iata: "GDN", name: "Gdańsk Lech Wałęsa Airport", city: "Gdansk", city_kgmid: "/m/0339v" },
      { iata: "POZ", name: "Poznań-Ławica Airport", city: "Poznan", city_kgmid: "/m/064_n" },
    ],
  },
  {
    name: "United Kingdom",
    kgmid: "/m/07ssc",
    airports: [
      { iata: "LHR", name: "London Heathrow Airport", city: "London", city_kgmid: "/m/04jpl" },
      { iata: "LGW", name: "London Gatwick Airport", city: "London", city_kgmid: "/m/04jpl" },
      { iata: "STN", name: "London Stansted Airport", city: "London", city_kgmid: "/m/04jpl" },
      { iata: "LTN", name: "London Luton Airport", city: "London", city_kgmid: "/m/04jpl" },
      { iata: "MAN", name: "Manchester Airport", city: "Manchester", city_kgmid: "/m/0529j" },
      { iata: "EDI", name: "Edinburgh Airport", city: "Edinburgh", city_kgmid: "/m/02msh" },
      { iata: "BHX", name: "Birmingham Airport", city: "Birmingham", city_kgmid: "/m/014f0" },
      { iata: "BRS", name: "Bristol Airport", city: "Bristol", city_kgmid: "/m/01786" },
      { iata: "GLA", name: "Glasgow Airport", city: "Glasgow", city_kgmid: "/m/033nh" },
    ],
  },
  {
    name: "Germany",
    kgmid: "/m/03_3d",
    airports: [
      { iata: "FRA", name: "Frankfurt Airport", city: "Frankfurt", city_kgmid: "/m/02_p_" },
      { iata: "MUC", name: "Munich Airport", city: "Munich", city_kgmid: "/m/02h6_p" },
      { iata: "BER", name: "Berlin Brandenburg Airport", city: "Berlin", city_kgmid: "/m/0156q" },
      { iata: "DUS", name: "Düsseldorf Airport", city: "Düsseldorf", city_kgmid: "/m/02h6f" },
      { iata: "HAM", name: "Hamburg Airport", city: "Hamburg", city_kgmid: "/m/03hrz" },
      { iata: "CGN", name: "Cologne Bonn Airport", city: "Cologne", city_kgmid: "/m/0fsz" },
      { iata: "STR", name: "Stuttgart Airport", city: "Stuttgart", city_kgmid: "/m/072p6" },
    ],
  },
  {
    name: "Spain",
    kgmid: "/m/06qd",
    airports: [
      { iata: "MAD", name: "Adolfo Suarez Madrid-Barajas Airport", city: "Madrid", city_kgmid: "/m/04mry" },
      { iata: "BCN", name: "Josep Tarradellas Barcelona-El Prat Airport", city: "Barcelona", city_kgmid: "/m/01n7q" },
      { iata: "PMI", name: "Palma de Mallorca Airport", city: "Palma de Mallorca", city_kgmid: "/m/0f393" },
      { iata: "AGP", name: "Málaga-Costa del Sol Airport", city: "Malaga", city_kgmid: "/m/0fsz5" },
      { iata: "ALC", name: "Alicante-Elche Airport", city: "Alicante", city_kgmid: "/m/01fs7" },
      { iata: "VLC", name: "Valencia Airport", city: "Valencia", city_kgmid: "/m/07y79" },
      { iata: "SVQ", name: "Seville Airport", city: "Seville", city_kgmid: "/m/06p_x" },
      { iata: "BIO", name: "Bilbao Airport", city: "Bilbao", city_kgmid: "/m/018jr" },
      { iata: "GRX", name: "Federico Garcia Lorca Granada Airport", city: "Granada", city_kgmid: "/m/034p9" },
    ],
  },
  {
    name: "France",
    kgmid: "/m/0f8l9c",
    airports: [
      { iata: "CDG", name: "Charles de Gaulle Airport", city: "Paris", city_kgmid: "/m/05qtj" },
      { iata: "ORY", name: "Paris Orly Airport", city: "Paris", city_kgmid: "/m/05qtj" },
      { iata: "NCE", name: "Nice Côte d'Azur Airport", city: "Nice", city_kgmid: "/m/05mzf" },
      { iata: "LYS", name: "Lyon-Saint Exupéry Airport", city: "Lyon", city_kgmid: "/m/04ks6" },
      { iata: "MRS", name: "Marseille Provence Airport", city: "Marseille", city_kgmid: "/m/054jr" },
      { iata: "TLS", name: "Toulouse-Blagnac Airport", city: "Toulouse", city_kgmid: "/m/07m6s" },
      { iata: "BOD", name: "Bordeaux-Mérignac Airport", city: "Bordeaux", city_kgmid: "/m/01m26" },
      { iata: "NTE", name: "Nantes Atlantique Airport", city: "Nantes", city_kgmid: "/m/05p7n" },
      { iata: "SXB", name: "Strasbourg Airport", city: "Strasbourg", city_kgmid: "/m/073p4" },
    ],
  },
  {
    name: "Italy",
    kgmid: "/m/03rjj",
    airports: [
      { iata: "FCO", name: "Leonardo da Vinci-Fiumicino Airport", city: "Rome", city_kgmid: "/m/06c62" },
      { iata: "CIA", name: "Rome Ciampino Airport", city: "Rome", city_kgmid: "/m/06c62" },
      { iata: "MXP", name: "Milan Malpensa Airport", city: "Milan", city_kgmid: "/m/04xf9" },
      { iata: "LIN", name: "Milan Linate Airport", city: "Milan", city_kgmid: "/m/04xf9" },
      { iata: "VCE", name: "Venice Marco Polo Airport", city: "Venice", city_kgmid: "/m/07_m9" },
      { iata: "NAP", name: "Naples International Airport", city: "Naples", city_kgmid: "/m/05f2b" },
      { iata: "CTA", name: "Catania-Fontanarossa Airport", city: "Catania", city_kgmid: "/m/01pfs" },
      { iata: "BLQ", name: "Bologna Guglielmo Marconi Airport", city: "Bologna", city_kgmid: "/m/01f_8" },
      { iata: "PMO", name: "Palermo Airport", city: "Palermo", city_kgmid: "/m/05f3n" },
      { iata: "FLR", name: "Florence Airport", city: "Florence", city_kgmid: "/m/02_p3" },
      { iata: "BRI", name: "Bari Karol Wojtyła Airport", city: "Bari", city_kgmid: "/m/01f6h" },
      { iata: "TRN", name: "Turin Airport", city: "Turin", city_kgmid: "/m/07_m0" },
    ],
  },
  {
    name: "Portugal",
    kgmid: "/m/05vb6",
    airports: [
      { iata: "LIS", name: "Humberto Delgado Airport", city: "Lisbon", city_kgmid: "/m/04jxl" },
      { iata: "OPO", name: "Francisco de Sá Carneiro Airport", city: "Porto", city_kgmid: "/m/060sc" },
      { iata: "FAO", name: "Faro Airport", city: "Faro", city_kgmid: "/m/0fsz7" },
    ],
  },
  {
    name: "Greece",
    kgmid: "/m/035dk",
    airports: [
      { iata: "ATH", name: "Athens International Airport", city: "Athens", city_kgmid: "/m/0n2z" },
      { iata: "HER", name: "Heraklion International Airport", city: "Crete", city_kgmid: "/m/03hhp" },
      { iata: "SKG", name: "Thessaloniki Airport", city: "Thessaloniki", city_kgmid: "/m/07f43" },
      { iata: "RHO", name: "Rhodes International Airport", city: "Rhodes", city_kgmid: "/m/069n6" },
      { iata: "JTR", name: "Santorini Airport", city: "Santorini", city_kgmid: "/m/06m81" },
      { iata: "JMK", name: "Mykonos Airport", city: "Mykonos", city_kgmid: "/m/05f26" },
    ],
  },
  {
    name: "Netherlands",
    kgmid: "/m/059j2",
    airports: [
      { iata: "AMS", name: "Amsterdam Airport Schiphol", city: "Amsterdam", city_kgmid: "/m/0k3p" },
      { iata: "EIN", name: "Eindhoven Airport", city: "Eindhoven", city_kgmid: "/m/02h6_r" },
      { iata: "RTM", name: "Rotterdam The Hague Airport", city: "Rotterdam", city_kgmid: "/m/06h1h" },
    ],
  },
  {
    name: "Turkey",
    kgmid: "/m/01znc",
    airports: [
      { iata: "IST", name: "Istanbul Airport", city: "Istanbul", city_kgmid: "/m/09942" },
      { iata: "SAW", name: "Istanbul Sabiha Gökçen Airport", city: "Istanbul", city_kgmid: "/m/09942" },
      { iata: "AYT", name: "Antalya Airport", city: "Antalya", city_kgmid: "/m/01pfx" },
      { iata: "ADB", name: "İzmir Adnan Menderes Airport", city: "Izmir", city_kgmid: "/m/042_m" },
      { iata: "BJV", name: "Milas-Bodrum Airport", city: "Bodrum", city_kgmid: "/m/01pft" },
    ],
  },
  {
    name: "USA",
    kgmid: "/m/09c7w0",
    airports: [
      { iata: "JFK", name: "John F. Kennedy International Airport", city: "New York", city_kgmid: "/m/02_286" },
      { iata: "EWR", name: "Newark Liberty International Airport", city: "New York", city_kgmid: "/m/02_286" },
      { iata: "LGA", name: "LaGuardia Airport", city: "New York", city_kgmid: "/m/02_286" },
    ],
  },
  {
    name: "Switzerland",
    kgmid: "/m/06mz3",
    airports: [
      { iata: "ZRH", name: "Zurich Airport", city: "Zurich", city_kgmid: "/m/08966" },
      { iata: "GVA", name: "Geneva Airport", city: "Geneva", city_kgmid: "/m/03657" },
      { iata: "BSL", name: "EuroAirport Basel-Mulhouse-Freiburg", city: "Basel", city_kgmid: "/m/01f_7" },
    ],
  },
  {
    name: "Austria",
    kgmid: "/m/06d6x",
    airports: [
      { iata: "VIE", name: "Vienna International Airport", city: "Vienna", city_kgmid: "/m/081xv" },
      { iata: "SZG", name: "Salzburg Airport", city: "Salzburg", city_kgmid: "/m/06m80" },
      { iata: "INN", name: "Innsbruck Airport", city: "Innsbruck", city_kgmid: "/m/03z9m" },
    ],
  },
  {
    name: "Denmark",
    kgmid: "/m/01zp_",
    airports: [
      { iata: "CPH", name: "Copenhagen Airport", city: "Copenhagen", city_kgmid: "/m/01l_f" },
      { iata: "BLL", name: "Billund Airport", city: "Billund", city_kgmid: "/m/01pfn" },
      { iata: "AAR", name: "Aarhus Airport", city: "Aarhus", city_kgmid: "/m/01l_j" },
    ],
  },
  {
    name: "Norway",
    kgmid: "/m/01zp4",
    airports: [
      { iata: "OSL", name: "Oslo Gardermoen Airport", city: "Oslo", city_kgmid: "/m/05l64" },
      { iata: "BGO", name: "Bergen Airport", city: "Bergen", city_kgmid: "/m/01l_h" },
      { iata: "TOS", name: "Tromsø Airport", city: "Tromsø", city_kgmid: "/m/07f4p" },
    ],
  },
  {
    name: "Sweden",
    kgmid: "/m/06m_p",
    airports: [
      { iata: "ARN", name: "Stockholm Arlanda Airport", city: "Stockholm", city_kgmid: "/m/06mx1" },
      { iata: "BMA", name: "Stockholm Bromma Airport", city: "Stockholm", city_kgmid: "/m/06mx1" },
      { iata: "GOT", name: "Gothenburg Landvetter Airport", city: "Gothenburg", city_kgmid: "/m/0339v" },
      { iata: "MMX", name: "Malmö Airport", city: "Malmö", city_kgmid: "/m/0529k" },
    ],
  },
  {
    name: "Ireland",
    kgmid: "/m/03rtc",
    airports: [
      { iata: "DUB", name: "Dublin Airport", city: "Dublin", city_kgmid: "/m/02j6_" },
      { iata: "ORK", name: "Cork Airport", city: "Cork", city_kgmid: "/m/01p_t" },
      { iata: "SNN", name: "Shannon Airport", city: "Shannon", city_kgmid: "/m/01p_t" },
    ],
  },
  {
    name: "Croatia",
    kgmid: "/m/01rrn",
    airports: [
      { iata: "ZAG", name: "Zagreb Airport", city: "Zagreb", city_kgmid: "/m/0858f" },
      { iata: "SPU", name: "Split Airport", city: "Split", city_kgmid: "/m/06qfx" },
      { iata: "DBV", name: "Dubrovnik Airport", city: "Dubrovnik", city_kgmid: "/m/02h6f" },
    ],
  },
  {
    name: "Czech Republic",
    kgmid: "/m/01sk",
    airports: [
      { iata: "PRG", name: "Václav Havel Airport Prague", city: "Prague", city_kgmid: "/m/05ygk" },
      { iata: "BRQ", name: "Brno-Tuřany Airport", city: "Brno", city_kgmid: "/m/01f_8" },
    ],
  },
  {
    name: "Hungary",
    kgmid: "/m/03_9d",
    airports: [
      { iata: "BUD", name: "Budapest Ferenc Liszt International Airport", city: "Budapest", city_kgmid: "/m/081xv" },
    ],
  },
  {
    name: "Romania",
    kgmid: "/m/068x",
    airports: [
      { iata: "OTP", name: "Henri Coandă International Airport", city: "Bucharest", city_kgmid: "/m/01f6j" },
      { iata: "CLJ", name: "Cluj-Napoca International Airport", city: "Cluj-Napoca", city_kgmid: "/m/01f6m" },
    ],
  },
  {
    name: "Bulgaria",
    kgmid: "/m/01sk_",
    airports: [
      { iata: "SOF", name: "Sofia Airport", city: "Sofia", city_kgmid: "/m/06m82" },
      { iata: "BOJ", name: "Burgas Airport", city: "Burgas", city_kgmid: "/m/01p_x" },
      { iata: "VAR", name: "Varna Airport", city: "Varna", city_kgmid: "/m/01p_x" },
    ],
  },
];
