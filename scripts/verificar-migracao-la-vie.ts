/**
 * Testa `scripts/migrar-la-vie.ts` com dados falsos, nos emuladores: uma "La Vie de mentira"
 * (projeto `demo-lavie`, banco `banco-novo`) com coleções, subcoleção, documento fantasma, datas,
 * URLs de fotos em vários campos, arquivos com token e logins — e a Zulia (`demo-zulia`) de
 * destino. Nada toca em projeto de verdade.
 *
 *   npx -y firebase-tools@15 emulators:exec --only auth,firestore,storage \
 *     --config zulia/firebase.json --project demo-zulia "npx tsx scripts/verificar-migracao-la-vie.ts"
 *
 * Confere: ensaio → conferir sem diferenças → apagar; aplicar → conferir sem diferenças; URLs
 * reescritas com o mesmo token; datas que continuam datas; logins com os mesmos uids e as claims
 * certas; quem não é da equipe fica de fora; o dono entra como dono; rodar de novo não estraga nada.
 */
import { Timestamp } from 'firebase-admin/firestore';
import { abrirZulia } from './zuliaAdmin';
import {
  PROJETO_ORIGEM_DO_EMULADOR,
  abrirOrigem,
  apagarEnsaio,
  conferir,
  migrar,
  reescreverUrls,
  semDiferencas,
} from './migrar-la-vie';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};
const lancou = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return '';
  } catch (e) {
    return (e as Error).message;
  }
};

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  console.error('Rode dentro dos emuladores, com auth, firestore e storage (ver o topo do arquivo).');
  process.exit(1);
}

