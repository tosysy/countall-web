import { create } from 'zustand'
import { persist } from 'zustand/middleware'

function newId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

const useAppStore = create(
  persist(
    (set, get) => ({
      // ── Auth ──────────────────────────────────────────────────────────────
      user: null,          // Firebase user object (no persistido — se restaura desde onAuthStateChanged)
      username: null,      // username del usuario
      driveToken: null,    // OAuth access token para Drive (sólo en memoria — no persistir)
      driveTokenExpiry: 0, // timestamp en ms cuando expira

      // ── Datos ─────────────────────────────────────────────────────────────
      counters: [],        // Array<Counter>
      folders: [],         // Array<Folder>
      gridOrder: [],       // Array<"F:id" | "C:id"> — orden del grid raíz
      folderOrders: {},    // { folderId: Array<"F:id" | "C:id"> }

      // ── UI ────────────────────────────────────────────────────────────────
      currentFolderId: null,
      theme: 'system',     // 'light' | 'dark' | 'system'

      // ── Historial ─────────────────────────────────────────────────────────
      history: [],         // Array<{id,timestamp,description,countersSnapshot,foldersSnapshot}>

      // ── Setters básicos ───────────────────────────────────────────────────
      setUser: (user) => set({ user }),
      setUsername: (username) => set({ username }),
      setDriveToken: (token, expiry) => set({ driveToken: token, driveTokenExpiry: expiry ?? 0 }),
      setTheme: (theme) => set({ theme }),
      setCurrentFolder: (id) => set({ currentFolderId: id }),

      // ── Contadores ────────────────────────────────────────────────────────
      addCounter: (counter) => set(s => {
        const counters = [...s.counters, counter]
        const gridOrder = counter.folderId
          ? s.gridOrder
          : [...s.gridOrder, `C:${counter.id}`]
        return { counters, gridOrder }
      }),

      updateCounter: (id, patch) => set(s => ({
        counters: s.counters.map(c => c.id === id ? { ...c, ...patch } : c),
      })),

      removeCounter: (id) => set(s => ({
        counters: s.counters.filter(c => c.id !== id),
        gridOrder: s.gridOrder.filter(k => k !== `C:${id}`),
        folderOrders: Object.fromEntries(
          Object.entries(s.folderOrders).map(([fid, order]) => [fid, order.filter(k => k !== `C:${id}`)])
        ),
      })),

      setCounters: (counters) => set({ counters }),

      // ── Carpetas ──────────────────────────────────────────────────────────
      addFolder: (folder) => set(s => {
        const folders = [...s.folders, folder]
        const gridOrder = folder.parentFolderId
          ? s.gridOrder
          : [...s.gridOrder, `F:${folder.id}`]
        return { folders, gridOrder }
      }),

      updateFolder: (id, patch) => set(s => ({
        folders: s.folders.map(f => f.id === id ? { ...f, ...patch } : f),
      })),

      removeFolder: (id) => set(s => {
        const childCounters = s.counters.filter(c => c.folderId === id).map(c => c.id)
        return {
          folders: s.folders.filter(f => f.id !== id),
          counters: s.counters.filter(c => c.folderId !== id),
          gridOrder: s.gridOrder.filter(k => k !== `F:${id}` && !childCounters.includes(k.replace('C:', ''))),
          folderOrders: Object.fromEntries(
            Object.entries(s.folderOrders)
              .filter(([fid]) => fid !== id)
              .map(([fid, order]) => [fid, order.filter(k => k !== `F:${id}`)])
          ),
        }
      }),

      setFolders: (folders) => set({ folders }),

      // ── Orden ─────────────────────────────────────────────────────────────
      setGridOrder: (gridOrder) => set({ gridOrder }),
      setFolderOrders: (folderOrders) => set({ folderOrders }),
      setFolderOrder: (folderId, order) => set(s => ({
        folderOrders: { ...s.folderOrders, [folderId]: order },
      })),

      moveItem: (fromIndex, toIndex) => set(s => {
        const folderId = s.currentFolderId
        if (folderId) {
          const order = [...(s.folderOrders[folderId] ?? [])]
          const [item] = order.splice(fromIndex, 1)
          order.splice(toIndex, 0, item)
          return { folderOrders: { ...s.folderOrders, [folderId]: order } }
        } else {
          const order = [...s.gridOrder]
          const [item] = order.splice(fromIndex, 1)
          order.splice(toIndex, 0, item)
          return { gridOrder: order }
        }
      }),

      // ── Helpers de acceso ─────────────────────────────────────────────────
      getCurrentItems: () => {
        const s = get()
        const folderId = s.currentFolderId
        const order = folderId ? (s.folderOrders[folderId] ?? []) : s.gridOrder

        // Construir mapa
        const counterMap = Object.fromEntries(s.counters.filter(c => c.folderId === folderId).map(c => [c.id, c]))
        const folderMap = Object.fromEntries(s.folders.filter(f => f.parentFolderId === folderId).map(f => [f.id, f]))

        const items = []
        const seen = new Set()

        for (const key of order) {
          if (key.startsWith('F:')) {
            const id = key.slice(2)
            const folder = folderMap[id]
            if (folder && !seen.has(id)) { seen.add(id); items.push({ type: 'folder', data: folder }) }
          } else if (key.startsWith('C:')) {
            const id = key.slice(2)
            const counter = counterMap[id]
            if (counter && !seen.has(id)) { seen.add(id); items.push({ type: 'counter', data: counter }) }
          }
        }
        // Añadir los que no están en el order
        for (const f of Object.values(folderMap)) {
          if (!seen.has(f.id)) { seen.add(f.id); items.push({ type: 'folder', data: f }) }
        }
        for (const c of Object.values(counterMap)) {
          if (!seen.has(c.id)) { seen.add(c.id); items.push({ type: 'counter', data: c }) }
        }
        return items
      },

      getFolderCounters: (folderId) => get().counters.filter(c => c.folderId === folderId),

      // ── Historial ─────────────────────────────────────────────────────────
      saveHistory: (description) => set(s => {
        const entry = {
          id: Date.now().toString(),
          timestamp: Date.now(),
          description,
          countersSnapshot: JSON.stringify(s.counters),
          foldersSnapshot: JSON.stringify(s.folders),
        }
        return { history: [entry, ...s.history].slice(0, 30) }
      }),

      restoreHistory: (id) => set(s => {
        const entry = s.history.find(h => h.id === id)
        if (!entry) return s
        return {
          counters: JSON.parse(entry.countersSnapshot),
          folders: JSON.parse(entry.foldersSnapshot),
        }
      }),

      removeHistory: (id) => set(s => ({
        history: s.history.filter(h => h.id !== id),
      })),

      clearHistory: () => set({ history: [] }),

      // ── Reset ──────────────────────────────────────────────────────────────
      clearData: () => set({
        counters: [], folders: [], gridOrder: [], folderOrders: {},
        currentFolderId: null, username: null, user: null,
        driveToken: null, driveTokenExpiry: 0,
      }),
    }),
    {
      name: 'countall-storage',
      // No persistir user ni driveToken (sensibles / se restauran en cada sesión)
      partialize: (s) => ({
        // Limpiar backgroundImageLocal (blob URL) — no sobrevive recargas de página
        counters: s.counters.map(c => ({ ...c, backgroundImageLocal: null })),
        folders: s.folders.map(f => ({ ...f, backgroundImageLocal: null })),
        gridOrder: s.gridOrder,
        folderOrders: s.folderOrders,
        theme: s.theme,
        username: s.username,
        history: s.history,
      }),
    }
  )
)

export default useAppStore
