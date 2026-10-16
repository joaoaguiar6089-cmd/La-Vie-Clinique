import React, { useEffect, useRef, useState } from 'react';
import { Recibo } from '../../types';
import { clinicMonogram } from '../ClinicLogo';
import { PaginaDoComprovante } from '../quotes/usePaginasDoComprovante';
import {
  ALTURA_UTIL,
  BRONZE,
  BRONZE_CLARO,
  CINZA,
  CONTENT_W,
  CREME,
  HAIRLINE,
  MM,
  OFFWHITE,
  PRETO,
  TEXTO_DETALHE,
  dataCurta,
  estiloDaPagina,
  estiloDoNumeroDaPagina,
  estiloDoRotulo,
} from '../documentos/estiloA4';
import {
  NOME_FORMA_DO_RECIBO,
  comMaiuscula,
  condicaoDoPagamento,
  cpfLegivel,
  dataPorExtenso,
  declaracaoDoRecibo,
  formatCnpj,
  itensDoRecibo,
  partesDoNomeDaClinica,
  quantidadeLegivel,
  subtotalDoRecibo,
  valorPorExtenso,
} from '../../utils/recibos';
import { formatBRL } from '../../utils/formatters';

/**
 * Hífen que não quebra linha (U+2011) nos números em fonte sans — CPF, CNPJ, nº do orçamento. O
 * html2canvas desenha cada trecho entre pontos de quebra separado, e no hífen comum isso abria um
 * vão no PDF ("789- 01") que a tela não mostrava.
 */
const semQuebra = (texto: string): string => texto.replace(/-/g, '‑');

/** Espaço da folha do comprovante: a página útil menos o cabeçalho compacto e o título. */
const CAIXA_COMPROVANTE_W = CONTENT_W;
const CAIXA_COMPROVANTE_H = ALTURA_UTIL - 110;

/** A folha do recibo tem margens laterais mais largas que a do orçamento — é um documento curto. */
const MARGEM_DO_RECIBO = 20 * MM;

/**
 * Quanto a folha precisou apertar para caber: 0 é o desenho normal; 1 encolhe a tabela e os
 * espaços; 2 encolhe também o nome, o valor e a frase. Ver `PaginasDoRecibo`.
 */
type Densidade = 0 | 1 | 2;

/** O bege das linhas pares e do total da tabela. */
const BEGE_DA_LINHA = '#F4F0EA';
const BEGE_DO_TOTAL = '#EEE6DB';
/** Largura das colunas de quantidade e valor; o procedimento fica com o resto. */
const COLUNA_QTD = 120;
const COLUNA_VALOR = 120;

const rotuloPequeno: React.CSSProperties = {
  ...estiloDoRotulo,
  fontSize: 8.5,
  fontWeight: 600,
  letterSpacing: '.1em',
};

