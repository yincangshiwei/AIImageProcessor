import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ApiProvider } from './contexts/ApiContext'
import { CollageProvider } from './contexts/CollageContext'
import AuthPage from './pages/AuthPage'
import DashboardPage from './pages/DashboardPage'
import EditorPage from './pages/EditorPage'
import HistoryPage from './pages/HistoryPage'
import CasesPage from './pages/CasesPage'
import LoadingScreen from './components/LoadingScreen'
import './App.css'

function AppRoutes() {
  const { user, loading } = useAuth()
  
  if (loading) {
    return <LoadingScreen />
  }

  return (
    <div className="min-h-screen bg-cyber-dark relative overflow-hidden">
      {/* 背景动效 */}
      <div className="fixed inset-0 cyber-grid-bg opacity-20 pointer-events-none" />
      <div className="fixed inset-0 floating-particles pointer-events-none" />
      
      <Routes>
        <Route 
          path="/auth" 
          element={!user ? <AuthPage /> : <Navigate to="/dashboard" replace />} 
        />
        <Route 
          path="/dashboard" 
          element={user ? <DashboardPage /> : <Navigate to="/auth" replace />} 
        />
        <Route 
          path="/editor" 
          element={user ? <EditorPage /> : <Navigate to="/auth" replace />} 
        />
        <Route 
          path="/history" 
          element={user ? <HistoryPage /> : <Navigate to="/auth" replace />} 
        />
        <Route 
          path="/cases" 
          element={user ? <CasesPage /> : <Navigate to="/auth" replace />} 
        />
        <Route 
          path="/" 
          element={<Navigate to={user ? "/dashboard" : "/auth"} replace />} 
        />
      </Routes>
    </div>
  )
}

function App() {
  return (
    <ApiProvider>
      <AuthProvider>
        <CollageProvider>
          <AppRoutes />
        </CollageProvider>
      </AuthProvider>
    </ApiProvider>
  )
}

export default App