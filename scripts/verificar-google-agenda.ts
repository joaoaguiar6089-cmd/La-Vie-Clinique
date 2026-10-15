/**
 * Confere a sincronização com o Google Agenda: que agendamento vai para o Google e com que texto,
 * o que precisa ser enviado depois de cada mudança, e o servidor que guarda a autorização.
 *
 * Os erros que este script caça: um agendamento que aparece duas vezes no Google, um que nunca
 * sai de lá depois de remarcado ou trocado de profissional, uma observação interna que vaza para
 * o celular da profissional, e uma rota do servidor que aceita pedido sem o login do painel.
 *
 *   npx tsx scripts/verificar-google-agenda.ts
 */
import type { AddressInfo } from 'node:net';
import express from 'express';
import { Attendance, ContaGoogleAgenda, Procedure } from '../src/types';
import {
  assinaturaDoEvento,
  eventoDoAtendimento,
  idDoEventoGoogle,
  planejarSincronizacao,
} from '../src/utils/googleAgenda';
import { cifrar, criarRotasGoogleAgenda, decifrar, verificarLoginDoPainel } from '../server/googleAgenda';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

const HOJE = '2026-10-15';
const CLINICA = { address: 'Rua Bernardinho de Campos, 193, Centro.', cityState: 'Indaiatuba - SP' };
const CATALOGO: Procedure[] = [{ id: 'proc-botox', duration: '40 minutos' } as Procedure];

const atd = (extra: Partial<Attendance> = {}): Attendance => ({
  id: 'atd-1788619626858',
  pacienteId: 'p1',
  pacienteNome: 'Maria Aparecida Souza',
  data: '2026-10-20',
  hora: '14:30',
  procedureId: 'proc-botox',
  procedimentoNome: 'Botox',
  professionalId: 'doc-karoline',
  status: 'agendado',
  observacoes: 'Alergia a dipirona — não comentar com a acompanhante',
  createdAt: '2026-10-10T10:00:00.000Z',
  ...extra,
});

const conta = (extra: Partial<ContaGoogleAgenda> = {}): ContaGoogleAgenda => ({
  email: 'enfesteta.karoline@gmail.com',
  calendarioId: 'cal-karoline@group.calendar.google.com',
  tokenCifrado: 'v1.xxx',
  conectadoEm: '2026-10-15T12:00:00.000Z',
  ...extra,
});

const CONTAS = {
  'doc-karoline': conta(),
  'doc-juliana': conta({ email: 'juliana@gmail.com', calendarioId: 'cal-juliana@group.calendar.google.com' }),
};

/** A marca que a sincronização grava depois de o Google aceitar o evento de `a`. */
const marcaDe = (a: Attendance, calendarioId = CONTAS['doc-karoline'].calendarioId) => ({
  profissionalId: a.professionalId!,
  calendarioId,
  assinatura: assinaturaDoEvento(a.id, calendarioId, eventoDoAtendimento(a, CATALOGO, CLINICA)!),
});

const planejar = (lista: Attendance[], contas: Record<string, ContaGoogleAgenda> = CONTAS) =>
  planejarSincronizacao(lista, contas, CATALOGO, CLINICA, HOJE);

console.log('\nId do evento');
{
  const id = idDoEventoGoogle('atd-1788619626858');
  ok('só usa o alfabeto do Google (a–v, 0–9)', /^[a-v0-9]{5,1024}$/.test(id), id);
  ok('é sempre o mesmo para o mesmo atendimento', id === idDoEventoGoogle('atd-1788619626858'));
  ok('muda de um atendimento para outro', id !== idDoEventoGoogle('atd-1788619626859'));
  ok('aceita id com acento e maiúsculas', /^[a-v0-9]+$/.test(idDoEventoGoogle('Atd-Ção_9')));
}

