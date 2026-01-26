import React from 'react'
import '../pages_style/rooms.css'

type Room = any

type Props = {
  rooms: Room[]
  loading?: boolean
  error?: string | null
  onReserve: (room: Room) => void
}

export default function Rooms({ rooms, loading, error, onReserve }: Props) {
  return (
    <div>
      <h2 style={{ marginTop: 8 }}>Espaces disponibles</h2>

      {loading && <div>Chargement des espaces…</div>}
      {error && <div style={{ color: 'red' }}>{error}</div>}

      {/* grille de cartes */}
      <div className="rooms-grid">
        {rooms && rooms.length === 0 && <div>Aucun espace trouvé.</div>}
        {rooms && rooms.map((r, idx) => (
          <article key={String(r.id)} className="room-card">
            <img src='https://picsum.photos/id/48/5000/3333' className="room-img" />
            <div className="room-body">
              <h3 className="room-title">{r.name ?? `Room ${r.id}`}</h3>
              <div className="room-meta">Capacité: {r.capacity ?? 'N/A'}</div>
              {r.equipment && (
                <div className="room-section">
                  <strong>Équipements:</strong>
                  <div className="equipment-inline">{Array.isArray(r.equipment) ? r.equipment.join(', ') : String(r.equipment)}</div>
                </div>
              )}

              {r.rules && (
                <div className="room-section">
                  <strong>Règles:</strong>
                  <p>{r.rules}</p>
                </div>
              )}

              {/* état de réservation */}
              {r.current_booking ? (
                <div className="room-section" style={{ color: '#b91c1c' }}>
                  <strong>Réservée:</strong>
                  <div>{new Date(r.current_booking.start_at).toLocaleString()} — {new Date(r.current_booking.end_at).toLocaleString()}</div>
                </div>
              ) : r.next_booking ? (
                <div className="room-section" style={{ color: '#b56500' }}>
                  <strong>Prochaine réservation:</strong>
                  <div>{new Date(r.next_booking.start_at).toLocaleString()} — {new Date(r.next_booking.end_at).toLocaleString()}</div>
                </div>
              ) : null}

              <div className="room-actions">
                {/* réservation gérée par le parent */}
                <button className="btn primary" onClick={() => onReserve(r)} disabled={!!r.current_booking}>
                  {r.current_booking ? 'Indisponible' : 'Réserver'}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
