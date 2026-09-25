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
  Attendance,
  Patient,
  SessionPlan,
  AnamnesisRecord,
  Quote,
  QuoteDraft,
  QuoteStoredStatus,
  LaserBodyMap,
  ConsentTermSection,
  EvaluationTemplate,
  EvaluationRecord,
} from '../types';
import { formatQuoteNumber } from '../utils/quoteCalc';
import { clonarItens, normalizarQuote } from '../utils/quoteFactory';
import { SAMPLE_PROCEDURES, DEFAULT_CLINIC_PROFILE } from '../data/initialData';
import { downscaleDataUrl, estimateFirestoreDocBytes, FIRESTORE_DOC_SAFE_BYTES } from '../utils/imageCompressor';
import { subirImagem, subirImagemOuManter } from './imageStorage';
import { isLaserCategory } from '../utils/templateMatching';
import {
  MIGRACAO_AVALIACAO,
  MIGRACAO_FICHAS_PADRAO,
  planejarInstalacaoDeFichasPadrao,
  planejarMigracao,
} from '../utils/evaluations';
import { paraArray } from '../utils/firestoreShapes';
import {
  montarEspelhoPublico,
  serializarAreas,
  desserializarAreas,
  LASER_MANEQUIM_MAX_LADO,
} from '../utils/laserAreas';
import {
  DEFAULT_GENERAL_QUESTIONS,
  DEFAULT_PROCEDURE_TEMPLATES,
  SAMPLE_PATIENTS,
  SAMPLE_ANAMNESIS_RECORDS,
  LASER_HEALTH_QUESTIONS,
  DEFAULT_EVALUATION_TEMPLATES,
  FICHAS_AVALIACAO_DEMAIS_PROCEDIMENTOS,
} from '../data/anamnesisInitialData';

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

const ATTENDANCES_COLLECTION = 'attendances';
const SESSION_PLANS_COLLECTION = 'session_plans';

// Fichas de avaliação — o que a profissional responde DEPOIS do atendimento. Ao contrário de
// `patients` e `anamnesis_records`, estas três exigem login nas regras: a paciente preenche a
// própria anamnese sem conta, mas nunca enxerga avaliação nenhuma.
const EVALUATION_TEMPLATES_COLLECTION = 'evaluation_templates';
const EVALUATION_GENERAL_QUESTIONS_COLLECTION = 'evaluation_general_questions';
// Um documento por atendimento, com o id DO atendimento — ver `EvaluationRecord`.
const EVALUATION_RECORDS_COLLECTION = 'evaluation_records';

// Marcador das migrações que valem para a clínica inteira (e não para uma ficha só, como
// `AnamnesisTemplate.migracoesAplicadas`). Mora no banco, e não no localStorage, porque a
// pergunta que ele responde é sobre a clínica: uma marca local faria a migração rodar de novo em
// cada aparelho novo e ressuscitar o que a equipe tivesse apagado de propósito.
const MIGRATIONS_DOC_ID = 'migrations';

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
 * Põe uma ficha-modelo lida do banco numa forma em que as telas possam confiar.
 *
 * Uma única ficha com um campo torto apagava o app inteiro: sem `procedimentoNome`, a ordenação
 * alfabética lançava em `localeCompare`; com `perguntasEspecificas` em forma de mapa, o
 * preenchimento lançava no `.map`. Nos dois casos a tela ficava branca, sem nada que indicasse
 * qual ficha era a culpada.
 */