console.log('\nTexto do evento');
{
  const e = eventoDoAtendimento(atd(), CATALOGO, CLINICA)!;
  ok('título com paciente e procedimento', e.titulo === 'Maria Aparecida Souza · Botox', e.titulo);
  ok('início no horário marcado', e.inicio === '2026-10-20T14:30:00', e.inicio);
  ok('fim pela duração do catálogo (40 min)', e.fim === '2026-10-20T15:10:00', e.fim);
  ok('local é o endereço da clínica', e.local === 'Rua Bernardinho de Campos, 193, Centro. — Indaiatuba - SP');
  ok('observação interna não vai para o Google', !JSON.stringify(e).includes('dipirona'));

  const duracao = eventoDoAtendimento(atd({ duracaoMin: 90 }), CATALOGO, CLINICA)!;
  ok('duração do registro vence a do catálogo', duracao.fim === '2026-10-20T16:00:00', duracao.fim);

  const noite = eventoDoAtendimento(atd({ hora: '23:30', duracaoMin: 60 }), CATALOGO, CLINICA)!;
  ok('atendimento que passa da meia-noite termina no dia seguinte', noite.fim === '2026-10-21T00:30:00', noite.fim);

  const fimDoAno = eventoDoAtendimento(atd({ data: '2026-12-31', hora: '23:30', duracaoMin: 60 }), CATALOGO, CLINICA)!;
  ok('e vira o ano quando precisa', fimDoAno.fim === '2027-01-01T00:30:00', fimDoAno.fim);

  const confirmado = eventoDoAtendimento(atd({ confirmadoEm: '2026-10-18T09:00:00.000Z' }), CATALOGO, CLINICA)!;
  ok('confirmado ganha ✓ no título', confirmado.titulo.startsWith('✓ '), confirmado.titulo);
  ok('e "Confirmado" na descrição', confirmado.descricao.startsWith('Confirmado pela paciente.'));

  const faltou = eventoDoAtendimento(atd({ status: 'faltou' }), CATALOGO, CLINICA)!;
  ok('falta aparece no título', faltou.titulo.startsWith('(faltou) '), faltou.titulo);

  ok('remarcado não vai para o Google', eventoDoAtendimento(atd({ status: 'remarcado' }), CATALOGO, CLINICA) === null);
  ok('sem hora não vai para o Google', eventoDoAtendimento(atd({ hora: undefined }), CATALOGO, CLINICA) === null);
  ok('sem profissional não vai para o Google', eventoDoAtendimento(atd({ professionalId: undefined }), CATALOGO, CLINICA) === null);
  ok('atendimento lançado como realizado (sem status) não vai', eventoDoAtendimento(atd({ status: undefined }), CATALOGO, CLINICA) === null);
}

