import { BrowserRouter, Routes, Route } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Layout } from "@/components/layout/Layout"
import { Dashboard } from "@/pages/Dashboard"
import { Analytics } from "@/pages/Analytics"
import { Channels } from "@/pages/Channels"
import { Sessions } from "@/pages/Sessions"
import { SessionDetail } from "@/pages/SessionDetail"
import { Trace } from "@/pages/Trace"
import { LiveFeed } from "@/pages/LiveFeed"
import { Runs } from "@/pages/Runs"
import { Config } from "@/pages/Config"
import { useGlobalKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts"

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
      <BrowserRouter basename="/observatory">
        <GlobalKeyboardShortcuts />
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="channels" element={<Channels />} />
            <Route path="sessions" element={<Sessions />} />
            <Route path="sessions/:agentId/:sessionId" element={<SessionDetail />} />
            <Route path="sessions/:agentId/:sessionId/trace" element={<Trace />} />
            <Route path="live" element={<LiveFeed />} />
            <Route path="runs" element={<Runs />} />
            <Route path="config" element={<Config />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