function normalizarTemplateLido(tpl: AnamnesisTemplate): AnamnesisTemplate {
  const bruto = tpl as unknown as Record<string, unknown>;
  return {
    ...tpl,
    procedimentoNome: typeof tpl.procedimentoNome === 'string' ? tpl.procedimentoNome : '',
    categoria: normalizeLaserCategory(tpl.categoria),
    perguntasEspecificas: paraArray<AnamnesisQuestion>(bruto.perguntasEspecificas),
    ...(bruto.termoConsentimentoSecoes !== undefined
      ? { termoConsentimentoSecoes: paraArray<ConsentTermSection>(bruto.termoConsentimentoSecoes) }
      : {}),
  };
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
    .map((proc) => ({
      ...proc,
      category: normalizeLaserCategory(proc.category),
      // As áreas voltam do banco em formato de gravação (string por polígono) e precisam virar
      // números antes de qualquer tela tentar desenhá-las. Ver `desserializarAreas`.
      laserAreas: desserializarAreas((proc as unknown as Record<string, unknown>).laserAreas),
    }))
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
        // Mesma ideia: converter só para exibir. Os polígonos são gravados como texto (o Firestore
        // não aceita array dentro de array) e precisam voltar a ser números antes de qualquer tela
        // tentar desenhá-los — sem isso o manequim aparece vazio, com a lista de áreas cheia.
        proc.laserAreas = desserializarAreas(
          (proc as unknown as Record<string, unknown>).laserAreas
        );
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
  const areasGravaveis = serializarAreas(procedureAtualizado.laserAreas);
  const dataToSave = {
    ...cleanForFirestore(procedureAtualizado),
    /**
     * Serializado **depois** do `cleanForFirestore`, e nunca antes: ele percorre a estrutura e
     * achataria cada polígono num objeto `{0: x, 1: y}`. A gravação passaria sem erro e o desenho
     * nunca mais apareceria.
     *
     * E `deleteField()` em vez de omitir quando não há área: a gravação usa `merge: true`, onde um
     * campo ausente é um campo **preservado**. Omitir faria "remover a área" não remover nada — o
     * desenho antigo continuaria no banco, voltando na próxima leitura.
     */
    laserAreas: areasGravaveis ?? deleteField(),
  };

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
  // Os manequins sobem primeiro e por um caminho estrito: se o Storage recusar, esta linha lança
  // e o perfil não é gravado. É de propósito — ver `subirManequinsDoLaser`.
  const comManequins = await subirManequinsDoLaser(profile);
  const comImagensNoStorage = await subirImagensDaClinica(comManequins);

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

/**
 * Grava só o endereço público do sistema — a base dos links que vão para a paciente.
 *
 * Um campo, e não o perfil inteiro: quem chama é o App, sozinho, quando percebe que foi aberto
 * pelo site publicado e o perfil não tem um endereço que abra sem login (ver `utils/publicLinks`).
 * Regravar o perfil inteiro ali arriscaria sobrescrever uma edição feita em outra aba.
 */
export async function salvarEnderecoPublicoDaClinica(publicBaseUrl: string): Promise<void> {
  const clinicRef = doc(db, CLINIC_SETTINGS_COLLECTION, CLINIC_SETTINGS_DOC_ID);
  await updateDoc(clinicRef, { publicBaseUrl });
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

// ==========================================
// MAPA CORPORAL DA DEPILAÇÃO A LASER
// ==========================================

/**
 * Espelho público do mapa corporal. Existe pela mesma razão do `public_profile`: a paciente
 * escolhe as áreas pretendidas dentro da ficha de anamnese, que ela abre por link e sem conta —
 * e `procedures`, onde as áreas moram de verdade, exige login para leitura.
 *
 * Leva os polígonos e os nomes curtos, nunca os preços.
 */
const CLINIC_LASER_MAP_DOC_ID = 'laser_body_map';

const LASER_MANEQUIM_FOLDER = `${CLINIC_IMAGES_FOLDER}/laser-manequim`;

/**
 * Sobe os dois manequins para o Storage — e, ao contrário de todo o resto do `imageStorage`,
 * **recusa o fallback para base64**.
 *
 * Em qualquer outra imagem do sistema, cair na base64 é um retrocesso tolerável: a tela continua
 * funcionando e só volta a ficar caro. Aqui não. Um manequim de corpo inteiro nítido pesa de 400 a
 * 900 KB, o que em base64 vira 530 KB a 1,2 MB — e a cota deste projeto conta write units de 1 KiB
 * gravado, de um teto diário de 20.000. Duas dessas dentro de `clinic_settings` seriam mais de mil
 * unidades por gravação, em um documento que é reescrito a cada ajuste do perfil, com risco de
 * estourar o teto de 1 MB por documento e travar as Configurações de vez.
 *
 * Então, se o Storage recusar, esta função lança: melhor a equipe ver "não foi possível enviar" e
 * tentar de novo do que salvar um perfil que envenena a cota da clínica inteira.
 */
async function subirManequinsDoLaser(profile: ClinicProfile): Promise<ClinicProfile> {
  const campos = ['laserManequimFrenteUrl', 'laserManequimCostasUrl'] as const;
  if (!campos.some((campo) => ehImagemEmbutida(profile[campo]))) return profile;

  const resultado: ClinicProfile = { ...profile };

  for (const campo of campos) {
    const valor = profile[campo];
    if (!ehImagemEmbutida(valor)) continue;

    const reduzida = await downscaleDataUrl(valor as string, LASER_MANEQUIM_MAX_LADO, 0.92);
    const { url, noStorage } = await subirImagem(reduzida, LASER_MANEQUIM_FOLDER);
    if (!noStorage) {
      throw new Error(
        'Não foi possível enviar a imagem do manequim para o Firebase Storage. Verifique a ' +
          'conexão e se as regras de storage.rules foram publicadas, e tente novamente. A imagem ' +
          'não foi salva — manequins são grandes demais para ficar dentro do documento.'
      );
    }
    resultado[campo] = url;
  }

  return resultado;
}

/**
 * Assinatura do conteúdo do espelho, para não regravar um documento idêntico.
 *
 * Fica só em memória, sem marca no `localStorage` como o espelho do perfil: este espelho nunca é
 * publicado em carregamento de página — só por ação explícita da equipe — então não há a enxurrada
 * de reescritas por F5 que aquela marca resolve.
 */
let assinaturaDoMapaPublicado: string | null = null;

/**
 * Publica `clinic_settings/laser_body_map` a partir do catálogo em memória.
 *
 * **Só pode ser chamada a partir de uma ação explícita da equipe** (aplicar uma área, salvar as
 * Configurações). Nunca de dentro de um `useEffect` de carregamento nem de um callback de
 * `onSnapshot`: são ~10 KB por gravação, e uma vez por abertura do app, vezes dezenas de aberturas
 * diárias, vira consumo de fundo real da cota — foi exatamente assim que o espelho do perfil virou
 * o maior consumidor do dia antes de ganhar a marca de "publica só se mudou".
 *
 * Não derruba quem chamou: perder a atualização do mapa público é menos grave do que perder o
 * salvamento da área que acabou de ser desenhada.
 */
export async function publicarMapaCorporalDoLaser(
  procedures: Procedure[],
  clinic: Pick<ClinicProfile, 'laserManequimFrenteUrl' | 'laserManequimCostasUrl'>
): Promise<void> {
  try {
    const mapa = montarEspelhoPublico(procedures, clinic);

    // `updatedAt` fora da assinatura: ele muda sempre e faria todo mapa parecer diferente de si.
    const { updatedAt: _ignorado, ...conteudo } = mapa;
    const assinatura = JSON.stringify(conteudo);
    if (assinatura === assinaturaDoMapaPublicado) return;

    const ref = doc(db, CLINIC_SETTINGS_COLLECTION, CLINIC_LASER_MAP_DOC_ID);
    // Sem merge: uma área removida do catálogo precisa sumir daqui também.
    // E com os polígonos serializados pelo mesmo motivo de `procedures` — o espelho é um documento
    // do Firestore como qualquer outro, e array dentro de array não passa nele também.
    await setDoc(
      ref,
      cleanForFirestore({
        ...mapa,
        areas: mapa.areas.map((a) => ({
          procedureId: a.procedureId,
          nomeCurto: a.nomeCurto,
          vista: a.vista,
          formas: a.formas.map((f) => f.join(',')),
          ...(a.botao ? { botao: a.botao } : {}),
        })),
      }),
      { merge: false }
    );
    assinaturaDoMapaPublicado = assinatura;
  } catch (err) {
    console.warn('O mapa corporal do laser não pôde ser publicado no espelho público:', err);
  }
}

/**
 * Lê o mapa corporal na página pública (ficha de anamnese aberta pela paciente, sem login).
 *
 * Devolve `null` quando o mapa ainda não foi publicado — a clínica pode não ter enviado os
 * manequins, e a ficha precisa continuar funcionando sem a etapa de áreas em vez de não abrir.
 */
export async function getMapaCorporalDoLaserPublico(): Promise<LaserBodyMap | null> {
  try {
    const snap = await getDoc(doc(db, CLINIC_SETTINGS_COLLECTION, CLINIC_LASER_MAP_DOC_ID));
    if (!snap.exists()) return null;
    const dados = snap.data() as Record<string, unknown>;

    // Cada entrada vira uma área de uma forma só para reaproveitar o leitor tolerante, que também
    // recupera os espelhos gravados antes desta correção.
    const areas = (Array.isArray(dados.areas) ? dados.areas : [])
      .map((bruta) => {
        const registro = bruta as Record<string, unknown>;
        const area = desserializarAreas([registro])?.[0];
        if (!area) return null;
        return {
          procedureId: String(registro.procedureId || ''),
          nomeCurto: String(registro.nomeCurto || ''),
          vista: area.vista,
          formas: area.formas,
          ...(area.botao ? { botao: area.botao } : {}),
        };
      })
      .filter((a): a is NonNullable<typeof a> => !!a && !!a.procedureId);

    return {
      manequimFrenteUrl: dados.manequimFrenteUrl as string | undefined,
      manequimCostasUrl: dados.manequimCostasUrl as string | undefined,
      areas,
      updatedAt: dados.updatedAt as string | undefined,
    };
  } catch (err) {
    console.warn('Não foi possível ler o mapa corporal do laser:', err);
    return null;
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
// v4: o questionário de laser foi trocado pelo protocolo de 27 perguntas.
// v3: a regra de ocultar passou a olhar o conteúdo da ficha (é de laser? é de uma área só?) em
// vez dos 13 IDs do seed — fichas criadas pela equipe nascem com outro ID e escapavam.
// v2: a sincronização deixou de recriar as 13 fichas por área e passou a ocultá-las, promovendo a
// ficha única. Trocar a chave faz o ajuste rodar uma vez em cada máquina que já tinha a marca v1 —
// sem isso, quem já abriu o app antes nunca veria a consolidação acontecer.
const LASER_SYNC_DONE_KEY = 'lavie:laser-templates-sync:v4';

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

    // 2b. Fichas de avaliação — o que a profissional responde depois do atendimento.
    //
    // A migração vem ANTES do seed e **não** depende desta sondagem. Ela lê fichas de anamnese,
    // procedimentos e perguntas gerais — coleções que já existiam. Amarrá-la a uma leitura da
    // coleção nova significava que, enquanto `firestore.rules` não fosse publicado, a sondagem
    // era negada, devolvia `null`, e a migração dos dados antigos nunca acontecia sem dizer nada.
    if (!templatesVazios) {
      await migrarPerguntasProfissionalParaAvaliacao();
    }

    const avaliacoesVazias = await colecaoVaziaNoServidor(EVALUATION_TEMPLATES_COLLECTION);
    if (avaliacoesVazias === null) {
      // Só o seed da clínica nova fica para depois; nada acima depende disto.
      console.warn(
        'Sem confirmação do servidor sobre "evaluation_templates". Se isto persistir, publique ' +
          'as regras: firebase deploy --only firestore:rules,storage'
      );
    } else if (avaliacoesVazias && templatesVazios) {
      // Clínica nova: as duas coleções nascem juntas, já separadas.
      console.log('Seeding initial evaluation templates...');
      const batch = writeBatch(db);
      DEFAULT_EVALUATION_TEMPLATES.forEach((f) => {
        batch.set(
          doc(db, EVALUATION_TEMPLATES_COLLECTION, f.id),
          cleanForFirestore({ ...f, updatedAt: new Date().toISOString() })
        );
      });
      await batch.commit();
    }

    // 2c. As fichas de avaliação dos demais procedimentos do catálogo.
    //
    // Depois da migração, e não no lugar dela: a instalação pula o que já está coberto, e o que a
    // migração acabou de criar (laser e glúteo, com id `aval-tpl-…`) precisa estar lá para ser
    // visto como cobertura. Antes, as duas fichas padrão de mesmo alvo entrariam junto.
    await instalarFichasDeAvaliacaoPadrao();

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


/**
 * ID da ficha única de Depilação a Laser.
 *
 * Reaproveita a `tpl-epilacao-laser`, que já existe no seed com as 19 perguntas de segurança, em
 * vez de criar uma décima quinta ficha de laser: fichas de anamnese já preenchidas que apontem
 * para ela continuam resolvendo normalmente.
 */
export const LASER_TEMPLATE_UNICO_ID = 'tpl-epilacao-laser';

/**
 * Marca da revisão do questionário de laser (27 perguntas, protocolo de setembro/2026).
 *
 * Fica gravada em `migracoesAplicadas`, no próprio documento da ficha, e não no `localStorage`:
 * uma marca local faria a troca rodar de novo em cada aparelho novo e desfazer, toda vez, o que a
 * clínica tivesse ajustado depois. Mesma decisão da migração da Harmonização Glútea.
 */
const LASER_PERGUNTAS_MIGRACAO = 'laser-perguntas-2026-09';

/**
 * Uma ficha de laser que cobre **uma área só** — e portanto foi aposentada pela ficha única.
 *
 * A regra olha o conteúdo, não o ID. A primeira versão desta migração listava os 13 IDs do seed
 * (`tpl-laser-*`), o que só funcionava num banco semeado por ela: fichas criadas pela própria
 * equipe nascem com `tpl-<timestamp>`, escapavam da lista e continuavam aparecendo no seletor,
 * exatamente o que esta função existe para impedir.
 *
 * O que caracteriza uma ficha por área: ser de laser e estar amarrada a um procedimento
 * específico, ou trazer a região no próprio nome ("Depilação a Laser - ½ Perna"). A ficha única
 * nunca é escondida.
 */
const ehFichaDeLaserPorArea = (tpl: AnamnesisTemplate): boolean => {
  if (tpl.id === LASER_TEMPLATE_UNICO_ID) return false;
  const nome = tpl.procedimentoNome || '';
  const ehDeLaser = isLaserCategory(tpl.categoria) || nome.toLowerCase().includes('laser');
  if (!ehDeLaser) return false;
  // "Depilação a Laser" sozinho é o guarda-chuva; com sufixo, é uma região.
  const temRegiaoNoNome = /laser\s*[-–—:]/i.test(nome);
  return Boolean(tpl.procedimentoId) || temRegiaoNoNome;
};

/**
 * Consolida a anamnese de laser numa ficha só e aposenta as treze por área.
 *
 * O que havia antes: uma ficha para Buço, outra para Queixo, outra para Axilas — treze ao todo,
 * **todas repetindo as mesmas 19 perguntas de segurança**, e todas recriadas a cada abertura do
 * app. Na prática, uma cliente que queria axilas, virilha e meia perna recebia três links e
 * respondia três vezes se tinha diabetes. Agora a área é escolhida no mapa corporal, dentro de uma
 * ficha única.
 *
 * As treze ficam **ocultas, não apagadas**: fichas já preenchidas apontam para elas por
 * `templateId`, e apagar faria uma anamnese assinada deixar de renderizar. E a ocultação é por ID
 * exato do seed, não por categoria — uma ficha de laser que a própria clínica tenha criado à mão
 * não é nossa para esconder.
 */
async function syncLaserAnamnesisTemplates(tplSnap: QuerySnapshot): Promise<void> {
  try {
    const existentes: AnamnesisTemplate[] = [];
    tplSnap.forEach((docSnap) => {
      existentes.push({ ...(docSnap.data() as AnamnesisTemplate), id: docSnap.id });
    });

    const batch = writeBatch(db);
    let mudou = false;

    // 1. A ficha única. A categoria precisa ser "Depilação a Laser" — é ela que faz
    //    `isLaserCategory` reconhecer a ficha e liberar a etapa do mapa corporal no formulário.
    const modeloUnico = DEFAULT_PROCEDURE_TEMPLATES.find((t) => t.id === LASER_TEMPLATE_UNICO_ID);
    const unicaExistente = existentes.find((t) => t.id === LASER_TEMPLATE_UNICO_ID);
    const perguntasDoModelo = modeloUnico?.perguntasEspecificas || [];

    if (!unicaExistente && modeloUnico) {
      batch.set(
        doc(db, ANAMNESIS_TEMPLATES_COLLECTION, LASER_TEMPLATE_UNICO_ID),
        cleanForFirestore({
          ...modeloUnico,
          procedimentoNome: 'Depilação a Laser',
          categoria: 'Depilação a Laser',
          oculta: false,
          updatedAt: new Date().toISOString(),
        })
      );
      mudou = true;
    } else if (unicaExistente) {
      const ajustes: Partial<AnamnesisTemplate> = {};
      if (unicaExistente.categoria !== 'Depilação a Laser') {
        ajustes.categoria = 'Depilação a Laser';
      }
      if (unicaExistente.procedimentoNome !== 'Depilação a Laser') {
        ajustes.procedimentoNome = 'Depilação a Laser';
      }
      if (unicaExistente.oculta) ajustes.oculta = false;

      const atuais = unicaExistente.perguntasEspecificas || [];
      const jaAplicadas = unicaExistente.migracoesAplicadas || [];

      if (!jaAplicadas.includes(LASER_PERGUNTAS_MIGRACAO)) {
        /**
         * Troca o questionário inteiro pelo protocolo novo — **substitui, não acrescenta**.
         *
         * Acrescentar não serve aqui: a revisão da clínica tirou uma pergunta ("tatuagem no local"),
         * mudou o fototipo de paciente para profissional e reordenou tudo. Uma fusão deixaria a
         * pergunta removida viva, o fototipo duplicado em dois públicos e a ordem embaralhada.
         *
         * O que se perde: ajustes que a equipe tenha feito à mão nessas perguntas. É o preço de
         * "trocar", e vale porque é uma vez só — a marca em `migracoesAplicadas` vive no próprio
         * documento, não no navegador, então uma máquina nova não repete a troca e não ressuscita o
         * que a clínica editar depois.
         *
         * O histórico não é afetado: cada ficha preenchida guarda seu próprio `perguntasSnapshot`,
         * com as perguntas como estavam no dia.
         */
        ajustes.perguntasEspecificas = perguntasDoModelo.map((q, i) => ({ ...q, ordem: i + 1 }));
        ajustes.migracoesAplicadas = [...jaAplicadas, LASER_PERGUNTAS_MIGRACAO];
      } else {
        // Depois da troca, o comportamento de sempre: uma pergunta de segurança que suma volta ao
        // fim da lista. Comparar por texto além do ID cobre fichas mexidas à mão pela equipe.
        const faltando = perguntasDoModelo.filter(
          (req) =>
            !atuais.some(
              (q) =>
                q.id === req.id || q.texto.trim().toLowerCase() === req.texto.trim().toLowerCase()
            )
        );
        if (faltando.length > 0) {
          ajustes.perguntasEspecificas = [...atuais, ...faltando].map((q, i) => ({
            ...q,
            ordem: i + 1,
          }));
        }
      }

      if (Object.keys(ajustes).length > 0) {
        batch.update(doc(db, ANAMNESIS_TEMPLATES_COLLECTION, LASER_TEMPLATE_UNICO_ID), {
          ...cleanForFirestore(ajustes),
          updatedAt: new Date().toISOString(),
        });
        mudou = true;
      }
    }

    // 2. As fichas por área: ocultar as que existem, e **não recriar** as que não existem.
    for (const existente of existentes) {
      if (existente.oculta || !ehFichaDeLaserPorArea(existente)) continue;
      batch.update(doc(db, ANAMNESIS_TEMPLATES_COLLECTION, existente.id), {
        oculta: true,
        updatedAt: new Date().toISOString(),
      });
      mudou = true;
    }

    if (mudou) {
      await batch.commit();
      console.log('Anamnese de laser consolidada numa ficha única; fichas por área ocultadas.');
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
        // Normalização só para exibição — mesma decisão de `subscribeToProcedures`.
        items.push(
          normalizarTemplateLido({ ...(docSnap.data() as AnamnesisTemplate), id: docSnap.id })
        );
      });
      // Ordem alfabética. O `|| ''` sobrevive a uma ficha sem nome: sem ele, `localeCompare`
      // lançava aqui dentro e derrubava a assinatura inteira, deixando o app sem ficha nenhuma.
      items.sort((a, b) => (a.procedimentoNome || '').localeCompare(b.procedimentoNome || ''));
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
  // Mesma normalização de exibição da assinatura em tempo real: agora que ninguém reescreve a
  // categoria no banco, quem lê avulso precisa normalizar por conta própria — é por aqui que a
  // página pública da paciente carrega a ficha, e é lá que uma tela branca é mais cara.
  return normalizarTemplateLido({ ...(snap.data() as AnamnesisTemplate), id: snap.id });
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
  const agora = new Date().toISOString();
  // O aceite é datado aqui, e desfeito junto quando alguém volta atrás: é esta data que o
  // faturamento do mês soma, e um `aceitoEm` sobrevivente num orçamento reaberto faria o mês
  // fechar com dinheiro que ninguém recebeu.
  await updateDoc(docRef, {
    status,
    aceitoEm: status === 'aceito' ? agora : deleteField(),
    updatedAt: agora,
  });
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


// ==========================================
// ATENDIMENTOS E PLANOS DE SESSÃO
// ==========================================

/**
 * Atendimentos da clínica inteira, numa assinatura compartilhada como as demais.
 *
 * Coleção raiz e não subcoleção de `patients` por duas razões: a lista de clientes precisa saber
 * a última interação de todo mundo de uma vez (uma subcoleção exigiria uma leitura por paciente),
 * e a agenda que vem depois consulta por data atravessando pacientes.
 */
function subscribeToAttendancesDireto(
  onUpdate: (data: Attendance[]) => void,
  onError?: (err: Error) => void
) {
  const colRef = collection(db, ATTENDANCES_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: Attendance[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ ...(docSnap.data() as Attendance), id: docSnap.id });
      });
      onUpdate(items);
    },
    (error) => {
      if (isQuotaOrOfflineError(error)) {
        console.warn('Attendances subscription offline/cota diária atingida.');
      } else {
        console.error('Attendances subscription error:', error);
      }
      if (onError) onError(error);
    }
  );
}

export function subscribeToAttendances(
  onUpdate: (data: Attendance[]) => void,
  onError?: (err: Error) => void
) {
  return subscribeShared<Attendance[]>(
    'attendances',
    subscribeToAttendancesDireto,
    onUpdate,
    onError
  );
}

export async function saveAttendance(
  attendance: Attendance,
  opcoes?: { limparConfirmacao?: boolean }
): Promise<void> {
  const docRef = doc(db, ATTENDANCES_COLLECTION, attendance.id);
  const dataToSave: Record<string, unknown> = cleanForFirestore({
    ...attendance,
    updatedAt: new Date().toISOString(),
  });
  /**
   * Mudar a data ou a hora de um agendamento confirmado derruba a confirmação: a paciente disse
   * que vinha **naquele** horário.
   *
   * Precisa ser explícito porque a gravação é `merge: true` e `cleanForFirestore` descarta
   * `undefined` — sem o sentinela, o campo simplesmente sobreviveria. E o sentinela entra depois
   * da limpeza: ele é um objeto, e passar por lá o transformaria num `{}` que o Firestore recusa.
   */
  if (opcoes?.limparConfirmacao) dataToSave.confirmadoEm = deleteField();
  // Com confirmação do servidor por causa da agenda: uma gravação barrada pela cota fica na fila
  // local e a promise nunca resolve, então a tela mostraria o horário reservado sem que nada
  // tivesse chegado ao banco — e a recepção marcaria outra paciente em cima.
  await comConfirmacaoDoServidor(setDoc(docRef, dataToSave, { merge: true }), 'do atendimento');
}

export async function deleteAttendance(attendanceId: string): Promise<void> {
  await deleteDoc(doc(db, ATTENDANCES_COLLECTION, attendanceId));
}

/**
 * Liga e desliga o "confirmado" de um agendamento.
 *
 * Escreve dois campos e nada mais — não passa por `saveAttendance` porque não há motivo para
 * reenviar o documento inteiro (observações, plano, duração) só para marcar uma promessa. A
 * recepção faz isto dezenas de vezes por dia, muitas com a paciente na linha.
 *
 * `deleteField()` e não string vazia: a ausência é o que significa "ninguém confirmou", e um
 * `confirmadoEm: ''` gravado passaria por confirmado em qualquer checagem por presença.
 */
export async function marcarConfirmacao(
  attendanceId: string,
  confirmado: boolean
): Promise<void> {
  await comConfirmacaoDoServidor(
    updateDoc(doc(db, ATTENDANCES_COLLECTION, attendanceId), {
      confirmadoEm: confirmado ? new Date().toISOString() : deleteField(),
      updatedAt: new Date().toISOString(),
    }),
    'da confirmação'
  );
}

function subscribeToSessionPlansDireto(
  onUpdate: (data: SessionPlan[]) => void,
  onError?: (err: Error) => void
) {
  const colRef = collection(db, SESSION_PLANS_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: SessionPlan[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ ...(docSnap.data() as SessionPlan), id: docSnap.id });
      });
      onUpdate(items);
    },
    (error) => {
      if (isQuotaOrOfflineError(error)) {
        console.warn('Session plans subscription offline/cota diária atingida.');
      } else {
        console.error('Session plans subscription error:', error);
      }
      if (onError) onError(error);
    }
  );
}

