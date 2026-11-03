/**
 * Confere a ficha de anamnese da paciente pelo servidor (`server/fichaPublica.ts`): o que o link
 * abre, o que fica de fora, a conferência de CPF e nascimento e o que a paciente consegue gravar.
 *
 * O erro que este script caça é o de segurança: um link que devolve a ficha de outra pessoa, uma
 * ficha fechada que abre sem CPF, um envio da paciente que apaga a anotação da profissional ou
 * escolhe o id do próprio documento, um número infinito de tentativas de CPF.
 *
 * As conferências de banco rodam contra o emulador do Firestore — nunca contra o banco da clínica:
 *
 *   npx firebase-tools emulators:exec --only firestore --project demo-verificacao \
 *     "npx tsx scripts/verificar-ficha-publica.ts"
 *
 * Sem o emulador (sem FIRESTORE_EMULATOR_HOST), roda só as conferências que não usam banco.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { normalizarChave, credencialDoAmbiente } from '../server/firebaseAdmin';
import {
  ErroDaFicha,
  abrirFicha,
  criarLimitador,
  criarLimitadores,
  dadosDoCadastro,
  idDoLink,
  salvarFicha,
  urlDeImagem,
} from '../server/fichaPublica';
import { sincronizarEquipe } from '../server/equipe';
import { ehDaEquipe, mesmaEquipe, uidsDaEquipe } from '../src/utils/equipe';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

const lancaCom = async (nome: string, codigo: string, fn: () => Promise<unknown>) => {
  try {
    await fn();
    ok(nome, false, 'não lançou');
  } catch (erro) {
    ok(nome, erro instanceof ErroDaFicha && erro.codigo === codigo, erro instanceof Error ? erro.message : String(erro));
  }
};

// ==========================================
// SEM BANCO
// ==========================================

console.log('\nIds do link');
ok('id comum passa', idDoLink('rec-1712345678901') === 'rec-1712345678901');
ok('id com barra é recusado', idDoLink('patients/outra') === '');
ok('ponto-ponto é recusado', idDoLink('..') === '');
ok('id reservado é recusado', idDoLink('__x__') === '');
ok('não-texto é recusado', idDoLink({ $gt: '' }) === '');

console.log('\nImagens aceitas na ficha');
ok('Storage do Firebase', !!urlDeImagem('https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg?token=1'));
ok('imagem embutida', !!urlDeImagem('data:image/jpeg;base64,AAAA'));
ok('caminho do site', urlDeImagem('/dra-karoline.jpg') === '/dra-karoline.jpg');
ok('site qualquer é recusado', urlDeImagem('https://malicioso.example/a.jpg') === undefined);
ok('protocolo relativo é recusado', urlDeImagem('//malicioso.example/a.jpg') === undefined);
ok('javascript: é recusado', urlDeImagem('javascript:alert(1)') === undefined);

console.log('\nCadastro');
const cad = dadosDoCadastro({ nome: '  Maria  ', cpf: '123.456.789-09', genero: 'outro', dataNascimento: '1990-02-30x', juntadoA: 'x' });
ok('nome aparado', cad.nome === 'Maria');
ok('CPF só com dígitos', cad.cpf === '12345678909');
ok('gênero fora da lista some', cad.genero === undefined);
ok('nascimento mal formado some', cad.dataNascimento === undefined);
ok('campo da equipe não entra', !('juntadoA' in cad));
try {
  dadosDoCadastro({ nome: '   ' });
  ok('nome vazio é recusado', false);
} catch (e) {
  ok('nome vazio é recusado', e instanceof ErroDaFicha && e.codigo === 'nome-obrigatorio');
}

console.log('\nLimite de pedidos');
{
  let t = 0;
  const lim = criarLimitador(3, 1000, () => t);
  ok('três usos passam', lim.usar('a') && lim.usar('a') && lim.usar('a'));
  ok('o quarto é barrado', !lim.usar('a'));
  ok('outra chave não é afetada', lim.usar('b'));
  t = 1001;
  ok('a janela zera', lim.usar('a'));
}

console.log('\nEquipe');
ok('uids sem repetição e em ordem', JSON.stringify(uidsDaEquipe([{ uid: 'b' }, { uid: 'a' }, { uid: 'b' }, {}, null])) === '["a","b"]');
ok('é da equipe', ehDaEquipe([{ uid: 'x' }], 'x'));
ok('login de fora não é', !ehDaEquipe([{ uid: 'x' }], 'y'));
ok('sem login não é', !ehDaEquipe([{ uid: 'x' }], null));
ok('mesma equipe fora de ordem', mesmaEquipe(['b', 'a'], ['a', 'b']));
ok('lista ausente não é a mesma', !mesmaEquipe(undefined, ['a']));

console.log('\nCredencial do servidor');
const CHAVE_FALSA = '-----BEGIN PRIVATE KEY-----\\nQUJD\\nREVG\\n-----END PRIVATE KEY-----\\n';
ok('chave com \\n escrito vira chave', normalizarChave(`"${CHAVE_FALSA}",`).startsWith('-----BEGIN PRIVATE KEY-----\nQUJDREVG\n'));
ok('sem variáveis, sem credencial', credencialDoAmbiente({}) === null);
ok('e-mail sem chave não vale', credencialDoAmbiente({ FIREBASE_ADMIN_EMAIL: 'a@b.iam.gserviceaccount.com' }) === null);
ok(
  'e-mail e chave valem',
  credencialDoAmbiente({ FIREBASE_ADMIN_EMAIL: 'a@b.iam.gserviceaccount.com', FIREBASE_ADMIN_CHAVE: CHAVE_FALSA })?.clientEmail ===
    'a@b.iam.gserviceaccount.com'
);
ok(
  'JSON inteiro vale',
  credencialDoAmbiente({
    FIREBASE_ADMIN_CREDENCIAL: JSON.stringify({ client_email: 'c@d.iam.gserviceaccount.com', private_key: CHAVE_FALSA, project_id: 'p' }),
  })?.projectId === 'p'
);

// ==========================================
// COM O EMULADOR
// ==========================================

async function comBanco(db: Firestore) {
  const limites = criarLimitadores();
  const IP = '203.0.113.7';

  // Uma clínica de mentira.
  await db.doc('anamnesis_templates/tpl-botox').set({ procedimentoNome: 'Botox', procedimentoId: 'proc-botox' });
  await db.doc('anamnesis_templates/tpl-laser').set({ procedimentoNome: 'Laser' });
  await db.doc('patients/pat-ana').set({ nome: 'Ana', cpf: '11122233344', dataNascimento: '1990-01-01', angulosAntesDepois: [{ a: 1 }] });
  await db.doc('patients/pat-velha').set({ nome: 'Ana (duplicada)', juntadoA: 'pat-ana' });
  await db.doc('patients/pat-bia').set({ nome: 'Bia' });
  await db.doc('anamnesis_records/rec-aberta').set({
    pacienteId: 'pat-ana', templateId: 'tpl-botox', procedimentoNome: 'Botox',
    respostasGerais: { g1: 'antes' }, respostasEspecificas: {}, createdAt: '2026-01-01T00:00:00Z',
  });
  await db.doc('anamnesis_records/rec-fechada').set({
    pacienteId: 'pat-ana', templateId: 'tpl-laser', procedimentoNome: 'Laser', encerradaEm: '2026-02-01',
    respostasGerais: {}, respostasEspecificas: {}, createdAt: '2026-01-15T00:00:00Z',
  });
  await db.doc('anamnesis_records/rec-bia').set({
    pacienteId: 'pat-bia', templateId: 'tpl-botox', procedimentoNome: 'Botox',
    respostasGerais: {}, respostasEspecificas: {}, createdAt: '2026-01-01T00:00:00Z',
  });
  await db.doc('anamnesis_records/rec-anotada').set({
    pacienteId: 'pat-bia', templateId: 'tpl-laser', procedimentoNome: 'Laser',
    respostasGerais: { g1: 'x' }, respostasEspecificas: {},
    respostasProfissional: { dose: '20U' }, fotoModeloUrl: '/modelo-f.jpg', fotoModeloAnotadaUrl: 'https://firebasestorage.googleapis.com/anot.jpg',
    areasConfirmadas: [{ procedureId: 'p', nomeCurto: 'Axila' }], arquivoDe: 'pat-bia', createdAt: '2026-01-01T00:00:00Z',
  });

  console.log('\nAbrir pelo link da ficha');
  const a = await abrirFicha(db, { ficha: 'rec-aberta' }, limites, IP);
  ok('abre a ficha do link', a.ficha?.id === 'rec-aberta');
  ok('vem a paciente da ficha', a.paciente?.id === 'pat-ana');
  await lancaCom('ficha inexistente é 404', 'ficha-nao-encontrada', () => abrirFicha(db, { ficha: 'rec-nao-existe' }, limites, IP));
  await lancaCom('link sem nada é recusado', 'link-invalido', () => abrirFicha(db, {}, limites, IP));
  await lancaCom('id com barra não vira caminho', 'link-invalido', () => abrirFicha(db, { ficha: '../patients/pat-ana' }, limites, IP));

  console.log('\nFicha fechada: CPF e nascimento no servidor');
  const f = await abrirFicha(db, { ficha: 'rec-fechada' }, limites, IP);
  ok('pede confirmação', !!f.precisaConfirmar);
  ok('pede nascimento quando há um', f.precisaConfirmar?.pedeNascimento === true);
  ok('não entrega a ficha antes', f.ficha === null);
  ok('não entrega o cadastro antes', f.paciente === null);
  await lancaCom('CPF errado é recusado', 'identidade', () =>
    abrirFicha(db, { ficha: 'rec-fechada', cpf: '00000000000', nascimento: '1990-01-01' }, limites, IP)
  );
  await lancaCom('nascimento errado é recusado', 'identidade', () =>
    abrirFicha(db, { ficha: 'rec-fechada', cpf: '111.222.333-44', nascimento: '1991-01-01' }, limites, IP)
  );
  const fc = await abrirFicha(db, { ficha: 'rec-fechada', cpf: '111.222.333-44', nascimento: '1990-01-01' }, limites, IP);
  ok('CPF e nascimento certos abrem', fc.ficha?.id === 'rec-fechada' && fc.paciente?.id === 'pat-ana');
  for (let i = 0; i < 3; i++) {
    await abrirFicha(db, { ficha: 'rec-fechada', cpf: '0', nascimento: 'x' }, limites, IP).catch(() => {});
  }
  await lancaCom('depois de 5 erros, nem o CPF certo abre', 'tentativas', () =>
    abrirFicha(db, { ficha: 'rec-fechada', cpf: '11122233344', nascimento: '1990-01-01' }, limites, '198.51.100.1')
  );

  console.log('\nAbrir pelo link do modelo com paciente');
  const b = await abrirFicha(db, { anamnese: 'tpl-botox', paciente: 'pat-velha' }, limites, IP);
  ok('segue o cadastro juntado', b.paciente?.id === 'pat-ana');
  ok('reabre a ficha dela deste procedimento', b.ficha?.id === 'rec-aberta');
  const b2 = await abrirFicha(db, { anamnese: 'tpl-novo', paciente: 'pat-ana' }, limites, IP);
  ok('procedimento novo: sem ficha', b2.ficha === null);
  ok('procedimento novo: traz as respostas anteriores', !!b2.respostasAnteriores);
  const b3 = await abrirFicha(db, { anamnese: 'tpl-botox', paciente: 'pat-bia' }, limites, IP);
  ok('nunca devolve a ficha de outra paciente', b3.ficha?.id === 'rec-bia');

  console.log('\nSalvar ficha nova pelo link genérico');
  const n = await salvarFicha(db, {
    anamnese: 'tpl-botox',
    dadosPaciente: { nome: 'Carla', cpf: '999.888.777-66' },
    dadosFicha: {
      id: 'rec-escolhido-pelo-navegador', pacienteId: 'pat-ana', respostasGerais: { g1: 'sim' }, respostasEspecificas: {},
      respostasProfissional: { invadido: true }, encerradaEm: '2026-01-01', procedimentoNome: 'Outro nome',
      fotoPacienteUrl: 'https://malicioso.example/a.jpg',
    },
  });
  ok('id gerado pelo servidor', n.ficha.id.startsWith('rec-') && n.ficha.id !== 'rec-escolhido-pelo-navegador' && n.ficha.id.length > 30);
  ok('cadastro novo, não o da Ana', n.ficha.pacienteId !== 'pat-ana' && String(n.ficha.pacienteId).startsWith('pat-'));
  ok('campo da profissional não entra', n.ficha.respostasProfissional === undefined);
  ok('não nasce fechada', n.ficha.encerradaEm === undefined);
  ok('nome do procedimento vem do modelo', n.ficha.procedimentoNome === 'Botox');
  ok('imagem de fora não entra', n.ficha.fotoPacienteUrl === undefined);
  ok('origem online', n.ficha.origemPreenchimento === 'online_paciente');
  const carla = (await db.doc(`patients/${n.ficha.pacienteId}`).get()).data();
  ok('cadastro criado com CPF', carla?.cpf === '99988877766' && !!carla?.createdAt);

  console.log('\nSalvar ficha existente');
  const u = await salvarFicha(db, {
    ficha: 'rec-anotada',
    dadosPaciente: { nome: 'Bia Souza', contato: '11999990000' },
    dadosFicha: {
      respostasGerais: { g1: 'y' }, respostasEspecificas: { e1: 'z' },
      respostasProfissional: {}, fotoModeloAnotadaUrl: null, areasConfirmadas: [], arquivoDe: null,
      fotoModeloUrl: '/modelo-m.jpg', areasSolicitadas: [{ procedureId: 'p', nomeCurto: 'Buço' }],
    },
  });
  ok('respostas da paciente gravadas', u.ficha.respostasGerais?.g1 === 'y' && u.ficha.respostasEspecificas?.e1 === 'z');
  ok('respostas da profissional intactas', u.ficha.respostasProfissional?.dose === '20U');
  ok('anotação intacta', u.ficha.fotoModeloAnotadaUrl === 'https://firebasestorage.googleapis.com/anot.jpg');
  ok('foto anotada não troca de gênero', u.ficha.fotoModeloUrl === '/modelo-f.jpg');
  ok('áreas confirmadas intactas', u.ficha.areasConfirmadas?.length === 1);
  ok('marca de arquivo intacta', u.ficha.arquivoDe === 'pat-bia');
  ok('áreas pedidas gravadas', u.ficha.areasSolicitadas?.[0]?.nomeCurto === 'Buço');
  ok('nome atualizado na ficha', u.ficha.pacienteNome === 'Bia Souza');
  const bia = (await db.doc('patients/pat-bia').get()).data();
  ok('cadastro atualizado', bia?.nome === 'Bia Souza' && bia?.contato === '11999990000');

  await lancaCom('ficha fechada não aceita alteração', 'ficha-fechada', () =>
    salvarFicha(db, { ficha: 'rec-fechada', dadosPaciente: { nome: 'Ana' }, dadosFicha: { respostasGerais: { g1: 'x' } } })
  );
  await lancaCom('modelo inexistente é recusado', 'modelo-nao-encontrado', () =>
    salvarFicha(db, { anamnese: 'tpl-nao-existe', dadosPaciente: { nome: 'X' }, dadosFicha: {} })
  );

  console.log('\nSalvar pelo link do modelo com paciente');
  const m = await salvarFicha(db, {
    anamnese: 'tpl-botox', paciente: 'pat-velha',
    dadosPaciente: { nome: 'Ana' }, dadosFicha: { respostasGerais: { g1: 'depois' } },
  });
  ok('atualiza a ficha que já existia', m.ficha.id === 'rec-aberta' && m.ficha.respostasGerais?.g1 === 'depois');
  const ana = (await db.doc('patients/pat-ana').get()).data();
  ok('grava no cadastro que ficou, não no juntado', ana?.nome === 'Ana' && !!ana?.updatedAt);
  ok('o antes e depois da equipe fica', Array.isArray(ana?.angulosAntesDepois) && ana!.angulosAntesDepois.length === 1);
  const velha = (await db.doc('patients/pat-velha').get()).data();
  ok('o cadastro juntado continua só redirecionando', velha?.juntadoA === 'pat-ana' && !velha?.updatedAt);

  console.log('\nLista de logins da equipe');
  await db.doc('clinic_settings/main_profile').set({ professionals: [{ name: 'K', uid: 'u2' }, { name: 'R', uid: 'u1' }, { name: 'Sem login' }] });
  ok('corrige a lista que falta', (await sincronizarEquipe(db)) === true);
  const perfil = (await db.doc('clinic_settings/main_profile').get()).data();
  ok('lista gravada em ordem', JSON.stringify(perfil?.equipeUids) === '["u1","u2"]');
  ok('lista certa não regrava', (await sincronizarEquipe(db)) === false);
}

(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.log('\n(Sem FIRESTORE_EMULATOR_HOST: conferências de banco puladas. Ver o topo do arquivo.)');
  } else {
    const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-verificacao' }, 'verificacao');
    const db = getFirestore(app);
    db.settings({ ignoreUndefinedProperties: true });
    await comBanco(db);
  }
  console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} falha(s).`);
  process.exit(falhas === 0 ? 0 : 1);
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
