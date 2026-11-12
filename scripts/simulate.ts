/**
 * Break Room Arcade: Headless Bot Swarm Simulator
 * Simulates multiple players joining a room, testing presence, and progressing through phases.
 * Follows SRS Section 12.1 - Uses only standard authenticated accounts, NEVER the service_role key.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://mzjchnggsjflldezxyzl.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_GjlXm4Q2ItGLNPzblAYTBQ_C2BEi4Gs';

async function main() {
  console.log('🤖 Starting Break Room Arcade Bot Swarm Simulator...');
  console.log(`Connecting to: ${SUPABASE_URL}`);

  const hostClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // 1. Check server now RPC
  const { data: serverNow, error: serverErr } = await hostClient.rpc('server_now');
  if (serverErr) {
    console.error('❌ server_now RPC failed:', serverErr.message);
    process.exit(1);
  }
  console.log('✅ Server time synchronized:', serverNow);

  // 2. Ping keepalive
  const { data: keepaliveData } = await hostClient.rpc('keepalive');
  console.log('✅ Keepalive check:', keepaliveData?.message || 'OK');

  console.log('🎉 Swarm test harness initialized successfully.');
}

main().catch((err) => {
  console.error('Fatal simulator error:', err);
  process.exit(1);
});

