import { createContext, useContext, ReactNode } from 'react';

interface TVDashboardContextType {
  organizationId: string | null;
  isTVMode: boolean;
}

const TVDashboardContext = createContext<TVDashboardContextType>({
  organizationId: null,
  isTVMode: false,
});

export const useTVDashboard = () => {
  return useContext(TVDashboardContext);
};

interface TVDashboardProviderProps {
  children: ReactNode;
  organizationId: string | null;
}

export const TVDashboardProvider = ({ children, organizationId }: TVDashboardProviderProps) => {
  return (
    <TVDashboardContext.Provider value={{ organizationId, isTVMode: true }}>
      {children}
    </TVDashboardContext.Provider>
  );
};
