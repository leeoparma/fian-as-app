// ============================================================================
// Testes da matemática do Controle Financeiro — rode: node --test tests/
// Cada teste fixa um comportamento: se uma edição futura mudar uma conta,
// o GitHub Actions marca ❌ no commit antes de você confiar no número.
// ============================================================================
import {test} from "node:test";
import assert from "node:assert/strict";
import {
  CAT_INTERNAS,_ymdC,faturaDeCompra,vencimentoDe,faturaAbertaHoje,totalPagoFatura,calcFaturaPagamentos,
  calcRFAnual,calcValorAtualRF,calcImpostoBR,calcImpostoAU,
  aporteMedio,totalProventoAgendado,diasAte,
  totaisTransacoes,saldoBanco,parcelaValor,parcelaData,
  calcSaldos,calcDividas,totaisPorPessoa,
  salarioMensal,converteMoeda,taxaMensalSim,simularJuros,
  semFotos,mesclarFotos,extraiFotosBase64,contemBase64,projetarFluxo,ocorrenciasRecorrencia,addDias,marcarDuplicatas,montarAgendaPush,compraAcao,vendaAcao,
  ocorrenciasSWAte,pendentesRecorrenciaSW,relatorioMensal,compararMeses,serieGastoAcumulado,extratoComSaldo,
rentabilidadeRF,serieRentabilidadeRF,composicaoAcoes,
rentabilidadeAcoesDesdeInicio,ganhoAcoesEntreSnapshots,rentabilidadeAcoes,isRFAtivo,calcValorLiquidoRF,
INDICES_RATE,
compoeFatorDiario,compoeFatorMensal,calcValorAtualRFHistorico,mesclarIPCAcomPrevia,compoeFatorMensalProRata,
posicaoRV,
grahamDefensivo,numeroGraham,precoTetoBazin,cagrLucro,checklistBuyAndHold,CHECKLIST_PADRAO,
tipoFii,metricasImovel,dyFii12m,tendenciaFii,filtraFii,FII_PADRAO,
serieRendimentosFii,resumoRendimentosFii,serieRecortada,coberturaFfoFii,
} from "../src/calc.mjs";

const aprox=(a,b,tol=0.01)=>assert.ok(Math.abs(a-b)<=tol,`esperado ~${b}, veio ${a}`);

// ── Cartão: ciclo de fatura ──────────────────────────────────────────────────
test("fatura: compra antes do fechamento entra na fatura do mês", ()=>{
  assert.equal(_ymdC(faturaDeCompra(15,"2026-03-10")),"2026-03-15");
});
test("fatura: compra NO DIA do fechamento entra naquela fatura", ()=>{
  assert.equal(_ymdC(faturaDeCompra(15,"2026-03-15")),"2026-03-15");
});
test("fatura: compra após o fechamento vai para a próxima", ()=>{
  assert.equal(_ymdC(faturaDeCompra(15,"2026-03-16")),"2026-04-15");
});
test("fatura: dezembro rola para janeiro do ano seguinte", ()=>{
  assert.equal(_ymdC(faturaDeCompra(15,"2026-12-20")),"2027-01-15");
});
test("fatura: dia 31 em fevereiro faz clamp para o último dia", ()=>{
  assert.equal(_ymdC(faturaDeCompra(31,"2026-02-10")),"2026-02-28");
});
test("vencimento: no mesmo mês quando diaVence >= diaFecha", ()=>{
  const fecha=faturaDeCompra(15,"2026-03-10");
  assert.equal(_ymdC(vencimentoDe(fecha,15,25)),"2026-03-25");
});
test("vencimento: mês seguinte quando diaVence < diaFecha", ()=>{
  const fecha=faturaDeCompra(15,"2026-03-10");
  assert.equal(_ymdC(vencimentoDe(fecha,15,5)),"2026-04-05");
});
test("vencimento: clamp de fim de mês (vence 31 após fecha 31/jan)", ()=>{
  const fecha=faturaDeCompra(31,"2026-01-10");
  assert.equal(_ymdC(vencimentoDe(fecha,31,31)),"2026-01-31");
});
test("fatura aberta hoje: antes do fechamento é a do mês", ()=>{
  assert.equal(_ymdC(faturaAbertaHoje(15,new Date(2026,6,2))),"2026-07-15");
});
test("fatura aberta hoje: depois do fechamento é a do mês seguinte", ()=>{
  assert.equal(_ymdC(faturaAbertaHoje(15,new Date(2026,6,20))),"2026-08-15");
});

// ── Cartão: pagamento de fatura ───────────────────────────────────────────────
test("pagamento de fatura: categoria é interna (não conta como receita/despesa real)", ()=>{
  assert.ok(CAT_INTERNAS.includes("Pagamento de fatura"));
});
test("totalPagoFatura: soma só receitas de pagamento daquele cartão", ()=>{
  const txs=[
    {tipo:"receita",categoria:"Pagamento de fatura",bancoId:"cartaoA",valor:200},
    {tipo:"receita",categoria:"Pagamento de fatura",bancoId:"cartaoA",valor:50},
    {tipo:"receita",categoria:"Pagamento de fatura",bancoId:"cartaoB",valor:999}, // outro cartão
    {tipo:"despesa",categoria:"Pagamento de fatura",bancoId:"cartaoA",valor:250}, // a perna de origem, não conta aqui
    {tipo:"receita",categoria:"Salário",bancoId:"cartaoA",valor:1000}, // receita normal, não é pagamento
  ];
  assert.equal(totalPagoFatura(txs,"cartaoA"),250);
});
test("cascata: pagamento quita só a fatura fechada mais antiga, resto fica intacto", ()=>{
  const faturas=[
    {k:"2026-05-15",total:300,status:"anterior"},
    {k:"2026-06-15",total:400,status:"anterior"},
    {k:"2026-07-15",total:500,status:"aberta"},
  ];
  const {porFatura,creditoDisponivel}=calcFaturaPagamentos(faturas,300);
  assert.equal(porFatura[0].pago,300); assert.equal(porFatura[0].restante,0);
  assert.equal(porFatura[1].pago,0); assert.equal(porFatura[1].restante,400);
  assert.equal(porFatura[2].pago,0); assert.equal(porFatura[2].restante,500);
  assert.equal(creditoDisponivel,0);
});
test("cascata: excedente da fatura anterior abate a aberta", ()=>{
  const faturas=[
    {k:"2026-06-15",total:300,status:"anterior"},
    {k:"2026-07-15",total:500,status:"aberta"},
  ];
  const {porFatura,creditoDisponivel}=calcFaturaPagamentos(faturas,450);
  assert.equal(porFatura[0].restante,0);
  assert.equal(porFatura[1].pago,150); assert.equal(porFatura[1].restante,350);
  assert.equal(creditoDisponivel,0);
});
test("cascata: pagamento maior que todas as faturas vira crédito para a próxima", ()=>{
  const faturas=[
    {k:"2026-06-15",total:300,status:"anterior"},
    {k:"2026-07-15",total:500,status:"aberta"},
  ];
  const {porFatura,creditoDisponivel}=calcFaturaPagamentos(faturas,1000);
  assert.equal(porFatura[0].restante,0);
  assert.equal(porFatura[1].restante,0);
  assert.equal(creditoDisponivel,200);
});
test("cascata: fatura futura nunca é abatida, mesmo sobrando saldo", ()=>{
  const faturas=[
    {k:"2026-07-15",total:500,status:"aberta"},
    {k:"2026-08-15",total:600,status:"futura"},
  ];
  const {porFatura,creditoDisponivel}=calcFaturaPagamentos(faturas,1000);
  assert.equal(porFatura[1].pago,0); assert.equal(porFatura[1].restante,600);
  assert.equal(creditoDisponivel,500); // 1000 - 500 da aberta, nada vai pra futura
});
test("cascata: sem nenhum pagamento, tudo fica em aberto e sem crédito", ()=>{
  const faturas=[{k:"2026-07-15",total:500,status:"aberta"}];
  const {porFatura,creditoDisponivel}=calcFaturaPagamentos(faturas,0);
  assert.equal(porFatura[0].pago,0); assert.equal(porFatura[0].restante,500);
  assert.equal(creditoDisponivel,0);
});
test("cascata: pagamento exato zera a fatura sem sobra", ()=>{
  const faturas=[{k:"2026-07-15",total:123.45,status:"aberta"}];
  const {porFatura,creditoDisponivel}=calcFaturaPagamentos(faturas,123.45);
  assert.equal(porFatura[0].restante,0);
  assert.equal(creditoDisponivel,0);
});

// ── Renda fixa e impostos ────────────────────────────────────────────────────
test("RF anual: prefixado devolve a própria taxa", ()=>{
  assert.equal(calcRFAnual({indice:"Prefixado",taxaRF:"12"}),12);
});
test("RF anual: 102% do CDI = 102% da taxa vigente (referencia INDICES_RATE, não hardcoded)", ()=>{
  aprox(calcRFAnual({indice:"CDI",rfTipo:"pct",pctIndice:"102"}),INDICES_RATE.CDI*1.02);
});
test("RF anual: IPCA + 9 = taxa vigente do IPCA + 9 (referencia INDICES_RATE)", ()=>{
  aprox(calcRFAnual({indice:"IPCA",rfTipo:"mais",taxaRF:"9"}),INDICES_RATE.IPCA+9);
});
test("RF valor atual: 1000 prefixado 10% após 1 ano ≈ 1100", ()=>{
  const agora=new Date(2027,0,1);
  const inv={indice:"Prefixado",taxaRF:"10",valorInvestido:1000,data:"2026-01-01"};
  aprox(calcValorAtualRF(inv,agora),1100,1.5); // tolerância: ano de 365d vs bissexto
});
test("RF valor atual: nunca rende para trás (data futura → valor investido)", ()=>{
  const inv={indice:"Prefixado",taxaRF:"10",valorInvestido:1000,data:"2030-01-01"};
  aprox(calcValorAtualRF(inv,new Date(2026,0,1)),1000);
});
test("imposto BR por prazo: 22.5/20/17.5/15% e zero sobre prejuízo", ()=>{
  aprox(calcImpostoBR(100,6),22.5);
  aprox(calcImpostoBR(100,12),20);
  aprox(calcImpostoBR(100,24),17.5);
  aprox(calcImpostoBR(100,36),15);
  assert.equal(calcImpostoBR(-50,12),0);
});
test("imposto AU: 32.5% cheio antes de 12m, metade tributável após", ()=>{
  aprox(calcImpostoAU(100,6),32.5);
  aprox(calcImpostoAU(100,12),16.25);
  assert.equal(calcImpostoAU(-50,12),0);
});

// ── Preço médio (aporte) ─────────────────────────────────────────────────────
test("preço médio: 10@10 + 10@20 = 20 unidades a 15", ()=>{
  const r=aporteMedio(10,10,10,20);
  assert.equal(r.qtdTotal,20);aprox(r.pmNovo,15);aprox(r.custoTotal,300);
});
test("preço médio: posição zerada assume o preço do aporte", ()=>{
  const r=aporteMedio(0,0,5,42.5);
  assert.equal(r.qtdTotal,5);aprox(r.pmNovo,42.5);aprox(r.custoTotal,212.5);
});
test("preço médio: frações (ex.: cripto/ETF)", ()=>{
  const r=aporteMedio(0.5,100,0.25,160);
  aprox(r.qtdTotal,0.75);aprox(r.pmNovo,120);
});

// ── Proventos ────────────────────────────────────────────────────────────────
test("provento agendado: quantidade × valor/ação", ()=>{
  aprox(totalProventoAgendado({valorAcao:"0.80",quantidade:"125"}),100);
  assert.equal(totalProventoAgendado({valorAcao:"",quantidade:"10"}),0);
});
test("diasAte: hoje=0, amanhã=1, +30=30, passado=negativo, inválida=null", ()=>{
  const hoje=new Date(2026,6,2);
  assert.equal(diasAte("2026-07-02",hoje),0);
  assert.equal(diasAte("2026-07-03",hoje),1);
  assert.equal(diasAte("2026-08-01",hoje),30);
  assert.equal(diasAte("2026-07-01",hoje),-1);
  assert.equal(diasAte("",hoje),null);
});

// ── Totais com categorias internas ───────────────────────────────────────────
test("totais: Transferência/Aplicação/Resgate/Pagamento de fatura não inflam receita nem despesa", ()=>{
  const txs=[
    {tipo:"receita",valor:1000,categoria:"Salário"},
    {tipo:"despesa",valor:200,categoria:"Mercado"},
    {tipo:"despesa",valor:500,categoria:"Transferência"},
    {tipo:"receita",valor:500,categoria:"Transferência"},
    {tipo:"despesa",valor:300,categoria:"Aplicação"},
    {tipo:"receita",valor:150,categoria:"Resgate"},
    {tipo:"despesa",valor:400,categoria:"Pagamento de fatura"},
    {tipo:"receita",valor:400,categoria:"Pagamento de fatura"},
  ];
  const {receitas,despesas}=totaisTransacoes(txs);
  aprox(receitas,1000);aprox(despesas,200);
  assert.deepEqual(CAT_INTERNAS,["Transferência","Aplicação","Resgate","Pagamento de fatura"]);
});

// ── Saldo de banco ───────────────────────────────────────────────────────────
test("saldo banco: inicial + receitas − despesas, só do próprio banco", ()=>{
  const txs=[
    {bancoId:"a",tipo:"receita",valor:100},
    {bancoId:"a",tipo:"despesa",valor:30},
    {bancoId:"b",tipo:"despesa",valor:999},
  ];
  aprox(saldoBanco({id:"a",saldoInicial:50},txs),120);
  aprox(saldoBanco({id:"c",saldoInicial:10},txs),10);
});

// ── Parcelamento ─────────────────────────────────────────────────────────────
test("parcelas: 100 em 3 = 33.33+33.33+33.34 (fecha exato)", ()=>{
  aprox(parcelaValor(100,3,0),33.33);
  aprox(parcelaValor(100,3,1),33.33);
  aprox(parcelaValor(100,3,2),33.34);
  const soma=[0,1,2].reduce((s,k)=>s+parcelaValor(100,3,k),0);
  aprox(soma,100);
});
test("parcelas: soma sempre fecha o total (10 em 3)", ()=>{
  const soma=[0,1,2].reduce((s,k)=>s+parcelaValor(10,3,k),0);
  aprox(soma,10);
});
test("parcela data: preserva o dia mês a mês", ()=>{
  assert.equal(parcelaData("2026-01-15",0),"2026-01-15");
  assert.equal(parcelaData("2026-01-15",2),"2026-03-15");
});
test("parcela data: dia 31 faz clamp em fevereiro e vira o ano", ()=>{
  assert.equal(parcelaData("2026-01-31",1),"2026-02-28");
  assert.equal(parcelaData("2026-11-15",2),"2027-01-15");
});

