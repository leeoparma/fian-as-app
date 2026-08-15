# CLAUDE.md — fian-as-app

Contexto permanente do projeto. Leia antes de qualquer mudança.

## O que é este projeto

App de controle financeiro pessoal usado por Leo e sua parceira Carol. Suporta perfis BR / AU / US (moedas e mercados diferentes). Leo é iniciante em programação e trabalha com Claude como parceiro de desenvolvimento — explique decisões técnicas em linguagem simples e em português.

## Arquitetura

- **Frontend:** React em arquivo único — `src/App.jsx` (~4.200+ linhas). Não modularizar sem discussão prévia com o Leo. Há um plano futuro de extrair funções puras de cálculo para módulos testáveis, mas isso deve ser feito de forma incremental e combinada.
- **Cálculos financeiros:** `calc.mjs` — funções puras com testes (`compraAcao`, `vendaAcao`, etc.). **Sempre rodar os testes antes de qualquer commit que toque em cálculo.**
- **Deploy:** Vercel (`fian-as-app.vercel.app`), automático via push no GitHub (`leeoparma/fian-as-app`).
- **Proxy/API:** Cloudflare Worker (`controlfinanceiro.leeo-parms.workers.dev`). O código está versionado em `worker/worker.js` desde 25/07/2026 (antes só existia no painel). ATENÇÃO: o Worker continua SEM deploy via git — editar `worker/worker.js` NÃO muda nada em produção; exige colar o código e clicar em "Deploy" manualmente no painel da Cloudflare. Se uma mudança envolver o Worker, avisar o Leo explicitamente que ele precisa fazer esse deploy manual. Segredos (BRAPI_TOKEN, GEMINI_KEY, ANTHROPIC_KEY, CRON_SECRET, VAPID_PRIVATE_JWK) vêm de env/secrets do Cloudflare — nunca hardcodar no arquivo.
- **Backend/dados:** Supabase (`llpzdrqgvkpxjnecttkb.supabase.co`) — auth e dados. Acesso via `fetch` cru na API REST (objeto `supa` no topo do arquivo) — **não** usa o SDK `supabase-js`. Formato de erro do GoTrue neste projeto é `{code, error_code, msg}` (confirmado em 2 bugs reais: 403 de logout em 16/07 e login silenciosamente aceito com senha errada em 18/07) — **não** `{error, error_description}`. Qualquer checagem de erro de auth deve considerar `error_code`/`msg`, nunca só `.error`.
- **Cotações:** brapi (apenas módulos gratuitos — NÃO usar módulos pagos) com fallback para Yahoo Finance.
- **Cartões de crédito:** não são uma entidade própria — são `bancos` com `tipo==="cartão"` (`limite`, `diaFecha`, `diaVence`). As faturas são calculadas na hora em `CartaoTab`, agrupando despesas por `faturaDeCompra()` — não existem persistidas (o array `data.faturas` é um recurso aposentado do modelo antigo, não usar).

## Regras de segurança — NÃO QUEBRAR

1. **Splitwise:** a tabela `public.splitwise` tem RLS ativado e é acessada EXCLUSIVAMENTE via funções `SECURITY DEFINER` (`load_shared` / `save_shared`) chamadas por `/rest/v1/rpc/`. Nunca reintroduzir acesso direto à tabela no frontend.
2. **Notificações push:** são criptografadas ponta a ponta e têm restrições de conteúdo. Não enviar dados sensíveis em texto claro.
3. **Entrada em grupos Splitwise:** exige aprovação. Grupos novos recebem sufixo aleatório no código.
4. **Features de IA (qualquer chamador de `askClaude`):** números são SEMPRE calculados em JS, nunca pela IA (IA alucina somas). Só agregados vão no prompt — nunca transações brutas (privacidade + custo). Vale para as ~12 features que usam o proxy: análise do Relatório Mensal, perfil de empresa, leitura de nota fiscal por foto, oportunidades, alocação, risco etc. (Esta regra nasceu junto com a feature "como uso meu dinheiro", removida em 26/07/2026 — o princípio sobreviveu à feature.)
5. **Cache local (localStorage) SEMPRE escopado por `user_id`:** as chaves `all_profiles`, `all_profiles_ts`, `active_profile`, `sw_grupos`, `sw_ativo`, `sw_nome` e `sw_solicitado` NUNCA devem ser lidas/gravadas "cruas" — sempre via `kAllProfiles(userId)` / `kAllProfilesTs(userId)` / `kActiveProfile(userId)` / `kSwGrupos(userId)` / `kSwAtivo(userId)` / `kSwNome(userId)` / `kSwSolicitado(userId)` (helpers perto de `lsGet`/`lsSet` no topo do arquivo). Sem isso, trocar de conta no mesmo navegador reintroduz vazamento de dados entre contas — bug real, 16/07/2026: o perfil da conta A foi salvo por cima do perfil da conta B na nuvem, porque o app confiava em `localStorage.all_profiles` sem checar de qual usuário ele era. Mesma classe de bug achada no Splitwise em 19/07/2026 (identidade — quais grupos você participa, seu nome, convite pendente). A chave `` `sw_${cod}` `` (conteúdo COMPARTILHADO de um grupo específico) é diferente e não precisa de escopo por usuário — é dado colaborativo por natureza, não identidade pessoal.

## Convenções de cálculo

- **Preço médio de ações:** convenção de execução da corretora (broker execution convention), validada contra notas de corretagem reais do Leo.
- **Corretagem:** é uma despesa real e visível no app, não embutida silenciosamente no preço.
- **Fluxos de investimento:** ➕ Aportar e ➖ Vender são os fluxos oficiais de compra/venda.
- **Pagamento de fatura de cartão:** abatimento em cascata — quita a fatura fechada mais antiga não paga primeiro, excedente abate a aberta, sobra vira crédito para a próxima (`calcFaturaPagamentos` em `calc.mjs`). Implementado como duas transações emparelhadas (despesa no banco de origem + receita no banco-cartão, categoria `"Pagamento de fatura"`, incluída em `CAT_INTERNAS`), igual ao padrão já usado em Transferência entre bancos. Vale só para lançamentos feitos a partir de 14/07/2026 em diante — nada retroativo.

## Limitações conhecidas e ACEITAS (não "corrigir")

- ~~Indicadores BR (P/VP, ROE, margem, dívida) ficam vazios — exigiriam brapi pago.~~ **FALSO, corrigido em 26/07/2026.** A brapi grátis de fato não entrega esses campos, mas o **Fundamentus** entrega — e o Worker já o consultava. P/VP e ROE funcionavam o tempo todo (produção devolvia 0,63 e 7,7% para BBAS3); a margem líquida vinha vazia por um **bug de escaping**, não por limitação de API paga: `pega("Marg\. Líquida")` gerava uma regex procurando barra invertida literal. Hoje `fetchFundamentus` extrai **41 campos** (múltiplos, margens, balanço, resultados) — ver "Ampliação da extração do Fundamentus" abaixo.
- Divergência de metodologia no DY foi analisada e aceita.
- Google News frequentemente bloqueado a partir de Cloudflare Workers — fallbacks já existem.

## Pendências abertas (baixo risco, fazer quando solicitado)

