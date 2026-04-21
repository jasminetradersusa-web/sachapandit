/**
 * Hooks barrel
 *
 * Security architecture:
 * - Export only client-safe hooks from this folder; never re-export server modules here.
 */

export { useSupabaseSession } from "./use-supabase-session";
