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
import {
  Procedure,
  ClinicProfile,
  AnamnesisQuestion,
  AnamnesisTemplate,
  Patient,
  AnamnesisRecord,
} from '../types';
import { SAMPLE_PROCEDURES, DEFAULT_CLINIC_PROFILE } from '../data/initialData';
import {
  DEFAULT_GENERAL_QUESTIONS,
  DEFAULT_PROCEDURE_TEMPLATES,
  SAMPLE_PATIENTS,
  SAMPLE_ANAMNESIS_RECORDS,
} from '../data/anamnesisInitialData';

const PROCEDURES_COLLECTION = 'procedures';
const CLINIC_SETTINGS_COLLECTION = 'clinic_settings';
const CLINIC_SETTINGS_DOC_ID = 'main_profile';

const ANAMNESIS_GENERAL_QUESTIONS_COLLECTION = 'anamnesis_general_questions';
const ANAMNESIS_TEMPLATES_COLLECTION = 'anamnesis_templates';
const PATIENTS_COLLECTION = 'patients';
const ANAMNESIS_RECORDS_COLLECTION = 'anamnesis_records';

/**
 * Deeply removes undefined values so Firestore never throws 'Unsupported field value: undefined'
 */
function cleanForFirestore<T extends Record<string, any>>(obj: T): T {
  const cleaned: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (Array.isArray(value)) {
        cleaned[key] = value.map((item) =>
          item !== null && typeof item === 'object' && !(item instanceof Date)
            ? cleanForFirestore(item)
            : item
        );
      } else if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
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

// ==========================================
// MÓDULO DE FICHAS DE ANAMNESE — DATABASE OPERATIONS
// ==========================================

/**
 * Seed initial anamnesis data (general questions, templates, sample patients and records) if empty.
 */
export async function seedAnamnesisInitialDataIfEmpty(): Promise<void> {
  try {
    // 1. Seed General Questions if empty
    const genQSnap = await getDocs(collection(db, ANAMNESIS_GENERAL_QUESTIONS_COLLECTION));
    if (genQSnap.empty) {
      console.log('Seeding initial general questions for anamnesis...');
      const batch = writeBatch(db);
      DEFAULT_GENERAL_QUESTIONS.forEach((q) => {
        const ref = doc(db, ANAMNESIS_GENERAL_QUESTIONS_COLLECTION, q.id);
        batch.set(ref, cleanForFirestore(q));
      });
      await batch.commit();
    }

    // 2. Seed Procedure Templates if empty
    const tplSnap = await getDocs(collection(db, ANAMNESIS_TEMPLATES_COLLECTION));
    if (tplSnap.empty) {
      console.log('Seeding initial procedure templates for anamnesis...');
      const batch = writeBatch(db);
      DEFAULT_PROCEDURE_TEMPLATES.forEach((tpl) => {
        const ref = doc(db, ANAMNESIS_TEMPLATES_COLLECTION, tpl.id);
        batch.set(ref, cleanForFirestore({
          ...tpl,
          updatedAt: new Date().toISOString(),
        }));
      });
      await batch.commit();
    }

    // 3. Seed Patients if empty
    const patSnap = await getDocs(collection(db, PATIENTS_COLLECTION));
    if (patSnap.empty) {
      console.log('Seeding initial sample patients...');
      const batch = writeBatch(db);
      SAMPLE_PATIENTS.forEach((p) => {
        const ref = doc(db, PATIENTS_COLLECTION, p.id);
        batch.set(ref, cleanForFirestore(p));
      });
      await batch.commit();
    }

    // 4. Seed Anamnesis Records if empty
    const recSnap = await getDocs(collection(db, ANAMNESIS_RECORDS_COLLECTION));
    if (recSnap.empty) {
      console.log('Seeding initial sample anamnesis records...');
      const batch = writeBatch(db);
      SAMPLE_ANAMNESIS_RECORDS.forEach((r) => {
        const ref = doc(db, ANAMNESIS_RECORDS_COLLECTION, r.id);
        batch.set(ref, cleanForFirestore(r));
      });
      await batch.commit();
    }
  } catch (err) {
    console.error('Error seeding initial anamnesis data:', err);
  }
}

/**
 * Subscribe to General Questions
 */
export function subscribeToGeneralQuestions(
  onUpdate: (questions: AnamnesisQuestion[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(collection(db, ANAMNESIS_GENERAL_QUESTIONS_COLLECTION), orderBy('ordem', 'asc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: AnamnesisQuestion[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ ...(docSnap.data() as AnamnesisQuestion), id: docSnap.id });
      });
      onUpdate(items);
    },
    (error) => {
      console.error('General questions subscription error:', error);
      if (onError) onError(error);
    }
  );
}

/**
 * Save a single General Question
 */
export async function saveGeneralQuestion(question: AnamnesisQuestion): Promise<void> {
  const docRef = doc(db, ANAMNESIS_GENERAL_QUESTIONS_COLLECTION, question.id);
  await setDoc(docRef, cleanForFirestore(question), { merge: true });
}

/**
 * Save/reorder all General Questions in batch
 */
export async function saveAllGeneralQuestions(questions: AnamnesisQuestion[]): Promise<void> {
  const batch = writeBatch(db);
  questions.forEach((q, index) => {
    const docRef = doc(db, ANAMNESIS_GENERAL_QUESTIONS_COLLECTION, q.id);
    batch.set(docRef, cleanForFirestore({ ...q, ordem: index + 1 }), { merge: true });
  });
  await batch.commit();
}

/**
 * Delete a General Question
 */
export async function deleteGeneralQuestion(questionId: string): Promise<void> {
  const docRef = doc(db, ANAMNESIS_GENERAL_QUESTIONS_COLLECTION, questionId);
  await deleteDoc(docRef);
}

/**
 * Subscribe to Procedure Templates
 */
export function subscribeToAnamnesisTemplates(
  onUpdate: (templates: AnamnesisTemplate[]) => void,
  onError?: (err: Error) => void
) {
  const colRef = collection(db, ANAMNESIS_TEMPLATES_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: AnamnesisTemplate[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ ...(docSnap.data() as AnamnesisTemplate), id: docSnap.id });
      });
      // Sort alphabetically by procedure name
      items.sort((a, b) => a.procedimentoNome.localeCompare(b.procedimentoNome));
      onUpdate(items);
    },
    (error) => {
      console.error('Anamnesis templates subscription error:', error);
      if (onError) onError(error);
    }
  );
}

