import {
  collection,
  doc,
  getDocs,
  getDocsFromServer,
  getDoc,
  getDocFromServer,
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
import { downscaleDataUrl, estimateFirestoreDocBytes, FIRESTORE_DOC_SAFE_BYTES } from '../utils/imageCompressor';
import { subirImagemOuManter } from './imageStorage';
import {
  DEFAULT_GENERAL_QUESTIONS,
  DEFAULT_PROCEDURE_TEMPLATES,
  SAMPLE_PATIENTS,
  SAMPLE_ANAMNESIS_RECORDS,
  LASER_HEALTH_QUESTIONS,
  PERGUNTAS_PROFISSIONAL_GLUTEO,
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

let quotaExhaustedSession = false;

/**
 * Detecta se o erro decorre do esgotamento da cota diária gratuita do Firestore
 * (ex: 'Free daily read units per project (free tier database)') ou cliente offline.
 */
export function isQuotaOrOfflineError(error: unknown): boolean {
  if (!error) return false;
  const msg = (error as { message?: string }).message || String(error);
  const code = (error as { code?: string }).code;
  const isQuota = (
    code === 'resource-exhausted' ||
    msg.toLowerCase().includes('quota') ||
    msg.toLowerCase().includes('resource_exhausted') ||
    msg.toLowerCase().includes('offline')
  );
  if (isQuota) {
    quotaExhaustedSession = true;
  }
  return isQuota;
}

/**
 * Responde "esta coleção está vazia?" com uma leitura confirmada pelo SERVIDOR, ou `null` quando
 * não foi possível confirmar.
 *
 * Por que não dá para usar `getDocs` aqui: o app roda com `persistentLocalCache`, e nesse modo
 * uma leitura feita offline NÃO falha — ela é resolvida pelo cache. Num navegador de cache frio
 * (primeira visita, dados do site limpos, aba anônima) o resultado é um snapshot vazio
 * indistinguível de uma coleção realmente vazia. Quem chama usa essa resposta para decidir se
 * popula a coleção com os dados padrão, o que sobrescreve o que a clínica editou; e como o SDK
 * enfileira escritas feitas offline, o estrago só aparecia no servidor minutos depois, quando a
 * conexão voltava. Semear é destrutivo: na dúvida (`null`), não se escreve nada.
 */
async function colecaoVaziaNoServidor(nomeColecao: string): Promise<boolean | null> {
  try {
    const snap = await getDocsFromServer(query(collection(db, nomeColecao), limit(1)));
    return snap.empty;
  } catch (err) {
    // 'unavailable' é o código que o SDK usa quando a leitura forçada no servidor não sai por
    // falta de rede — esperado, e exatamente o caso que esta função existe para detectar.
    const semRede = (err as { code?: string })?.code === 'unavailable';
    if (semRede || isQuotaOrOfflineError(err)) {
      console.warn(`Sem confirmação do servidor sobre "${nomeColecao}" — carga inicial adiada.`);
    } else {
      console.error(`Erro ao consultar "${nomeColecao}" no servidor; carga inicial adiada:`, err);
    }
    return null;
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
    if (isQuotaOrOfflineError(err)) {
      console.warn('Error replacing procedures in Firestore (quota/offline):', err);
    } else {
      console.error('Error replacing procedures in Firestore:', err);
    }
    throw err;
  }
}

/**
 * Initialize Firestore with default clinic profile and procedures if empty or outdated.
 */
export async function seedInitialDataIfEmpty(): Promise<void> {
  if (quotaExhaustedSession) return;

  // Só uma leitura confirmada pelo servidor autoriza escrever aqui — ver colecaoVaziaNoServidor.
  const colecaoVazia = await colecaoVaziaNoServidor(PROCEDURES_COLLECTION);
  if (colecaoVazia === null) return;

  try {
    const [proc1, proc2] = colecaoVazia
      ? [null, null]
      : await Promise.all([
          getDocFromServer(doc(db, PROCEDURES_COLLECTION, 'proc-1')),
          getDocFromServer(doc(db, PROCEDURES_COLLECTION, 'proc-2')),
        ]);
    const hasOldTemplate = !!proc1?.exists() || !!proc2?.exists();

    if (colecaoVazia) {
      console.log('Seeding official PDF catalog to Firebase Firestore...');
      await replaceAllProceduresWithOfficialPdfCatalog();
    } else {
      // Se houver algum procedimento de teste legado, remove individualmente sem apagar as alterações do usuário
      if (hasOldTemplate) {
        if (proc1?.exists()) await deleteDoc(doc(db, PROCEDURES_COLLECTION, 'proc-1')).catch(() => {});
        if (proc2?.exists()) await deleteDoc(doc(db, PROCEDURES_COLLECTION, 'proc-2')).catch(() => {});
      }

      // Ensure clinic profile exists and has official doctor photo. A leitura precisa vir do
      // servidor: o setDoc abaixo grava o perfil padrão por cima, e um "não existe" vindo de um
      // cache frio apagaria nome, contato e equipe da clínica.
      const clinicRef = doc(db, CLINIC_SETTINGS_COLLECTION, CLINIC_SETTINGS_DOC_ID);
      const clinicSnap = await getDocFromServer(clinicRef);
      if (!clinicSnap.exists()) {
        await setDoc(clinicRef, cleanForFirestore({
          ...DEFAULT_CLINIC_PROFILE,
          updatedAt: new Date().toISOString(),
        }));
      } else {
        const existingData = clinicSnap.data() as ClinicProfile;
        const needsPhoto = (existingData.professionals || []).some(
          (p) => (!p.photoUrl || p.photoUrl.trim() === '') && (p.id === 'doc-karoline' || p.name.toLowerCase().includes('karoline'))
        ) || !existingData.professionals || existingData.professionals.length === 0;

        if (needsPhoto) {
          const updatedProfessionals = (existingData.professionals && existingData.professionals.length > 0)
            ? existingData.professionals.map((p) => {
                if (
                  (!p.photoUrl || p.photoUrl.trim() === '') &&
                  (p.id === 'doc-karoline' || p.name.toLowerCase().includes('karoline'))
                ) {
                  return { ...p, photoUrl: '/dra-karoline.jpg' };
                }
                return p;
              })
            : DEFAULT_CLINIC_PROFILE.professionals;

          await setDoc(clinicRef, cleanForFirestore({
            ...existingData,
            professionals: updatedProfessionals,
            updatedAt: new Date().toISOString(),
          }), { merge: true });
        }
      }
    }
  } catch (err) {
    if (isQuotaOrOfflineError(err)) {
      console.warn('Firestore offline/cota diária atingida durante checagem de procedimentos iniciais.');
    } else {
      console.error('Error seeding initial Firestore data:', err);
    }
  }
}

/**
 * Normaliza qualquer variação antiga das categorias de depilação a laser
 * (Facial, Íntima e Corporal) para a categoria única e unificada: "Depilação a Laser".
 */
export function normalizeLaserCategory(category?: string): string {
  if (!category) return '';
  const trimmed = category.trim();
  if (
    trimmed === 'Depilação a Laser - Facial' ||
    trimmed === 'Depilação a Laser - Íntima' ||
    trimmed === 'Depilação a Laser - Corporal' ||
    trimmed === 'Depilação a Laser - Intima'
  ) {
    return 'Depilação a Laser';
  }
  return trimmed;
}

/**
 * Prepara para exibição a lista de procedimentos vinda do Firestore (ou do cache local):
 * unifica as categorias antigas de depilação a laser e ordena por `order`.
 *
 * Esta função também reinseria, na lista, todo procedimento do catálogo oficial que não estivesse
 * nela — e uma rotina irmã regravava esses "ausentes" no Firestore. A intenção era proteger contra
 * uma sincronização parcial, mas o efeito prático era desfazer exclusões: a lista de excluídos
 * vivia só no localStorage de cada navegador, então qualquer outro aparelho (ou o mesmo depois de
 * limpar os dados do site) via o procedimento como "faltando" e o recriava no banco para todo
 * mundo. O Firestore é a fonte da verdade: o que não está lá não aparece e não volta. O catálogo
 * oficial só é gravado quando a coleção está comprovadamente vazia ou quando a clínica pede
 * "Restaurar catálogo oficial".
 */
export function normalizeProcedureList(procedures: Procedure[]): Procedure[] {
  return procedures
    .map((proc) => ({ ...proc, category: normalizeLaserCategory(proc.category) }))
    .sort((a, b) => (a.order || 99) - (b.order || 99));
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
        const proc = { ...(docSnap.data() as Procedure), id: docSnap.id };
        // Normaliza apenas para exibir. Gravar de volta daqui era uma gravação disparada pela
        // *chegada* do dado, e não por uma ação de alguém: toda máquina que abrisse o app
        // reescrevia os mesmos documentos, e um `category` ausente (`undefined` virando `''`) gerava
        // uma gravação por procedimento, todo dia, em cada navegador. O valor antigo no banco não
        // incomoda ninguém — a tela já mostra a categoria unificada, e o próximo salvamento do
        // procedimento grava a forma normalizada junto com o resto.
        proc.category = normalizeLaserCategory(proc.category);
        items.push(proc);
      });
      onUpdate(items);
    },
    (error) => {
      if (isQuotaOrOfflineError(error)) {
        console.warn('Firestore procedures subscription offline/cota diária atingida.');
      } else {
        console.error('Firestore procedures subscription error:', error);
      }
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
      if (isQuotaOrOfflineError(error)) {
        console.warn('Firestore clinic profile subscription offline/cota diária atingida.');
      } else {
        console.error('Firestore clinic profile subscription error:', error);
      }
      if (onError) onError(error);
    }
  );
}

