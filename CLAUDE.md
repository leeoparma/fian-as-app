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

## Estado das features

- **Relatório Mensal:** v3 entregue e aprovada (10/07/2026) — fullscreen com saldo, barras mês a mês, curva de gasto acumulado, donut de categorias, fixo/variável, patrimônio, renda fixa e ações. Seção completa de ações chega no relatório de agosto. Upgrades futuros só por uso real, a pedido do Leo.
- **Próxima feature grande:** "como uso meu dinheiro" — análise de gastos com IA (ver regra 4 de segurança). Design já definido: (1) explicar gastos por categoria/% da renda em linguagem simples, (2) identificar candidatos a desperdício em R$/mês e R$/ano, (3) sugerir ajustes que economizam sem reduzir qualidade de vida, (4) plano de poupança dividido por metas.
- **Pagamento de fatura de cartão:** entregue e validada pelo Leo com dados reais (14/07/2026) — card "💳 Pagar fatura" na aba Cartão, abatimento em cascata, mostra pago/falta por fatura e crédito disponível. Cobertura de testes em `calc.mjs`.

## Fluxo de trabalho com o Leo

- Mostrar o diff e explicar o que mudou ANTES de commitar.
- Rodar testes do `calc.mjs` antes de qualquer commit que toque em lógica financeira.
- Mudanças pequenas e incrementais > reescritas grandes.
- Leo espera pensamento crítico: apontar riscos e alternativas, não apenas executar.
- Responder em português (brasileiro).
