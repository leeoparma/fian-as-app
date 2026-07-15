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
  semFotos,mesclarFotos,projetarFluxo,ocorrenciasRecorrencia,addDias,marcarDuplicatas,montarAgendaPush,compraAcao,vendaAcao,
  ocorrenciasSWAte,pendentesRecorrenciaSW,relatorioMensal,compararMeses,serieGastoAcumulado,extratoComSaldo,
rentabilidadeRF,serieRentabilidadeRF,composicaoAcoes,
rentabilidadeAcoesDesdeInicio,ganhoAcoesEntreSnapshots,rentabilidadeAcoes,isRFAtivo,calcValorLiquidoRF,
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
test("RF anual: 102% do CDI (10.5) = 10.71", ()=>{
  aprox(calcRFAnual({indice:"CDI",rfTipo:"pct",pctIndice:"102"}),10.71);
});
test("RF anual: IPCA (4.62) + 9 = 13.62", ()=>{
  aprox(calcRFAnual({indice:"IPCA",rfTipo:"mais",taxaRF:"9"}),13.62);
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
  aprox(taxaMensalSim("pct",null,"CDI","102"),Math.pow(1+10.71/100,1/12)-1,0.0001);
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
  aprox(R.valorLiquido,R.valorBruto-R.imposto,0.01);
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
