import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Layout } from "@/components/layout/Layout"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { Login } from "@/pages/Login"
import { Dashboard } from "@/pages/Dashboard"
import { Analytics } from "@/pages/Analytics"
import { Channels } from "@/pages/Channels"
import { Sessions } from "@/pages/Sessions"
import { SessionDetail } from "@/pages/SessionDetail"
import { Trace } from "@/pages/Trace"
import { LiveFeed } from "@/pages/LiveFeed"
import { Runs } from "@/pages/Runs"
import { RunDetail } from "@/pages/RunDetail"
import { Config } from "@/pages/Config"
import { AgentDetail } from "@/pages/AgentDetail"
import { CommandPalette } from "@/components/features/CommandPalette"
import { ShortcutsHelp } from "@/components/features/ShortcutsHelp"
import { useGlobalKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts"
import { ToastProvider } from "@/components/ui/toast"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds
      retry: 1,
    },
  },
})

function GlobalKeyboardShortcuts() {
  useGlobalKeyboardShortcuts()
  return null
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
      <BrowserRouter basename="/observatory">
        <GlobalKeyboardShortcuts />
        <CommandPalette />
        <ShortcutsHelp />
        <Routes>
          {/* Public route */}
          <Route path="/login" element={<Login />} />

          {/* Protected routes */}
          <Route
            path="/"
            element={
              <AuthGuard>
                <Layout />
              </AuthGuard>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="channels" element={<Channels />} />
            <Route path="sessions" element={<Sessions />} />
            <Route path="sessions/:agentId/:sessionId" element={<SessionDetail />} />
            <Route path="sessions/:agentId/:sessionId/trace" element={<Trace />} />
            <Route path="live" element={<LiveFeed />} />
            <Route path="agent/:agentId" element={<AgentDetail />} />
            <Route path="runs" element={<Runs />} />
            <Route path="runs/:runId" element={<RunDetail />} />
            <Route path="events" element={<Navigate to="/" replace />} />
            <Route path="config" element={<Config />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}

export default App
