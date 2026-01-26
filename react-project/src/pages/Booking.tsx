import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import '../pages_style/booking.css'

type Props = {
  room?: any | null
  user?: any | null
  booking?: any | null
}

// - L'utilisateur doit être connecté pour réserver
export default function Booking({ room, user, booking }: Props) {
  if (!user) return <div>Vous devez être connecté pour réserver.</div>
  // début/fin au format ISO local
  const [startAt, setStartAt] = useState<string>('')
  const [endAt, setEndAt] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [confirmed, setConfirmed] = useState(false)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [conflicts, setConflicts] = useState<any[]>([])

  // Sélecteur de créneaux horaires
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0,10))
  const SLOT_START = 8
  const SLOT_END = 20 // Dernier créneau 19:00-20:00
  const slots = Array.from({ length: SLOT_END - SLOT_START }, (_, i) => SLOT_START + i)
  const [occupied, setOccupied] = useState<Record<number, boolean>>({})
  const [selStartIdx, setSelStartIdx] = useState<number | null>(null)
  const [selEndIdx, setSelEndIdx] = useState<number | null>(null)
  const [editing, setEditing] = useState<boolean>(false)

  if (!room) return (
    <div className="container">
      <h2>Réservation</h2>
      <p>Sélectionnez d'abord un espace à réserver.</p>
    </div>
  )

  const handleConfirm = async () => {
      // Vérifier la sélection
      if (selStartIdx === null || selEndIdx === null) {
        alert('Veuillez choisir un créneau horaire.')
        return
      }

      const startLocal = `${date}T${String(slots[selStartIdx]).padStart(2,'0')}:00`
      const endLocal = `${date}T${String(slots[selEndIdx]).padStart(2,'0')}:00`
      setStartAt(startLocal)
      setEndAt(endLocal)

      const startISO = new Date(startLocal).toISOString()
      const endISO = new Date(endLocal).toISOString()

      if (new Date(startISO) >= new Date(endISO)) {
        alert('La date de fin doit être après la date de début.')
        return
      }

      // vérifier les conflits de réservation
      setChecking(true)
      let query = supabase
        .from('bookings')
        .select('id,start_at,end_at')
        .eq('room_id', room.id)
        .eq('status', 'confirmed')
        .lt('start_at', endISO)
        .gt('end_at', startISO)
      // Si on modifie une réservation existante, l'exclure de la vérification
      if (booking?.id) query = (query as any).neq('id', booking.id)
      const { data: existing, error: exErr } = await query

      setChecking(false)
      if (exErr) {
        // eslint-disable-next-line no-console
        console.error('Erreur vérif conflits', exErr)
        alert('Erreur lors de la vérification des disponibilités.')
        return
      }
      if (existing && existing.length > 0) {
        setConflicts(existing)
        setShowConflictModal(true)
        return
      }

      let bookingData: any = null
      if (booking?.id) {
        // Mettre à jour la réservation existante
        const { data: updated, error: updErr } = await supabase
          .from('bookings')
          .update({ start_at: startISO, end_at: endISO })
          .eq('id', booking.id)
          .select()
          .single()
        if (updErr || !updated) {
          console.error('Erreur mise à jour réservation', updErr)
          alert('Impossible de mettre à jour la réservation.')
          setChecking(false)
          return
        }
        bookingData = updated
        setConfirmed(true)
        setQrUrl(null)
      } else {
        // Insérer une nouvelle réservation
        const insertPayload = {
          user_id: user.id,
          room_id: room.id,
          start_at: startISO,
          end_at: endISO,
          status: 'confirmed',
        }

        const { data: newBooking, error: bookingErr } = await supabase
          .from('bookings')
          .insert(insertPayload)
          .select()
          .single()

        if (bookingErr || !newBooking) {
          console.error('Erreur insert booking', bookingErr)
          alert('Impossible de créer la réservation.')
          setChecking(false)
          return
        }

        bookingData = newBooking

        // générer un token d'accès lié à la réservation et l'insérer 
        const tokenText = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
          ? (crypto as any).randomUUID()
          : `tk-${Date.now()}-${Math.floor(Math.random() * 100000)}`

        const { data: tokenData, error: tokenErr } = await supabase
          .from('access_tokens')
          .insert({ booking_id: bookingData.id, token: tokenText, valid_to: endISO })
          .select()
          .single()

        if (tokenErr || !tokenData) {
          console.error('Erreur création token', tokenErr)
          alert('Réservation créée mais échec lors de la génération du token.')
          setChecking(false)
          return
        }

        // générer le QR code avec le token
        const qrPayload = encodeURIComponent(JSON.stringify({ booking_id: bookingData.id, token: tokenText }))
        const qr = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${qrPayload}`
        setQrUrl(qr)
        setConfirmed(true)
      }

      setChecking(false)
  }

  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showConflictModal, setShowConflictModal] = useState(false)

  // changer les créneaux occupés quand la date ou la salle change
  useEffect(() => {
    if (!room?.id || !date) return
    let mounted = true
    ;(async () => {
      const dayStart = new Date(`${date}T00:00:00`).toISOString()
      const dayEnd = new Date(`${date}T23:59:59.999`).toISOString()
      const { data } = await supabase
        .from('bookings')
        .select('id,start_at,end_at,status')
        .eq('room_id', room.id)
        .eq('status', 'confirmed')
        .lt('start_at', dayEnd)
        .gt('end_at', dayStart)

      if (!mounted) return
      const occ: Record<number, boolean> = {} as Record<number, boolean>
      (data || []).forEach((b: any) => {
        const bStart = new Date(b.start_at)
        const bEnd = new Date(b.end_at)
        slots.forEach((h, idx) => {
          const slotStart = new Date(`${date}T${String(h).padStart(2,'0')}:00`)
          const slotEnd = new Date(slotStart.getTime() + 60*60*1000)
          if (bStart < slotEnd && bEnd > slotStart) {
            occ[idx] = true
          }
        })
      })
      setOccupied(occ)
      // Si le créneau sélectionné chevauche une réservation, réinitialiser la sélection
      if (selStartIdx !== null && selEndIdx !== null) {
        for (let i = selStartIdx; i <= selEndIdx - 1; i++) {
          if (occ[i]) {
            setSelStartIdx(null)
            setSelEndIdx(null)
            break
          }
        }
      }
    })()
    return () => { mounted = false }
  }, [room?.id, date])

  useEffect(() => {
    if (booking && booking.id) {
      setEditing(true)
      const bStart = new Date(booking.start_at)
      const bEnd = new Date(booking.end_at)
      const localDate = bStart.toISOString().slice(0,10)
      setDate(localDate)
      // calculer les index des slots
      const startHour = bStart.getHours()
      const endHour = bEnd.getHours()
      const startIdx = slots.indexOf(startHour)
      const endIdx = slots.indexOf(endHour)
      if (startIdx !== -1 && endIdx !== -1) {
        setSelStartIdx(startIdx)
        setSelEndIdx(endIdx)
      }
      setStartAt(booking.start_at)
      setEndAt(booking.end_at)
    } else {
      setEditing(false)
      setSelStartIdx(null)
      setSelEndIdx(null)
    }
  }, [booking])

  useEffect(() => {
    if (booking && booking.id) {
      setEditing(true)
      // préremplir les champs
      setStartAt(new Date(booking.start_at).toISOString().slice(0,16))
      setEndAt(new Date(booking.end_at).toISOString().slice(0,16))
      setNotes(booking.notes || '')
    } else {
      setEditing(false)
    }
  }, [booking])

  const handleCancelBooking = async () => {
    if (!booking?.id) return
    setShowCancelModal(true)
  }

  const doCancelBooking = async () => {
    if (!booking?.id) return
    const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id)
    setShowCancelModal(false)
    if (error) {
      alert('Impossible d\'annuler la réservation')
      return
    }
    alert('Réservation annulée')
  }

  // Modal de conflit de réservation
  const ConflictModal = () => (
    <Modal title="Conflit de réservation" onConfirm={() => setShowConflictModal(false)} onCancel={() => setShowConflictModal(false)} confirmText="OK" cancelText="Fermer">
      <p>Le créneau choisi chevauche une ou plusieurs réservations existantes :</p>
      <ul>
        {conflicts.map(c => (
          <li key={c.id}>{new Date(c.start_at).toLocaleString()} — {new Date(c.end_at).toLocaleString()}</li>
        ))}
      </ul>
      <p>Veuillez choisir un autre créneau.</p>
    </Modal>
  )

  const handleClose = () => {
    setConfirmed(false)
    setQrUrl(null)
  }

  // écouter les changements de réservation en temps réel pour cette salle
  useEffect(() => {
    if (!room?.id) return
    const channel = supabase.channel(`room-bookings-${room.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `room_id=eq.${room.id}` }, () => {
        // quand une réservation change, re-vérifier les conflits si on a des dates sélectionnées
        if (startAt && endAt) {
          ;(async () => {
            setChecking(true)
            const startISO = new Date(startAt).toISOString()
            const endISO = new Date(endAt).toISOString()
            const { data: existing } = await supabase
              .from('bookings')
              .select('id,start_at,end_at')
              .eq('status', 'confirmed')
              .eq('room_id', room.id)
              .lt('start_at', endISO)
              .gt('end_at', startISO)
            setConflicts(existing || [])
            setChecking(false)
          })()
        }
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [room?.id, startAt, endAt])

  return (
    <div className="container">
      <h2>Réservation — {room.name}</h2>

      <div className="booking-grid">
        <div className="booking-main">
          <div className="room-summary">
            <img className="room-preview" src= 'https://picsum.photos/id/48/5000/3333' alt="aperçu" />
            <div className="room-info">
              <h3 className="room-title">{room.name}</h3>
              <div className="room-meta"><strong>Capacité:</strong> {room.capacity ?? 'N/A'}</div>
              <div className="room-meta"><strong>Équipements:</strong> {(Array.isArray(room.equipment) ? room.equipment.join(', ') : room.equipment)}</div>
              {room.rules && <div className="room-meta"><strong>Règles:</strong> {room.rules}</div>}
            </div>
          </div>

          <form className="booking-form" onSubmit={(e) => { e.preventDefault(); handleConfirm() }}>
            <label>
              Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>

            <div>
              <strong>Choisir un créneau</strong>
              <div className="slot-grid" style={{ marginTop: 8 }}>
                {slots.map((h, idx) => {
                  const isOcc = !!occupied[idx]
                  const isSelected = selStartIdx !== null && selEndIdx !== null && idx >= selStartIdx && idx < selEndIdx
                  return (
                    <button
                      key={h}
                      type="button"
                      className={`btn ${isOcc ? '' : 'primary'}`}
                      onClick={() => {
                        if (isOcc) return
                        if (selStartIdx === null) {
                          setSelStartIdx(idx)
                          setSelEndIdx(idx+1)
                        } else {
                          if (idx < selStartIdx) {
                            setSelStartIdx(idx)
                          } else {
                            setSelEndIdx(idx+1)
                          }
                        }
                      }}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        opacity: isOcc ? 0.5 : 1,
                        background: isSelected ? '#ffd27a' : undefined,
                        border: isOcc ? '1px solid #ddd' : undefined,
                      }}
                      disabled={isOcc}
                    >
                      {String(h).padStart(2,'0')}:00 — {String(h+1).padStart(2,'0')}:00
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="form-actions">
              <button className="btn primary" type="submit" disabled={checking || (conflicts && conflicts.length>0) || selStartIdx===null}>
                {checking ? 'Vérification...' : editing ? 'Mettre à jour la réservation' : 'Confirmer la réservation'}
              </button>
              <button className="btn" type="button" onClick={() => { setSelStartIdx(null); setSelEndIdx(null); setConflicts([]) }}>Réinitialiser</button>
              {editing && (
                <button className="btn" type="button" onClick={handleCancelBooking} style={{ marginLeft: 8 }}>Annuler la réservation</button>
              )}
            </div>
          </form>
        </div>

        <aside className="booking-aside">
          <div className="aside-card">
            <h4>Récapitulatif</h4>
            <p><strong>Utilisateur:</strong> {user.email}</p>
            <p><strong>Salle:</strong> {room.name}</p>
            <p><strong>Début:</strong> {startAt ? new Date(startAt).toLocaleString() : '—'}</p>
            <p><strong>Fin:</strong> {endAt ? new Date(endAt).toLocaleString() : '—'}</p>
            <p style={{ marginTop: 8 }}><strong>Conseil:</strong> Vous recevrez un QR code après confirmation. Présentez-le à l'accueil.</p>
            {conflicts && conflicts.length > 0 && (
              <div style={{ marginTop: 10, color: '#b91c1c' }}>
                <strong>Conflit(s) détecté(s):</strong>
                <ul>
                  {conflicts.map((c) => (
                    <li key={c.id}>{new Date(c.start_at).toLocaleString()} — {new Date(c.end_at).toLocaleString()}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Modal de confirmation avec QR */}
      {confirmed && qrUrl && (
        <div className="modal-overlay" onClick={handleClose}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Réservation confirmée</h3>
            <p>Voici votre QR code à présenter sur place.</p>
            <div style={{ textAlign: 'center', margin: '12px 0' }}>
              <img src={qrUrl} alt="QR code réservation" style={{ width: 260, height: 260, borderRadius: 8, border: '1px solid #eee' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <a className="btn" href={qrUrl} download={`reservation-${room.id}.png`}>Télécharger</a>
              <button className="btn primary" onClick={handleClose}>Fermer</button>
            </div>
          </div>
        </div>
      )}
      {showCancelModal && (
        <Modal title="Annuler la réservation" onConfirm={doCancelBooking} onCancel={() => setShowCancelModal(false)} confirmText="Oui, annuler" cancelText="Non">
          <p>Voulez-vous vraiment annuler cette réservation ?</p>
        </Modal>
      )}

      {showConflictModal && conflicts && conflicts.length > 0 && (
        <ConflictModal />
      )}
    </div>
  )
}
