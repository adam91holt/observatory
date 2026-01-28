import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { ChevronDown, Users, MessageCircle, Activity, Clock, ExternalLink } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getChannels, getAgents, getSessions } from "@/api/observatory"
import { getChannelIcon, getAgentEmoji } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"

interface GroupActivity {
  groupId: string
  groupName: string
  channel: string
  accountId: string
  sessionCount: number
  lastActivity: number
  boundAgent?: string
}

// Parse session key to extract channel/group info
function parseSessionKey(sessionKey: string): { channel?: string; accountId?: string; groupId?: string } | null {
  // Session keys are like:
  // - WhatsApp: agent:agentId:whatsapp:group:groupId@g.us
  // - Slack: agent:agentId:slack:channel:channelId or agent:agentId:slack:channel:channelName
  // - Telegram: agent:agentId:telegram:group:groupId
  const parts = sessionKey.split(":")
  if (parts.length < 3) return null

  // Skip "agent" and agentId parts
  const rest = parts.slice(2)

  if (rest.length === 0) return null

  const channel = rest[0]

  // Look for group or dm (WhatsApp, Telegram)
  if (rest.length >= 3 && rest[1] === "group") {
    return { channel, accountId: "default", groupId: rest.slice(2).join(":") }
  }

  if (rest.length >= 3 && rest[1] === "dm") {
    return { channel, accountId: "default", groupId: `dm:${rest.slice(2).join(":")}` }
  }

  // Look for channel (Slack)
  if (rest.length >= 3 && rest[1] === "channel") {
    // Slack channels might have threads, so only take the channel ID
    return { channel, accountId: "default", groupId: rest[2] }
  }

  return null
}

// Check if a string looks like a Slack channel ID (c + lowercase alphanumeric)
function isSlackChannelId(str: string): boolean {
  return /^c[0-9a-z]+$/i.test(str)
}