/**
 * Save or update a Procedure Template
 */
export async function saveAnamnesisTemplate(template: AnamnesisTemplate): Promise<void> {
  const docRef = doc(db, ANAMNESIS_TEMPLATES_COLLECTION, template.id);
  const dataToSave = cleanForFirestore({
    ...template,
    updatedAt: new Date().toISOString(),
  });
  await setDoc(docRef, dataToSave, { merge: true });
}

/**
 * Delete a Procedure Template
 */
export async function deleteAnamnesisTemplate(templateId: string): Promise<void> {
  const docRef = doc(db, ANAMNESIS_TEMPLATES_COLLECTION, templateId);
  await deleteDoc(docRef);
}

/**
 * Subscribe to Patients collection
 */
export function subscribeToPatients(
  onUpdate: (patients: Patient[]) => void,
  onError?: (err: Error) => void
) {
  const colRef = collection(db, PATIENTS_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: Patient[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ ...(docSnap.data() as Patient), id: docSnap.id });
      });
      items.sort((a, b) => a.nome.localeCompare(b.nome));
      onUpdate(items);
    },
    (error) => {
      console.error('Patients subscription error:', error);
      if (onError) onError(error);
    }
  );
}

/**
 * Save or update a Patient record
 */
export async function savePatient(patient: Patient): Promise<void> {
  const docRef = doc(db, PATIENTS_COLLECTION, patient.id);
  const dataToSave = cleanForFirestore({
    ...patient,
    updatedAt: new Date().toISOString(),
  });
  await setDoc(docRef, dataToSave, { merge: true });
}

/**
 * Delete a Patient
 */
export async function deletePatient(patientId: string): Promise<void> {
  const docRef = doc(db, PATIENTS_COLLECTION, patientId);
  await deleteDoc(docRef);
}

/**
 * Subscribe to Anamnesis Records (Consultations)
 */
export function subscribeToAnamnesisRecords(
  onUpdate: (records: AnamnesisRecord[]) => void,
  onError?: (err: Error) => void
) {
  const colRef = collection(db, ANAMNESIS_RECORDS_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: AnamnesisRecord[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ ...(docSnap.data() as AnamnesisRecord), id: docSnap.id });
      });
      // Sort newest first by dataAtendimento or createdAt
      items.sort((a, b) => new Date(b.dataAtendimento || b.createdAt).getTime() - new Date(a.dataAtendimento || a.createdAt).getTime());
      onUpdate(items);
    },
    (error) => {
      console.error('Anamnesis records subscription error:', error);
      if (onError) onError(error);
    }
  );
}

/**
 * Save or update an Anamnesis Record
 */
export async function saveAnamnesisRecord(record: AnamnesisRecord): Promise<void> {
  const docRef = doc(db, ANAMNESIS_RECORDS_COLLECTION, record.id);
  const dataToSave = cleanForFirestore({
    ...record,
    updatedAt: new Date().toISOString(),
  });
  await setDoc(docRef, dataToSave, { merge: true });
}

/**
 * Delete an Anamnesis Record
 */
export async function deleteAnamnesisRecord(recordId: string): Promise<void> {
  const docRef = doc(db, ANAMNESIS_RECORDS_COLLECTION, recordId);
  await deleteDoc(docRef);
}

