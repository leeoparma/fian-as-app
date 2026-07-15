# CLAUDE.md — fian-as-app

Contexto permanente do projeto. Leia antes de qualquer mudança.

## O que é este projeto

App de controle financeiro pessoal usado por Leo e sua parceira Carol. Suporta perfis BR / AU / US (moedas e mercados diferentes). Leo é iniciante em programação e trabalha com Claude como parceiro de desenvolvimento — explique decisões técnicas em linguagem simples e em português.

## Arquitetura

- **Frontend:** React em arquivo único — `src/App.jsx` (~4.200+ linhas). Não modularizar sem discussão prévia com o Leo. Há um plano futuro de extrair funções puras de cálculo para módulos testáveis, mas isso deve ser feito de forma incremental e combinada.
- **Cálculos financeiros:** `calc.mjs` — funções puras com testes (`compraAcao`, `vendaAcao`, etc.). **Sempre rodar os testes antes de qualquer commit que toque em cálculo.**
- **Deploy:** Vercel (`fian-as-app.vercel.app`), automático via push no GitHub (`leeoparma/fian-as-app`).
- **Proxy/API:** Cloudflare Worker (`controlfinanceiro.leeo-parms.workers.dev`). ATENÇÃO: o Worker NÃO faz deploy via git — exige clicar em "Deploy" manualmente no painel da Cloudflare. Se uma mudança envolver o Worker, avisar o Leo explicitamente que ele precisa fazer esse deploy manual.
- **Backend/dados:** Supabase (`llpzdrqgvkpxjnecttkb.supabase.co`) — auth e dados.
- **Cotações:** brapi (apenas módulos gratuitos — NÃO usar módulos pagos) com fallback para Yahoo Finance.
- **Cartões de crédito:** não são uma entidade própria — são `bancos` com `tipo==="cartão"` (`limite`, `diaFecha`, `diaVence`). As faturas são calculadas na hora em `CartaoTab`, agrupando despesas por `faturaDeCompra()` — não existem persistidas (o array `data.faturas` é um recurso aposentado do modelo antigo, não usar).

## Regras de segurança — NÃO QUEBRAR

1. **Splitwise:** a tabela `public.splitwise` tem RLS ativado e é acessada EXCLUSIVAMENTE via funções `SECURITY DEFINER` (`load_shared` / `save_shared`) chamadas por `/rest/v1/rpc/`. Nunca reintroduzir acesso direto à tabela no frontend.
2. **Notificações push:** são criptografadas ponta a ponta e têm restrições de conteúdo. Não enviar dados sensíveis em texto claro.
3. **Entrada em grupos Splitwise:** exige aprovação. Grupos novos recebem sufixo aleatório no código.
4. **Feature de IA ("como uso meu dinheiro"):** números são SEMPRE calculados em JS, nunca pela IA (IA alucina somas). Só agregados por categoria + renda são enviados à IA — nunca transações brutas (privacidade + custo). "Desperdícios" são sugestões a confirmar, não veredictos.

## Convenções de cálculo

- **Preço médio de ações:** convenção de execução da corretora (broker execution convention), validada contra notas de corretagem reais do Leo.
- **Corretagem:** é uma despesa real e visível no app, não embutida silenciosamente no preço.
- **Fluxos de investimento:** ➕ Aportar e ➖ Vender são os fluxos oficiais de compra/venda.
- **Pagamento de fatura de cartão:** abatimento em cascata — quita a fatura fechada mais antiga não paga primeiro, excedente abate a aberta, sobra vira crédito para a próxima (`calcFaturaPagamentos` em `calc.mjs`). Implementado como duas transações emparelhadas (despesa no banco de origem + receita no banco-cartão, categoria `"Pagamento de fatura"`, incluída em `CAT_INTERNAS`), igual ao padrão já usado em Transferência entre bancos. Vale só para lançamentos feitos a partir de 14/07/2026 em diante — nada retroativo.

## Limitações conhecidas e ACEITAS (não "corrigir")

