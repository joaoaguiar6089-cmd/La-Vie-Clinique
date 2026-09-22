import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle, MessageCircle, Download, Clock, RefreshCw, Ban } from 'lucide-react';
import { LaserBodyMap, Quote } from '../../types';
import { getQuoteById, getMapaCorporalDoLaserPublico } from '../../services/databaseService';
import { formatBRL } from '../../utils/formatters';
import {
  calcularOrcamento,
  itemDescontoPercentual,
  itemSessoes,
  itemTemDescontoVisivel,
  itemValorFinal,
  NOME_FORMA_PAGAMENTO,
  resolveQuoteStatus,
} from '../../utils/quoteCalc';
import { SNAPSHOT_CLINICA_PADRAO } from '../../utils/quoteFactory';
import { QuotePreviewModal } from './QuotePreviewModal';

const dataCurta = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};


const linkWhatsApp = (telefone: string | undefined, texto: string): string => {
  const digitos = (telefone || '').replace(/\D/g, '');
  const numero = digitos.length >= 12 ? digitos : `55${digitos}`;
  return digitos
    ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
    : `https://wa.me/?text=${encodeURIComponent(texto)}`;
};

/**
 * Página que a paciente abre pelo link `?orcamento=<id>`, sem login. É uma versão
 * responsiva do documento — não o A4 encolhido, que no celular obrigaria a dar zoom.
 * Não grava nada: o "quero fechar" leva a conversa para o WhatsApp da clínica.
 */
