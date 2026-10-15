import React from 'react';
import { Recibo } from '../../types';
import { clinicMonogram } from '../ClinicLogo';
import { PaginaDoComprovante } from '../quotes/usePaginasDoComprovante';
import {
  ALTURA_UTIL,
  BRONZE,
  BRONZE_CLARO,
  CINZA,
  CINZA_CLARO,
  CONTENT_W,
  CREME,
  HAIRLINE,
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
  condicaoDoPagamento,
  cpfLegivel,
  dataPorExtenso,
  declaracaoDoRecibo,
  formatCnpj,
  valorPorExtenso,
} from '../../utils/recibos';
import { formatBRL } from '../../utils/formatters';

/**
 * Hífen que não quebra linha (U+2011) nos números em fonte sans — CPF, CNPJ, nº do orçamento. O
 * html2canvas desenha cada trecho entre pontos de quebra separado, e no hífen comum isso abria um
 * vão no PDF ("789- 01") que a tela não mostrava.
 */
const semQuebra = (texto: string): string => texto.replace(/-/g, '\u2011');

/** Espaço da folha do comprovante: a página útil menos o cabeçalho compacto e o título. */
const CAIXA_COMPROVANTE_W = CONTENT_W;
const CAIXA_COMPROVANTE_H = ALTURA_UTIL - 110;

const Cabecalho: React.FC<{ recibo: Recibo }> = ({ recibo }) => {
  const clinica = recibo.clinica;
  return (
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
            {clinicMonogram(clinica.name)}
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: PRETO, lineHeight: 1.1 }}>
              {clinica.name}
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
              {[clinica.tagline, clinica.cityState].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0, whiteSpace: 'nowrap' }}>
          <div style={estiloDoRotulo}>Nota de recibo</div>
          <div
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 20,
              color: PRETO,
              lineHeight: 1.25,
            }}
          >
            Nº {recibo.numero}
          </div>
          <div style={{ fontSize: 10, color: CINZA }}>
            Emitido em {dataCurta(recibo.createdAt)}
          </div>
        </div>
      </div>
      <div style={{ height: 1, background: HAIRLINE, marginTop: 13 }} />
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
const Destaque: React.FC<{ recibo: Recibo }> = ({ recibo }) => {
  const cpf = cpfLegivel(recibo.pacienteCpf);
  return (
    <div style={{ display: 'flex', gap: 22, alignItems: 'stretch', flexShrink: 0, marginTop: 6 }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ ...estiloDoRotulo, marginBottom: 4 }}>Recebido de</div>
        <div
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 34,
            color: PRETO,
            lineHeight: 1.12,
          }}
        >
          {recibo.pacienteNome}
        </div>
        {cpf && (
          <div style={{ fontSize: 11, color: CINZA, marginTop: 6 }}>
            CPF {semQuebra(cpf)}
          </div>
        )}
      </div>

      <div
        style={{
          background: PRETO,
          color: OFFWHITE,
          padding: '20px 22px',
          width: 290,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div style={estiloDoRotulo}>Valor recebido</div>
        <div
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 38,
            lineHeight: 1.15,
            marginTop: 4,
          }}
        >
          {formatBRL(recibo.valor)}
        </div>
        <div style={{ fontSize: 10, color: CREME, opacity: 0.75, lineHeight: 1.45, marginTop: 4 }}>
          {valorPorExtenso(recibo.valor)}
        </div>
        <div style={{ height: 1, background: 'rgba(196,155,116,.35)', margin: '12px 0 9px' }} />
        <div style={{ fontSize: 10.5, color: CREME }}>
          Pago em {dataCurta(recibo.dataPagamento)}
        </div>
      </div>
    </div>
  );
};

/** O texto formal do recibo, com o nome e o valor em destaque. */
const Declaracao: React.FC<{ recibo: Recibo }> = ({ recibo }) => {
  const d = declaracaoDoRecibo(recibo);
  return (
    <div
      style={{
        fontFamily: 'var(--font-serif)',
        fontSize: 17,
        lineHeight: 1.6,
        color: TEXTO_DETALHE,
        flexShrink: 0,
        marginTop: 8,
      }}
    >
      {d.antesDoNome}
      <span style={{ color: PRETO, fontWeight: 600 }}>{d.nome}</span>
      {d.depoisDoNome}
      <span style={{ color: PRETO, fontWeight: 600 }}>{d.valor}</span>{' '}
      {d.extenso}
      {d.fim}
    </div>
  );
};