export function subscribeToSessionPlans(
  onUpdate: (data: SessionPlan[]) => void,
  onError?: (err: Error) => void
) {
  return subscribeShared<SessionPlan[]>(
    'session_plans',
    subscribeToSessionPlansDireto,
    onUpdate,
    onError
  );
}

/**
 * Remarca um agendamento.
 *
 * O antigo **morre como `remarcado`** e um agendamento novo nasce ao lado, como manda a regra em
 * `types.ts` — mudar a data no mesmo documento apagaria o rastro de que houve remarcação.
 *
 * Num `writeBatch` só: meio caminho deixaria a paciente sem horário nenhum (antigo remarcado, novo
 * não criado) ou com dois ao mesmo tempo.
 */
export async function remarcarAtendimento(
  original: Attendance,
  destino: { data: string; hora: string }
): Promise<Attendance> {
  const agora = new Date().toISOString();

  const novo: Attendance = {
    ...original,
    id: `atd-${Date.now()}`,
    data: destino.data,
    hora: destino.hora,
    status: 'agendado',
    // O desfecho, a avaliação e a confirmação pertencem à visita que não aconteceu. A paciente
    // confirmou o horário antigo; o novo nasce a confirmar, como qualquer agendamento.
    agendadoPara: undefined,
    avaliacaoPreenchidaEm: undefined,
    confirmadoEm: undefined,
    createdAt: agora,
    updatedAt: agora,
  };

  const batch = writeBatch(db);
  batch.update(doc(db, ATTENDANCES_COLLECTION, original.id), {
    status: 'remarcado',
    updatedAt: agora,
  });
  batch.set(doc(db, ATTENDANCES_COLLECTION, novo.id), cleanForFirestore(novo), { merge: true });
  await comConfirmacaoDoServidor(batch.commit(), 'da remarcação');

  return novo;
}

