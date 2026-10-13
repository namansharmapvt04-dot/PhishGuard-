import { Routes, Route, Navigate } from 'react-router-dom'
import { ReactNode } from 'react'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import CampaignList from './pages/CampaignList'
import CampaignDetail from './pages/CampaignDetail'
import Results from './pages/Results'
import Targets from './pages/Targets'
import Analytics from './pages/Analytics'
import Insights from './pages/Insights'

function Protected({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/campaigns" element={<Protected><CampaignList /></Protected>} />
      <Route path="/campaigns/:id" element={<Protected><CampaignDetail /></Protected>} />
      <Route path="/campaigns/:id/results" element={<Protected><Results /></Protected>} />
      <Route path="/targets" element={<Protected><Targets /></Protected>} />
      <Route path="/analytics" element={<Protected><Analytics /></Protected>} />
      <Route path="/insights" element={<Protected><Insights /></Protected>} />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