// Parse displayName to extract human-readable name
function parseDisplayName(displayName: string | undefined, groupId?: string): string | null {
  if (!displayName) return null

  // WhatsApp: "whatsapp:g-group-name" -> "group-name"
  if (displayName.startsWith("whatsapp:g-")) {
    return displayName.slice("whatsapp:g-".length)
  }

  // Slack with g- prefix: "slack:g-name" or "slack:g-c0ab0h2re8p"
  if (displayName.startsWith("slack:g-")) {
    const extracted = displayName.slice("slack:g-".length)
    // If it looks like an ID, prefer the groupId if it's not an ID
    if (isSlackChannelId(extracted) && groupId && !isSlackChannelId(groupId)) {
      return groupId
    }
    return extracted
  }

  // Slack with # prefix: "slack:#name" or "slack:#c0ab0h2re8p"
  if (displayName.startsWith("slack:#")) {
    const extracted = displayName.slice("slack:#".length)
    // If it looks like an ID (lowercase), prefer the groupId if it's not an ID
    if (isSlackChannelId(extracted.toLowerCase()) && groupId && !isSlackChannelId(groupId)) {
      return groupId
    }
    // If it's uppercase ID, also check groupId
    if (extracted.match(/^[A-Z0-9]+$/) && groupId && !isSlackChannelId(groupId)) {
      return groupId
    }
    return extracted
  }

  // Slack thread: "Slack thread #CHANNELID: ..." or "Slack thread #channel-name: ..."
  const slackThreadMatch = displayName.match(/^Slack thread #([^:]+):/)
  if (slackThreadMatch) {
    const extracted = slackThreadMatch[1]
    // If it's an ID, prefer groupId if available and not an ID
    if ((isSlackChannelId(extracted) || extracted.match(/^[A-Z0-9]+$/)) && groupId && !isSlackChannelId(groupId)) {
      return groupId
    }
    return extracted
  }

  // Telegram: "telegram:..." or similar patterns
  if (displayName.includes(":")) {
    const parts = displayName.split(":")
    if (parts.length >= 2) {
      return parts[1]
    }
  }

  return displayName
}

export function Channels() {
  const navigate = useNavigate()
  const [expandedChannels, setExpandedChannels] = useState<Set<string>>(new Set(["whatsapp", "telegram", "slack"]))

  const { data: channelsData, isLoading: channelsLoading } = useQuery({
    queryKey: ["channels"],
    queryFn: getChannels,
  })

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: getAgents,
  })

  const { data: sessionsData } = useQuery({
    queryKey: ["sessions"],
    queryFn: getSessions,
    refetchInterval: 5000,
  })

  const toggleChannel = (channel: string) => {
    const next = new Set(expandedChannels)
    if (next.has(channel)) {
      next.delete(channel)
    } else {
      next.add(channel)
    }
    setExpandedChannels(next)
  }

  const channels = channelsData?.channels || {}
  const agents = agentsData?.agents || []
  const sessions = sessionsData?.sessions || []

  const getAgentName = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId)
    return agent?.name || agentId
  }

  // Aggregate group activity from sessions
  const groupActivityMap = useMemo(() => {
    const activityMap = new Map<string, GroupActivity>()

    for (const session of sessions) {
      const parsed = parseSessionKey(session.sessionKey)
      if (!parsed?.channel || !parsed.groupId) continue

      const key = `${parsed.channel}:${parsed.accountId}:${parsed.groupId}`

      if (!activityMap.has(key)) {
        // Get human-readable name from displayName first, fallback to config
        const channelConfig = channels[parsed.channel]
        const accountConfig = channelConfig?.accounts?.[parsed.accountId || 'default']
        const groupConfig = accountConfig?.groups?.[parsed.groupId]

        // For Slack, the groupId might already be a friendly name (not starting with 'c' and lowercase)
        const groupIdIsFriendly = parsed.channel === 'slack' &&
          parsed.groupId &&
          !parsed.groupId.match(/^c[0-9a-z]+$/i)

        const displayName = parseDisplayName(session.displayName, parsed.groupId)
        const groupName = displayName || groupConfig?.name || (groupIdIsFriendly ? parsed.groupId : parsed.groupId)

        activityMap.set(key, {
          groupId: parsed.groupId,
          groupName,
          channel: parsed.channel,
          accountId: parsed.accountId || 'default',
          sessionCount: 0,
          lastActivity: 0,
          boundAgent: accountConfig?.boundAgentId
        })
      }

      const activity = activityMap.get(key)!
      activity.sessionCount++
      activity.lastActivity = Math.max(activity.lastActivity, session.updatedAt)
    }

    return activityMap
  }, [sessions, channels])

  // Group activities by channel
  const activitiesByChannel = useMemo(() => {
    const byChannel = new Map<string, GroupActivity[]>()

    for (const activity of groupActivityMap.values()) {
      if (!byChannel.has(activity.channel)) {
        byChannel.set(activity.channel, [])
      }
      byChannel.get(activity.channel)!.push(activity)
    }

    // Sort each channel's activities by last activity
    for (const activities of byChannel.values()) {
      activities.sort((a, b) => b.lastActivity - a.lastActivity)
    }

    return byChannel
  }, [groupActivityMap])

  // Get all unique channels (from config + active sessions)
  const allChannels = useMemo(() => {
    const channelSet = new Set<string>()

    // Add from config
    for (const channel of Object.keys(channels)) {
      channelSet.add(channel)
    }

    // Add from active sessions
    for (const activity of groupActivityMap.values()) {
      channelSet.add(activity.channel)
    }

    return Array.from(channelSet).sort()
  }, [channels, groupActivityMap])

  if (channelsLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Channels</h1>
          <p className="text-muted-foreground">
            Connected messaging platforms and groups
          </p>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Channels</h1>
        <p className="text-muted-foreground">
          Connected messaging platforms and active groups
        </p>
      </div>

      <div className="space-y-4">
        {allChannels.map((channelName) => {
          const channelConfig = channels[channelName]
          const activities = activitiesByChannel.get(channelName) || []
          const configAccounts = channelConfig?.accounts || {}
          const accountCount = Object.keys(configAccounts).length
          const isExpanded = expandedChannels.has(channelName)
          const activeGroupCount = activities.length

          return (
            <Card key={channelName}>
              <div
                onClick={() => toggleChannel(channelName)}
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{getChannelIcon(channelName)}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold capitalize">{channelName}</h3>
                      {activeGroupCount > 0 && (
                        <Badge variant="secondary" className="gap-1">
                          <Activity className="h-3 w-3" />
                          {activeGroupCount} active
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {accountCount > 0 ? `${accountCount} account${accountCount !== 1 ? "s" : ""}` : "No configured accounts"}
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className={cn(
                    "h-5 w-5 text-muted-foreground transition-transform",
                    isExpanded && "rotate-180"
                  )}
                />
              </div>

              {isExpanded && activities.length > 0 && (
                <CardContent className="pt-0 pb-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Group</TableHead>
                        <TableHead className="text-center">Sessions</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead className="text-right">Last Activity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activities.map((activity) => {
                        const isDM = activity.groupId.startsWith("dm:")
                        return (
                          <TableRow
                            key={`${activity.channel}:${activity.accountId}:${activity.groupId}`}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => {
                              // Navigate to sessions page filtered by this channel and group
                              navigate(`/sessions?channel=${activity.channel}&group=${encodeURIComponent(activity.groupId)}`)
                            }}
                          >
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {isDM ? (
                                  <Users className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <MessageCircle className="h-4 w-4 text-muted-foreground" />
                                )}
                                <div>
                                  <div className="font-medium">
                                    {activity.groupName}
                                  </div>
                                  <div className="text-xs text-muted-foreground font-mono">
                                    {activity.groupId}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline">{activity.sessionCount}</Badge>
                            </TableCell>
                            <TableCell>
                              {activity.boundAgent ? (
                                <div className="flex items-center gap-2">
                                  <span>{getAgentEmoji(activity.boundAgent)}</span>
                                  <span className="text-sm">{getAgentName(activity.boundAgent)}</span>
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {formatDistanceToNow(new Date(activity.lastActivity), { addSuffix: true })}
                                <ExternalLink className="h-3 w-3 ml-2" />
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              )}

              {isExpanded && activities.length === 0 && (
                <CardContent className="pt-0 pb-4">
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <MessageCircle className="h-12 w-12 text-muted-foreground mb-3 opacity-50" />
                    <p className="text-sm text-muted-foreground">
                      No active groups for this channel
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Groups will appear here when agents receive messages
                    </p>
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}

        {allChannels.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <MessageCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No channels configured or active</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