- Indicadores BR (P/VP, ROE, margem, dívida) ficam vazios — exigiriam brapi pago.
- Divergência de metodologia no DY foi analisada e aceita.
- Google News frequentemente bloqueado a partir de Cloudflare Workers — fallbacks já existem.

## Pendências abertas (baixo risco, fazer quando solicitado)

- Trocar CPLE6 → CPLE3 na watchlist.
- Facts com `link:null` renderizam como texto puro (cosmético).
- Migrar código de grupo `FAMILIA2026` para código não adivinhável.
- Rotacionar o token brapi hardcoded no Worker.
- `compoeFatorMensalProRata` tem um teste pré-existente falhando (`tests/calc.test.mjs`, cenário IPCA+9,75% aplicado R$7.500) — diverge ~R$0,91 do valor esperado. Achado en passant investigando o bug do header de RF (15/07/2026); é a MESMA família (precisão do pro-rata de IPCA), mas numa função usada no caminho CORRETO (o card), não no header. Não corrigido — fora do escopo daquela sessão.
- `inv.valorAtual` para ativos de Renda Fixa continua um campo CONGELADO gravado com a fórmula de taxa fixa (`calcValorAtualRF`, não a série real do BCB) — atualizado a cada 60s por `buscarDados`/`atualizarTodos`. O header da aba Renda Fixa parou de depender dele (15/07/2026, ver abaixo), mas "Total investido" no topo da aba Investimentos ([App.jsx:1504](src/App.jsx)) e possivelmente o Patrimônio Líquido do Dashboard ainda leem esse campo — mesma subestimação, escopo maior. Não corrigido de propósito (correção cirúrgica pedida pelo Leo).

## Estado das features

- **Relatório Mensal:** v3 entregue e aprovada (10/07/2026) — fullscreen com saldo, barras mês a mês, curva de gasto acumulado, donut de categorias, fixo/variável, patrimônio, renda fixa e ações. Seção completa de ações chega no relatório de agosto. Upgrades futuros só por uso real, a pedido do Leo.
- **Próxima feature grande:** "como uso meu dinheiro" — análise de gastos com IA (ver regra 4 de segurança). Design já definido: (1) explicar gastos por categoria/% da renda em linguagem simples, (2) identificar candidatos a desperdício em R$/mês e R$/ano, (3) sugerir ajustes que economizam sem reduzir qualidade de vida, (4) plano de poupança dividido por metas.
- **Pagamento de fatura de cartão:** entregue e validada pelo Leo com dados reais (14/07/2026) — card "💳 Pagar fatura" na aba Cartão, abatimento em cascata, mostra pago/falta por fatura e crédito disponível. Cobertura de testes em `calc.mjs`.
- **Fix: header da aba Renda Fixa divergia dos cards (15/07/2026)** — diagnosticado por engenharia reversa na UI pelo Leo (header "Total" ≠ soma dos cards, diferença de R$124,23). Causa: `calcValorLiquidoRF` (usada no header e no IR/líquido de cada card) só sabia calcular pela fórmula de taxa fixa (`calcValorAtualRF`), enquanto o valor bruto do card já usava a série real do BCB (`calcValorAtualRFHistorico`) — dois caminhos divergentes pro MESMO ativo. Fix: `calcValorLiquidoRF` ganhou parâmetro opcional `series`; os 3 pontos de consumo (header, IR/líquido por card, líquido de IR agregado) agora passam `seriesBCB`. Invisível em Prefixado (não depende de índice) — só aparecia em CDI/IPCA. Pendente: Leo confirmar visualmente que o header bate exato com a soma dos cards.

## Fluxo de trabalho com o Leo

- Mostrar o diff e explicar o que mudou ANTES de commitar.
- Rodar testes do `calc.mjs` antes de qualquer commit que toque em lógica financeira.
- Mudanças pequenas e incrementais > reescritas grandes.
- Leo espera pensamento crítico: apontar riscos e alternativas, não apenas executar.
- Responder em português (brasileiro).