export async function saveSessionPlan(plan: SessionPlan): Promise<void> {
  const docRef = doc(db, SESSION_PLANS_COLLECTION, plan.id);
  const dataToSave = cleanForFirestore({
    ...plan,
    updatedAt: new Date().toISOString(),
  });
  await setDoc(docRef, dataToSave, { merge: true });
}

/**
 * Apaga o plano e solta os atendimentos dele, que viram avulsos.
 *
 * Nunca apaga os atendimentos junto: sumir com seis registros de visita por causa de um clique
 * num agrupador é perda que não se recupera. O que o plano guarda de verdade é o total e o
 * agrupamento — e é só isso que se perde aqui.
 */
export async function deleteSessionPlan(
  planId: string,
  atendimentosDoPlano: Attendance[]
): Promise<void> {
  const batch = writeBatch(db);
  atendimentosDoPlano.forEach((a) => {
    batch.update(doc(db, ATTENDANCES_COLLECTION, a.id), {
      planoId: deleteField(),
      updatedAt: new Date().toISOString(),
    });
  });
  batch.delete(doc(db, SESSION_PLANS_COLLECTION, planId));
  await batch.commit();
}

// ==========================================
// FICHAS DE AVALIAÇÃO
// ==========================================

/**
 * Põe uma ficha de avaliação lida do banco numa forma em que as telas possam confiar.
 *
 * Mesmo cuidado de `normalizarTemplateLido`, e pela mesma razão: campo que deveria ser array
 * volta como mapa de chaves numéricas em backup reimportado e em gravação antiga, e o TypeScript
 * continua jurando que é array até alguém chamar `.map` e apagar a tela.
 */