const Cabecalho: React.FC<{ recibo: Recibo }> = ({ recibo }) => {
  const clinica = recibo.clinica;
  const { curto, complemento } = partesDoNomeDaClinica(clinica.name);
  const linhaDeBaixo = [clinica.tagline, clinica.cityState].filter(Boolean).join(' • ');
  return (
    <div style={{ flexShrink: 0, marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <div
            style={{
              width: 52,
              height: 52,
              background: PRETO,
              color: BRONZE,
              fontFamily: 'var(--font-serif)',
              fontSize: 18,
              letterSpacing: '.06em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {clinicMonogram(clinica.name)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24, color: PRETO, lineHeight: 1.1 }}>
              {curto}
            </div>
            {[complemento, linhaDeBaixo].filter(Boolean).map((linha) => (
              <div
                key={linha}
                style={{
                  fontSize: 9,
                  textTransform: 'uppercase',
                  letterSpacing: '.08em',
                  color: CINZA,
                  marginTop: 4,
                }}
              >
                {linha}
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0, whiteSpace: 'nowrap' }}>
          <div style={rotuloPequeno}>Recibo</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24, color: PRETO, lineHeight: 1.25, marginTop: 2 }}>
            Nº {recibo.numero}
          </div>
          <div style={{ fontSize: 10.5, color: CINZA, marginTop: 1 }}>Emitido em {dataCurta(recibo.createdAt)}</div>
        </div>
      </div>
      <div style={{ height: 1, background: HAIRLINE, marginTop: 20 }} />
    </div>
  );
};

/** As folhas do comprovante carregam só o essencial para localizar o documento. */
const CabecalhoCompacto: React.FC<{ recibo: Recibo }> = ({ recibo }) => (
  <div style={{ flexShrink: 0 }}>
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: PRETO }}>
        Nota de recibo Nº {recibo.numero}
      </div>
      <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.14em', color: CINZA }}>
        {recibo.pacienteNome}
      </div>
    </div>
    <div style={{ height: 1, background: HAIRLINE, marginTop: 9 }} />
  </div>
);

/** Quem pagou à esquerda; o valor no bloco preto à direita — o número que a cliente procura. */
const Destaque: React.FC<{ recibo: Recibo; densidade: Densidade }> = ({ recibo, densidade }) => {
  const cpf = cpfLegivel(recibo.pacienteCpf);
  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexShrink: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...rotuloPequeno, marginBottom: 8 }}>Recebido de</div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: densidade === 2 ? 26 : 32, color: PRETO, lineHeight: 1.12 }}>
          {recibo.pacienteNome}
        </div>
        {cpf && <div style={{ fontSize: 11.5, color: CINZA, marginTop: 6 }}>CPF {semQuebra(cpf)}</div>}
      </div>

      <div
        style={{
          background: PRETO,
          color: OFFWHITE,
          padding: '20px 22px 18px',
          width: 260,
          minHeight: densidade === 2 ? 100 : 128,
          boxSizing: 'border-box',
          borderRadius: 8,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div>
          <div style={rotuloPequeno}>Valor recebido</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 34, lineHeight: 1.15, marginTop: 6 }}>
            {formatBRL(recibo.valor)}
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: CREME, opacity: 0.85, lineHeight: 1.4 }}>
          {comMaiuscula(valorPorExtenso(recibo.valor))}
        </div>
      </div>
    </div>
  );
};

/**
 * A frase de abertura e, logo abaixo, a tabela do que foi pago com o total recebido. Com desconto,
 * o total vem precedido do subtotal dos itens (só quando todos têm valor) e do desconto.
 */
