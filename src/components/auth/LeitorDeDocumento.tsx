import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import { PAGINAS_LEGAIS, valoresDosDocumentos } from '../../utils/documentosLegais';
import { markdownParaHtml, preencher } from '../../utils/markdownLegal';

/**
 * Um documento legal da plataforma lido dentro do painel, por cima da tela, sem sair dela.
 *
 * Por que não só um link para `/termos`: na prévia do AI Studio (e em navegadores que bloqueiam abrir
 * outra aba) só existe a parte visual do site, e `/termos` abre o próprio painel. O texto em
 * Markdown (`/legal/*.md`, copiado de `public/legal` no build) existe em todo lugar, e vira HTML aqui
 * com o mesmo código das páginas do servidor (`src/utils/markdownLegal.ts`).
 */

export type DocumentoDaPlataforma = 'termos-de-uso' | 'politica-de-privacidade' | 'acordo-de-tratamento-de-dados';

export const PAGINA_DO_DOCUMENTO: Record<DocumentoDaPlataforma, string> = {
  'termos-de-uso': PAGINAS_LEGAIS.termos,
  'politica-de-privacidade': PAGINAS_LEGAIS.politicaDePrivacidade,
  'acordo-de-tratamento-de-dados': PAGINAS_LEGAIS.tratamentoDeDados,
};

const TITULO_DO_DOCUMENTO: Record<DocumentoDaPlataforma, string> = {
  'termos-de-uso': 'Termos de Uso',
  'politica-de-privacidade': 'Política de Privacidade',
  'acordo-de-tratamento-de-dados': 'Acordo de Tratamento de Dados',
};

/** O documento de uma página do site (`/termos` → `termos-de-uso`), ou `null`. */
const documentoDaPagina = (href: string): DocumentoDaPlataforma | null =>
  (Object.entries(PAGINA_DO_DOCUMENTO).find(([, pagina]) => pagina === href)?.[0] as DocumentoDaPlataforma) || null;

const guardados = new Map<DocumentoDaPlataforma, string>();

async function carregar(nome: DocumentoDaPlataforma): Promise<string> {
  const guardado = guardados.get(nome);
  if (guardado) return guardado;
  const resposta = await fetch(`/legal/${nome}.md`, { cache: 'no-cache' });
  const tipo = resposta.headers.get('content-type') || '';
  // Sem o arquivo, alguns servidores devolvem a página do painel no lugar: isso não é o documento.
  if (!resposta.ok || tipo.includes('text/html')) throw new Error(`documento indisponível (${resposta.status})`);
  const html = preencher(markdownParaHtml(await resposta.text()), valoresDosDocumentos());
  guardados.set(nome, html);
  return html;
}

const ESTILO_DO_TEXTO = [
  'text-[14px] leading-relaxed text-ink-soft',
  '[&_h1]:font-serif-luxury [&_h1]:text-[24px] [&_h1]:font-semibold [&_h1]:text-ink [&_h1]:leading-tight [&_h1]:mb-1',
  '[&_h1+p]:text-[12.5px] [&_h1+p]:text-muted [&_h1+p]:mb-4',
  '[&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:text-ink [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:pt-4 [&_h2]:border-t [&_h2]:border-[rgba(26,26,26,.08)]',
  '[&_h3]:text-[14px] [&_h3]:font-semibold [&_h3]:text-ink [&_h3]:mt-4',
  '[&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_li]:my-1 [&_strong]:text-ink',
  '[&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2 [&_code]:text-[12px] [&_code]:break-all',
  '[&_table]:w-full [&_table]:my-3 [&_table]:text-[13px] [&_th]:text-left [&_th]:text-ink [&_th]:p-2 [&_td]:p-2 [&_th]:align-top [&_td]:align-top',
  '[&_th]:border [&_td]:border [&_th]:border-[rgba(26,26,26,.1)] [&_td]:border-[rgba(26,26,26,.1)]',
  '[&_mark]:bg-amber-100 [&_mark]:px-0.5',
].join(' ');

export const LeitorDeDocumento: React.FC<{ documento: DocumentoDaPlataforma; onFechar: () => void }> = ({
  documento,
  onFechar,
}) => {
  const [atual, setAtual] = useState(documento);
  const [html, setHtml] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);
  const rolagem = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelado = false;
    setHtml(null);
    setFalhou(false);
    carregar(atual).then(
      (pronto) => {
        if (cancelado) return;
        setHtml(pronto);
        rolagem.current?.scrollTo({ top: 0 });
      },
      () => !cancelado && setFalhou(true)
    );
    return () => {
      cancelado = true;
    };
  }, [atual]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  /** Links entre os documentos trocam o documento aqui; os outros abrem em outra aba. */
  const aoClicarNoTexto = (e: React.MouseEvent) => {
    const link = (e.target as HTMLElement).closest('a');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    const outro = documentoDaPagina(href);
    e.preventDefault();
    if (outro) setAtual(outro);
    else window.open(link.href, '_blank', 'noopener');
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/50 flex items-stretch sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={TITULO_DO_DOCUMENTO[atual]}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-full sm:max-w-2xl bg-white sm:rounded-3xl shadow-2xl flex flex-col max-h-full sm:max-h-[90vh]">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-[rgba(26,26,26,.08)] shrink-0">
          <p className="flex-1 text-[14px] font-semibold text-ink truncate">{TITULO_DO_DOCUMENTO[atual]}</p>
          <a
            href={PAGINA_DO_DOCUMENTO[atual]}
            target="_blank"
            rel="noopener"
            className="text-[12px] text-muted hover:text-ink flex items-center gap-1"
            title="Abrir em outra aba (para imprimir ou salvar)"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Abrir em outra aba</span>
          </a>
          <button
            type="button"
            onClick={onFechar}
            className="w-9 h-9 rounded-full hover:bg-surface flex items-center justify-center"
            aria-label="Fechar o documento"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
        </div>
        <div ref={rolagem} className="overflow-y-auto px-5 sm:px-7 py-5 flex-1">
          {html ? (
            <div className={ESTILO_DO_TEXTO} onClick={aoClicarNoTexto} dangerouslySetInnerHTML={{ __html: html }} />
          ) : falhou ? (
            <p className="text-[13.5px] text-ink-soft">
              Não foi possível carregar o documento agora.{' '}
              <a href={PAGINA_DO_DOCUMENTO[atual]} target="_blank" rel="noopener" className="text-brand underline">
                Abrir em outra aba
              </a>
              .
            </p>
          ) : (
            <div className="py-16 flex justify-center">
              <Loader2 className="w-6 h-6 text-brand animate-spin" />
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-[rgba(26,26,26,.08)] shrink-0">
          <button
            type="button"
            onClick={onFechar}
            className="w-full h-[44px] rounded-xl bg-ink text-white text-[14px] font-semibold hover:opacity-90 transition-opacity"
          >
            Voltar
          </button>
        </div>
      </div>
    </div>
  );
};