function normalizarFichaAvaliacaoLida(f: EvaluationTemplate): EvaluationTemplate {
  const bruto = f as unknown as Record<string, unknown>;
  return {
    ...f,
    nome: f.nome || 'Ficha sem nome',
    procedureIds: paraArray<string>(bruto.procedureIds),
    categorias: paraArray<string>(bruto.categorias),
    perguntas: paraArray<AnamnesisQuestion>(bruto.perguntas),
    temFotoSessao: !!f.temFotoSessao,
  };
}

function subscribeToEvaluationTemplatesDireto(
  onUpdate: (data: EvaluationTemplate[]) => void,
  onError?: (err: Error) => void
) {
  const colRef = collection(db, EVALUATION_TEMPLATES_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: EvaluationTemplate[] = [];
      snapshot.forEach((docSnap) => {
        items.push(
          normalizarFichaAvaliacaoLida({
            ...(docSnap.data() as EvaluationTemplate),
            id: docSnap.id,
          })
        );
      });
      items.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
      onUpdate(items);
    },
    (error) => {
      if (isQuotaOrOfflineError(error)) {
        console.warn('Evaluation templates subscription offline/cota diaria atingida.');
      } else {
        console.error('Evaluation templates subscription error:', error);
      }
      if (onError) onError(error);
    }
  );
}