- Token brapi: o hardcode foi resolvido (código atual do Worker lê de `env.BRAPI_TOKEN`, secret no Cloudflare — confirmado ao versionar `worker/worker.js` em 25/07/2026). **Falta confirmar se o token antigo exposto foi ROTACIONADO** (gerar um novo no brapi e trocar o secret) — mover pra env não invalida o token que já vazou em versões antigas. Fora do alcance do Claude: painel do brapi + painel da Cloudflare.
- **Bug latente no Worker (`/push-send`)**: achado ao versionar o código em 25/07/2026 — o endpoint usa `user.email` mas nunca define `user` (falta o `const user=await ur.json()` que o `/push-test` tem). Todo push de Splitwise via `/push-send` deve estar retornando 500 ("user is not defined") silenciosamente. Corrigir exige editar `worker/worker.js` E fazer o deploy manual no painel da Cloudflare.
- **📅 SETEMBRO/2026 — conferir a janela exata do Bloco E.** Quando `2026-08` (que tem `em`: BR e AU gravaram `em=2026-08-15`) virar o mês anterior, o cálculo de "No mês" passa a usar a data REAL da foto em vez do fallback. **Conferir se o número muda para o valor ESPERADO, não apenas se muda** — a diferença entre corrigir e mascarar é justamente essa. O esperado se calcula assim: pegar os aportes do perfil entre o dia 1 do mês da foto e o `em` dela; o "No mês" deve subir exatamente pela soma desses aportes (`quantidade × preço`), porque eles deixam de ser descontados de uma base que já os contém. Os snapshots de julho dos três perfis NÃO têm `em` e nunca vão ter — julho continuará no fallback para sempre.
- **⚠️ ABERTO E DISTORCENDO NÚMERO HOJE — dupla subtração de aportes em `ganhoAcoesEntreSnapshots`** (achado em 11/08/2026 ao montar o teste do ativo encerrado; NÃO corrigido, escopo de outra fase). A função desconta `aportesPeriodo` a partir de `${mesAnterior}-01`, mas o snapshot daquele mês é gravado **ao abrir o app**, ou seja, tipicamente no FIM do mês — então os aportes feitos durante o mês já estão dentro da base `ini.valorAtual` e são descontados de novo. Prova nos dados reais do Leo: o snapshot `2026-07` do BBAS3 já registra 385 unidades, e os dois aportes de julho (09/07 e 23/07, R$ 2.785,80 juntos) caem dentro da janela `2026-07-01 → hoje`. Afeta "No mês" e "No ano" da aba de rentabilidade de RV, sempre subestimando o ganho de quem aportou no período. Correção provável: a janela de aportes deve começar na data em que o snapshot foi tirado, não no dia 1 — o que exige gravar essa data no snapshot (`historico[]` hoje só guarda `mes`).

## Estado das features

- **Relatório Mensal:** v3 entregue e aprovada (10/07/2026) — fullscreen com saldo, barras mês a mês, curva de gasto acumulado, donut de categorias, fixo/variável, patrimônio, renda fixa e ações. Seção completa de ações chega no relatório de agosto. Upgrades futuros só por uso real, a pedido do Leo.
- **Feature REMOVIDA: "como uso meu dinheiro" (26/07/2026)** — a seção de análise de gastos com IA (lista de categorias + toggles Essencial/Pode cortar + botão "Analisar com IA") saiu a pedido do Leo. Ficava na aba **Relatórios** (`RelatoriosTab`), não no Dashboard — o CLAUDE.md antigo a descrevia como "próxima feature grande" mesmo ela já existindo há semanas. Saíram ~48 linhas: 3 `useState` (`aiResult`/`aiLoading`/`aiErro`), o bloco de lógica (`ESSENCIAIS_PADRAO`, `catFlags`, `flagDe`, `setFlag`, `catAnalise`, `analisarIA`) e o `<Card>` do JSX. O prop `setData` de `RelatoriosTab` ficou órfão (era consumido só pelo `setFlag`) e foi removido junto, na assinatura e no call site. **Nada saiu do Worker** — usava o proxy genérico `askClaude`, compartilhado com as outras features; nenhuma rota era exclusiva dela, logo nenhum deploy manual foi necessário. Não havia teste cobrindo (a lógica nunca foi extraída pra `calc.mjs`). Cuidado ao mexer perto: `relAi`/`relAiBusy` são a análise de IA do **Relatório Mensal**, feature diferente que continua viva.
  - **`data.catFlags` continua no perfil salvo, como peso morto ACEITO.** Remoção passiva não funciona neste modelo de save: `supa.save` serializa o objeto `data` inteiro e substitui a coluna JSONB, e esse objeto (carregado da nuvem) ainda carrega a chave — parar de escrever não apaga nada. Escrever migração ativa pra apagar um objeto de strings no perfil de todo mundo foi avaliado e recusado: risco desproporcional ao ganho. Não "corrigir" isso sem pedido explícito.
- **Pagamento de fatura de cartão:** entregue e validada pelo Leo com dados reais (14/07/2026) — card "💳 Pagar fatura" na aba Cartão, abatimento em cascata, mostra pago/falta por fatura e crédito disponível. Cobertura de testes em `calc.mjs`.
- **Fix: header da aba Renda Fixa divergia dos cards (15/07/2026)** — diagnosticado por engenharia reversa na UI pelo Leo (header "Total" ≠ soma dos cards, diferença de R$124,23). Causa: `calcValorLiquidoRF` (usada no header e no IR/líquido de cada card) só sabia calcular pela fórmula de taxa fixa (`calcValorAtualRF`), enquanto o valor bruto do card já usava a série real do BCB (`calcValorAtualRFHistorico`) — dois caminhos divergentes pro MESMO ativo. Fix: `calcValorLiquidoRF` ganhou parâmetro opcional `series`; os 3 pontos de consumo (header, IR/líquido por card, líquido de IR agregado) agora passam `seriesBCB`. Invisível em Prefixado (não depende de índice) — só aparecia em CDI/IPCA. Validado pelo Leo com dados reais: header bate exato com a soma dos cards.
- **Fix: `inv.valorAtual` congelado com fórmula de taxa fixa (16/07/2026)** — extensão do fix acima. Em vez de corrigir cada uma das ~13 telas que leem `inv.valorAtual` (Dashboard, BancoCard, relatórios, snapshot mensal...), corrigido na ORIGEM: `buscarDados` (refresh a cada 60s / "Atualizar todos") e `saveInv` (criar/editar ativo) agora gravam `valorAtual` com `calcValorAtualRFHistorico` em vez de `calcValorAtualRF`. Todas as telas que leem o campo passam a herdar o valor correto automaticamente, sem tocar nelas. `totalRF`/`totalInvest` na aba Investimentos continuam com cálculo ao vivo à parte (não a leitura do campo) — ficam ao lado do card "Rentabilidade" que também calcula ao vivo, então evitam até a janela de 60s de defasagem entre dois números na mesma tela.
- **Fix cosmético: Fatos Relevantes com `link:null` (16/07/2026)** — a aba Notícias de um ativo sempre envolvia cada "fato relevante" (`fatos`, vindo do Worker `/news`) num `<a href={f.link}>`, mesmo quando `f.link` era `null` — parecia clicável mas não ia a lugar nenhum. Agora só vira `<a>` quando existe `f.link`; sem link, renderiza como `<div>` (mesmo estilo, sem cursor de link).
- **Nota sobre `compoeFatorMensalProRata`** (16/07/2026): investigado o teste que estava falhando por ~R$0,91 — não é regressão nem bug de lógica (função não mudou desde que o teste foi escrito). O pro-rata mensal é uma aproximação documentada que nunca reproduz a interpolação diária proprietária de cada banco; a tolerância do teste (`0.5`) só estava mais apertada do que o resíduo real medido. Ajustada para `1`, com o motivo documentado no próprio teste.
- **Fix de segurança: vazamento de dados entre contas no mesmo navegador (16/07/2026)** — achado por acidente pelo Leo via DevTools: logout retornou 403 do Supabase (`session_not_found`) e a tela continuou mostrando o dashboard antigo. Causa raiz: `all_profiles`/`all_profiles_ts`/`active_profile` no localStorage nunca tiveram o `user_id` embutido — a lógica de "local vence a nuvem" (proteção contra perder dados com a nuvem fora do ar) comparava timestamps sem checar de quem era o cache, e podia empurrar o perfil da conta ANTERIOR pra dentro do registro Supabase da conta NOVA (escrita legítima, autenticada corretamente — não é falha de RLS, é o client confundindo de quem eram os dados). Fix: as 3 chaves passam a ser escopadas por `user_id` (ver regra de segurança 5, acima) em TODOS os pontos de leitura/escrita (inclusive o "vigia" de retry de save, que tinha o mesmo bug por um caminho separado). `handleLogout` agora limpa o cache da conta que está saindo e recarrega a página; `handleLogin` já troca `allData`/`profileId` pro cache do novo usuário na hora, sem esperar a sincronização assíncrona. **Ainda não confirmado 100% com as duas contas reais do Leo** — o teste dele em 17/07 não deu pra concluir nada (a chave escopada pode nem ter chegado a ser criada antes de clicar Sair); ver pendência do `sw_*` acima, achada no mesmo teste.
- **Otimização: polling de 25s baixava o payload inteiro a cada vez (17/07/2026)** — medido pelo Leo via DevTools Network: ~16KB por poll, projetando ~1,6GB/mês por aba aberta, batendo na cota de egress da organização (140% do limite, grace period até 12/08/2026). Causa: `puxar()` chamava `supa.load()` (que sempre busca `data,updated_at` juntos) só para comparar timestamp e descobrir que quase sempre nada mudou. Fix: novo método `supa.loadTs(t,id)` busca só `updated_at` (~200 bytes); `puxar()` só chama `supa.load()` (o payload completo) se a nuvem realmente estiver mais nova que o local. Mesma mensagem de log, mesmo intervalo de 25s — só o custo por chamada mudou. Não testado com Network tab real (Claude não acessa login) — validar: poll deve aparecer pequeno quando nada mudou, e completo (~16KB) só depois de uma edição real.
  - **Datas de egress — são DUAS coisas distintas, ambas válidas (confirmado pelo Leo em 08/08/2026):** o **grace period** da cota estourada termina em **12/08/2026** (prazo único, não haverá segundo); o **ciclo de faturamento** corrente é **06/08–06/09/2026** (recorrente, é o que zera o contador todo mês). Não confundir uma com a outra ao planejar prazo — o texto acima cita só o grace period.