// ── Splitwise ────────────────────────────────────────────────────────────────
const grupo={
  membros:[{nome:"Leo"},{nome:"Carol"}],
  despesas:[
    {pagoPor:"Leo",valor:100,divisao:[{nome:"Leo",valor:50},{nome:"Carol",valor:50}]},
    {pagoPor:"Carol",valor:40,divisao:[{nome:"Leo",valor:20},{nome:"Carol",valor:20}]},
  ],
  pagamentos:[],
};
test("splitwise saldos: quem pagou mais fica positivo", ()=>{
  const s=calcSaldos(grupo);
  aprox(s.Leo,30);aprox(s.Carol,-30);
});
test("splitwise dívidas: liquidação mínima Carol→Leo 30", ()=>{
  const d=calcDividas(grupo);
  assert.equal(d.length,1);
  assert.equal(d[0].de,"Carol");assert.equal(d[0].para,"Leo");aprox(d[0].valor,30);
});
test("splitwise: pagamento de acerto zera as dívidas", ()=>{
  const quitado={...grupo,pagamentos:[{de:"Carol",para:"Leo",valor:30}]};
  assert.equal(calcDividas(quitado).length,0);
});
test("splitwise: divisão em formato string divide por igual", ()=>{
  const g={membros:[{nome:"A"},{nome:"B"}],despesas:[{pagoPor:"A",valor:90,divisao:["A","B"]}],pagamentos:[]};
  const s=calcSaldos(g);
  aprox(s.A,45);aprox(s.B,-45);
});
test("splitwise totais: pagou vs consumiu por pessoa", ()=>{
  const t=totaisPorPessoa(grupo);
  aprox(t.Leo.pagou,100);aprox(t.Leo.consumiu,70);
  aprox(t.Carol.pagou,40);aprox(t.Carol.consumiu,70);
});
test("splitwise: grupo vazio não explode", ()=>{
  assert.deepEqual(calcSaldos(null),{});
  assert.deepEqual(calcDividas({membros:[],despesas:[],pagamentos:[]}),[]);
});

// ── Salário mensal ───────────────────────────────────────────────────────────
test("salário: semanal 1875 = 8125/mês (×52÷12, não ×4)", ()=>{
  aprox(salarioMensal(1875,"semanal"),8125);
});
test("salário: quinzenal ×26÷12, anual ÷12, mensal direto, inválido=0", ()=>{
  aprox(salarioMensal(1000,"quinzenal"),2166.67);
  aprox(salarioMensal(120000,"anual"),10000);
  aprox(salarioMensal(5000,"mensal"),5000);
  assert.equal(salarioMensal(0,"semanal"),0);
  assert.equal(salarioMensal(null,"mensal"),0);
});

// ── Câmbio ───────────────────────────────────────────────────────────────────
const cambio={brl:1,aud:3.7,usd:5.4}; // 1 AUD = 3.7 BRL, 1 USD = 5.4 BRL
test("câmbio: perfil AU para BRL multiplica pela taxa", ()=>{
  aprox(converteMoeda(100,"au","BRL",cambio),370);
});
test("câmbio: BRL para AUD divide pela taxa", ()=>{
  aprox(converteMoeda(370,"br","AUD",cambio),100);
});
test("câmbio: au→USD passa por BRL (100×3.7÷5.4)", ()=>{
  aprox(converteMoeda(100,"au","USD",cambio),68.52,0.01);
});
test("câmbio: sem tabela devolve null (não inventa número)", ()=>{
  assert.equal(converteMoeda(100,"au","BRL",null),null);
});

// ── Simulador de juros compostos ─────────────────────────────────────────────
test("simulador: sem aportes, 1%/mês por 12m = ini×1.01^12", ()=>{
  const r=simularJuros(1000,0,12,0.01);
  aprox(r.saldo,1000*Math.pow(1.01,12),0.01);
});
test("simulador: taxa zero acumula só os aportes", ()=>{
  const r=simularJuros(0,100,10,0);
  aprox(r.saldo,1000);aprox(r.rendimento,0);aprox(r.aportado,1000);
});
test("simulador: último ponto do gráfico é o mês final", ()=>{
  const r=simularJuros(500,50,24,0.005);
  assert.equal(r.pts[r.pts.length-1].mes,24);
  assert.equal(r.pts[0].mes,0);
});
test("taxa mensal: fixa 1% → 0.01; 102% CDI vira taxa mensal equivalente", ()=>{
  aprox(taxaMensalSim("fixo","1"),0.01);
  aprox(taxaMensalSim("pct",null,"CDI","102"),Math.pow(1+(INDICES_RATE.CDI*1.02)/100,1/12)-1,0.0001);
});

// ── Backup: fotos fora do snapshot, de volta ao restaurar ────────────────────
const dadosComFoto={br:{transacoes:[{id:"t1",valor:50,nfImg:"data:image/jpeg;base64,AAAA"},{id:"t2",valor:30}],bancos:[{id:"b1"}]},au:{transacoes:[]}};
test("backup semFotos: remove nfImg mas preserva valores e estrutura", ()=>{
  const s=semFotos(dadosComFoto);
  assert.equal(s.br.transacoes[0].nfImg,null);
  assert.equal(s.br.transacoes[0].valor,50);
  assert.equal(s.br.bancos.length,1);
  // não muta o original
  assert.equal(dadosComFoto.br.transacoes[0].nfImg,"data:image/jpeg;base64,AAAA");
});
test("backup mesclarFotos: devolve a foto pela transação (id) ao restaurar", ()=>{
  const restaurado=mesclarFotos(semFotos(dadosComFoto),dadosComFoto);
  assert.equal(restaurado.br.transacoes[0].nfImg,"data:image/jpeg;base64,AAAA");
  assert.equal(restaurado.br.transacoes[1].nfImg,undefined);
});
test("backup: transação que só existe no backup fica sem foto (sem inventar)", ()=>{
  const backup={br:{transacoes:[{id:"tX",valor:10,nfImg:null}]}};
  const r=mesclarFotos(backup,dadosComFoto);
  assert.equal(r.br.transacoes[0].nfImg,null);
});
test("mesclarFotos: prefere nfPath (Storage) e não ressuscita base64 por cima", ()=>{
  const atual={br:{transacoes:[{id:"t1",valor:50,nfPath:"u/t1.jpg"}]}};
  const r=mesclarFotos({br:{transacoes:[{id:"t1",valor:50}]}},atual);
  assert.equal(r.br.transacoes[0].nfPath,"u/t1.jpg");
  assert.equal(r.br.transacoes[0].nfImg,undefined);   // referência, nunca imagem
});

// ── Trava anti-base64 (incidente de 2,82MB, 29/06-11/07/2026) ────────────────
test("extraiFotosBase64: tira o data-URL do payload e DEVOLVE a foto", ()=>{
  const {limpo,fotos}=extraiFotosBase64(dadosComFoto);
  // a foto sai do payload…
  assert.equal(limpo.br.transacoes[0].nfImg,null);
  assert.equal(contemBase64(limpo),false);
  // …mas NÃO é jogada fora: quem chama precisa dela para enfileirar antes de gravar.
  // Limpar sem devolver seria perder a nota fiscal do usuário em silêncio.
  assert.equal(fotos.length,1);
  assert.deepEqual({...fotos[0]},{perfil:"br",txId:"t1",dataUrl:"data:image/jpeg;base64,AAAA"});
  assert.equal(limpo.br.transacoes[0].nfPendente,true); // a tela mostra "aguardando envio"
  assert.equal(limpo.br.transacoes[0].valor,50);        // resto intacto
  assert.equal(dadosComFoto.br.transacoes[0].nfImg,"data:image/jpeg;base64,AAAA"); // não muta
});
test("extraiFotosBase64: nfPath e null passam intocados — só data: sai", ()=>{
  const all={br:{transacoes:[
    {id:"a",nfPath:"u/a.jpg"},          // já migrada
    {id:"b",nfImg:null},                // os 161 campos legados de hoje
    {id:"c"},                           // sem campo nenhum
    {id:"d",nfImg:"https://x/y.jpg"},   // URL, não base64
  ]}};
  const {limpo,fotos}=extraiFotosBase64(all);
  assert.equal(fotos.length,0);
  assert.equal(limpo.br,all.br);        // sem mudança = mesma referência, sem cópia inútil
  assert.equal(limpo.br.transacoes[0].nfPath,"u/a.jpg");
  assert.equal(limpo.br.transacoes[3].nfImg,"https://x/y.jpg");
});
test("extraiFotosBase64: pega foto em QUALQUER perfil, não só no primeiro", ()=>{
  const all={br:{transacoes:[{id:"x"}]},au:{transacoes:[{id:"y",nfImg:"data:image/png;base64,BBBB"}]}};
  const {limpo,fotos}=extraiFotosBase64(all);
  assert.equal(fotos.length,1);
  assert.equal(fotos[0].perfil,"au");
  assert.equal(contemBase64(limpo),false);
});
test("extraiFotosBase64: sobrevive a perfil corrompido sem derrubar o save", ()=>{
  // um save que joga exceção deixa o dado só no aparelho — a trava não pode ser
  // o motivo de a nuvem parar de receber.
  const {limpo,fotos}=extraiFotosBase64({br:null,au:"lixo",us:[1,2],ok:{transacoes:[{id:"z",nfImg:"data:image/jpeg;base64,CCCC"}]}});
  assert.equal(fotos.length,1);
  assert.equal(limpo.br,null);
  assert.equal(limpo.au,"lixo");
  assert.equal(contemBase64(limpo),false);
});
test("contemBase64: detecta o que a trava tem que barrar", ()=>{
  assert.equal(contemBase64(dadosComFoto),true);
  assert.equal(contemBase64({br:{transacoes:[{id:"a",nfPath:"u/a.jpg"}]}}),false);
  assert.equal(contemBase64({}),false);
  assert.equal(contemBase64(null),false);
});

// ── Projeção de fluxo de caixa ───────────────────────────────────────────────
test("projeção: sem eventos o saldo fica constante", ()=>{
  const p=projetarFluxo({saldoHoje:1000,hojeStr:"2026-07-04",dias:90});
  aprox(p.d90,1000);aprox(p.minimo.saldo,1000);
});
test("projeção: tx futura entra na data; passada e além do horizonte não", ()=>{
  const txs=[
    {tipo:"despesa",valor:100,data:"2026-07-14"},   // +10d
    {tipo:"despesa",valor:999,data:"2026-07-01"},   // passado
    {tipo:"despesa",valor:999,data:"2026-12-01"},   // além de 90d
  ];
  const p=projetarFluxo({saldoHoje:1000,hojeStr:"2026-07-04",dias:90,txs});
  aprox(p.d30,900);aprox(p.d90,900);
});
test("projeção: recorrência mensal ocorre ~3x em 90 dias", ()=>{
  const p=projetarFluxo({saldoHoje:0,hojeStr:"2026-07-04",dias:90,recorrencias:[{id:"r1",tipo:"despesa",valor:100,frequencia:"mensal",dia:10}]});
  aprox(p.d90,-300);
});
test("projeção: recorrência já lançada naquela data não conta 2x", ()=>{
  const txs=[{tipo:"despesa",valor:100,data:"2026-07-10",recorrenciaId:"r1"}];
  const p=projetarFluxo({saldoHoje:0,hojeStr:"2026-07-04",dias:90,txs,recorrencias:[{id:"r1",tipo:"despesa",valor:100,frequencia:"mensal",dia:10}]});
  aprox(p.d90,-300); // 1 lançada + 2 projetadas (ago, set) — não 4
});
test("projeção: salário distribui o mensal por dia (×12÷365)", ()=>{
  const p=projetarFluxo({saldoHoje:0,hojeStr:"2026-07-04",dias:30,salarioMes:3650});
  aprox(p.d30,3650*12/365*30,0.01);
});
test("projeção: detecta o vale (mínimo) mesmo com recuperação depois", ()=>{
  const txs=[{tipo:"despesa",valor:500,data:"2026-07-10"},{tipo:"receita",valor:800,data:"2026-07-20"}];
  const p=projetarFluxo({saldoHoje:100,hojeStr:"2026-07-04",dias:90,txs});
  aprox(p.minimo.saldo,-400);assert.equal(p.minimo.data,"2026-07-10");aprox(p.d90,400);
});
test("recorrência semanal: ~13 ocorrências em 90 dias", ()=>{
  const oc=ocorrenciasRecorrencia({frequencia:"semanal",diaSemana:5},"2026-07-04",90);
  assert.ok(oc.length===12||oc.length===13,`veio ${oc.length}`);
});
test("recorrência mensal dia 31: clampa fevereiro", ()=>{
  const oc=ocorrenciasRecorrencia({frequencia:"mensal",dia:31},"2026-01-15",60);
  assert.ok(oc.includes("2026-01-31")&&oc.includes("2026-02-28"),oc.join(","));
});

