import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** null when Supabase isn't configured: the app then works without accounts. */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        // PKCE returns ?code=… instead of #access_token=…, which keeps our #/hash routes intact
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null