const OQueFoiPago: React.FC<{ recibo: Recibo; densidade: Densidade }> = ({ recibo, densidade }) => {
  const itens = itensDoRecibo(recibo);
  const desconto = recibo.desconto && recibo.desconto > 0 ? recibo.desconto : 0;
  const subtotal = desconto > 0 ? subtotalDoRecibo(itens) : null;
  const celula: React.CSSProperties =
    densidade === 0
      ? { padding: '10px 18px', fontSize: 11.5, lineHeight: 1.35 }
      : { padding: '6px 14px', fontSize: 10.5, lineHeight: 1.3 };
  return (
    <div style={{ flexShrink: 0, marginTop: densidade === 0 ? 30 : 14 }}>
      <div
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: densidade === 2 ? 15 : 17,
          lineHeight: densidade === 2 ? 1.45 : 1.6,
          color: PRETO,
          maxWidth: 540,
        }}
      >
        {declaracaoDoRecibo(recibo)}
      </div>

      <div style={{ marginTop: densidade === 0 ? 18 : 10 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: PRETO,
            color: '#FFFFFF',
            borderRadius: '8px 8px 0 0',
            fontSize: 8.5,
            fontWeight: 700,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
          }}
        >
          <div style={{ ...celula, fontSize: 8.5, flex: 1, paddingTop: 12, paddingBottom: 12 }}>Item / procedimento</div>
          <div style={{ ...celula, fontSize: 8.5, width: COLUNA_QTD, textAlign: 'center', paddingTop: 12, paddingBottom: 12 }}>
            Qtd.
          </div>
          <div style={{ ...celula, fontSize: 8.5, width: COLUNA_VALOR, textAlign: 'right', paddingTop: 12, paddingBottom: 12 }}>
            Valor
          </div>
        </div>

        {itens.map((item, i) => (
          <div
            key={item.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              background: i % 2 === 0 ? '#FFFFFF' : BEGE_DA_LINHA,
              borderBottom: `1px solid ${HAIRLINE}`,
            }}
          >
            <div style={{ ...celula, flex: 1, minWidth: 0, color: PRETO }}>{item.titulo}</div>
            <div style={{ ...celula, width: COLUNA_QTD, textAlign: 'center', color: CINZA, fontSize: 10.5 }}>
              {quantidadeLegivel(item)}
            </div>
            <div style={{ ...celula, width: COLUNA_VALOR, textAlign: 'right', color: PRETO }}>
              {item.valor ? formatBRL(item.valor) : '—'}
            </div>
          </div>
        ))}

        {[
          subtotal !== null ? { rotulo: 'Subtotal', valor: formatBRL(subtotal) } : null,
          desconto > 0 ? { rotulo: 'Desconto', valor: `− ${formatBRL(desconto)}` } : null,
        ]
          .filter((l): l is { rotulo: string; valor: string } => !!l)
          .map((linha) => (
            <div
              key={linha.rotulo}
              style={{ display: 'flex', alignItems: 'center', background: '#FFFFFF', borderBottom: `1px solid ${HAIRLINE}` }}
            >
              <div
                style={{
                  ...celula,
                  flex: 1,
                  fontSize: 10,
                  letterSpacing: '.04em',
                  textTransform: 'uppercase',
                  color: CINZA,
                  textAlign: 'right',
                }}
              >
                {linha.rotulo}
              </div>
              <div style={{ ...celula, width: COLUNA_VALOR, textAlign: 'right', color: PRETO }}>{linha.valor}</div>
            </div>
          ))}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: BEGE_DO_TOTAL,
            fontWeight: 700,
            color: PRETO,
          }}
        >
          <div style={{ ...celula, flex: 1, fontSize: 11, letterSpacing: '.04em', textTransform: 'uppercase' }}>
            Total recebido
          </div>
          <div style={{ ...celula, textAlign: 'right' }}>{formatBRL(recibo.valor)}</div>
        </div>
      </div>

      {/* Observação dos recibos antigos, de antes da tabela. Recibo novo não tem. */}
      {recibo.observacoes?.trim() && (
        <div style={{ fontSize: 10.5, color: TEXTO_DETALHE, lineHeight: 1.55, marginTop: 12, whiteSpace: 'pre-line' }}>
          {recibo.observacoes.trim()}
        </div>
      )}

      <div style={{ fontSize: 10.5, color: CINZA, lineHeight: 1.7, marginTop: densidade === 0 ? 18 : 8, maxWidth: 360 }}>
        O presente recibo comprova o pagamento descrito acima, dando plena quitação do valor recebido.
      </div>
    </div>
  );
};

/** A grade de dados do pagamento — data, forma, condição, o orçamento de origem e o comprovante. */
const Detalhes: React.FC<{ recibo: Recibo; paginaDoComprovante?: number }> = ({
  recibo,
  paginaDoComprovante,
}) => {
  const celulas: { rotulo: string; valor: string }[] = [
    { rotulo: 'Data do pagamento', valor: dataCurta(recibo.dataPagamento) },
    { rotulo: 'Forma de pagamento', valor: NOME_FORMA_DO_RECIBO[recibo.forma] },
    { rotulo: 'Condição', valor: condicaoDoPagamento(recibo) },
  ];
  if (recibo.quoteNumero) celulas.push({ rotulo: 'Orçamento', valor: semQuebra(`Nº ${recibo.quoteNumero}`) });
  if (paginaDoComprovante) celulas.push({ rotulo: 'Comprovante', valor: `Anexo na página ${paginaDoComprovante}` });

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${celulas.length}, minmax(0, 1fr))`,
        gap: 18,
        paddingTop: 16,
        borderTop: `1px solid ${HAIRLINE}`,
        flexShrink: 0,
        marginTop: 4,
      }}
    >
      {celulas.map((c) => (
        <div key={c.rotulo}>
          <div style={{ ...rotuloPequeno, fontSize: 8, marginBottom: 6 }}>{c.rotulo}</div>
          <div style={{ fontSize: 11, color: PRETO, lineHeight: 1.4 }}>{c.valor}</div>
        </div>
      ))}
    </div>
  );
};

/** O carimbo de pago — duplo aro bronze, como o selo de um documento conferido. */
const Selo: React.FC<{ data: string }> = ({ data }) => (
  <div
    style={{
      width: 80,
      height: 80,
      borderRadius: '50%',
      border: `1.5px solid ${BRONZE}`,
      padding: 4,
      boxSizing: 'border-box',
      flexShrink: 0,
    }}
  >
    <div
      style={{
        width: '100%',
        height: '100%',
        borderRadius: '50%',
        border: `1px solid ${BRONZE_CLARO}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        color: BRONZE,
      }}
    >
      <div style={{ fontSize: 6.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>Pagamento</div>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, letterSpacing: '.06em', lineHeight: 1.15, color: PRETO }}>
        PAGO
      </div>
      <div style={{ fontSize: 7, color: CINZA }}>{data}</div>
    </div>
  </div>
);

