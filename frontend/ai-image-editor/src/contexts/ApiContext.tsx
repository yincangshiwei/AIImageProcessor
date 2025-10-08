import React, { createContext, useContext } from 'react'
import { apiService } from '../services/api'

interface ApiContextType {
  api: typeof apiService
}

const ApiContext = createContext<ApiContextType | undefined>(undefined)

export function ApiProvider({ children }: { children: React.ReactNode }) {
  const value = {
    api: apiService
  }

  return (
    <ApiContext.Provider value={value}>
      {children}
    </ApiContext.Provider>
  )
}

export function useApi() {
  const context = useContext(ApiContext)
  if (context === undefined) {
    throw new Error('useApi must be used within an ApiProvider')
  }
  return context
}