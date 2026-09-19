/** Compact bridge consulting notes. Not a substitute for the official text. */
export const BRIDGE_CONSULT = {
  papel:
    "Colega presencial no passadiço. Orientação e consulta. Não substitui o oficial de serviço, o comandante nem o texto oficial vigente.",
  navegacao:
    "Derrota GPX, XTE, SOG em nós, distâncias em milhas, COLREG, vigia. Posição e ETA só dos números ao vivo. Se abriu da linha, volta pra derrota.",
  estabilidade:
    "GM positivo, superfície livre piora a estabilidade, lastro e consumo mudam trim e calado. Balanço forte: reduzir RPM, proa ao mar, checar carga e tanques. Não invente GM se não estiver no contexto.",
  norman:
    "NORMAM (DPC / Autoridade Marítima). Normas de navegação, praticagem, salvaguarda e inspeção naval no Brasil. Fale em linguagem de bordo. Se pedirem artigo, diga que é consulta — o texto oficial prevalece.",
  marpol:
    "Prevenir poluição: óleo, mistura oleosa, lixo, esgoto. Água costeira: sem descarte de óleo. Lixo no plano de gestão. Em dúvida, retém a bordo e registra.",
  solas:
    "Segurança da vida no mar: aparelhos de salvamento, ISM, alerta, documentos de estabilidade. Em emergência: alarme, pessoas, navio, meio ambiente.",
};

export function consultBlock() {
  return BRIDGE_CONSULT;
}
