import styles from './FolderCard.module.css'

function MiniCounter({ counter }) {
  const hasBg = counter.backgroundImageLocal || counter.color
  const style = {
    backgroundColor: counter.color || undefined,
    backgroundImage: counter.backgroundImageLocal ? `url(${counter.backgroundImageLocal})` : undefined,
    backgroundSize: 'cover', backgroundPosition: 'center',
  }
  return (
    <div className={styles.miniCard} style={style}>
      {hasBg && <div className={styles.miniOverlay} />}
      <span className={styles.miniName} style={hasBg ? { color: 'rgba(255,255,255,0.85)' } : {}}>
        {counter.name}
      </span>
      <span className={styles.miniValue} style={hasBg ? { color: '#fff' } : {}}>
        {counter.value}
      </span>
      <div className={styles.miniBtns}>
        <div className={styles.miniMinus} style={hasBg ? { background: 'rgba(255,255,255,0.2)' } : {}}>
          <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M19 13H5v-2h14v2z"/></svg>
        </div>
        <div className={styles.miniPlus} style={hasBg ? { background: 'rgba(255,255,255,0.3)' } : {}}>
          <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        </div>
      </div>
    </div>
  )
}

function MiniFolder({ folder }) {
  const hasBg = folder.backgroundImageUrl || folder.color
  const style = {
    backgroundColor: folder.color || undefined,
    backgroundImage: folder.backgroundImageUrl ? `url(${folder.backgroundImageUrl})` : undefined,
    backgroundSize: 'cover', backgroundPosition: 'center',
  }
  return (
    <div className={styles.miniCard} style={style}>
      {hasBg && <div className={styles.miniOverlay} />}
      <div className={styles.miniFolderIcon} style={hasBg ? { color: 'rgba(255,255,255,0.8)' } : {}}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
        </svg>
      </div>
      <span className={styles.miniName} style={hasBg ? { color: 'rgba(255,255,255,0.9)' } : {}}>
        {folder.name}
      </span>
    </div>
  )
}

export default function FolderCard({ folder, folderCounters = [], subFolders = [], folderOrder = [], onClick, onMenu, isDragTarget }) {
  const bg = folder.backgroundImageUrl
  const color = folder.color
  const hasOverlay = bg || color

  // Ordenar items respetando folderOrder
  const counterMap = Object.fromEntries(folderCounters.map(c => [c.id, c]))
  const subFolderMap = Object.fromEntries(subFolders.map(f => [f.id, f]))
  const ordered = []
  const seenC = new Set(), seenF = new Set()

  for (const key of folderOrder) {
    if (key.startsWith('C:')) {
      const c = counterMap[key.slice(2)]
      if (c && !seenC.has(c.id)) { seenC.add(c.id); ordered.push({ type: 'counter', data: c }) }
    } else if (key.startsWith('F:')) {
      const f = subFolderMap[key.slice(2)]
      if (f && !seenF.has(f.id)) { seenF.add(f.id); ordered.push({ type: 'folder', data: f }) }
    }
  }
  // Items no incluidos en el orden
  folderCounters.forEach(c => { if (!seenC.has(c.id)) ordered.push({ type: 'counter', data: c }) })
  subFolders.forEach(f => { if (!seenF.has(f.id)) ordered.push({ type: 'folder', data: f }) })

  const preview = ordered.slice(0, 4)
  const overflow = ordered.length - 4
  const totalItems = ordered.length

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
      {hasOverlay && <div className={styles.overlay} />}

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

      {/* Nombre */}
      <p className={styles.name} style={hasOverlay ? { color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.5)' } : {}}>
        {folder.name}
      </p>

      {/* Grid preview */}
      <div className={`${styles.previewGrid} ${preview.length === 0 ? styles.empty : ''}`}>
        {preview.length > 0 ? (
          <>
            {preview.map(item =>
              item.type === 'counter'
                ? <MiniCounter key={item.data.id} counter={item.data} />
                : <MiniFolder key={item.data.id} folder={item.data} />
            )}
            {overflow > 0 && (
              <div className={styles.overflowCell} style={hasOverlay ? { background: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.25)' } : {}}>
                <span className={styles.overflowText} style={hasOverlay ? { color: '#fff' } : {}}>
                  +{overflow}
                </span>
              </div>
            )}
          </>
        ) : (
          <div className={styles.emptyIcon} style={hasOverlay ? { color: 'rgba(255,255,255,0.5)' } : {}}>
            <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
              <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
            </svg>
          </div>
        )}
      </div>

      {/* Conteo centrado abajo */}
      <div className={styles.countBar}>
        <span className={styles.countBadge} style={hasOverlay ? { background: 'rgba(0,0,0,0.35)', color: '#fff' } : {}}>
          {totalItems} {totalItems === 1 ? 'elemento' : 'elementos'}
        </span>
      </div>
    </div>
  )
}
