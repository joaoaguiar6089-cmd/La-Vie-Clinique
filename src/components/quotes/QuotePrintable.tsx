import React, { useEffect, useRef, useState } from 'react';
import { Quote, QuoteClinicSnapshot, QuoteItem } from '../../types';
import { formatBRL } from '../../utils/formatters';
import {
  calcularOrcamento,
  itemDescontoPercentual,
  itemSessoes,
  itemTemDescontoVisivel,
  itemValorFinal,
  NOME_FORMA_PAGAMENTO,
} from '../../utils/quoteCalc';

/** A4 a 96dpi — mesma métrica que o exportElementAsPDF já usa no catálogo. */
const PAGE_W = 794;
const PAGE_H = 1123;
const MM = 96 / 25.4;
const PAD_TOP = 15 * MM;
const PAD_X = 14 * MM;
const PAD_BOTTOM = 12 * MM;
const GAP = 13;
const ALTURA_RODAPE_PAGINACAO = 18;
const CONTENT_W = PAGE_W - PAD_X * 2;
const ALTURA_UTIL = PAGE_H - PAD_TOP - PAD_BOTTOM - ALTURA_RODAPE_PAGINACAO;

const BRONZE = '#A67C52';
const PRETO = '#1A1A1A';
const OFFWHITE = '#F9F8F6';
const HAIRLINE = '#E2DFD8';
const CINZA = '#6B6862';
const TEXTO_DETALHE = '#3A3833';

const dataCurta = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const Hairline: React.FC = () => (
  <div style={{ height: 1, background: HAIRLINE, flexShrink: 0 }} />
);

const CabecalhoCompleto: React.FC<{ quote: Quote; clinic: QuoteClinicSnapshot }> = ({
  quote,
  clinic,
}) => (
  <div style={{ flexShrink: 0 }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <div
          style={{
            width: 42,
            height: 42,
            background: PRETO,
            color: BRONZE,
            fontFamily: 'var(--font-serif)',
            fontSize: 15,
            letterSpacing: '.06em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          LV
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: PRETO, lineHeight: 1.1 }}>
            {clinic.name}
          </div>
          <div
            style={{
              fontSize: 9.5,
              textTransform: 'uppercase',
              letterSpacing: '.14em',
              color: CINZA,
              marginTop: 3,
            }}
          >
            {[clinic.tagline, clinic.cityState].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      {/* Nunca encolhe: o número do orçamento quebrando em duas linhas é o pior
          jeito possível de apresentar a identidade do documento */}
      <div style={{ textAlign: 'right', flexShrink: 0, whiteSpace: 'nowrap' }}>
        <div
          style={{
            fontSize: 8.5,
            textTransform: 'uppercase',
            letterSpacing: '.16em',
            color: BRONZE,
          }}
        >
          Orçamento
        </div>
        <div
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 20,
            color: PRETO,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1.25,
          }}
        >
          Nº {quote.numero}
        </div>
        <div style={{ fontSize: 10, color: CINZA, fontVariantNumeric: 'tabular-nums' }}>
          Emitido em {dataCurta(quote.dataEmissao)}
        </div>
        <div style={{ fontSize: 10, color: CINZA, fontVariantNumeric: 'tabular-nums' }}>
          Válido até {dataCurta(quote.dataValidade)}
        </div>
      </div>
    </div>
    <div style={{ height: 1, background: HAIRLINE, marginTop: 13 }} />
  </div>
);

/** Páginas seguintes carregam só o essencial para localizar o documento. */
const CabecalhoCompacto: React.FC<{ quote: Quote }> = ({ quote }) => (
  <div style={{ flexShrink: 0 }}>
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <div
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 15,
          color: PRETO,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        Orçamento Nº {quote.numero}
      </div>
      <div
        style={{
          fontSize: 9.5,
          textTransform: 'uppercase',
          letterSpacing: '.14em',
          color: CINZA,
        }}
      >
        {quote.pacienteNome}
      </div>
    </div>
    <div style={{ height: 1, background: HAIRLINE, marginTop: 9 }} />
  </div>
);

