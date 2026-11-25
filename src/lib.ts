import { createContext, useContext } from 'react'
import type { Dish, Member, ShoppingItem } from './store'

export interface Session {
  household: { id: string; name: string; invite_code?: string }
  me: Member
  members: Member[]
  signOut: () => void
}
export const SessionContext = createContext<Session>(null as unknown as Session)
export const useSession = () => useContext(SessionContext)

const pad = (n: number) => String(n).padStart(2, '0')
export const dayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export function addDays(day: string, n: number) {
  const d = new Date(day + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return dayStr(d)
}
export function dueLabel(due: string) {
  const diff = Math.round((+new Date(due + 'T12:00:00') - +new Date(dayStr() + 'T12:00:00')) / 86400000)
  if (diff < -1) return `seit ${-diff} Tagen fällig`
  if (diff === -1) return 'seit gestern fällig'
  if (diff === 0) return 'heute'
  if (diff === 1) return 'morgen'
  return `in ${diff} Tagen`
}

export const CAP = [
  { label: 'Noch nicht eingetragen', color: '#a8a29e' },
  { label: 'Akku leer', color: '#e5484d' },
  { label: 'Wenig Energie', color: '#f76b15' },
  { label: 'Geht so', color: '#f5b800' },
  { label: 'Gut drauf', color: '#7cb518' },
  { label: 'Volle Energie', color: '#2f9e44' },
]
export const EFFORT = ['', 'leicht', 'mittel', 'aufwendig']
export const INTERVALS: [number, string][] = [
  [0, 'einmalig'], [1, 'täglich'], [2, 'alle 2 Tage'], [3, 'alle 3 Tage'],
  [7, 'wöchentlich'], [14, 'alle 2 Wochen'], [30, 'monatlich'],
]
export const intervalLabel = (n: number | null) => INTERVALS.find(([d]) => d === (n ?? 0))?.[1] ?? `alle ${n} Tage`

export const TASK_PRESETS: [string, number, number][] = [
  ['Müll rausbringen', 3, 1], ['Spülmaschine ausräumen', 1, 1], ['Staubsaugen', 7, 2], ['Bad putzen', 7, 3],
  ['Wäsche waschen', 7, 2], ['Betten beziehen', 14, 2], ['Küche wischen', 7, 2], ['Pflanzen gießen', 7, 1],
]
export const SHOPPING_STARTERS = ['Milch', 'Brot', 'Eier', 'Butter', 'Käse', 'Nudeln', 'Tomaten', 'Bananen', 'Kaffee', 'Toilettenpapier']

export interface Suggestion { name: string; known: boolean; reason: string }

/** Vorschläge ohne KI: Aufwand an die Kapazität anpassen, lange nicht Gekochtes zuerst. */
export function ruleSuggest(dishes: Dish[], minCap: number): Suggestion[] {
  const maxEffort = minCap <= 2 ? 1 : minCap === 3 ? 2 : 3
  let pool = dishes.filter((d) => (d.effort ?? 2) <= maxEffort)
  if (!pool.length) pool = [...dishes].sort((a, b) => (a.effort ?? 2) - (b.effort ?? 2)).slice(0, 3)
  return pool
    .sort((a, b) => (a.last_cooked ?? '').localeCompare(b.last_cooked ?? ''))
    .slice(0, 3)
    .map((d) => ({
      name: d.name,
      known: true,
      reason: `${EFFORT[d.effort ?? 2]}${d.minutes ? `, ca. ${d.minutes} Min.` : ''} – ${d.last_cooked ? `zuletzt am ${new Date(d.last_cooked + 'T12:00').toLocaleDateString('de-DE')}` : 'noch nie gekocht'}`,
    }))
}

/** Zutaten eines Gerichts auf die Einkaufsliste setzen; gibt die Anzahl neuer Einträge zurück. */
export async function addIngredients(dish: Dish, shopping: { rows: ShoppingItem[]; add: (i: Omit<ShoppingItem, 'id'>) => Promise<unknown> }) {
  const active = new Set(shopping.rows.filter((i) => !i.archived).map((i) => i.name.toLowerCase()))
  const lines = dish.ingredients.split('\n').map((l) => l.trim()).filter((l) => l && !active.has(l.toLowerCase()))
  for (const name of lines) await shopping.add({ name, checked: false, archived: false })
  return lines.length
}