- **Fix: login com senha errada era aceito silenciosamente (18/07/2026)** — causa raiz: `LoginScreen.handle()` checava `if(r.error)` pra decidir se o login falhou, mas o Supabase deste projeto usa `{code,error_code,msg}` (ver Arquitetura acima), então `r.error` nunca existia e o código sempre caía no caminho de sucesso — chamando `onLogin(undefined,undefined,undefined)`. Isso montava um `session` truthy (mesmo com token/user vazios), passava do gate de login, e renderizava o dashboard todo zerado — parecia que "qualquer senha" funcionava. Fix: checagem trocada para `if(r.error_code||r.error||!r.access_token)` no login (a prova definitiva de sucesso é ter um `access_token` de verdade) e `if(r.error_code||r.error)` no cadastro (mesma suposição de formato errado, achada em conjunto — não tinha sido reportada como quebrada, mas era o mesmo risco). Não testado com credenciais reais (Claude não digita senha nem errada — ver política de segurança) — validar: senha errada deve mostrar "Email ou senha incorretos" e continuar na tela de login; senha certa deve funcionar normal.
- **Feature: "Esqueceu a senha?" (18-19/07/2026)** — entregue e validada ponta a ponta pelo Leo (email chegou, link abriu `ResetPasswordScreen`, senha nova salva, login com ela funcionou). Fluxo: link na tela de login → `LoginScreen` mode `"reset-request"` (só email) → `supa.recover(email, window.location.origin)` (`POST /auth/v1/recover?redirect_to=...`, mensagem de sucesso SEMPRE genérica, não revela se o email existe) → o link do email volta com `#access_token=...&type=recovery` anexado → `AppInner` lê a hash no boot (ANTES do gate de sessão — recovery tem prioridade mesmo com sessão já aberta), limpa a hash da URL na hora (`history.replaceState`) e renderiza `ResetPasswordScreen` (nova senha + confirmar, mínimo 6 caracteres) → `supa.updatePassword(token, novaSenha)` (`PUT /auth/v1/user`) → volta pro login normal, força reautenticação com a senha nova. Erro 429 do `handleRecover` mostra mensagem específica de rate limit, distinta do erro de conexão genérico.
  - **SMTP:** usa **Gmail SMTP** (`smtp.gmail.com:587`, com Senha de App do Google — não a senha normal), configurado em Auth → SMTP Settings no painel do Supabase. **Não é Resend** — foi tentado primeiro mas o modo sandbox (sem domínio verificado) só manda email pro endereço dono da conta Resend, o que quebrava pra qualquer conta que não fosse essa (ex: Leo tem 2 contas, gmail e hotmail). Gmail SMTP não tem essa restrição — manda pra qualquer destinatário, grátis, sem precisar de domínio próprio.
  - **⚠️ NUNCA testar `/auth/v1/recover` (ou qualquer endpoint de auth que envia email) com endereço FICTÍCIO/inexistente** — o Supabase de fato tenta entregar, e um endereço que não existe sempre bate (bounce). Aconteceu em 18/07/2026: testes via curl com `teste-diagnostico-nao-real@example.com` geraram bounces reais e quase derrubaram o privilégio de envio de email do projeto inteiro. Testar só com endereço real, sem repetir em sequência (rate limit).
- **Investigação de vazamento de egress 29/06-11/07/2026 (sem logs disponíveis — investigação por código, não reprodução)**: Realtime nunca foi usado (confirmado em todo o histórico do git). Materialização de recorrências Splitwise só roda em ação do usuário (abrir grupo), sem timer. `puxar()` (poll de 25s corrigido em 17/07) só existe desde 14/07 — não é o culpado desse incidente específico, é anterior. Dois timers automáticos existiam no período (`invRefreshRef` 60s, `wlRefreshRef` 30s, ambos desde 10/06) mas disparam principalmente ESCRITA (POST), que normalmente não conta como "egress" no Supabase (egress é o que o servidor deles devolve em leituras). **Suspeito mais forte, endereçado em 19/07**: o loop de retry/backoff do `tentar()` (sync principal) e o "vigia" de retry de save (`iniciarVigiaDeSalvamento`) eram **infinitos** — sem teto de tentativas — e tinham `catch` mudo (sem log nenhum). Se o Supabase teve qualquer instabilidade real durante o período (não confirmável sem logs), esses loops teriam martelado `supa.load()` (~16KB) a cada 30s por aba aberta, indefinidamente, sem deixar rastro nenhum no console pra depois investigar. Fix: `tentar()` agora para depois de `MAX_TENTATIVAS=20` (backoff 3s→8s→20s→30s intocado até lá) e expõe `syncEsgotado` na UI ("Não foi possível sincronizar. Recarregue a página."); ambos os catches agora logam `console.error` com status/mensagem real do erro, antes descartada por completo. Não resolve retroativamente o incidente de 29/06-11/07 (já não tem como reproduzir), mas fecha o mecanismo mais plausível e garante visibilidade se acontecer de novo.
  - **⚠️ CORREÇÃO (08/08/2026): só UM dos dois loops foi capado.** O texto acima diz que os dois eram infinitos e depois descreve o fix — lendo rápido parece que os dois foram resolvidos. Não foram. `tentar()` tem `MAX_TENTATIVAS=20` de verdade (App.jsx ~5020/5085, verificado no código vivo). **`iniciarVigiaDeSalvamento()` continua sem teto nenhum** (App.jsx ~148-165): `tentativa` satura só o INTERVALO em 60s (`ESPERAS=[4000,10000,25000,45000,60000]`), a linha final reagenda sempre, e ele roda para sempre. O que foi aplicado nos dois foi o `console.error`, não o teto. Atenuante: o vigia chama `supa.save` (POST = ingress); só devolve corpo quando toma 401 e renova sessão (~1-2KB), então um vigia travado custa ~90KB/dia — é lacuna de robustez, não de egress. Agravante levantado pelo Leo: `importar()` grava payload arbitrário, então um import grande que falhe põe um POST de MBs num loop sem fim.
  - **⚠️ CAUSA RAIZ REAL DO INCIDENTE 29/06-11/07, achada em 08/08/2026 — o suspeito acima estava certo no mecanismo e errado por 130× no número.** Evidência nova: os 19 exports do app em `~/Downloads/financas_*.json` (não só os 3 recentes) dão a série completa do payload. 27/06: 22,9KB, zero fotos. **28/06 e 29/06: 2.909KB e 2.914KB, com UMA foto de NF de 2,82MB = 99,2% do payload.** 14/07 em diante: 57KB, zero fotos. A foto aparece um dia antes do vazamento começar e some na janela em que ele termina. Não há export entre 29/06 e 14/07, então a data exata da remoção fica nesse intervalo — mas nenhuma outra hipótese tem esse alinhamento. **Naquele período `supa.load()` não custava ~16KB: custava 2,13MB com gzip** (base64 de JPEG praticamente não comprime). Um loop de retry por 1 hora = 255MB, não ~2MB; 5GB estourariam em 20 horas de loop. E mesmo SEM loop nenhum, 6 boots/dia × 14 dias já dariam 179MB. A lição: ao investigar um incidente passado, NUNCA usar o tamanho de payload de hoje para raciocinar sobre um período em que ele era outro — medir o payload da época. Git confirma que nenhum commit removeu a foto (`-S nfImg` não tem nada entre 01/07 e 17/07): ela foi apagada pelo app, à mão.
  - **Correção de closure obsoleto (19/07/2026, achada em code review do Leo)**: a 1ª versão checava `!loadOk.current` em `retomar()`, mas não bloqueava contra o teto — depois de esgotar as 20 tentativas, qualquer evento de foco/online (`retomar`) disparava `tentar()` de novo, contradizendo "só reload ou nova sessão recomeça". A correção óbvia (checar o state `syncEsgotado` dentro de `retomar`) NÃO funcionaria: `tentar`/`retomar` são definidos uma única vez por efeito (dependência `[session?.token]`), então leriam pra sempre o valor de `syncEsgotado` de quando o efeito montou (closure obsoleto de state em React). Fix real: variável `esgotado` de closure comum (mesmo padrão de `cancelado`/`timer`/`tentativa` — nunca usar `useState` para algo lido dentro de closures de efeito que não redisparam com aquele state como dependência).