/** A profissional não aparece mais aqui: cada procedimento mostra a sua, abaixo do título. */
const Identificacao: React.FC<{ quote: Quote }> = ({ quote }) => (
  <div style={{ flexShrink: 0 }}>
    <div
      style={{
        fontSize: 8.5,
        textTransform: 'uppercase',
        letterSpacing: '.16em',
        color: BRONZE,
        marginBottom: 4,
      }}
    >
      Preparado para
    </div>
    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 26, color: PRETO, lineHeight: 1.15 }}>
      {quote.pacienteNome}
    </div>
    <div style={{ fontSize: 11, color: CINZA, marginTop: 5 }}>
      {[
        quote.pacienteContato,
        quote.jaTeveAvaliacao && quote.dataAvaliacao
          ? `avaliação em ${dataCurta(quote.dataAvaliacao)}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')}
    </div>
  </div>
);

const Mensagem: React.FC<{ texto: string }> = ({ texto }) =>
  texto ? (
    <div
      style={{
        fontSize: 12,
        lineHeight: 1.65,
        color: TEXTO_DETALHE,
        maxWidth: '66ch',
        flexShrink: 0,
      }}
    >
      {texto}
    </div>
  ) : null;

const BlocoItem: React.FC<{ item: QuoteItem; semSeparador: boolean }> = ({ item, semSeparador }) => {
  const final = itemValorFinal(item);
  const temDesconto = itemTemDescontoVisivel(item);
  const sessoes = itemSessoes(item);

  const notas = [
    temDesconto ? `desconto de ${Math.round(itemDescontoPercentual(item))}%` : null,
    // Contagem de sessões só entra quando é mais de uma
    sessoes > 1 ? `${sessoes} sessões` : null,
  ].filter(Boolean);

  return (
    <div
      style={{
        flexShrink: 0,
        paddingTop: semSeparador ? 0 : 11,
        borderTop: semSeparador ? 'none' : `1px solid ${HAIRLINE}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 8.5,
              textTransform: 'uppercase',
              letterSpacing: '.16em',
              color: BRONZE,
            }}
          >
            {item.categoria}
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: PRETO, lineHeight: 1.2 }}>
            {item.titulo}
          </div>
          {item.profissionalNome && (
            <div style={{ fontSize: 9.5, color: CINZA, marginTop: 2 }}>
              com {item.profissionalNome}
            </div>
          )}
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'flex-end' }}>
            {temDesconto && (
              <span
                style={{
                  fontSize: 12,
                  color: '#8A857C',
                  textDecoration: 'line-through',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatBRL(item.valorTabela)}
              </span>
            )}
            <span
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 22,
                color: PRETO,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatBRL(final)}
            </span>
          </div>
          {notas.length > 0 && (
            <div style={{ fontSize: 9.5, color: '#8A857C', marginTop: 2 }}>{notas.join(' · ')}</div>
          )}
        </div>
      </div>

      {item.detalhes.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))',
            gap: '9px 18px',
            marginTop: 10,
          }}
        >
          {item.detalhes.map((d) => (
            <div key={d.id}>
              <div
                style={{
                  fontSize: 8,
                  textTransform: 'uppercase',
                  letterSpacing: '.14em',
                  color: BRONZE,
                  marginBottom: 2,
                }}
              >
                {d.titulo}
              </div>
              <div style={{ fontSize: 11, color: TEXTO_DETALHE, lineHeight: 1.4 }}>{d.valor}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const RodapeValores: React.FC<{ quote: Quote }> = ({ quote }) => {
  const totais = calcularOrcamento(quote);

  return (
    <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start', flexShrink: 0, paddingTop: 11, borderTop: `1px solid ${HAIRLINE}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 8.5,
            textTransform: 'uppercase',
            letterSpacing: '.16em',
            color: BRONZE,
            marginBottom: 7,
          }}
        >
          Forma de pagamento
        </div>

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
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
                fontSize: 11.5,
                color: PRETO,
                marginTop: i === 0 ? 0 : 7,
                paddingTop: i === 0 ? 0 : 7,
                borderTop: i === 0 ? 'none' : `1px solid ${HAIRLINE}`,
              }}
            >
              <div>
                <div>{rotulo}</div>
                {notas.length > 0 && (
                  <div style={{ fontSize: 9.5, color: '#8A857C', marginTop: 2 }}>
                    {notas.join(' · ')}
                  </div>
                )}
              </div>
              <span
                style={{
                  fontWeight: i === 0 ? 600 : 500,
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                }}
              >
                {resultado.parcela !== null
                  ? `${resultado.parcelas} × ${formatBRL(resultado.parcela)}`
                  : formatBRL(resultado.valorFinal)}
              </span>
            </div>
          );
        })}

        {quote.pagamento.negociacao && (
          <div style={{ fontSize: 10.5, color: CINZA, marginTop: 9, lineHeight: 1.55 }}>
            {quote.pagamento.negociacao}
          </div>
        )}

        {quote.observacoes && (
          <div style={{ fontSize: 10.5, color: '#8A857C', marginTop: 9, lineHeight: 1.55 }}>
            {quote.observacoes}
          </div>
        )}
      </div>

      <div
        style={{
          background: PRETO,
          color: OFFWHITE,
          padding: '16px 18px',
          width: 300,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
          <span>Subtotal</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatBRL(totais.subtotal)}</span>
        </div>

        {quote.temDescontoCombinado && totais.descontoCombinadoValor > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
            <span>Desconto plano combinado ({quote.descontoCombinadoPercentual}%)</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              − {formatBRL(totais.descontoCombinadoValor)}
            </span>
          </div>
        )}

        <div style={{ height: 1, background: 'rgba(196,155,116,.35)', margin: '10px 0' }} />

        <div
          style={{
            fontSize: 8.5,
            textTransform: 'uppercase',
            letterSpacing: '.16em',
            color: BRONZE,
          }}
        >
          Total
        </div>
        <div
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 30,
            lineHeight: 1.15,
            fontVariantNumeric: 'tabular-nums',
            textAlign: 'right',
          }}
        >
          {formatBRL(totais.total)}
        </div>
      </div>
    </div>
  );
};

