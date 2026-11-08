import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  Firestore,
} from 'firebase/firestore';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
// O projeto (La Vie ou Zulia) vem de `plataforma.json` — ver `src/lib/projetoFirebase.ts`.
import { firebaseConfig, modoPlataforma, usaEmuladores } from './projetoFirebase';

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

// Só para teste local (VITE_EMULADORES=1): tudo nos emuladores da máquina, nada em projeto real.
// O Storage é uma instância só por app, então ligar aqui vale para `imageStorage` e `comprovantes`.
if (usaEmuladores) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(getStorage(app), '127.0.0.1', 9199);
}

export { firebaseConfig, modoPlataforma };
export default db;