/**
 * Save or update a single procedure.
 *
 * Envia as fotos do procedimento para o Firebase Storage para que fiquem guardadas como URLs leves
 * em vez de base64 pesadas dentro do documento do Firestore. Caso o Storage esteja indisponível,
 * as imagens recebem compressão client-side garantindo que o documento permaneça seguro (< 250 KB)
 * e abaixo do teto de 1 MB do Firestore. Além disso, utiliza comConfirmacaoDoServidor para assegurar
 * que o servidor do Firestore confirmou a gravação antes de dar como salvo.
 */
export async function saveProcedureToDb(procedure: Procedure): Promise<Procedure> {
  // Se ainda houver alguma imagem em base64, processa e envia para o Firebase Storage
  let imagensFinais = procedure.images || [];
  if (imagensFinais.some((img) => img && img.startsWith('data:'))) {
    imagensFinais = await Promise.all(
      imagensFinais.map(async (img) => {
        if (img && img.startsWith('data:')) {
          try {
            const comp = await downscaleDataUrl(img, 1000, 0.78);
            return await subirImagemOuManter(comp, `procedimentos/${procedure.id}`);
          } catch (err) {
            console.warn('Falha ao subir imagem para o Storage, mantendo versão comprimida:', err);
            return await downscaleDataUrl(img, 1000, 0.78);
          }
        }
        return img;
      })
    );
  }

  const procedureAtualizado: Procedure = {
    ...procedure,
    images: imagensFinais,
    updatedAt: new Date().toISOString(),
  };

  const docRef = doc(db, PROCEDURES_COLLECTION, procedureAtualizado.id);
  const dataToSave = cleanForFirestore(procedureAtualizado);

  const bytes = estimateFirestoreDocBytes(dataToSave);
  if (bytes > FIRESTORE_DOC_SAFE_BYTES) {
    throw new Error(
      `As imagens deste procedimento somam ${(bytes / 1024 / 1024).toFixed(2)} MB e ultrapassam o ` +
        `limite de 1 MB por procedimento. Remova alguma foto (ou use um link de imagem em vez do ` +
        `upload) e salve novamente.`
    );
  }

  await comConfirmacaoDoServidor(
    setDoc(docRef, dataToSave, { merge: true }),
    'do procedimento'
  );

  return procedureAtualizado;
}