const RodapeLegal: React.FC<{ clinic: QuoteClinicSnapshot }> = ({ clinic }) => (
  <div style={{ flexShrink: 0, paddingTop: 10, borderTop: `1px solid ${HAIRLINE}` }}>
    <div style={{ display: 'flex', gap: 22, justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div style={{ fontSize: 9.5, color: '#8A857C', lineHeight: 1.55, maxWidth: '62ch' }}>
        {clinic.legalNotice}
      </div>
      <div style={{ fontSize: 9.5, color: CINZA, textAlign: 'right', lineHeight: 1.6, flexShrink: 0 }}>
        <div>{[clinic.phone, clinic.instagram].filter(Boolean).join(' · ')}</div>
        {clinic.email && <div>{clinic.email}</div>}
      </div>
    </div>
  </div>
);

interface PaginaLayout {
  primeira: boolean;
  itens: number[];
  blocoFinal: boolean;
}

/**
 * Distribui os itens entre as páginas medindo a altura real de cada bloco no DOM.
 * Estimar por fórmula erraria assim que um detalhe quebrasse em duas linhas — e
 * errar aqui significa cortar um procedimento ao meio, que é o que não pode acontecer.
 */
const paginar = (
  alturas: {
    headerCompleto: number;
    headerCompacto: number;
    identificacao: number;
    mensagem: number;
    itens: number[];
    rodapeValores: number;
    rodapeLegal: number;
  }
): PaginaLayout[] => {
  const paginas: PaginaLayout[] = [];
  let atual: PaginaLayout = { primeira: true, itens: [], blocoFinal: false };
  let espaco =
    ALTURA_UTIL -
    alturas.headerCompleto -
    GAP -
    alturas.identificacao -
    GAP -
    (alturas.mensagem > 0 ? alturas.mensagem + GAP : 0);

  const novaPagina = () => {
    paginas.push(atual);
    atual = { primeira: false, itens: [], blocoFinal: false };
    espaco = ALTURA_UTIL - alturas.headerCompacto - GAP;
  };

  alturas.itens.forEach((altura, indice) => {
    const necessario = altura + GAP;
    // Um item sozinho maior que a página inteira não tem para onde ir: fica onde
    // está em vez de gerar páginas vazias em loop
    if (necessario > espaco && atual.itens.length > 0) novaPagina();
    atual.itens.push(indice);
    espaco -= necessario;
  });

  const blocoFinal = alturas.rodapeValores + GAP + alturas.rodapeLegal + GAP;
  if (blocoFinal > espaco && atual.itens.length > 0) novaPagina();
  atual.blocoFinal = true;
  paginas.push(atual);

  return paginas;
};

interface QuotePrintableProps {
  quote: Quote;
  clinic: QuoteClinicSnapshot;
  /** Chamado quando as páginas já estão montadas e o elemento pode virar PDF. */
  onReady?: () => void;
}

export const QuotePrintable: React.FC<QuotePrintableProps> = ({ quote, clinic, onReady }) => {
  const [layout, setLayout] = useState<PaginaLayout[] | null>(null);
  const medicaoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelado = false;

    const medir = async () => {
      // Sem as fontes carregadas, o Cormorant ainda não está aplicado e toda
      // medição sai errada — daí a espera antes de ler as alturas
      if (document.fonts) await document.fonts.ready;
      if (cancelado) return;

      const root = medicaoRef.current;
      if (!root) return;

      const altura = (seletor: string) =>
        root.querySelector<HTMLElement>(seletor)?.getBoundingClientRect().height ?? 0;

      const alturasItens: number[] = [];
      root
        .querySelectorAll<HTMLElement>('[data-medir^="item-"]')
        .forEach((el) => alturasItens.push(el.getBoundingClientRect().height));

      setLayout(
        paginar({
          headerCompleto: altura('[data-medir="header-completo"]'),
          headerCompacto: altura('[data-medir="header-compacto"]'),
          identificacao: altura('[data-medir="identificacao"]'),
          mensagem: altura('[data-medir="mensagem"]'),
          itens: alturasItens,
          rodapeValores: altura('[data-medir="rodape-valores"]'),
          rodapeLegal: altura('[data-medir="rodape-legal"]'),
        })
      );
    };

    setLayout(null);
    medir();
    return () => {
      cancelado = true;
    };
  }, [quote, clinic]);

  useEffect(() => {
    if (layout && onReady) onReady();
  }, [layout, onReady]);

  const estiloPagina: React.CSSProperties = {
    width: PAGE_W,
    height: PAGE_H,
    background: OFFWHITE,
    padding: `${PAD_TOP}px ${PAD_X}px ${PAD_BOTTOM}px`,
    display: 'flex',
    flexDirection: 'column',
    gap: GAP,
    position: 'relative',
    boxSizing: 'border-box',
    fontFamily: 'var(--font-sans)',
    color: PRETO,
  };

  return (
    <div>
      {/* Passe de medição: fora da tela, mas com layout real (visibility, não display) */}
      {!layout && (
        <div
          ref={medicaoRef}
          aria-hidden
          style={{
            position: 'fixed',
            left: -20000,
            top: 0,
            width: CONTENT_W,
            visibility: 'hidden',
            fontFamily: 'var(--font-sans)',
            background: OFFWHITE,
          }}
        >
          <div data-medir="header-completo">
            <CabecalhoCompleto quote={quote} clinic={clinic} />
          </div>
          <div data-medir="header-compacto">
            <CabecalhoCompacto quote={quote} />
          </div>
          <div data-medir="identificacao">
            <Identificacao quote={quote} />
          </div>
          <div data-medir="mensagem">
            <Mensagem texto={quote.textoApresentacao} />
          </div>
          {quote.itens.map((item, i) => (
            <div key={item.id} data-medir={`item-${i}`}>
              <BlocoItem item={item} semSeparador={false} />
            </div>
          ))}
          <div data-medir="rodape-valores">
            <RodapeValores quote={quote} />
          </div>
          <div data-medir="rodape-legal">
            <RodapeLegal clinic={clinic} />
          </div>
        </div>
      )}

      {layout?.map((pagina, indice) => (
        <div key={indice} data-pdf-page={indice + 1} style={estiloPagina}>
          {pagina.primeira ? (
            <CabecalhoCompleto quote={quote} clinic={clinic} />
          ) : (
            <CabecalhoCompacto quote={quote} />
          )}

          {pagina.primeira && (
            <>
              <Identificacao quote={quote} />
              <Mensagem texto={quote.textoApresentacao} />
            </>
          )}

          {pagina.itens.map((indiceItem, posicao) => (
            <BlocoItem
              key={quote.itens[indiceItem].id}
              item={quote.itens[indiceItem]}
              semSeparador={posicao === 0 && !pagina.primeira}
            />
          ))}

          {pagina.blocoFinal && (
            <>
              <RodapeValores quote={quote} />
              {/* Só o aviso legal fica preso no pé da página; os valores seguem
                  logo depois dos itens, como no design aprovado */}
              <div style={{ flex: 1 }} />
              <RodapeLegal clinic={clinic} />
            </>
          )}

          <div
            style={{
              position: 'absolute',
              right: PAD_X,
              bottom: PAD_BOTTOM / 2,
              fontSize: 9,
              color: '#8A857C',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {indice + 1}/{layout.length}
          </div>
        </div>
      ))}
    </div>
  );
};
