// A matemática de FII vem do calc.mjs — MESMA fonte que o app usa e que os
// testes cobrem. Duplicar a conta aqui criaria dois caminhos divergentes, que é
// a classe de bug que já apareceu quatro vezes neste projeto.
import { dyFii12m, tendenciaFii, filtraFii } from "../src/calc.mjs";

// BRAPI_TOKEN agora vem de env (secret no Cloudflare) — não fica mais no código.

// Supabase (chave anon é pública — usada só para validar o login de quem chama o proxy de IA)
const SUPA_URL = "https://llpzdrqgvkpxjnecttkb.supabase.co";
const SUPA_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxscHpkcnFndmtweGpuZWN0dGtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3MDA2MjAsImV4cCI6MjA5NjI3NjYyMH0.X3DDKVRppRO-NiC5a2Cc0JrpFAaf5J-hymFHv6vNQ6Q";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ── Leitura sem perdas + reparo de mojibake por-string ────────────────────────
// O Fundamentus alterna encoding (UTF-8/Latin-1) e mistura bytes sujos. Detecção
// global da página é furada. Estratégia robusta: ler como Latin-1 (lossless — todo
// byte vira 1 char, nunca falha) e consertar o mojibake em CADA campo extraído.
async function lerHtml(response) {
  const buf = await response.arrayBuffer();
  return new TextDecoder("iso-8859-1").decode(buf);
}

// Conserta texto que era UTF-8 mas foi lido como Latin-1 ("Ã§Ã£o" → "ção").
// Detecta a assinatura do mojibake (lead UTF-8 C2-DF seguido de continuação 80-BF);
// se não houver, devolve igual. Só comita a conversão se o resultado ficar limpo
// (sem \uFFFD) — assim nunca piora um texto que já estava correto.
function repararMojibake(s) {
  if (!s || !/[\u00C2-\u00DF][\u0080-\u00BF]/.test(s)) return s;
  try {
    const bytes = Uint8Array.from([...s].map(c => c.charCodeAt(0) & 0xFF));
    const fixed = new TextDecoder("utf-8").decode(bytes);
    return fixed.includes("\uFFFD") ? s : fixed;
  } catch { return s; }
}

// ── Indicadores fundamentalistas ─────────────────────────────────────────────
// BR (B3): usa brapi.dev (estável). AU/US: tenta Yahoo quoteSummary com crumb.
async function fetchIndicadores(yfTicker, env) {
  const isBR = /\.SA$/i.test(yfTicker) || /^[A-Z]{4}\d{1,2}$/.test(yfTicker);
  if (isBR) return await fetchIndicadoresBrapi(yfTicker, env);
  return await fetchIndicadoresYahoo(yfTicker);
}

// brapi.dev — fonte confiável para ações brasileiras
async function fetchIndicadoresBrapi(yfTicker, env) {
  try {
    const tk = yfTicker.replace(/\.SA$/i, "");
    // Plano grátis: só o quote básico funciona. NÃO pede módulos pagos nem dividends
    // (o DY é calculado no /raiox pelo histórico do Yahoo, que não depende da brapi).
    const r = await fetch(
      `https://brapi.dev/api/quote/${encodeURIComponent(tk)}?token=${env?.BRAPI_TOKEN || ""}`,
      { headers: { "Accept": "application/json" } }
    );
    // 429 (rate limit) e 401 (token inválido) devolvem JSON de erro sem lançar
    // exceção — sem este log viram o mesmo "null" de um ticker inexistente.
    if (!r.ok) console.error("[fetchIndicadoresBrapi] HTTP", r.status, "para", tk);
    const d = await r.json();
    const a = d?.results?.[0];
    if (!a) return null;
    return {
      nome: a.longName || a.shortName || null,
      pl: a.priceEarnings ?? null,
      lpa: a.earningsPerShare ?? null,
      // Campos abaixo dependem de módulos pagos da brapi — indisponíveis no plano grátis
      dy: null, pvp: null, roe: null, roa: null, margem_liquida: null, divida_ebitda: null, vpa: null,
    };
  } catch (erro) {
    console.error("[fetchIndicadoresBrapi] falha:", erro?.status, erro?.message || erro);
    return null;
  }
}

// ── Fundamentus (scraping) — complementa brapi para P/VP, ROE, Margem etc ─────
// Fonte gratuita, sem API oficial. HTML estático = parse por label.
// FRÁGIL: se o site mudar o layout, retorna null e o app cai pro "—".
async function fetchFundamentus(ticker) {
  try {
    const papel = ticker.replace(/\.SA$/i, "").toUpperCase();
    const r = await fetch(
      `https://www.fundamentus.com.br/detalhes.php?papel=${encodeURIComponent(papel)}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
      }
    );
    if (!r.ok) { console.error("[fetchFundamentus] HTTP", r.status, "para", papel); return null; }
    const html = await lerHtml(r);   // detecta UTF-8 ou Latin-1 automaticamente

    // Ancora no LABEL dentro do <span class="txt">, pula o que houver no meio,
    // e captura o valor da próxima <td class="data">. Tolera quebras de linha.
    const pega = (label) => {
      const re = new RegExp(
        '<span[^>]*class="txt"[^>]*>' +
        label.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") +
        '</span>[\\s\\S]{0,150}?<td[^>]*class="data[^"]*"[^>]*>\\s*<span[^>]*class="txt"[^>]*>([\\s\\S]*?)</span>',
        "i"
      );
      const m = html.match(re);
      if (!m) return null;
      // remove tags internas (ex: <a href> do setor), pega só o texto
      return m[1].replace(/<[^>]+>/g, "").trim();
    };

    // Converte "1.234,56" / "12,3%" / "0,83" → número. Retorna null se vazio.
    const num = (s) => {
      if (!s || s === "-" || s === "") return null;
      const limpo = s.replace(/%/g, "").replace(/\./g, "").replace(/,/g, ".").trim();
      const n = parseFloat(limpo);
      return Number.isFinite(n) ? n : null;
    };

    // Texto puro: normaliza o "-" (célula vazia do Fundamentus) para null.
    const txt = (s) => (!s || s === "-") ? null : s;

    // ── Guarda do zero-filler no setor financeiro ────────────────────────────
    // Bancos e parte das seguradoras não têm estrutura de custo/receita
    // tradicional. Em vez de omitir os campos do esquema não-financeiro, o
    // Fundamentus os preenche com ZERO — e zero é pior que vazio, porque passa
    // por número válido (Marg. Líquida 0,0% em BBAS3/ITUB4/BBDC4/SANB11).
    //
    // "Marg. Bruta === '-'" é o discriminante: testado em 14 papéis, acertou
    // 100% sem falso positivo. Alternativas descartadas por quebrarem em casos
    // reais: Subsetor==="Seguradoras" anularia os 8,9% legítimos da PSSA3;
    // ROIC==="-" não pega a CXSE3, que tem ROIC real e margens zeradas.
    const layoutFinanceiro = pega("Marg. Bruta") === "-";
    // Só desconfia de zero DENTRO do layout financeiro — assim a PSSA3, que tem
    // Dív. Bruta 0 de verdade (seguradora sem dívida), mantém o zero dela.
    const numF = (s) => { const n = num(s); return (layoutFinanceiro && n === 0) ? null : n; };

    const pvp = num(pega("P/VP"));
    const roe = num(pega("ROE"));
    const roic = num(pega("ROIC"));
    const pl = num(pega("P/L"));
    const lpa = num(pega("LPA"));
    const vpa = num(pega("VPA"));

    // Se NENHUM indicador básico foi lido, o parse quebrou (layout mudou).
    // Usa 6 campos que existem tanto em banco quanto em não-financeira — a
    // checagem antiga incluía a margem, que era sempre null por causa do bug
    // de escaping, e por isso valia menos do que aparentava.
    if (pvp == null && roe == null && roic == null && pl == null && lpa == null && vpa == null) return null;

    return {
      // — identificação —
      empresa_fund: repararMojibake(pega("Empresa")) || null,
      setor_fund: repararMojibake(pega("Setor")) || null,
      subsetor_fund: repararMojibake(pega("Subsetor")) || null,

      // — múltiplos de mercado —
      pvp, pl, psr: num(pega("PSR")),
      p_ativos: num(pega("P/Ativos")),
      p_cap_giro: num(pega("P/Cap. Giro")),
      p_ebit: num(pega("P/EBIT")),
      p_ativ_circ_liq: num(pega("P/Ativ Circ Liq")),
      ev_ebit: num(pega("EV / EBIT")),
      ev_ebitda: num(pega("EV / EBITDA")),
      div_yield: num(pega("Div. Yield")),        // % — NÃO alimenta o campo `dy`
                                                 // (metodologia diferente, ver CLAUDE.md)
      // — por ação —
      lpa, vpa,

      // — rentabilidade e margens (em %) —
      roe, roic,
      margem_bruta: numF(pega("Marg. Bruta")),
      margem_ebit: numF(pega("Marg. EBIT")),
      margem_liquida: numF(pega("Marg. Líquida")),
      ebit_ativo: numF(pega("EBIT / Ativo")),

      // — estrutura de capital e eficiência —
      liquidez_corrente: num(pega("Liquidez Corr")),
      div_liq_patrim: num(pega("Dív Líq / Patrim")),   // rótulo real da página;
                                                       // "Div.Br/Patrim" não existe
      giro_ativos: num(pega("Giro Ativos")),
      cres_rec_5a: num(pega("Cres. Rec (5a)")),        // % ao ano

      // — cabeçalho —
      valor_mercado: num(pega("Valor de mercado")),
      valor_firma: num(pega("Valor da firma")),
      nro_acoes: num(pega("Nro. Ações")),
      vol_med_2m: num(pega("Vol $ méd (2m)")),
      min_52_sem: num(pega("Min 52 sem")),
      max_52_sem: num(pega("Max 52 sem")),
      ult_balanco: txt(pega("Últ balanço processado")),

      // — balanço patrimonial —
      ativo: num(pega("Ativo")),
      ativo_circulante: numF(pega("Ativo Circulante")),
      disponibilidades: numF(pega("Disponibilidades")),
      divida_bruta: numF(pega("Dív. Bruta")),
      divida_liquida: numF(pega("Dív. Líquida")),
      patrim_liq: num(pega("Patrim. Líq")),

      // — demonstrativo de resultados —
      // A página traz DUAS colunas (últimos 12 meses e últimos 3 meses) com o
      // mesmo rótulo. O `pega` usa .match(), que devolve só a 1ª ocorrência —
      // ou seja, sempre os 12 meses. O sufixo _12m torna isso explícito; a
      // captura do trimestre exigiria matchAll + índice e ficou fora de escopo.
      receita_liquida_12m: numF(pega("Receita Líquida")),
      ebit_12m: numF(pega("EBIT")),
      lucro_liquido_12m: num(pega("Lucro Líquido")),   // bancos têm de verdade
    };
  } catch (erro) {
    console.error("[fetchFundamentus] falha:", erro?.status, erro?.message || erro);
    return null;
  }
}

// ── Fatos Relevantes do Fundamentus — comunicados oficiais (JCP, proventos,  ──
// resultado trimestral, projeções). Dado que efetivamente move o preço.
// FRÁGIL: parser por estrutura de tabela; se o site mudar, retorna [].
async function fetchFatosRelevantes(ticker) {
  try {
    const papel = ticker.replace(/\.SA$/i, "").toLowerCase();
    const base = "https://www.fundamentus.com.br";
    const r = await fetch(
      `${base}/fatos_relevantes.php?papel=${encodeURIComponent(papel)}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
      }
    );
    if (!r.ok) { console.error("[fetchFatosRelevantes] HTTP", r.status, "para", papel); return []; }
    const html = await lerHtml(r);   // detecta UTF-8 ou Latin-1 automaticamente

    const fatos = [];

    // Linhas de tabela com classe par/impar (layout clássico do Fundamentus)
    const trRe = /<tr[^>]*class="(?:par|impar)"[^>]*>([\s\S]*?)<\/tr>/gi;
    let m;
    while ((m = trRe.exec(html)) && fatos.length < 15) {
      const row = m[1];
      const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x => x[1]);
      if (tds.length < 2) continue;

      // procura a célula que tem data (dd/mm/aaaa) e a que tem o texto/link
      let data = null, titulo = null, link = null;
      for (const cell of tds) {
        const txt = cell.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (!data && /\d{2}\/\d{2}\/\d{4}/.test(txt)) {
          data = (txt.match(/\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?/) || [])[0] || txt;
        }
        const a = cell.match(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
        if (a) {
          const t = a[2].replace(/<[^>]+>/g, "").trim();
          // ignora links de "baixar/download" sem título descritivo
          if (t && !/^(baixar|download|pdf)$/i.test(t)) {
            titulo = t;
            link = a[1].startsWith("http") ? a[1] : base + (a[1].startsWith("/") ? "" : "/") + a[1];
          } else if (a[1]) {
            // link de download sem texto: guarda o link, título virá de outra célula
            link = a[1].startsWith("http") ? a[1] : base + (a[1].startsWith("/") ? "" : "/") + a[1];
          }
        }
      }
      // se não achou título no link, usa a maior célula de texto que não seja a data
      if (!titulo) {
        let melhor = "";
        for (const cell of tds) {
          const txt = cell.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          if (/\d{2}\/\d{2}\/\d{4}/.test(txt)) continue;
          if (/^(baixar|download|pdf)$/i.test(txt)) continue;
          if (txt.length > melhor.length) melhor = txt;
        }
        if (melhor) titulo = melhor;
      }
      if (titulo && titulo.length > 2) {
        fatos.push({ data: data || "", titulo: repararMojibake(titulo), link: link || null });
      }
    }

    return fatos.slice(0, 12);
  } catch (erro) {
    console.error("[fetchFatosRelevantes] falha:", erro?.status, erro?.message || erro);
    return [];
  }
}

