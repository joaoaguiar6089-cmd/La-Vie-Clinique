import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  writeBatch
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Procedure, ClinicProfile } from '../types';
import { SAMPLE_PROCEDURES, DEFAULT_CLINIC_PROFILE } from '../data/initialData';

const PROCEDURES_COLLECTION = 'procedures';
const CLINIC_SETTINGS_COLLECTION = 'clinic_settings';
const CLINIC_SETTINGS_DOC_ID = 'main_profile';

/**
 * Deeply removes undefined values so Firestore never throws 'Unsupported field value: undefined'
 */
function cleanForFirestore<T extends Record<string, any>>(obj: T): T {
  const cleaned: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        cleaned[key] = cleanForFirestore(value);
      } else {
        cleaned[key] = value;
      }
    }
  }
  return cleaned;
}

/**
 * Replace all procedures in Firestore with the current official catalog from PDF.
 */
export async function replaceAllProceduresWithOfficialPdfCatalog(): Promise<void> {
  try {
    console.log('Synchronizing official PDF catalog to Firebase Firestore...');
    // 1. Delete existing procedures
    const procSnapshot = await getDocs(collection(db, PROCEDURES_COLLECTION));
    const deleteBatch = writeBatch(db);
    procSnapshot.forEach((docSnap) => {
      deleteBatch.delete(docSnap.ref);
    });
    await deleteBatch.commit();

    // 2. Insert all 34 procedures from PDF
    const insertBatch = writeBatch(db);
    for (const proc of SAMPLE_PROCEDURES) {
      const docRef = doc(db, PROCEDURES_COLLECTION, proc.id);
      insertBatch.set(docRef, cleanForFirestore({
        ...proc,
        updatedAt: new Date().toISOString(),
      }));
    }
    await insertBatch.commit();

    // 3. Update clinic profile for Dra. Karoline Ferreira
    const clinicRef = doc(db, CLINIC_SETTINGS_COLLECTION, CLINIC_SETTINGS_DOC_ID);
    await setDoc(clinicRef, cleanForFirestore({
      ...DEFAULT_CLINIC_PROFILE,
      updatedAt: new Date().toISOString(),
    }));

    console.log('Firestore replaced with official PDF procedures successfully.');
  } catch (err) {
    console.error('Error replacing procedures in Firestore:', err);
    throw err;
  }
}

/**
 * Initialize Firestore with default clinic profile and procedures if empty or outdated.
 */
export async function seedInitialDataIfEmpty(): Promise<void> {
  try {
    const procSnapshot = await getDocs(collection(db, PROCEDURES_COLLECTION));
    // If empty OR contains old template procedures (e.g. proc-1 or old length), sync with PDF catalog
    const hasOldTemplate = !procSnapshot.empty && procSnapshot.docs.some(d => d.id === 'proc-1' || d.id === 'proc-2');
    
    if (procSnapshot.empty || hasOldTemplate) {
      console.log('Seeding official PDF catalog to Firebase Firestore...');
      await replaceAllProceduresWithOfficialPdfCatalog();
    } else {
      // Ensure clinic profile exists
      const clinicRef = doc(db, CLINIC_SETTINGS_COLLECTION, CLINIC_SETTINGS_DOC_ID);
      const clinicSnap = await getDoc(clinicRef);
      if (!clinicSnap.exists()) {
        await setDoc(clinicRef, cleanForFirestore({
          ...DEFAULT_CLINIC_PROFILE,
          updatedAt: new Date().toISOString(),
        }));
      }
    }
  } catch (err) {
    console.error('Error seeding initial Firestore data:', err);
  }
}

/**
 * Subscribe to real-time procedures updates.
 */
export function subscribeToProcedures(
  onUpdate: (procedures: Procedure[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(collection(db, PROCEDURES_COLLECTION), orderBy('order', 'asc'));
  
  return onSnapshot(
    q,
    (snapshot) => {
      const items: Procedure[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ ...(docSnap.data() as Procedure), id: docSnap.id });
      });
      onUpdate(items);
    },
    (error) => {
      console.error('Firestore procedures subscription error:', error);
      if (onError) onError(error);
    }
  );
}

/**
 * Subscribe to real-time clinic profile updates.
 */
export function subscribeToClinicProfile(
  onUpdate: (clinic: ClinicProfile) => void,
  onError?: (err: Error) => void
) {
  const clinicRef = doc(db, CLINIC_SETTINGS_COLLECTION, CLINIC_SETTINGS_DOC_ID);

  return onSnapshot(
    clinicRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as ClinicProfile;
        onUpdate(data);
      }
    },
    (error) => {
      console.error('Firestore clinic profile subscription error:', error);
      if (onError) onError(error);
    }
  );
}

/**
 * Save or update a single procedure.
 */
export async function saveProcedureToDb(procedure: Procedure): Promise<void> {
  const docRef = doc(db, PROCEDURES_COLLECTION, procedure.id);
  const dataToSave = cleanForFirestore({
    ...procedure,
    updatedAt: new Date().toISOString(),
  });
  await setDoc(docRef, dataToSave, { merge: true });
}

/**
 * Delete a procedure by ID.
 */
export async function deleteProcedureFromDb(procedureId: string): Promise<void> {
  const docRef = doc(db, PROCEDURES_COLLECTION, procedureId);
  await deleteDoc(docRef);
}

/**
 * Save or update the clinic profile and clinical team settings.
 */
export async function saveClinicProfileToDb(profile: ClinicProfile): Promise<void> {
  const clinicRef = doc(db, CLINIC_SETTINGS_COLLECTION, CLINIC_SETTINGS_DOC_ID);
  const dataToSave = cleanForFirestore({
    ...profile,
    updatedAt: new Date().toISOString(),
  });
  await setDoc(clinicRef, dataToSave, { merge: true });
}

/**
 * Reorder procedures in Firestore using a batch write.
 */
export async function reorderProceduresInDb(procedures: Procedure[]): Promise<void> {
  const batch = writeBatch(db);
  procedures.forEach((proc, index) => {
    const docRef = doc(db, PROCEDURES_COLLECTION, proc.id);
    batch.update(docRef, { order: index + 1 });
  });
  await batch.commit();
}
