'use client';

import { createContext, useState, ReactNode } from 'react';
import type { City } from '@/lib/types';
import { cities as initialCities } from '@/lib/data';

type CityContextType = {
  cities: City[];
  addCity: (city: City) => void;
};

export const CityContext = createContext<CityContextType>({
  cities: [],
  addCity: () => {},
});

export const CityProvider = ({ children }: { children: ReactNode }) => {
  const [cities, setCities] = useState<City[]>(initialCities);

  const addCity = (newCity: City) => {
    setCities((prevCities) => {
      // Avoid adding duplicates by ID
      if (prevCities.some(city => city.id === newCity.id)) {
        // Optionally update existing city
        return prevCities.map(city => city.id === newCity.id ? newCity : city);
      }
      return [...prevCities, newCity];
    });
  };

  return (
    <CityContext.Provider value={{ cities, addCity }}>
      {children}
    </CityContext.Provider>
  );
};
