import { useEffect, useState } from 'react'
import { addDays, addIngredients, CAP, dayStr, dueLabel, ruleSuggest, useSession, type Suggestion } from '../lib'
import { callFn, isCloud, useTable, type Capacity, type Completion, type Dish, type ShoppingItem, type Task } from '../store'

type CalEvent = { title: string; start: string; end: string; allDay: boolean }
type Cal = Record<string, { events: CalEvent[]; error?: string }>
const time = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

function summarize(events: CalEvent[]) {
  const timed = events.filter((e) => !e.allDay)
  const busyMinutes = Math.round(timed.reduce((s, e) => s + (+new Date(e.end) - +new Date(e.start)), 0) / 60000)
  const lastEnd = timed.length ? timed.map((e) => e.end).sort().pop()! : null
  return { count: timed.length, busyMinutes, lastEnd }
}

/** Aufgabe abhaken: protokollieren, dann wiederkehrende neu terminieren bzw. einmalige löschen. */
export function useCompleteTask() {
  const { me } = useSession()
  const tasks = useTable<Task>('tasks')
  const completions = useTable<Completion>('completions')
  const complete = async (t: Task) => {
    await completions.add({ task_id: t.id, title: t.title, member_id: me.id, effort: t.effort, created_at: new Date().toISOString() })
    if (t.interval_days) await tasks.update(t.id, { due_date: addDays(dayStr(), t.interval_days) })
    else await tasks.remove(t.id)
  }
  return { tasks, completions, complete }
}

