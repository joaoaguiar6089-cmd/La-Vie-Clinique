import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
  writeBatch,
  runTransaction,
  QuerySnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { subscribeShared } from './sharedSubscription';
import {
  Procedure,
  ClinicProfile,
  AnamnesisQuestion,
  AnamnesisTemplate,
  Patient,
  AnamnesisRecord,
  Quote,
  QuoteDraft,
  QuoteStoredStatus,
} from '../types';
import { formatQuoteNumber } from '../utils/quoteCalc';
import { clonarItens, normalizarQuote } from '../utils/quoteFactory';
import { SAMPLE_PROCEDURES, DEFAULT_CLINIC_PROFILE } from '../data/initialData';
import { estimateFirestoreDocBytes, FIRESTORE_DOC_SAFE_BYTES } from '../utils/imageCompressor';
import {
  DEFAULT_GENERAL_QUESTIONS,
  DEFAULT_PROCEDURE_TEMPLATES,
  SAMPLE_PATIENTS,
  SAMPLE_ANAMNESIS_RECORDS,
  LASER_HEALTH_QUESTIONS,
} from '../data/anamnesisInitialData';
import { isLaserCategory } from '../utils/templateMatching';

const PROCEDURES_COLLECTION = 'procedures';
const CLINIC_SETTINGS_COLLECTION = 'clinic_settings';
const CLINIC_SETTINGS_DOC_ID = 'main_profile';
// Espelho público do perfil da clínica. O documento principal guarda os vínculos de login
// (e-mail/uid/isAdmin) de cada profissional e por isso exige autenticação — mas a paciente que
// abre o link da ficha não tem login, e sem nome/telefone/endereço a página não tem como se
// identificar nem gerar o botão de WhatsApp. Este documento carrega só o que é publicável.
const CLINIC_PUBLIC_PROFILE_DOC_ID = 'public_profile';

const ANAMNESIS_GENERAL_QUESTIONS_COLLECTION = 'anamnesis_general_questions';
const ANAMNESIS_TEMPLATES_COLLECTION = 'anamnesis_templates';
const PATIENTS_COLLECTION = 'patients';
const ANAMNESIS_RECORDS_COLLECTION = 'anamnesis_records';

const QUOTES_COLLECTION = 'quotes';
const COUNTERS_COLLECTION = 'counters';

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
 * Tempo máximo que esperamos o servidor confirmar uma gravação antes de admitir que ela não foi
 * gravada.
 */
const SERVER_ACK_TIMEOUT_MS = 20000;

/**
 * Espera a confirmação do SERVIDOR para uma gravação, com prazo.
 *
 * O SDK do Firestore aplica toda escrita no cache local antes de falar com o servidor. Quando o
 * servidor recusa — cota diária do projeto esgotada é o caso mais comum aqui — o SDK trata o erro
 * como temporário e deixa a escrita na fila: a promise do `setDoc` simplesmente nunca resolve.
 * Para quem está na tela isso é indistinguível de ter salvo, porque o valor novo aparece na hora e
 * só some quando o listener ressincroniza (ou no próximo F5). Este prazo transforma esse silêncio
 * numa mensagem que diz o que aconteceu e o que fazer.
 */
