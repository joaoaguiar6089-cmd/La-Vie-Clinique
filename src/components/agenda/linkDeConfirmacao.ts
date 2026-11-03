import { Attendance, ClinicProfile, Procedure } from '../../types';
import { garantirLinkDoAgendamento } from '../../services/databaseService';
import { mensagemDoLink } from '../../utils/agendamentoLink';
import { buildPublicLink } from '../../utils/publicLinks';
import { buildWhatsAppUrl } from '../../utils/whatsapp';

/*
  A confirmação do agendamento sai **sempre pelo link**: a cliente abre a página do horário e ali
  confirma, avisa que não vai ou pede outro horário — a resposta volta sozinha para a agenda
  (`aplicarRespostaDoLink`). Ninguém pede para ela "responder confirmando" a mensagem.

  Todo botão de WhatsApp da agenda (a faixa de amanhã, o detalhe, o cartão do celular e o
  "enviar no WhatsApp" de quem acabou de agendar) passa por aqui, para os caminhos não
  divergirem.
*/

/**
 * O token que acabou de nascer, por atendimento, até a lista ao vivo trazer o `linkToken`
 * gravado. Sem isto, dois toques seguidos criariam dois links — e o primeiro, que a cliente já
 * recebeu, deixaria de valer: a resposta só conta pelo link para o qual o atendimento aponta.
 */
const tokensRecentes = new Map<string, string>();

/** Traduz o erro do Firestore no que a equipe precisa fazer. */
export const explicarErroDoLink = (e: unknown): string => {
  const codigo = (e as { code?: string })?.code;
  if (codigo === 'permission-denied') {
    return (
      'O banco de dados ainda não aceita links de agendamento. Falta publicar as regras do ' +
      'Firestore (firebase deploy --only firestore:rules).'
    );
  }
  return `Não foi possível gerar o link de confirmação: ${(e as Error)?.message || 'erro desconhecido'}`;
};

/** Cria o link (ou renova a cópia dele) e devolve o endereço que a cliente abre. */
export const gerarLinkDeConfirmacao = async (
  atendimento: Attendance,
  clinic: ClinicProfile,
  catalogo: Procedure[]
): Promise<string> => {
  const comToken: Attendance = atendimento.linkToken
    ? atendimento
    : { ...atendimento, linkToken: tokensRecentes.get(atendimento.id) };
  const token = await garantirLinkDoAgendamento(comToken, clinic, catalogo);
  tokensRecentes.set(atendimento.id, token);
  return buildPublicLink(clinic, { agendamento: token });
};

/** Dá para mandar pelo WhatsApp — o cadastro tem um telefone que vira conversa. */
export const temWhatsApp = (telefone?: string): boolean => !!buildWhatsAppUrl(telefone);

/**
 * Abre uma aba em branco **dentro do toque**. O navegador do celular só deixa abrir janela como
 * resposta direta a um toque, e depois do `await` que grava o link isso já não vale; a aba nasce
 * aqui e recebe o endereço do WhatsApp quando o link fica pronto.
 */
export const abrirAbaDoWhatsApp = (): Window | null => {
  const aba = window.open('', '_blank');
  if (!aba) return null;
  try {
    aba.document.title = 'Abrindo o WhatsApp…';
    aba.document.body.innerHTML =
      '<p style="font:15px system-ui,sans-serif;color:#4A4740;padding:24px">Preparando o link de confirmação…</p>';
  } catch {
    // Só o aviso de espera; sem ele, a aba fica em branco até o WhatsApp abrir.
  }
  aba.opener = null;
  return aba;
};

/**
 * Manda o link de confirmação pelo WhatsApp: a mensagem com o endereço da página do horário.
 *
 * `aba` é a aberta no toque por `abrirAbaDoWhatsApp`. O padrão a abre aqui mesmo, o que só
 * funciona quando esta função é chamada direto do toque, antes de qualquer `await`. Se o link
 * falhar, a aba fecha e o erro sobe — quem tocou precisa saber que nada foi enviado.
 */
export const enviarLinkNoWhatsApp = async (
  atendimento: Attendance,
  clinic: ClinicProfile,
  catalogo: Procedure[],
  telefone: string | undefined,
  aba: Window | null = abrirAbaDoWhatsApp()
): Promise<void> => {
  try {
    const link = await gerarLinkDeConfirmacao(atendimento, clinic, catalogo);
    const url = buildWhatsAppUrl(telefone, mensagemDoLink(clinic, atendimento, link));
    if (!url) throw new Error('Sem telefone no cadastro.');
    if (aba && !aba.closed) aba.location.href = url;
    else window.open(url, '_blank', 'noopener,noreferrer');
  } catch (e) {
    aba?.close();
    throw e;
  }
};

/**
 * Copia o link de confirmação. A escrita na área de transferência começa **dentro do toque**,
 * com o texto ainda por vir (`ClipboardItem` aceita promessa): o Safari recusa copiar depois de
 * um `await`. Devolve o link e se deu para copiar; quando não dá, quem chamou mostra o link para
 * copiar à mão. Erro do link sobe.
 */
export const copiarLinkDeConfirmacao = async (
  atendimento: Attendance,
  clinic: ClinicProfile,
  catalogo: Procedure[]
): Promise<{ link: string; copiado: boolean }> => {
  const promessa = gerarLinkDeConfirmacao(atendimento, clinic, catalogo);
  let copiado = false;
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': promessa.then((link) => new Blob([link], { type: 'text/plain' })),
        }),
      ]);
      copiado = true;
    }
  } catch {
    // Navegador sem `ClipboardItem` com promessa: tenta o texto direto, abaixo.
  }
  const link = await promessa;
  if (!copiado) {
    try {
      await navigator.clipboard.writeText(link);
      copiado = true;
    } catch {
      copiado = false;
    }
  }
  return { link, copiado };
};
