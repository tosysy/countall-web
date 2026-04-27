import styles from './FolderCard.module.css'

export default function FolderCard({ folder, counters, onClick, onMenu, isDragTarget }) {
  const bg = folder.backgroundImageUrl
  const color = folder.color
  const count = counters?.length ?? 0
  const preview = counters?.slice(0, 4) ?? []

  return (
    <div
      className={`${styles.card} ${isDragTarget ? styles.dragTarget : ''}`}
      style={{
        backgroundColor: color || undefined,
        backgroundImage: bg ? `url(${bg})` : undefined,
        backgroundSize: 'cover', backgroundPosition: 'center',
      }}
      onClick={() => onClick?.(folder)}
    >
      {(bg || color) && <div className={styles.overlay} />}

      {/* Menu button */}
      <button
        className={styles.menuBtn}
        onClick={e => { e.stopPropagation(); onMenu?.(folder) }}
        title="Opciones"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
        </svg>
      </button>

      {folder.isShared && (
        <div className={styles.sharedBadge}>
          <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor">
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
          </svg>
        </div>
      )}

      <div className={styles.icon} style={bg || color ? { color: '#fff' } : {}}>
        <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
          <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
        </svg>
      </div>

      <div className={styles.content}>
        <p className={styles.name} style={bg || color ? { color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.5)' } : {}}>
          {folder.name}
        </p>
        <p className={styles.count} style={bg || color ? { color: 'rgba(255,255,255,0.7)' } : {}}>
          {count} {count === 1 ? 'contador' : 'contadores'}
        </p>
      </div>

      {preview.length > 0 && !bg && (
        <div className={styles.preview}>
          {preview.map(c => (
            <div key={c.id} className={styles.previewItem}
              style={{ borderColor: color ? 'rgba(255,255,255,0.4)' : 'var(--preview-border)' }}>
              <span className={styles.previewValue} style={color ? { color: '#fff' } : {}}>
                {c.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
