import React, { useState, useEffect } from 'react'
import Booking from './pages/Booking'
import Rooms from './pages/Rooms'
import Login from './pages/Login'
import MyBookings from './pages/MyBookings'
import Admin from './pages/Admin'
import { supabase } from './lib/supabase'
// App principal
// - charge les espaces depuis Supabase
// - gère l'état d'authentification
// - affiche la navbar et les pages (rooms / booking / login)

type Route = 'rooms' | 'booking' | 'login' | 'mybookings' | 'admin'
type Room = { id: string | number; name?: string }

export default function App() {
  const [route, setRoute] = useState<Route>('rooms')
  const [rooms, setRooms] = useState<Room[]>([])
  const [loadingRooms, setLoadingRooms] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<any | null>(null)
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [selectedBooking, setSelectedBooking] = useState<any | null>(null)
  const showAdminLink = (isAdmin(user) || (import.meta as any).env && (import.meta as any).env.DEV)

  useEffect(() => {
    let mounted = true

    const refreshRoomsAndBookings = async () => {
      try {
        setLoadingRooms(true)
        const nowISO = new Date().toISOString()

        // Marquer comme expirées les réservations dont la fin est passée
        try {
          const { error: updErr } = await supabase
            .from('bookings')
            .update({ status: 'expired' })
            .lt('end_at', nowISO)
            .eq('status', 'confirmed')
          if (updErr) console.error('Erreur mise à jour réservations expirées', updErr)
        } catch (e) {
          console.error('Erreur lors du nettoyage des réservations', e)
        }

        const roomsRes = await supabase.from('rooms').select('*')
        const bookingsRes = await supabase.from('bookings').select('*')

        if (!mounted) return

        if (roomsRes.error) {
          setError(roomsRes.error.message)
          setRooms([])
        } else {
          const roomsData = (roomsRes.data as Room[]) || []
          const bookingsData = (bookingsRes.data as any[]) || []
          const now = new Date().toISOString()

          const roomsAug = roomsData.map((room) => {
            const roomBookings = bookingsData.filter(b => String(b.room_id) === String(room.id) && b.status === 'confirmed')
            const current = roomBookings.find(b => b.start_at <= now && b.end_at > now) || null
            const upcoming = roomBookings
              .filter(b => b.start_at > now)
              .sort((a,b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())[0] || null
            return { ...room, current_booking: current, next_booking: upcoming }
          })

          setRooms(roomsAug)
        }
      } catch (err: any) {
        setError(err?.message ?? String(err))
      } finally {
        if (mounted) setLoadingRooms(false)
      }
    }

    ;(async () => {
      // Chargement initial des rooms + bookings
      await refreshRoomsAndBookings()

      // auth user
      const { data } = await supabase.auth.getUser()
      const currentUser = data?.user ?? null
      setUser(currentUser)
      if (currentUser) {
        scheduleRemindersForUser(currentUser)
      }
    })()

    // Recharger quand les bookings changent
    const channel = supabase.channel('public:bookings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        refreshRoomsAndBookings()
        // reprogrammer les reminders
        try { scheduleRemindersForUser(user) } catch (e) { /* ignore */ }
      })
      .subscribe()

    // rappele les reminders pour les réservations à venir
    const reminderTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

    async function scheduleRemindersForUser(userObj: any | null) {
      // Supprimer les anciens timers
      reminderTimeouts.forEach(t => clearTimeout(t))
      reminderTimeouts.clear()
      if (!userObj) return

      // Demander la permission de notification si nécessaire
      if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
        try { await Notification.requestPermission() } catch (e) { /* ignore */ }
      }

      const { data: bookings } = await supabase
        .from('bookings')
        .select('id,room_id,start_at,end_at,status')
        .eq('user_id', userObj.id)
        .eq('status', 'confirmed')

      const now = Date.now()
      const reminderBefore: number = 15 * 60 * 1000; // 15 minutes

      (bookings || []).forEach((b: any) => {
        const start = new Date(b.start_at).getTime()
        const when = start - reminderBefore
        const delay = when - now
        if (delay > 0 && delay < 2147483647) {
          const t = setTimeout(() => {
            try {
              if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                new Notification('Rappel de réservation', { body: `Votre réservation pour la salle ${b.room_id} commence à ${new Date(b.start_at).toLocaleString()}` })
              } else {
                // fallback in-page alert
                alert(`Rappel: réservation pour la salle ${b.room_id} commence à ${new Date(b.start_at).toLocaleString()}`)
              }
            } catch (e) { console.error('Erreur notification', e) }
          }, delay)
          reminderTimeouts.set(String(b.id), t)
        }
      })
    }

    const { data } = supabase.auth.onAuthStateChange((_event, session) => { // Écouter les changements d'auth
      setUser(session?.user ?? null)
    })
    const subscription = data?.subscription

    return () => {
      mounted = false
      // désabonner les changements d'auth
      subscription?.unsubscribe()
      try { channel.unsubscribe() } catch (e) { /* ignore */ }
    }
  }, [])

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: 0 }}>
      <header className="topbar">
        <div className="logo" onClick={() => setRoute('rooms')}>Flex<span className="logo-accent">Book</span></div>
        <nav className="topnav">
          <button className="nav-item" onClick={() => setRoute('rooms')}>Espaces</button>
            <button className="nav-item" onClick={() => setRoute('booking')}>Réserver</button>
            <button className="nav-item" onClick={() => setRoute('mybookings')}>Mes réservations</button>
            {showAdminLink && (
              <button className="nav-item" onClick={() => setRoute('admin')}>Espace Admin</button>
            )}
          <div style={{ flex: 1 }} />
          {user ? (
            <>
              <span className="nav-user">{user.email}</span>
              <button className="nav-logout" onClick={async () => { await supabase.auth.signOut(); setUser(null); setRoute('rooms'); }}>Se déconnecter</button>
            </>
          ) : (
            <button className="nav-login" onClick={() => setRoute('login')}>Se connecter</button>
          )}
        </nav>
      </header>

      <main className="container">
        {route === 'login' && !user && (
          <Login onSuccess={() => { setRoute('rooms') }} />
        )}

        {route === 'rooms' && (
          <Rooms
            rooms={rooms}
            loading={loadingRooms}
            error={error}
            onReserve={(room) => {
              if (!user) {
                setRoute('login')
                return
              }
              setSelectedRoom(room)
              setRoute('booking')
            }}
          />
        )}

        {route === 'booking' && (
          <Booking room={selectedRoom} user={user} booking={selectedBooking} />
        )}

        {route === 'mybookings' && (
          <React.Suspense fallback={<div>Chargement…</div>}>
            {/* chargement différé pour garder le bundle petit */}
            <MyBookings user={user} onEdit={(booking) => {
              if (!booking) return
              ;(async () => {
                // chercher la salle associée à la réservation
                const { data: roomData } = await supabase.from('rooms').select('*').eq('id', booking.room_id).single()
                setSelectedRoom(roomData ?? null)
                setSelectedBooking(booking)
                setRoute('booking')
              })()
            }} />
          </React.Suspense>
        )}
        {route === 'admin' && (
          <Admin user={user} />
        )}
      </main>
    </div>
  )
}

function isAdmin(user: any | null) {
  if (!user) return false
  const um = user.user_metadata || {}
  const am = user.app_metadata || {}
  if (um.is_admin) return true
  if (um.role === 'admin') return true
  if (Array.isArray(am?.roles) && am.roles.includes('admin')) return true
  return false
}