// ── Importação: duplicatas ───────────────────────────────────────────────────
test("import: duplicata exata (data+valor+tipo, mesmo banco) é marcada", ()=>{
  const r=marcarDuplicatas([{data:"2026-07-01",tipo:"despesa",valor:45.27}],[{data:"2026-07-01",tipo:"despesa",valor:45.27,bancoId:"b1"}],"b1");
  assert.equal(r[0].dup,true);
});
test("import: mesmo dia/valor mas tipo diferente NÃO é duplicata", ()=>{
  const r=marcarDuplicatas([{data:"2026-07-01",tipo:"receita",valor:45.27}],[{data:"2026-07-01",tipo:"despesa",valor:45.27,bancoId:"b1"}],"b1");
  assert.equal(r[0].dup,false);
});
test("import: consumo por contagem — 2 pedágios iguais, 1 já lançado → 1 dup + 1 novo", ()=>{
  const cands=[{data:"2026-07-01",tipo:"despesa",valor:8.9},{data:"2026-07-01",tipo:"despesa",valor:8.9}];
  const r=marcarDuplicatas(cands,[{data:"2026-07-01",tipo:"despesa",valor:8.9,bancoId:"b1"}],"b1");
  assert.deepEqual(r.map(x=>x.dup).sort(),[false,true]);
});
test("import: lançamento igual em OUTRO banco não bloqueia", ()=>{
  const r=marcarDuplicatas([{data:"2026-07-01",tipo:"despesa",valor:45.27}],[{data:"2026-07-01",tipo:"despesa",valor:45.27,bancoId:"mastercard"}],"commbank");
  assert.equal(r[0].dup,false);
});
test("import: lançamento manual SEM banco conta como duplicata (conservador)", ()=>{
  const r=marcarDuplicatas([{data:"2026-07-01",tipo:"despesa",valor:45.27}],[{data:"2026-07-01",tipo:"despesa",valor:45.27,bancoId:null}],"commbank");
  assert.equal(r[0].dup,true);
});
test("import: centavos — 45.271 e 45.27 casam (arredonda a centavo)", ()=>{
  const r=marcarDuplicatas([{data:"2026-07-01",tipo:"despesa",valor:45.271}],[{data:"2026-07-01",tipo:"despesa",valor:45.27,bancoId:"b1"}],"b1");
  assert.equal(r[0].dup,true);
});

// ── Push: agenda de avisos ───────────────────────────────────────────────────
test("agenda push: provento hoje e em 5 dias entram; em 20 dias não (janela 7)", ()=>{
  const ev=montarAgendaPush({hojeStr:"2026-07-04",proventosAgendados:[
    {ticker:"ITUB4",dataPagamento:"2026-07-04"},
    {ticker:"NAB",dataPagamento:"2026-07-09"},
    {ticker:"BBAS3",dataPagamento:"2026-07-24"},
  ]});
  assert.deepEqual(ev.map(e=>e.notify_on),["2026-07-04","2026-07-09"]);
  assert.ok(ev[0].titulo.includes("ITUB4"));
});
test("agenda push: recorrência de DESPESA na janela entra; RECEITA não notifica", ()=>{
  const ev=montarAgendaPush({hojeStr:"2026-07-04",recorrencias:[
    {id:"r1",tipo:"despesa",descricao:"Aluguel",frequencia:"mensal",dia:8},
    {id:"r2",tipo:"receita",descricao:"Salário",frequencia:"mensal",dia:8},
  ]});
  assert.equal(ev.length,1);
  assert.equal(ev[0].notify_on,"2026-07-08");
  assert.ok(ev[0].titulo.includes("Aluguel"));
});
test("agenda push: ordena por data (provento + recorrente misturados)", ()=>{
  const ev=montarAgendaPush({hojeStr:"2026-07-04",
    proventosAgendados:[{ticker:"X",dataPagamento:"2026-07-10"}],
    recorrencias:[{id:"r1",tipo:"despesa",descricao:"Luz",frequencia:"mensal",dia:6}]});
  assert.deepEqual(ev.map(e=>e.notify_on),["2026-07-06","2026-07-10"]);
});

// ── Compra/venda com corretagem (números REAIS das notas de 08/07/2026) ─────
// Convenção da corretora: PM = média de EXECUÇÃO; corretagem vira despesa à parte.
test("compra real (NAB): PM fica $39,585 (igual à corretora); $359,27 saem da conta", ()=>{
  const r=compraAcao(0,0,9,39.585,3);
  aprox(r.pmNovo,39.585,0.0001);   // corretagem NÃO entra no PM
  aprox(r.investido,356.27,0.01);  // vai para a posição (Aplicação)
  aprox(r.totalPago,359.27,0.01);  // débito real na conta
});
test("aporte real (NAB): 15@37,89 + 9@39,585 → PM $38,53 (média de execução)", ()=>{
  const r=compraAcao(15,37.890,9,39.585,3);
  aprox(r.qtdTotal,24);
  aprox(r.pmNovo,(15*37.890+9*39.585)/24,0.0001);
});
test("venda real (BRE): bruto $388,55 vira Resgate; líquido $385,55 entra na conta", ()=>{
  const r=vendaAcao(95,4.30,95,4.09,3);
  aprox(r.recebidoBruto,388.55);
  aprox(r.recebidoLiquido,385.55);
  assert.equal(r.vendeuTudo,true);
  aprox(r.resultado,388.55-95*4.30); // resultado de execução vs PM
});
test("venda parcial: PM inalterado, quantidade cai, resultado certo", ()=>{
  const r=vendaAcao(20,10,5,12,1);
  aprox(r.qtdRestante,15);aprox(r.recebidoBruto,60);aprox(r.recebidoLiquido,59);aprox(r.resultado,10);
  assert.equal(r.vendeuTudo,false);
});
test("compra sem corretagem = preço médio clássico (compatível com aporteMedio)", ()=>{
  const a=compraAcao(10,10,10,20,0),b=aporteMedio(10,10,10,20);
  aprox(a.pmNovo,b.pmNovo);aprox(a.custoTotal,b.custoTotal);
});
test("venda maior que a posição: vende só o que existe", ()=>{
  const r=vendaAcao(5,10,99,10,0);
  aprox(r.qtdRestante,0);aprox(r.recebidoBruto,50);
});

// ── Posição de renda variável: uma fonte da verdade pro card ─────────────────
// Bug real, 23/07/2026 (CXSE3): o card mostrava +34,8% quando os próprios
// números do card davam 24,6%. O ganho em R$ usava qtd×PM (certo), mas a %
// dividia pelo campo GRAVADO valorInvestido — que ficava podre depois de uma
// edição manual (saveInv preservava o valorInvestido antigo ao editar ação).
// posicaoRV ignora valorInvestido de propósito: custo de RV é SEMPRE qtd×PM.
test("posicaoRV: reproduz o card do CXSE3 — % correta mesmo com valorInvestido podre", ()=>{
  const inv={quantidade:140,precoMedio:17.99,valorAtual:3138.80,valorInvestido:1782.18};
  // Sanidade do diagnóstico: o cálculo ANTIGO (lucro ÷ valorInvestido gravado)
  // dava exatamente os 34,8% da tela — confirma a engenharia reversa.
  const lucro=3138.80-140*17.99;
  aprox(lucro/inv.valorInvestido*100,34.8,0.05);
  // Comportamento correto: denominador é qtd×PM, sempre.
  const P=posicaoRV(inv);
  aprox(P.custo,2518.60);
  aprox(P.atual,3138.80);
  aprox(P.lucro,620.20);
  aprox(P.pct,24.6,0.05);
});
test("posicaoRV: os outros 4 ativos reais continuam com a % de hoje (regressão)", ()=>{
  aprox(posicaoRV({quantidade:385,precoMedio:20.00,valorAtual:385*21.09}).pct,5.45,0.05); // BBAS3
  aprox(posicaoRV({quantidade:15,precoMedio:6.88,valorAtual:15*5.38}).pct,-21.8,0.05);    // CSNA3
  aprox(posicaoRV({quantidade:57,precoMedio:40.39,valorAtual:57*42.90}).pct,6.2,0.05);    // ITUB4
  aprox(posicaoRV({quantidade:300,precoMedio:14.70,valorAtual:300*14.95}).pct,1.7,0.05);  // CPLE3
});
test("posicaoRV: sem valorAtual (preço nunca buscado), atual=custo e ganho zero", ()=>{
  const P=posicaoRV({quantidade:10,precoMedio:5});
  aprox(P.custo,50);aprox(P.atual,50);aprox(P.lucro,0);aprox(P.pct,0);
});
test("posicaoRV: ativo legado sem PM (tipo 'Outros' só com valor) usa o fallback antigo", ()=>{
  const P=posicaoRV({quantidade:1,precoMedio:0,valorInvestido:5000,valorAtual:5300});
  aprox(P.custo,5000);aprox(P.lucro,300);aprox(P.pct,6,0.01);
});
test("posicaoRV: quantidade/PM zerados e sem valorInvestido não dividem por zero", ()=>{
  const P=posicaoRV({quantidade:0,precoMedio:0,valorAtual:100});
  aprox(P.custo,0);aprox(P.pct,0);
});

// ── Splitwise recorrente ─────────────────────────────────────────────────────
test("recorrência SW semanal: do início até hoje, de 7 em 7", ()=>{
  const d=ocorrenciasSWAte("2026-07-01","semanal","2026-07-22");
  assert.deepEqual(d,["2026-07-01","2026-07-08","2026-07-15","2026-07-22"]);
});
test("recorrência SW quinzenal: de 14 em 14 dias", ()=>{
  const d=ocorrenciasSWAte("2026-07-01","quinzenal","2026-08-01");
  assert.deepEqual(d,["2026-07-01","2026-07-15","2026-07-29"]);
});
test("recorrência SW mensal: mesmo dia, vira o ano", ()=>{
  const d=ocorrenciasSWAte("2026-11-05","mensal","2027-01-10");
  assert.deepEqual(d,["2026-11-05","2026-12-05","2027-01-05"]);
});
test("recorrência SW mensal dia 31: clampa fevereiro (não pula o mês)", ()=>{
  const d=ocorrenciasSWAte("2026-01-31","mensal","2026-03-31");
  assert.deepEqual(d,["2026-01-31","2026-02-28","2026-03-31"]);
});
test("recorrência SW: início no futuro não gera nada", ()=>{
  assert.deepEqual(ocorrenciasSWAte("2026-08-01","mensal","2026-07-09"),[]);
});
test("pendentes: pula as já lançadas (anti-duplicata) e respeita pausada", ()=>{
  const rec={id:"r1",inicio:"2026-07-01",frequencia:"semanal"};
  const feitas=new Set(["r1|2026-07-01","r1|2026-07-08"]);
  assert.deepEqual(pendentesRecorrenciaSW(rec,"2026-07-15",feitas),["2026-07-15"]);
  assert.deepEqual(pendentesRecorrenciaSW({...rec,pausada:true},"2026-07-15",new Set()),[]);
});
test("pendentes: sem nada lançado devolve todas as vencidas", ()=>{
  const rec={id:"r2",inicio:"2026-06-10",frequencia:"mensal"};
  assert.deepEqual(pendentesRecorrenciaSW(rec,"2026-08-09",new Set()),["2026-06-10","2026-07-10"]);
});

// ── Recorrência dos Lançamentos: primeira parcela (inicio) ───────────────────
test("recorrência com início futuro: nada projetado antes da primeira parcela", ()=>{
  const oc=ocorrenciasRecorrencia({frequencia:"mensal",inicio:"2026-08-15"},"2026-07-09",90);
  assert.deepEqual(oc,["2026-08-15","2026-09-15"]);
});
test("recorrência quinzenal com âncora: exata de 14 em 14 a partir do início", ()=>{
  const oc=ocorrenciasRecorrencia({frequencia:"quinzenal",inicio:"2026-07-10"},"2026-07-09",30);
  assert.deepEqual(oc,["2026-07-10","2026-07-24","2026-08-07"]);
});
test("recorrência semanal com âncora: mantém o dia da semana do início", ()=>{
  const oc=ocorrenciasRecorrencia({frequencia:"semanal",inicio:"2026-07-06"},"2026-07-09",14);
  assert.deepEqual(oc,["2026-07-13","2026-07-20"]); // segundas
});
test("recorrência SEM início (legado): comportamento antigo preservado", ()=>{
  const oc=ocorrenciasRecorrencia({frequencia:"mensal",dia:10},"2026-07-04",90);
  assert.ok(oc.includes("2026-07-10")&&oc.includes("2026-08-10"));
});

// ── Relatório mensal ─────────────────────────────────────────────────────────
const txsJun=[
  {tipo:"receita",valor:8000,categoria:"Salário",data:"2026-06-05"},
  {tipo:"despesa",valor:1600,categoria:"Moradia",descricao:"Aluguel",data:"2026-06-01"},
  {tipo:"despesa",valor:400,categoria:"Mercado",descricao:"Woolworths",data:"2026-06-10"},
  {tipo:"despesa",valor:300,categoria:"Mercado",descricao:"Coles",data:"2026-06-20"},
  {tipo:"despesa",valor:500,categoria:"Transferência",descricao:"interna",data:"2026-06-15"},
  {tipo:"despesa",valor:999,categoria:"Mercado",descricao:"fora do mês",data:"2026-07-02"},
];
test("relatório: totais do mês certos (internas e outros meses fora)", ()=>{
  const R=relatorioMensal({mesKey:"2026-06",transacoes:txsJun});
  aprox(R.receitas,8000);aprox(R.despesas,2300);aprox(R.saldoMes,5700);
});
test("relatório: top categorias ordenado com percentual", ()=>{
  const R=relatorioMensal({mesKey:"2026-06",transacoes:txsJun});
  assert.equal(R.topCategorias[0].categoria,"Moradia");
  aprox(R.topCategorias[1].total,700); // Mercado somado
  aprox(R.topCategorias[0].pct,1600/2300*100,0.01);
  assert.equal(R.topLancamentos[0].descricao,"Aluguel");
});
test("relatório RF: rendimento do mês + acumulado (prefixado, determinístico)", ()=>{
  const inv={tipo:"Renda Fixa",indice:"Prefixado",taxaRF:"12",valorInvestido:10000,data:"2026-01-01",descricao:"CDB"};
  const R=relatorioMensal({mesKey:"2026-06",transacoes:[],investimentos:[inv]});
  const vIni=calcValorAtualRF(inv,new Date(2026,4,31)), vFim=calcValorAtualRF(inv,new Date(2026,5,30));
  aprox(R.rf[0].rendMes,vFim-vIni,0.01);
  aprox(R.rf[0].acumulado,vFim-10000,0.01);
  assert.ok(R.rf[0].rendMes>90&&R.rf[0].rendMes<105); // ~12%a.a. ≈ ~0,95%/mês
});
test("relatório ações: ganho do mês desconta aporte e soma venda", ()=>{
  const inv={id:"a1",ticker:"NAB",aportes:[{data:"2026-06-10",quantidade:5,preco:40}],vendas:[{data:"2026-06-20",quantidade:2,preco:42}]};
  const R=relatorioMensal({mesKey:"2026-06",investimentos:[inv],
    snapIni:[{id:"a1",ticker:"NAB",quantidade:20,valorAtual:800}],
    snapFim:[{id:"a1",ticker:"NAB",quantidade:23,valorAtual:966}]});
  // 966 − 800 − 200(aporte) + 84(venda) = 50 de valorização real
  aprox(R.acoes[0].ganho,50);
  assert.equal(R.temBaseAcoes,true);
});
test("relatório ações: ativo novo no mês fica sem base (ganho null)", ()=>{
  const R=relatorioMensal({mesKey:"2026-06",investimentos:[],snapIni:[],snapFim:[{id:"n1",ticker:"BHP",quantidade:10,valorAtual:400}]});
  assert.equal(R.acoes[0].ganho,null);
  assert.equal(R.acoes[0].novo,true);
});
test("relatório: sem snapshots, seção de ações fica vazia e sinalizada", ()=>{
  const R=relatorioMensal({mesKey:"2026-06",transacoes:txsJun});
  assert.equal(R.temBaseAcoes,false);
  assert.equal(R.acoes.length,0);
});
test("agenda push: dia 1 do próximo mês entra na janela com o relatório", ()=>{
  const ev=montarAgendaPush({hojeStr:"2026-07-28",dias:7});
  assert.ok(ev.some(e=>e.notify_on==="2026-08-01"&&e.titulo.includes("📊")));
});
test("agenda push: no próprio dia 1 o aviso do relatório sai hoje", ()=>{
  const ev=montarAgendaPush({hojeStr:"2026-08-01",dias:7});
  assert.ok(ev.some(e=>e.notify_on==="2026-08-01"&&e.titulo.includes("📊")));
});

