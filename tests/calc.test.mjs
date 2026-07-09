// ============================================================================
// Testes da matemática do Controle Financeiro — rode: node --test tests/
// Cada teste fixa um comportamento: se uma edição futura mudar uma conta,
// o GitHub Actions marca ❌ no commit antes de você confiar no número.
// ============================================================================
import {test} from "node:test";
import assert from "node:assert/strict";
import {
  CAT_INTERNAS,_ymdC,faturaDeCompra,vencimentoDe,faturaAbertaHoje,
  calcRFAnual,calcValorAtualRF,calcImpostoBR,calcImpostoAU,
  aporteMedio,totalProventoAgendado,diasAte,
  totaisTransacoes,saldoBanco,parcelaValor,parcelaData,
  calcSaldos,calcDividas,totaisPorPessoa,
  salarioMensal,converteMoeda,taxaMensalSim,simularJuros,
  semFotos,mesclarFotos,projetarFluxo,ocorrenciasRecorrencia,addDias,marcarDuplicatas,montarAgendaPush,compraAcao,vendaAcao,
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
test("totais: Transferência/Aplicação/Resgate não inflam receita nem despesa", ()=>{
  const txs=[
    {tipo:"receita",valor:1000,categoria:"Salário"},
    {tipo:"despesa",valor:200,categoria:"Mercado"},
    {tipo:"despesa",valor:500,categoria:"Transferência"},
    {tipo:"receita",valor:500,categoria:"Transferência"},
    {tipo:"despesa",valor:300,categoria:"Aplicação"},
    {tipo:"receita",valor:150,categoria:"Resgate"},
  ];
  const {receitas,despesas}=totaisTransacoes(txs);
  aprox(receitas,1000);aprox(despesas,200);
  assert.deepEqual(CAT_INTERNAS,["Transferência","Aplicação","Resgate"]);
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
