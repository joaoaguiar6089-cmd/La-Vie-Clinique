/**
 * Confere as regras puras do link de agendamento: o que sai da clínica para uma página sem login,
 * o que cada resposta da paciente faz no atendimento e o que a equipe precisa resolver.
 *
 * O erro que este script caça é o silencioso: um campo interno (observação, preço, telefone) que
 * vaza para o documento público, uma foto em base64 que estouraria o limite do Firestore, uma
 * resposta que deixa a paciente "confirmada" para um horário que ela acabou de recusar.
 *
 *   npx tsx scripts/verificar-agendamento-link.ts
 */
import { Attendance, ClinicProfile, Procedure } from '../src/types';
import {
  MENSAGEM_MAX_CARACTERES,
  ausenciaAvisada,
  dataPorExtenso,
  efeitoDaResposta,
  erroDoPedidoDeRemarcacao,
  fotoPublicaDoProcedimento,
  linkAceitaResposta,
  mensagemDoLink,
  montarSnapshotDoLink,
  respostaParaGravar,
  respostasParaResolver,
  situacaoDoLink,
  temPedidoDeRemarcacao,
} from '../src/utils/agendamentoLink';

let falhas = 0;
const ok = (nome: string, condicao: boolean, extra = '') => {
  console.log(`${condicao ? '  ok  ' : ' FALHA'}  ${nome}${extra ? `  — ${extra}` : ''}`);
  if (!condicao) falhas++;
};

const HOJE = '2026-09-30';

const atd = (extra: Partial<Attendance> = {}): Attendance => ({
  id: 'atd-1',
  pacienteId: 'p1',
  pacienteNome: 'Maria Aparecida Souza',
  data: '2026-10-03',
  hora: '14:30',
  procedureId: 'proc-1',
  procedimentoNome: 'Limpeza de Pele Profunda',
  profissionalNome: 'Dra. Karoline',
  observacoes: 'ALERGIA A LÁTEX — não contar para a paciente',
  status: 'agendado',
  createdAt: '2026-09-29T10:00:00.000Z',
  ...extra,
});

const proc = (extra: Partial<Procedure> = {}): Procedure => ({
  id: 'proc-1',
  title: 'Limpeza de Pele',
  subtitle: 'Renovação profunda',
  category: 'Facial',
  description: 'Remove impurezas e renova a pele.',
  price: 290,
  promotionalPrice: 250,
  duration: '60 min',
  images: ['https://firebasestorage.googleapis.com/v0/b/x/o/capa.jpg'],
  benefits: [],
  orientacoesPreProcedimento: 'Venha sem maquiagem.',
  order: 1,
  createdAt: '2026-01-01',
  ...extra,
});

const clinica = {
  name: 'La Vie Clinique',
  tagline: 'Estética avançada',
  phone: '(11) 98888-7777',
  address: 'Rua das Flores, 100',
  cityState: 'São Paulo, SP',
  logoUrl: '',
  email: 'segredo@clinica.com',
} as unknown as ClinicProfile;

// ==========================================
console.log('\nSnapshot público');
// ==========================================
{
  const snap = montarSnapshotDoLink(atd(), clinica, [proc()]);
  const json = JSON.stringify(snap);

  ok('só o primeiro nome vai para a página', snap.clientePrimeiroNome === 'Maria');
  ok('nome completo da paciente não vaza', !json.includes('Aparecida') && !json.includes('Souza'));
  ok('observação interna não vaza', !json.includes('LÁTEX') && !json.includes('observacoes'));
  ok('preço não vaza', !json.includes('290') && !json.includes('250') && !json.includes('price'));
  ok('id da paciente não vaza', !json.includes('"p1"') && !json.includes('pacienteId'));
  ok('e-mail da clínica não vaza', !json.includes('segredo@clinica.com'));
  ok('título é o do atendimento, não o do catálogo', snap.procedimento.titulo === 'Limpeza de Pele Profunda');
  ok('foto do Storage entra', snap.procedimento.foto?.startsWith('https://') === true);
  ok('orientações entram', snap.procedimento.orientacoes === 'Venha sem maquiagem.');
  ok('duração vem do catálogo quando o registro não tem', snap.duracaoMin === 60);
  ok('situação ativa para agendado', snap.situacao === 'ativo');
  ok('logo vazio vira ausente', snap.clinica.logoUrl === undefined);
}

{
  const semCatalogo = montarSnapshotDoLink(atd({ procedureId: undefined }), clinica, []);
  ok('procedimento digitado à mão não tem foto', semCatalogo.procedimento.foto === undefined);
  ok('e continua com título', semCatalogo.procedimento.titulo === 'Limpeza de Pele Profunda');
}

