# CLAUDE.md — fian-as-app

Contexto permanente do projeto. Leia antes de qualquer mudança.

## O que é este projeto

App de controle financeiro pessoal usado por Leo e sua parceira Carol. Suporta perfis BR / AU / US (moedas e mercados diferentes). Leo é iniciante em programação e trabalha com Claude como parceiro de desenvolvimento — explique decisões técnicas em linguagem simples e em português.

## Arquitetura

- **Frontend:** React em arquivo único — `src/App.jsx` (~4.200+ linhas). Não modularizar sem discussão prévia com o Leo. Há um plano futuro de extrair funções puras de cálculo para módulos testáveis, mas isso deve ser feito de forma incremental e combinada.
- **Cálculos financeiros:** `calc.mjs` — funções puras com testes (`compraAcao`, `vendaAcao`, etc.). **Sempre rodar os testes antes de qualquer commit que toque em cálculo.**
- **Deploy:** Vercel (`fian-as-app.vercel.app`), automático via push no GitHub (`leeoparma/fian-as-app`).
- **Proxy/API:** Cloudflare Worker (`controlfinanceiro.leeo-parms.workers.dev`). ATENÇÃO: o Worker NÃO faz deploy via git — exige clicar em "Deploy" manualmente no painel da Cloudflare. Se uma mudança envolver o Worker, avisar o Leo explicitamente que ele precisa fazer esse deploy manual.
- **Backend/dados:** Supabase (`llpzdrqgvkpxjnecttkb.supabase.co`) — auth e dados. Acesso via `fetch` cru na API REST (objeto `supa` no topo do arquivo) — **não** usa o SDK `supabase-js`. Formato de erro do GoTrue neste projeto é `{code, error_code, msg}` (confirmado em 2 bugs reais: 403 de logout em 16/07 e login silenciosamente aceito com senha errada em 18/07) — **não** `{error, error_description}`. Qualquer checagem de erro de auth deve considerar `error_code`/`msg`, nunca só `.error`.
- **Cotações:** brapi (apenas módulos gratuitos — NÃO usar módulos pagos) com fallback para Yahoo Finance.
- **Cartões de crédito:** não são uma entidade própria — são `bancos` com `tipo==="cartão"` (`limite`, `diaFecha`, `diaVence`). As faturas são calculadas na hora em `CartaoTab`, agrupando despesas por `faturaDeCompra()` — não existem persistidas (o array `data.faturas` é um recurso aposentado do modelo antigo, não usar).

## Regras de segurança — NÃO QUEBRAR

1. **Splitwise:** a tabela `public.splitwise` tem RLS ativado e é acessada EXCLUSIVAMENTE via funções `SECURITY DEFINER` (`load_shared` / `save_shared`) chamadas por `/rest/v1/rpc/`. Nunca reintroduzir acesso direto à tabela no frontend.
2. **Notificações push:** são criptografadas ponta a ponta e têm restrições de conteúdo. Não enviar dados sensíveis em texto claro.
3. **Entrada em grupos Splitwise:** exige aprovação. Grupos novos recebem sufixo aleatório no código.
4. **Feature de IA ("como uso meu dinheiro"):** números são SEMPRE calculados em JS, nunca pela IA (IA alucina somas). Só agregados por categoria + renda são enviados à IA — nunca transações brutas (privacidade + custo). "Desperdícios" são sugestões a confirmar, não veredictos.
5. **Cache local (localStorage) SEMPRE escopado por `user_id`:** as chaves `all_profiles`, `all_profiles_ts` e `active_profile` NUNCA devem ser lidas/gravadas "cruas" — sempre via `kAllProfiles(userId)` / `kAllProfilesTs(userId)` / `kActiveProfile(userId)` (helpers perto de `lsGet`/`lsSet` no topo do arquivo). Sem isso, trocar de conta no mesmo navegador reintroduz vazamento de dados entre contas — bug real, 16/07/2026: o perfil da conta A foi salvo por cima do perfil da conta B na nuvem, porque o app confiava em `localStorage.all_profiles` sem checar de qual usuário ele era.

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

