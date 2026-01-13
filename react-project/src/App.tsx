import React, { useState, useEffect } from 'react'
import Booking from './pages/Booking'
import { supabase } from './lib/supabase'

type Route = 'rooms' | 'booking' | 'mybookings'
type Room = { id: string | number; name?: string }

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function firstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

const COLORS = [
  '#1f77b4',
  '#ff7f0e',
  '#2ca02c',
  '#d62728',
  '#9467bd',
  '#8c564b',
  '#e377c2'
]

export default function App() {
  const [route, setRoute] = useState<Route>('rooms')
  const [rooms, setRooms] = useState<Room[]>([])
  const [loadingRooms, setLoadingRooms] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // calendar state
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data, error } = await supabase.from('rooms').select('id,name')
        if (!mounted) return
        if (error) {
          setError(error.message)
          setRooms([])
        } else {
          setRooms((data as Room[]) || [])
        }
      } catch (err: any) {
        setError(err?.message ?? String(err))
      } finally {
        if (mounted) setLoadingRooms(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const prevMonth = () => {
    if (month === 0) {
      setMonth(11)
      setYear((y) => y - 1)
    } else setMonth((m) => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) {
      setMonth(0)
      setYear((y) => y + 1)
    } else setMonth((m) => m + 1)
  }

  const numDays = daysInMonth(year, month)
  const startIndex = firstDayOfMonth(year, month) // 0=Sun

  const monthName = new Date(year, month).toLocaleString(undefined, { month: 'long' })

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Flex Calendar</h1>
        <nav>
          <button onClick={() => setRoute('rooms')}>Rooms</button>
          <button onClick={() => setRoute('booking')}>Booking</button>
          <button onClick={() => setRoute('mybookings')}>My Bookings</button>
        </nav>
      </header>

      <section style={{ marginTop: 12 }}>
        {route === 'rooms' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <button onClick={prevMonth}>&lt;</button>
                <button onClick={nextMonth} style={{ marginLeft: 8 }}>&gt;</button>
              </div>
              <h2 style={{ margin: 0 }}>{monthName} {year}</h2>
              <div />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginTop: 12 }}>
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                <div key={d} style={{ fontWeight: 'bold', textAlign: 'center' }}>{d}</div>
              ))}

              {/* empty slots before month start */}
              {Array.from({ length: startIndex }).map((_, i) => (
                <div key={`e-${i}`} style={{ minHeight: 80, border: '1px solid #eee' }} />
              ))}

              {/* days */}
              {Array.from({ length: numDays }).map((_, i) => {
                const day = i + 1
                return (
                  <div key={day} style={{ minHeight: 80, border: '1px solid #eee', padding: 6 }}>
                    <div style={{ fontWeight: '600' }}>{day}</div>
                  </div>
                )
              })}
            </div>

            <div style={{ marginTop: 16 }}>
              <h3>Rooms</h3>
              {loadingRooms && <div>Loading rooms…</div>}
              {error && <div style={{ color: 'red' }}>{error}</div>}
              {!loadingRooms && !error && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {rooms.length === 0 && <div>No rooms found.</div>}
                  {rooms.map((r, idx) => (
                    <div key={String(r.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: '1px solid #eee', borderRadius: 6 }}>
                      <span style={{ width: 12, height: 12, background: COLORS[idx % COLORS.length], display: 'inline-block', borderRadius: 3 }} />
                      <span>{r.name ?? `Room ${r.id}`}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {route === 'booking' && <Booking />}
      </section>
    </div>
  )
}