- **Fix de segurança: identidade do Splitwise vazava entre contas (19/07/2026)** — extensão do fix de `all_profiles` (16/07). `sw_grupos`/`sw_ativo`/`sw_nome`/`sw_solicitado` (quais grupos você participa, seu nome nos grupos, convite pendente) nunca tiveram `user_id` embutido, mesmo depois do fix de logout — foi identificado mas ficou pendente até agora. `SplitwiseTab` ganhou uma prop `userId` (antes só recebia `userEmail`) pra poder escopar as 4 chaves com os novos helpers `kSwGrupos`/`kSwAtivo`/`kSwNome`/`kSwSolicitado`. A chave `` `sw_${cod}` `` (conteúdo de um grupo específico, compartilhado entre membros) foi deixada como está de propósito — não é dado de identidade pessoal. Validado pelo Leo: código revisado confirma que `SplitwiseTab` só lê/escreve as chaves escopadas (sem fallback pra chave crua em lugar nenhum) e que `userId` chega sempre populado (componente só monta atrás do gate de sessão em `AppInner`) — nenhuma investigação adicional necessária.
  - **Limpeza de órfãs do Splitwise no logout (19/07/2026, achado em teste do Leo)**: o `handleLogout` já limpava as órfãs da família `all_profiles` (Passo 3 do fix de 16/07) mas **esqueceu** as órfãs sem escopo do Splitwise (`sw_grupos`, `sw_ativo`, `sw_nome`, `sw_solicitado`, sem `:uid`) — ficavam paradas no DevTools depois do logout, mesmo já não sendo lidas por código nenhum. Achado também `sw_codigo`, órfã ainda mais antiga (nome usado antes de virar `sw_ativo`, entre 09-20/06/2026, achado via `git log -S`). Todas agora limpas no `handleLogout` junto com as outras. Cosmético — nunca foi vazamento ativo, já que nada as lia.
  - **Decisão de produto (19/07/2026): `handleLogout` NÃO limpa mais `kSwGrupos(uid)`/`kSwAtivo(uid)`/`kSwNome(uid)`/`kSwSolicitado(uid)`.** Limpar essas 4 (chegou a ser feito no fix acima) criava atrito real: sair e entrar de novo com a MESMA conta perdia o vínculo com o grupo, exigindo reingressar pelo código toda vez. A proteção contra vazamento entre contas está no ESCOPO por `user_id` (a chave em si já é diferente por conta), não em apagar no logout — então parar de limpar não reabre nenhum risco. As chaves órfãs SEM escopo (`sw_grupos` etc. sem `:uid`, incluindo `sw_codigo`) continuam sendo limpas normalmente — são lixo de versões antigas, sem relação com essa decisão.

- **Fix: % de ganho errada no card de renda variável (23/07/2026, CXSE3)** — achado por conferência aritmética do Leo: card mostrava +34,8% quando os próprios números davam 24,6% (ganho R$620,20 ÷ custo R$2.518,60). Causa raiz em duas partes: (1) o card dividia o ganho pelo campo GRAVADO `valorInvestido` enquanto o ganho em R$ vinha de qtd×PM — numerador e denominador de fontes diferentes; (2) `saveInv` na EDIÇÃO de uma ação preservava o `valorInvestido` velho pra sempre (o form herda `{...inv}` e o `||` nunca chegava no PM×qtd novo; o campo nem aparece no modal de ações pra corrigir à mão). Engenharia reversa bateu exata: 620,20÷1.782,18=34,80%. Fix: nova função pura `posicaoRV(inv)` em `calc.mjs` (custo/atual/lucro/% SEMPRE de qtd×PM, com fallback pra `valorInvestido||valor` só quando não há PM — ativos legados tipo "Outros"), usada no card e no `totalInvestido` (a % geral da carteira no topo da aba, que tinha o mesmo defeito); `saveInv` agora recalcula `vi=PM×qtd` pra não-RF na edição (RF continua usando o campo digitado). Ocorrências de baixa gravidade (contextos de IA, texto do modal de resgate, invMes) NÃO foram tocadas — se curam sozinhas quando o dado for regravado numa próxima edição/aporte. Testes cobrem o caso real do CXSE3 + regressão dos outros 4 ativos.

