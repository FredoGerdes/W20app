import { useState } from 'react'
import { addDays, dayStr, dueLabel, EFFORT, intervalLabel, INTERVALS, TASK_PRESETS, useSession } from '../lib'
import { useCompleteTask } from './Heute'

export default function Aufgaben() {
  const { me, members } = useSession()
  const { tasks, completions, complete } = useCompleteTask()
  const today = dayStr()
  const [mine, setMine] = useState(false)
  const [open, setOpen] = useState(false)
  const empty = { title: '', assignee_id: '', interval_days: 7, effort: 2, due_date: today }
  const [form, setForm] = useState(empty)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) return
    await tasks.add({ title: form.title.trim(), assignee_id: form.assignee_id || null, interval_days: form.interval_days || null, effort: form.effort, due_date: form.due_date })
    setForm(empty)
    setOpen(false)
  }

  const name = (id: string | null) => (id ? members.find((m) => m.id === id)?.name ?? '?' : 'beide')
  const list = tasks.rows.filter((t) => !mine || !t.assignee_id || t.assignee_id === me.id).sort((a, b) => a.due_date.localeCompare(b.due_date))
  const existing = new Set(tasks.rows.map((t) => t.title))

  // Fairness: Aufwandspunkte der letzten 30 Tage
  const since = addDays(today, -30)
  const points = members.map((m) => ({ m, p: completions.rows.filter((c) => c.member_id === m.id && c.created_at.slice(0, 10) >= since).reduce((s, c) => s + c.effort, 0) }))
  const total = points.reduce((s, x) => s + x.p, 0)

  return (
    <>
      <h1>Aufgaben</h1>

      {total > 0 && (
        <section className="card">
          <h2>Verteilung der letzten 30 Tage</h2>
          {points.map(({ m, p }) => (
            <div key={m.id} className="bar">
              <span>{m.name}</span>
              <div><div style={{ width: `${(p / total) * 100}%` }} /></div>
              <span>{Math.round((p / total) * 100)} %</span>
            </div>
          ))}
          <p className="muted small">Gewichtet nach Aufwand der erledigten Aufgaben.</p>
        </section>
      )}

      <div className="chips">
        <button className={'chip' + (!mine ? ' on' : '')} onClick={() => setMine(false)}>Alle</button>
        <button className={'chip' + (mine ? ' on' : '')} onClick={() => setMine(true)}>Meine</button>
      </div>

      <section className="card">
        {!list.length && <p className="muted">Noch keine Aufgaben.</p>}
        {list.map((t) => (
          <div key={t.id} className="row item">
            <button className="check" onClick={() => complete(t)} aria-label="Erledigt" />
            <div className="grow">
              {t.title}<br />
              <span className="muted small">{name(t.assignee_id)} · {intervalLabel(t.interval_days)} · {EFFORT[t.effort]} · </span>
              <span className={'small ' + (t.due_date < today ? 'late' : 'muted')}>{dueLabel(t.due_date)}</span>
            </div>
            <button className="x" onClick={() => confirm(`„${t.title}“ löschen?`) && tasks.remove(t.id)} aria-label="Löschen">×</button>
          </div>
        ))}
      </section>

      {!open ? (
        <button className="btn primary" onClick={() => setOpen(true)}>+ Neue Aufgabe</button>
      ) : (
        <form className="card" onSubmit={save}>
          <h2>Neue Aufgabe</h2>
          <div className="chips">
            {TASK_PRESETS.filter(([t]) => !existing.has(t)).map(([title, interval_days, effort]) => (
              <button type="button" key={title} className="chip" onClick={() => setForm({ ...form, title, interval_days, effort })}>{title}</button>
            ))}
          </div>
          <input placeholder="Was ist zu tun?" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
          <label>Wer?
            <select value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}>
              <option value="">Beide / egal</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label>Wie oft?
            <select value={form.interval_days} onChange={(e) => setForm({ ...form, interval_days: +e.target.value })}>
              {INTERVALS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}
            </select>
          </label>
          <label>Aufwand
            <select value={form.effort} onChange={(e) => setForm({ ...form, effort: +e.target.value })}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{EFFORT[n]}</option>)}
            </select>
          </label>
          <label>Erstmals fällig
            <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value || today })} />
          </label>
          <div className="row">
            <button className="btn primary grow">Speichern</button>
            <button type="button" className="btn" onClick={() => setOpen(false)}>Abbrechen</button>
          </div>
        </form>
      )}
    </>
  )
}
