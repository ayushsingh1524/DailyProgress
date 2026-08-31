import { createClient } from '@supabase/supabase-js'

// Environment variables override these public project settings in deployments.
// Supabase publishable keys are designed to be exposed in client-side apps; RLS
// policies in supabase-schema.sql keep each user's tracker private.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'https://fnehwswvjihyxanteyoc.supabase.co'
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? 'sb_publishable_XNn9LeN0MFS5FzjMypNVsQ_HP9G9lC8'

export const isCloudConfigured = Boolean(url && key)
export const supabase = isCloudConfigured ? createClient(url!, key!) : null