// ── Proventos do Fundamentus — dividendos + JCP agregados por ano ────────────
// Fonte: proventos.php. A página tem duas tabelas; usamos a AGREGADA POR ANO
// (id="resultado-anual"). Verificado em 27/07/2026 contra a tabela de detalhe:
// ela soma DIVIDENDO + JRS CAP PRÓPRIO/JUROS e agrupa por DATA-EX — WEGE3 2025
// dá 2,451 no total contra 2,054 se contasse só "DIVIDENDO". O JCP entrar é o
// ponto: no Brasil ele é metade do provento, e o Yahoo não o separa.
//
// Ancora no id da tabela, não na posição — o site tem 2 tabelas e a ordem
// poderia mudar. Mesmo princípio do `pega` no fetchFundamentus.
// FRÁGIL: se o layout mudar, retorna null e o critério some da tela.
async function fetchProventos(ticker) {
  try {
    const papel = ticker.replace(/\.SA$/i, "").toUpperCase();
    const r = await fetch(
      `https://www.fundamentus.com.br/proventos.php?papel=${encodeURIComponent(papel)}&tipo=2`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
      }
    );
    if (!r.ok) { console.error("[fetchProventos] HTTP", r.status, "para", papel); return null; }
    const html = await lerHtml(r);

    const bloco = html.match(/<table[^>]*id="resultado-anual"[^>]*>([\s\S]*?)<\/table>/i);
    if (!bloco) { console.error("[fetchProventos] tabela anual não encontrada para", papel); return null; }

    const porAno = {};
    for (const L of bloco[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const tds = [...L[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x => x[1].replace(/<[^>]+>/g, "").trim());
      if (tds.length < 2 || !/^\d{4}$/.test(tds[0])) continue;
      const v = parseFloat(tds[1].replace(/\./g, "").replace(/,/g, "."));
      if (Number.isFinite(v)) porAno[+tds[0]] = v;
    }
    const anos = Object.keys(porAno).map(Number).sort((a, b) => a - b);
    if (!anos.length) { console.error("[fetchProventos] tabela anual vazia para", papel); return null; }

    // O ano corrente está em curso — entra na lista bruta, mas NUNCA no cálculo
    // de 5 anos, senão um ano pela metade derruba o CAGR artificialmente.
    const anoAtual = new Date().getFullYear();
    const janela = Array.from({ length: 5 }, (_, i) => anoAtual - 5 + i);  // 5 anos FECHADOS

    // ⚠️ A tabela só lista ano EM QUE HOUVE provento — ano sem pagamento fica
    // AUSENTE, não vem com zero (verificado: nenhuma linha zerada nos 3 papéis).
    // Por isso a checagem é de PRESENÇA na janela, não de valor > 0 no que veio.
    const pagou_todo_ano_5a = janela.every(a => (porAno[a] ?? 0) > 0);

    // CAGR entre as pontas da janela (4 períodos). Exige as duas pontas e início
    // positivo — sem isso a taxa é indefinida, não zero.
    const ini = porAno[janela[0]], fim = porAno[janela[4]];
    const cagr_provento_5a = (ini > 0 && fim > 0)
      ? Math.round((Math.pow(fim / ini, 1 / 4) - 1) * 1000) / 10   // % com 1 casa
      : null;

    return {
      provento_por_ano: anos.slice(-10).map(a => ({ ano: a, valor: porAno[a] })),
      cagr_provento_5a,                        // %/ano; null se faltar ponta
      pagou_todo_ano_5a,                       // pagou em TODOS os 5 anos fechados
      proventos_janela_5a: `${janela[0]}-${janela[4]}`,  // deixa explícito o período avaliado
    };
  } catch (erro) {
    console.error("[fetchProventos] falha:", erro?.status, erro?.message || erro);
    return null;
  }
}

// ── Idade de listagem — primeira data negociada (chart range=max) ────────────
// Critério "mais de 5 anos de Bolsa" do checklist Buy and Hold.
// Medido em 27/07/2026 do IP da Cloudflare: range=max custa ~41KB e o Yahoo
// FORÇA granularidade mensal (interval=1mo e 3mo dão idêntico). Por isso esta
// chamada NÃO substitui a de 3y do fetchRaioX, que alimenta var_semana/var_mes
// com dado diário — é adicional.
//
// ⚠️ O Yahoo tem um PISO: WEGE3 e BBAS3 devolvem a MESMA primeira data
// (2000-02-01), que não é a estreia real de nenhuma das duas. Já CXSE3 devolve
// 2021-04-26, batendo com o IPO de abril/2021. Interpretação:
//   data > piso  → estreia real, idade exata
//   data = piso  → listada há PELO MENOS ~26 anos (idade exata desconhecida)
// Para "> 5 anos" os dois casos respondem com certeza — é o que torna o
// critério viável apesar do piso. Nunca apresentar anos_bolsa como idade exata
// quando anos_bolsa_minimo for true.
const PISO_YAHOO_MS = Date.parse("2000-03-01T00:00:00Z"); // folga sobre o 2000-02-01 observado
async function fetchIdadeBolsa(yfTicker) {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yfTicker)}?range=max&interval=1mo`,
      { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", "Accept": "application/json" } }
    );
    if (!r.ok) console.error("[fetchIdadeBolsa] HTTP", r.status, "para", yfTicker);
    const d = await r.json();
    const ts = d?.chart?.result?.[0]?.timestamp || [];
    if (!ts.length) { console.error("[fetchIdadeBolsa] sem timestamps para", yfTicker); return null; }
    const primeiroMs = ts[0] * 1000;
    return {
      primeira_data: new Date(primeiroMs).toISOString().slice(0, 10),
      anos_bolsa: Math.round(((Date.now() - primeiroMs) / (365.25 * 86400000)) * 10) / 10,
      anos_bolsa_minimo: primeiroMs <= PISO_YAHOO_MS,  // true = é um piso, não a idade real
    };
  } catch (erro) {
    console.error("[fetchIdadeBolsa] falha:", erro?.status, erro?.message || erro);
    return null;
  }
}

// ── Lucro anual (quoteSummary/incomeStatementHistory) ────────────────────────
// Critério "nunca deu prejuízo" — mas o Yahoo devolve EXATAMENTE 4 anos, então
// o que dá para afirmar é "sem prejuízo nos últimos 4 anos". Medido em
// 27/07/2026 nos 3 papéis: sempre 4 períodos, netIncome coerente.
// A versão trimestral (critério "20 trimestres") NÃO é implementada de
// propósito: o teto é 4 trimestres por três caminhos independentes — ver
// CLAUDE.md antes de tentar de novo.
//
// ⚠️ Caminho NOVO para papéis BR: o fetchIndicadores roteia brasileiro direto
// para a brapi e nunca chama o quoteSummary. A investigação confirmou que o
// quoteSummary FUNCIONA para .SA — a suposição de que BR só tinha brapi era
// falsa. Aproveita o crumb já cacheado por 10 min.
async function fetchLucroAnual(yfTicker) {
  try {
    const ok = await getYahooCrumb();
    if (!ok) { console.error("[fetchLucroAnual] crumb indisponível para", yfTicker); return null; }
    const r = await fetch(
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yfTicker)}?modules=incomeStatementHistory&crumb=${encodeURIComponent(_yahooCrumb)}`,
      { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", "Cookie": _yahooCookie, "Accept": "application/json" } }
    );
    if (!r.ok) console.error("[fetchLucroAnual] HTTP", r.status, "para", yfTicker);
    const d = await r.json();
    const hist = d?.quoteSummary?.result?.[0]?.incomeStatementHistory?.incomeStatementHistory;
    if (!Array.isArray(hist) || !hist.length) {
      console.error("[fetchLucroAnual] sem histórico para", yfTicker);
      _yahooCrumb = null;   // pode ser crumb vencido — força renovação na próxima
      return null;
    }
    const lucros = hist.map(x => ({
      ano: x?.endDate?.fmt ? +String(x.endDate.fmt).slice(0, 4) : null,
      valor: x?.netIncome?.raw ?? null,
    })).filter(x => x.ano != null && x.valor != null).sort((a, b) => a.ano - b.ano);
    if (!lucros.length) return null;
    return {
      lucro_anual: lucros,
      lucro_anos_avaliados: lucros.length,                          // sempre 4 no Yahoo
      anos_sem_prejuizo: lucros.filter(x => x.valor > 0).length,    // de lucro_anos_avaliados
    };
  } catch (erro) {
    console.error("[fetchLucroAnual] falha:", erro?.status, erro?.message || erro);
    return null;
  }
}