const BUCKET_ANTIGO = `${PROJETO_ORIGEM_DO_EMULADOR}.appspot.com`;
const url = (caminho: string, token: string, bucket = BUCKET_ANTIGO) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(caminho)}?alt=media&token=${token}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function main() {
  const origem = abrirOrigem({ emulador: true });
  const destino = abrirZulia({ emulador: true });
  const NOVO = destino.config.storageBucket;

  console.log('\nURLs (sem banco)');
  const reescrita = reescreverUrls(url('clinica/logo.png', 'T1'), [BUCKET_ANTIGO], NOVO, 'clinicas/lv/');
  ok('URL de download: bucket novo, caminho na clínica, mesmo token', reescrita === url('clinicas/lv/clinica/logo.png', 'T1', NOVO), reescrita);
  ok(
    'URL pública do Cloud Storage',
    reescreverUrls(`https://storage.googleapis.com/${BUCKET_ANTIGO}/a/b.jpg`, [BUCKET_ANTIGO], NOVO, 'clinicas/lv/') ===
      `https://storage.googleapis.com/${NOVO}/clinicas/lv/a/b.jpg`
  );
  ok('gs://', reescreverUrls(`gs://${BUCKET_ANTIGO}/a.jpg`, [BUCKET_ANTIGO], NOVO, 'clinicas/lv/') === `gs://${NOVO}/clinicas/lv/a.jpg`);
  ok('texto sem URL não muda', reescreverUrls('Botox na testa', [BUCKET_ANTIGO], NOVO, 'clinicas/lv/') === 'Botox na testa');
  ok('URL de outro bucket não muda', reescreverUrls(url('x.jpg', 'T', 'outro.appspot.com'), [BUCKET_ANTIGO], NOVO, 'p/') === url('x.jpg', 'T', 'outro.appspot.com'));

  // ==========================================
  // A LA VIE DE MENTIRA
  // ==========================================
  const criadoEm = Timestamp.fromDate(new Date('2026-03-01T12:00:00Z'));
  const usuarios = [
    { uid: 'uid-karoline', email: 'karoline@lavie.invalid', password: 'senha-da-karoline-1' },
    { uid: 'uid-prof', email: 'prof@lavie.invalid', password: 'senha-da-prof-1' },
    { uid: 'uid-avulsa', email: 'avulsa@lavie.invalid', password: 'senha-avulsa-1' },
    { uid: 'uid-dono', email: 'dono@zulia.invalid', password: 'senha-do-dono-1' },
  ];
  for (const u of usuarios) await origem.auth.createUser(u);
  const lote = origem.db.batch();
  lote.set(origem.db.doc('clinic_settings/main_profile'), {
    name: 'La Vie - Clínica de Estética Facial e Corporal',
    logoUrl: url('clinica/logo.png', 'T1'),
    professionals: [
      { id: 'doc-karoline', name: 'Dra. Karoline', uid: 'uid-karoline', email: 'karoline@lavie.invalid', isAdmin: true, photoUrl: url('clinica/equipe/k.png', 'T5') },
      { id: 'doc-prof', name: 'Profissional', uid: 'uid-prof', email: 'prof@lavie.invalid', isAdmin: false },
      { id: 'doc-dono', name: 'João', uid: 'uid-dono', email: 'dono@zulia.invalid', isAdmin: true },
      { id: 'doc-sem-login', name: 'Sem login' },
    ],
    equipeUids: ['uid-dono', 'uid-karoline', 'uid-prof'],
  });
  lote.set(origem.db.doc('clinic_settings/public_profile'), { name: 'La Vie' });
  lote.set(origem.db.doc('clinic_settings/google_agenda'), { contas: { 'doc-karoline': { tokenCifrado: 'v1.abc', calendarioId: 'c' } } });
  lote.set(origem.db.doc('procedures/proc-a'), {
    title: 'Botox',
    images: [url('procedimentos/proc-a/1.png', 'T2'), 'https://images.unsplash.com/x.jpg'],
    criadoEm,
    detalhes: { fotos: [{ url: url('procedimentos/proc-a/1.png', 'T2'), legenda: 'antes' }] },
  });
  lote.set(origem.db.doc('patients/pat-1'), { nome: 'Ana', photoUrl: url('anamnese/fotos-pacientes/a.png', 'T3'), criadoEm });
  lote.set(origem.db.doc('quotes/q1'), {
    numero: '2026-0001',
    comprovante: { url: url('orcamentos/q1/comprovantes/c.pdf', 'T4'), tipo: 'application/pdf' },
  });
  lote.set(origem.db.doc('quotes/q1/historico/h1'), { evento: 'enviado', em: criadoEm });
  lote.set(origem.db.doc('anamnesis_records/r1'), {
    fotoModeloUrl: `https://storage.googleapis.com/${BUCKET_ANTIGO}/anamnese/fichas-modelo/t/m.png`,
    fotoUrl: `gs://${BUCKET_ANTIGO}/anamnese/fotos-pacientes/a.png`,
    vazio: null,
    numeros: [1, 2, 3],
  });
  // Documento "fantasma": não existe, só tem subcoleção.
  lote.set(origem.db.doc('fantasma/x/filhos/y'), { ok: true });
  await lote.commit();
  const arquivos: Array<[string, string, string]> = [
    ['clinica/logo.png', 'T1', 'image/png'],
    ['clinica/equipe/k.png', 'T5', 'image/png'],
    ['procedimentos/proc-a/1.png', 'T2', 'image/png'],
    ['anamnese/fotos-pacientes/a.png', 'T3', 'image/png'],
    ['anamnese/fichas-modelo/t/m.png', 'T6', 'image/png'],
    ['orcamentos/q1/comprovantes/c.pdf', 'T4', 'application/pdf'],
  ];
  for (const [nome, token, tipo] of arquivos) {
    await origem.bucket.file(nome).save(PNG, { resumable: false, metadata: { contentType: tipo, metadata: { firebaseStorageDownloadTokens: token } } });
  }
  // Uma clínica que já existe na Zulia e não é da migração.
  await destino.db.doc('clinicas/outra').set({ nome: 'Outra clínica' });

  // ==========================================
  console.log('\nEnsaio (só dados, sem logins)');
  const ensaio = await migrar(origem, destino, { clinicaId: 'ensaio-teste', ensaio: true });
  ok('copiou as coleções da raiz', ['clinic_settings', 'procedures', 'patients', 'quotes', 'anamnesis_records'].every((c) => ensaio.documentos.has(c)), [...ensaio.documentos.keys()].join(','));
  ok('e as subcoleções (também a do documento fantasma)', ensaio.documentos.get('quotes/*/historico') === 1 && ensaio.documentos.get('fantasma/*/filhos') === 1);
  ok('copiou os arquivos', [...ensaio.arquivos.values()].reduce((a, b) => a + b, 0) === arquivos.length);
  ok('não importou login nenhum', !ensaio.logins && (await destino.auth.getUser('uid-karoline').catch(() => null)) === null);
  const dEnsaio = await conferir(origem, destino, { clinicaId: 'ensaio-teste', ensaio: true });
  ok('conferir o ensaio: sem diferenças', semDiferencas(dEnsaio), JSON.stringify(dEnsaio));
  ok('a clínica do ensaio está marcada como ensaio', (await destino.db.doc('clinicas/ensaio-teste').get()).data()?.situacao === 'ensaio');
  await apagarEnsaio(destino, 'ensaio-teste');
  const [restos] = await destino.bucket.getFiles({ prefix: 'clinicas/ensaio-teste/' });
  ok('apagar o ensaio tira documentos e arquivos', !(await destino.db.doc('clinicas/ensaio-teste').get()).exists && restos.length === 0 && (await destino.db.doc('clinicas/ensaio-teste/patients/pat-1').get()).exists === false);
  ok('apagar recusa o que não é ensaio', (await lancou(() => apagarEnsaio(destino, 'outra'))).includes('não é um ensaio'));
  ok('migrar recusa um id que já é de outra clínica', (await lancou(() => migrar(origem, destino, { clinicaId: 'outra', ensaio: false }))).includes('já existe'));

  // ==========================================
  console.log('\nAplicar (dados, arquivos, logins e a clínica)');
  const ID = 'laVieTst';
  const r = await migrar(origem, destino, { clinicaId: ID, ensaio: false, dono: 'Dono@Zulia.invalid' });
  ok('a equipe veio com os papéis do perfil', r.logins?.equipe['uid-karoline'] === 'admin' && r.logins?.equipe['uid-prof'] === 'profissional', JSON.stringify(r.logins?.equipe));
  ok('a conta avulsa ficou de fora', r.logins?.deFora.includes('avulsa@lavie.invalid') === true);
  ok('o dono entrou como dono', r.logins?.dono === 'uid-dono');
  ok('sem erros nos logins', (r.logins?.erros.length || 0) === 0, r.logins?.erros.join(' | '));
  const d = await conferir(origem, destino, { clinicaId: ID, ensaio: false, dono: 'dono@zulia.invalid' });
  ok('conferir: sem diferenças', semDiferencas(d), JSON.stringify(d));

  const proc = (await destino.db.doc(`clinicas/${ID}/procedures/proc-a`).get()).data()!;
  ok('images[] reescrita, com o mesmo token', proc.images[0] === url(`clinicas/${ID}/procedimentos/proc-a/1.png`, 'T2', NOVO), proc.images[0]);
  ok('URL de fora (unsplash) intacta', proc.images[1] === 'https://images.unsplash.com/x.jpg');
  ok('URL dentro de lista de mapas reescrita', proc.detalhes.fotos[0].url === url(`clinicas/${ID}/procedimentos/proc-a/1.png`, 'T2', NOVO));
  ok('data continua Timestamp, com o mesmo instante', proc.criadoEm instanceof Timestamp && proc.criadoEm.isEqual(criadoEm));
  const perfil = (await destino.db.doc(`clinicas/${ID}/clinic_settings/main_profile`).get()).data()!;
  ok('logoUrl e foto da equipe reescritas', perfil.logoUrl === url(`clinicas/${ID}/clinica/logo.png`, 'T1', NOVO) && perfil.professionals[0].photoUrl.includes(NOVO));
  const q = (await destino.db.doc(`clinicas/${ID}/quotes/q1`).get()).data()!;
  ok('comprovante.url reescrita', q.comprovante.url === url(`clinicas/${ID}/orcamentos/q1/comprovantes/c.pdf`, 'T4', NOVO));
  const rec = (await destino.db.doc(`clinicas/${ID}/anamnesis_records/r1`).get()).data()!;
  ok(
    'URL pública e gs:// reescritas; null e números intactos',
    rec.fotoModeloUrl === `https://storage.googleapis.com/${NOVO}/clinicas/${ID}/anamnese/fichas-modelo/t/m.png` &&
      rec.fotoUrl === `gs://${NOVO}/clinicas/${ID}/anamnese/fotos-pacientes/a.png` &&
      rec.vazio === null &&
      JSON.stringify(rec.numeros) === '[1,2,3]'
  );
  ok('o Google Agenda da La Vie foi junto', (await destino.db.doc(`clinicas/${ID}/clinic_settings/google_agenda`).get()).data()?.contas?.['doc-karoline']?.tokenCifrado === 'v1.abc');
  const [md] = await destino.bucket.file(`clinicas/${ID}/clinica/logo.png`).getMetadata();
  ok('o arquivo copiado tem o mesmo token', (md.metadata as Record<string, string>)?.firebaseStorageDownloadTokens === 'T1');

  const clinica = (await destino.db.doc(`clinicas/${ID}`).get()).data()!;
  ok(
    'a clínica: completo, cortesia, Google Agenda, ativa',
    clinica.plano === 'completo' && clinica.cortesia === true && clinica.recursos?.googleAgenda === true && clinica.situacao === 'ativa'
  );
  ok('a dona é a admin (Karoline), e o índice tem a equipe', clinica.dona?.uid === 'uid-karoline' && clinica.equipe?.['uid-prof'] === 'profissional' && !clinica.equipe?.['uid-dono']);
  const k = await destino.auth.getUser('uid-karoline');
  ok('Karoline: mesmo uid e e-mail, claim de admin da La Vie', k.email === 'karoline@lavie.invalid' && k.customClaims?.clinicaId === ID && k.customClaims?.papel === 'admin');
  const dono = await destino.auth.getUser('uid-dono');
  ok('o dono: só donoDaPlataforma, sem clínica', dono.customClaims?.donoDaPlataforma === true && !dono.customClaims?.clinicaId);
  ok('a avulsa não existe na Zulia', (await destino.auth.getUser('uid-avulsa').catch(() => null)) === null);

  // ==========================================
  console.log('\nRodar de novo (caiu no meio, por exemplo)');
  const r2 = await migrar(origem, destino, { clinicaId: ID, ensaio: false, dono: 'dono@zulia.invalid' });
  ok('roda de novo sem erro', (r2.logins?.erros.length || 0) === 0, r2.logins?.erros.join(' | '));
  ok('e continua sem diferenças', semDiferencas(await conferir(origem, destino, { clinicaId: ID, ensaio: false, dono: 'dono@zulia.invalid' })));
  ok('um ensaio no id da clínica de verdade é recusado', (await lancou(() => migrar(origem, destino, { clinicaId: ID, ensaio: true }))).includes('não misture'));

  await origem.encerrar();
  await destino.encerrar();
  console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} falha(s).`);
  console.log(
    '(As senhas não são conferidas aqui: o emulador não guarda hash scrypt. No dia, a conferência é a\n' +
      ' Karoline entrar com a senha de sempre.)'
  );
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
