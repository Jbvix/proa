import { foldPt } from "./wake-word.ts";

/** Compact bridge consulting notes. Not a substitute for the official text. */
export const BRIDGE_CONSULT = {
  papel:
    "Colega presencial no passadiço. Orientação e consulta. Não substitui o oficial de serviço, o comandante nem o texto oficial vigente.",
  navegacao:
    "Derrota GPX, XTE, SOG em nós, milhas, COLREG. Vigia permanente, velocidade de segurança, avaliar risco de colisão. Posição e ETA só dos números ao vivo. Fora da linha: volta pra derrota.",
  colreg:
    "COLREG: vigia o tempo todo; velocidade que dê tempo de manobrar; se o risco de colisão existe, age cedo e claro. Em canal estreito e com praticagem, o comboio tem prioridade de fato — não force ultrapassagem. Luzes e marcas segundo o estado. Sem inventar número de regra.",
  estabilidade:
    "GM positivo. Superfície livre (tanque pela metade) faz o líquido correr, o G sobe, o GM cai. Lastro e consumo mudam trim e calado. Balanço forte: reduzir RPM, proa ao mar, checar tanques e carga. Não invente GM.",
  norman:
    "NORMAM da DPC / Autoridade Marítima: navegação, praticagem, salvaguarda e inspeção no Brasil. Linguagem de bordo. Pediu artigo: princípio + o texto vigente na DPC prevalece.",
  marpol:
    "Prevenir poluição. Óleo e mistura oleosa: na costa não despeja; sentina no residual; registra. Plástico e lixo: plano de gestão, no mar não vai. Em dúvida, retém a bordo e anota.",
  solas:
    "Vida no mar: pessoas, navio, meio ambiente. Aparelhos de salvamento prontos, alarme, reunião, contagem. Segue o plano de emergência do navio. Consulta, não substitui o ISM.",
};

export type ConsultLive = {
  name?: string;
  xteNm?: number | null;
  xteLado?: string | null;
  hsM?: number | null;
  rollDeg?: number | null;
  costaNm?: number | null;
};

export function consultBlock() {
  return BRIDGE_CONSULT;
}

function hi(live?: ConsultLive) {
  return live?.name ? `${live.name}. ` : "";
}

const DISCLAIMER = " Isso é consulta de passadiço — o texto oficial e o oficial de serviço mandam.";

/** Fast consulting lines. Principles only — no fake article numbers. */
export function consultReply(raw: string, live: ConsultLive = {}): string | null {
  const t = foldPt(raw);
  if (!t || t.length < 4) return null;
  const h = hi(live);

  if (/superficie livre|tanque (pela metade|parcial)|gm\b|metacentr|estabilidade|lastro|trim\b|calado|balanco de banda|tomb/.test(t)) {
    const roll =
      live.rollDeg != null && live.rollDeg >= 8
        ? ` Agora o balanço tá em ${live.rollDeg.toFixed(0)}° — reduz RPM e põe a proa ao mar.`
        : "";
    if (/superficie livre|tanque (pela metade|parcial)/.test(t)) {
      return `${h}Superfície livre é tanque pela metade: o líquido corre na banda, o centro de gravidade sobe e o GM cai. Enche, esvazia ou divide o tanque. Não deixa folga grande com mar de través.${roll}${DISCLAIMER}`;
    }
    if (/lastro|trim\b|calado/.test(t)) {
      return `${h}Lastro e consumo mudam trim e calado o tempo todo. GM tem que ficar positivo. Evita superfície livre e carga mal peada. Se o casco queixar, reduz RPM e checa tanques.${roll}${DISCLAIMER}`;
    }
    return `${h}Estabilidade boa é GM positivo e tanques quietos. Balanço forte: RPM pra baixo, proa ao mar, trava porta e olha lastro. Não chuto GM sem o livrete.${roll}${DISCLAIMER}`;
  }

  if (/colreg|regulamento.*abord|prioridade|risco de (colisao|abalg)|velocidade de seguranca|vigia permanente|luzes de naveg/.test(t)) {
    return `${h}COLREG no passadiço: vigia o tempo todo, velocidade que dê tempo de manobrar, e se o risco de colisão existe age cedo e claro. Não force ultrapassagem em canal. Luzes e marcas conforme o estado. Número de regra eu não cito de cabeça — o texto vigente manda.${DISCLAIMER}`;
  }

  if (/marpol|descarte|oleo na (agua|sentina)|mistura oleosa|lixo (no mar|a bordo)|plastico no mar|poluicao|sentina/.test(t)) {
    if (/lixo|plastico/.test(t)) {
      return `${h}Lixo e plástico não vão pro mar. Fica no plano de gestão, separado, e desce em porto. Em dúvida, retém e registra.${DISCLAIMER}`;
    }
    return `${h}MARPOL: óleo e mistura oleosa na costa não despeja. Sentina vai pro residual, operação no livro. Se não tiver certeza da zona, retém a bordo e anota. Poluição a gente não arrisca.${DISCLAIMER}`;
  }

  if (/solas|salvamento|baleeira|colete|reuniao de emergencia|homem ao mar|ism\b|alarme geral/.test(t)) {
    if (/homem ao mar|mob|caiu na agua/.test(t)) {
      return `${h}Homem ao mar: alarme, marca o ponto, não perde de vista, bóia e prepara recolhimento. O plano do navio manda a manobra. Pessoas primeiro.${DISCLAIMER}`;
    }
    return `${h}SOLAS é vida no mar: pessoas, navio, meio ambiente. Aparelho de salvamento pronto, alarme, reunião, contagem. Segue o plano de emergência e o ISM do navio — eu oriento, não substituo.${DISCLAIMER}`;
  }

  if (/norman|normam|autoridade maritima|dpc\b|praticagem|inspecao naval|salvaguarda da naveg/.test(t)) {
    return `${h}NORMAM é a norma da Autoridade Marítima, DPC. Aqui no Brasil cobre navegação, praticagem, salvaguarda e inspeção. Eu falo o princípio em linguagem de bordo. Artigo eu não invento — o texto vigente na DPC prevalece.${DISCLAIMER}`;
  }

  if (/o que (e|eh) xte|significa xte|cross track/.test(t)) {
    const now =
      live.xteNm != null
        ? ` Agora tá ${live.xteNm.toFixed(2)} milhas ${live.xteLado ?? ""}`.trim() + "."
        : "";
    return `${h}XTE é o quanto a gente abriu da derrota, na perpendicular. Bombordo ou estibordo. Acima de uns 0,25 milha eu aviso pra voltar pra linha.${now}`;
  }

  if (/consultar|consultoria|me explica a norma|o que vale a bordo/.test(t)) {
    return `${h}Posso orientar navegação, estabilidade, NORMAM, MARPOL e SOLAS. Fato da viagem pelos números ao vivo. Norma em princípio de passadiço — sem artigo inventado. O oficial de serviço e o texto oficial mandam.`;
  }

  return null;
}