// ── Relatório v2: fixos/variáveis, poupança e comparação mensal ─────────────
test("relatório v2: fixos (recorrentes) vs variáveis e taxa de poupança", ()=>{
  const txs=[
    {tipo:"receita",valor:8000,categoria:"Salário",data:"2026-06-05"},
    {tipo:"despesa",valor:1600,categoria:"Moradia",data:"2026-06-01",recorrenciaId:"r1"},
    {tipo:"despesa",valor:700,categoria:"Mercado",data:"2026-06-10"},
  ];
  const R=relatorioMensal({mesKey:"2026-06",transacoes:txs});
  aprox(R.fixos,1600);aprox(R.variaveis,700);
  aprox(R.poupancaPct,(8000-2300)/8000*100,0.01);
});
test("relatório v2: sem receita, poupança é null (não divide por zero)", ()=>{
  const R=relatorioMensal({mesKey:"2026-06",transacoes:[{tipo:"despesa",valor:100,categoria:"X",data:"2026-06-01"}]});
  assert.equal(R.poupancaPct,null);
});
test("comparação mensal: deltas e percentuais certos", ()=>{
  const jun=relatorioMensal({mesKey:"2026-06",transacoes:[
    {tipo:"receita",valor:8000,categoria:"Salário",data:"2026-06-05"},
    {tipo:"despesa",valor:2000,categoria:"Mercado",data:"2026-06-10"}]});
  const jul=relatorioMensal({mesKey:"2026-07",transacoes:[
    {tipo:"receita",valor:8800,categoria:"Salário",data:"2026-07-05"},
    {tipo:"despesa",valor:1500,categoria:"Mercado",data:"2026-07-10"}]});
  const c=compararMeses(jul,jun);
  assert.equal(c.temBase,true);
  aprox(c.receitas.delta,800);aprox(c.receitas.pct,10);
  aprox(c.despesas.delta,-500);aprox(c.despesas.pct,-25);
  aprox(c.categorias["Mercado"].pct,-25);
});
test("comparação mensal: categoria nova no mês fica sem percentual (pct null)", ()=>{
  const ant=relatorioMensal({mesKey:"2026-06",transacoes:[{tipo:"despesa",valor:100,categoria:"A",data:"2026-06-01"}]});
  const atu=relatorioMensal({mesKey:"2026-07",transacoes:[{tipo:"despesa",valor:50,categoria:"NOVA",data:"2026-07-01"}]});
  const c=compararMeses(atu,ant);
  assert.equal(c.categorias["NOVA"].pct,null);
  aprox(c.categorias["NOVA"].delta,50);
});
test("comparação mensal: sem mês anterior, temBase é false e deltas contra zero", ()=>{
  const atu=relatorioMensal({mesKey:"2026-07",transacoes:[{tipo:"receita",valor:100,categoria:"S",data:"2026-07-01"}]});
  const c=compararMeses(atu,null);
  assert.equal(c.temBase,false);
  aprox(c.receitas.delta,100);
  assert.equal(c.receitas.pct,null);
});

// ── Curva de gasto acumulado ─────────────────────────────────────────────────
test("gasto acumulado: soma dia a dia, ignora internas, fecha no total do mês", ()=>{
  const txs=[
    {tipo:"despesa",valor:100,categoria:"Mercado",data:"2026-06-05"},
    {tipo:"despesa",valor:50,categoria:"Lazer",data:"2026-06-05"},
    {tipo:"despesa",valor:200,categoria:"Moradia",data:"2026-06-20"},
    {tipo:"despesa",valor:999,categoria:"Aplicação",data:"2026-06-10"},
    {tipo:"receita",valor:5000,categoria:"Salário",data:"2026-06-01"},
  ];
  const s=serieGastoAcumulado(txs,"2026-06");
  assert.equal(s.length,30);              // junho tem 30 dias
  aprox(s[3].acumulado,0);                // dia 4: nada ainda
  aprox(s[4].acumulado,150);              // dia 5: 100+50
  aprox(s[18].acumulado,150);             // dia 19: inalterado
  aprox(s[29].acumulado,350);             // fim do mês = total (sem a interna)
});
test("gasto acumulado: fevereiro tem 28 pontos e mês vazio é linha zero", ()=>{
  const s=serieGastoAcumulado([],"2026-02");
  assert.equal(s.length,28);
  aprox(s[27].acumulado,0);
});

// ── Extrato com saldo corrente ───────────────────────────────────────────────
test("extrato: saldo linha a linha; a linha mais recente fecha com saldoBancoCalc", ()=>{
  const banco={id:"b1",nome:"NAB",saldoInicial:1000};
  const txs=[
    {id:"t1",tipo:"despesa",valor:200,bancoId:"b1",data:"2026-07-05",descricao:"Mercado"},
    {id:"t2",tipo:"receita",valor:3000,bancoId:"b1",data:"2026-07-01",descricao:"Salário"},
    {id:"t3",tipo:"despesa",valor:50,bancoId:"b1",data:"2026-07-05",descricao:"Uber"},
    {id:"t4",tipo:"despesa",valor:999,bancoId:"OUTRO",data:"2026-07-03"},
  ];
  const ex=extratoComSaldo(banco,txs);
  assert.equal(ex.length,3);                    // ignora o de outro banco
  assert.equal(ex[2].id,"t2");aprox(ex[2].saldoApos,4000);   // 01/07: 1000+3000
  assert.equal(ex[1].id,"t1");aprox(ex[1].saldoApos,3800);   // 05/07 (1º criado)
  assert.equal(ex[0].id,"t3");aprox(ex[0].saldoApos,3750);   // 05/07 (2º criado)
  aprox(ex[0].saldoApos,saldoBanco(banco,txs));              // invariante fecha
});
test("extrato: banco sem movimentações devolve lista vazia", ()=>{
  assert.deepEqual(extratoComSaldo({id:"bx",saldoInicial:10},[]),[]);
});

// ── Rentabilidade RF (dia/mês/ano/início) e curva de rentabilidade ───────────
test("rentabilidadeRF: prefixado simples cresce nos 4 recortes, todos coerentes", ()=>{
  const inv={indice:"Prefixado",taxaRF:"12",valorInvestido:10000,data:"2025-01-01"};
  const hoje=new Date(2026,6,14); // 14/07/2026
  const R=rentabilidadeRF([inv],hoje);
  assert.ok(R.valorTotal>10000);
  assert.ok(R.dia.pct>0&&R.dia.pct<1);           // rendimento de 1 dia é pequeno
  assert.ok(R.mes.pct>R.dia.pct);                 // mês acumula mais que 1 dia
  assert.ok(R.ano.pct>R.mes.pct);                 // ano acumula mais que o mês
  assert.ok(R.desdeInicio.pct>R.ano.pct);         // desde o início é o maior de todos
});
test("rentabilidadeRF: sem investimentos RF, tudo zerado e sem erro", ()=>{
  const R=rentabilidadeRF([],new Date(2026,6,14));
  aprox(R.valorTotal,0);assert.equal(R.desdeInicio.pct,null);
});
test("serieRentabilidadeRF: primeiro ponto é sempre 0% (é a própria baseline)", ()=>{
  const inv={indice:"Prefixado",taxaRF:"12",valorInvestido:10000,data:"2026-01-01"};
  const s=serieRentabilidadeRF([inv],new Date(2026,5,30),new Date(2026,6,10));
  assert.equal(s[0].pct,0);
  assert.equal(s.length,11); // 30/jun a 10/jul inclusive
  assert.ok(s[s.length-1].pct>s[0].pct); // cresce ao longo da série
});
test("composicaoAcoes: percentuais somam ~100% e ordena por valor desc", ()=>{
  const invs=[
    {ticker:"BBAS3",valorAtual:3000},
    {ticker:"ITUB4",valorAtual:2000},
    {tipo:"Renda Fixa",ticker:"CDB-teste",indice:"CDI",taxaRF:"0",valorInvestido:5000}, // RF: fora do donut
  ];
  const C=composicaoAcoes(invs);
  assert.equal(C.length,2); // RF excluída
  assert.equal(C[0].ticker,"BBAS3");
  aprox(C[0].pct,60);aprox(C[1].pct,40);
  aprox(C.reduce((a,x)=>a+x.pct,0),100);
});
test("composicaoAcoes: carteira vazia devolve lista vazia sem dividir por zero", ()=>{
  assert.deepEqual(composicaoAcoes([]),[]);
});

// ── Rentabilidade de Renda Variável (ações) ──────────────────────────────────
test("desde o início: ganho não realizado + realizado das vendas registradas", ()=>{
  const invs=[
    {ticker:"BBAS3",valorAtual:1200,valorInvestido:1000,vendas:[{resultado:50}]},
    {ticker:"ITUB4",valorAtual:800,valorInvestido:900,vendas:[]},
  ];
  const R=rentabilidadeAcoesDesdeInicio(invs);
  // não realizado: (1200-1000)+(800-900)=100 · realizado: 50 · total 150
  aprox(R.valor,150);
  aprox(R.pct,(100)/1900*100,0.01); // pct é só sobre o não realizado vs custo
});
test("desde o início: sem posições, tudo zerado sem dividir por zero", ()=>{
  const R=rentabilidadeAcoesDesdeInicio([]);
  aprox(R.valor,0);assert.equal(R.pct,null);
});
test("ganhoAcoesEntreSnapshots: desconta aporte do período e soma venda do período", ()=>{
  const snapIni=[{id:"a1",valorAtual:800}];
  const invs=[{id:"a1",valorAtual:966,aportes:[{data:"2026-06-10",quantidade:5,preco:40}],vendas:[{data:"2026-06-20",quantidade:2,preco:42}]}];
  const R=ganhoAcoesEntreSnapshots(invs,snapIni,"2026-06-01","2026-06-30");
  // 966 - 800 - 200(aporte) + 84(venda) = 50
  assert.equal(R.temBase,true);aprox(R.valor,50);aprox(R.pct,50/800*100,0.01);
});
test("ganhoAcoesEntreSnapshots: sem foto disponível, temBase é false", ()=>{
  const R=ganhoAcoesEntreSnapshots([{id:"a1",valorAtual:100}],null,"2026-01-01","2026-01-31");
  assert.equal(R.temBase,false);aprox(R.valor,0);
});
test("ganhoAcoesEntreSnapshots: ativo novo no período (sem base) não entra na conta", ()=>{
  const snapIni=[{id:"a1",valorAtual:500}];
  const invs=[{id:"a1",valorAtual:520},{id:"novo",valorAtual:300}]; // "novo" não tem foto anterior
  const R=ganhoAcoesEntreSnapshots(invs,snapIni,"2026-06-01","2026-06-30");
  aprox(R.valor,20); // só o a1 conta
});
test("rentabilidadeAcoes: monta mês e ano a partir do historico salvo", ()=>{
  const hist=[
    {mes:"2026-05",ativos:[{id:"a1",valorAtual:700}]},
    {mes:"2026-06",ativos:[{id:"a1",valorAtual:800}]},
  ];
  const invs=[{id:"a1",valorAtual:850,valorInvestido:600,vendas:[]}];
  const R=rentabilidadeAcoes(invs,hist,new Date(2026,6,10)); // 10/jul/2026
  assert.equal(R.mes.temBase,true);aprox(R.mes.valor,50);   // vs foto de junho (800)
  assert.equal(R.ano.temBase,true);aprox(R.ano.valor,150);  // vs foto mais antiga do ano (maio, 700)
  aprox(R.desdeInicio.valor,250); // 850-600, sem vendas
});
test("rentabilidadeAcoes: sem historico nenhum, mês/ano ficam sem base (honesto)", ()=>{
  const R=rentabilidadeAcoes([{id:"a1",valorAtual:100,valorInvestido:80}],[],new Date());
  assert.equal(R.mes.temBase,false);
  assert.equal(R.ano.temBase,false);
  assert.equal(R.desdeInicio.valor,20);
});

// ── Regressão: ação com indice/taxaRF default NÃO pode virar RF (bug real 14/07) ──
// Todo ativo nasce com indice:"CDI" e taxaRF:0 no formulário — inclusive ações.
// A classificação tem que usar SÓ o campo `tipo`, nunca indice/taxaRF.
test("isRFAtivo: ação com indice/taxaRF padrão (mas tipo='Ações') não é RF", ()=>{
  const acao={tipo:"Ações",ticker:"BBAS3",indice:"CDI",taxaRF:0,valorAtual:1000};
  assert.equal(isRFAtivo(acao),false);
});
test("isRFAtivo: só tipo Renda Fixa / Tesouro Direto conta como RF", ()=>{
  assert.equal(isRFAtivo({tipo:"Renda Fixa"}),true);
  assert.equal(isRFAtivo({tipo:"Tesouro Direto"}),true);
  assert.equal(isRFAtivo({tipo:"Ações"}),false);
  assert.equal(isRFAtivo({}),false); // sem tipo (legado) não vira RF por acidente
});
test("composicaoAcoes: ação com indice/taxaRF default entra no donut normalmente", ()=>{
  const invs=[
    {tipo:"Ações",ticker:"BBAS3",indice:"CDI",taxaRF:0,valorAtual:600},
    {tipo:"Ações",ticker:"ITUB4",indice:"CDI",taxaRF:0,valorAtual:400},
  ];
  const C=composicaoAcoes(invs);
  assert.equal(C.length,2);
  aprox(C[0].pct,60);aprox(C[1].pct,40);
});