- **Ampliação da extração do Fundamentus (26/07/2026)** — `fetchFundamentus` saiu de 7 para **41 campos**, sem mudar a estratégia de parsing (o `pega` ancora no texto do rótulo dentro de `<span class="txt">` e pula até a `<td class="data">` seguinte — robusto a reordenação de colunas; foi só adicionar chamadas). Dois achados que valem lembrar:
  - **Bug de escaping (corrigido):** `pega("Marg\. Líquida")` nunca casou. A literal JS já continha a barra invertida, e o escapador dentro do `pega` escapava de novo, gerando `Marg\\\.` — regex que procura barra literal. **Nunca passe rótulos pré-escapados para o `pega`**: ele faz o escaping sozinho.
  - **⚠️ Guarda do zero-filler — NÃO "corrigir" achando que é bug:** bancos e parte das seguradoras não têm estrutura de custo/receita tradicional, e o Fundamentus preenche os campos do esquema não-financeiro com **ZERO** em vez de omiti-los (BBAS3/BBDC4/ITUB4/SANB11 mostram `Marg. Líquida 0,0%`). Zero é pior que vazio: passa por número válido e contamina qualquer cálculo. A regra: quando `Marg. Bruta === "-"`, campos do esquema não-financeiro que leiam **exatamente zero** viram `null`. Discriminante validado em 14 papéis, zero falso positivo. Alternativas testadas e **descartadas**: `Subsetor==="Seguradoras"` anularia os 8,9% legítimos da PSSA3; `ROIC==="-"` não pega a CXSE3 (ROIC real, margens zeradas). A regra é deliberadamente estreita — só desconfia de zero **dentro** do layout financeiro, então a PSSA3 mantém `Dív. Bruta = 0` (seguradora sem dívida, dado correto).
  - Rótulo correto do endividamento é **`Dív Líq / Patrim`**; `Div.Br/Patrim` não existe na página.
  - `Receita Líquida`, `EBIT` e `Lucro Líquido` aparecem 2x (12 meses e 3 meses). O `pega` usa `.match()` e pega sempre a 1ª = 12 meses — daí o sufixo `_12m` nas chaves. Capturar o trimestre exigiria `matchAll` + índice.
  - O `/raiox` agora repassa **todos** os campos do Fundamentus por um loop "só preenche buraco", em vez da lista manual de 4 campos que existia. Campo novo em `fetchFundamentus` chega ao app sozinho.
  - `div_yield` (Fundamentus) é campo separado e **não** alimenta o `dy` — a divergência de metodologia no DY continua sendo limitação aceita.

- **Coleta para o checklist Buy and Hold (27/07/2026)** — três coletores novos alimentam 9 dos 10 critérios. O 10º foi investigado a fundo e **não tem dado**; ver abaixo antes de tentar de novo.
  - **`fetchProventos`** (`fundamentus.com.br/proventos.php?papel=X&tipo=2`): a página tem duas tabelas e usamos a agregada por ano, ancorada em `id="resultado-anual"` (não por posição). Ela agrupa por **data-ex** e **inclui JCP** — verificado: WEGE3 2025 dá 2,451 no total contra 2,054 se contasse só "DIVIDENDO". Isso importa porque no Brasil o JCP é metade do provento e **o Yahoo não o separa**. Entrega `cagr_provento_5a`, `pagou_todo_ano_5a` e `provento_por_ano`.
    - ⚠️ **A tabela só lista anos em que HOUVE pagamento** — ano sem provento fica *ausente*, não vem com zero. Por isso `pagou_todo_ano_5a` checa **presença** numa janela fixa de 5 anos fechados, não valor > 0 no que veio. Quem mexer nisso e trocar por `.every(v => v > 0)` reintroduz o bug.
    - O CAGR é calculado entre as pontas da janela e **pode ser positivo mesmo com ano pulado** (fixture de teste: pulou 2023 → CAGR 8,8% com `pagou_todo_ano_5a: false`). Na tela, o critério só deve passar se os **dois** campos concordarem.
  - **`fetchIdadeBolsa`** (chart `range=max`): ⚠️ **o Yahoo tem um PISO em 2000-02-01.** WEGE3 e BBAS3 devolvem essa data idêntica, que não é a estreia de nenhuma das duas; CXSE3 devolve 2021-04-26, batendo com o IPO real. Regra: data > piso = idade exata; data = piso = listada há **no mínimo** ~26 anos. O campo `anos_bolsa_minimo` sinaliza o caso — **nunca apresentar `anos_bolsa` como idade exata quando ele for `true`**. Para o critério "> 5 anos" os dois casos respondem com certeza. Custo ~41KB; o Yahoo força granularidade mensal em `range=max` (testado `1mo` e `3mo`: idênticos), então **não substitui** a chamada de 3y que alimenta `var_semana`/`var_mes`.
  - **`fetchLucroAnual`** (`quoteSummary/incomeStatementHistory`): ⚠️ **o quoteSummary FUNCIONA para papéis `.SA`** — a suposição de que "BR só tem brapi" era falsa. O `fetchIndicadores` roteia BR direto para a brapi e nunca o chamava; este é caminho novo, não reaproveitamento. Devolve **exatamente 4 anos**, então o critério é "sem prejuízo nos últimos 4 anos" e **nunca deve ser rotulado como "nunca deu prejuízo"**.
  - **❌ "Lucro nos últimos 20 trimestres" é INVIÁVEL — não tentar de novo.** Teto de 4 trimestres confirmado por três caminhos independentes (`incomeStatementHistoryQuarterly`=4, `earningsChart.quarterly`=4, `financialsChart.quarterly`=3). Alternativas fechadas: **`balancos.php` do Fundamentus exige CAPTCHA** (e resolver CAPTCHA está fora do que o Claude faz), `resultados_trimestrais.php` só entrega links para documentos do CVM/RAD (não estruturado), e os módulos de demonstrativo da brapi são pagos. Decisão de produto: o critério fica **fora** da tela — 4 trimestres não distingue empresa consistente de empresa em recuperação, e critério que parece dizer algo sem dizer é pior que critério ausente.
  - Custo somado: 3 chamadas extras por raio-X de ativo BR (~93KB). Só rodam em **ação do usuário** ao abrir um ativo — não há polling, ao contrário do `puxar()` de 25s que causou o estouro de egress em julho.

- **⚠️ A watchlist tinha DY e ROE gerados por IA, persistidos no Supabase (27/07/2026) — NÃO restaurar** — achado pelo Leo ao conferir o preço-teto da BBAS3 no raio-X. Três problemas encadeados no card da watchlist (`AnaliseTab`):
  - **Preço-teto com fórmula errada**: era `preco*(dy/dyAlvo)`, ou seja, o provento dos ÚLTIMOS 12 MESES ÷ DY alvo. Bazin usa a **média de 5 anos**. Dava veredito **oposto** ao do raio-X: BBAS3 aparecia "✗ acima do teto" (R$ 19,72) no card e "✓ abaixo" (R$ 51,10) no modal — clicar no ticker invertia a conclusão. Mesma classe do bug do header de Renda Fixa (15/07): dois caminhos calculando o mesmo valor.
  - **O `dy` que alimentava esse cálculo vinha da IA.** O `/quote` devolve `dy: null` e `roe: null` para papéis BR (a brapi grátis não entrega) e para ETFs AU. O `addWatch` tem um fallback `precisaIA=!obj.pl||!obj.dy||!obj.roe` que pede os números ao `askClaude`. O `pl` escapa porque a brapi o fornece de verdade — mas `dy` e `roe` eram **sempre** alucinados nesses mercados.
  - **E ficavam gravados.** A watchlist é persistida em `data.watchlist` (Supabase, sincroniza entre aparelhos — não é só localStorage). O `refreshAll` só sobrescreve quando `real.dy` não é nulo, o que para BR nunca acontece: o número alucinado **sobrevivia a todos os refreshes**.
  - **Fix aplicado**: o bloco de preço-teto e o badge de DY saíram do card. O preço-teto correto existe só no raio-X, via `precoTetoBazin`, que tem `provento_por_ano` de verdade — o card não tem esse dado, porque se alimenta de `/quote` e atualiza a cada 30s (chamar o Fundamentus por ticker nesse ritmo repetiria o estouro de egress de julho).
  - **Pendências conhecidas, não corrigidas ainda**: (1) o `addWatch` ainda PEDE `dy`/`roe` à IA e grava no Supabase, mesmo sem exibir — quem adicionar um badge de ROE no futuro exibirá dado alucinado sem saber; (2) o `precoCtx` da análise de carteira injeta `DY:${w.dy}` de volta num prompt de IA, ou seja, alucinação virando entrada de outra alucinação; (3) o botão "+ Watchlist" da lista de oportunidades grava `dy`/`pl` vindos direto da IA. Ver regra de segurança 4.