export function subscribeToEvaluationTemplates(
  onUpdate: (data: EvaluationTemplate[]) => void,
  onError?: (err: Error) => void
) {
  return subscribeShared<EvaluationTemplate[]>(
    'evaluation_templates',
    subscribeToEvaluationTemplatesDireto,
    onUpdate,
    onError
  );
}

/**
 * Grava a ficha-modelo, subindo ao Storage qualquer imagem que tenha chegado como data URL.
 *
 * Imagem nunca vai para dentro do documento: o teto é 1 MB e a cota do Firestore é por KB
 * gravado, então um mapa anatômico em base64 estoura os dois de uma vez. `subirImagemOuManter`
 * devolve intacta a URL que já é do Storage, o que torna salvar de novo sem mexer nas fotos uma
 * operação sem upload nenhum.
 */
export async function saveEvaluationTemplate(ficha: EvaluationTemplate): Promise<void> {
  const pasta = `avaliacoes/${ficha.id}`;
  const [modelo, feminino, masculino] = await Promise.all([
    subirImagemOuManter(ficha.fotoModeloUrl || '', pasta),
    subirImagemOuManter(ficha.fotoModeloFemininoUrl || '', pasta),
    subirImagemOuManter(ficha.fotoModeloMasculinoUrl || '', pasta),
  ]);

  const docRef = doc(db, EVALUATION_TEMPLATES_COLLECTION, ficha.id);
  await setDoc(
    docRef,
    cleanForFirestore({
      ...ficha,
      fotoModeloUrl: modelo || undefined,
      fotoModeloFemininoUrl: feminino || undefined,
      fotoModeloMasculinoUrl: masculino || undefined,
      updatedAt: new Date().toISOString(),
    }),
    { merge: true }
  );
}

export async function deleteEvaluationTemplate(fichaId: string): Promise<void> {
  await deleteDoc(doc(db, EVALUATION_TEMPLATES_COLLECTION, fichaId));
}

// ---- Perguntas gerais de avaliação (valem para todo procedimento) ----

function subscribeToEvaluationGeneralQuestionsDireto(
  onUpdate: (data: AnamnesisQuestion[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(collection(db, EVALUATION_GENERAL_QUESTIONS_COLLECTION), orderBy('ordem', 'asc'));
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
        console.warn('Evaluation general questions subscription offline/cota diaria atingida.');
      } else {
        console.error('Evaluation general questions subscription error:', error);
      }
      if (onError) onError(error);
    }
  );
}

export function subscribeToEvaluationGeneralQuestions(
  onUpdate: (data: AnamnesisQuestion[]) => void,
  onError?: (err: Error) => void
) {
  return subscribeShared<AnamnesisQuestion[]>(
    'evaluation_general_questions',
    subscribeToEvaluationGeneralQuestionsDireto,
    onUpdate,
    onError
  );
}

export async function saveEvaluationGeneralQuestion(question: AnamnesisQuestion): Promise<void> {
  const docRef = doc(db, EVALUATION_GENERAL_QUESTIONS_COLLECTION, question.id);
  await setDoc(docRef, cleanForFirestore(question), { merge: true });
}

export async function saveAllEvaluationGeneralQuestions(
  questions: AnamnesisQuestion[]
): Promise<void> {
  const batch = writeBatch(db);
  questions.forEach((q) => {
    batch.set(doc(db, EVALUATION_GENERAL_QUESTIONS_COLLECTION, q.id), cleanForFirestore(q), {
      merge: true,
    });
  });
  await batch.commit();
}

export async function deleteEvaluationGeneralQuestion(questionId: string): Promise<void> {
  await deleteDoc(doc(db, EVALUATION_GENERAL_QUESTIONS_COLLECTION, questionId));
}

// ---- Avaliações preenchidas ----

/**
 * A avaliação de um atendimento, ou `null`.
 *
 * Leitura direta por id — o documento **é** o atendimento (ver `EvaluationRecord`), então não há
 * query nem índice envolvido. É o que permite carregar a avaliação só quando alguém abre a ficha,
 * mantendo o peso dela fora de `subscribeToAttendances`, que baixa a coleção inteira em toda
 * sessão.
 */
export async function getEvaluationRecord(
  atendimentoId: string
): Promise<EvaluationRecord | null> {
  const snap = await getDoc(doc(db, EVALUATION_RECORDS_COLLECTION, atendimentoId));
  if (!snap.exists()) return null;
  const bruto = snap.data() as unknown as Record<string, unknown>;
  return {
    ...(snap.data() as EvaluationRecord),
    id: snap.id,
    perguntasSnapshot: paraArray<AnamnesisQuestion>(bruto.perguntasSnapshot),
    respostas: (bruto.respostas as Record<string, any>) || {},
  };
}

/**
 * Grava a avaliação e acende a marca no atendimento, no mesmo lote.
 *
 * O lote existe para as duas coisas não divergirem: avaliação gravada com o atendimento sem marca
 * viraria uma ficha preenchida que continua aparecendo na fila de pendentes para sempre, e a marca
 * sem a avaliação seria um selo de "avaliada" que abre vazio.
 */
export async function saveEvaluationRecord(registro: EvaluationRecord): Promise<void> {
  const pasta = `avaliacoes/registros/${registro.atendimentoId}`;
  const [modelo, modeloAnotada, sessao, sessaoAnotada] = await Promise.all([
    subirImagemOuManter(registro.fotoModeloUrl || '', pasta),
    subirImagemOuManter(registro.fotoModeloAnotadaUrl || '', pasta),
    subirImagemOuManter(registro.fotoSessaoUrl || '', pasta),
    subirImagemOuManter(registro.fotoSessaoAnotadaUrl || '', pasta),
  ]);

  const agora = new Date().toISOString();
  const batch = writeBatch(db);

  batch.set(
    doc(db, EVALUATION_RECORDS_COLLECTION, registro.atendimentoId),
    cleanForFirestore({
      ...registro,
      id: registro.atendimentoId,
      fotoModeloUrl: modelo || undefined,
      fotoModeloAnotadaUrl: modeloAnotada || undefined,
      fotoSessaoUrl: sessao || undefined,
      fotoSessaoAnotadaUrl: sessaoAnotada || undefined,
      preenchidoEm: registro.preenchidoEm || agora,
      updatedAt: agora,
    }),
    { merge: true }
  );

  batch.update(doc(db, ATTENDANCES_COLLECTION, registro.atendimentoId), {
    avaliacaoPreenchidaEm: registro.preenchidoEm || agora,
    updatedAt: agora,
  });

  await batch.commit();
}