// ── FII: tabela geral (560 fundos, 1 requisição) ─────────────────────────────
// fii_resultado.php. ⚠️ A âncora é id="tabelaResultado" — NÃO é o id="resultado"
// das ações; são páginas diferentes com estruturas parecidas.
// Colunas mapeadas por RÓTULO (via <th>), não por posição, para sobreviver a
// reordenação — mesmo princípio do `pega`.
//
// ⚠️ Esta tabela usa ZERO como "sem dado" — não existe um único "-" nela.
// 412 dos 560 trazem vacância 0,00%, a maioria por não ter imóvel nenhum.
// A normalização NÃO decide isso aqui: entrega o número cru e o qtd_imoveis,
// e a guarda (metricasImovel, em calc.mjs) resolve com teste cobrindo.
async function fetchFiiTabela() {
  try {
    const r = await fetch("https://www.fundamentus.com.br/fii_resultado.php", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
    });
    if (!r.ok) { console.error("[fetchFiiTabela] HTTP", r.status); return null; }
    const html = await lerHtml(r);
    const bloco = html.match(/<table[^>]*id="tabelaResultado"[^>]*>([\s\S]*?)<\/table>/i);
    if (!bloco) { console.error("[fetchFiiTabela] tabela não encontrada — layout mudou?"); return null; }

    const limpo = (x) => x.replace(/<[^>]+>/g, "").trim();
    const cabecalhos = [...bloco[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(m => limpo(m[1]));
    const col = {};
    cabecalhos.forEach((h, i) => { col[h] = i; });
    const idx = (nome) => (col[nome] != null ? col[nome] : -1);
    const num = (s) => {
      if (s == null || s === "" || s === "-") return null;
      const n = parseFloat(String(s).replace(/%/g, "").replace(/\./g, "").replace(/,/g, ".").trim());
      return Number.isFinite(n) ? n : null;
    };

    const fundos = [];
    for (const L of bloco[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const tds = [...L[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => limpo(m[1]));
      if (tds.length < cabecalhos.length - 1) continue;
      const g = (nome) => { const i = idx(nome); return i >= 0 ? tds[i] : null; };
      const papel = g("Papel");
      if (!papel || !/^[A-Z0-9]{4,6}$/i.test(papel)) continue;
      const cotacao = num(g("Cotação")), pvp = num(g("P/VP"));
      fundos.push({
        papel,
        cotacao,
        pvp,
        // VP/Cota não vem na tabela, mas sai de Cotação ÷ P/VP — mesmo truque
        // que derivou LPA e VPA para ações, verificado contra valores reais.
        vp_cota: (cotacao != null && pvp) ? Math.round((cotacao / pvp) * 100) / 100 : null,
        ffo_yield: num(g("FFO Yield")),
        // ⚠️ dy_fonte é o DY PUBLICADO e NÃO deve ser exibido: não é reproduzível
        // (MXRF11 dá 13,3% aqui, 12,4% pelo histórico). Fica só para diagnóstico.
        dy_fonte: num(g("Dividend Yield")),
        valor_mercado: num(g("Valor de Mercado")),
        liquidez: num(g("Liquidez")),
        qtd_imoveis: num(g("Qtd de imóveis")),
        preco_m2: num(g("Preço do m2")),
        aluguel_m2: num(g("Aluguel por m2")),
        cap_rate: num(g("Cap Rate")),
        vacancia: num(g("Vacância Média")),
        // ⚠️ segmento_fonte é NÃO CONFIÁVEL: chama MXRF11 (papel) de "Logística"
        // e joga 56% do universo em "Multicategoria"/"Outros". Nunca exibir como
        // classificação — o tipo é derivado de qtd_imoveis no calc.mjs.
        segmento_fonte: g("Segmento") || null,
      });
    }
    if (!fundos.length) { console.error("[fetchFiiTabela] nenhuma linha reconhecida"); return null; }
    return fundos;
  } catch (erro) {
    console.error("[fetchFiiTabela] falha:", erro?.status, erro?.message || erro);
    return null;
  }
}

// ── FII: histórico mensal de rendimentos (1 requisição POR fundo) ────────────
// fii_proventos.php. Âncora id="resultado". ~113 pagamentos, 10 anos, mensais,
// tipo único "Rendimento" (FII não tem JCP). Diferente da página de ações, NÃO
// há tabela agregada por ano — a soma é nossa, no calc.mjs.
async function fetchFiiProventos(papel) {
  try {
    const p = String(papel || "").toUpperCase();
    const r = await fetch(
      `https://www.fundamentus.com.br/fii_proventos.php?papel=${encodeURIComponent(p)}&tipo=2`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
      }
    );
    if (!r.ok) { console.error("[fetchFiiProventos] HTTP", r.status, "para", p); return null; }
    const html = await lerHtml(r);
    const bloco = html.match(/<table[^>]*id="resultado"[^>]*>([\s\S]*?)<\/table>/i);
    if (!bloco) { console.error("[fetchFiiProventos] tabela não encontrada para", p); return null; }
    const out = [];
    for (const L of bloco[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const tds = [...L[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, "").trim());
      if (tds.length < 4) continue;
      const m = (tds[0] || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);   // data-com
      if (!m) continue;
      const v = parseFloat((tds[3] || "").replace(/\./g, "").replace(/,/g, "."));
      if (!Number.isFinite(v)) continue;
      out.push({ data: `${m[3]}-${m[2]}-${m[1]}`, valor: v });
    }
    return out.length ? out : null;
  } catch (erro) {
    console.error("[fetchFiiProventos] falha:", erro?.status, erro?.message || erro);
    return null;
  }
}

// ── FII: séries históricas (fii_graficos.php) ────────────────────────────────
// A página NÃO devolve imagem: devolve os dados em JavaScript. Dois formatos
// convivem e o parser cobre os dois:
//   A) var X = [[timestampMs, valor], ...]
//   B) X.push(valor) em paralelo a labelsY.push(timestampMs)
// tipo=1 → rendimentos mensais + Dividend Yield diário (~103 KB)
// tipo=2 → FFO trimestral (~28 KB)
// tipo=3 → Patrimônio Líquido + Valor de Mercado + labelsPVP (~349 KB)
function _fiiSerieA(html, nome) {
  const m = html.match(new RegExp(nome + "\\s*=\\s*(\\[[\\s\\S]*?\\])\\s*;"));
  if (!m) return [];
  return [...m[1].matchAll(/\[\s*(\d{10,13})\s*,\s*([-\d.eE]+)\s*\]/g)]
    .map(x => ({ t: +x[1], v: parseFloat(x[2]) }))
    .filter(x => Number.isFinite(x.v));
}
function _fiiSerieB(html, nomeVal, nomeLabel) {
  const vals = [...html.matchAll(new RegExp(nomeVal + "\\.push\\(([-\\d.eE]+)\\)", "g"))].map(x => parseFloat(x[1]));
  const ts = [...html.matchAll(new RegExp(nomeLabel + "\\.push\\((\\d{10,13})\\)", "g"))].map(x => +x[1]);
  const n = Math.min(vals.length, ts.length);
  const out = [];
  for (let i = 0; i < n; i++) if (Number.isFinite(vals[i])) out.push({ t: ts[i], v: vals[i] });
  return out;
}
const _mesDe = (ms) => { try { return new Date(ms).toISOString().slice(0, 7); } catch { return null; } };
// Reduz série diária a mensal (último valor do mês) — o cliente não precisa de
// 2379 pontos para ver a forma da curva, e isso corta o payload em ~20x.
function _mensaliza(serie) {
  const m = new Map();
  for (const p of (serie || [])) { const k = _mesDe(p.t); if (k) m.set(k, p.v); }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([mes, valor]) => ({ mes, valor }));
}
async function fetchFiiGrafico(papel, tipo) {
  try {
    const p = String(papel || "").toUpperCase();
    const r = await fetch(`https://www.fundamentus.com.br/fii_graficos.php?papel=${encodeURIComponent(p)}&tipo=${tipo}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml", "Accept-Language": "pt-BR,pt;q=0.9",
      },
    });
    if (!r.ok) { console.error("[fetchFiiGrafico] HTTP", r.status, p, "tipo", tipo); return null; }
    return await lerHtml(r);
  } catch (erro) {
    console.error("[fetchFiiGrafico] falha:", erro?.status, erro?.message || erro);
    return null;
  }
}

// Yahoo quoteSummary (exige cookie+crumb desde 2023) — para AU/US
let _yahooCrumb = null, _yahooCookie = null, _crumbTime = 0;
async function getYahooCrumb() {
  // Reusa crumb por 10 min
  if (_yahooCrumb && _yahooCookie && (Date.now() - _crumbTime) < 600000) return true;
  try {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    // 1) pega cookie
    const c = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": ua } });
    let cookie = c.headers.get("set-cookie") || "";
    cookie = cookie.split(";")[0];
    if (!cookie) { console.error("[getYahooCrumb] Yahoo não devolveu cookie — HTTP", c.status); return false; }
    // 2) pega crumb usando o cookie
    const cr = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": ua, "Cookie": cookie, "Accept": "text/plain" }
    });
    const crumb = await cr.text();
    if (!crumb || crumb.includes("<") || crumb.length > 30) { console.error("[getYahooCrumb] crumb inválido — HTTP", cr.status, JSON.stringify(crumb).slice(0, 80)); return false; }
    _yahooCrumb = crumb; _yahooCookie = cookie; _crumbTime = Date.now();
    return true;
  } catch (erro) {
    console.error("[getYahooCrumb] falha:", erro?.status, erro?.message || erro);
    return false;
  }
}

async function fetchIndicadoresYahoo(yfTicker) {
  try {
    const ok = await getYahooCrumb();
    if (!ok) return null;
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    const modules = "defaultKeyStatistics,financialData,summaryDetail,assetProfile";
    const r = await fetch(
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yfTicker)}?modules=${modules}&crumb=${encodeURIComponent(_yahooCrumb)}`,
      { headers: { "User-Agent": ua, "Cookie": _yahooCookie, "Accept": "application/json" } }
    );
    if (!r.ok) console.error("[fetchIndicadoresYahoo] HTTP", r.status, "para", yfTicker);
    const d = await r.json();
    const res = d?.quoteSummary?.result?.[0];
    // invalida crumb se falhou (força renovação na próxima chamada)
    if (!res) { console.error("[fetchIndicadoresYahoo] sem resultado para", yfTicker, "— invalidando crumb"); _yahooCrumb = null; return null; }
    const ks = res.defaultKeyStatistics || {};
    const fd = res.financialData || {};
    const sd = res.summaryDetail || {};
    const ap = res.assetProfile || {};
    const epochToDate = (e) => { if (!e) return null; try { return new Date(e * 1000).toISOString().slice(0, 10); } catch { return null; } };
    return {
      pl: sd.trailingPE?.raw ?? ks.forwardPE?.raw ?? null,
      pvp: ks.priceToBook?.raw ?? null,
      dy: (sd.dividendYield?.raw != null ? sd.dividendYield.raw * 100 : (sd.trailingAnnualDividendYield?.raw != null ? sd.trailingAnnualDividendYield.raw * 100 : null)),
      roe: (fd.returnOnEquity?.raw != null ? fd.returnOnEquity.raw * 100 : null),
      roa: (fd.returnOnAssets?.raw != null ? fd.returnOnAssets.raw * 100 : null),
      margem_liquida: (fd.profitMargins?.raw != null ? fd.profitMargins.raw * 100 : null),
      divida_ebitda: (fd.totalDebt?.raw != null && fd.ebitda?.raw ? fd.totalDebt.raw / fd.ebitda.raw : null),
      lpa: ks.trailingEps?.raw ?? null,
      vpa: ks.bookValue?.raw ?? null,
      prox_dividendo: epochToDate(sd.dividendDate?.raw) || epochToDate(ks.lastDividendDate?.raw) || null,
      ex_dividendo: epochToDate(sd.exDividendDate?.raw) || null,
      valor_dividendo: sd.dividendRate?.raw ?? sd.trailingAnnualDividendRate?.raw ?? ks.lastDividendValue?.raw ?? null,
      // Perfil da empresa (CEO, website, setor, descrição)
      setor: ap.sector || null,
      industria: ap.industry || null,
      website: ap.website || null,
      descricao: ap.longBusinessSummary || null,
      ceo: (Array.isArray(ap.companyOfficers) && ap.companyOfficers.length ? (ap.companyOfficers.find(o => /chief executive|ceo/i.test(o.title || ""))?.name || ap.companyOfficers[0]?.name) : null),
      pais: ap.country || null,
      funcionarios: ap.fullTimeEmployees || null,
    };
  } catch (erro) {
    console.error("[fetchIndicadoresYahoo] falha:", erro?.status, erro?.message || erro);
    return null;
  }
}

// Histórico de dividendos (vários anos) + 52 semanas, via chart API do Yahoo
async function fetchRaioX(yfTicker) {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yfTicker)}?range=3y&interval=1d&events=div`,
      { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", "Accept": "application/json" } }
    );
    if (!r.ok) console.error("[fetchRaioX] HTTP", r.status, "para", yfTicker);
    const d = await r.json();
    const res = d?.chart?.result?.[0];
    if (!res) { console.error("[fetchRaioX] sem resultado para", yfTicker); return null; }
    const meta = res.meta || {};
    const closes = (res.indicators?.quote?.[0]?.close || []).filter(v => v != null);
    const ts = res.timestamp || [];
    // Variações por período
    const ult = meta.regularMarketPrice ?? closes[closes.length - 1];
    const precoEm = (diasAtras) => {
      if (!ts.length) return null;
      const alvo = Date.now() / 1000 - diasAtras * 86400;
      let idx = ts.findIndex(t => t >= alvo);
      if (idx < 0) idx = 0;
      const arr = res.indicators?.quote?.[0]?.close || [];
      for (let i = idx; i < arr.length; i++) if (arr[i] != null) return arr[i];
      return null;
    };
    const varPct = (antes) => (antes && ult ? ((ult - antes) / antes) * 100 : null);
    // Dividendos: agrupa por ano
    const divs = res.events?.dividends || {};
    const porAno = {};
    for (const k in divs) {
      const ev = divs[k];
      const ano = new Date(ev.date * 1000).getFullYear();
      porAno[ano] = (porAno[ano] || 0) + ev.amount;
    }
    const histDiv = Object.entries(porAno).map(([ano, valor]) => ({ ano: +ano, valor: Math.round(valor * 1000) / 1000 })).sort((a, b) => a.ano - b.ano).slice(-5);
    return {
      preco_atual: ult,
      max_52: meta.fiftyTwoWeekHigh ?? null,
      min_52: meta.fiftyTwoWeekLow ?? null,
      var_semana: varPct(precoEm(7)),
      var_mes: varPct(precoEm(30)),
      var_ano: varPct(precoEm(365)),
      hist_dividendos: histDiv,
    };
  } catch (erro) {
    console.error("[fetchRaioX] falha:", erro?.status, erro?.message || erro);
    return null;
  }
}

async function fetchCotacao(ticker, market) {
  // Define os tickers a tentar conforme o mercado
  let tentativas;
  if (market === "br") {
    tentativas = [ticker.replace(/\.SA$/i, "") + ".SA", ticker];
  } else if (market === "us") {
    // EUA: Yahoo usa o ticker puro, sem sufixo (AAPL, MSFT, etc.)
    tentativas = [ticker.replace(/\.(AX|SA)$/i, "")];
  } else {
    // Austrália (padrão)
    const base = ticker.replace(/\.(AX|SA)$/i, "");
    tentativas = ticker.includes(".") ? [ticker, base + ".AX"] : [base + ".AX", base + ".ax"];
  }
  try {
    for (const t of tentativas) {
      try {
        const r = await fetch(
          `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?interval=1d&range=1d&includePrePost=false`,
          { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", "Accept": "application/json", "Accept-Language": "en-US,en;q=0.9" } }
        );
        if (!r.ok) console.error("[fetchCotacao] HTTP", r.status, "na tentativa", t);
        const d = await r.json();
        const meta = d?.chart?.result?.[0]?.meta;
        if (meta?.regularMarketPrice) {
          const px = meta.regularMarketPrice;
          const prev = meta.previousClose ?? meta.chartPreviousClose ?? null;
          const varPct = (prev && prev > 0) ? ((px - prev) / prev) * 100
            : (typeof meta.regularMarketChangePercent === "number" ? meta.regularMarketChangePercent : null);
          const varAbs = (prev != null) ? (px - prev) : null;
          return {
            ticker: t,
            preco_atual: px,
            variacao_dia: varPct,
            variacao_dia_abs: varAbs,
            prev_close: prev,
            nome: meta.longName || meta.shortName || t,
            market_state: meta.marketState || null, // REGULAR, CLOSED, PRE, POST...
            moeda: meta.currency || null,
            dy: null,
          };
        }
      } catch (erro) {
        console.error("[fetchCotacao] falha na tentativa", t, ":", erro?.status, erro?.message || erro);
      }
    }
    console.error("[fetchCotacao] nenhuma tentativa funcionou para", ticker, "— tentadas:", tentativas.join(", "));
    return null;
  } catch (erro) {
    console.error("[fetchCotacao] falha:", erro?.status, erro?.message || erro);
  }
  return null;
}

// Câmbio entre BRL, AUD, USD via Yahoo (pares tipo USDBRL=X)
async function fetchCambio() {
  // Pega 1 USD em cada moeda + 1 AUD em BRL — suficiente pra montar todas as conversões
  const pares = ["USDBRL=X", "AUDBRL=X", "USDAUD=X"];
  const out = {};
  await Promise.all(pares.map(async (p) => {
    try {
      const r = await fetch(
        `https://query2.finance.yahoo.com/v8/finance/chart/${p}?interval=1d&range=1d`,
        { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", "Accept": "application/json" } }
      );
      if (!r.ok) console.error("[fetchCambio] HTTP", r.status, "para", p);
      const d = await r.json();
      const px = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (px) out[p] = px;
    } catch (erro) {
      console.error("[fetchCambio] falha em", p, ":", erro?.status, erro?.message || erro);
    }
  }));
  // Monta taxas em relação ao BRL como base
  const usdbrl = out["USDBRL=X"];   // 1 USD = X BRL
  const audbrl = out["AUDBRL=X"];   // 1 AUD = X BRL
  if (!usdbrl || !audbrl) { console.error("[fetchCambio] par faltando — USDBRL:", usdbrl, "AUDBRL:", audbrl); return null; }
  // valor de 1 unidade de cada moeda em BRL
  return {
    base: "BRL",
    brl: 1,
    usd: usdbrl,   // 1 USD em BRL
    aud: audbrl,   // 1 AUD em BRL
    atualizado: new Date().toISOString(),
  };
}