/** O selo à esquerda; ao lado, o local e a data por extenso e quem emite. */
const Assinatura: React.FC<{ recibo: Recibo }> = ({ recibo }) => {
  const clinica = recibo.clinica;
  const cnpj = formatCnpj(clinica.cnpj);
  const local = [clinica.cityState, dataPorExtenso(recibo.createdAt)].filter(Boolean).join(', ');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0, paddingLeft: 18 }}>
      <Selo data={dataCurta(recibo.dataPagamento)} />
      <div style={{ maxWidth: 300 }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: CINZA }}>{local}.</div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: PRETO, lineHeight: 1.35, marginTop: 10 }}>
          {clinica.name}
        </div>
        {cnpj && <div style={{ fontSize: 9.5, color: CINZA, marginTop: 3 }}>CNPJ {semQuebra(cnpj)}</div>}
      </div>
    </div>
  );
};

const Rodape: React.FC<{ recibo: Recibo }> = ({ recibo }) => {
  const clinica = recibo.clinica;
  const assinatura = [partesDoNomeDaClinica(clinica.name).curto, clinica.cityState, clinica.phone]
    .filter(Boolean)
    .join(' • ');
  return (
    <div style={{ flexShrink: 0, paddingTop: 14, borderTop: `1px solid ${HAIRLINE}` }}>
      <div style={{ display: 'flex', gap: 22, justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 9.5, color: CINZA }}>Guarde este recibo junto ao comprovante da transação.</div>
        <div style={{ fontSize: 9.5, color: CINZA, textAlign: 'right' }}>{semQuebra(assinatura)}</div>
      </div>
    </div>
  );
};

interface PaginasDoReciboProps {
  recibo: Recibo;
  /** Folhas do comprovante já baixadas (`usePaginasDoComprovante`), uma página cada no fim. */
  folhasDoComprovante?: PaginaDoComprovante[];
  /** Número da primeira página — no PDF do orçamento, o recibo vem depois das páginas dele. */
  numeroInicial?: number;
  /** Total do arquivo inteiro, para o "N/total". Ausente: só as páginas deste recibo. */
  totalDePaginas?: number;
}

/** Quantas páginas um recibo ocupa: a dele e uma por folha do comprovante. */
export const paginasDoRecibo = (folhasDoComprovante: number): number => 1 + folhasDoComprovante;

/**
 * A nota de recibo em folhas A4 — a página do recibo e, depois, uma por folha do comprovante.
 *
 * Um recibo é um documento curto: tudo cabe numa página, e o espaço que sobra fica embaixo, antes
 * do rodapé. Não há paginação medida como no orçamento; o formulário limita a quantidade de itens
 * (`MAXIMO_DE_ITENS`) para a tabela não passar da folha.
 */
export const PaginasDoRecibo: React.FC<PaginasDoReciboProps> = (props) => {
  // Recibo novo (ou editado) começa de novo do desenho normal, e a medição decide.
  const versao = `${props.recibo.id}|${props.recibo.updatedAt || ''}|${props.recibo.createdAt}`;
  return <PaginasDoReciboMedidas key={versao} {...props} />;
};