async function comConfirmacaoDoServidor<T>(gravacao: Promise<T>, oQue: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `O servidor não confirmou o salvamento ${oQue} em ${SERVER_ACK_TIMEOUT_MS / 1000} ` +
              `segundos, então a alteração pode não ter sido gravada — recarregue a página para ` +
              `conferir. Verifique a conexão; se a internet estiver boa, é quase certo que a cota ` +
              `diária gratuita do banco de dados (Firebase) se esgotou, e ela se renova sozinha no ` +
              `começo do dia.`
          )
        ),
      SERVER_ACK_TIMEOUT_MS
    );
  });

  try {
    return await Promise.race([gravacao, prazo]);
  } catch (err) {
    // Quando o servidor responde a recusa em vez de engolir a escrita, o motivo vem no código.
    if ((err as { code?: string })?.code === 'resource-exhausted') {
      throw new Error(
        `A cota diária gratuita do banco de dados (Firebase) se esgotou, então o salvamento ` +
          `${oQue} foi recusado. A cota se renova sozinha no começo do dia.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
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
    // Ler a coleção inteira só para perguntar "está vazia?" custava uma leitura por procedimento,
    // toda vez que o app abria — e logo depois a assinatura em tempo real lia tudo de novo. Um
    // `limit(1)` responde a mesma pergunta por 1 leitura, e os dois procedimentos legados são
    // consultados pelo ID em vez de varridos.
    const primeiroProc = await getDocs(query(collection(db, PROCEDURES_COLLECTION), limit(1)));
    const colecaoVazia = primeiroProc.empty;

    const [proc1, proc2] = colecaoVazia
      ? [null, null]
      : await Promise.all([
          getDoc(doc(db, PROCEDURES_COLLECTION, 'proc-1')),
          getDoc(doc(db, PROCEDURES_COLLECTION, 'proc-2')),
        ]);
    const hasOldTemplate = !!proc1?.exists() || !!proc2?.exists();

    if (colecaoVazia || hasOldTemplate) {
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
 *
 * Fotos enviadas pelo formulário viram base64 e ficam dentro do próprio documento. Se o conjunto
 * passar do teto de 1MB do Firestore, o `setDoc` falha — mas só *depois* que o cache local já
 * aplicou a alteração, então a tela mostra a foto nova e ela some minutos depois, quando o
 * listener volta a sincronizar com o servidor. Barrar aqui, com uma mensagem que diz o que fazer,
 * troca esse "salvou e desfez sozinho" por um erro imediato e acionável.
 */
export async function saveProcedureToDb(procedure: Procedure): Promise<void> {
  const docRef = doc(db, PROCEDURES_COLLECTION, procedure.id);
  const dataToSave = cleanForFirestore({
    ...procedure,
    updatedAt: new Date().toISOString(),
  });

  const bytes = estimateFirestoreDocBytes(dataToSave);
  if (bytes > FIRESTORE_DOC_SAFE_BYTES) {
    throw new Error(
      `As imagens deste procedimento somam ${(bytes / 1024 / 1024).toFixed(2)} MB e ultrapassam o ` +
        `limite de 1 MB por procedimento. Remova alguma foto (ou use um link de imagem em vez do ` +
        `upload) e salve novamente.`
    );
  }

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
 * Reduz o perfil da clínica ao que pode ser lido sem login: identidade visual, contato e a
 * equipe apenas com os dados que já saem impressos na ficha. E-mail de login, UID do Firebase
 * Auth e a flag de admin ficam de fora — eles são exatamente o motivo de o documento principal
 * ser fechado.
 */
function toPublicClinicProfile(profile: ClinicProfile): Partial<ClinicProfile> {
  return {
    name: profile.name,
    tagline: profile.tagline,
    professionalName: profile.professionalName,
    professionalTitle: profile.professionalTitle,
    registryNumber: profile.registryNumber,
    phone: profile.phone,
    instagram: profile.instagram,
    address: profile.address,
    cityState: profile.cityState,
    logoUrl: profile.logoUrl,
    professionals: (profile.professionals || []).map((p) => ({
      id: p.id,
      name: p.name,
      registryNumber: p.registryNumber,
      title: p.title,
      specialty: p.specialty,
      photoUrl: p.photoUrl,
    })),
  };
}

/**
 * Save or update the clinic profile and clinical team settings.
 *
 * Grava também o espelho público usado pelas páginas sem login (ficha de anamnese da paciente).
 * A falha do espelho não derruba o salvamento principal: perder a marca na página pública é um
 * problema menor do que perder a edição do perfil.
 */
export async function saveClinicProfileToDb(profile: ClinicProfile): Promise<void> {
  const clinicRef = doc(db, CLINIC_SETTINGS_COLLECTION, CLINIC_SETTINGS_DOC_ID);
  const dataToSave = cleanForFirestore({
    ...profile,
    updatedAt: new Date().toISOString(),
  });
  await setDoc(clinicRef, dataToSave, { merge: true });

  try {
    await publishPublicClinicProfile(profile);
  } catch (err) {
    console.warn('Perfil salvo, mas o espelho público da clínica não pôde ser atualizado:', err);
  }
}

/** Escreve (ou reescreve) o espelho público do perfil da clínica. */
export async function publishPublicClinicProfile(profile: ClinicProfile): Promise<void> {
  const publicRef = doc(db, CLINIC_SETTINGS_COLLECTION, CLINIC_PUBLIC_PROFILE_DOC_ID);
  await setDoc(
    publicRef,
    cleanForFirestore({
      ...toPublicClinicProfile(profile),
      updatedAt: new Date().toISOString(),
    }),
    { merge: false } // sem merge: um profissional removido da equipe precisa sumir daqui também
  );
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
/**
 * Marca, no navegador, que a sincronização única das fichas de laser já rodou. Ela precisa ler a
 * coleção inteira de fichas-modelo para comparar com o padrão, e reler tudo isso a cada abertura
 * do app era o maior desperdício de leituras do sistema. A marca é por navegador: no pior caso a
 * sincronização roda uma vez em cada máquina, em vez de sempre.
 */
const LASER_SYNC_DONE_KEY = 'lavie:laser-templates-sync:v1';

function laserSyncJaRodou(): boolean {
  try {
    return localStorage.getItem(LASER_SYNC_DONE_KEY) === '1';
  } catch {
    return false;
  }
}

function marcarLaserSyncComoFeito(): void {
  try {
    localStorage.setItem(LASER_SYNC_DONE_KEY, '1');
  } catch {
    // Navegador sem localStorage (aba anônima com storage bloqueado): a sincronização volta a
    // rodar, que é o comportamento antigo — correto, só mais caro.
  }
}

export async function seedAnamnesisInitialDataIfEmpty(): Promise<void> {
  try {
    // 1. Seed General Questions if empty — `limit(1)` responde "está vazia?" por 1 leitura,
    //    em vez de uma por pergunta cadastrada.
    const genQSnap = await getDocs(
      query(collection(db, ANAMNESIS_GENERAL_QUESTIONS_COLLECTION), limit(1))
    );
    if (genQSnap.empty) {
      console.log('Seeding initial general questions for anamnesis...');
      const batch = writeBatch(db);
      DEFAULT_GENERAL_QUESTIONS.forEach((q) => {
        const ref = doc(db, ANAMNESIS_GENERAL_QUESTIONS_COLLECTION, q.id);
        batch.set(ref, cleanForFirestore(q));
      });
      await batch.commit();
    }

    // 2. Seed Procedure Templates if empty, or sync laser templates if missing
    const primeiroTpl = await getDocs(query(collection(db, ANAMNESIS_TEMPLATES_COLLECTION), limit(1)));
    if (primeiroTpl.empty) {
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
    } else if (!laserSyncJaRodou()) {
      // Sincroniza fichas das categorias Depilação a Laser (Facial, Íntima e Corporal) e suas 13
      // perguntas. Só aqui a coleção inteira é lida — e só na primeira vez em cada navegador.
      const tplSnap = await getDocs(collection(db, ANAMNESIS_TEMPLATES_COLLECTION));
      await syncLaserAnamnesisTemplates(tplSnap);
      marcarLaserSyncComoFeito();
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
 * Garante que todas as fichas de Depilação a Laser (Facial, Íntima e Corporal)
 * existam no Firestore e contenham as 13 perguntas de saúde obrigatórias.
 */
async function syncLaserAnamnesisTemplates(tplSnap: QuerySnapshot): Promise<void> {
  try {
    const existingTemplates: AnamnesisTemplate[] = [];
    tplSnap.forEach((docSnap) => {
      existingTemplates.push({ ...(docSnap.data() as AnamnesisTemplate), id: docSnap.id });
    });

    const laserTemplatesToEnsure = DEFAULT_PROCEDURE_TEMPLATES.filter(
      (tpl) =>
        isLaserCategory(tpl.categoria) ||
        tpl.id.startsWith('tpl-laser-') ||
        tpl.id === 'tpl-epilacao-laser'
    );

    const batch = writeBatch(db);
    let hasChanges = false;

    for (const tplDefault of laserTemplatesToEnsure) {
      const existing = existingTemplates.find(
        (t) =>
          t.id === tplDefault.id ||
          (t.procedimentoId && t.procedimentoId === tplDefault.procedimentoId) ||
          t.procedimentoNome.toLowerCase() === tplDefault.procedimentoNome.toLowerCase()
      );

      if (!existing) {
        const ref = doc(db, ANAMNESIS_TEMPLATES_COLLECTION, tplDefault.id);
        batch.set(
          ref,
          cleanForFirestore({
            ...tplDefault,
            updatedAt: new Date().toISOString(),
          })
        );
        hasChanges = true;
      } else {
        const currentQuestions = existing.perguntasEspecificas || [];
        const requiredQuestions = tplDefault.perguntasEspecificas || [];
        const missingQuestions = requiredQuestions.filter((reqQ) => {
          const jaExiste = currentQuestions.some(
            (cq) =>
              cq.id === reqQ.id ||
              cq.texto.trim().toLowerCase() === reqQ.texto.trim().toLowerCase()
          );
          return !jaExiste;
        });

        if (missingQuestions.length > 0) {
          const updatedQuestions = [...currentQuestions, ...missingQuestions].map((q, idx) => ({
            ...q,
            ordem: idx + 1,
          }));

          const ref = doc(db, ANAMNESIS_TEMPLATES_COLLECTION, existing.id);
          batch.update(ref, {
            perguntasEspecificas: cleanForFirestore(updatedQuestions),
            updatedAt: new Date().toISOString(),
          });
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      console.log('Fichas e perguntas de Depilação a Laser sincronizadas com sucesso no Firestore.');
      await batch.commit();
    }
  } catch (err) {
    console.warn('Sincronização de fichas de laser no Firestore:', err);
  }
}

/**
 * Subscribe to General Questions
 */
function subscribeToGeneralQuestionsDireto(
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
 * Assinatura compartilhada de `anamnesis_general_questions`: uma única por sessão, viva entre idas e vindas de aba.
 * Ver `sharedSubscription.ts` — antes, cada montagem do módulo pagava um snapshot inteiro.
 */
export function subscribeToGeneralQuestions(
  onUpdate: (data: AnamnesisQuestion[]) => void,
  onError?: (err: Error) => void
) {
  return subscribeShared<AnamnesisQuestion[]>('anamnesis_general_questions', subscribeToGeneralQuestionsDireto, onUpdate, onError);
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
 *
 * Uma ficha-modelo pode carregar três imagens em base64 dentro do próprio documento (referência
 * feminina, referência masculina e a imagem orientativa do paciente). Juntas elas chegam perto do
 * teto de 1MB do Firestore, e um `setDoc` que estoura esse limite falha *depois* de o cache local
 * já ter aplicado a alteração — a tela mostra a imagem nova e ela some quando o listener
 * ressincroniza. Barrar aqui troca esse "salvou e desfez sozinho" por um erro imediato.
 */
export async function saveAnamnesisTemplate(template: AnamnesisTemplate): Promise<void> {
  const docRef = doc(db, ANAMNESIS_TEMPLATES_COLLECTION, template.id);
  const dataToSave = cleanForFirestore({
    ...template,
    updatedAt: new Date().toISOString(),
  });

  const bytes = estimateFirestoreDocBytes(dataToSave);
  if (bytes > FIRESTORE_DOC_SAFE_BYTES) {
    throw new Error(
      `As imagens desta ficha-modelo somam ${(bytes / 1024 / 1024).toFixed(2)} MB e ultrapassam o ` +
        `limite de 1 MB por ficha. Remova uma das imagens (ou use um link de imagem em vez do ` +
        `upload) e salve novamente.`
    );
  }

  await comConfirmacaoDoServidor(setDoc(docRef, dataToSave, { merge: true }), 'da ficha-modelo');
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
function subscribeToPatientsDireto(
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
 * Assinatura compartilhada de `patients`: uma única por sessão, viva entre idas e vindas de aba.
 * Ver `sharedSubscription.ts` — antes, cada montagem do módulo pagava um snapshot inteiro.
 */
export function subscribeToPatients(
  onUpdate: (data: Patient[]) => void,
  onError?: (err: Error) => void
) {
  return subscribeShared<Patient[]>('patients', subscribeToPatientsDireto, onUpdate, onError);
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
function subscribeToAnamnesisRecordsDireto(
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
 * Assinatura compartilhada de `anamnesis_records`: uma única por sessão, viva entre idas e vindas de aba.
 * Ver `sharedSubscription.ts` — antes, cada montagem do módulo pagava um snapshot inteiro.
 */
export function subscribeToAnamnesisRecords(
  onUpdate: (data: AnamnesisRecord[]) => void,
  onError?: (err: Error) => void
) {
  return subscribeShared<AnamnesisRecord[]>('anamnesis_records', subscribeToAnamnesisRecordsDireto, onUpdate, onError);
}

/**
 * Save or update an Anamnesis Record
 */
export async function saveAnamnesisRecord(record: AnamnesisRecord): Promise<void> {
  const docRef = doc(db, ANAMNESIS_RECORDS_COLLECTION, record.id);
  const dataToSave: Record<string, any> = cleanForFirestore({
    ...record,
    updatedAt: new Date().toISOString(),
  });
  // `fotoUrl` is a legacy mirror of `fotoPacienteUrl` kept only for records saved before that field
  // existed. Once `fotoPacienteUrl` is set we don't need a second copy of the same base64 photo —
  // every read site already falls back to `fotoUrl` — and keeping both wastes precious room inside
  // Firestore's 1MB per-document limit, which photos (and their annotated versions) can hit fast.
  // `merge: true` only adds/overwrites keys present in the payload, so omitting the key would leave
  // any previously-stored `fotoUrl` in place; `deleteField()` is required to actually reclaim it.
  if (record.fotoPacienteUrl) {
    dataToSave.fotoUrl = deleteField();
  }
  await comConfirmacaoDoServidor(setDoc(docRef, dataToSave, { merge: true }), 'da ficha');
}

/**
 * Delete an Anamnesis Record
 */
export async function deleteAnamnesisRecord(recordId: string): Promise<void> {
  const docRef = doc(db, ANAMNESIS_RECORDS_COLLECTION, recordId);
  await deleteDoc(docRef);
}

// ==========================================
// ONE-TIME FETCHES — usados pela página pública de preenchimento (sem login),
// que não deve assinar coleções inteiras em tempo real.
// ==========================================

/**
 * Fetch a single Anamnesis Template by ID (one-time).
 */
export async function getAnamnesisTemplateById(templateId: string): Promise<AnamnesisTemplate | null> {
  const docRef = doc(db, ANAMNESIS_TEMPLATES_COLLECTION, templateId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { ...(snap.data() as AnamnesisTemplate), id: snap.id };
}

/**
 * Fetch a single Patient by ID (one-time).
 */
export async function getPatientById(patientId: string): Promise<Patient | null> {
  const docRef = doc(db, PATIENTS_COLLECTION, patientId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { ...(snap.data() as Patient), id: snap.id };
}

/**
 * Fetch a single Anamnesis Record by ID (one-time).
 */
export async function getAnamnesisRecordById(recordId: string): Promise<AnamnesisRecord | null> {
  const docRef = doc(db, ANAMNESIS_RECORDS_COLLECTION, recordId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { ...(snap.data() as AnamnesisRecord), id: snap.id };
}

/**
 * Fetch all Anamnesis Records for a given patient (one-time, unordered — sort client-side).
 * Used to find/prefill a patient's most recent record and to detect an existing record
 * for a given template so the same public link can be reopened to keep editing.
 */
export async function getRecordsForPatient(patientId: string): Promise<AnamnesisRecord[]> {
  const q = query(collection(db, ANAMNESIS_RECORDS_COLLECTION), where('pacienteId', '==', patientId));
  const snap = await getDocs(q);
  const items: AnamnesisRecord[] = [];
  snap.forEach((docSnap) => {
    items.push({ ...(docSnap.data() as AnamnesisRecord), id: docSnap.id });
  });
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return items;
}

/**
 * Fetch General Questions once (no live subscription) — used by the public form page.
 */
export async function getGeneralQuestionsOnce(): Promise<AnamnesisQuestion[]> {
  const q = query(collection(db, ANAMNESIS_GENERAL_QUESTIONS_COLLECTION), orderBy('ordem', 'asc'));
  const snap = await getDocs(q);
  const items: AnamnesisQuestion[] = [];
  snap.forEach((docSnap) => {
    items.push({ ...(docSnap.data() as AnamnesisQuestion), id: docSnap.id });
  });
  return items;
}

/**
 * Fetch the Clinic Profile once (no live subscription) — used by the public form page.
 *
 * Tenta primeiro o espelho público (legível sem login) e só então o documento principal, que
 * funciona quando quem chama é a equipe autenticada. Nunca lança: a marca da clínica é enfeite
 * na página da paciente, e uma leitura negada pelas regras não pode impedir a ficha de abrir —
 * era justamente isso que deixava o link público preso em "Carregando...".
 */
export async function getClinicProfileOnce(): Promise<ClinicProfile | null> {
  try {
    const publicSnap = await getDoc(doc(db, CLINIC_SETTINGS_COLLECTION, CLINIC_PUBLIC_PROFILE_DOC_ID));
    if (publicSnap.exists()) return publicSnap.data() as ClinicProfile;
  } catch (err) {
    console.warn('Espelho público do perfil da clínica indisponível:', err);
  }

  try {
    const snap = await getDoc(doc(db, CLINIC_SETTINGS_COLLECTION, CLINIC_SETTINGS_DOC_ID));
    if (snap.exists()) return snap.data() as ClinicProfile;
  } catch (err) {
    console.warn('Perfil da clínica não pôde ser lido (esperado sem login):', err);
  }

  return null;
}

// ==========================================
// ORÇAMENTOS
// ==========================================

/**
 * Subscribe to Quotes collection (mais recentes primeiro).
 */
export function subscribeToQuotes(
  onUpdate: (quotes: Quote[]) => void,
  onError?: (err: Error) => void
) {
  const colRef = collection(db, QUOTES_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: Quote[] = [];
      snapshot.forEach((docSnap) => {
        items.push(normalizarQuote({ ...(docSnap.data() as Quote), id: docSnap.id }));
      });
      items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      onUpdate(items);
    },
    (error) => {
      console.error('Quotes subscription error:', error);
      if (onError) onError(error);
    }
  );
}

/**
 * Cria o orçamento e reserva o número na mesma transação: se a gravação falhar,
 * a sequência não avança e nenhum número fica queimado. A sequência reinicia a
 * cada ano, e o ID é aleatório porque é ele que torna o link público secreto.
 */
export async function createQuote(draft: QuoteDraft): Promise<Quote> {
  const emissao = new Date(draft.dataEmissao);
  const ano = isNaN(emissao.getTime()) ? new Date().getFullYear() : emissao.getFullYear();
  const counterRef = doc(db, COUNTERS_COLLECTION, `quotes_${ano}`);
  const id = crypto.randomUUID();
  const quoteRef = doc(db, QUOTES_COLLECTION, id);

  return await runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const ultimo = counterSnap.exists() ? Number(counterSnap.data().ultimo) || 0 : 0;
    const sequencia = ultimo + 1;

    const quote: Quote = {
      ...draft,
      id,
      numero: formatQuoteNumber(ano, sequencia),
      ano,
      sequencia,
      status: 'rascunho',
      createdAt: new Date().toISOString(),
    };

    tx.set(counterRef, { ultimo: sequencia }, { merge: true });
    tx.set(quoteRef, cleanForFirestore(quote));
    return quote;
  });
}

/**
 * Atualiza um orçamento existente. Só faz sentido em rascunho — depois de enviado
 * a interface bloqueia a edição e o caminho passa a ser a substituição.
 */
export async function updateQuote(quote: Quote, draft: QuoteDraft): Promise<Quote> {
  const atualizado: Quote = { ...quote, ...draft, updatedAt: new Date().toISOString() };
  const docRef = doc(db, QUOTES_COLLECTION, quote.id);
  // setDoc sem merge: campos removidos (desconto desmarcado, item excluído) precisam sumir
  await setDoc(docRef, cleanForFirestore(atualizado));
  return atualizado;
}

/** Marca o orçamento como enviado na primeira vez que o link é compartilhado. */
export async function markQuoteAsSent(quoteId: string): Promise<void> {
  const docRef = doc(db, QUOTES_COLLECTION, quoteId);
  await updateDoc(docRef, {
    status: 'enviado' as QuoteStoredStatus,
    enviadoEm: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

/** Troca manual de status na listagem (marcar como aceito, voltar para enviado). */
export async function setQuoteStatus(quoteId: string, status: QuoteStoredStatus): Promise<void> {
  const docRef = doc(db, QUOTES_COLLECTION, quoteId);
  await updateDoc(docRef, { status, updatedAt: new Date().toISOString() });
}

/** Exclusão de rascunho ou orçamento cancelado. */
export async function deleteQuote(quoteId: string): Promise<void> {
  await deleteDoc(doc(db, QUOTES_COLLECTION, quoteId));
}

/**
 * Substitui um orçamento: cria um novo com número próprio e liga os dois. O antigo
 * continua existindo — o link que a paciente já tem passa a apontar para o novo.
 */
export async function replaceQuote(
  anterior: Quote,
  draft: QuoteDraft
): Promise<Quote> {
  const novo = await createQuote({ ...draft, itens: clonarItens(draft.itens) });

  const novoComVinculo: Quote = {
    ...novo,
    substituiu: { id: anterior.id, numero: anterior.numero },
  };

  const batch = writeBatch(db);
  batch.update(doc(db, QUOTES_COLLECTION, novo.id), {
    substituiu: { id: anterior.id, numero: anterior.numero },
  });
  batch.update(doc(db, QUOTES_COLLECTION, anterior.id), {
    substituidoPor: { id: novo.id, numero: novo.numero },
    updatedAt: new Date().toISOString(),
  });
  await batch.commit();

  return novoComVinculo;
}

/** Busca um orçamento pelo ID — usado pela página pública do link. */
export async function getQuoteById(quoteId: string): Promise<Quote | null> {
  const snap = await getDoc(doc(db, QUOTES_COLLECTION, quoteId));
  if (!snap.exists()) return null;
  return normalizarQuote({ ...(snap.data() as Quote), id: snap.id });
}