console.log('\nO que enviar');
{
  const novo = planejar([atd()]);
  ok('agendamento novo de quem conectou → salvar', novo.length === 1 && novo[0].acao === 'salvar');
  ok('na conta da profissional do agendamento', novo[0]?.profissionalId === 'doc-karoline');
  ok(
    'a marca a gravar aponta para o calendário dela',
    novo[0]?.acao === 'salvar' && novo[0].marca.calendarioId === CONTAS['doc-karoline'].calendarioId
  );

  const sincronizado = atd();
  sincronizado.googleAgenda = marcaDe(sincronizado);
  ok('já enviado e sem mudança → nada', planejar([sincronizado]).length === 0);

  const novaHora = { ...sincronizado, hora: '16:00' };
  const mudou = planejar([novaHora]);
  ok('mudou a hora → salvar de novo', mudou.length === 1 && mudou[0].acao === 'salvar');

  const confirmou = { ...sincronizado, confirmadoEm: '2026-10-18T09:00:00.000Z' };
  ok('paciente confirmou → salvar (o ✓ aparece no Google)', planejar([confirmou])[0]?.acao === 'salvar');

  const compareceu = { ...sincronizado, status: 'compareceu' as const };
  ok('compareceu → atualiza a descrição', planejar([compareceu])[0]?.acao === 'salvar');

  ok('passado sem marca não é enviado ao conectar', planejar([atd({ data: '2026-10-14' })]).length === 0);
  ok('hoje é enviado', planejar([atd({ data: HOJE })]).length === 1);

  const remarcado = { ...sincronizado, status: 'remarcado' as const };
  const apagar = planejar([remarcado]);
  ok(
    'remarcado com marca → apagar e limpar a marca',
    apagar.length === 1 && apagar[0].acao === 'apagar' && apagar[0].limparMarca === true
  );

  const remarcadoNoPassado = { ...remarcado, data: '2026-10-10' };
  ok('remarcado no passado também sai do Google', planejar([remarcadoNoPassado])[0]?.acao === 'apagar');

  const trocou = { ...sincronizado, professionalId: 'doc-juliana' };
  const troca = planejar([trocou]);
  ok('trocou de profissional → duas operações', troca.length === 2, JSON.stringify(troca.map((o) => o.acao)));
  ok(
    'apaga da agenda da anterior sem limpar a marca',
    troca.some((o) => o.acao === 'apagar' && o.profissionalId === 'doc-karoline' && !o.limparMarca)
  );
  ok(
    'e salva na agenda da nova',
    troca.some((o) => o.acao === 'salvar' && o.profissionalId === 'doc-juliana')
  );

  const paraQuemNaoConectou = { ...sincronizado, professionalId: 'doc-sem-google' };
  const semGoogle = planejar([paraQuemNaoConectou]);
  ok(
    'trocou para quem não conectou → só apaga da anterior',
    semGoogle.length === 1 && semGoogle[0].acao === 'apagar' && semGoogle[0].limparMarca === true
  );

  const comErro = { ...CONTAS, 'doc-karoline': conta({ erro: 'o Google recusou a autorização' }) };
  ok('conta com erro → nada até reconectar', planejar([atd(), novaHora, remarcado], comErro).length === 0);

  const reconectou = { ...CONTAS, 'doc-karoline': conta({ calendarioId: 'cal-novo@group.calendar.google.com' }) };
  const outroCalendario = planejar([sincronizado], reconectou);
  ok(
    'reconectou noutro calendário → salva no novo',
    outroCalendario.length === 1 && outroCalendario[0].acao === 'salvar'
  );

  const { ['doc-karoline']: _, ...semKaroline } = CONTAS;
  ok('desconectou → não mexe nos eventos dela', planejar([sincronizado, remarcado], semKaroline).length === 0);

  ok('sem status (registro de visita) → nada', planejar([atd({ status: undefined })]).length === 0);
}

console.log('\nCifra da autorização');
{
  const segredo = 'GOCSPX-segredo-de-teste';
  const cifrado = cifrar('1//refresh-token-de-teste', segredo);
  ok('não guarda o token em texto', !cifrado.includes('refresh-token'));
  ok('abre com o mesmo segredo', decifrar(cifrado, segredo) === '1//refresh-token-de-teste');
  ok('cada cifra sai diferente', cifrado !== cifrar('1//refresh-token-de-teste', segredo));
  let recusou = false;
  try {
    decifrar(cifrado, 'outro-segredo');
  } catch {
    recusou = true;
  }
  ok('outro segredo não abre', recusou);
  recusou = false;
  try {
    decifrar(`${cifrado.slice(0, -4)}AAAA`, segredo);
  } catch {
    recusou = true;
  }
  ok('cifra adulterada não abre', recusou);
}

console.log('\nLogin do painel');
{
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const agora = Date.parse('2026-10-15T12:00:00Z');
  const jwt = (conteudo: Record<string, unknown>) =>
    `${b64({ alg: 'RS256', kid: 'k1' })}.${b64(conteudo)}.assinatura`;
  const base = {
    aud: 'database-dra-karoline',
    iss: 'https://securetoken.google.com/database-dra-karoline',
    sub: 'uid-1',
    exp: agora / 1000 + 600,
  };
  ok('texto qualquer → recusado', (await verificarLoginDoPainel('abc', 'database-dra-karoline', agora)) === null);
  ok(
    'token de outro projeto → recusado',
    (await verificarLoginDoPainel(jwt({ ...base, aud: 'outro' }), 'database-dra-karoline', agora)) === null
  );
  ok(
    'token vencido → recusado',
    (await verificarLoginDoPainel(jwt({ ...base, exp: agora / 1000 - 10 }), 'database-dra-karoline', agora)) === null
  );
  ok(
    'emissor errado → recusado',
    (await verificarLoginDoPainel(jwt({ ...base, iss: 'https://evil' }), 'database-dra-karoline', agora)) === null
  );
}

