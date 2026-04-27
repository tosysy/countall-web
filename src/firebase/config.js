import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getDatabase } from 'firebase/database'
import { getStorage } from 'firebase/storage'

// IMPORTANTE: añadir el dominio de GitHub Pages en Firebase Console →
// Authentication → Authorized domains → añadir "tuusuario.github.io"
const firebaseConfig = {
  apiKey: 'AIzaSyAWdd6rEj-dj1SQ30mfxutgGqI3S-_CG90',
  authDomain: 'contadorapp-e8d35.firebaseapp.com',
  databaseURL: 'https://contadorapp-e8d35-default-rtdb.firebaseio.com',
  projectId: 'contadorapp-e8d35',
  storageBucket: 'contadorapp-e8d35.firebasestorage.app',
  messagingSenderId: '929445180556',
  appId: '1:929445180556:web:f9f733e04f6f456e3977a9',
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getDatabase(app)
export const storage = getStorage(app)
export default app