/**
 * Delete a procedure by ID.
 */
export async function deleteProcedureFromDb(procedureId: string): Promise<void> {
  const docRef = doc(db, PROCEDURES_COLLECTION, procedureId);
  // Sem confirmação do servidor a exclusão fica apenas na fila local do SDK e a promise nunca
  // resolve: a tela diria "removido" para um procedimento que continua no banco.
  await comConfirmacaoDoServidor(deleteDoc(docRef), 'da exclusão do procedimento');
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

// ==========================================
// IMAGENS DA CLÍNICA — logo, capa e fotos da equipe
// ==========================================

/**
 * Pasta do Storage onde moram as imagens de identidade da clínica. Ver `storage.rules`: leitura
 * aberta (a página da paciente mostra o logo sem login), gravação só para a equipe autenticada.
 */
const CLINIC_IMAGES_FOLDER = 'clinica';

const ehImagemEmbutida = (valor?: string): boolean => !!valor && valor.startsWith('data:');

/**
 * Sobe para o Storage o logo, a capa e as fotos da equipe que ainda estiverem em base64.
 *
 * Estas eram as últimas imagens do sistema gravadas dentro do próprio documento do Firestore —
 * procedimentos e fotos de anamnese já iam para o Storage. O perfil é gravado em dois documentos
 * (o principal e o espelho público), e o espelho é reescrito inteiro, sem merge. Com um logo PNG
 * de 512px e as fotos da equipe embutidas, cada gravação empurrava algumas centenas de KB — e a
 * cota diária do Firestore é medida em KB gravados, não em número de gravações. Com as imagens
 * no Storage o perfil volta a ser texto: poucos KB.
 *
 * Tolerante a falha como o resto do `imageStorage`: se o Storage recusar, a base64 continua valendo
 * e nada quebra na tela — só volta a ficar caro.
 */
async function subirImagensDaClinica(profile: ClinicProfile): Promise<ClinicProfile> {
  const temEmbutida =
    ehImagemEmbutida(profile.logoUrl) ||
    ehImagemEmbutida(profile.coverBannerUrl) ||
    (profile.professionals || []).some((p) => ehImagemEmbutida(p.photoUrl));
  if (!temEmbutida) return profile;

  const [logoUrl, coverBannerUrl, professionals] = await Promise.all([
    ehImagemEmbutida(profile.logoUrl)
      ? subirImagemOuManter(profile.logoUrl as string, `${CLINIC_IMAGES_FOLDER}/logo`)
      : Promise.resolve(profile.logoUrl),
    ehImagemEmbutida(profile.coverBannerUrl)
      ? subirImagemOuManter(profile.coverBannerUrl as string, `${CLINIC_IMAGES_FOLDER}/capa`)
      : Promise.resolve(profile.coverBannerUrl),
    Promise.all(
      (profile.professionals || []).map(async (p) =>
        ehImagemEmbutida(p.photoUrl)
          ? {
              ...p,
              photoUrl: await subirImagemOuManter(
                p.photoUrl as string,
                `${CLINIC_IMAGES_FOLDER}/equipe`
              ),
            }
          : p
      )
    ),
  ]);

  return { ...profile, logoUrl, coverBannerUrl, professionals };
}

/**
 * Save or update the clinic profile and clinical team settings.
 *
 * Grava também o espelho público usado pelas páginas sem login (ficha de anamnese da paciente).
 * A falha do espelho não derruba o salvamento principal: perder a marca na página pública é um
 * problema menor do que perder a edição do perfil.
 */
export async function saveClinicProfileToDb(profile: ClinicProfile): Promise<ClinicProfile> {
  const comImagensNoStorage = await subirImagensDaClinica(profile);

  const clinicRef = doc(db, CLINIC_SETTINGS_COLLECTION, CLINIC_SETTINGS_DOC_ID);
  const dataToSave = cleanForFirestore({
    ...comImagensNoStorage,
    updatedAt: new Date().toISOString(),
  });

  // Mesmo guarda que procedimentos e fichas-modelo já tinham. Só dispara se o Storage estiver
  // indisponível e as imagens tiverem ficado dentro do próprio documento.
  const bytes = estimateFirestoreDocBytes(dataToSave);
  if (bytes > FIRESTORE_DOC_SAFE_BYTES) {
    throw new Error(
      `Os dados da clínica somam ${(bytes / 1024 / 1024).toFixed(2)} MB e ultrapassam o limite de ` +
        `1 MB por documento. Isso acontece quando o Firebase Storage está indisponível e as imagens ` +
        `(logo e fotos da equipe) precisam ficar dentro do cadastro. Remova uma imagem e salve de novo.`
    );
  }

  await setDoc(clinicRef, dataToSave, { merge: true });

  try {
    await publicarEspelhoPublicoSeMudou(comImagensNoStorage);
  } catch (err) {
    console.warn('Perfil salvo, mas o espelho público da clínica não pôde ser atualizado:', err);
  }

  // Devolve o perfil com as imagens já como URL do Storage: é essa versão que a tela e o backup
  // local devem passar a guardar, em vez das base64 que entraram.
  return comImagensNoStorage;
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
 * Assinatura curta do conteúdo público do perfil — serve só para responder "mudou ou não mudou"
 * desde a última publicação. `updatedAt` fica de fora de propósito: ele muda a cada gravação e
 * faria todo perfil parecer diferente de si mesmo.
 */
function assinaturaDoEspelhoPublico(profile: ClinicProfile): string {
  const publico = JSON.stringify(toPublicClinicProfile(profile));
  let hash = 5381;
  for (let i = 0; i < publico.length; i++) {
    hash = ((hash << 5) + hash + publico.charCodeAt(i)) | 0;
  }
  return `${hash}:${publico.length}`;
}

const ESPELHO_PUBLICO_KEY = 'lavie:espelho-publico-publicado:v1';

/** De tempos em tempos republica mesmo sem mudança, para reconstruir um espelho apagado à mão. */
const ESPELHO_PUBLICO_REVALIDA_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Publica o espelho público apenas quando ele realmente mudou.
 *
 * Antes isto rodava uma vez por montagem do app, protegido só por um `useRef` — que zera a cada
 * F5, a cada reabertura do atalho e a cada recarga do servidor de desenvolvimento. Cada abertura
 * reescrevia o documento inteiro, sem merge. Era de longe o maior consumidor da cota diária de
 * gravação: um dia normal de uso reescrevia o mesmo perfil dezenas de vezes sem que uma vírgula
 * tivesse mudado. A marca é por navegador, então no pior caso a publicação acontece uma vez em
 * cada máquina, em vez de sempre.
 */
export async function publicarEspelhoPublicoSeMudou(profile: ClinicProfile): Promise<void> {
  const assinatura = assinaturaDoEspelhoPublico(profile);

  try {
    const marca = localStorage.getItem(ESPELHO_PUBLICO_KEY);
    if (marca) {
      const { assinatura: anterior, em } = JSON.parse(marca) as {
        assinatura?: string;
        em?: number;
      };
      const aindaRecente = typeof em === 'number' && Date.now() - em < ESPELHO_PUBLICO_REVALIDA_MS;
      if (anterior === assinatura && aindaRecente) return;
    }
  } catch {
    // Sem localStorage (aba anônima com storage bloqueado): publica, que é o comportamento antigo.
  }

  await publishPublicClinicProfile(profile);

  try {
    localStorage.setItem(ESPELHO_PUBLICO_KEY, JSON.stringify({ assinatura, em: Date.now() }));
  } catch {
    // idem — sem a marca, volta a publicar na próxima abertura.
  }
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
  if (quotaExhaustedSession) return;
  try {
    // 1. Seed General Questions if empty — a resposta precisa vir do servidor, senão um cache
    //    frio faz o app regravar as perguntas padrão por cima das que a clínica editou.
    const perguntasVazias = await colecaoVaziaNoServidor(ANAMNESIS_GENERAL_QUESTIONS_COLLECTION);
    if (perguntasVazias === null) return;
    if (perguntasVazias) {
      console.log('Seeding initial general questions for anamnesis...');
      const batch = writeBatch(db);
      DEFAULT_GENERAL_QUESTIONS.forEach((q) => {
        const ref = doc(db, ANAMNESIS_GENERAL_QUESTIONS_COLLECTION, q.id);
        batch.set(ref, cleanForFirestore(q));
      });
      await batch.commit();
    }

    // 2. Seed Procedure Templates if empty, or sync laser templates if missing
    const templatesVazios = await colecaoVaziaNoServidor(ANAMNESIS_TEMPLATES_COLLECTION);
    if (templatesVazios === null) return;
    if (templatesVazios) {
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
      const tplSnap = await getDocsFromServer(collection(db, ANAMNESIS_TEMPLATES_COLLECTION));
      await syncLaserAnamnesisTemplates(tplSnap);
      marcarLaserSyncComoFeito();
    }

    // A ficha de Harmonização Glútea das clínicas que já usavam o sistema antes do bloco de
    // avaliação da profissional existir. Controle no próprio documento, roda uma vez só.
    if (!templatesVazios) {
      await migrarPerguntasProfissionalGluteo();
    }

    // 3. Seed Patients if empty
    const pacientesVazios = await colecaoVaziaNoServidor(PATIENTS_COLLECTION);
    if (pacientesVazios === null) return;
    if (pacientesVazios) {
      console.log('Seeding initial sample patients...');
      const batch = writeBatch(db);
      SAMPLE_PATIENTS.forEach((p) => {
        const ref = doc(db, PATIENTS_COLLECTION, p.id);
        batch.set(ref, cleanForFirestore(p));
      });
      await batch.commit();
    }

    // 4. Seed Anamnesis Records if empty
    const fichasVazias = await colecaoVaziaNoServidor(ANAMNESIS_RECORDS_COLLECTION);
    if (fichasVazias === null) return;
    if (fichasVazias) {
      console.log('Seeding initial sample anamnesis records...');
      const batch = writeBatch(db);
      SAMPLE_ANAMNESIS_RECORDS.forEach((r) => {
        const ref = doc(db, ANAMNESIS_RECORDS_COLLECTION, r.id);
        batch.set(ref, cleanForFirestore(r));
      });
      await batch.commit();
    }
  } catch (err) {
    if (isQuotaOrOfflineError(err)) {
      console.warn('Firestore offline/cota diária atingida durante checagem de anamnese inicial.');
    } else {
      console.error('Error seeding initial anamnesis data:', err);
    }
  }
}

const GLUTEO_TEMPLATE_ID = 'tpl-harmonizacao-glutea';
const GLUTEO_MIGRACAO = 'gluteo-perguntas-profissional-v1';
/** Atalho local: evita a leitura de confirmação em toda abertura, depois da primeira. */
const GLUTEO_MIGRACAO_LOCAL_KEY = 'lavie:gluteo-perguntas-profissional:v1';

/**
 * Acrescenta à ficha de Harmonização Glútea o bloco de avaliação clínica respondido pela
 * profissional (queixa, estratégia, evolução e as cinco notas de 1 a 10).
 *
 * Roda uma única vez por clínica: o controle é o `migracoesAplicadas` gravado na própria ficha,
 * então apagar uma dessas perguntas na tela é definitivo — ela não volta na próxima abertura,
 * nem em outro aparelho. Só acrescenta o que falta, comparando por id, e nunca toca no que a
 * equipe já tiver editado.
 */
async function migrarPerguntasProfissionalGluteo(): Promise<void> {
  try {
    if (localStorage.getItem(GLUTEO_MIGRACAO_LOCAL_KEY)) return;
  } catch {
    // localStorage indisponível — segue pela leitura no servidor.
  }

  try {
    const ref = doc(db, ANAMNESIS_TEMPLATES_COLLECTION, GLUTEO_TEMPLATE_ID);
    // Do servidor: um cache frio devolveria a ficha sem as perguntas que a equipe acrescentou
    // na tela, e a gravação abaixo as apagaria.
    const snap = await getDocFromServer(ref);
    if (!snap.exists()) return;

    const ficha = snap.data() as AnamnesisTemplate;
    if ((ficha.migracoesAplicadas || []).includes(GLUTEO_MIGRACAO)) {
      try {
        localStorage.setItem(GLUTEO_MIGRACAO_LOCAL_KEY, '1');
      } catch {
        // sem atalho local; a leitura acima continua resolvendo
      }
      return;
    }

    const atuais = ficha.perguntasEspecificas || [];
    const faltando = PERGUNTAS_PROFISSIONAL_GLUTEO.filter(
      (nova) => !atuais.some((q) => q.id === nova.id)
    );

    const perguntas = [...atuais, ...faltando].map((q, idx) => ({ ...q, ordem: idx + 1 }));

    await updateDoc(ref, {
      ...cleanForFirestore({
        perguntasEspecificas: perguntas,
        migracoesAplicadas: [...(ficha.migracoesAplicadas || []), GLUTEO_MIGRACAO],
      }),
      updatedAt: new Date().toISOString(),
    });

    try {
      localStorage.setItem(GLUTEO_MIGRACAO_LOCAL_KEY, '1');
    } catch {
      // idem
    }

    if (faltando.length > 0) {
      console.log(
        `Ficha de Harmonização Glútea: ${faltando.length} perguntas da profissional adicionadas.`
      );
    }
  } catch (err) {
    // Sem rede, sem cota ou sem permissão: a migração fica para a próxima abertura.
    console.warn('Migração das perguntas da profissional (Harmonização Glútea) adiada:', err);
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
        const updates: Partial<AnamnesisTemplate> = {};
        // Comparadas pelas formas normalizadas: uma ficha gravada como "Depilação a Laser - Facial"
        // e o padrão "Depilação a Laser" são a mesma categoria, e tratar as duas como diferentes
        // fazia esta rotina regravar exatamente o valor antigo que a tela acabara de unificar.
        const categoriaPadrao = normalizeLaserCategory(tplDefault.categoria);
        if (normalizeLaserCategory(existing.categoria) !== categoriaPadrao) {
          updates.categoria = categoriaPadrao;
        }

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
          updates.perguntasEspecificas = updatedQuestions;
        }

        if (Object.keys(updates).length > 0) {
          const ref = doc(db, ANAMNESIS_TEMPLATES_COLLECTION, existing.id);
          batch.update(ref, {
            ...cleanForFirestore(updates),
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
      if (isQuotaOrOfflineError(error)) {
        console.warn('General questions subscription offline/cota diária atingida.');
      } else {
        console.error('General questions subscription error:', error);
      }
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
        const tpl = { ...(docSnap.data() as AnamnesisTemplate), id: docSnap.id };
        // Normalização só para exibição — mesma decisão de `subscribeToProcedures`.
        tpl.categoria = normalizeLaserCategory(tpl.categoria);
        items.push(tpl);
      });
      // Sort alphabetically by procedure name
      items.sort((a, b) => a.procedimentoNome.localeCompare(b.procedimentoNome));
      onUpdate(items);
    },
    (error) => {
      if (isQuotaOrOfflineError(error)) {
        console.warn('Anamnesis templates subscription offline/cota diária atingida.');
      } else {
        console.error('Anamnesis templates subscription error:', error);
      }
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
      if (isQuotaOrOfflineError(error)) {
        console.warn('Patients subscription offline/cota diária atingida.');
      } else {
        console.error('Patients subscription error:', error);
      }
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
      if (isQuotaOrOfflineError(error)) {
        console.warn('Anamnesis records subscription offline/cota diária atingida.');
      } else {
        console.error('Anamnesis records subscription error:', error);
      }
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
  const tpl = { ...(snap.data() as AnamnesisTemplate), id: snap.id };
  // Mesma normalização de exibição da assinatura em tempo real: agora que ninguém reescreve a
  // categoria no banco, quem lê avulso precisa normalizar por conta própria — é por aqui que a
  // página pública da paciente carrega a ficha.
  tpl.categoria = normalizeLaserCategory(tpl.categoria);
  return tpl;
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
function subscribeToQuotesDireto(
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
      if (isQuotaOrOfflineError(error)) {
        console.warn('Quotes subscription offline/cota diária atingida.');
      } else {
        console.error('Quotes subscription error:', error);
      }
      if (onError) onError(error);
    }
  );
}

/**
 * Assinatura compartilhada de `quotes`: uma única por sessão, viva entre idas e vindas de aba.
 * Ver `sharedSubscription.ts` — a lista de orçamentos é lida tanto pelo painel de Orçamentos
 * quanto pela página do paciente, e sem isto alternar entre as duas pagava um snapshot inteiro
 * da coleção a cada troca.
 */
export function subscribeToQuotes(
  onUpdate: (data: Quote[]) => void,
  onError?: (err: Error) => void
) {
  return subscribeShared<Quote[]>('quotes', subscribeToQuotesDireto, onUpdate, onError);
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

