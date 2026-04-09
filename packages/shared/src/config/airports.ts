import type { AirportCode } from '../types/offer.js';

export interface AirportInfo {
  code: AirportCode;
  namePl: string;
  city: string;
  /** Birth date suffix used by R.pl for adult age parameters */
  rplCode: string;
}

export const AIRPORTS: Record<AirportCode, AirportInfo> = {
  KTW: {
    code: 'KTW',
    namePl: 'Katowice – Pyrzowice',
    city: 'Katowice',
    rplCode: 'KTW',
  },
  KRK: {
    code: 'KRK',
    namePl: 'Kraków – Balice',
    city: 'Kraków',
    rplCode: 'KRK',
  },
  WAW: {
    code: 'WAW',
    namePl: 'Warszawa – Chopin',
    city: 'Warszawa',
    rplCode: 'WAW',
  },
  GDN: {
    code: 'GDN',
    namePl: 'Gdańsk – Rębiechowo',
    city: 'Gdańsk',
    rplCode: 'GDN',
  },
  POZ: {
    code: 'POZ',
    namePl: 'Poznań – Ławica',
    city: 'Poznań',
    rplCode: 'POZ',
  },
  WRO: {
    code: 'WRO',
    namePl: 'Wrocław – Copernicus',
    city: 'Wrocław',
    rplCode: 'WRO',
  },
  RZE: {
    code: 'RZE',
    namePl: 'Rzeszów – Jasionka',
    city: 'Rzeszów',
    rplCode: 'RZE',
  },
};

/** Exim Tours airport code mapping (their internal codes) */
export const EXIM_AIRPORT_MAP: Record<AirportCode, string> = {
  KTW: 'KTW',
  KRK: 'KRK',
  WAW: 'WAW',
  GDN: 'GDN',
  POZ: 'POZ',
  WRO: 'WRO',
  RZE: 'RZE',
};

/** Coral Travel airport code mapping */
export const CORAL_AIRPORT_MAP: Record<AirportCode, string> = {
  KTW: 'KTW',
  KRK: 'KRK',
  WAW: 'WAW',
  GDN: 'GDN',
  POZ: 'POZ',
  WRO: 'WRO',
  RZE: 'RZE',
};
