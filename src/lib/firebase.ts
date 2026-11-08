import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  Firestore,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
// O projeto (La Vie ou Zulia) vem de `plataforma.json` — ver `src/lib/projetoFirebase.ts`.
import { firebaseConfig, modoPlataforma } from './projetoFirebase';

// Initialize Firebase App instance
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore with persistent local cache to drastically reduce read queries and support offline/quota fallback
let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    },
    firebaseConfig.firestoreDatabaseId || '(default)'
  );
} catch {
  // If already initialized, retrieve existing instance
  firestoreInstance = firebaseConfig.firestoreDatabaseId
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);
}

export const db = firestoreInstance;

// Firebase Authentication — login das profissionais/admin do painel
export const auth = getAuth(app);

export { firebaseConfig, modoPlataforma };
export default db;
