import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { listenInvitations, listenSentInvitations, acceptInvitation, acceptFolderInvitation, rejectInvitation, cancelSentInvitation, sendInvitation, acceptEditRequest, shareCounter, shareFolder, schedulePushPersonalData } from '../firebase/syncManager'
import useAppStore from '../store/appStore'
import styles from './InvitationsPage.module.css'

export default function InvitationsPage() {
  const navigate = useNavigate()
  const { user, counters, folders, addCounter, addFolder, updateCounter, updateFolder, driveToken } = useAppStore()
  const [tab, setTab] = useState('received')
  const [received, setReceived] = useState([])
  const [sent, setSent] = useState([])
  const [loading, setLoading] = useState(null)
  const [toast, setToast] = useState(null)
  const [showSend, setShowSend] = useState(false)
  const [sendForm, setSendForm] = useState({ itemId:'', sharedId:'', itemName:'', toUsername:'', role:'viewer', isFolder: false })

  const showToast = (t) => { setToast(t); setTimeout(() => setToast(null), 3000) }

  useEffect(() => {
    const u1 = listenInvitations(setReceived)
    const u2 = listenSentInvitations(setSent)
    return () => { u1(); u2() }
  }, [])

  const handleAccept = async (inv) => {
    setLoading(inv.id)
    try {
      if (inv.isRequest) {
        await acceptEditRequest(inv)
        showToast('Permiso de edición concedido ✓')
      } else if (inv.isFolder) {
        const result = await acceptFolderInvitation(inv)
        if (result) {
          addFolder(result.folder)
          for (const c of (result.childCounters ?? [])) addCounter(c)
        }
        schedulePushPersonalData(
          useAppStore.getState().counters, useAppStore.getState().folders,
          useAppStore.getState().gridOrder, useAppStore.getState().folderOrders, driveToken
        )
        showToast('¡Invitación a carpeta aceptada!')
      } else {
        const result = await acceptInvitation(inv)
        if (result) addCounter(result)
        schedulePushPersonalData(
          useAppStore.getState().counters, useAppStore.getState().folders,
          useAppStore.getState().gridOrder, useAppStore.getState().folderOrders, driveToken
        )
        showToast('¡Invitación aceptada!')
      }
    } catch (e) { showToast('Error: ' + e.message) }
    finally { setLoading(null) }
  }

  const handleReject = async (inv) => {
    setLoading(inv.id)
    try {
      await rejectInvitation(inv)
      showToast('Invitación rechazada')
    } catch (e) { showToast('Error: ' + e.message) }
    finally { setLoading(null) }
  }

  const handleCancel = async (inv) => {
    setLoading(inv.id)
    try {
      await cancelSentInvitation(inv)
      showToast('Invitación cancelada')
    } catch (e) { showToast('Error: ' + e.message) }
    finally { setLoading(null) }
  }

  const handleSend = async () => {
    if (!sendForm.itemId || !sendForm.toUsername.trim()) return
    try {
      const isFolder = sendForm.isFolder ?? false
      const itemName = sendForm.itemName ?? ''
      let sharedId = sendForm.sharedId

      // Si el ítem no está compartido aún, compartirlo primero (igual que Android)
      if (!sharedId) {
        if (isFolder) {
          const folder = useAppStore.getState().folders.find(f => f.id === sendForm.itemId)
          if (!folder) throw new Error('Carpeta no encontrada')
          const { sharedId: sid, updatedCounters } = await shareFolder(folder, useAppStore.getState().counters.filter(c => c.folderId === folder.id))
          sharedId = sid
          updateFolder(folder.id, { isShared: true, sharedId: sid, role: 'owner', ownerId: user?.uid })
          for (const p of (updatedCounters ?? [])) updateCounter(p.id, { isShared: p.isShared, sharedId: p.sharedId, role: p.role, ownerId: p.ownerId, ownerUsername: p.ownerUsername })
        } else {
          const counter = useAppStore.getState().counters.find(c => c.id === sendForm.itemId)
          if (!counter) throw new Error('Contador no encontrado')
          const { sharedId: sid } = await shareCounter(counter)
          sharedId = sid
          updateCounter(counter.id, { isShared: true, sharedId: sid, role: 'owner', ownerId: user?.uid })
        }
        schedulePushPersonalData(
          useAppStore.getState().counters, useAppStore.getState().folders,
          useAppStore.getState().gridOrder, useAppStore.getState().folderOrders, driveToken
        )
      }

      await sendInvitation(sharedId, itemName, sendForm.toUsername.trim(), sendForm.role, isFolder)
      setShowSend(false)
      setSendForm({ itemId:'', sharedId:'', itemName:'', toUsername:'', role:'viewer', isFolder: false })
      showToast('Invitación enviada ✓')
    } catch (e) { showToast(e.message) }
  }

  // Mostrar todos los contadores/carpetas propios (compartidos y no compartidos)
  // igual que Android que permite compartir-e-invitar en un solo paso
  const allOwnedItems = [
    ...counters.filter(c => !c.isShared || c.role === 'owner')
      .map(c => ({ itemId: c.id, sharedId: c.sharedId ?? null, name: c.name, isFolder: false })),
    ...folders.filter(f => !f.isShared || f.role === 'owner')
      .map(f => ({ itemId: f.id, sharedId: f.sharedId ?? null, name: f.name, isFolder: true })),
  ]

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className="btn-icon" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <h1 className={styles.title}>Invitaciones</h1>
        {allOwnedItems.length > 0 && (
          <button className={styles.btnNew} onClick={() => setShowSend(true)} title="Enviar invitación">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        )}
      </header>

      {/* Tab bar */}
      <div className={styles.tabs}>
        <div className={styles.tabIndicator} style={{ transform:`translateX(${tab==='received'?0:100}%)`, width:'50%' }} />
        {['received','sent'].map(t => (
          <button key={t} className={`${styles.tab} ${tab===t?styles.active:''}`} onClick={() => setTab(t)}>
            {{ received:'Recibidas', sent:'Enviadas' }[t]}
            {t==='received' && received.length>0 && <span className={styles.tabBadge} />}
          </button>
        ))}
      </div>

      <div className={styles.list}>
        {tab === 'received' && (
          received.length === 0
            ? <p className={styles.empty}>No hay invitaciones recibidas</p>
            : received.map(inv => (
                <div key={inv.id} className={styles.card}>
                  <div className={styles.cardInfo}>
                    <p className={styles.cardTitle}>{inv.itemName}</p>
                    {inv.isRequest ? (
                      <p className={styles.cardSub}><strong>{inv.fromUsername}</strong> solicita permiso de edición</p>
                    ) : (
                      <>
                        <p className={styles.cardSub}>De <strong>{inv.fromUsername}</strong> · {inv.role === 'editor' ? 'Editor' : 'Solo ver'}</p>
                        <p className={styles.cardSub}>{inv.isFolder ? 'Carpeta compartida' : 'Contador compartido'}</p>
                      </>
                    )}
                  </div>
                  <div className={styles.cardActions}>
                    <button className={styles.btnAccept} disabled={loading === inv.id} onClick={() => handleAccept(inv)}>
                      {loading === inv.id ? <span className="spinner" style={{ width:16, height:16 }} /> : 'Aceptar'}
                    </button>
                    <button className={styles.btnReject} disabled={loading === inv.id} onClick={() => handleReject(inv)}>
                      Rechazar
                    </button>
                  </div>
                </div>
              ))
        )}

        {tab === 'sent' && (
          sent.length === 0
            ? <p className={styles.empty}>No hay invitaciones enviadas</p>
            : sent.map(inv => (
                <div key={inv.id} className={styles.card}>
                  <div className={styles.cardInfo}>
                    <p className={styles.cardTitle}>{inv.itemName}</p>
                    <p className={styles.cardSub}>Para <strong>{inv.toUsername}</strong> · {inv.role === 'editor' ? 'Editor' : 'Solo ver'}</p>
                    <p className={styles.cardSub}>Pendiente de aceptación</p>
                  </div>
                  <button className={styles.btnCancel} disabled={loading === inv.id} onClick={() => handleCancel(inv)}>
                    {loading === inv.id ? <span className="spinner" style={{ width:16, height:16 }} /> : 'Cancelar'}
                  </button>
                </div>
              ))
        )}
      </div>

      {/* Send invitation dialog */}
      {showSend && (
        <div className="dialog-backdrop" onClick={() => setShowSend(false)}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            <h3>Enviar invitación</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
              <select className="input-field" value={sendForm.itemId}
                onChange={e => {
                  const item = allOwnedItems.find(i => i.itemId === e.target.value)
                  setSendForm(f => ({ ...f, itemId: e.target.value, sharedId: item?.sharedId ?? null, itemName: item?.name ?? '', isFolder: item?.isFolder ?? false }))
                }}>
                <option value="">Selecciona un elemento...</option>
                {allOwnedItems.map(item => (
                  <option key={item.itemId} value={item.itemId}>
                    {item.isFolder ? '📁' : '🔢'} {item.name}{!item.sharedId ? ' (no compartido)' : ''}
                  </option>
                ))}
              </select>
              <input className="input-field" placeholder="Nombre de usuario"
                value={sendForm.toUsername} onChange={e => setSendForm(f => ({ ...f, toUsername: e.target.value }))} />
              <select className="input-field" value={sendForm.role}
                onChange={e => setSendForm(f => ({ ...f, role: e.target.value }))}>
                <option value="viewer">Solo ver</option>
                <option value="editor">Editor</option>
              </select>
            </div>
            <div style={{ display:'flex', gap:'8px', marginTop:'16px', justifyContent:'flex-end' }}>
              <button className="btn-ghost" onClick={() => setShowSend(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSend}>Enviar</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