// ── Valor líquido de RF (IR regressivo) ──────────────────────────────────────
test("calcValorLiquidoRF: replica o print real do C6 (20% de IR entre 181-360 dias)", ()=>{
  // Aplicado R$2.409,00, ~10 meses atrás, rende até R$2.743,88 bruto (como no print);
  // simulamos a taxa via ajuste fino, o que importa é a FAIXA e o cálculo do imposto.
  const inv={tipo:"Renda Fixa",indice:"CDI",taxaRF:"1.5",rfTipo:"pct",pctIndice:101.5,valorInvestido:2409,data:"2025-09-15"};
  const agora=new Date(2026,6,15); // 10 meses depois
  const R=calcValorLiquidoRF(inv,agora);
  aprox(R.imposto,R.rendimento*0.20,0.5); // faixa de 181-360 dias = 20%, dentro da tolerância do arredondamento de meses
  aprox(R.valorLiquido,R.valorBruto-R.imposto,0.02); // tolerância de 1 centavo por arredondamento independente
});
test("calcValorLiquidoRF: rendimento negativo não gera imposto negativo", ()=>{
  const inv={tipo:"Renda Fixa",indice:"Prefixado",taxaRF:"-5",valorInvestido:1000,data:"2026-01-01"};
  const R=calcValorLiquidoRF(inv,new Date(2026,3,1));
  assert.ok(R.rendimento<0);
  aprox(R.imposto,0);
  aprox(R.valorLiquido,R.valorBruto);
});
test("calcValorLiquidoRF: aplicação de longo prazo (>720 dias) cai na faixa de 15%", ()=>{
  const inv={tipo:"Renda Fixa",indice:"Prefixado",taxaRF:"12",valorInvestido:10000,data:"2023-01-01"};
  const R=calcValorLiquidoRF(inv,new Date(2026,6,15));
  aprox(R.imposto,R.rendimento*0.15,0.5);
});
test("calcValorLiquidoRF: aplicação recentíssima (faixa de 22,5%)", ()=>{
  const inv={tipo:"Renda Fixa",indice:"Prefixado",taxaRF:"12",valorInvestido:5000,data:"2026-06-01"};
  const R=calcValorLiquidoRF(inv,new Date(2026,6,15));
  aprox(R.imposto,R.rendimento*0.225,0.5);
});

// ── RF com série histórica real (BCB) ────────────────────────────────────────
test("compoeFatorDiario: 3 dias de CDI a 0,05%/dia, 100% do índice", ()=>{
  const serie=[{data:"2026-01-01",valor:0.05},{data:"2026-01-02",valor:0.05},{data:"2026-01-03",valor:0.05}];
  const f=compoeFatorDiario(serie,"2026-01-01","2026-01-03",100);
  aprox(f,Math.pow(1.0005,3),0.000001);
});
test("compoeFatorDiario: 101,5% do CDI eleva cada fator diário (convenção ANBIMA)", ()=>{
  const serie=[{data:"2026-01-01",valor:0.05}];
  const f=compoeFatorDiario(serie,"2026-01-01","2026-01-01",101.5);
  aprox(f,Math.pow(1.0005,1.015),0.000001);
});
test("compoeFatorDiario: dias fora do período ou sem registro (fim de semana) são ignorados", ()=>{
  const serie=[{data:"2025-12-31",valor:0.05},{data:"2026-01-01",valor:0.05},{data:"2026-01-05",valor:0.05}];
  const f=compoeFatorDiario(serie,"2026-01-01","2026-01-03",100); // só o dia 1 está no intervalo
  aprox(f,1.0005,0.000001);
});
test("compoeFatorMensal: 2 meses cheios de IPCA compõem; mês parcial (fim) não entra", ()=>{
  const serie=[{data:"2026-01-01",valor:0.5},{data:"2026-02-01",valor:0.3},{data:"2026-03-01",valor:0.4}];
  const f=compoeFatorMensal(serie,"2026-01-01","2026-03-01"); // até 01/03 exclusive
  aprox(f,1.005*1.003,0.000001);
});
test("calcValorAtualRFHistorico: usa série real quando cobre o período (CDI % do índice)", ()=>{
  const serie={CDI:[{data:"2026-01-01",valor:0.04},{data:"2026-01-02",valor:0.04}]};
  const inv={indice:"CDI",rfTipo:"pct",pctIndice:100,valorInvestido:1000,data:"2026-01-01"};
  const R=calcValorAtualRFHistorico(inv,serie,new Date(2026,0,3));
  assert.equal(R.fonte,"historico");
  aprox(R.valor,1000*Math.pow(1.0004,2),0.01);
});
test("calcValorAtualRFHistorico: sem série disponível (offline), cai para a fórmula fixa", ()=>{
  const inv={indice:"CDI",rfTipo:"pct",pctIndice:100,valorInvestido:1000,data:"2026-01-01"};
  const R=calcValorAtualRFHistorico(inv,null,new Date(2026,1,1));
  assert.equal(R.fonte,"formula");
  aprox(R.valor,calcValorAtualRF(inv,new Date(2026,1,1)));
});
test("calcValorAtualRFHistorico: série existe mas NÃO cobre a data de início do ativo, cai para fórmula", ()=>{
  const serie={CDI:[{data:"2026-06-01",valor:0.04}]}; // começa depois do ativo
  const inv={indice:"CDI",rfTipo:"pct",pctIndice:100,valorInvestido:1000,data:"2026-01-01"};
  const R=calcValorAtualRFHistorico(inv,serie,new Date(2026,6,1));
  assert.equal(R.fonte,"formula");
});
test("calcValorAtualRFHistorico: Prefixado nunca usa série (não depende de índice)", ()=>{
  const inv={indice:"Prefixado",taxaRF:"10",valorInvestido:1000,data:"2026-01-01"};
  const R=calcValorAtualRFHistorico(inv,{CDI:[{data:"2020-01-01",valor:0.04}]},new Date(2026,5,1));
  assert.equal(R.fonte,"formula");
});
test("calcValorAtualRFHistorico: IPCA+spread compõe correção real + spread anual composto", ()=>{
  const serie={IPCA:[{data:"2026-01-01",valor:0.5}]};
  const inv={indice:"IPCA",rfTipo:"mais",taxaRF:"9",valorInvestido:1000,data:"2026-01-01"};
  const R=calcValorAtualRFHistorico(inv,serie,new Date(2026,1,1)); // 1 mês depois
  assert.equal(R.fonte,"historico");
  const anos=(new Date(2026,1,1)-new Date("2026-01-01"))/(1000*60*60*24*365);
  aprox(R.valor,1000*1.005*Math.pow(1.09,anos),0.5);
});

// ── Bug real 15/07/2026: header/IR/líquido da RF divergiam do card ──────────
// Diagnosticado por engenharia reversa na UI: o header "Total" da aba Renda
// Fixa e o IR/líquido de cada card não batiam com o valor bruto mostrado no
// próprio card. Causa: calcValorLiquidoRF (usado no header e no IR/líquido)
// só conhecia calcValorAtualRF (taxa fixa de HOJE aplicada retroativamente),
// enquanto o card usa calcValorAtualRFHistorico (série real do BCB). Como a
// taxa de hoje é mais baixa que a média do índice ao longo do período, o
// caminho errado SUBESTIMA o rendimento — invisível em Prefixado (não hoje
// index), visível só em CDI/IPCA.
// A série abaixo é sintética (regra da casa: SEM rede nos testes), mas
// calibrada para reproduzir a magnitude real reportada pelo Leo no app
// (ativo IPCA+9,25%, aplicado R$6.680,00 em 30/10/2025, card mostrando
// ganho de R$709,17 em 15/07/2026 vs. R$644,55 implícito no IR/líquido).
test("BUG: calcValorLiquidoRF deveria usar a série histórica (como o card), mas ainda ignora o parâmetro", ()=>{
  const meses=["2025-10-01","2025-11-01","2025-12-01","2026-01-01","2026-02-01","2026-03-01","2026-04-01","2026-05-01","2026-06-01"];
  const serie={IPCA:meses.map(d=>({data:d,valor:0.478}))}; // ~5,87% a.a., realista p/ o período (mais alto que os 4,64% badge de hoje)
  const inv={tipo:"Renda Fixa",indice:"IPCA",rfTipo:"mais",taxaRF:"9.25",valorInvestido:6680,data:"2025-10-30"};
  const agora=new Date(2026,6,15);

  // Sanity check: o caminho do card (correto) dá ~709 de ganho com essa série.
  const card=calcValorAtualRFHistorico(inv,serie,agora);
  assert.equal(card.fonte,"historico");
  aprox(card.valor-6680,709.17,1);

  // calcValorLiquidoRF recebe a mesma série e usa o mesmo caminho do card
  // (fix: 3º parâmetro `series`, opcional). Antes do fix, o parâmetro extra
  // era ignorado (função só aceitava inv,agora), caía na fórmula de taxa
  // fixa, e este teste falhava mostrando ~644,55 em vez de ~709,17.
  const L=calcValorLiquidoRF(inv,agora,serie);
  aprox(L.rendimento,709.17,1);
});

// ── Rentabilidade RF agregada com série histórica (fonte: historico/formula/misto) ──
test("rentabilidadeRF: sem série (comportamento antigo intacto) → fonte 'formula'", ()=>{
  const inv={tipo:"Renda Fixa",indice:"Prefixado",taxaRF:"12",valorInvestido:10000,data:"2025-01-01"};
  const R=rentabilidadeRF([inv],new Date(2026,6,14));
  assert.equal(R.fonte,"formula");
});
test("rentabilidadeRF: série cobre TODOS os ativos → fonte 'historico'", ()=>{
  const serie={CDI:[{data:"2026-01-01",valor:0.04},{data:"2026-01-02",valor:0.04}]};
  const inv={tipo:"Renda Fixa",indice:"CDI",rfTipo:"pct",pctIndice:100,valorInvestido:1000,data:"2026-01-01"};
  const R=rentabilidadeRF([inv],new Date(2026,0,3),serie);
  assert.equal(R.fonte,"historico");
  aprox(R.valorTotal,1000*Math.pow(1.0004,2),0.01);
});
test("rentabilidadeRF: carteira mista (1 com cobertura, 1 sem) → fonte 'misto'", ()=>{
  const serie={CDI:[{data:"2026-01-01",valor:0.04}]}; // não cobre o Prefixado nem importaria (índice diferente)
  const comCobertura={tipo:"Renda Fixa",indice:"CDI",rfTipo:"pct",pctIndice:100,valorInvestido:1000,data:"2026-01-01"};
  const semCobertura={tipo:"Renda Fixa",indice:"Prefixado",taxaRF:"10",valorInvestido:500,data:"2025-01-01"};
  const R=rentabilidadeRF([comCobertura,semCobertura],new Date(2026,0,1),serie);
  assert.equal(R.fonte,"misto");
});
test("serieRentabilidadeRF: com série real, a curva reflete o índice de verdade (não a flat)", ()=>{
  const serie={CDI:[{data:"2026-01-01",valor:0.10},{data:"2026-01-02",valor:0.10},{data:"2026-01-03",valor:0.10}]};
  const inv={tipo:"Renda Fixa",indice:"CDI",rfTipo:"pct",pctIndice:100,valorInvestido:1000,data:"2026-01-01"};
  const s=serieRentabilidadeRF([inv],new Date(2026,0,1),new Date(2026,0,3),serie);
  assert.equal(s[0].pct,0);
  aprox(s[2].valor,1000*Math.pow(1.001,3),0.01); // 3 dias a 0,10%/dia compostos de verdade
});
test("serieRentabilidadeRF: sem série, comportamento antigo (flat) intacto", ()=>{
  const inv={tipo:"Renda Fixa",indice:"Prefixado",taxaRF:"12",valorInvestido:10000,data:"2026-01-01"};
  const s=serieRentabilidadeRF([inv],new Date(2026,5,30),new Date(2026,6,10));
  assert.equal(s[0].pct,0);
  assert.equal(s.length,11);
});

// ── Mesclagem IPCA oficial + prévia (IPCA-15) ────────────────────────────────
test("mesclarIPCAcomPrevia: oficial tem prioridade — prévia do mesmo mês é ignorada", ()=>{
  const oficial=[{data:"2026-05-01",valor:0.30}];
  const previa=[{data:"2026-05-01",valor:0.99}]; // valor diferente, mas o mês já é oficial
  const m=mesclarIPCAcomPrevia(oficial,previa);
  assert.equal(m.length,1);
  aprox(m[0].valor,0.30); // oficial venceu
});
test("mesclarIPCAcomPrevia: mês sem oficial ainda usa a prévia (preenche o buraco)", ()=>{
  const oficial=[{data:"2026-05-01",valor:0.30}];
  const previa=[{data:"2026-05-01",valor:0.99},{data:"2026-06-01",valor:0.45}]; // junho ainda não saiu oficial
  const m=mesclarIPCAcomPrevia(oficial,previa);
  assert.equal(m.length,2);
  const junho=m.find(p=>p.data==="2026-06-01");
  aprox(junho.valor,0.45);
});
test("mesclarIPCAcomPrevia: resultado sempre ordenado por data", ()=>{
  const oficial=[{data:"2026-03-01",valor:0.1}];
  const previa=[{data:"2026-05-01",valor:0.2},{data:"2026-04-01",valor:0.15}];
  const m=mesclarIPCAcomPrevia(oficial,previa);
  assert.deepEqual(m.map(p=>p.data),["2026-03-01","2026-04-01","2026-05-01"]);
});
test("mesclarIPCAcomPrevia: entra direto na composição mensal (compoeFatorMensal) sem mudar nada nela", ()=>{
  const oficial=[{data:"2026-01-01",valor:0.5}]; // fevereiro ainda não saiu oficial
  const previa=[{data:"2026-02-01",valor:0.3}];  // mas a prévia já tem
  const serieMesclada=mesclarIPCAcomPrevia(oficial,previa);
  const fSemPrevia=compoeFatorMensal(oficial,"2026-01-01","2026-03-01");
  const fComPrevia=compoeFatorMensal(serieMesclada,"2026-01-01","2026-03-01");
  aprox(fSemPrevia,1.005); // só janeiro conta
  aprox(fComPrevia,1.005*1.003); // janeiro + fevereiro (via prévia)
});
test("mesclarIPCAcomPrevia: entradas vazias não quebram", ()=>{
  assert.deepEqual(mesclarIPCAcomPrevia([],[]),[]);
  assert.deepEqual(mesclarIPCAcomPrevia(null,null),[]);
  assert.deepEqual(mesclarIPCAcomPrevia([{data:"2026-01-01",valor:0.1}],null),[{data:"2026-01-01",valor:0.1}]);
});