// Notícias via Yahoo Finance search (JSON, mais confiável em Workers que Google News)
async function fetchNoticiasYahoo(ticker, market) {
  try {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    // Monta o ticker no formato do Yahoo conforme o mercado
    const base = ticker.replace(/\.(AX|SA)$/i, "");
    const yf = market === "br" ? base + ".SA" : market === "us" ? base : base + ".AX";
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(yf)}&newsCount=8&quotesCount=0`;
    const res = await fetch(url, { headers: { "User-Agent": ua, "Accept": "application/json" } });
    if (!res.ok) { console.error("[fetchNoticiasYahoo] HTTP", res.status, "para", yf); return []; }
    const d = await res.json();
    const news = Array.isArray(d?.news) ? d.news : [];
    return news.map(n => ({
      title: n.title || "",
      link: n.link || "",
      pubDate: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toUTCString() : "",
      source: n.publisher || "",
    })).filter(n => n.title && n.link);
  } catch (erro) {
    console.error("[fetchNoticiasYahoo] falha:", erro?.status, erro?.message || erro);
    return [];
  }
}

// Notícias via Google News RSS (filtra por texto = mais relevante)
async function fetchNoticiasGoogle(ticker, market, nome) {
  const isBR = market === "br";
  const isUS = market === "us";
  // Usa o NOME da empresa quando disponível (filtra muito melhor que o ticker sozinho)
  const alvo = (nome && nome.length > 2 && nome.toUpperCase() !== ticker) ? nome : ticker;
  const ctx = isBR ? "ação" : isUS ? "stock" : "ASX shares";
  const query = `${alvo} ${ctx}`;
  const hl = isBR ? "pt-BR" : isUS ? "en-US" : "en-AU";
  const gl = isBR ? "BR" : isUS ? "US" : "AU";
  const ceid = isBR ? "BR:pt-419" : isUS ? "US:en" : "AU:en";
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
  try {
    const res = await fetch(rssUrl, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" } });
    // O Google costuma bloquear requisições vindas de Workers (limitação já
    // conhecida) — este log é o único jeito de medir a frequência real disso.
    if (!res.ok) console.error("[fetchNoticiasGoogle] HTTP", res.status, "para", query);
    const xml = await res.text();
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRegex.exec(xml)) && items.length < 12) {
      const block = m[1];
      const decode = s => (s || "")
        .replace(/<!\[CDATA\[(.*?)\]\]>/, "$1")
        .replace(/&apos;/g, "'").replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
      const title = decode((block.match(/<title>(.*?)<\/title>/) || [])[1]);
      const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || "";
      const link = decode((block.match(/<link>(.*?)<\/link>/) || [])[1]);
      const source = decode((block.match(/<source[^>]*>(.*?)<\/source>/) || [])[1]) || "";
      items.push({ title, pubDate, link, source });
    }
    return items;
  } catch (erro) {
    console.error("[fetchNoticiasGoogle] falha:", erro?.status, erro?.message || erro);
    return [];
  }
}

// Mantém só notícias que mencionam a empresa/ticker (corta ruído do feed)
function filtrarRelevantes(items, ticker, nome) {
  if (!items || !items.length) return [];
  // Palavras genéricas ignoradas (NÃO inclui banco/bank: são identificadoras p/ bancos BR)
  const stop = new Set(["the","of","and","group","limited","ltd","corp","inc","plc","company","co","holdings","sa","de","da","do","ação","shares","stock","s.a","s.a."]);
  const tokens = [];
  if (nome) for (const w of nome.split(/[\s.,\-]+/)) { const t = w.toLowerCase(); if (t.length >= 3 && !stop.has(t)) tokens.push(t); }
  const tk = ticker.replace(/\.(AX|SA)$/i, "").toLowerCase();
  const relevantes = items.filter(n => {
    const t = (n.title || "").toLowerCase();
    const temTicker = new RegExp(`\\b${tk}\\b`, "i").test(t);
    const temNome = tokens.some(tok => t.includes(tok));
    return temTicker || temNome;
  });
  return relevantes;
}

// Orquestra: tenta Yahoo, cai pro Google News. Retorna {items, fonte} pra debug.
async function fetchNoticias(ticker, market, nome) {
  // 1) Google News com o nome da empresa — melhor relevância
  let bruto = await fetchNoticiasGoogle(ticker, market, nome);
  let items = filtrarRelevantes(bruto, ticker, nome);
  let fonte = "google";
  // 2) Se o Google veio vazio (possível bloqueio), tenta Yahoo e filtra também
  if (!items.length) {
    const y = await fetchNoticiasYahoo(ticker, market);
    const yFiltrado = filtrarRelevantes(y, ticker, nome);
    if (yFiltrado.length) { items = yFiltrado; fonte = "yahoo"; }
    // Se nada casou com a empresa, é melhor não mostrar nada do que mostrar
    // um feed genérico irrelevante (notícias de outras empresas/assuntos).
    else { items = []; fonte = bruto.length || y.length ? "sem_relevante" : "vazio"; }
  }
  return { items: (items || []).slice(0, 10), fonte };
}

// ── Decide se deve cair pro Gemini ───────────────────────────────────────────
function deveUsarFallback(status, data) {
  if (status === 401 || status === 403 || status === 429) return true;
  const msg = (data?.error?.message || data?.error || "").toString().toLowerCase();
  return /credit|billing|quota|balance|insufficient|exceeded|rate limit/.test(msg);
}

// ── Converte formato Anthropic → Gemini e chama o Gemini ─────────────────────
async function chamarGemini(anthropicBody, env) {
  const contents = [];
  for (const msg of (anthropicBody.messages || [])) {
    const role = msg.role === "assistant" ? "model" : "user";
    const parts = [];
    if (typeof msg.content === "string") {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "text") {
          parts.push({ text: block.text });
        } else if (block.type === "image" && block.source?.type === "base64") {
          parts.push({ inline_data: { mime_type: block.source.media_type || "image/jpeg", data: block.source.data } });
        }
      }
    }
    if (parts.length) contents.push({ role, parts });
  }

  const payload = {
    contents,
    generationConfig: {
      maxOutputTokens: anthropicBody.max_tokens || 1500,
      // 2.5 Flash "pensa" por padrão e o pensamento consome o maxOutputTokens,
      // devolvendo texto vazio. thinkingBudget:0 desliga e libera todo o
      // orçamento para a resposta.
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  if (anthropicBody.system) {
    payload.system_instruction = { parts: [{ text: anthropicBody.system }] };
  }

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", "x-goog-api-key": env.GEMINI_KEY },
      body: JSON.stringify(payload),
    }
  );
  const gemData = await res.json();
  const texto = gemData?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join("") || "";

  // Retorna no MESMO formato do Anthropic, pro app não perceber diferença
  return {
    content: [{ type: "text", text: texto }],
    _fallback: "gemini",
  };
}

// ── Web Push (VAPID, sem payload) ─────────────────────────────────────────────
const VAPID_PUBLIC="BPG9T3yvnIUJjBeIhAJz28UPwa8qSRuRFqlu-R4tnHcXqHQ20-4BwnZ4IFCSBB_k87dD5pxpgWS1E-eHjx8W6JI";
const _b64u=buf=>btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const _teP=new TextEncoder();
const _fromB64u=s=>{const p="=".repeat((4-s.length%4)%4);const b=atob((s+p).replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from(b,c=>c.charCodeAt(0));};
function _concat(...arrs){const n=arrs.reduce((s,a)=>s+a.length,0);const o=new Uint8Array(n);let p=0;for(const a of arrs){o.set(a,p);p+=a.length;}return o;}
async function _hkdf(salt,ikm,info,len){const k=await crypto.subtle.importKey("raw",ikm,"HKDF",false,["deriveBits"]);return new Uint8Array(await crypto.subtle.deriveBits({name:"HKDF",hash:"SHA-256",salt,info},k,len*8));}
// Cifra o payload no formato aes128gcm (RFC 8291) — testado em ida-e-volta antes do deploy
async function encryptPayload(p256dhB64u,authB64u,plaintext){
  const uaPub=_fromB64u(p256dhB64u);
  const authSecret=_fromB64u(authB64u);
  const asKeys=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
  const asPub=new Uint8Array(await crypto.subtle.exportKey("raw",asKeys.publicKey));
  const uaKey=await crypto.subtle.importKey("raw",uaPub,{name:"ECDH",namedCurve:"P-256"},false,[]);
  const ecdh=new Uint8Array(await crypto.subtle.deriveBits({name:"ECDH",public:uaKey},asKeys.privateKey,256));
  const keyInfo=_concat(_teP.encode("WebPush: info\0"),uaPub,asPub);
  const ikm=await _hkdf(authSecret,ecdh,keyInfo,32);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const cek=await _hkdf(salt,ikm,_teP.encode("Content-Encoding: aes128gcm\0"),16);
  const nonce=await _hkdf(salt,ikm,_teP.encode("Content-Encoding: nonce\0"),12);
  const record=_concat(_teP.encode(plaintext),new Uint8Array([2]));
  const aesKey=await crypto.subtle.importKey("raw",cek,"AES-GCM",false,["encrypt"]);
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce},aesKey,record));
  const rs=new Uint8Array(4);new DataView(rs.buffer).setUint32(0,4096);
  return _concat(salt,rs,new Uint8Array([asPub.length]),asPub,ct);
}
async function vapidJWT(env,audience){
  const jwk=JSON.parse(env.VAPID_PRIVATE_JWK);
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
  const enc=s=>_b64u(new TextEncoder().encode(s));
  const unsigned=`${enc(JSON.stringify({typ:"JWT",alg:"ES256"}))}.${enc(JSON.stringify({aud:audience,exp:Math.floor(Date.now()/1000)+12*3600,sub:"mailto:leeo.parms@gmail.com"}))}`;
  const sig=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,new TextEncoder().encode(unsigned));
  return `${unsigned}.${_b64u(sig)}`;
}
async function enviarPush(env,sub,payloadStr){
  const u=new URL(sub.endpoint);
  const jwt=await vapidJWT(env,`${u.protocol}//${u.host}`);
  const headers={"TTL":"86400","Urgency":"normal","Authorization":`vapid t=${jwt}, k=${VAPID_PUBLIC}`};
  let body=null;
  if(payloadStr&&sub.p256dh&&sub.auth){
    try{body=await encryptPayload(sub.p256dh,sub.auth,payloadStr);headers["Content-Encoding"]="aes128gcm";}
    // se a cifragem falhar, cai na notificação genérica — o destinatário recebe
    // algo diferente do esperado, então isto PRECISA aparecer no log
    catch(erro){console.error("[enviarPush] cifragem falhou, enviando push genérico:",erro?.message||erro);body=null;}
  }
  return fetch(sub.endpoint,{method:"POST",headers,body});
}
async function pushParaLista(env,subs){
  let enviados=0;const vistos=new Set();
  for(const s of (subs||[])){
    if(!s?.endpoint||vistos.has(s.endpoint))continue;vistos.add(s.endpoint);
    try{const r=await enviarPush(env,s);if(r.ok||r.status===201)enviados++;else console.error("[pushParaLista] push rejeitado — HTTP",r.status,new URL(s.endpoint).host);}catch(erro){console.error("[pushParaLista] falha:",erro?.status,erro?.message||erro);}
  }
  return enviados;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    // ⚠️ Decisão consciente: as rotas GET de dados de mercado abaixo (/cambio,
    // /fundamentus, /fatos, /news, /indice, /raiox, /quote, /bcb-serie) NÃO exigem
    // sessão Supabase, ao contrário do proxy de IA (POST /) e das rotas de push.
    // São dados não-sensíveis (cotação, notícias públicas) e o app as chama sem
    // Authorization. Isso significa que qualquer um com a URL do Worker pode
    // consumir a cota do BRAPI_TOKEN e gerar tráfego de scraping — risco aceito
    // para um app pessoal de baixo tráfego. Se o abuso virar problema, revisar
    // (auth obrigatória ou rate-limit por IP) antes de simplesmente travar tudo.

    // GET /cambio — taxas de câmbio BRL/AUD/USD para consolidar patrimônio
    if (request.method === "GET" && url.pathname === "/cambio") {
      const fx = await fetchCambio();
      return new Response(JSON.stringify(fx || { error: "cambio indisponivel" }), {
        status: fx ? 200 : 503, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
      });
    }

    // GET /fundamentus?papel=BBAS3 — rota de TESTE isolada do scraping
    if (request.method === "GET" && url.pathname === "/fundamentus") {
      const papel = url.searchParams.get("papel")?.toUpperCase();
      if (!papel) {
        return new Response(JSON.stringify({ error: "papel required" }), {
          status: 400, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
        });
      }
      const f = await fetchFundamentus(papel);
      return new Response(JSON.stringify(f || { error: "fundamentus falhou ou parse vazio" }), {
        status: f ? 200 : 503, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
      });
    }

    // GET /fatos?papel=BBAS3 — rota de TESTE isolada dos fatos relevantes
    if (request.method === "GET" && url.pathname === "/fatos") {
      const papel = url.searchParams.get("papel")?.toUpperCase();
      if (!papel) {
        return new Response(JSON.stringify({ error: "papel required" }), {
          status: 400, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
        });
      }
      const fatos = await fetchFatosRelevantes(papel);
      return new Response(JSON.stringify({ _v: "fatos-utf8-v3", papel, count: fatos.length, fatos }), {
        status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS }
      });
    }

    // GET /fii-triagem — varre os 560 FIIs e devolve os candidatos
    // FUNIL (a ordem importa): filtra primeiro pela TABELA, que é 1 requisição
    // para o universo inteiro; só depois busca o histórico de rendimentos dos
    // sobreviventes. Calcular DY para 560 fundos seriam 560 requisições —
    // inviável, e bloquearia o Fundamentus, que é a fonte de TODO indicador BR
    // do app.
    //
    // ⚠️ Workers têm teto de 50 subrequisições por requisição. Com 1 da tabela,
    // o limite prático de enriquecidos é ~45 — daí o `max` com teto rígido.
    if (request.method === "GET" && url.pathname === "/fii-triagem") {
      const nOr = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
      const cfg = {
        pvp_max: nOr(url.searchParams.get("pvp_max"), 1.05),
        liquidez_min: nOr(url.searchParams.get("liq_min"), 500000),
        dy_min_tijolo: nOr(url.searchParams.get("dy_tijolo"), 8),
        dy_min_papel: nOr(url.searchParams.get("dy_papel"), 10),
      };
      // ⚠️ Workers cortam em 50 SUBREQUISIÇÕES por invocação — e cache.match e
      // cache.put CONTAM. Fundo frio custa 3 (match + fetch + put); fundo já
      // cacheado custa 1. Por isso não dá para fixar um `max`: 40 fundos frios
      // seriam ~123 subrequisições e a rota morria com "Too many subrequests"
      // (medido em produção). Em vez de um teto arbitrário, gastamos um
      // ORÇAMENTO e paramos antes de estourar, avisando no `truncado`.
      const max = Math.max(1, nOr(url.searchParams.get("max"), 40));
      let orcamento = 44;   // margem de 6 sobre o limite de 50
      const cache = caches.default;
      const JH = { "Content-Type": "application/json; charset=utf-8", ...CORS };

      try {
        // ── tabela: cache de edge por 12h (mesmo padrão do /bcb-serie).
        // Guarda o JSON já processado (~50KB), não o HTML de 495KB.
        const kTab = new Request("https://cache.local/fii-tabela-v1", { method: "GET" });
        let tabela = null;
        const hit = await cache.match(kTab); orcamento--;
        if (hit) tabela = await hit.json();
        if (!tabela) {
          tabela = await fetchFiiTabela(); orcamento--;
          if (!tabela) return new Response(JSON.stringify({ error: "não consegui ler a tabela de FIIs" }), { status: 503, headers: JH });
          await cache.put(kTab, new Response(JSON.stringify(tabela), {
            headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=43200" },
          })); orcamento--;
        }

        // ── etapa 1 (grátis): só o que a tabela responde
        const pre = tabela.filter(f =>
          f.pvp != null && f.pvp > 0 && f.pvp <= cfg.pvp_max &&
          f.liquidez != null && f.liquidez >= cfg.liquidez_min
        ).sort((a, b) => (b.liquidez || 0) - (a.liquidez || 0));
        const alvo = pre.slice(0, max);

        // ── etapa 2: histórico só dos sobreviventes, também cacheado por 12h
        const enriquecidos = [];
        let faltouOrcamento = false;
        for (const f of alvo) {
          // precisa caber o pior caso deste fundo (match + fetch + put)
          if (orcamento < 3) { faltouOrcamento = true; break; }
          const kP = new Request(`https://cache.local/fii-prov-v1/${encodeURIComponent(f.papel)}`, { method: "GET" });
          let hist = null;
          const h2 = await cache.match(kP); orcamento--;
          if (h2) hist = await h2.json();
          if (!hist) {
            hist = await fetchFiiProventos(f.papel); orcamento--;
            if (hist) { await cache.put(kP, new Response(JSON.stringify(hist), {
              headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=43200" },
            })); orcamento--; }
          }
          const dy = dyFii12m(hist, f.cotacao);
          enriquecidos.push(filtraFii({
            ...f,
            dy_pct: dy.dy_pct, meses_pagos: dy.meses_pagos, pagou_todos_12m: dy.pagou_todos_12m,
            dy_janela: dy.janela, dy_motivo: dy.motivo,
            tendencia_pct: tendenciaFii(hist),
          }, cfg));
        }

        const aprovados = enriquecidos.filter(f => f.aprovado);
        return new Response(JSON.stringify({
          gerado_em: new Date().toISOString(),
          universo: tabela.length,
          apos_filtro_tabela: pre.length,
          enriquecidos: enriquecidos.length,
          // honesto: diz que sobrou fila E por qual motivo. Chamar de novo
          // aproveita o cache já aquecido e avança mais.
          truncado: pre.length > enriquecidos.length,
          truncado_por: faltouOrcamento ? "limite de subrequisições — chame de novo para avançar (o cache já aqueceu)" : (pre.length > alvo.length ? "parâmetro max" : null),
          config: cfg,
          aprovados,
          reprovados: enriquecidos.filter(f => !f.aprovado),
        }), { status: 200, headers: { ...JH, "Cache-Control": "no-store" } });
      } catch (erro) {
        console.error("[fii-triagem] falha:", erro?.status, erro?.message || erro);
        return new Response(JSON.stringify({ error: "falha na triagem de FIIs" }), { status: 500, headers: JH });
      }
    }

    // GET /fii-detalhe?papel=X — rendimentos mensais + DY histórico + FFO
    // Busca 2 páginas (~131 KB) e devolve JSON pequeno: mensaliza as séries
    // diárias no servidor, porque o cliente só precisa da FORMA da curva.
    // O P/VP fica FORA daqui de propósito — são 349 KB, 65% do custo total,
    // e o usuário abre vários candidatos para descartar a maioria em segundos.
    if (request.method === "GET" && (url.pathname === "/fii-detalhe" || url.pathname === "/fii-pvp")) {
      const papel = url.searchParams.get("papel")?.toUpperCase();
      const JH = { "Content-Type": "application/json; charset=utf-8", ...CORS };
      if (!papel || !/^[A-Z0-9]{4,6}$/.test(papel)) {
        return new Response(JSON.stringify({ error: "papel inválido" }), { status: 400, headers: JH });
      }
      const ehPvp = url.pathname === "/fii-pvp";
      const cache = caches.default;
      // ⚠️ Versão na chave: mudar o SHAPE da resposta exige bumpar, senão o cache
      // de 12h continua servindo o formato antigo e o campo novo "não existe"
      // por meio dia — foi o que aconteceu ao adicionar `dividendo` (v1→v2).
      const kc = new Request(`https://cache.local/${ehPvp ? "fii-pvp" : "fii-det"}-v2/${papel}`, { method: "GET" });
      try {
        const hit = await cache.match(kc);
        if (hit) return new Response(await hit.text(), { status: 200, headers: JH });

        let out;
        if (ehPvp) {
          const h3 = await fetchFiiGrafico(papel, 3);
          if (!h3) return new Response(JSON.stringify({ error: "sem dados de P/VP" }), { status: 503, headers: JH });
          // P/VP = Valor de Mercado ÷ Patrimônio Líquido (conferido: para MXRF11
          // o último ponto dá 1,0222, batendo com o 1,02-1,03 da triagem)
          const pl = _fiiSerieB(h3, "dataSeriePatrimLiq", "labelsPVP");
          const vm = _fiiSerieB(h3, "dataSerieValorMercado", "labelsPVP");
          const n = Math.min(pl.length, vm.length);
          const bruto = [];
          for (let i = 0; i < n; i++) if (pl[i].v > 0) bruto.push({ t: pl[i].t, v: vm[i].v / pl[i].v });
          out = { papel, pvp: _mensaliza(bruto), pontos_brutos: bruto.length };
        } else {
          const [h1, h2] = await Promise.all([fetchFiiGrafico(papel, 1), fetchFiiGrafico(papel, 2)]);
          if (!h1) return new Response(JSON.stringify({ error: "sem dados do fundo" }), { status: 503, headers: JH });
          const rend = _fiiSerieB(h1, "dataSerieRendimento", "labelsRendimento");
          out = {
            papel,
            // data completa: o calc.mjs monta o eixo contínuo e detecta buracos
            rendimentos: rend.map(p => ({ data: new Date(p.t).toISOString().slice(0, 10), valor: p.v })),
            // ⚠️ DY DA FONTE — não é o mesmo número que o app calcula. A tela
            // rotula como "fonte: Fundamentus". Serve pela FORMA da curva.
            dy_fonte: _mensaliza(_fiiSerieA(h1, "dataSerieDividendYield")).map(p => ({ mes: p.mes, valor: Math.round(p.valor * 10000) / 100 })),
            // FFO e Dividendo distribuído vêm da MESMA série de períodos
            // (labelsFFO, 38 pontos cada) e em valor absoluto. É o par que
            // responde "a distribuição cabe no resultado?" sem precisar de nº
            // de cotas — e portanto sem o erro de usar a contagem de hoje para
            // trimestres antigos, quando o fundo tinha uma fração das cotas.
            ffo: h2 ? _mensaliza(_fiiSerieB(h2, "dataSerieFFO", "labelsFFO")) : [],
            dividendo: h2 ? _mensaliza(_fiiSerieB(h2, "dataSerieDividendo", "labelsFFO")) : [],
          };
        }
        const body = JSON.stringify(out);
        await cache.put(kc, new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=43200" } }));
        return new Response(body, { status: 200, headers: JH });
      } catch (erro) {
        console.error("[fii-detalhe] falha:", erro?.status, erro?.message || erro);
        return new Response(JSON.stringify({ error: "falha ao buscar o fundo" }), { status: 500, headers: JH });
      }
    }

    // GET /news — manchetes (3 países) + fatos relevantes (só BR)
    if (request.method === "GET" && url.pathname === "/news") {
      const ticker = url.searchParams.get("ticker")?.toUpperCase();
      const market = url.searchParams.get("market") || "br";
      const nome = url.searchParams.get("nome") || null;
      if (!ticker) {
        return new Response(JSON.stringify({ error: "ticker required" }), {
          status: 400, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
        });
      }
      // Manchetes (todos os países) e fatos relevantes (só BR) em paralelo
      const isBR = market === "br" || /\.SA$/i.test(ticker) || /^[A-Z]{4}\d{1,2}$/.test(ticker);
      const [noticias, fatos] = await Promise.all([
        fetchNoticias(ticker, market, nome),
        isBR ? fetchFatosRelevantes(ticker) : Promise.resolve([]),
      ]);
      return new Response(JSON.stringify({
        ticker,
        items: noticias.items,   // manchetes (formato antigo, AU/US não muda)
        fonte: noticias.fonte,
        fatos,                   // NOVO: fatos relevantes BR (vazio em AU/US)
      }), {
        headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
      });
    }

    // GET /indice — variação 12 meses de um índice (Ibov / ASX200)
    if (request.method === "GET" && url.pathname === "/indice") {
      const symbol = url.searchParams.get("symbol");
      if (!symbol) {
        return new Response(JSON.stringify({ error: "symbol required" }), {
          status: 400, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
        });
      }
      try {
        const r = await fetch(
          `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&range=1y`,
          { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", "Accept": "application/json" } }
        );
        const d = await r.json();
        const result = d?.chart?.result?.[0];
        const closes = result?.indicators?.quote?.[0]?.close?.filter(x => x != null);
        let variacao_12m = result?.meta?.regularMarketChangePercent || 0;
        if (closes && closes.length >= 2) {
          variacao_12m = ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100;
        }
        return new Response(JSON.stringify({ symbol, variacao_12m }), {
          headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
        });
      } catch (e) {
        console.error("Erro em /indice:", e);
        return new Response(JSON.stringify({ error: "Falha ao buscar variação do índice." }), {
          status: 500, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
        });
      }
    }

    // GET /quote
    // GET /raiox — dados completos de uma ação (cotação + indicadores + 52sem + hist dividendos)
    if (request.method === "GET" && url.pathname === "/raiox") {
      const ticker = url.searchParams.get("ticker")?.toUpperCase();
      const market = url.searchParams.get("market") || "au";
      if (!ticker) {
        return new Response(JSON.stringify({ error: "ticker required" }), {
          status: 400, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
        });
      }
      const cotacao = await fetchCotacao(ticker, market);
      const yf = cotacao?.ticker || ticker;
      // Em paralelo para não somar latência: a idade de listagem e o lucro anual
      // são chamadas NOVAS (checklist Buy and Hold), ~41KB e ~10KB. Só rodam na
      // abertura do raio-X de um ativo — não há polling aqui, ao contrário do
      // `puxar()` de 25s que causou o estouro de egress em julho.
      const [ind, extra, idade, lucro] = await Promise.all([
        fetchIndicadores(yf, env), fetchRaioX(yf), fetchIdadeBolsa(yf), fetchLucroAnual(yf),
      ]);
      const out = { ...(cotacao || {}), ...(ind || {}), ...(extra || {}), ...(idade || {}), ...(lucro || {}) };

      // Fundamentus (só BR): complementa os campos que a brapi deixa null.
      // NÃO sobrescreve nada que já veio preenchido — só preenche buracos.
      const isBR = market === "br" || /\.SA$/i.test(yf) || /^[A-Z]{4}\d{1,2}$/.test(yf);
      if (isBR) {
        const [fund, prov] = await Promise.all([fetchFundamentus(yf), fetchProventos(yf)]);
        // Proventos (dividendos + JCP por ano): mesma regra de só preencher buraco.
        if (prov) for (const [k, v] of Object.entries(prov)) { if (v != null && out[k] == null) out[k] = v; }
        if (fund) {
          // Repassa TUDO que o Fundamentus trouxe, mas só onde há buraco — o que
          // veio do Yahoo/brapi tem prioridade. Substitui a lista manual de 4
          // campos que existia aqui: agora um campo novo em fetchFundamentus
          // chega ao app sozinho, sem precisar lembrar de editar este trecho.
          for (const [k, v] of Object.entries(fund)) {
            if (k.endsWith("_fund")) continue;   // identificação: mapeada abaixo
            if (v != null && out[k] == null) out[k] = v;
          }
          // perfil (aba Sobre BR) — nomes diferentes dos dois lados
          if (!out.setor && fund.setor_fund) out.setor = fund.setor_fund;
          if (!out.industria && fund.subsetor_fund) out.industria = fund.subsetor_fund;
          out._fund = true; // flag de debug: Fundamentus respondeu
        }
      }

      // Nome da brapi (BR) costuma ser mais completo que o do Yahoo — prioriza se existir
      if (ind && ind.nome) out.nome = ind.nome;
      // DY de reserva: se não veio dos indicadores, calcula pelo histórico de dividendos
      // (soma dos últimos 12 meses; usa o último ano completo se o atual ainda é parcial)
      if ((out.dy == null) && Array.isArray(out.hist_dividendos) && out.hist_dividendos.length && out.preco_atual) {
        const anoAtual = new Date().getFullYear();
        const porAno = {}; out.hist_dividendos.forEach(h => { porAno[h.ano] = h.valor; });
        // Soma móvel dos últimos 12 meses não está disponível por ano; usa o ano anterior
        // completo como referência (mais estável que o ano corrente parcial).
        const base = porAno[anoAtual - 1] ?? porAno[anoAtual] ?? null;
        if (base && base > 0) out.dy = (base / out.preco_atual) * 100;
      }
      return new Response(JSON.stringify(out), {
        status: 200, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
      });
    }

    if (request.method === "GET" && url.pathname === "/quote") {
      const ticker = url.searchParams.get("ticker")?.toUpperCase();
      const market = url.searchParams.get("market") || "au";
      const full = url.searchParams.get("full") === "1";
      if (!ticker) {
        return new Response(JSON.stringify({ error: "ticker required" }), {
          status: 400, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
        });
      }
      const cotacao = await fetchCotacao(ticker, market);
      // Se pedido com full=1, busca também indicadores fundamentalistas do Yahoo
      if (cotacao && full) {
        const ind = await fetchIndicadores(cotacao.ticker || ticker, env);
        if (ind) Object.assign(cotacao, ind);
      }
      return new Response(JSON.stringify(cotacao || { error: "not found" }), {
        status: cotacao ? 200 : 404,
        headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
      });
    }

    // 📈 Série histórica do Banco Central (CDI diário = série 12, IPCA mensal = série 433)
    // Proxy simples (evita CORS) com cache de 12h no edge — não temos motivo
    // para bater no BCB a cada abertura do app, a série de ontem não muda.
    if (url.pathname === "/bcb-serie" && request.method === "GET") {
      const codigo=url.searchParams.get("codigo");
      const inicio=url.searchParams.get("inicio"); // dd/MM/aaaa
      if(!codigo||!/^\d+$/.test(codigo))return new Response(JSON.stringify({error:{message:"código de série inválido"}}),{status:400,headers:{"Content-Type":"application/json; charset=utf-8",...CORS}});
      const cache=caches.default;
      const cacheKey=new Request(request.url,{method:"GET"});
      const hit=await cache.match(cacheKey);
      if(hit)return hit;
      try{
        const bcbUrl=`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados?formato=json${inicio?`&dataInicial=${encodeURIComponent(inicio)}`:""}`;
        const r=await fetch(bcbUrl);
        if(!r.ok)return new Response(JSON.stringify({error:{message:`BCB respondeu ${r.status}`}}),{status:502,headers:{"Content-Type":"application/json; charset=utf-8",...CORS}});
        const bruto=await r.json(); // [{data:"dd/MM/aaaa",valor:"0.0437"}, ...]
        // Normaliza para YYYY-MM-DD + número — o formato que o app usa em tudo mais
        const serie=(Array.isArray(bruto)?bruto:[]).map(p=>{
          const [d,m,y]=String(p.data||"").split("/");
          return {data:`${y}-${m}-${d}`,valor:parseFloat(p.valor)};
        }).filter(p=>p.data.length===10&&!isNaN(p.valor));
        const resp=new Response(JSON.stringify(serie),{status:200,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"public, max-age=43200",...CORS}});
        await cache.put(cacheKey,resp.clone());
        return resp;
      }catch(e){
        console.error("Erro em /bcb-serie:", e);
        return new Response(JSON.stringify({error:{message:"erro ao buscar série do BCB"}}),{status:500,headers:{"Content-Type":"application/json; charset=utf-8",...CORS}});
      }
    }

    // 💸 Push com conteúdo (Splitwise): usuário logado avisa os membros do grupo
    if (url.pathname === "/push-send" && request.method === "POST") {
      const ah=request.headers.get("Authorization")||"";
      if(!ah.startsWith("Bearer "))return new Response(JSON.stringify({error:{message:"Não autorizado."}}),{status:401,headers:{"Content-Type":"application/json; charset=utf-8",...CORS}});
      try{
        const ur=await fetch(`${SUPA_URL}/auth/v1/user`,{headers:{"apikey":SUPA_ANON,"Authorization":ah}});
        if(!ur.ok)return new Response(JSON.stringify({error:{message:"Sessão inválida."}}),{status:401,headers:{"Content-Type":"application/json; charset=utf-8",...CORS}});
        const user=await ur.json();
        const {msgs}=await request.json();
        if(!Array.isArray(msgs)||!msgs.length)return new Response(JSON.stringify({enviados:0}),{status:200,headers:{"Content-Type":"application/json; charset=utf-8",...CORS}});
        const lim=s=>String(s||"").slice(0,180);
        const lista=msgs.slice(0,20).map(m=>({email:String(m.email||"").toLowerCase().trim(),title:lim(m.title),body:lim(m.body),tag:lim(m.tag)})).filter(m=>m.email);
        const emails=[...new Set(lista.map(m=>m.email))];
        // Blindagem: só devolve aparelhos de quem DIVIDE grupo de Splitwise com o remetente
        const sr=await fetch(`${SUPA_URL}/rest/v1/rpc/push_subs_autorizadas`,{method:"POST",headers:{"apikey":SUPA_ANON,"Content-Type":"application/json"},body:JSON.stringify({p_secret:env.CRON_SECRET,p_de_email:(user.email||"").toLowerCase(),p_emails:emails})});
        if(!sr.ok)return new Response(JSON.stringify({error:{message:"Função push_subs_autorizadas não encontrada — rodou o blindagem.sql?"}}),{status:500,headers:{"Content-Type":"application/json; charset=utf-8",...CORS}});
        const subs=await sr.json();
        let enviados=0;
        for(const m of lista){
          for(const s of (subs||[]).filter(x=>(x.email||"").toLowerCase()===m.email)){
            try{const r=await enviarPush(env,s,JSON.stringify({title:m.title,body:m.body,tag:m.tag||undefined}));if(r.ok||r.status===201)enviados++;else console.error("[push-send] push rejeitado — HTTP",r.status,"para",m.email);}catch(erro){console.error("[push-send] falha para",m.email,":",erro?.status,erro?.message||erro);}
          }
        }
        return new Response(JSON.stringify({enviados}),{status:200,headers:{"Content-Type":"application/json; charset=utf-8",...CORS}});
      }catch(e){
        console.error("Erro em /push-send:", e);
        return new Response(JSON.stringify({error:{message:"Falha ao enviar avisos."}}),{status:500,headers:{"Content-Type":"application/json; charset=utf-8",...CORS}});
      }
    }

    // 🔔 Teste de push: envia uma notificação para os aparelhos do usuário logado
    if (url.pathname === "/push-test" && request.method === "POST") {
      const ah=request.headers.get("Authorization")||"";
      if(!ah.startsWith("Bearer "))return new Response(JSON.stringify({error:{message:"Não autorizado."}}),{status:401,headers:{"Content-Type":"application/json; charset=utf-8",...CORS}});
      try{
        const ur=await fetch(`${SUPA_URL}/auth/v1/user`,{headers:{"apikey":SUPA_ANON,"Authorization":ah}});
        if(!ur.ok)return new Response(JSON.stringify({error:{message:"Sessão inválida."}}),{status:401,headers:{"Content-Type":"application/json; charset=utf-8",...CORS}});
        const user=await ur.json();
        const sr=await fetch(`${SUPA_URL}/rest/v1/rpc/push_subs_of`,{method:"POST",headers:{"apikey":SUPA_ANON,"Content-Type":"application/json"},body:JSON.stringify({p_secret:env.CRON_SECRET,p_user:user.id})});
        if(!sr.ok)return new Response(JSON.stringify({error:{message:"Funções de push não encontradas — rodou o push.sql?"}}),{status:500,headers:{"Content-Type":"application/json; charset=utf-8",...CORS}});
        const subs=await sr.json();
        if(!subs.length)return new Response(JSON.stringify({error:{message:"Nenhum aparelho inscrito — ative o sino primeiro."}}),{status:400,headers:{"Content-Type":"application/json; charset=utf-8",...CORS}});
        const enviados=await pushParaLista(env,subs);
        return new Response(JSON.stringify({enviados}),{status:200,headers:{"Content-Type":"application/json; charset=utf-8",...CORS}});
      }catch(e){
        console.error("Erro em /push-test:", e);
        return new Response(JSON.stringify({error:{message:"Falha ao enviar notificação de teste."}}),{status:500,headers:{"Content-Type":"application/json; charset=utf-8",...CORS}});
      }
    }

    // POST — Claude primeiro, Gemini como fallback
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
      });
    }

    // 🔒 Exige sessão válida do Supabase. Sem isto, o proxy fica aberto e
    // qualquer um pode gastar os créditos da Anthropic/Gemini.
    const authHeader = request.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: { message: "Não autorizado." } }), {
        status: 401, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
      });
    }
    try {
      const uresp = await fetch(`${SUPA_URL}/auth/v1/user`, {
        headers: { "apikey": SUPA_ANON, "Authorization": authHeader }
      });
      if (!uresp.ok) {
        return new Response(JSON.stringify({ error: { message: "Sessão inválida ou expirada — entre novamente." } }), {
          status: 401, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
        });
      }
    } catch (erro) {
      console.error("[proxy IA] falha ao validar sessão no Supabase:", erro?.status, erro?.message || erro);
      return new Response(JSON.stringify({ error: { message: "Falha ao validar a sessão." } }), {
        status: 502, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
      });
    }

    try {
      const body = await request.json();
      const JH = { "Content-Type": "application/json; charset=utf-8", ...CORS };

      // 1) Gemini como PRINCIPAL (grátis)
      let gemFail = "";
      if (env.GEMINI_KEY) {
        try {
          const gemResult = await chamarGemini(body, env);
          const txt = (gemResult?.content?.[0]?.text || "").trim();
          if (txt) {
            return new Response(JSON.stringify(gemResult), { status: 200, headers: JH });
          }
          gemFail = "resposta vazia";
        } catch (e) {
          console.error("[proxy IA] Gemini falhou:", e?.status, e?.message || e);
          gemFail = e.message || "erro";
        }
      }

      // 2) Claude como rede de segurança (só responde se houver crédito)
      if (env.ANTHROPIC_KEY) {
        try {
          const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "x-api-key": env.ANTHROPIC_KEY,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify(body),
          });
          const claudeData = await response.json();
          if (response.ok && !claudeData.error) {
            return new Response(JSON.stringify(claudeData), { status: 200, headers: JH });
          }
          const cmsg = (claudeData?.error?.message) || "sem resposta";
          return new Response(JSON.stringify({ error: { message: `IA grátis falhou (${gemFail || "—"}) e o Claude também (${cmsg}).` } }), { status: 502, headers: JH });
        } catch (e) {
          console.error("[proxy IA] Claude falhou:", e?.status, e?.message || e);
          return new Response(JSON.stringify({ error: { message: `IA grátis falhou (${gemFail || "—"}) e o Claude também (${e.message}).` } }), { status: 502, headers: JH });
        }
      }

      // 3) Nenhuma IA disponível
      return new Response(JSON.stringify({ error: { message: `IA indisponível. ${gemFail ? "Gemini: " + gemFail : "Nenhuma chave configurada."}` } }), { status: 502, headers: JH });

    } catch (error) {
      console.error("Erro no proxy de IA:", error);
      return new Response(JSON.stringify({ error: { message: "Falha ao processar a requisição." } }), {
        status: 500, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
      });
    }
  },
  // Cron diário (configure em Settings → Triggers → Cron: 0 21 * * * = ~7h Sydney):
  // pergunta ao Supabase quem tem aviso hoje (função com segredo, sem service key)
  // e envia um push genérico por aparelho. Falhas são silenciosas.
  async scheduled(event, env, ctx) {
    try{
      const r=await fetch(`${SUPA_URL}/rest/v1/rpc/push_jobs_due`,{method:"POST",headers:{"apikey":SUPA_ANON,"Content-Type":"application/json"},body:JSON.stringify({p_secret:env.CRON_SECRET})});
      if(!r.ok){console.error("[scheduled] push_jobs_due respondeu HTTP",r.status,"— nenhum aviso enviado hoje");return;}
      const subs=await r.json();
      ctx.waitUntil(pushParaLista(env,subs));
    }catch(erro){console.error("[scheduled] falha no cron diário de push:",erro?.status,erro?.message||erro);}
  }

};