const PaginasDoReciboMedidas: React.FC<PaginasDoReciboProps> = ({
  recibo,
  folhasDoComprovante = [],
  numeroInicial = 1,
  totalDePaginas,
}) => {
  const total = totalDePaginas ?? numeroInicial - 1 + paginasDoRecibo(folhasDoComprovante.length);

  /**
   * A folha mede a si mesma: se o conteúdo passou da altura do A4 (muitos itens, nomes longos),
   * aperta um nível e mede de novo. Sem isso a assinatura e o rodapé sairiam cortados do PDF —
   * o html2canvas captura só a altura da folha. As fontes precisam estar carregadas antes: com a
   * fonte de reserva, a medida sai errada.
   */
  const paginaRef = useRef<HTMLDivElement>(null);
  const [densidade, setDensidade] = useState<Densidade>(0);
  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (document.fonts) await document.fonts.ready;
      const pagina = paginaRef.current;
      if (cancelado || !pagina) return;
      if (pagina.scrollHeight > pagina.clientHeight + 1 && densidade < 2) {
        setDensidade((densidade + 1) as Densidade);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [densidade]);
  const numero = (n: number) => (
    <div style={estiloDoNumeroDaPagina}>
      {n}/{total}
    </div>
  );

  return (
    <>
      <div
        ref={paginaRef}
        data-pdf-page={numeroInicial}
        style={{ ...estiloDaPagina, paddingLeft: MARGEM_DO_RECIBO, paddingRight: MARGEM_DO_RECIBO }}
      >
        {/* A faixa preta no alto, de ponta a ponta — só na folha do recibo */}
        <div aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 26, background: PRETO }} />

        <Cabecalho recibo={recibo} />
        <Destaque recibo={recibo} densidade={densidade} />
        <OQueFoiPago recibo={recibo} densidade={densidade} />
        <Detalhes
          recibo={recibo}
          paginaDoComprovante={folhasDoComprovante.length > 0 ? numeroInicial + 1 : undefined}
        />
        <div style={{ height: 6, flexShrink: 0 }} />
        <Assinatura recibo={recibo} />

        {/* O que sobra da folha fica embaixo, com o monograma bem apagado ocupando o vazio. */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
          <div
            aria-hidden
            style={{
              position: 'absolute',
              right: 0,
              bottom: -18,
              fontFamily: 'var(--font-serif)',
              fontSize: 160,
              lineHeight: 1,
              color: BRONZE,
              opacity: 0.08,
              userSelect: 'none',
            }}
          >
            {clinicMonogram(recibo.clinica.name)}
          </div>
        </div>
        <Rodape recibo={recibo} />

        <div style={{ ...estiloDoNumeroDaPagina, right: MARGEM_DO_RECIBO }}>
          {numeroInicial}/{total}
        </div>
      </div>

      {folhasDoComprovante.map((folha, i) => {
        // Cabe inteira na caixa, sem distorcer: a menor das duas escalas
        const escala = Math.min(CAIXA_COMPROVANTE_W / folha.largura, CAIXA_COMPROVANTE_H / folha.altura);
        const n = numeroInicial + 1 + i;
        return (
          <div key={i} data-pdf-page={n} style={estiloDaPagina}>
            <CabecalhoCompacto recibo={recibo} />

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: PRETO, lineHeight: 1.15 }}>
                Comprovante de pagamento
              </div>
              <span
                style={{
                  display: 'inline-block',
                  marginTop: 3,
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '.14em',
                  color: BRONZE,
                  fontWeight: 600,
                }}
              >
                {[
                  `Pago em ${dataCurta(recibo.dataPagamento)}`,
                  formatBRL(recibo.valor),
                  folhasDoComprovante.length > 1 ? `folha ${i + 1} de ${folhasDoComprovante.length}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>

            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
              <img
                src={folha.src}
                alt={`Comprovante de pagamento, folha ${i + 1}`}
                style={{
                  width: Math.floor(folha.largura * escala),
                  height: Math.floor(folha.altura * escala),
                  border: `1px solid ${HAIRLINE}`,
                  background: '#FFFFFF',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {numero(n)}
          </div>
        );
      })}
    </>
  );
};