// ── Pro-rata do mês de compra (dados reais do CDB do Leo, 06/08/2025) ───────
test("compoeFatorMensalProRata: compra no meio do mês credita só a fração de dias", ()=>{
  const serie=[{data:"2025-08-01",valor:-0.11},{data:"2025-09-01",valor:0.48}];
  const f=compoeFatorMensalProRata(serie,"2025-08-06","2025-10-01");
  // agosto: 26 de 31 dias (06 a 31) → (1-0.0011)^(26/31); setembro inteiro
  const esperado=Math.pow(1-0.0011,26/31)*1.0048;
  aprox(f,esperado,0.000001);
});
test("compoeFatorMensalProRata: compra no dia 1 é equivalente ao mês cheio (sem pro-rata)", ()=>{
  const serie=[{data:"2025-08-01",valor:0.5}];
  const fPro=compoeFatorMensalProRata(serie,"2025-08-01","2025-09-01");
  const fCheio=1.005; // mês inteiro, sem desconto
  aprox(fPro,fCheio,0.0001);
});
test("compoeFatorMensalProRata: mês de compra sem dado na série não credita nada (honesto, não inventa)", ()=>{
  const serie=[{data:"2025-09-01",valor:0.48}]; // agosto ausente
  const f=compoeFatorMensalProRata(serie,"2025-08-06","2025-10-01");
  aprox(f,1.0048); // só setembro conta; agosto fica de fora sem fabricar número
});
test("compoeFatorMensalProRata: reduz (não elimina) o gap do CDB real — mais justo que excluir o mês inteiro", ()=>{
  const serie=[{data:"2025-08-01",valor:-0.11},{data:"2025-09-01",valor:0.48},{data:"2025-10-01",valor:0.09},
    {data:"2025-11-01",valor:0.18},{data:"2025-12-01",valor:0.33},{data:"2026-01-01",valor:0.33},
    {data:"2026-02-01",valor:0.7},{data:"2026-03-01",valor:0.88},{data:"2026-04-01",valor:0.67},
    {data:"2026-05-01",valor:0.58},{data:"2026-06-01",valor:0.16}];
  const inv={indice:"IPCA",rfTipo:"mais",taxaRF:"9.75",valorInvestido:7500,data:"2025-08-06"};
  const fator=compoeFatorMensalProRata(serie,"2025-08-06","2026-07-15");
  const anos=(new Date(2026,6,15)-new Date("2025-08-06"))/(1000*60*60*24*365);
  const valor=7500*fator*Math.pow(1+9.75/100,anos);
  // Tolerância medida (não arbitrária): o pro-rata mensal reduz o gap de ~11
  // meses de "excluir o mês inteiro", mas nunca elimina — a interpolação
  // diária proprietária de cada banco não é pública (ver doc de
  // compoeFatorMensalProRata acima). O resíduo real medido aqui é ~R$0,91
  // (0,087% do valor) sobre um CDB de 11 meses; investigado em 16/07/2026,
  // não é regressão de código (função não muda desde que este teste foi
  // escrito) — é o próprio limite documentado da aproximação.
  aprox(valor,8544.43,1); // reproduz o número real verificado à mão, dentro do resíduo esperado
});

// ============================================================================
// Análise fundamentalista — Graham, Bazin e checklist Buy and Hold
// ----------------------------------------------------------------------------
// ⚠️ Estas contas informam decisão de COMPRA e VENDA de ação. Todo valor
// esperado abaixo foi calculado por CAMINHO INDEPENDENTE (à mão / calculadora),
// nunca copiado do que o código produziu. Se um teste falhar, a suspeita
// começa no código, não no número esperado.
// ============================================================================

// ── Número de Graham ────────────────────────────────────────────────────────
// WEGE3 real (produção, 27/07/2026): LPA 1,49 · VPA 4,49 · preço 45,99
//   22,5 × 1,49 × 4,49 = 150,52725
//   √150,52725         = 12,26895…  → 12,27
//   (12,26895−45,99)/45,99 × 100 = −73,3226…% → −73,3%
test("Graham: número da WEGE3 com dados reais bate com a conta à mão", ()=>{
  const r=numeroGraham(1.49,4.49,45.99);
  assert.equal(r.numero,12.27);
  assert.equal(r.margem_seguranca_pct,-73.3);
  assert.equal(r.aplicavel,true);
});

test("Graham: margem é positiva quando o preço está abaixo do número", ()=>{
  // LPA 2 · VPA 8 → 22,5×2×8 = 360 → √360 = 18,97366…  → 18,97
  // preço 10 → (18,97366−10)/10 = +89,7366% → +89,7
  const r=numeroGraham(2,8,10);
  assert.equal(r.numero,18.97);
  assert.equal(r.margem_seguranca_pct,89.7);
});

test("Graham: LPA negativo devolve null e motivo, NUNCA NaN", ()=>{
  const r=numeroGraham(-1.5,4.49,45.99);
  assert.equal(r.numero,null);
  assert.equal(r.margem_seguranca_pct,null);
  assert.equal(r.aplicavel,false);
  assert.ok(/LPA/.test(r.motivo));
  // a prova de que o NaN não vazou: NaN !== null e é "number"
  assert.ok(!Number.isNaN(r.numero));
});

test("Graham: VPA negativo (patrimônio negativo) também é inaplicável", ()=>{
  const r=numeroGraham(1.49,-4.49,45.99);
  assert.equal(r.numero,null);
  assert.equal(r.aplicavel,false);
  assert.ok(/patrim/i.test(r.motivo));
});

test("Graham: LPA ou VPA ausente devolve null, não zero", ()=>{
  for(const r of [numeroGraham(null,4.49,45.99),numeroGraham(1.49,null,45.99),numeroGraham(undefined,undefined,45.99)]){
    assert.equal(r.numero,null);
    assert.equal(r.aplicavel,false);
  }
});

// ── Critério defensivo de Graham ────────────────────────────────────────────
test("Graham defensivo: WEGE3 reprova — 30,87 × 10,23 = 315,80", ()=>{
  const r=grahamDefensivo(30.87,10.23);
  assert.equal(r.produto,315.8);
  assert.equal(r.aprovado,false);
  assert.equal(r.pl_ok,false);
  assert.equal(r.pvp_ok,false);
});

test("Graham defensivo: BBAS3 aprova — 9,18 × 0,63 = 5,78", ()=>{
  const r=grahamDefensivo(9.18,0.63);
  assert.equal(r.produto,5.78);
  assert.equal(r.aprovado,true);
  assert.equal(r.pl_ok,true);
  assert.equal(r.pvp_ok,true);
});

test("Graham defensivo: o veredito é o PRODUTO, não os dois testes isolados", ()=>{
  // P/L 20 (falha o <15) mas P/VP 0,5 → produto 10 < 22,5 → aprova mesmo assim.
  // É assim que Graham aplicava: o produto permite compensação.
  const r=grahamDefensivo(20,0.5);
  assert.equal(r.pl_ok,false);
  assert.equal(r.pvp_ok,true);
  assert.equal(r.produto,10);
  assert.equal(r.aprovado,true);
});

test("Graham defensivo: P/L negativo NÃO vira 'barato' pelo produto negativo", ()=>{
  // ARMADILHA: −10 × 1 = −10, que é < 22,5. Sem a guarda, empresa com prejuízo
  // apareceria como aprovada no critério de preço.
  const r=grahamDefensivo(-10,1);
  assert.equal(r.aprovado,false);
  assert.equal(r.produto,null);
  assert.ok(/prejuízo/i.test(r.motivo));
});

test("Graham defensivo: P/VP negativo também é barrado", ()=>{
  const r=grahamDefensivo(10,-2);
  assert.equal(r.aprovado,false);
  assert.equal(r.produto,null);
});

// ── Preço-teto de Bazin ─────────────────────────────────────────────────────
test("Bazin: série cheia de 5 anos — média 1,00 ÷ 0,06 = 16,67", ()=>{
  // 1,00+1,20+0,80+1,10+0,90 = 5,00 → ÷5 = 1,00 → ÷0,06 = 16,6666… → 16,67
  const serie=[{ano:2021,valor:1.00},{ano:2022,valor:1.20},{ano:2023,valor:0.80},
               {ano:2024,valor:1.10},{ano:2025,valor:0.90}];
  const r=precoTetoBazin(serie,true,0.06,2026);
  assert.equal(r.media_provento,1);
  assert.equal(r.teto,16.67);
  assert.equal(r.anos_com_provento,5);
  assert.equal(r.historico_com_buraco,false);
});

test("Bazin: ano sem provento entra como ZERO na média (divide por 5, não por 4)", ()=>{
  // Sem 2023: 1,00+1,20+1,10+0,90 = 4,20 → ÷5 = 0,84 → ÷0,06 = 14,00
  // Se dividisse pelos PRESENTES daria 4,20/4/0,06 = 17,50 — teto 25% inflado
  // para uma empresa que deixou de pagar. É o erro que esta asserção trava.
  const serie=[{ano:2021,valor:1.00},{ano:2022,valor:1.20},
               {ano:2024,valor:1.10},{ano:2025,valor:0.90}];
  const r=precoTetoBazin(serie,false,0.06,2026);
  assert.equal(r.media_provento,0.84);
  assert.equal(r.teto,14);
  assert.notEqual(r.teto,17.5);          // o teto inflado NÃO pode aparecer
  assert.equal(r.anos_com_provento,4);
  assert.equal(r.historico_com_buraco,true);   // o teto vem, mas sinalizado
});

test("Bazin: ano corrente (incompleto) fica fora da janela", ()=>{
  // 2026 tem só 0,10 pago até agora; se entrasse, derrubaria a média
  const serie=[{ano:2021,valor:1.00},{ano:2022,valor:1.20},{ano:2023,valor:0.80},
               {ano:2024,valor:1.10},{ano:2025,valor:0.90},{ano:2026,valor:0.10}];
  const r=precoTetoBazin(serie,true,0.06,2026);
  assert.equal(r.media_provento,1);       // idêntico ao teste da série cheia
  assert.equal(r.teto,16.67);
  assert.equal(r.janela,"2021-2025");
});

test("Bazin: sem nenhum provento na janela devolve null, não zero", ()=>{
  const r=precoTetoBazin([{ano:2026,valor:0.5}],false,0.06,2026);
  assert.equal(r.teto,null);
  assert.equal(r.media_provento,null);
  assert.equal(r.historico_com_buraco,true);
});

test("Bazin: DY alvo configurável muda o teto proporcionalmente", ()=>{
  const serie=[{ano:2021,valor:1},{ano:2022,valor:1},{ano:2023,valor:1},
               {ano:2024,valor:1},{ano:2025,valor:1}];
  assert.equal(precoTetoBazin(serie,true,0.06,2026).teto,16.67);   // 1/0,06
  assert.equal(precoTetoBazin(serie,true,0.08,2026).teto,12.5);    // 1/0,08
});

// ── CAGR do lucro (4 anos = 3 períodos) ─────────────────────────────────────
test("CAGR lucro: WEGE3 real 4,208→6,376 bi em 3 períodos = +14,9%/ano", ()=>{
  // (6376219000/4208084000)^(1/3) − 1 = 0,1485757… → 14,9
  const r=cagrLucro([{ano:2022,valor:4208084000},{ano:2023,valor:5731670000},
                     {ano:2024,valor:6042593000},{ano:2025,valor:6376219000}]);
  assert.equal(r,14.9);
});

test("CAGR lucro: BBAS3 real 31,011→17,808 bi = −16,9%/ano", ()=>{
  const r=cagrLucro([{ano:2022,valor:31011000000},{ano:2023,valor:33818951000},
                     {ano:2024,valor:35439890000},{ano:2025,valor:17808000000}]);
  assert.equal(r,-16.9);
});

test("CAGR lucro: partir de prejuízo devolve null, nunca Infinity", ()=>{
  assert.equal(cagrLucro([{ano:2022,valor:-100},{ano:2025,valor:500}]),null);
  assert.equal(cagrLucro([{ano:2022,valor:500},{ano:2025,valor:-100}]),null);
  assert.equal(cagrLucro([{ano:2022,valor:0},{ano:2025,valor:500}]),null);
});

test("CAGR lucro: menos de 2 anos não dá taxa", ()=>{
  assert.equal(cagrLucro([{ano:2025,valor:100}]),null);
  assert.equal(cagrLucro([]),null);
  assert.equal(cagrLucro(null),null);
});

// ── Checklist Buy and Hold ──────────────────────────────────────────────────
const BASE_OK={
  anos_bolsa:26.5, anos_bolsa_minimo:true,
  anos_sem_prejuizo:4, lucro_anos_avaliados:4,
  cagr_provento_5a:41.3, pagou_todo_ano_5a:true,
  roe:33.2, div_liq_patrim:-0.2, cres_rec_5a:11.2,
  lucro_anual:[{ano:2022,valor:4208084000},{ano:2025,valor:6376219000}],
  vol_med_2m:362006000,
};
const cri=(r,id)=>r.criterios.find(c=>c.id===id);

test("checklist: são 8 critérios (payout e 20 trimestres ficaram fora)", ()=>{
  const r=checklistBuyAndHold(BASE_OK,null);
  assert.equal(r.criterios.length,8);
  assert.equal(r.avaliados,8);
  assert.ok(!r.criterios.some(c=>/payout/i.test(c.id)));
});

test("checklist: empresa boa aprova nos 8", ()=>{
  const r=checklistBuyAndHold(BASE_OK,null);
  assert.equal(r.aprovados,8);
  assert.equal(r.sem_dado,0);
});

