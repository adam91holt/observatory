import { Outlet } from "react-router-dom"
import { Sidebar } from "./Sidebar"
import { Header } from "./Header"
import { LiveFeedPanel } from "@/components/LiveFeedPanel"
import { useLiveFeedSubscription } from "@/hooks/useLiveFeedSubscription"
import { useLiveFeedStore } from "@/store/live-feed"

export function Layout() {
  useLiveFeedSubscription()
  const isPanelOpen = useLiveFeedStore((s) => s.isPanelOpen)
  const panelHeight = useLiveFeedStore((s) => s.panelHeight)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main
          className="flex-1 overflow-auto p-6"
          style={{ paddingBottom: isPanelOpen ? panelHeight + 24 : 48 }}
        >
          <Outlet />
        </main>
      </div>
      <LiveFeedPanel />
    </div>
  )
}
