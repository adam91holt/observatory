import { useEffect } from "react"
import { subscribeToEvents } from "@/api/observatory"
import { useLiveFeedStore, parseLogEvent, getNextEventId } from "@/store/live-feed"

export function useLiveFeedSubscription() {
  const { addEvent, setConnected } = useLiveFeedStore()

  useEffect(() => {
    const unsubscribe = subscribeToEvents(
      (data) => {
        const parsed = parseLogEvent(data)
        addEvent({ ...parsed, id: getNextEventId() })
        setConnected(true)
      },
      () => {
        setConnected(false)
      }
    )

    return () => unsubscribe()
  }, [addEvent, setConnected])
}