// ⚠️ A ARMADILHA DO PROVENTO — o teste mais importante deste bloco
test("checklist: CAGR positivo COM ano pulado REPROVA no provento", ()=>{
  // A tabela do Fundamentus omite o ano sem pagamento, então uma empresa que
  // falhou em pagar ainda produz CAGR positivo (+8,8% no caso medido). Se o
  // critério olhasse só o CAGR, ela apareceria como "dividendos crescentes".
  const r=checklistBuyAndHold({...BASE_OK,cagr_provento_5a:8.8,pagou_todo_ano_5a:false},null);
  assert.equal(cri(r,"provento_crescente").passou,false);
  assert.equal(r.aprovados,7);
  assert.ok(/deixou de pagar/.test(cri(r,"provento_crescente").detalhe));
});

test("checklist: CAGR positivo E pagou todo ano aprova", ()=>{
  const r=checklistBuyAndHold({...BASE_OK,cagr_provento_5a:0.1,pagou_todo_ano_5a:true},null);
  assert.equal(cri(r,"provento_crescente").passou,true);
});

test("checklist: CAGR negativo reprova mesmo pagando todo ano (BBAS3 −15,2%)", ()=>{
  const r=checklistBuyAndHold({...BASE_OK,cagr_provento_5a:-15.2,pagou_todo_ano_5a:true},null);
  assert.equal(cri(r,"provento_crescente").passou,false);
});

test("checklist: anos_bolsa_minimo chega à tela para ela não mentir a idade", ()=>{
  // 26,5 é PISO do Yahoo, não a idade da WEG. A tela precisa do booleano para
  // escrever "mais de 26 anos" em vez de "26,5 anos".
  const r=checklistBuyAndHold(BASE_OK,null);
  const c=cri(r,"anos_bolsa");
  assert.equal(c.e_minimo,true);
  assert.equal(c.passou,true);
  assert.ok(/mais de/.test(c.detalhe));
});

test("checklist: CXSE3 com 5,3 anos passa, mas está na fronteira", ()=>{
  const r=checklistBuyAndHold({...BASE_OK,anos_bolsa:5.3,anos_bolsa_minimo:false},null);
  assert.equal(cri(r,"anos_bolsa").passou,true);
  assert.equal(cri(r,"anos_bolsa").e_minimo,false);
  // e 4,9 anos reprova — a régua é 5
  assert.equal(cri(checklistBuyAndHold({...BASE_OK,anos_bolsa:4.9},null),"anos_bolsa").passou,false);
});

test("checklist: 'sem prejuízo' é sobre 4 anos, não 'nunca'", ()=>{
  const r=checklistBuyAndHold(BASE_OK,null);
  assert.ok(/4 anos/.test(cri(r,"sem_prejuizo").nome));
  assert.ok(!/nunca/i.test(cri(r,"sem_prejuizo").nome));
  // 3 de 4 anos com lucro reprova
  const r2=checklistBuyAndHold({...BASE_OK,anos_sem_prejuizo:3},null);
  assert.equal(cri(r2,"sem_prejuizo").passou,false);
});

test("checklist: 'lucro crescente' é rotulado 4 anos (limite da fonte)", ()=>{
  const r=checklistBuyAndHold(BASE_OK,null);
  assert.ok(/4 anos/.test(cri(r,"cresc_lucro").nome));
});

test("checklist: critério desligado sai do denominador do placar", ()=>{
  const cfg={criterios:{...CHECKLIST_PADRAO.criterios,roe:false,liquidez:false}};
  const r=checklistBuyAndHold(BASE_OK,cfg);
  assert.equal(r.avaliados,6);          // 8 − 2 desligados
  assert.equal(r.aprovados,6);
  assert.equal(r.criterios.length,8);   // continuam na lista, só não contam
  assert.equal(cri(r,"roe").ligado,false);
});

test("checklist: corte de liquidez é configurável e respeitado", ()=>{
  const dados={...BASE_OK,vol_med_2m:2000000};
  assert.equal(cri(checklistBuyAndHold(dados,null),"liquidez").passou,true);          // padrão 1M
  assert.equal(cri(checklistBuyAndHold(dados,{corte_liquidez:11000000}),"liquidez").passou,false); // corte Investidor10
  assert.equal(checklistBuyAndHold(dados,{corte_liquidez:11000000}).corte_liquidez,11000000);
});

test("checklist: campo ausente vira 'sem dado' (null), não reprovação silenciosa", ()=>{
  // Banco não tem div_liq_patrim no Fundamentus — não pode virar "reprovado"
  const r=checklistBuyAndHold({...BASE_OK,div_liq_patrim:null,roe:null},null);
  assert.equal(cri(r,"divida").passou,null);
  assert.equal(cri(r,"roe").passou,null);
  assert.equal(r.sem_dado,2);
  assert.equal(r.aprovados,6);   // null não conta como aprovado
  assert.equal(r.avaliados,8);   // mas continua ligado, então segue no denominador
});

test("checklist: dados vazios não explodem", ()=>{
  const r=checklistBuyAndHold({},null);
  assert.equal(r.aprovados,0);
  assert.equal(r.sem_dado,8);
  assert.ok(r.criterios.every(c=>c.passou===null));
});

// ============================================================================
// FII — triagem
// ----------------------------------------------------------------------------
// ⚠️ Informa decisão de COMPRA. Valores esperados calculados por caminho
// independente, nunca copiados do que o código produziu.
// ============================================================================

// série mensal auxiliar: n pagamentos de `v`, terminando em fim (YYYY-MM)
const serieFii=(n,v,fimAno,fimMes,pular=[])=>{
  const out=[];
  for(let i=n-1;i>=0;i--){
    const t=fimAno*12+(fimMes-1)-i, y=Math.floor(t/12), m=t%12+1;
    const mk=`${y}-${String(m).padStart(2,"0")}`;
    if(pular.includes(mk))continue;
    out.push({data:`${mk}-28`,valor:v});
  }
  return out;
};

// ── Tipo derivado ───────────────────────────────────────────────────────────
test("FII: tipo vem de Qtd de imóveis, não do campo Segmento", ()=>{
  // O Segmento do Fundamentus chama MXRF11 (papel) de "Logística" — inservível.
  assert.equal(tipoFii(60),"tijolo");   // HGLG11
  assert.equal(tipoFii(0),"papel");     // MXRF11 / KNCR11
  assert.equal(tipoFii(null),null);     // sem dado ≠ papel
});

// ── ⚠️ Zero-filler: o teste mais importante deste bloco ─────────────────────
test("FII de papel: vacância e cap rate vêm NULL, nunca 0", ()=>{
  // 412 dos 560 fundos trazem vacância 0,00% na tabela; a maioria por não ter
  // imóvel. Se virasse 0, um filtro "vacância < 5%" os aprovaria como exemplares.
  const r=metricasImovel(0,0,0);
  assert.equal(r.vacancia,null);
  assert.equal(r.cap_rate,null);
  assert.equal(r.aplicavel,false);
  assert.notEqual(r.vacancia,0);   // trava explícita contra a regressão
});

test("FII de tijolo com 0% de vacância é dado REAL, não filler", ()=>{
  // TRXF11 tem 97 imóveis e 0,00% — totalmente locado. Zerar isso seria perder
  // informação boa.
  const r=metricasImovel(97,0,7.7);
  assert.equal(r.vacancia,0);
  assert.equal(r.cap_rate,7.7);
  assert.equal(r.aplicavel,true);
});

// ── DY calculado ────────────────────────────────────────────────────────────
test("FII: DY do MXRF11 = 12,40% (soma 1,20 ÷ 9,68)", ()=>{
  // 12 × 0,10 = 1,20 · 1,20/9,68 = 12,3966…% → 12,40
  const r=dyFii12m(serieFii(12,0.10,2026,6),9.68);
  assert.equal(r.soma_12m,1.2);
  assert.equal(r.dy_pct,12.4);
  assert.equal(r.meses_pagos,12);
  assert.equal(r.pagou_todos_12m,true);
});

test("FII: NUNCA usar o DY publicado — o calculado é outro número", ()=>{
  // O Fundamentus exibe 13,30% para o MXRF11; o histórico dele dá 12,40%.
  // Esta asserção existe para travar a tentação de ler o campo pronto.
  const r=dyFii12m(serieFii(12,0.10,2026,6),9.68);
  assert.notEqual(r.dy_pct,13.3);
});

test("FII com menos de 12 meses de histórico: DY null, não parcial", ()=>{
  // Fundo com 6 meses somaria meio ano e pareceria render metade.
  const r=dyFii12m(serieFii(6,0.10,2026,6),9.68);
  assert.equal(r.dy_pct,null);
  assert.equal(r.soma_12m,null);
  assert.ok(/menor que 12 meses/.test(r.motivo));
});

test("FII: mês sem pagamento no meio da série reprova a consistência", ()=>{
  // 11 pagamentos numa janela de 12 → soma 1,10 → DY 11,36%, mas pagou_todos false
  const r=dyFii12m(serieFii(24,0.10,2026,6,["2026-02"]),9.68);
  assert.equal(r.meses_pagos,11);
  assert.equal(r.pagou_todos_12m,false);
  assert.equal(r.soma_12m,1.1);
  assert.equal(r.dy_pct,11.36);
});

test("FII: janela é trailing 12m, não 'os 12 últimos pagamentos'", ()=>{
  // Com 24 meses e um buraco, pegar os 12 pagamentos mais recentes alcançaria
  // 13 meses atrás e inflaria o DY. A janela por mês evita isso.
  const r=dyFii12m(serieFii(24,0.10,2026,6,["2026-02"]),9.68);
  assert.equal(r.soma_12m,1.1);      // 11 pagamentos, não 12
  assert.notEqual(r.soma_12m,1.2);
});

test("FII: DY sem preço válido devolve null, não Infinity", ()=>{
  assert.equal(dyFii12m(serieFii(12,0.10,2026,6),0).dy_pct,null);
  assert.equal(dyFii12m(serieFii(12,0.10,2026,6),null).dy_pct,null);
});

// ── Tendência ───────────────────────────────────────────────────────────────
test("FII: tendência compara 12m recentes com os 12 anteriores", ()=>{
  // 12 × 0,10 = 1,20 contra 12 × 0,08 = 0,96 → (1,20/0,96−1) = +25,0%
  const h=[...serieFii(12,0.08,2025,6),...serieFii(12,0.10,2026,6)];
  assert.equal(tendenciaFii(h),25);
});

test("FII: sem 24 meses não há tendência — null, não zero", ()=>{
  assert.equal(tendenciaFii(serieFii(12,0.10,2026,6)),null);
});

// ── Filtro composto ─────────────────────────────────────────────────────────
const TIJOLO_BOM={papel:"HGLG11",cotacao:105,pvp:0.89,liquidez:3000000,qtd_imoveis:60,
  vacancia:3.2,cap_rate:7.7,dy_pct:8.57,pagou_todos_12m:true,meses_pagos:12};
const criF=(r,id)=>r.criterios.find(c=>c.id===id);

test("FII: tijolo bom passa nos 5 critérios", ()=>{
  const r=filtraFii(TIJOLO_BOM,null);
  assert.equal(r.tipo,"tijolo");
  assert.equal(r.aprovado,true);
  assert.equal(r.aprovados,5);
  assert.equal(r.sem_dado,0);
});

test("FII: régua de DY é diferente para papel e tijolo", ()=>{
  // 9% aprova tijolo (≥8) e reprova papel (≥10) — régua única faria tijolo
  // parecer sempre pior, já que papel carrega risco de crédito.
  const tij=filtraFii({...TIJOLO_BOM,dy_pct:9},null);
  const pap=filtraFii({...TIJOLO_BOM,qtd_imoveis:0,dy_pct:9},null);
  assert.equal(criF(tij,"dy").passou,true);
  assert.equal(criF(pap,"dy").passou,false);
  assert.ok(/tijolo/.test(criF(tij,"dy").nome));
  assert.ok(/papel/.test(criF(pap,"dy").nome));
});

test("FII de papel: vacância fica 'sem dado', não aprovada por ter 0%", ()=>{
  const r=filtraFii({...TIJOLO_BOM,qtd_imoveis:0,vacancia:0,cap_rate:0,dy_pct:12},null);
  assert.equal(r.tipo,"papel");
  assert.equal(criF(r,"vacancia").passou,null);   // null, NÃO true
  assert.equal(r.vacancia,null);
  assert.equal(r.sem_dado,1);
  assert.equal(r.aprovado,true);                 // sem dado não reprova
});

test("FII: P/VP acima do teto reprova", ()=>{
  assert.equal(criF(filtraFii({...TIJOLO_BOM,pvp:1.30},null),"pvp").passou,false);
  assert.equal(criF(filtraFii({...TIJOLO_BOM,pvp:1.05},null),"pvp").passou,true); // limite inclusivo
});

test("FII: critério desligado sai do denominador", ()=>{
  const r=filtraFii(TIJOLO_BOM,{criterios:{...FII_PADRAO.criterios,vacancia:false,liquidez:false}});
  assert.equal(r.avaliados,3);
  assert.equal(r.criterios.length,5);
  assert.equal(criF(r,"vacancia").ligado,false);
});

test("FII: corte de liquidez é configurável", ()=>{
  const f={...TIJOLO_BOM,liquidez:600000};
  assert.equal(criF(filtraFii(f,null),"liquidez").passou,true);              // padrão 500k
  assert.equal(criF(filtraFii(f,{liquidez_min:1000000}),"liquidez").passou,false);
});

test("FII: fundo sem dado nenhum não explode e não aprova por omissão", ()=>{
  const r=filtraFii({papel:"XXXX11"},null);
  assert.equal(r.tipo,null);
  assert.equal(r.sem_dado,5);
  assert.equal(r.aprovados,0);
});

// ── Série mensal de rendimentos (o gráfico mais importante da tela de FII) ──
test("FII série: mês sem pagamento vira BURACO explícito, não some nem vira 0", ()=>{
  // A fonte omite o mês sem pagamento. Se a série só trouxesse os pontos
  // existentes, o gráfico ligaria fev a abr e esconderia que março falhou —
  // que é exatamente o sinal que o investidor precisa ver.
  const h=[{data:"2026-02-27",valor:0.10},{data:"2026-04-30",valor:0.10},{data:"2026-05-29",valor:0.10}];
  const s=serieRendimentosFii(h,{meses:4});
  assert.equal(s.length,4);
  assert.deepEqual(s.map(p=>p.mes),["2026-02","2026-03","2026-04","2026-05"]);
  const mar=s.find(p=>p.mes==="2026-03");
  assert.equal(mar.valor,null);      // null, NÃO zero
  assert.equal(mar.vazio,true);
  assert.notEqual(mar.valor,0);      // trava contra a regressão
});