// ==========================================
console.log('\nFoto de capa');
// ==========================================
{
  const base64 = 'data:image/jpeg;base64,' + 'A'.repeat(50);
  ok('base64 é recusado (estouraria 1 MB)', fotoPublicaDoProcedimento(proc({ images: [base64] })) === undefined);
  ok(
    'pula o base64 e usa a primeira URL de verdade',
    fotoPublicaDoProcedimento(proc({ images: [base64, 'http://x.com/a.jpg'] })) === 'http://x.com/a.jpg'
  );
  ok('sem imagens', fotoPublicaDoProcedimento(proc({ images: [] })) === undefined);
  ok('sem procedimento', fotoPublicaDoProcedimento(undefined) === undefined);
  ok('string vazia é ignorada', fotoPublicaDoProcedimento(proc({ images: ['', 'https://a/b.jpg'] })) === 'https://a/b.jpg');
}

// ==========================================
console.log('\nSituação do link');
// ==========================================
ok('agendado → ativo', situacaoDoLink('agendado') === 'ativo');
ok('remarcado → remarcado', situacaoDoLink('remarcado') === 'remarcado');
ok('compareceu → encerrado', situacaoDoLink('compareceu') === 'encerrado');
ok('faltou → encerrado', situacaoDoLink('faltou') === 'encerrado');
ok('sem status → encerrado', situacaoDoLink(undefined) === 'encerrado');
ok('aceita resposta: ativo e futuro', linkAceitaResposta('ativo', '2026-10-03', HOJE));
ok('aceita resposta: ativo e hoje', linkAceitaResposta('ativo', HOJE, HOJE));
ok('não aceita: data passada', !linkAceitaResposta('ativo', '2026-09-29', HOJE));
ok('não aceita: remarcado', !linkAceitaResposta('remarcado', '2026-10-03', HOJE));

// ==========================================
console.log('\nEfeito de cada resposta no atendimento');
// ==========================================
{
  const EM = '2026-09-30T09:00:00.000Z';

  const conf = efeitoDaResposta({ tipo: 'confirmar' }, EM);
  ok('confirmar grava confirmadoEm com o instante da resposta', conf.gravar.confirmadoEm === EM);
  ok('confirmar apaga o aviso de ausência e o pedido', conf.apagar.includes('avisoAusenciaEm') && conf.apagar.includes('pedidoRemarcacao'));
  ok('confirmar não apaga a própria confirmação', !conf.apagar.includes('confirmadoEm'));

  const nao = efeitoDaResposta({ tipo: 'nao_vai' }, EM);
  ok('não vai grava avisoAusenciaEm', nao.gravar.avisoAusenciaEm === EM);
  ok('não vai desfaz a confirmação anterior', nao.apagar.includes('confirmadoEm'));
  ok('não vai NÃO muda o status (só sinaliza)', !('status' in nao.gravar));

  const rem = efeitoDaResposta(
    { tipo: 'remarcar', novaData: '2026-10-07', novaHora: '10:00', mensagem: 'Viajo nesse dia' },
    EM
  );
  ok('remarcar guarda data e hora pedidas', rem.gravar.pedidoRemarcacao?.data === '2026-10-07' && rem.gravar.pedidoRemarcacao?.hora === '10:00');
  ok('remarcar guarda o recado', rem.gravar.pedidoRemarcacao?.mensagem === 'Viajo nesse dia');
  ok('remarcar guarda o instante', rem.gravar.pedidoRemarcacao?.em === EM);
  ok('remarcar desfaz a confirmação do horário antigo', rem.apagar.includes('confirmadoEm') && rem.apagar.includes('avisoAusenciaEm'));

  const remSemRecado = efeitoDaResposta({ tipo: 'remarcar', novaData: '2026-10-07', novaHora: '10:00' }, EM);
  ok('sem recado, o pedido não tem a chave (Firestore recusa undefined)', !('mensagem' in (remSemRecado.gravar.pedidoRemarcacao || {})));

  // As três se excluem: cada uma escreve um campo e apaga os outros dois.
  [conf, nao, rem].forEach((e, i) => {
    const campos = [...Object.keys(e.gravar), ...e.apagar];
    ok(`resposta ${i + 1} cobre exatamente os 3 campos, sem repetir`, campos.length === 3 && new Set(campos).size === 3);
  });
}

// ==========================================
console.log('\nResposta que vai para o Firestore');
// ==========================================
{
  const g = respostaParaGravar({ tipo: 'confirmar', novaData: '2026-10-07', mensagem: '   ' });
  ok('confirmar descarta data e recado em branco', !('novaData' in g) && !('mensagem' in g));

  const longo = 'x'.repeat(MENSAGEM_MAX_CARACTERES + 50);
  const r = respostaParaGravar({ tipo: 'remarcar', novaData: '2026-10-07', novaHora: '10:00', mensagem: longo });
  ok('recado é cortado no limite das regras', r.mensagem?.length === MENSAGEM_MAX_CARACTERES);
  ok('remarcar mantém data e hora', r.novaData === '2026-10-07' && r.novaHora === '10:00');

  ok(
    'chaves da resposta são só as que as regras aceitam',
    Object.keys(r).every((k) => ['tipo', 'novaData', 'novaHora', 'mensagem'].includes(k))
  );
}

