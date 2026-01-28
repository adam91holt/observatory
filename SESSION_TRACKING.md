# Session Tracking & Preservation

Observatory now implements **session-aware retention** to ensure complete session histories are preserved, regardless of session duration or event volume.

## The Problem

Previously, Observatory used simple time-based and count-based retention:
- Keep last 1000 events or 24 hours
- This could lose events from long-running sessions
- Active sessions might have their early events pruned

## The Solution

### Session-Aware Retention

All event stores now track **active vs. completed sessions**:

1. **Active Sessions** - Sessions with recent activity (< 1 hour since last event)
   - ALL events from active sessions are preserved
   - No time or count limits apply

2. **Completed Sessions** - Sessions that have explicitly ended via `session_end` hook
   - Events retained for 30 days (configurable)
   - Only pruned when storage limits reached

3. **Inactive Sessions** - No recent activity and not explicitly ended
   - Standard 7-day retention
   - Subject to count limits

### How It Works

```typescript
// When events arrive
1. Event is added to store
2. Session is marked as "active"
3. Last activity timestamp is updated

// When session_end hook fires
1. Session is marked as "completed"
2. Moved from active to completed tracking
3. All session events are preserved for 30 days

// During pruning (every event addition)
1. Active session events are NEVER deleted
2. Completed session events use extended retention (30d)
3. Other events use standard retention (7d)
4. If over total limit, only prune non-active sessions
```

## Configuration

Default retention settings (per store):

**AgentEventStore:**
- `maxEvents`: 5000 (up from 1000)
- `maxAge`: 7 days (up from 24h)
- `maxSessionAge`: 30 days for completed sessions

**DiagnosticsStore:**
- `maxEvents`: 5000 (up from 1000)
- `maxAge`: 7 days (up from 24h)
- `maxSessionAge`: 30 days

**HooksStore:**
- `maxEvents`: 2000 (up from 500)
- `maxAge`: 7 days (up from 24h)
- `maxSessionAge`: 30 days

## Examples

### Long-Running Session

```
Session starts: 10:00 AM
Events: 0-1000
  ├─ All preserved (active session)

Session continues: 2:00 PM (4 hours later)
Events: 1000-2000
  ├─ All preserved (still active)

Session continues: Next day 10:00 AM (24 hours)
Events: 2000-5000
  ├─ All preserved (still active)

Session ends: Day 3, 2:00 PM
  ├─ session_end hook fires
  ├─ Session marked as "completed"
  └─ All 5000 events preserved for 30 days
```

### Multiple Sessions

```
Active Session A: 1000 events (last activity: 5 min ago)
  └─ ALL events preserved

Active Session B: 500 events (last activity: 30 min ago)
  └─ ALL events preserved

Completed Session C: 2000 events (ended: 2 days ago)
  └─ All events preserved (within 30-day window)

Completed Session D: 1000 events (ended: 40 days ago)
  └─ Events pruned (exceeded 30-day retention)

Total: 4500 events (under 5000 limit)
  └─ No pruning needed
```

### Over Limit Scenario

```
Active Session A: 2000 events
Active Session B: 1500 events
Completed Session C: 1000 events
Completed Session D: 1000 events
Old events (no session): 500 events

Total: 6000 events (over 5000 limit)

Pruning logic:
1. Keep ALL events from Session A (2000)
2. Keep ALL events from Session B (1500)
3. Keep newest events from completed/old (1500)
   └─ Prune oldest from Session C, D, and orphan events

Result: 5000 events, all active sessions intact
```

## API Additions

### Stats Include Session Counts

```typescript
GET /observatory/api/events/agent

{
  "stats": {
    "totalEvents": 4500,
    "uniqueRuns": 45,
    "uniqueSessions": 12,
    "activeSessions": 2,      // NEW: Currently active
    "completedSessions": 8,    // NEW: Explicitly ended
    "oldestEvent": 1738627200000,
    "newestEvent": 1738713600000
  }
}
```

## Session Activity Detection

A session is considered **active** if:
- Has received events within the last hour, OR
- Has NOT received a `session_end` hook

A session is **inactive** if:
- No events for > 1 hour AND not explicitly ended

A session is **completed** if:
- Received a `session_end` hook

## Benefits

✅ **Complete session histories** - Never lose data from long sessions
✅ **Efficient memory usage** - Only keep what matters (active + recent)
✅ **Automatic cleanup** - Old completed sessions auto-pruned after 30d
✅ **Flexible retention** - Configure per use case
✅ **Production ready** - Handles high-volume scenarios gracefully

## Memory Estimates

**Typical session** (100 events):
- Agent events: ~50KB
- Diagnostic events: ~20KB
- Hook events: ~30KB
- **Total: ~100KB per session**

**Maximum (5000 agent events + 5000 diagnostic + 2000 hooks)**:
- Agent: ~2.5MB
- Diagnostic: ~1.5MB
- Hooks: ~1MB
- **Total: ~5MB maximum memory**

Most deployments will use 1-2MB with active session preservation.

## Troubleshooting

### "My old session data disappeared"

Check:
1. Was the session explicitly ended? (session_end hook)
2. Has it been > 30 days since session ended?
3. Were there > 5000 total events causing pruning?

### "Too much memory usage"

Adjust retention limits:
```typescript
// In plugin initialization
const agentEventStore = new AgentEventStore({
  maxEvents: 2000,  // Reduce from 5000
  maxAge: 3 * 24 * 60 * 60 * 1000,  // 3 days instead of 7
  maxSessionAge: 14 * 24 * 60 * 60 * 1000  // 14 days instead of 30
});
```

### "Events missing from active session"

This should never happen. If it does:
1. Check logs for pruning warnings
2. Verify session_end hook isn't firing prematurely
3. Report as bug with session details