/** Apaga a avaliação e apaga a marca no atendimento — o inverso exato de `saveEvaluationRecord`. */
export async function deleteEvaluationRecord(atendimentoId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, EVALUATION_RECORDS_COLLECTION, atendimentoId));
  batch.update(doc(db, ATTENDANCES_COLLECTION, atendimentoId), {
    avaliacaoPreenchidaEm: deleteField(),
    updatedAt: new Date().toISOString(),
  });
  await batch.commit();
}

/**
 * Encerra a anamnese manualmente, fechando o link da paciente.
 *
 * A trava automática depende de haver atendimento realizado lançado no sistema; este é o caminho
 * para a clínica que não usa o módulo de atendimentos com disciplina. Ver `anamneseFechada()`.
 */
export async function encerrarAnamnese(recordId: string): Promise<void> {
  const agora = new Date().toISOString();
  await updateDoc(doc(db, ANAMNESIS_RECORDS_COLLECTION, recordId), {
    encerradaEm: agora,
    updatedAt: agora,
  });
}

/** Reabre a ficha encerrada à mão. Não destrava o que a regra do atendimento fechou. */
export async function reabrirAnamnese(recordId: string): Promise<void> {
  await updateDoc(doc(db, ANAMNESIS_RECORDS_COLLECTION, recordId), {
    encerradaEm: deleteField(),
    updatedAt: new Date().toISOString(),
  });
}

/** Atalho local: evita a leitura de confirmação em toda abertura, depois da primeira. */
const MIGRACAO_AVALIACAO_LOCAL_KEY = 'lavie:avaliacao-separada:v1';

/** As migrações que já rodaram nesta clínica. Documento único, lido do servidor. */
async function migracoesAplicadasNaClinica(): Promise<string[] | null> {
  try {
    const snap = await getDocFromServer(doc(db, CLINIC_SETTINGS_COLLECTION, MIGRATIONS_DOC_ID));
    if (!snap.exists()) return [];
    return paraArray<string>((snap.data() as Record<string, unknown>).aplicadas);
  } catch (e) {
    console.warn('Não foi possível ler o marcador de migrações:', e);
    return null;
  }
}

/**
 * Tira as perguntas da profissional de dentro das fichas de anamnese e as instala como fichas de
 * avaliação, uma vez por clínica.
 *
 * O que ela move, por ficha de anamnese que tenha alguma pergunta `publicoAlvo: 'medico'`:
 * as perguntas em si, e a referência do mapa anatômico anotável (só a URL do Storage — nenhuma
 * imagem é reenviada). O que ela **não** faz é apagar os campos `fotoModelo*` da anamnese:
 * `BlankAnamnesisSheet` ainda os lê para imprimir ficha em branco, e apagar quebraria isso. Eles
 * ficam como legado, ignorados no preenchimento novo.
 *
 * O controle mora no banco (`clinic_settings/migrations`), e não no localStorage, porque a
 * pergunta que ele responde é sobre a clínica, não sobre o navegador: uma marca local faria tudo
 * isto rodar de novo em cada aparelho novo e ressuscitar na anamnese perguntas que a equipe
 * tivesse apagado de propósito.
 *
 * Fichas `oculta` ficam de fora. São as treze do laser por área, já aposentadas — criar treze
 * fichas de avaliação a partir delas reconstruiria exatamente a duplicação que aposentá-las
 * resolveu, e as perguntas delas não renderizam em preenchimento nenhum de qualquer forma.
 */
