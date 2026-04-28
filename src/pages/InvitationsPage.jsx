import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  listenInvitations, listenSentInvitations,
  acceptInvitation, acceptFolderInvitation, rejectInvitation,
  cancelSentInvitation, sendInvitation, acceptEditRequest,
  shareCounter, shareFolder, schedulePushPersonalData,
} from '../firebase/syncManager'
import useAppStore from '../store/appStore'
import styles from './InvitationsPage.module.css'

export default function InvitationsPage() {
  const navigate = useNavigate()
  const { user, counters, folders, addCounter, addFolder, updateCounter, updateFolder, driveToken } = useAppStore()
  const [tab, setTab] = useState('received')
  const [received, setReceived] = useState([])
  const [sent, setSent] = useState([])
  const [loading, setLoading] = useState(null)
  const [dismissingId, setDismissingId] = useState(null)
  const [toast, setToast] = useState(null)
  const [showSend, setShowSend] = useState(false)
  const [sendForm, setSendForm] = useState({ itemId:'', sharedId:'', itemName:'', toUsername:'', role:'viewer', isFolder:false })
  const [sendLoading, setSendLoading] = useState(false)

  const showToast = (t) => { setToast(t); setTimeout(() => setToast(null), 3000) }

  const dismissThen = (id, action) => {
    setDismissingId(id)
    setTimeout(() => { action(); setDismissingId(null) }, 420)
  }

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
        showToast('Invitación a carpeta aceptada ✓')
      } else {
        const result = await acceptInvitation(inv)
        if (result) addCounter(result)
        schedulePushPersonalData(
          useAppStore.getState().counters, useAppStore.getState().folders,
          useAppStore.getState().gridOrder, useAppStore.getState().folderOrders, driveToken
        )
        showToast('Invitación aceptada ✓')
      }
    } catch (e) { showToast('Error: ' + e.message) }
    finally { setLoading(null) }
  }

  const handleReject = (inv) => {
    dismissThen(inv.id, async () => {
      try { await rejectInvitation(inv); showToast('Invitación rechazada') }
      catch (e) { showToast('Error: ' + e.message) }
    })
  }

  const handleCancel = (inv) => {
    dismissThen(inv.id, async () => {
      try { await cancelSentInvitation(inv); showToast('Invitación cancelada') }
      catch (e) { showToast('Error: ' + e.message) }
    })
  }

  const handleSend = async () => {
    if (!sendForm.itemId || !sendForm.toUsername.trim()) return
    setSendLoading(true)
    try {
      const isFolder = sendForm.isFolder ?? false
      let sharedId = sendForm.sharedId

      if (!sharedId) {
        if (isFolder) {
          const folder = useAppStore.getState().folders.find(f => f.id === sendForm.itemId)
          if (!folder) throw new Error('Carpeta no encontrada')
          const { sharedId: sid, updatedCounters } = await shareFolder(folder, useAppStore.getState().counters.filter(c => c.folderId === folder.id))
          sharedId = sid
          updateFolder(folder.id, { isShared:true, sharedId:sid, role:'owner', ownerId:user?.uid })
          for (const p of (updatedCounters ?? [])) updateCounter(p.id, { isShared:p.isShared, sharedId:p.sharedId, role:p.role, ownerId:p.ownerId, ownerUsername:p.ownerUsername })
        } else {
          const counter = useAppStore.getState().counters.find(c => c.id === sendForm.itemId)
          if (!counter) throw new Error('Contador no encontrado')
          const { sharedId: sid } = await shareCounter(counter)
          sharedId = sid
          updateCounter(counter.id, { isShared:true, sharedId:sid, role:'owner', ownerId:user?.uid })
        }
        schedulePushPersonalData(
          useAppStore.getState().counters, useAppStore.getState().folders,
          useAppStore.getState().gridOrder, useAppStore.getState().folderOrders, driveToken
        )
      }

      await sendInvitation(sharedId, sendForm.itemName, sendForm.toUsername.trim(), sendForm.role, isFolder)
      setShowSend(false)
      setSendForm({ itemId:'', sharedId:'', itemName:'', toUsername:'', role:'viewer', isFolder:false })
      showToast('Invitación enviada ✓')
    } catch (e) { showToast(e.message) }
    finally { setSendLoading(false) }
  }

  const allOwnedItems = [
    ...counters.filter(c => !c.isShared || c.role === 'owner').map(c => ({ itemId:c.id, sharedId:c.sharedId??null, name:c.name, isFolder:false })),
    ...folders.filter(f => !f.isShared || f.role === 'owner').map(f => ({ itemId:f.id, sharedId:f.sharedId??null, name:f.name, isFolder:true })),
  ]

  const selectedItem = allOwnedItems.find(i => i.itemId === sendForm.itemId)

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
          <button className={styles.btnNew} onClick={() => setShowSend(true)} title="Nueva invitación">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </button>
        )}
      </header>

      {/* Tab bar */}
      <div className={styles.tabs}>
        <div className={styles.tabIndicator} style={{ transform:`translateX(${tab==='received'?0:100}%)`, width:'50%' }} />
        {[
          { id:'received', label:'Recibidas' },
          { id:'sent',     label:'Enviadas' },
        ].map(t => (
          <button key={t.id} className={`${styles.tab} ${tab===t.id?styles.active:''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id==='received' && received.length>0 && <span className={styles.tabBadge} />}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className={styles.list}>

        {/* ── RECIBIDAS ── */}
        {tab === 'received' && (
          received.length === 0
            ? <div className="empty-state">
                <svg viewBox="0 0 24 24" width="52" height="52" fill="currentColor">
                  <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                </svg>
                <p>No hay invitaciones recibidas</p>
              </div>
            : received.map(inv => (
                <div key={inv.id} className={dismissingId === inv.id ? styles.collapseWrap : undefined}>
                  <div className={`${styles.card} ${dismissingId === inv.id ? styles.cardDismissing : ''}`}>
                    {/* Icono tipo */}
                    <div className={`${styles.typeIcon} ${inv.isRequest ? styles.typeRequest : inv.isFolder ? styles.typeFolder : styles.typeCounter}`}>
                      {inv.isRequest
                        ? <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                        : inv.isFolder
                          ? <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                          : <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                      }
                    </div>

                    {/* Info */}
                    <div className={styles.cardInfo}>
                      <p className={styles.cardTitle}>{inv.itemName}</p>
                      {inv.isRequest
                        ? <p className={styles.cardSub}><strong>{inv.fromUsername}</strong> solicita permiso de edición</p>
                        : <>
                            <p className={styles.cardSub}>De <strong>{inv.fromUsername}</strong></p>
                            <p className={styles.cardMeta}>
                              {inv.isFolder ? 'Carpeta' : 'Contador'} · {inv.role === 'editor' ? 'Editor' : 'Solo ver'}
                            </p>
                          </>
                      }
                    </div>

                    {/* Acciones */}
                    <div className={styles.cardActions}>
                      <button className={styles.btnAccept} disabled={loading===inv.id || dismissingId===inv.id} onClick={() => handleAccept(inv)}>
                        {loading===inv.id ? <span className="spinner" style={{width:14,height:14}}/> : 'Aceptar'}
                      </button>
                      <button className={styles.btnReject} disabled={loading===inv.id || dismissingId===inv.id} onClick={() => handleReject(inv)}>
                        Rechazar
                      </button>
                    </div>
                  </div>
                </div>
              ))
        )}

        {/* ── ENVIADAS ── */}
        {tab === 'sent' && (
          sent.length === 0
            ? <div className="empty-state">
                <svg viewBox="0 0 24 24" width="52" height="52" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
                <p>No hay invitaciones enviadas</p>
              </div>
            : sent.map(inv => (
                <div key={inv.id} className={dismissingId === inv.id ? styles.collapseWrap : undefined}>
                  <div className={`${styles.card} ${dismissingId === inv.id ? styles.cardDismissing : ''}`}>
                    <div className={`${styles.typeIcon} ${inv.isFolder ? styles.typeFolder : styles.typeCounter}`}>
                      {inv.isFolder
                        ? <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                        : <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                      }
                    </div>
                    <div className={styles.cardInfo}>
                      <p className={styles.cardTitle}>{inv.itemName}</p>
                      <p className={styles.cardSub}>Para <strong>{inv.toUsername}</strong></p>
                      <p className={styles.cardMeta}>{inv.role === 'editor' ? 'Editor' : 'Solo ver'} · Pendiente</p>
                    </div>
                    <button className={styles.btnCancel} disabled={loading===inv.id || dismissingId===inv.id} onClick={() => handleCancel(inv)}>
                      {loading===inv.id ? <span className="spinner" style={{width:14,height:14}}/> : 'Cancelar'}
                    </button>
                  </div>
                </div>
              ))
        )}
      </div>

      {/* ── Dialog enviar invitación ── */}
      {showSend && (
        <div className="dialog-backdrop" onClick={() => setShowSend(false)}>
          <div className={styles.sendDialog} onClick={e => e.stopPropagation()}>
            <div className={styles.sendDialogHeader}>
              <h3 className={styles.sendDialogTitle}>Nueva invitación</h3>
              <button className="btn-icon" onClick={() => setShowSend(false)}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>

            {/* Seleccionar elemento */}
            <p className={styles.sendLabel}>Elemento</p>
            <div className={styles.itemPicker}>
              {allOwnedItems.map(item => (
                <button key={item.itemId}
                  className={`${styles.itemChip} ${sendForm.itemId === item.itemId ? styles.itemChipActive : ''}`}
                  onClick={() => setSendForm(f => ({ ...f, itemId:item.itemId, sharedId:item.sharedId??null, itemName:item.name, isFolder:item.isFolder }))}>
                  {item.isFolder
                    ? <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                    : <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                  }
                  {item.name}
                </button>
              ))}
            </div>

            {/* Usuario destino */}
            <p className={styles.sendLabel}>Usuario</p>
            <div className={styles.sendInputWrap}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ color:'var(--text-secondary)', flexShrink:0 }}>
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
              <input className={styles.sendInput} placeholder="Nombre de usuario"
                value={sendForm.toUsername}
                onChange={e => setSendForm(f => ({ ...f, toUsername:e.target.value }))} />
            </div>

            {/* Rol */}
            <p className={styles.sendLabel}>Permisos</p>
            <div className={styles.rolePicker}>
              {[
                { id:'viewer', label:'Solo ver',  icon:<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg> },
                { id:'editor', label:'Editor',    icon:<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg> },
              ].map(r => (
                <button key={r.id}
                  className={`${styles.roleChip} ${sendForm.role === r.id ? styles.roleChipActive : ''}`}
                  onClick={() => setSendForm(f => ({ ...f, role:r.id }))}>
                  {r.icon}{r.label}
                </button>
              ))}
            </div>

            {/* Botón enviar */}
            <button className={styles.sendBtn}
              disabled={!sendForm.itemId || !sendForm.toUsername.trim() || sendLoading}
              onClick={handleSend}>
              {sendLoading
                ? <span className="spinner" style={{width:18,height:18}}/>
                : <>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                    Enviar invitación
                  </>
              }
            </button>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