console.log('\nRotas do servidor');
{
  process.env.GOOGLE_AGENDA_CLIENT_ID = 'cliente-teste.apps.googleusercontent.com';
  process.env.GOOGLE_AGENDA_CLIENT_SECRET = 'segredo-teste';
  const app = express();
  app.use('/api/google-agenda', criarRotasGoogleAgenda());
  const servidor = app.listen(0);
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/google-agenda`;

  try {
    const status = await (await fetch(`${base}/status`)).json();
    ok('status diz que está configurado', status.configurado === true);

    const preflight = await fetch(`${base}/sincronizar`, { method: 'OPTIONS' });
    ok(
      'pré-verificação de CORS responde (painel aberto no AI Studio)',
      preflight.status === 204 && preflight.headers.get('access-control-allow-headers')?.includes('Authorization') === true
    );

    const semLogin = await fetch(`${base}/sincronizar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenCifrado: 'v1.x', calendarioId: 'c', operacoes: [] }),
    });
    ok('sincronizar sem login → 401', semLogin.status === 401);

    const loginFalso = await fetch(`${base}/sincronizar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer a.b.c' },
      body: '{}',
    });
    ok('sincronizar com login falso → 401', loginFalso.status === 401);

    const desconectar = await fetch(`${base}/desconectar`, { method: 'POST' });
    ok('desconectar sem login → 401', desconectar.status === 401);

    const conectar = await fetch(
      `${base}/conectar?estado=3f1c2a9e-1111-4222-8333-944455556666&email=enfesteta.karoline%40gmail.com&calendario=cal-1`,
      { redirect: 'manual' }
    );
    const destino = new URL(conectar.headers.get('location') || 'http://x');
    ok('conectar manda para o Google', conectar.status === 302 && destino.host === 'accounts.google.com');
    ok('pede autorização permanente', destino.searchParams.get('access_type') === 'offline' && destino.searchParams.get('prompt') === 'consent');
    ok(
      'pede só o calendário próprio do app',
      destino.searchParams.get('scope') === 'openid email https://www.googleapis.com/auth/calendar.app.created'
    );
    ok('sugere a conta da profissional', destino.searchParams.get('login_hint') === 'enfesteta.karoline@gmail.com');
    ok(
      'volta para o site publicado',
      destino.searchParams.get('redirect_uri') === 'https://drakaroline-lavie.ai.studio/api/google-agenda/retorno'
    );

    const estadoRuim = await fetch(`${base}/conectar?estado=<script>`, { redirect: 'manual' });
    ok('estado inválido → 400', estadoRuim.status === 400);

    const cancelou = await fetch(`${base}/retorno?error=access_denied&state=${destino.searchParams.get('state')}`);
    const pagina = await cancelou.text();
    ok('cancelou no Google → página explica', pagina.includes('a autorização foi cancelada'));
    ok('e devolve o estado para o painel certo', pagina.includes('3f1c2a9e-1111-4222-8333-944455556666'));

    const injecao = await fetch(
      `${base}/retorno?error=${encodeURIComponent('</script><script>alert(1)</script>')}&state=${destino.searchParams.get('state')}`
    );
    ok('erro vindo da URL não fecha o <script> da página', !(await injecao.text()).includes('</script><script>alert'));

    const inexistente = await fetch(`${base}/qualquer-coisa`);
    ok('rota desconhecida → 404 (não a página do app)', inexistente.status === 404);
  } finally {
    servidor.close();
  }

  delete process.env.GOOGLE_AGENDA_CLIENT_SECRET;
  const semChaves = express();
  semChaves.use('/api/google-agenda', criarRotasGoogleAgenda());
  const servidor2 = semChaves.listen(0);
  try {
    const base2 = `http://127.0.0.1:${(servidor2.address() as AddressInfo).port}/api/google-agenda`;
    const status = await (await fetch(`${base2}/status`)).json();
    ok('sem as chaves → status diz que falta configurar', status.configurado === false);
  } finally {
    servidor2.close();
  }
}

console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
