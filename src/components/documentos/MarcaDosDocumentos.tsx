import React, { createContext, useContext, useEffect, useMemo } from 'react';
import type { ClinicProfile } from '../../types';
import { resolveClinicLogoUrl } from '../ClinicLogo';
import {
  type MarcaDosDocumentos,
  carregarFontesDosDocumentos,
  estiloDaMarca,
  marcaDoPerfil,
} from '../../utils/marcaDosDocumentos';

/**
 * A marca dos documentos (cor, fontes e logo) para as folhas que viram PDF.
 *
 * Um contexto, e não uma prop: as folhas moram em uma dúzia de telas (orçamento, recibo, simulação,
 * anamnese, avaliação, relatório, catálogo), algumas a três componentes de distância do perfil da
 * clínica. O `App` põe o provedor uma vez com o perfil; as páginas da paciente, que não têm login,
 * põem com o espelho público; a prévia das configurações, com o que está sendo editado.
 *
 * Sem provedor (ou sem escolha), as folhas saem como sempre saíram.
 */

const SEM_MARCA: MarcaDosDocumentos = {};

const Contexto = createContext<MarcaDosDocumentos>(SEM_MARCA);

type PerfilDaMarca = Pick<ClinicProfile, 'corDosDocumentos' | 'fontesDosDocumentos' | 'logoNosDocumentos' | 'logoUrl'>;

/** A marca a partir do perfil, com o logo de exemplo do seed tratado como "sem logo". */
export const marcaDosDocumentosDaClinica = (perfil?: Partial<PerfilDaMarca> | null): MarcaDosDocumentos => {
  const marca = marcaDoPerfil(perfil as PerfilDaMarca);
  return { ...marca, logoUrl: resolveClinicLogoUrl(marca.logoUrl) };
};

export const ProvedorDaMarcaDosDocumentos: React.FC<{
  perfil?: Partial<PerfilDaMarca> | null;
  children: React.ReactNode;
}> = ({ perfil, children }) => {
  const cor = perfil?.corDosDocumentos;
  const fontes = perfil?.fontesDosDocumentos;
  const comLogo = perfil?.logoNosDocumentos;
  const logo = perfil?.logoUrl;
  const marca = useMemo(
    () => marcaDosDocumentosDaClinica({ corDosDocumentos: cor, fontesDosDocumentos: fontes, logoNosDocumentos: comLogo, logoUrl: logo }),
    [cor, fontes, comLogo, logo]
  );

  // A fonte começa a baixar assim que a clínica é conhecida, e não no clique do PDF: quando a
  // folha abrir, ela já está pronta para ser medida.
  useEffect(() => {
    carregarFontesDosDocumentos(marca.fontes);
  }, [marca.fontes]);

  return <Contexto.Provider value={marca}>{children}</Contexto.Provider>;
};

export const useMarcaDosDocumentos = (): MarcaDosDocumentos => useContext(Contexto);

/** O estilo da raiz da folha: as variáveis da cor e das fontes da clínica (vazio sem escolha). */
export const useEstiloDaMarca = (): React.CSSProperties => {
  const marca = useMarcaDosDocumentos();
  return useMemo(() => estiloDaMarca(marca), [marca.cor, marca.fontes]);
};

/**
 * O logo no cabeçalho das folhas A4, no lugar do quadrado preto com as iniciais. Ocupa a mesma
 * altura do quadrado (42px), e a largura que a marca pedir até um teto — um logo largo continua
 * inteiro, sem corte.
 */
export const LogoDaFolha: React.FC<{ url: string; nome?: string; altura?: number; larguraMaxima?: number }> = ({
  url,
  nome,
  altura = 42,
  larguraMaxima = 150,
}) => (
  <img
    src={url}
    alt={nome ? `Logo de ${nome}` : 'Logo da clínica'}
    style={{
      height: altura,
      width: 'auto',
      maxWidth: larguraMaxima,
      objectFit: 'contain',
      objectPosition: 'left center',
      flexShrink: 0,
      display: 'block',
    }}
  />
);