export default function Heute({ go }: { go: (tab: string) => void }) {
  const { me, members } = useSession()
  const today = dayStr()
  const capacity = useTable<Capacity>('capacity')
  const dishes = useTable<Dish>('dishes')
  const shopping = useTable<ShoppingItem>('shopping_items')
  const { tasks, complete } = useCompleteTask()

  const capOf = (memberId: string) => capacity.rows.find((c) => c.member_id === memberId && c.day === today)
  const myLevel = capOf(me.id)?.level ?? 0
  const setLevel = (level: number) => {
    const existing = capOf(me.id)
    if (existing) capacity.update(existing.id, { level })
    else capacity.add({ member_id: me.id, day: today, level })
  }

  // Kalender
  const [cal, setCal] = useState<Cal | null>(null)
  const hasCal = isCloud && members.some((m) => m.ics_url)
  useEffect(() => {
    if (!hasCal) return
    const from = new Date(today + 'T00:00:00'), to = new Date(today + 'T23:59:59')
    callFn<Cal>('calendar', { from: from.toISOString(), to: to.toISOString() }).then(setCal).catch((e) => console.error(e))
  }, [hasCal, today, members.map((m) => m.ics_url).join()])

  // Essensvorschläge
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const suggest = async () => {
    setBusy(true)
    setNote('')
    const levels = members.map((m) => capOf(m.id)?.level).filter(Boolean) as number[]
    const minCap = levels.length ? Math.min(...levels) : 3
    try {
      if (!isCloud) throw new Error('Demo-Modus')
      const context = {
        wochentag: new Date().toLocaleDateString('de-DE', { weekday: 'long' }),
        uhrzeit: time(new Date().toISOString()),
        personen: members.map((m) => ({ name: m.name, kapazitaet: capOf(m.id)?.level ?? null, kalender: cal?.[m.id] ? summarize(cal[m.id].events) : null })),
        gerichte: dishes.rows.map((d) => ({ name: d.name, minuten: d.minutes, aufwand: d.effort, kcal: d.kcal, zuletzt_gekocht: d.last_cooked })),
      }
      setSuggestions((await callFn<{ suggestions: Suggestion[] }>('ai', { action: 'suggest', context })).suggestions)
    } catch (e: any) {
      if (isCloud) setNote(`KI nicht erreichbar (${e.message}) – einfache Vorschläge:`)
      setSuggestions(ruleSuggest(dishes.rows, minCap))
    }
    setBusy(false)
  }
  const cook = async (d: Dish) => {
    await dishes.update(d.id, { last_cooked: today })
    const n = await addIngredients(d, shopping)
    setNote(`„${d.name}“ für heute eingeplant${n ? `, ${n} Zutaten auf die Einkaufsliste gesetzt` : ''}.`)
    setSuggestions(null)
  }

  const due = tasks.rows.filter((t) => t.due_date <= today && (!t.assignee_id || t.assignee_id === me.id)).sort((a, b) => a.due_date.localeCompare(b.due_date))

  return (
    <>
      <h1>{new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</h1>

      <section className="card">
        <h2>Wie viel Kapazität hast du heute?</h2>
        <input className="cap" type="range" min={1} max={5} step={1} value={myLevel || 3} style={{ accentColor: CAP[myLevel].color }} onChange={(e) => setLevel(+e.target.value)} />
        <div className="capscale">{[1, 2, 3, 4, 5].map((n) => <button key={n} style={{ background: CAP[n].color, opacity: myLevel === n ? 1 : 0.3 }} onClick={() => setLevel(n)} aria-label={CAP[n].label} />)}</div>
        <p className="caplabel" style={{ color: CAP[myLevel].color }}>{myLevel ? CAP[myLevel].label : 'Tippe auf die Ampel oder schiebe den Regler'}</p>
        {members.filter((m) => m.id !== me.id).map((m) => {
          const l = capOf(m.id)?.level ?? 0
          return <p key={m.id} className="row"><span className="dot" style={{ background: CAP[l].color }} /> {m.name}: {CAP[l].label}</p>
        })}
      </section>

      {hasCal && (
        <section className="card">
          <h2>Kalender heute</h2>
          {!cal && <p className="muted">Lädt …</p>}
          {cal && members.filter((m) => m.ics_url).map((m) => {
            const c = cal[m.id]
            if (!c || c.error) return <p key={m.id} className="muted">{m.name}: {c?.error ?? 'kein Kalender'}</p>
            const s = summarize(c.events)
            return (
              <div key={m.id}>
                <p><b>{m.name}</b>: {s.count ? `${s.count} Termine, ${(s.busyMinutes / 60).toFixed(1).replace('.', ',')} h verplant, frei ab ${time(s.lastEnd!)}` : 'keine Termine'}</p>
                {c.events.map((e, i) => <p key={i} className="muted small">{e.allDay ? 'ganztägig' : `${time(e.start)}–${time(e.end)}`} · {e.title}</p>)}
              </div>
            )
          })}
        </section>
      )}

      <section className="card">
        <h2>Was kochen wir heute?</h2>
        {note && <p className="muted">{note}</p>}
        {suggestions?.map((s) => {
          const d = dishes.rows.find((x) => x.name.toLowerCase() === s.name.toLowerCase())
          return (
            <div key={s.name} className="row item">
              <div className="grow"><b>{s.name}</b>{!d && <span className="tag">neue Idee</span>}<br /><span className="muted small">{s.reason}</span></div>
              {d && <button className="btn" onClick={() => cook(d)}>Kochen</button>}
            </div>
          )
        })}
        {suggestions && !suggestions.length && <p className="muted">Noch keine Gerichte in der Bibliothek. <button className="link" onClick={() => go('gerichte')}>Gerichte hinzufügen</button></p>}
        <button className="btn primary" disabled={busy} onClick={suggest}>{busy ? 'Überlege …' : suggestions ? 'Neue Vorschläge' : 'Vorschläge holen'}</button>
      </section>

      <section className="card">
        <h2>Deine Aufgaben heute</h2>
        {!due.length && <p className="muted">Nichts fällig. 🎉</p>}
        {due.map((t) => (
          <div key={t.id} className="row item">
            <button className="check" onClick={() => complete(t)} aria-label="Erledigt" />
            <div className="grow">{t.title}<br /><span className={'small ' + (t.due_date < today ? 'late' : 'muted')}>{dueLabel(t.due_date)}{!t.assignee_id && ' · beide'}</span></div>
          </div>
        ))}
      </section>
    </>
  )
}