- **Triagem de FII (30/07/2026)** — `/fii-triagem` no Worker + funções puras em `calc.mjs`. ⚠️ **Não reaproveitar Graham, Bazin nem o checklist Buy and Hold para FII**: FFO substitui lucro, VP/Cota substitui VPA, a distribuição é obrigatória por lei e "ROE > 10%" não tem equivalente. Aplicar régua de ação a FII gera número plausível e errado.
  - **Fontes:** `fii_resultado.php` (560 fundos, 495 KB, 1 requisição, âncora `id="tabelaResultado"` — **não** é o `id="resultado"` das ações) e `fii_proventos.php?papel=X&tipo=2` (10 anos mensais, 1 req por fundo, âncora `id="resultado"`, sem tabela anual agregada).
  - ⚠️ **O DY publicado NÃO é reproduzível — nunca exibir.** Para MXRF11 o próprio Fundamentus dá três respostas (campo 13,32%, `Dividendo/cota ÷ preço` 12,19%, histórico 13,50%). O app calcula do histórico, que é auditável.
  - ⚠️ **O campo `Segmento` está errado** — classifica MXRF11 (papel/CRI) como "Logística" e joga 56% do universo em "Multicategoria"/"Outros". O tipo é **derivado** de `Qtd de imóveis`. Limite honesto: sem imóveis não separa papel de FoF.
  - ⚠️ **Zero-filler, 4ª vez na base:** a tabela de FII usa **zero**, nunca traço. 412 dos 560 trazem vacância 0,00%, a maioria por não ter imóvel. `metricasImovel` devolve `null` quando `qtd_imoveis === 0`. Fundo de tijolo com 0% é dado REAL (TRXF11, 97 imóveis, totalmente locado) — por isso o corte é pela contagem de imóveis, nunca pelo valor lido.
  - ⚠️ **Janela do DY é trailing 12 MESES, não "os 12 últimos pagamentos".** MXRF11 teve dois pagamentos em out/2025 → 13 pagamentos na janela. O método correto dá 13,50%; pegar os 12 mais recentes daria 12,46% e subestimaria o fundo. (Não sei dizer se o pagamento duplicado é distribuição extra real ou linha repetida na fonte — duas linhas idênticas na mesma data.)
  - ⚠️ **`cache.match()` e `cache.put()` CONTAM no limite de 50 subrequisições do Worker.** Fundo frio custa 3 (match+fetch+put), quente custa 1. A rota morria com "Too many subrequests" ao pedir 40 frios (~123). Resolvido com **orçamento** que degrada e sinaliza `truncado`, em vez de teto fixo — chamar de novo avança conforme o cache aquece.
  - **Cache:** edge (`caches.default`, 12h), mesmo padrão do `/bcb-serie`. Não usar Supabase (cota de egress). KV foi avaliado e dispensado: exigiria namespace + binding para economizar 2-3 requisições/dia.

## Verificação visual em navegador headless — REGRA

**Chamar `resize_window` ANTES de qualquer medição, e reportar o viewport usado junto com o resultado.** O navegador headless abre com viewport `0×0`: nesse estado `position:fixed; inset:0` vira 0×0, `min(96vw,600px)` colapsa para o padding, e elementos com `min-width` "sobrevivem" enquanto os sem `min-width` somem — o que produz um diagnóstico **invertido**. Verificação sem viewport declarado não conta como verificação.

O que continua válido sem viewport (não depende de layout): texto extraído do DOM, contagem de elementos, coordenadas internas de `viewBox` de SVG, `localStorage`, contagem de requisições de rede. O que **não** vale: qualquer afirmação sobre aparência, altura, largura, sobreposição ou "está bonito na tela".

Caso real (30/07/2026): dois gráficos do modal de FII eram esmagados de 106px para 51px por um `overflow-x:auto` dentro de um flex column, e a verificação anterior — feita com viewport 0×0 — não só não pegou como sugeria que o gráfico saudável é que estava quebrado.

## Linha de base das métricas de RV — 13/08/2026, commit `c0f5078` (pós-Bloco D)

Registrado ANTES dos Blocos C e E, que vão mexer nestes números de propósito. Sem esta linha, daqui a duas semanas um valor diferente não se distingue de regressão. Fonte: export `financas_2026-08-10.json`, cálculo com o código de `c0f5078`.

| perfil | métrica | **pós-D (base)** | pós-C | pós-E |
|---|---|---|---|---|
| **BR** | desdeInicio | **149,14** (0,88%) | 149,14 (sem venda) | **−1.081,09** (−5,24%) ¹ |
| | No mês | **−4.732,87** (−26,79%) ⚠️ | — | **−1.715,57** (−9,71%) est. |
| | No ano | **−4.732,87** (−26,79%) ⚠️ | — | **−1.715,57** (−9,71%) est. |
| | custo total | **17.034,03** | 17.034,03 · c/ custos **17.046,54** | 20.637,06 · c/ custos 20.689,07 ¹ |
| | composição | BBAS3 44,8 · CPLE3 25,6 · CXSE3 15,6 · ITUB4 13,6 · CSNA3 0,4 | | |
| **AU** | desdeInicio | **39,71** (2,06%) | 39,71 (sem venda) | **11,95** (0,41%) ¹ |
| | No mês | **−882,11** (−44,11%) ⚠️ | — | **−63,45** (−3,17%) est. |
| | No ano | **−882,11** (−44,11%) ⚠️ | — | **−63,45** (−3,17%) est. |
| | custo total | **1.924,90** | 1.924,90 · c/ custos **1.936,90** | 2.911,84 · c/ custos 2.929,84 ¹ |
| | composição | NAB 67,1 · QBE 32,9 | | |
| **US** | desdeInicio | **−418,06** (−25,06%) | −418,06 (sem venda) | **−418,06** (−25,06%) |
| | No mês | **127,70** (11,37%) ⚠️ | — | **127,70** (11,37%) est. |
| | No ano | **−1.249,78** (−111,31%) ⚠️ | — | **127,70** (11,37%) est. ✅ |
| | custo total | **1.668,56** | 1.668,56 (sem corretagem) | 1.668,56 |
| | composição | SPCX 90,1 · NVDA 9,9 | | |

**Pós-E medido em 15/08/2026, commit do Bloco E, export `financas_2026-08-15-2.json`:** o **−111,31% do US virou +127,70**, exatamente o valor previsto no diagnóstico abaixo antes de o fix existir — corrigiu, não mascarou. "No mês" e "No ano" coincidem nos três perfis porque a única foto-base disponível é a de julho nos dois casos; a tela mostra ambos, com o rótulo da base em cada um.

¹ **Decomposição aritmética do movimento de BR e AU (15/08/2026)** — atribuir a "aportes reais" por plausibilidade não bastava; segue a conta fechada, comparando `financas_2026-08-10.json` (pós-D) com `financas_2026-08-15-2.json` (pós-E).

Identidade usada: `desdeInicio = valorAtual − custo + realizado`, e `realizado = 0` (não há vendas). Logo `ΔdesdeInicio = Δvalor − Δcusto`.

**BR — ΔdesdeInicio = −1.230,23** (149,14 → −1.081,09)

| ativo | un novas | Σ(q×p) dos aportes | Δcusto | novas×preço | antigas×Δpreço | Δvalor |
|---|---|---|---|---|---|---|
| BBAS3 | +49 | 946,08 | 945,28 | 900,62 | −623,70 | 276,92 |
| ITUB4 | +44 | 1.695,72 | 1.695,35 | 1.716,00 | −108,87 | 1.607,13 |
| CPLE3 | +70 | 962,50 | 962,40 | 958,30 | −291,00 | 667,30 |
| CXSE3 | 0 | — | 0,00 | 0,00 | −177,80 | −177,80 |
| CSNA3 | 0 | — | 0,00 | 0,00 | −0,75 | −0,75 |
| **total** | | **3.604,30** | **3.603,03** | **3.574,92** | **−1.202,12** | **2.372,80** |

`novas×preço + antigas×Δpreço = 2.372,80`, idêntico ao Δvalor — a decomposição fecha com resíduo **zero**.