/** A grade de dados do pagamento — data, forma, condição e o orçamento de origem. */
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
  if (paginaDoComprovante) celulas.push({ rotulo: 'Comprovante', valor: `Anexo, pág. ${paginaDoComprovante}` });

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${celulas.length}, minmax(0, 1fr))`,
        gap: 18,
        paddingTop: 13,
        borderTop: `1px solid ${HAIRLINE}`,
        flexShrink: 0,
        marginTop: 6,
      }}
    >
      {celulas.map((c) => (
        <div key={c.rotulo}>
          <div style={{ ...estiloDoRotulo, fontSize: 8, letterSpacing: '.14em', marginBottom: 4 }}>{c.rotulo}</div>
          <div style={{ fontSize: 12, color: PRETO, lineHeight: 1.4 }}>
            {c.valor}
          </div>
        </div>
      ))}
    </div>
  );
};

/** O carimbo de pago — duplo aro bronze, como o selo de um documento conferido. */
const Selo: React.FC<{ data: string }> = ({ data }) => (
  <div
    style={{
      width: 104,
      height: 104,
      borderRadius: '50%',
      border: `1.5px solid ${BRONZE}`,
      padding: 4,
      boxSizing: 'border-box',
      flexShrink: 0,
      transform: 'rotate(-8deg)',
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
      <div style={{ fontSize: 7, letterSpacing: '.22em', textTransform: 'uppercase' }}>Pagamento</div>
      <div
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 24,
          letterSpacing: '.12em',
          lineHeight: 1.1,
          color: PRETO,
          margin: '2px 0 1px',
        }}
      >
        PAGO
      </div>
      <div style={{ fontSize: 8, letterSpacing: '.08em' }}>{data}</div>
    </div>
  </div>
);

/** Local e data à esquerda; o selo e a linha de quem emite à direita. */
const Assinatura: React.FC<{ recibo: Recibo }> = ({ recibo }) => {
  const clinica = recibo.clinica;
  const cnpj = formatCnpj(clinica.cnpj);
  const local = [clinica.cityState, dataPorExtenso(recibo.createdAt)].filter(Boolean).join(', ');
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexShrink: 0 }}>
      <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: TEXTO_DETALHE }}>
        {local}.
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 22 }}>
        <Selo data={dataCurta(recibo.dataPagamento)} />
        <div style={{ width: 230, textAlign: 'center' }}>
          <div style={{ height: 1, background: PRETO, opacity: 0.55, marginBottom: 7 }} />
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: PRETO, lineHeight: 1.2 }}>
            {clinica.name}
          </div>
          {cnpj && (
            <div style={{ fontSize: 9.5, color: CINZA, marginTop: 2 }}>
              CNPJ {semQuebra(cnpj)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Rodape: React.FC<{ recibo: Recibo }> = ({ recibo }) => {
  const clinica = recibo.clinica;
  return (
    <div style={{ flexShrink: 0, paddingTop: 10, borderTop: `1px solid ${HAIRLINE}` }}>
      <div style={{ display: 'flex', gap: 22, justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 9.5, color: CINZA_CLARO, lineHeight: 1.55, maxWidth: '52ch' }}>
          Este recibo comprova o pagamento descrito acima. Guarde-o junto com o comprovante da
          transação.
        </div>
        <div style={{ fontSize: 9.5, color: CINZA, textAlign: 'right', lineHeight: 1.6, flexShrink: 0 }}>
          <div>{[clinica.phone, clinica.instagram].filter(Boolean).join(' · ')}</div>
          {clinica.email && <div>{clinica.email}</div>}
          {clinica.address && <div>{clinica.address}</div>}
        </div>
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
 * Um recibo é um documento curto: tudo cabe numa página, e o espaço que sobra fica entre o texto e
 * a assinatura, onde um recibo de papel também deixa. Não há paginação medida como no orçamento;
 * o formulário limita o tamanho dos textos livres para nada passar da folha.
 */
export const PaginasDoRecibo: React.FC<PaginasDoReciboProps> = ({
  recibo,
  folhasDoComprovante = [],
  numeroInicial = 1,
  totalDePaginas,
}) => {
  const total = totalDePaginas ?? numeroInicial - 1 + paginasDoRecibo(folhasDoComprovante.length);
  const numero = (n: number) => (
    <div style={estiloDoNumeroDaPagina}>
      {n}/{total}
    </div>
  );

  return (
    <>
      <div data-pdf-page={numeroInicial} style={estiloDaPagina}>
        <Cabecalho recibo={recibo} />
        <Destaque recibo={recibo} />
        <Declaracao recibo={recibo} />
        <Detalhes
          recibo={recibo}
          paginaDoComprovante={folhasDoComprovante.length > 0 ? numeroInicial + 1 : undefined}
        />

        {recibo.observacoes?.trim() && (
          <div style={{ flexShrink: 0 }}>
            <div style={{ ...estiloDoRotulo, fontSize: 8, marginBottom: 4 }}>Observações</div>
            <div style={{ fontSize: 11, color: TEXTO_DETALHE, lineHeight: 1.55, whiteSpace: 'pre-line' }}>
              {recibo.observacoes.trim()}
            </div>
          </div>
        )}

        {/* A assinatura vem logo depois do texto, como num recibo de papel; o que sobra da folha
            fica embaixo, com o monograma bem apagado ocupando o vazio. */}
        <div style={{ height: 34, flexShrink: 0 }} />
        <Assinatura recibo={recibo} />
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div
            aria-hidden
            style={{
              position: 'absolute',
              right: -6,
              bottom: -40,
              fontFamily: 'var(--font-serif)',
              fontSize: 300,
              lineHeight: 1,
              letterSpacing: '.02em',
              color: BRONZE,
              opacity: 0.07,
              userSelect: 'none',
            }}
          >
            {clinicMonogram(recibo.clinica.name)}
          </div>
        </div>
        <Rodape recibo={recibo} />

        {numero(numeroInicial)}
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