export const PublicQuoteEntry: React.FC = () => {
  const [quote, setQuote] = useState<Quote | null>(null);
  /**
   * Mapa corporal do espelho público — esta página não tem login e não pode ler `procedures`.
   * Best-effort: sem ele o PDF simplesmente sai sem a página das áreas.
   */
  const [mapaCorporal, setMapaCorporal] = useState<LaserBodyMap | null>(null);
  useEffect(() => {
    void getMapaCorporalDoLaserPublico().then(setMapaCorporal).catch(() => {});
  }, []);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarPdf, setMostrarPdf] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('orcamento');
    if (!id) {
      setErro('Link inválido.');
      setCarregando(false);
      return;
    }

    getQuoteById(id)
      .then((encontrado) => {
        if (!encontrado) {
          setErro('Orçamento não encontrado. Confira o link com a clínica.');
        } else {
          setQuote(encontrado);
        }
      })
      .catch((e) => setErro(`Não foi possível abrir o orçamento: ${(e as Error).message}`))
      .finally(() => setCarregando(false));
  }, []);

  if (carregando) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand animate-spin" />
      </div>
    );
  }

  if (erro || !quote) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="glass-card rounded-sm p-8 max-w-sm text-center">
          <AlertCircle className="w-8 h-8 text-brand mx-auto mb-3" />
          <p className="text-sm text-ink">{erro}</p>
        </div>
      </div>
    );
  }

  const clinica = quote.clinica || SNAPSHOT_CLINICA_PADRAO;
  const totais = calcularOrcamento(quote);
  const status = resolveQuoteStatus(quote);

  const mensagemWhatsApp = `Olá! Quero falar sobre o orçamento ${quote.numero}: ${window.location.href}`;

  return (
    <div className="min-h-screen bg-surface text-ink pb-28">
      <div className="max-w-2xl mx-auto px-5 py-8 sm:py-12">
        {/* Cabeçalho */}
        <div className="flex items-start gap-3 mb-6">
          <div className="w-10 h-10 bg-ink text-brand font-serif-luxury text-sm flex items-center justify-center shrink-0">
            LV
          </div>
          <div className="min-w-0">
            <h1 className="font-serif-luxury text-xl leading-tight">{clinica.name}</h1>
            {(clinica.tagline || clinica.cityState) && (
              <p className="text-label uppercase tracking-[.14em] text-ink-soft mt-0.5">
                {[clinica.tagline, clinica.cityState].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>

        {/* Avisos de estado — cancelado tem prioridade sobre os demais */}
        {status === 'cancelado' && (
          <div className="mb-5 px-4 py-3 rounded-sm bg-ink text-surface text-xs flex items-start gap-2">
            <Ban className="w-4 h-4 shrink-0 mt-px text-brand-light" />
            <span>
              Este orçamento foi <strong>cancelado</strong> pela clínica e não está mais válido.
              Fale com a gente para receber um novo.
            </span>
          </div>
        )}

        {quote.substituidoPor && status !== 'cancelado' && (
          <div className="mb-5 px-4 py-3 rounded-sm bg-brand/10 border border-brand/25 text-xs text-brand-hover flex items-start gap-2">
            <RefreshCw className="w-4 h-4 shrink-0 mt-px" />
            <span>
              Este orçamento foi substituído pelo <strong>{quote.substituidoPor.numero}</strong>.
              Fale com a clínica para receber a versão atualizada.
            </span>
          </div>
        )}

        {status === 'expirado' && !quote.substituidoPor && (
          <div className="mb-5 px-4 py-3 rounded-sm bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
            <Clock className="w-4 h-4 shrink-0 mt-px" />
            <span>
              Validade expirada em {dataCurta(quote.dataValidade)} — fale com a clínica para
              revalidar os valores.
            </span>
          </div>
        )}

        {/* Identificação */}
        <div className="border-t border-line pt-5">
          <p className="text-label uppercase tracking-[.16em] text-brand">Orçamento</p>
          <p className="font-serif-luxury text-2xl tabular-nums">Nº {quote.numero}</p>
          <p className="text-xs text-ink-soft mt-1 tabular-nums">
            Emitido em {dataCurta(quote.dataEmissao)} · Válido até {dataCurta(quote.dataValidade)}
          </p>
        </div>

        <div className="border-t border-line mt-5 pt-5">
          <p className="text-label uppercase tracking-[.16em] text-brand">Preparado para</p>
          <p className="font-serif-luxury text-2xl leading-tight mt-1">{quote.pacienteNome}</p>
          {quote.jaTeveAvaliacao && quote.dataAvaliacao && (
            <p className="text-xs text-ink-soft mt-1">
              avaliação em {dataCurta(quote.dataAvaliacao)}
            </p>
          )}
        </div>

        {quote.textoApresentacao && (
          <p className="text-sm leading-relaxed text-ink-soft mt-6">{quote.textoApresentacao}</p>
        )}

        {/* Procedimentos */}
        <div className="mt-6">
          {quote.itens.map((item) => {
            const final = itemValorFinal(item);
            const comDesconto = itemTemDescontoVisivel(item);
            const sessoes = itemSessoes(item);
            const notas = [
              comDesconto ? `desconto de ${Math.round(itemDescontoPercentual(item))}%` : null,
              sessoes > 1 ? `${sessoes} sessões` : null,
            ].filter(Boolean);

            return (
              <div key={item.id} className="border-t border-line py-5">
                <p className="text-label uppercase tracking-[.16em] text-brand">
                  {item.categoria}
                </p>
                <h2 className="font-serif-luxury text-xl leading-tight mt-0.5">{item.titulo}</h2>
                {item.profissionalNome && (
                  <p className="text-xs text-ink-soft mt-0.5">com {item.profissionalNome}</p>
                )}

                <div className="flex items-baseline gap-2 mt-2">
                  {comDesconto && (
                    <span className="text-sm text-muted line-through tabular-nums">
                      {formatBRL(item.valorTabela)}
                    </span>
                  )}
                  <span className="font-serif-luxury text-2xl tabular-nums">
                    {formatBRL(final)}
                  </span>
                </div>
                {notas.length > 0 && (
                  <p className="text-body text-muted mt-0.5">{notas.join(' · ')}</p>
                )}

                {item.detalhes.length > 0 && (
                  <div className="grid grid-cols-2 gap-x-5 gap-y-3 mt-4">
                    {item.detalhes.map((d) => (
                      <div key={d.id}>
                        <p className="text-label uppercase tracking-[.14em] text-brand">
                          {d.titulo}
                        </p>
                        <p className="text-xs text-ink-soft mt-0.5 leading-snug">{d.valor}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Totais */}
        <div className="bg-ink text-surface p-5 rounded-sm">
          <div className="flex justify-between text-xs mb-2 tabular-nums">
            <span>Subtotal</span>
            <span>{formatBRL(totais.subtotal)}</span>
          </div>
          {quote.temDescontoCombinado && totais.descontoCombinadoValor > 0 && (
            <div className="flex justify-between text-xs mb-2 tabular-nums">
              <span>Desconto plano combinado ({quote.descontoCombinadoPercentual}%)</span>
              <span>− {formatBRL(totais.descontoCombinadoValor)}</span>
            </div>
          )}
          <div className="h-px bg-[rgba(196,155,116,.35)] my-3" />
          <p className="text-label uppercase tracking-[.16em] text-brand">Total</p>
          <p className="font-serif-luxury text-3xl text-right tabular-nums">
            {formatBRL(totais.total)}
          </p>
        </div>

        {/* Pagamento */}
        <div className="mt-6">
          <p className="text-label uppercase tracking-[.16em] text-brand mb-2">
            Forma de pagamento
          </p>

          {totais.opcoesPagamento.map((resultado, i) => {
            const opcao = quote.pagamento.opcoes.find((o) => o.id === resultado.id);
            const rotulo =
              resultado.forma === 'cartao' && resultado.parcelas > 1
                ? `${NOME_FORMA_PAGAMENTO[resultado.forma]}, ${resultado.parcelas}×`
                : NOME_FORMA_PAGAMENTO[resultado.forma];
            const notas = [
              opcao?.temDesconto && resultado.descontoValor > 0
                ? `${opcao.descontoPercentual}% de desconto`
                : null,
              resultado.parcelasComJurosAPartir
                ? `sem juros até ${resultado.parcelasComJurosAPartir - 1}×`
                : null,
            ].filter(Boolean);

            return (
              <div
                key={resultado.id}
                className={`flex justify-between text-sm gap-3 ${i === 0 ? '' : 'mt-2 pt-2 border-t border-line'}`}
              >
                <span>
                  {rotulo}
                  {notas.length > 0 && (
                    <span className="block text-body text-muted mt-0.5">
                      {notas.join(' · ')}
                    </span>
                  )}
                </span>
                <span className="font-semibold tabular-nums shrink-0">
                  {resultado.parcela !== null
                    ? `${resultado.parcelas} × ${formatBRL(resultado.parcela)}`
                    : formatBRL(resultado.valorFinal)}
                </span>
              </div>
            );
          })}

          {quote.pagamento.negociacao && (
            <p className="text-xs text-ink-soft mt-3 leading-relaxed">
              {quote.pagamento.negociacao}
            </p>
          )}
          {quote.observacoes && (
            <p className="text-xs text-muted mt-3 leading-relaxed">{quote.observacoes}</p>
          )}
        </div>

        {/* Rodapé */}
        <div className="mt-8 pt-5 border-t border-line">
          <p className="text-body text-muted leading-relaxed">{clinica.legalNotice}</p>
          <p className="text-body text-ink-soft mt-3">
            {[clinica.phone, clinica.instagram, clinica.email].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      {/* Ações fixas */}
      <div className="fixed bottom-0 inset-x-0 bg-surface border-t border-line px-5 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <a
            href={linkWhatsApp(clinica.phone, mensagemWhatsApp)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 px-5 py-3 bg-brand text-white text-xs font-semibold uppercase tracking-widest rounded-sm hover:bg-brand-hover transition-colors flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-4 h-4" />
            Falar com a clínica
          </a>
          <button
            type="button"
            onClick={() => setMostrarPdf(true)}
            aria-label="Ver versão em PDF"
            className="px-4 py-3 bg-white/70 border border-line text-ink rounded-sm hover:bg-white transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {mostrarPdf && (
        <QuotePreviewModal
          mapaCorporal={mapaCorporal}
          quote={quote}
          clinic={null}
          onClose={() => setMostrarPdf(false)}
        />
      )}
    </div>
  );
};