**A causa NÃO são os aportes.** Separando:
- **compras:** −28,11 (comprou por 3.603,03 o que hoje vale 3.574,92 — o preço caiu depois da compra)
- **preço nas ações que já tinha:** −1.202,12
- soma: −1.230,23 ✅

**98% da queda é variação de mercado na posição antiga.** Os aportes contribuíram com −28,11, ou 2%.

Três correções ao que se supunha: o aporte de ITUB4 não foi de 14 unidades e sim de **44** (30 em 14/08 + 14 em 15/08); **BBAS3 e CPLE3 também receberam aporte**, não só o ITUB4; e o custo subiu quase exatamente o que o valor subiu pelas ações novas (3.603,03 contra 3.574,92) — a hipótese de "custo subiu sem o valor acompanhar" **não se confirma**.

**AU — ΔdesdeInicio = −27,76** (39,71 → 11,95): QBE +19 un e NAB +13 un, Δcusto 986,94, novas×preço 976,52, antigas×Δpreço −17,34. Mesmo padrão, escala menor.

Dois detalhes de método:
- O resíduo de **−1,27** entre `Σ(q×p)` e `Δcusto` no BR **não é corretagem** — é arredondamento do `precoMedio` a 2 casas, ~0,3 por ativo. A corretagem não entra em `posicaoRV.custo`; ela vive em `custoComCustos`, que subiu 12,51 → 52,01 (Δ 39,50) no BR e 12,00 → 18,00 no AU.
- O **US é o controle limpo**: sem movimento no período, `desdeInicio` e `custo` ficaram idênticos (−418,06 e 1.668,56). Só "No ano" mudou. É o que isola o efeito do Bloco E de tudo o mais.

Os três perfis aparecem como **estimada** porque nenhum snapshot de julho tem `em` — e nunca terá. A janela exata só entra em setembro; ver a pendência de setembro/2026.

**DIAGNÓSTICO DA CAUSA (13/08/2026, feito ANTES do Bloco E de propósito — para não confundir "corrigiu" com "mascarou"):** o −111,31% do US não vem da dupla subtração dos aportes do mês. Vem de algo mais amplo: `ganhoAcoesEntreSnapshots` assume que a foto-base foi tirada em `iniStr`, e ela não foi. A base é o snapshot de um MÊS, gravado num dia arbitrário, e em "No ano" pode ser **meses depois** de `iniStr`. Reconstrução termo a termo do US:

```
foto-base escolhida: 2026-07   (janela de aportes: 2026-01-01 → hoje)
SPCX:  valorFim 1.126,09 − base 1.011,26 − aportes 1.377,48 + vendas 0,00 = −1.262,65
NVDA:  valorFim   124,41 − base   111,54 − aportes     0,00 + vendas 0,00 =    +12,87
       ganho −1.249,78 ÷ baseTotal 1.122,80 = −111,31%
```

O aporte de SPCX é de **20/06** — anterior à foto de julho, portanto **já dentro** dos 1.011,26 da base. Subtraí-lo desconta 1.377,48 de uma base que vale 1.011,26: subtrair mais que a base inteira é o que torna o percentual impossível. Não é arredondamento nem sinal trocado.

**Previsão verificável para o Bloco E:** removendo apenas esse termo, `−1.249,78 + 1.377,48 = +127,70` — exatamente o valor que "No mês" do US já mostra hoje, porque lá a janela começa em 01/07 e o aporte de junho fica de fora. Se o pós-E der +127,70 no ano do US, corrigiu; se der outro número, mascarou.

Consequência de escopo: com `em`, a base do ano passa a ser "desde a foto mais antiga do ano", não "desde 1º de janeiro". O rótulo na tela já diz `base: foto de DD/MM/AAAA` (Bloco B1), então isso fica honesto — mas é uma mudança de significado, não só de valor.

⚠️ **"No mês" e "No ano" já estão errados nesta base** — são os números que o Bloco E vai corrigir, não uma referência de correção. Todos saem com `janelaExata: false` (nenhum snapshot tem `em` ainda) e sofrem a dupla subtração de aportes. O **−111,31%** do US é a prova aritmética: posição comprada não perde mais que 100%. Ao comparar pós-E, esperar mudança GRANDE nessas quatro linhas — o que precisa ser investigado é `desdeInicio`, `custo total` e `composição` mudarem, não elas.

**Pós-C medido em 13/08/2026, commit `46274fa`:** `desdeInicio` NÃO mudou em nenhum perfil, porque ele lê `vendas[].resultado` e `vendas[]` está vazio nos três — a correção da corretagem de venda só aparece na primeira venda real. O que mudou foi a base de apuração: `custoComCustos` supera `custo` em R$ 12,51 (BR) e R$ 12,00 (AU); o US não tem corretagem registrada. Composição e custo de exibição inalterados, como previsto.

O que o Bloco C deve mexer: `desdeInicio` e `custo total` (corretagem entrando na base de apuração), e o resultado realizado quando houver venda. O que o Bloco C **não** pode mexer: composição, e o `custo` de exibição do card.

## `historico[]` é dado VERSIONADO — REGRA

Os snapshots mensais ganharam campos ao longo do tempo. **Foto antiga NÃO tem os campos novos**, e nunca vai ter — não há como retro-preencher o que não foi gravado.

| campo | existe desde |
|---|---|
| `mes`, `patrimonio`, `bancos`, `investimentos` | origem |
| `ativos[]` (detalhe por ativo) | **10/07/2026** (`9b82349`) |
| `em` (dia em que a foto foi TIRADA) | **11/08/2026** |

**Todo consumidor precisa tratar a ausência como caso explícito — nunca interpretar campo faltante como zero, vazio ou dia 1.**

Caso real (achado em 11/08/2026): o snapshot `au 2026-06` traz `investimentos: 995,85` e **não tem** a chave `ativos`. `rentabilidadeAcoes` escolhia a foto mais antiga do ano como base do ano e lia `h.ativos` como lista vazia — carteira vazia, portanto "sem base" — e **"No ano" morria em silêncio** em AU e US, mesmo havendo julho e agosto perfeitamente utilizáveis. O BR tinha o mesmo defeito com R$ 36 mil em `2026-06`. Não era carteira vazia: era recorte incompleto, lido como ausência de dado.

A confusão é a mesma família do antipadrão do `||` abaixo — **campo ausente e valor zero sendo tratados como a mesma coisa**. Aqui a correção foi `_fotoUtil` exigir `Array.isArray(ativos) && ativos.length > 0`, e a tela declarar "sem foto utilizável" em vez de sumir.

Ao acrescentar QUALQUER campo novo ao snapshot: registrar a data nesta tabela, e escrever no consumidor o que acontece quando o campo não está lá.

## Correção de número: PREVISÃO ESCRITA ANTES DO FIX — REGRA

**Ao corrigir um número errado, escrever antes o valor esperado depois da correção, com a aritmética que o produz.** Sem isso não há como distinguir *corrigir* de *mascarar*: o sintoma some nos dois casos, e "o número absurdo desapareceu" é evidência fraca — qualquer mudança que zere um termo faz o absurdo sumir.

O procedimento:
1. Reconstruir o cálculo **termo a termo** até achar qual parcela produz o valor impossível.
2. Escrever a previsão como conta: *"removendo esse termo, X + Y = Z"*, e registrar Z **no CLAUDE.md ou no teste**, com data, antes de tocar no código.
3. Depois do fix, conferir contra Z. **Bateu exatamente → corrigiu. Deu outro número → parar e reportar**, mesmo que o novo número pareça razoável.