// ==========================================
console.log('\nValidação do pedido de outro horário');
// ==========================================
{
  const e = (d: string, h: string, m = '', agora = '') => erroDoPedidoDeRemarcacao(d, h, m, HOJE, agora);
  ok('data e hora futuras passam', e('2026-10-07', '10:00') === null);
  ok('hoje mais tarde passa', e(HOJE, '18:00', '', '10:00') === null);
  ok('hoje, hora que já passou, falha', e(HOJE, '09:00', '', '10:00') !== null);
  ok('data passada falha', e('2026-09-29', '10:00') !== null);
  ok('sem data falha', e('', '10:00') !== null);
  ok('data em formato errado falha', e('07/10/2026', '10:00') !== null);
  ok('sem hora falha', e('2026-10-07', '') !== null);
  ok('hora 25:00 falha', e('2026-10-07', '25:00') !== null);
  ok('hora 9:00 sem zero falha (regra exige HH:MM)', e('2026-10-07', '9:00') !== null);
  ok('recado no limite passa', e('2026-10-07', '10:00', 'x'.repeat(MENSAGEM_MAX_CARACTERES)) === null);
  ok('recado acima do limite falha', e('2026-10-07', '10:00', 'x'.repeat(MENSAGEM_MAX_CARACTERES + 1)) !== null);
}

// ==========================================
console.log('\nO que a equipe precisa resolver');
// ==========================================
{
  const pedido = { data: '2026-10-07', hora: '10:00', em: '2026-09-30T09:00:00.000Z' };
  const lista = [
    atd({ id: 'a', data: '2026-10-05', hora: '09:00', pedidoRemarcacao: pedido }),
    atd({ id: 'b', data: '2026-10-03', hora: '14:30', avisoAusenciaEm: '2026-09-30T08:00:00.000Z' }),
    atd({ id: 'c', data: '2026-10-04', confirmadoEm: '2026-09-30T08:00:00.000Z' }),
    atd({ id: 'd', data: '2026-10-06' }),
    atd({ id: 'e', data: '2026-09-20', avisoAusenciaEm: '2026-09-19T08:00:00.000Z' }),
    atd({ id: 'f', data: '2026-10-02', status: 'remarcado', avisoAusenciaEm: '2026-09-30T08:00:00.000Z' }),
    atd({ id: 'g', data: '2026-10-08', status: 'compareceu', pedidoRemarcacao: pedido }),
  ];
  const resolver = respostasParaResolver(lista, HOJE);

  ok('lista só pedidos e avisos', resolver.map((a) => a.id).join(',') === 'b,a', resolver.map((a) => a.id).join(','));
  ok('confirmado não pede nada da equipe', !resolver.some((a) => a.id === 'c'));
  ok('agendamento sem resposta fica de fora', !resolver.some((a) => a.id === 'd'));
  ok('data passada fica de fora (é caso das pendências)', !resolver.some((a) => a.id === 'e'));
  ok('remarcado e compareceu ficam de fora', !resolver.some((a) => a.id === 'f' || a.id === 'g'));
  ok('ordem: o mais próximo primeiro', resolver[0].id === 'b');

  ok('ausenciaAvisada: só em agendado', ausenciaAvisada(lista[1]) && !ausenciaAvisada(lista[5]));
  ok('temPedidoDeRemarcacao: só em agendado', temPedidoDeRemarcacao(lista[0]) && !temPedidoDeRemarcacao(lista[6]));
  ok('sem aviso, o botão Faltou continua valendo', !ausenciaAvisada(lista[3]));
}

// ==========================================
console.log('\nMensagem e data');
// ==========================================
{
  const m = mensagemDoLink(clinica, atd(), 'https://exemplo.com/?agendamento=abc');
  ok('a mensagem leva o link', m.includes('https://exemplo.com/?agendamento=abc'));
  ok('saúda pelo primeiro nome', m.startsWith('Oi, Maria!'));
  ok('diz o horário', m.includes('14:30'));
  ok('diz o procedimento', m.includes('Limpeza de Pele Profunda'));
  ok('diz a clínica', m.includes('La Vie Clinique'));
  ok('não vaza a observação interna', !m.includes('LÁTEX'));

  ok('data por extenso', dataPorExtenso('2026-10-03') === 'sábado, 3 de outubro', dataPorExtenso('2026-10-03'));
  ok('data inválida devolve o texto original', dataPorExtenso('') === '');
}

console.log(falhas === 0 ? '\nTudo certo.' : `\n${falhas} verificação(ões) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