async function migrarPerguntasProfissionalParaAvaliacao(): Promise<void> {
  try {
    if (localStorage.getItem(MIGRACAO_AVALIACAO_LOCAL_KEY)) return;
  } catch {
    // localStorage indisponível — segue pela leitura no servidor.
  }

  const jaAplicadas = await migracoesAplicadasNaClinica();
  if (jaAplicadas === null) return; // leitura falhou; tenta de novo no próximo boot
  if (jaAplicadas.includes(MIGRACAO_AVALIACAO)) {
    try {
      localStorage.setItem(MIGRACAO_AVALIACAO_LOCAL_KEY, '1');
    } catch {
      // sem atalho local; a leitura acima continua resolvendo
    }
    return;
  }

  try {
    // Do servidor nos três casos: um cache frio devolveria as fichas sem o que a equipe
    // acrescentou na tela, e as gravações abaixo apagariam esse trabalho.
    const [tplSnap, procSnap, gerSnap] = await Promise.all([
      getDocsFromServer(collection(db, ANAMNESIS_TEMPLATES_COLLECTION)),
      getDocsFromServer(collection(db, PROCEDURES_COLLECTION)),
      getDocsFromServer(collection(db, ANAMNESIS_GENERAL_QUESTIONS_COLLECTION)),
    ]);

    const catalogo: Procedure[] = [];
    procSnap.forEach((d) => catalogo.push({ ...(d.data() as Procedure), id: d.id }));

    const batch = writeBatch(db);
    let mexeu = false;

    const todas: AnamnesisTemplate[] = [];
    tplSnap.forEach((d) => todas.push({ ...(d.data() as AnamnesisTemplate), id: d.id }));

    // Todo o "o que vai para onde" mora em `planejarMigracao`, que roda sem banco e é conferido
    // por `scripts/verificar-migracao-avaliacao.ts` e ensaiado contra backup real por
    // `scripts/ensaiar-migracao-avaliacao.ts`. Aqui só se traduz o plano em gravações.
    const plano = planejarMigracao(todas, catalogo);

    plano.fichas.forEach((ficha) => {
      batch.set(
        doc(db, EVALUATION_TEMPLATES_COLLECTION, ficha.id),
        cleanForFirestore({ ...ficha, updatedAt: new Date().toISOString() }),
        { merge: true }
      );
      mexeu = true;
    });

    plano.anamneses.forEach((alvo) => {
      const original = todas.find((t) => t.id === alvo.id);
      batch.update(doc(db, ANAMNESIS_TEMPLATES_COLLECTION, alvo.id), {
        perguntasEspecificas: alvo.perguntasQueFicam.map((q) => cleanForFirestore(q)),
        migracoesAplicadas: Array.from(
          new Set([...(paraArray<string>(original?.migracoesAplicadas) || []), MIGRACAO_AVALIACAO])
        ),
        updatedAt: new Date().toISOString(),
      });
      mexeu = true;
    });

    // Perguntas gerais marcadas como da profissional viram perguntas gerais de avaliação: valem
    // para toda avaliação, venha de onde vier o procedimento.
    gerSnap.forEach((d) => {
      const q = { ...(d.data() as AnamnesisQuestion), id: d.id };
      if ((q.publicoAlvo || 'paciente') !== 'medico') return;
      batch.set(
        doc(db, EVALUATION_GENERAL_QUESTIONS_COLLECTION, q.id),
        cleanForFirestore({ ...q, publicoAlvo: undefined }),
        { merge: true }
      );
      batch.delete(doc(db, ANAMNESIS_GENERAL_QUESTIONS_COLLECTION, q.id));
      mexeu = true;
    });

    batch.set(
      doc(db, CLINIC_SETTINGS_COLLECTION, MIGRATIONS_DOC_ID),
      {
        aplicadas: Array.from(new Set([...jaAplicadas, MIGRACAO_AVALIACAO])),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    await batch.commit();
    if (mexeu) {
      console.log('Perguntas da profissional migradas para fichas de avaliação.');
    }

    try {
      localStorage.setItem(MIGRACAO_AVALIACAO_LOCAL_KEY, '1');
    } catch {
      // sem atalho local; a leitura do marcador continua resolvendo
    }
  } catch (e) {
    // Não derruba o boot: a migração tenta de novo na próxima abertura. O app funciona com as
    // perguntas ainda na anamnese — a tela nova simplesmente mostra menos fichas.
    //
    // `permission-denied` tem mensagem própria porque é a causa esperada logo depois de subir
    // esta versão: as coleções `evaluation_*` são novas e caem no `allow read, write: if false`
    // do catch-all até `firestore.rules` ser publicado. Sem dizer isto em voz alta, o sintoma é
    // "as perguntas do profissional continuam na anamnese" e a causa fica invisível.
    if ((e as { code?: string })?.code === 'permission-denied') {
      console.error(
        'MIGRAÇÃO DAS FICHAS DE AVALIAÇÃO BLOQUEADA: o banco recusou a escrita em ' +
          '"evaluation_templates". As regras novas ainda não foram publicadas. Rode ' +
          '`firebase deploy --only firestore:rules,storage` e recarregue a página. ' +
          'Nada foi alterado; a migração roda sozinha na próxima abertura.'
      );
    } else {
      console.warn('Migração das fichas de avaliação falhou; tentará de novo:', e);
    }
  }
}

/** Atalho local da instalação das fichas padrão, pelo mesmo motivo do atalho da migração. */
const FICHAS_PADRAO_LOCAL_KEY = 'lavie:fichas-avaliacao-padrao:v1';

/**
 * Instala as fichas de avaliação dos demais procedimentos do catálogo — microfocado facial e
 * corporal, drenagem, lipedema, ozonioterapia, soroterapia, íntimo e capilar.
 *
 * Existe porque `DEFAULT_EVALUATION_TEMPLATES` só é gravado em clínica **nova**, quando as duas
 * coleções nascem juntas. A clínica que já está rodando chega aqui com as fichas que a migração
 * das perguntas da profissional produziu — laser e glúteo — e mais nada: todo o resto do catálogo
 * abriria a avaliação mostrando só o campo de observações.
 *
 * O que ela grava é sempre **acréscimo**: `planejarInstalacaoDeFichasPadrao` deixa de fora o id
 * que já existe e o alvo que já tem ficha, então nada que a equipe editou na tela é sobrescrito.
 * Mesmo assim o `set` vai sem `merge`, porque o que passa pelo filtro é, por definição, documento
 * que ainda não existe.
 */
async function instalarFichasDeAvaliacaoPadrao(): Promise<void> {
  try {
    if (localStorage.getItem(FICHAS_PADRAO_LOCAL_KEY)) return;
  } catch {
    // localStorage indisponível — segue pela leitura no servidor.
  }

  const jaAplicadas = await migracoesAplicadasNaClinica();
  if (jaAplicadas === null) return; // leitura falhou; tenta de novo no próximo boot
  if (jaAplicadas.includes(MIGRACAO_FICHAS_PADRAO)) {
    try {
      localStorage.setItem(FICHAS_PADRAO_LOCAL_KEY, '1');
    } catch {
      // sem atalho local; a leitura acima continua resolvendo
    }
    return;
  }

  try {
    const [avalSnap, procSnap] = await Promise.all([
      getDocsFromServer(collection(db, EVALUATION_TEMPLATES_COLLECTION)),
      getDocsFromServer(collection(db, PROCEDURES_COLLECTION)),
    ]);

    const catalogo: Procedure[] = [];
    procSnap.forEach((d) => catalogo.push({ ...(d.data() as Procedure), id: d.id }));

    // Catálogo vazio não é "clínica sem procedimentos": é leitura que não trouxe o que devia, e
    // toda ficha padrão seria descartada por não ter alvo — de forma definitiva, porque a marca
    // ficaria gravada. Sai sem marcar nada e tenta de novo na próxima abertura.
    if (catalogo.length === 0) return;

    const existentes: EvaluationTemplate[] = [];
    avalSnap.forEach((d) => existentes.push({ ...(d.data() as EvaluationTemplate), id: d.id }));

    const aInstalar = planejarInstalacaoDeFichasPadrao(
      FICHAS_AVALIACAO_DEMAIS_PROCEDIMENTOS,
      existentes,
      catalogo
    );

    const batch = writeBatch(db);
    aInstalar.forEach((ficha) => {
      batch.set(
        doc(db, EVALUATION_TEMPLATES_COLLECTION, ficha.id),
        cleanForFirestore({ ...ficha, updatedAt: new Date().toISOString() })
      );
    });

    batch.set(
      doc(db, CLINIC_SETTINGS_COLLECTION, MIGRATIONS_DOC_ID),
      {
        aplicadas: Array.from(new Set([...jaAplicadas, MIGRACAO_FICHAS_PADRAO])),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    await batch.commit();
    if (aInstalar.length > 0) {
      console.log(
        `Fichas de avaliação instaladas: ${aInstalar.map((f) => f.nome).join(', ')}.`
      );
    }

    try {
      localStorage.setItem(FICHAS_PADRAO_LOCAL_KEY, '1');
    } catch {
      // sem atalho local; a leitura do marcador continua resolvendo
    }
  } catch (e) {
    if ((e as { code?: string })?.code === 'permission-denied') {
      console.error(
        'INSTALAÇÃO DAS FICHAS DE AVALIAÇÃO BLOQUEADA: o banco recusou a escrita em ' +
          '"evaluation_templates". Rode `firebase deploy --only firestore:rules,storage` e ' +
          'recarregue a página. Nada foi alterado; roda sozinha na próxima abertura.'
      );
    } else {
      console.warn('Instalação das fichas de avaliação padrão falhou; tentará de novo:', e);
    }
  }
}
