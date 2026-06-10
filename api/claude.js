// api/claude.js — Vercel Serverless Function
// Busca cotação real via Yahoo Finance e enriquece o contexto do Claude

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body;
    const messages = body.messages || [];

    // Tenta extrair ticker da mensagem para buscar cotação real
    const userText = messages.map(m =>
      Array.isArray(m.content) ? m.content.filter(c => c.type === "text").map(c => c.text).join(" ") : m.content
    ).join(" ");

    // Detecta tickers mencionados (padrão B3: PETR4, ASX: BHP.AX, etc.)
    const tickerMatch = userText.match(/\b([A-Z]{2,5}(?:\.[A-Z]{2})?(?:\d{1,2})?)\b/g);
    let realPriceContext = "";

    if (tickerMatch) {
      const tickers = [...new Set(tickerMatch)].slice(0, 5);
      const priceData = [];

      for (const ticker of tickers) {
        try {
          // Yahoo Finance — funciona para ASX (.AX), B3 (.SA) e EUA
          const yfTicker = ticker.includes(".")
            ? ticker
            : /\d/.test(ticker)
              ? ticker + ".SA"   // B3 ex: PETR4 → PETR4.SA
              : ticker;          // EUA ex: AAPL

          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yfTicker}?interval=1d&range=1d`;
          const r = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0" }
          });
          const data = await r.json();
          const q = data?.chart?.result?.[0];
          if (q) {
            const meta = q.meta;
            priceData.push({
              ticker,
              preco: meta.regularMarketPrice,
              variacao: meta.regularMarketChangePercent,
              nome: meta.longName || meta.shortName || ticker,
              moeda: meta.currency,
              fechamento_anterior: meta.previousClose,
              abertura: meta.regularMarketOpen,
              max: meta.regularMarketDayHigh,
              min: meta.regularMarketDayLow,
              volume: meta.regularMarketVolume,
              atualizado: new Date().toISOString(),
            });
          }
        } catch {}
      }

      if (priceData.length > 0) {
        realPriceContext = `\n\n[DADOS REAIS DE MERCADO - ${new Date().toLocaleString("pt-BR")}]\n` +
          priceData.map(p =>
            `${p.ticker} (${p.nome}): Preço atual ${p.moeda} ${p.preco?.toFixed(2)}, ` +
            `Variação hoje: ${p.variacao?.toFixed(2)}%, ` +
            `Abertura: ${p.abertura?.toFixed(2)}, ` +
            `Máx/Mín: ${p.max?.toFixed(2)}/${p.min?.toFixed(2)}, ` +
            `Fechamento anterior: ${p.fechamento_anterior?.toFixed(2)}`
          ).join("\n") +
          "\n\nUSE ESTES DADOS REAIS na sua resposta. Não invente valores.";

        // Injeta no último user message
        const lastMsg = messages[messages.length - 1];
        if (typeof lastMsg.content === "string") {
          lastMsg.content += realPriceContext;
        } else if (Array.isArray(lastMsg.content)) {
          const textBlock = lastMsg.content.find(c => c.type === "text");
          if (textBlock) textBlock.text += realPriceContext;
        }
      }
    }

    // Chama a API da Anthropic
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: body.model || "claude-sonnet-4-5",
        max_tokens: body.max_tokens || 1000,
        messages,
      }),
    });

    const result = await response.json();
    return res.status(200).json(result);

  } catch (err) {
    console.error("Worker error:", err);
    return res.status(500).json({ error: { message: err.message } });
  }
}