- Rotacionar o token brapi hardcoded no Worker. **Fora do alcance do Claude**: o Worker não está neste repositório git (deploy manual, ver Arquitetura acima) — exige o Leo gerar um token novo no brapi e trocar direto no painel da Cloudflare.
- **`sw_grupos`/`sw_ativo`/`sw_nome`/`sw_solicitado`** (Splitwise: grupos que o usuário participa, nome usado nos grupos, convite pendente — [App.jsx:2058-2066](src/App.jsx)) ainda NÃO são escopados por `user_id`, mesma classe do bug da regra de segurança 5. Achado em 17/07/2026 durante um teste de logout, ainda não corrigido — precisa de aprovação do Leo antes de mexer (é dado de identidade tão sensível quanto `all_profiles`).
- Chaves órfãs de antes do fix de segurança (`all_profiles`, `all_profiles_ts`, `active_profile` sem sufixo `:user_id`, e `financas_data` de uma versão ainda mais antiga do app) continuam no localStorage de quem já usou o app antes de 16/07/2026 — nada mais lê/escreve nelas, mas o logout não as limpa. Cosmético (só aparecem no DevTools), não é vazamento ativo.

## Estado das features

- **Relatório Mensal:** v3 entregue e aprovada (10/07/2026) — fullscreen com saldo, barras mês a mês, curva de gasto acumulado, donut de categorias, fixo/variável, patrimônio, renda fixa e ações. Seção completa de ações chega no relatório de agosto. Upgrades futuros só por uso real, a pedido do Leo.
- **Próxima feature grande:** "como uso meu dinheiro" — análise de gastos com IA (ver regra 4 de segurança). Design já definido: (1) explicar gastos por categoria/% da renda em linguagem simples, (2) identificar candidatos a desperdício em R$/mês e R$/ano, (3) sugerir ajustes que economizam sem reduzir qualidade de vida, (4) plano de poupança dividido por metas.
- **Pagamento de fatura de cartão:** entregue e validada pelo Leo com dados reais (14/07/2026) — card "💳 Pagar fatura" na aba Cartão, abatimento em cascata, mostra pago/falta por fatura e crédito disponível. Cobertura de testes em `calc.mjs`.
- **Fix: header da aba Renda Fixa divergia dos cards (15/07/2026)** — diagnosticado por engenharia reversa na UI pelo Leo (header "Total" ≠ soma dos cards, diferença de R$124,23). Causa: `calcValorLiquidoRF` (usada no header e no IR/líquido de cada card) só sabia calcular pela fórmula de taxa fixa (`calcValorAtualRF`), enquanto o valor bruto do card já usava a série real do BCB (`calcValorAtualRFHistorico`) — dois caminhos divergentes pro MESMO ativo. Fix: `calcValorLiquidoRF` ganhou parâmetro opcional `series`; os 3 pontos de consumo (header, IR/líquido por card, líquido de IR agregado) agora passam `seriesBCB`. Invisível em Prefixado (não depende de índice) — só aparecia em CDI/IPCA. Validado pelo Leo com dados reais: header bate exato com a soma dos cards.
- **Fix: `inv.valorAtual` congelado com fórmula de taxa fixa (16/07/2026)** — extensão do fix acima. Em vez de corrigir cada uma das ~13 telas que leem `inv.valorAtual` (Dashboard, BancoCard, relatórios, snapshot mensal...), corrigido na ORIGEM: `buscarDados` (refresh a cada 60s / "Atualizar todos") e `saveInv` (criar/editar ativo) agora gravam `valorAtual` com `calcValorAtualRFHistorico` em vez de `calcValorAtualRF`. Todas as telas que leem o campo passam a herdar o valor correto automaticamente, sem tocar nelas. `totalRF`/`totalInvest` na aba Investimentos continuam com cálculo ao vivo à parte (não a leitura do campo) — ficam ao lado do card "Rentabilidade" que também calcula ao vivo, então evitam até a janela de 60s de defasagem entre dois números na mesma tela.
- **Fix cosmético: Fatos Relevantes com `link:null` (16/07/2026)** — a aba Notícias de um ativo sempre envolvia cada "fato relevante" (`fatos`, vindo do Worker `/news`) num `<a href={f.link}>`, mesmo quando `f.link` era `null` — parecia clicável mas não ia a lugar nenhum. Agora só vira `<a>` quando existe `f.link`; sem link, renderiza como `<div>` (mesmo estilo, sem cursor de link).
- **Nota sobre `compoeFatorMensalProRata`** (16/07/2026): investigado o teste que estava falhando por ~R$0,91 — não é regressão nem bug de lógica (função não mudou desde que o teste foi escrito). O pro-rata mensal é uma aproximação documentada que nunca reproduz a interpolação diária proprietária de cada banco; a tolerância do teste (`0.5`) só estava mais apertada do que o resíduo real medido. Ajustada para `1`, com o motivo documentado no próprio teste.
- **Fix de segurança: vazamento de dados entre contas no mesmo navegador (16/07/2026)** — achado por acidente pelo Leo via DevTools: logout retornou 403 do Supabase (`session_not_found`) e a tela continuou mostrando o dashboard antigo. Causa raiz: `all_profiles`/`all_profiles_ts`/`active_profile` no localStorage nunca tiveram o `user_id` embutido — a lógica de "local vence a nuvem" (proteção contra perder dados com a nuvem fora do ar) comparava timestamps sem checar de quem era o cache, e podia empurrar o perfil da conta ANTERIOR pra dentro do registro Supabase da conta NOVA (escrita legítima, autenticada corretamente — não é falha de RLS, é o client confundindo de quem eram os dados). Fix: as 3 chaves passam a ser escopadas por `user_id` (ver regra de segurança 5, acima) em TODOS os pontos de leitura/escrita (inclusive o "vigia" de retry de save, que tinha o mesmo bug por um caminho separado). `handleLogout` agora limpa o cache da conta que está saindo e recarrega a página; `handleLogin` já troca `allData`/`profileId` pro cache do novo usuário na hora, sem esperar a sincronização assíncrona. **Ainda não confirmado 100% com as duas contas reais do Leo** — o teste dele em 17/07 não deu pra concluir nada (a chave escopada pode nem ter chegado a ser criada antes de clicar Sair); ver pendência do `sw_*` acima, achada no mesmo teste.
- **Otimização: polling de 25s baixava o payload inteiro a cada vez (17/07/2026)** — medido pelo Leo via DevTools Network: ~16KB por poll, projetando ~1,6GB/mês por aba aberta, batendo na cota de egress da organização (140% do limite, grace period até 12/08/2026). Causa: `puxar()` chamava `supa.load()` (que sempre busca `data,updated_at` juntos) só para comparar timestamp e descobrir que quase sempre nada mudou. Fix: novo método `supa.loadTs(t,id)` busca só `updated_at` (~200 bytes); `puxar()` só chama `supa.load()` (o payload completo) se a nuvem realmente estiver mais nova que o local. Mesma mensagem de log, mesmo intervalo de 25s — só o custo por chamada mudou. Não testado com Network tab real (Claude não acessa login) — validar: poll deve aparecer pequeno quando nada mudou, e completo (~16KB) só depois de uma edição real.
- **Fix: login com senha errada era aceito silenciosamente (18/07/2026)** — causa raiz: `LoginScreen.handle()` checava `if(r.error)` pra decidir se o login falhou, mas o Supabase deste projeto usa `{code,error_code,msg}` (ver Arquitetura acima), então `r.error` nunca existia e o código sempre caía no caminho de sucesso — chamando `onLogin(undefined,undefined,undefined)`. Isso montava um `session` truthy (mesmo com token/user vazios), passava do gate de login, e renderizava o dashboard todo zerado — parecia que "qualquer senha" funcionava. Fix: checagem trocada para `if(r.error_code||r.error||!r.access_token)` no login (a prova definitiva de sucesso é ter um `access_token` de verdade) e `if(r.error_code||r.error)` no cadastro (mesma suposição de formato errado, achada em conjunto — não tinha sido reportada como quebrada, mas era o mesmo risco). Não testado com credenciais reais (Claude não digita senha nem errada — ver política de segurança) — validar: senha errada deve mostrar "Email ou senha incorretos" e continuar na tela de login; senha certa deve funcionar normal.

## Fluxo de trabalho com o Leo

- Mostrar o diff e explicar o que mudou ANTES de commitar.
- Rodar testes do `calc.mjs` antes de qualquer commit que toque em lógica financeira.
- Mudanças pequenas e incrementais > reescritas grandes.
- Leo espera pensamento crítico: apontar riscos e alternativas, não apenas executar.
- Responder em português (brasileiro).
