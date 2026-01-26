import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import '../pages_style/mybookings.css'

type Props = {
  user?: any | null
  onEdit: (booking: any) => void
}

export default function MyBookings({ user, onEdit }: Props) {
  const [bookings, setBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // états pour le modal d'annulation

  useEffect(() => {
    let mounted = true

    // charge les réservations de l'utilisateur depuis Supabase
    const load = async () => {
      setError(null)
      setLoading(true)
      try {
        let userId = user?.id
        if (!userId) {
          const { data: u } = await supabase.auth.getUser()
          userId = u?.user?.id
        }
        if (!userId) {
          setBookings([])
          setLoading(false)
          return
        }

        // récupérer les réservations avec le nom de la salle liée
        const { data, error } = await supabase
          .from('bookings')
          .select('id,room_id,start_at,end_at,status,room:rooms(name)')
          .eq('user_id', userId)
          .order('start_at', { ascending: true })

       

        if (!mounted) return
        if (error) {
          // afficher erreur et vider la liste
          console.error('Erreur fetch mes réservations', error)
          setError(error.message)
          setBookings([])
        } else {
          // stocker les réservations
          console.log('Mes réservations chargées', data)
          setBookings(data || [])
        }
      } catch (e: any) {
        console.error(e)
        setError(String(e))
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()

    // s'abonner aux changements de réservations pour cet utilisateur
    const subId = user?.id ?? 'unknown'
    const channel = supabase.channel(`user-bookings-${subId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `user_id=eq.${user?.id}` }, () => {
        // recharger quand une réservation change
        load()
      })
      .subscribe()

    // cleanup à la destruction du composant
    return () => { mounted = false; try { channel.unsubscribe() } catch (e) {} }
  }, [user])

  // ouverture du modal d'annulation (stocke l'id cible)
  const handleCancel = async (b: any) => {
    setCancelTarget(b.id)
    setShowCancelModal(true)
  }

  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<number | null>(null)

  // confirme l'annulation et met à jour l'UI
  const doCancel = async () => {
    if (!cancelTarget) return
    const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', cancelTarget)
    setShowCancelModal(false)
    setCancelTarget(null)
    if (error) return alert('Erreur annulation')
    // appliquer changement localement
    setBookings((s) => s.map(it => it.id === cancelTarget ? { ...it, status: 'cancelled' } : it))
  }

  return (
    <div>
      <div className="page-header">
        <h2>Mes réservations</h2>
        <div>
          <button className="btn" onClick={() => { window.location.reload() }}>Rafraîchir</button>
        </div>
      </div>

      {/* états de chargement */}
      {loading && <div>Chargement…</div>}
      {error && <div className="auth-error">Erreur: {error}</div>}
      {!loading && bookings.length === 0 && <div className="empty">Aucune réservation.</div>}

      <div className="bookings-list">
        {bookings.map(b => (
          <article key={b.id} className="booking-item">
            <div className="booking-main">
              <div className="booking-meta">
                {/* afficher le nom de la salle si la relation est présente */}
                <div className="meta-row"><strong>Salle:</strong> <span>{b.room?.name ?? String(b.room_id)}</span></div>
                <div className="meta-row"><strong>Début:</strong> <span>{new Date(b.start_at).toLocaleString()}</span></div>
                <div className="meta-row"><strong>Fin:</strong> <span>{new Date(b.end_at).toLocaleString()}</span></div>
              </div>
              <div className="booking-side">
                {/* statut visuel  */}
                <div className={`booking-status ${b.status}`}>{b.status}</div>
                <div className="booking-actions">
                  <button className="btn" onClick={() => onEdit(b)} disabled={b.status !== 'confirmed'}>Modifier</button>
                  <button className="btn" onClick={() => handleCancel(b)} disabled={b.status !== 'confirmed'}>Annuler</button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
      {showCancelModal && (
        <Modal title="Annuler la réservation" onConfirm={doCancel} onCancel={() => setShowCancelModal(false)} confirmText="Oui, annuler" cancelText="Non" >
          <p>Voulez-vous vraiment annuler cette réservation ?</p>
        </Modal>
      )}
    </div>
  )
}