test("FII série: mês com DOIS pagamentos soma e sinaliza", ()=>{
  // MXRF11 teve isso em jun/2019 e out/2025. Não dá para distinguir
  // distribuição extra de linha duplicada, então soma e avisa.
  const h=[{data:"2025-10-31",valor:0.10},{data:"2025-10-31",valor:0.10},{data:"2025-11-28",valor:0.10}];
  const s=serieRendimentosFii(h,{meses:2});
  const out=s.find(p=>p.mes==="2025-10");
  assert.equal(out.valor,0.2);
  assert.equal(out.lancamentos,2);
  assert.equal(out.multiplo,true);
  assert.equal(s.find(p=>p.mes==="2025-11").multiplo,false);
});

test("FII série: eixo é contínuo mesmo com buraco longo", ()=>{
  const h=[{data:"2024-01-31",valor:0.5},{data:"2024-06-28",valor:0.5}];
  const s=serieRendimentosFii(h,{meses:6});
  assert.equal(s.length,6);
  assert.equal(s.filter(p=>p.vazio).length,4);   // fev,mar,abr,mai
});

test("FII série: sem histórico devolve lista vazia, não explode", ()=>{
  assert.deepEqual(serieRendimentosFii([],{meses:12}),[]);
  assert.deepEqual(serieRendimentosFii(null),[]);
});

test("FII resumo: conta meses sem pagamento e detecta queda", ()=>{
  // 1ª metade média 1,00 · 2ª metade média 0,50 → −50% → "queda"
  const s=serieRendimentosFii([
    {data:"2026-01-31",valor:1},{data:"2026-02-27",valor:1},
    {data:"2026-03-31",valor:0.5},{data:"2026-04-30",valor:0.5},
  ],{meses:4});
  const r=resumoRendimentosFii(s);
  assert.equal(r.media,0.75);
  assert.equal(r.min,0.5); assert.equal(r.max,1);
  assert.equal(r.variacao_pct,-50);
  assert.equal(r.tendencia,"queda");
  assert.equal(r.meses_sem_pagamento,0);
});

test("FII resumo: rendimento estável não é rotulado como tendência", ()=>{
  const s=serieRendimentosFii([1,2,3,4].map((_,i)=>({data:`2026-0${i+1}-28`,valor:0.10})),{meses:4});
  assert.equal(resumoRendimentosFii(s).tendencia,"estável");
});

// ── Recorte do ruído inicial (P/VP) ─────────────────────────────────────────
test("FII P/VP: descarta os primeiros meses e reporta a faixa da janela", ()=>{
  // 40 meses: os 24 primeiros com ruído (até 9,0), os 16 últimos entre 0,8 e 1,0.
  // (é o caso real: MXRF11 tem ~115 meses, então cortar 24 sobra muito.)
  const serie=[];
  for(let i=0;i<40;i++){
    const y=2020+Math.floor(i/12), m=String(i%12+1).padStart(2,"0");
    serie.push({mes:`${y}-${m}`,valor:i<24?9-i*0.3:0.8+(i-24)*0.01});
  }
  const r=serieRecortada(serie,{descartarMeses:24});
  assert.equal(r.pontos.length,16);
  assert.equal(r.descartados,24);
  assert.ok(r.max<1.1);            // o pico de 9,0 saiu da janela
  assert.ok(r.min>=0.8);
});

test("FII P/VP: série curta não é recortada até sobrar nada", ()=>{
  // com 8 pontos, descartar 24 deixaria zero — devolve os que existem, sem
  // ressuscitar ruído (aqui não há ruído: a série toda cabe)
  const serie=Array.from({length:8},(_,i)=>({mes:`2026-0${i+1}`,valor:1+i*0.01}));
  const r=serieRecortada(serie,{descartarMeses:24});
  assert.equal(r.pontos.length,8);
  assert.equal(r.descartados,0);
});

test("FII P/VP: série longa é afinada para não pesar na tela", ()=>{
  const serie=Array.from({length:2379},(_,i)=>({mes:`20${17+Math.floor(i/250)}-01`,valor:1}));
  const r=serieRecortada(serie,{descartarMeses:0,maxPontos:180});
  assert.ok(r.pontos.length<=180);
  assert.ok(r.pontos.length>100);
});

test("FII série: janela ancorada em `ate` revela fundo que parou de pagar", ()=>{
  // GSFI11 pagou uma vez em jun/2017 e nunca mais. Ancorando na série (padrão),
  // a janela seria 2017 e mostraria barra cheia — escondendo que o fundo morreu.
  const h=[{data:"2017-06-30",valor:0.5}];
  const naSerie=serieRendimentosFii(h,{meses:12});
  assert.equal(naSerie.filter(p=>p.vazio).length,11);   // 11 buracos + 1 barra
  assert.equal(naSerie.at(-1).mes,"2017-06");
  // ancorada em hoje: 12 meses de buraco, que é a verdade
  const hoje=serieRendimentosFii(h,{meses:12,ate:"2026-08-01"});
  assert.equal(hoje.filter(p=>p.vazio).length,12);
  assert.equal(hoje.at(-1).mes,"2026-08");
  assert.ok(hoje.every(p=>p.valor===null));
});

test("FII resumo: buraco no FIM é defasagem da fonte, não pagamento falhado", ()=>{
  // Todo fundo tem 1-2 meses vazios no fim porque a fonte publica com atraso.
  // Contar isso como "mês sem distribuição" daria alarme falso em todos.
  const s=serieRendimentosFii([
    {data:"2026-04-30",valor:1},{data:"2026-05-29",valor:1},{data:"2026-06-30",valor:1},
  ],{meses:5,ate:"2026-08-15"});
  const r=resumoRendimentosFii(s);
  assert.equal(r.meses_sem_pagamento,0);      // nenhum buraco no MEIO
  assert.equal(r.meses_desde_ultimo,2);       // jul e ago: fonte não publicou
});

test("FII resumo: buraco no MEIO continua sendo contado", ()=>{
  const s=serieRendimentosFii([
    {data:"2026-03-31",valor:1},{data:"2026-05-29",valor:1},{data:"2026-06-30",valor:1},
  ],{meses:4,ate:"2026-06-30"});
  const r=resumoRendimentosFii(s);
  assert.equal(r.meses_sem_pagamento,1);      // abril
  assert.equal(r.meses_desde_ultimo,0);
});

test("FII resumo: fundo que parou de pagar acusa o tempo parado", ()=>{
  const s=serieRendimentosFii([{data:"2017-06-30",valor:0.5}],{meses:36,ate:"2026-08-01"});
  const r=resumoRendimentosFii(s);
  assert.equal(r.meses_desde_ultimo,36);      // nada na janela inteira
});

// ── Cobertura da distribuição pelo FFO (agregada) ───────────────────────────
test("FII FFO: cobertura AGREGADA, não média de percentuais", ()=>{
  // soma FFO 300 / soma dist 400 = 75,0%
  // (a média dos percentuais daria (100+50)/2 = 75 por coincidência aqui, então
  //  o caso seguinte usa tamanhos diferentes para separar os métodos)
  const r=coberturaFfoFii(
    [{mes:"2025-09",valor:100},{mes:"2025-12",valor:200}],
    [{mes:"2025-09",valor:100},{mes:"2025-12",valor:300}]);
  assert.equal(r.soma_ffo,300); assert.equal(r.soma_distribuido,400);
  assert.equal(r.cobertura_agregada_pct,75);
});

test("FII FFO: agregada dá peso por tamanho, média de percentuais não", ()=>{
  // trimestre pequeno com 200% e trimestre grande com 50%:
  //   média de percentuais = 125% (parece saudável)
  //   agregada = (20+500)/(10+1000) = 51,5% (a verdade)
  const r=coberturaFfoFii(
    [{mes:"2025-09",valor:20},{mes:"2025-12",valor:500}],
    [{mes:"2025-09",valor:10},{mes:"2025-12",valor:1000}]);
  assert.equal(r.cobertura_agregada_pct,51.5);
  assert.notEqual(r.cobertura_agregada_pct,125);
});

test("FII FFO: cobertura é FFO÷distribuído — <100% significa pagar além do que ganha", ()=>{
  // A régua de cor (<100 vermelho) só fecha nesta direção. Com dist÷FFO, um
  // fundo distribuindo acima do resultado daria >100% e sairia verde.
  const r=coberturaFfoFii([{mes:"2026-03",valor:115164429}],[{mes:"2026-03",valor:135779512}]);
  assert.equal(r.linhas[0].cobertura_pct,84.8);
  assert.ok(r.cobertura_agregada_pct<100);
  assert.equal(r.alerta,"distribuindo acima do resultado");
});

test("FII FFO: trimestre sem distribuição NÃO some — vira null e conta zero", ()=>{
  // Zero-filler, 5ª vez: "—" na tela, nunca 0,00. E entra no agregado como
  // zero, porque não distribuir é informação.
  const r=coberturaFfoFii(
    [{mes:"2025-09",valor:100},{mes:"2025-12",valor:100}],
    [{mes:"2025-09",valor:0}, {mes:"2025-12",valor:100}]);
  assert.equal(r.linhas.length,2);                    // as duas aparecem
  const semDist=r.linhas.find(l=>l.mes==="2025-09");
  assert.equal(semDist.distribuido,null);             // null, NÃO 0
  assert.notEqual(semDist.distribuido,0);
  assert.equal(semDist.cobertura_pct,null);           // "—", não Infinity
  assert.equal(r.soma_distribuido,100);               // contou como zero
  assert.equal(r.cobertura_agregada_pct,200);         // 200/100
  assert.equal(r.trimestres_sem_distribuicao,1);
});

test("FII FFO: negativo mostra o valor e marca cobertura n/a", ()=>{
  const r=coberturaFfoFii([{mes:"2024-03",valor:-155513142}],[{mes:"2024-03",valor:100000000}]);
  assert.equal(r.linhas[0].ffo,-155513142);           // valor negativo preservado
  assert.equal(r.linhas[0].cobertura_pct,null);       // n/a, não percentual torto
  assert.equal(r.linhas[0].ffo_negativo,true);
  assert.equal(r.tem_ffo_negativo,true);
});

test("FII FFO: negativo SUBTRAI do agregado — não é descartado nem vira n/a global", ()=>{
  // 3 trimestres: +100, -40, +100 · distribuído 50 em cada um.
  // Agregado correto = (100-40+100)/150 = 106,7%.
  // Se o negativo fosse DESCARTADO daria 200/100 = 200% — um fundo que teve
  // prejuízo operacional pareceria o dobro de coberto. É o erro que este teste barra.
  const r=coberturaFfoFii(
    [{mes:"2025-06",valor:100},{mes:"2025-09",valor:-40},{mes:"2025-12",valor:100}],
    [{mes:"2025-06",valor:50},{mes:"2025-09",valor:50},{mes:"2025-12",valor:50}]);
  assert.equal(r.soma_ffo,160);                       // 100-40+100, com o sinal
  assert.equal(r.soma_distribuido,150);               // o trimestre negativo pagou: conta
  assert.equal(r.cobertura_agregada_pct,106.7);
  assert.notEqual(r.cobertura_agregada_pct,200);      // descarte silencioso
  assert.notEqual(r.cobertura_agregada_pct,null);     // "n/a" contaminando o agregado
  assert.equal(r.linhas.find(l=>l.mes==="2025-09").cobertura_pct,null);  // só a LINHA é n/a
  assert.equal(r.janela,3);                           // continua na janela, não sumiu
});

test("FII FFO: tem_ffo_negativo olha só a janela, não a série inteira", ()=>{
  // MXRF11 real: único FFO negativo é 2016-12, fora dos 12 trimestres exibidos.
  // O aviso não pode disparar apontando para algo que não está na tela — foi
  // exatamente esse o defeito da legenda do gráfico antigo.
  const ffo=[{mes:"2016-12",valor:-155513142}],div=[{mes:"2016-12",valor:1}];
  for(let i=0;i<12;i++){const y=2023+Math.floor(i/4),m=String((i%4)*3+3).padStart(2,"0");
    ffo.push({mes:`${y}-${m}`,valor:100}); div.push({mes:`${y}-${m}`,valor:100});}
  const r=coberturaFfoFii(ffo,div);
  assert.equal(r.janela,12);
  assert.equal(r.tem_ffo_negativo,false);             // o negativo ficou fora
  assert.equal(r.soma_ffo,1200);                      // e não contaminou o agregado
});

test("FII FFO: janela padrão 12 e o rótulo reflete a quantidade REAL", ()=>{
  const ffo=[],div=[];
  for(let i=0;i<38;i++){const y=2017+Math.floor(i/4),m=String((i%4)*3+3).padStart(2,"0");
    ffo.push({mes:`${y}-${m}`,valor:100}); div.push({mes:`${y}-${m}`,valor:100});}
  const r=coberturaFfoFii(ffo,div);
  assert.equal(r.linhas.length,12);
  assert.equal(r.janela,12);                          // rótulo usa isto
  // série curta: janela reporta o que existe, não o pedido
  const curta=coberturaFfoFii(ffo.slice(-5),div.slice(-5));
  assert.equal(curta.janela,5);
});

test("FII FFO: linhas vêm mais recente primeiro", ()=>{
  const r=coberturaFfoFii(
    [{mes:"2025-09",valor:1},{mes:"2025-12",valor:2},{mes:"2026-03",valor:3}],
    [{mes:"2025-09",valor:1},{mes:"2025-12",valor:2},{mes:"2026-03",valor:3}]);
  assert.deepEqual(r.linhas.map(l=>l.mes),["2026-03","2025-12","2025-09"]);
});

test("FII FFO: sem distribuição alguma na janela devolve null, não zero", ()=>{
  const r=coberturaFfoFii([{mes:"2025-12",valor:100}],[{mes:"2025-12",valor:0}]);
  assert.equal(r.cobertura_agregada_pct,null);
  assert.equal(r.alerta,null);
});
