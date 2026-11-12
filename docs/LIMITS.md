# Break Room Arcade: Platform Limits & Realtime Message Budget

## 1. Verified Supabase Free Tier Limits
- **Concurrent Realtime Connections:** 200 concurrent users / sockets
- **Monthly Realtime Messages:** 2,000,000 messages / month
- **Database Storage:** 500 MB (PostgreSQL)
- **Monthly Active Users (MAU):** 50,000 users
- **Inactivity Pausing:** Projects pause after **7 days** without activity.
  - *Mitigation:* Prevented via automated GitHub Actions cron workflow (`keepalive.yml`) invoking the `keepalive()` RPC every 3 days.

---

## 2. Realtime Message Budget Analysis (Target: < 40,000 messages / 30-min session for 6 players)

Supabase Realtime counts messages as `sent x recipients`. In a 6-player room, each broadcast message sent by 1 player reaches 5 recipients (or 6 if echoed).

| Game / Feature | Event Frequency | Payload Strategy | Estimated Messages (30-min session) |
|---|---|---|---|
| **Pictionary** | Batched every 80–100ms | Normalized (0..1) RDP simplified vector points, streamed only when actively drawing (~3 mins total) | ~10,800 messages |
| **Typing Race** | Max 4 updates/sec | Only emitted on progress delta; race lasts ~60s | ~1,440 messages |
| **Reaction Duel** | Discrete events | 1 GO broadcast + 1 tap submission per player across 5 rounds | ~70 messages |
| **Quick Draw Quiz** | Discrete events | Question reveal + 1 answer lock-in per player across 10 questions | ~140 messages |
| **Emoji Charades** | Throttled on change | 1 update per emoji clue change (~10 per round) | ~360 messages |
| **Word Chain Blitz**| Discrete events | 1 event per valid word turn (~30 words) | ~180 messages |
| **Lobby & Presence** | 10s heartbeat | State of record in Postgres Changes / Presence | ~1,080 messages |
| **Total 30-Min Session** | - | - | **~14,070 messages** (well below the 40,000 budget!) |

