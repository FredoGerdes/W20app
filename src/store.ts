import { createClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined

/** Ohne Supabase-Konfiguration läuft die App im Demo-Modus (Daten nur auf diesem Gerät). */
export const supabase = url && key ? createClient(url, key) : null
export const isCloud = !!supabase

export type Table = 'members' | 'tasks' | 'completions' | 'shopping_items' | 'dishes' | 'capacity'

export interface Member { id: string; name: string; user_id?: string; ics_url?: string | null }
export interface Task { id: string; title: string; assignee_id: string | null; interval_days: number | null; due_date: string; effort: number }
export interface Completion { id: string; task_id: string | null; title: string; member_id: string; effort: number; created_at: string }
export interface ShoppingItem { id: string; name: string; checked: boolean; archived: boolean }
export interface Dish {
  id: string; name: string; ingredients: string; servings: number
  minutes: number | null; effort: number | null
  kcal: number | null; protein: number | null; carbs: number | null; fat: number | null
  last_cooked: string | null
}
export interface Capacity { id: string; member_id: string; day: string; level: number }

// --- Änderungs-Benachrichtigungen (lokal + Realtime) ---
const listeners = new Map<string, Set<() => void>>()
const emit = (table: string) => listeners.get(table)?.forEach((f) => f())
function on(table: string, f: () => void) {
  if (!listeners.has(table)) listeners.set(table, new Set())
  listeners.get(table)!.add(f)
  return () => void listeners.get(table)!.delete(f)
}
// iOS kappt die Live-Verbindung im Hintergrund: beim Zurückkehren alles neu laden.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') listeners.forEach((set) => set.forEach((f) => f()))
})

let householdId = 'local'
let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null

export function startSync(hid: string) {
  householdId = hid
  if (!supabase || channel) return
  channel = supabase
    .channel('db')
    .on('postgres_changes', { event: '*', schema: 'public' }, (p) => emit(p.table))
    .subscribe()
}
export function stopSync() {
  if (channel) supabase?.removeChannel(channel)
  channel = null
}

// --- Speicherzugriff ---
const lsGet = (t: string): any[] => JSON.parse(localStorage.getItem('hh:' + t) || '[]')
const lsSet = (t: string, rows: any[]) => localStorage.setItem('hh:' + t, JSON.stringify(rows))

async function list(table: Table): Promise<any[]> {
  if (!supabase) return lsGet(table)
  // neueste 1000 Zeilen, in zeitlicher Reihenfolge
  const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false }).limit(1000)
  if (error) throw error
  return data.reverse()
}
async function insert(table: Table, row: any) {
  if (supabase) {
    const { error } = await supabase.from(table).insert(row)
    if (error) throw error
  } else lsSet(table, [...lsGet(table), row])
}
async function update(table: Table, id: string, patch: any) {
  if (supabase) {
    const { error } = await supabase.from(table).update(patch).eq('id', id)
    if (error) throw error
  } else lsSet(table, lsGet(table).map((r) => (r.id === id ? { ...r, ...patch } : r)))
}
async function remove(table: Table, id: string) {
  if (supabase) {
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) throw error
  } else lsSet(table, lsGet(table).filter((r) => r.id !== id))
}

/** Live-Sicht auf eine Tabelle; Änderungen erscheinen sofort und werden im Hintergrund gespeichert. */
export function useTable<T extends { id: string }>(table: Table) {
  const [rows, setRows] = useState<T[]>([])
  const reload = useCallback(() => {
    list(table).then(setRows).catch((e) => console.error(table, e))
  }, [table])
  useEffect(() => {
    reload()
    return on(table, reload)
  }, [table, reload])

  const run = async (optimistic: (r: T[]) => T[], op: () => Promise<void>) => {
    setRows(optimistic)
    try {
      await op()
    } catch (e: any) {
      alert('Speichern fehlgeschlagen: ' + (e?.message ?? e))
    }
    emit(table)
  }

  return {
    rows,
    add: async (data: Omit<T, 'id'>): Promise<T> => {
      const row = { id: crypto.randomUUID(), household_id: householdId, created_at: new Date().toISOString(), ...data } as unknown as T
      await run((r) => [...r, row], () => insert(table, row))
      return row
    },
    update: (id: string, patch: Partial<T>) => run((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)), () => update(table, id, patch)),
    remove: (id: string) => run((r) => r.filter((x) => x.id !== id), () => remove(table, id)),
  }
}

/** Ruft eine Supabase Edge Function auf (nur im Cloud-Modus verfügbar). */
export async function callFn<T>(name: 'ai' | 'calendar', body: unknown): Promise<T> {
  if (!supabase) throw new Error('Nur mit Supabase-Anbindung verfügbar')
  const { data, error } = await supabase.functions.invoke(name, { body: body as any })
  if (error) {
    const detail = await (error as any).context?.json?.().catch(() => null)
    throw new Error(detail?.error ?? error.message)
  }
  return data as T
}

// --- Demo-Modus: zwei feste Personen auf einem Gerät ---
export function localMembers(): Member[] {
  if (!lsGet('members').length) {
    lsSet('members', [
      { id: crypto.randomUUID(), name: 'Ich' },
      { id: crypto.randomUUID(), name: 'Partner:in' },
    ])
  }
  return lsGet('members')
}
export const localMeId = () => localStorage.getItem('hh:me') ?? localMembers()[0].id
export const setLocalMeId = (id: string) => localStorage.setItem('hh:me', id)