Caso real (Bloco E, 13–15/08/2026): "No ano" do US marcava **−111,31%**, impossível para posição comprada. A reconstrução mostrou o termo culpado — um aporte de 20/06 de R$ 1.377,48 sendo descontado de uma foto-base de julho que valia R$ 1.011,26, ou seja, subtraindo mais que a base inteira. Previsão registrada antes do fix: `−1.249,78 + 1.377,48 = +127,70`, e a observação de que esse valor coincidiria com o "No mês" já exibido. Depois do fix: **+127,70**, na tela e no teste. O teste que fixava o valor errado foi convertido em teste do valor previsto, mantendo o antigo como documentação do mecanismo.

Vale para qualquer correção de valor exibido — não para refactor sem efeito numérico, onde o critério é o oposto (Δ zero verificado antes de aplicar, como no Bloco D).

## Diff de JSON: comparar com chaves ORDENADAS — REGRA

**`JSON.stringify` ingênuo produz falso positivo em diff de dados.** A ordem das chaves de um objeto muda em qualquer round-trip `parse`/`stringify` — que é exatamente o que o save na nuvem, a restauração e o export fazem. Dois objetos com os mesmos valores viram strings diferentes.

Comparar sempre com chaves ordenadas em **todas** as profundidades:

```js
const canon=o=>JSON.stringify(o,(k,v)=>
  (v&&typeof v==="object"&&!Array.isArray(v))
    ? Object.fromEntries(Object.keys(v).sort().map(x=>[x,v[x]]))
    : v);
canon(a)===canon(b)   // ← isto compara DADO
```

Caso real (15/08/2026, verificação do F2): o diff ingênuo acusou **6 campos alterados** — `br.transacoes`, `au.transacoes`, `au.recorrencias` e o `aportes` do ITUB4 entre eles. Comparação canônica: **zero mudanças reais**. O `aportes` tinha virado `{data,preco,corretagem,quantidade}` em vez de `{data,quantidade,preco,corretagem}`, mesmos valores. Reportar aquilo como corrupção teria disparado uma investigação inteira sobre nada.

## Auditoria de dados usa SEMPRE o export mais recente — REGRA

Os exports em `~/Downloads/financas_*.json` são a única janela para os dados reais do Leo (o Supabase exige login, que o Claude não faz). **Pegar sempre o mais novo — `ls -t ~/Downloads/financas_*.json | head -1` — e citar o arquivo usado junto com a conclusão.**

Conclusão sobre "quantos casos existem" tem prazo de validade, porque o app está em uso diário. Caso real (13/08/2026): a corretagem de compra aparecia em **1 de 22 ativos** no export de 05/08 e em **5 de 22** no de 10/08 — cinco dias de uso normal quintuplicaram a amostra. A frase "o caminho nunca foi exercido com dado real", escrita com base no arquivo velho, já era falsa quando foi escrita.

Vale também para a decisão de fazer ou não um dry-run: "não há caso na base" medido num export de uma semana atrás não é evidência de que não há caso hoje.

## Validação nova roda contra os dados REAIS antes de ser ligada — REGRA

**Escrever a regra, rodá-la em modo seco sobre a base real, reportar a contagem, e só então ligar.** Fixture sintético não pega o que a base real contém: quem escreve o teste escreve os casos que imaginou, e o defeito mora justamente no caso que não foi imaginado.

Caso real (11/08/2026): a validação de "estado impossível" no cadastro de investimento barra RF que tenha ticker ou preço médio. O formulário de renda fixa grava **`precoMedio: 0`** — se a regra tratasse "tem PM" como `Number.isFinite(pm)` em vez de `pm > 0`, os **18 CDBs** do Leo seriam barrados na primeira edição. Nenhum fixture escrito à mão teria `precoMedio: 0` num CDB, porque quem escreve o fixture pensa "CDB não tem PM" e omite o campo. O dry-run mostrou 0 de 22 reprovando; sem ele, o bloqueio teria ido para produção quebrando a edição de 82% da carteira.

Vale para qualquer regra que passe a REJEITAR algo: validação de formulário, filtro, constraint, migração destrutiva. O dry-run é barato; descobrir pelo usuário travado não é.

## Antipadrão do `||` com zero — REGRA

```js
valorAtual || valorInvestido || valor || 0     // ⚠️ NUNCA para dinheiro
```

**`0` é falsy, então o `||` pula todo campo zerado e pousa no primeiro campo não-zerado — que costuma ser o campo podre.** A cadeia parece um fallback ("usa o melhor disponível"); na prática é "usa o primeiro que não for zero", e zero é um valor legítimo em dinheiro, não ausência de dado.

**Três ocorrências até agora, sempre com dias entre o defeito e a descoberta:**

1. **CXSE3 (23/07/2026)** — `saveInv` na edição preservava um `valorInvestido` velho; o card dividia o ganho por ele e mostrava +34,8% onde a conta dava 24,6%.
2. **Os 8 totais de patrimônio (11/08/2026)** — ao introduzir ativo encerrado, os totais "somavam zero" só porque todos os três campos estavam zerados. Bastaria um sobrar podre para o encerrado voltar ao patrimônio. Resolvido com filtro explícito pela flag (`soAtivos`), não pela zeragem.
3. **Rentabilidade com ativo encerrado (11/08/2026)** — um `valor:9999` esquecido virou **"rentabilidade R$ 11.299,00" numa carteira de R$ 1.300**. Passou 242 testes e o build; apareceu só na tela.

**Regras:**
- Para valor monetário, escolher a fonte por **condição explícita** (`x != null ? x : y`) ou por **flag de estado**, nunca por `||` encadeado.
- Estado (encerrado, inativo, arquivado) se testa pela **flag**, jamais inferindo de valores zerados.
- Quando um registro sai de circulação, ele contribui com **zero explícito**, não com "o que sobrou nos campos".

**Método que pegou o caso 3, e que os testes não pegaram: plantar um campo podre DE PROPÓSITO no seed.** Um fixture "limpo" (todos os campos coerentemente zerados) passa em tudo e não prova nada — ele testa o caminho feliz de um bug cuja essência é a incoerência entre campos. Ao verificar qualquer coisa que dependa de fallback, semear um valor absurdo (`9999`) no campo que deveria ser ignorado: se ele aparecer na tela, o fallback está errado.

## "Commitado ≠ no ar" — REGRA

**Nenhum relatório de trabalho concluído vale sem o artefato identificado.** Dizer "pronto", "commitado" ou "corrigido" sem nomear O QUE exatamente está onde é relatório vazio — e pior que vazio, porque autoriza um teste que não testa nada. O artefato é um destes três, explícito:

- **hash do bundle** publicado (`index-<hash>.js`), quando a afirmação é sobre o app no ar;
- **commit presente no remoto** (`git log origin/main`), quando é sobre código entregue — commit local **não** é entrega, `git commit` não dispara deploy nenhum;
- **número medido na tela**, quando é sobre comportamento.

Ao terminar qualquer trabalho, dizer também o que FALTA para ele chegar ao usuário. Se o passo seguinte é `git push`, dizer isso na mesma frase em que se diz "pronto".

Caso real (10/08/2026): a trava anti-base64 foi commitada em `89b1499` e reportada como "código pronto e commitado", com lista de arquivos. Os 3 commits nunca foram para o remoto. O Leo montou um teste de produção — anexar foto real, medir a aba Network — contra o bundle `index-022357da.js`, que era o build de `120773e`, anterior à trava e a todo o trabalho de FII. O teste "falhou" e não mediu nada sobre a trava; a Vercel tinha publicado corretamente o que existia no remoto. O diagnóstico da falsa falha custou uma rodada inteira. Confirmação barata que teria evitado tudo: `git log origin/main..HEAD` antes de anunciar, e comparar o hash do bundle esperado com o carregado.

## Fluxo de trabalho com o Leo

- Mostrar o diff e explicar o que mudou ANTES de commitar.
- Rodar testes do `calc.mjs` antes de qualquer commit que toque em lógica financeira.
- Mudanças pequenas e incrementais > reescritas grandes.
- Leo espera pensamento crítico: apontar riscos e alternativas, não apenas executar.
- Responder em português (brasileiro).
