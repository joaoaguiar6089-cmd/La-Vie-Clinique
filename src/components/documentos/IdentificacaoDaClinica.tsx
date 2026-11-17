import React from 'react';
import type { ClinicProfile } from '../../types';
import { ehZulia } from '../../lib/projetoFirebase';
import { nomeDaClinica } from '../../utils/marca';
import { LogoDaFolha, useMarcaDosDocumentos } from './MarcaDosDocumentos';

/**
 * O canto esquerdo do cabeçalho das fichas (anamnese, avaliação, relatório, ficha em branco): o
 * logo da clínica, quando ela tem um, e ao lado o título do documento, o nome, o slogan e o contato.
 *
 * Era repetido nas três folhas com dois defeitos que só apareciam fora da La Vie: o slogan vazio
 * caía em "Excelência Médica e Estética Avançada" (o da La Vie), e o endereço vazio deixava
 * " •  • Tel:" no papel. Agora o que não existe simplesmente não sai.
 */
export const IdentificacaoDaClinica: React.FC<{
  titulo: React.ReactNode;
  clinicProfile: Pick<ClinicProfile, 'name' | 'tagline' | 'address' | 'cityState' | 'phone'>;
}> = ({ titulo, clinicProfile }) => {
  const { logoUrl } = useMarcaDosDocumentos();
  const slogan = clinicProfile.tagline?.trim() || (ehZulia ? '' : 'Excelência Médica e Estética Avançada');
  const contato = [
    clinicProfile.address?.trim(),
    clinicProfile.cityState?.trim(),
    clinicProfile.phone?.trim() ? `Tel: ${clinicProfile.phone.trim()}` : '',
  ].filter(Boolean);

  return (
    <div className="flex items-start gap-4 min-w-0">
      {logoUrl && <LogoDaFolha url={logoUrl} nome={clinicProfile.name} altura={52} larguraMaxima={140} />}
      <div className="min-w-0">
        <h2 className="font-serif-luxury text-2xl font-bold tracking-tight text-ink leading-tight">{titulo}</h2>
        <p className="text-xs font-semibold text-ink mt-1.5">{nomeDaClinica(clinicProfile)}</p>
        {slogan && <p className="text-xs text-gray-500 italic mt-0.5">{slogan}</p>}
        {contato.length > 0 && <p className="text-[11px] text-gray-500 mt-1">{contato.join(' • ')}</p>}
      </div>
    </div>
  );
};
