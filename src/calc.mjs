// ============================================================================
// calc.mjs — Matemática pura do Controle Financeiro
// Regra da casa: funções SEM tela, SEM rede, SEM estado. Entradas → saídas.
// Toda função aqui é coberta por tests/calc.test.mjs (rode: node --test tests/)
// A matemática foi COPIADA do App.jsx — comportamento idêntico ao app.
// ============================================================================

// ── Constantes de negócio ────────────────────────────────────────────────────
// Movimentos internos: não são receita nem despesa de verdade (não entram nos totais)
export const CAT_INTERNAS=["Transferência","Aplicação","Resgate","Pagamento de fatura"];
// Taxas anuais de referência usadas na renda fixa e no simulador (estáticas)
export const INDICES_RATE={CDI:10.5,Selic:10.5,IPCA:4.62,IGPM:5.1};

// ── Cartão de crédito — ciclo de fatura ──────────────────────────────────────
// Regra: compra NO DIA do fechamento (ou antes) entra naquela fatura; depois, na próxima.
export function _clampDia(year,month,dia){const last=new Date(year,month+1,0).getDate();return new Date(year,month,Math.min(dia,last));}
export function _ymdC(d){const p=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;}
export function _ddmm(d){return d?`${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`:"—";}
export function faturaDeCompra(diaFecha,dataStr){const d=new Date(dataStr+"T00:00:00");let c=_clampDia(d.getFullYear(),d.getMonth(),diaFecha);if(d>c)c=_clampDia(d.getFullYear(),d.getMonth()+1,diaFecha);return c;}
export function vencimentoDe(fechaDate,diaFecha,diaVence){if(diaVence>=diaFecha)return _clampDia(fechaDate.getFullYear(),fechaDate.getMonth(),diaVence);return _clampDia(fechaDate.getFullYear(),fechaDate.getMonth()+1,diaVence);}
export function faturaAbertaHoje(diaFecha,hojeD){const h=new Date(hojeD);h.setHours(0,0,0,0);let fecha=_clampDia(h.getFullYear(),h.getMonth(),diaFecha);if(h>fecha)fecha=_clampDia(h.getFullYear(),h.getMonth()+1,diaFecha);return fecha;}

// Soma paga de fatura de um cartão específico (perna "receita" do pagamento, ver App.jsx doPagarFatura)
export function totalPagoFatura(transacoes,cartaoId){
  return (transacoes||[]).filter(t=>t&&t.tipo==="receita"&&t.categoria==="Pagamento de fatura"&&t.bancoId===cartaoId).reduce((a,t)=>a+(t.valor||0),0);
}
// Abatimento em cascata: quita a fatura fechada mais antiga não paga primeiro, excedente abate a
// aberta, sobra vira crédito para a próxima. `faturas` deve vir ordenada (mais antiga → mais nova,
// como já produz o agrupamento de CartaoTab); faturas "futura" não consomem o total pago aqui.
export function calcFaturaPagamentos(faturas,totalPago){
  let saldo=totalPago||0;
  const porFatura=(faturas||[]).map(f=>{
    if(f.status==="futura")return {...f,pago:0,restante:f.total};
    const pago=Math.min(saldo,f.total);
    saldo-=pago;
    return {...f,pago,restante:Math.round((f.total-pago)*100)/100};
  });
  return {porFatura,creditoDisponivel:Math.round(saldo*100)/100};
}

// ── Renda fixa e impostos ────────────────────────────────────────────────────
export function calcRFAnual(inv){const indice=inv.indice||"CDI",taxa=parseFloat(inv.taxaRF)||0,pct=parseFloat(inv.pctIndice)||100;if(indice==="Prefixado")return taxa;const base=INDICES_RATE[indice]||10.5;return inv.rfTipo==="pct"?base*(pct/100):base+taxa;}
// `agora` é parâmetro (default = hoje) só para permitir teste determinístico.
export function calcValorAtualRF(inv,agora=new Date()){const anos=(agora-new Date(inv.data))/(1000*60*60*24*365);return(inv.valorInvestido||inv.valor||0)*Math.pow(1+calcRFAnual(inv)/100,Math.max(0,anos));}
export function calcImpostoBR(r,m){if(r<=0)return 0;if(m<=6)return r*0.225;if(m<=12)return r*0.20;if(m<=24)return r*0.175;return r*0.15;}
export function calcImpostoAU(r,m){if(r<=0)return 0;return(m>=12?r*0.5:r)*0.325;}

// ── Investimentos ────────────────────────────────────────────────────────────
// Preço médio ponderado ao aportar mais unidades numa posição existente
export function aporteMedio(qtdAntiga,pmAntigo,qtdNova,precoNovo){
  const custoAntigo=(pmAntigo||0)*(qtdAntiga||0);
  const custoNovo=precoNovo*qtdNova;
  const qtdTotal=(qtdAntiga||0)+qtdNova;
  const pmNovo=qtdTotal>0?(custoAntigo+custoNovo)/qtdTotal:precoNovo;
  return {qtdTotal,pmNovo,custoTotal:custoAntigo+custoNovo};
}

// ── Proventos ────────────────────────────────────────────────────────────────
export function totalProventoAgendado(a){return (parseFloat(a.valorAcao)||0)*(parseFloat(a.quantidade)||0);}
// Dias (inteiros, calendário local) até uma data "YYYY-MM-DD". null se inválida.
export function diasAte(dataStr,hoje=new Date()){
  const [y,m,d]=(dataStr||"").split("-").map(Number);
  if(!y)return null;
  const h0=new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate());
  return Math.round((new Date(y,m-1,d)-h0)/864e5);
}

// ── Transações / totais ──────────────────────────────────────────────────────
// Totais de receita e despesa EXCLUINDO categorias internas
export function totaisTransacoes(txs){
  let receitas=0,despesas=0;
  for(const t of (txs||[])){
    if(!t||CAT_INTERNAS.includes(t.categoria))continue;
    if(t.tipo==="receita")receitas+=(t.valor||0);
    else if(t.tipo==="despesa")despesas+=(t.valor||0);
  }
  return {receitas,despesas};
}
// Saldo de um banco: inicial + receitas − despesas (das transações vinculadas a ele)
export function saldoBanco(b,transacoes){
  const txs=(transacoes||[]).filter(t=>t.bancoId===b.id);
  return(b.saldoInicial||0)+txs.filter(t=>t.tipo==="receita").reduce((a,x)=>a+x.valor,0)-txs.filter(t=>t.tipo==="despesa").reduce((a,x)=>a+x.valor,0);
}

// ── Parcelamento ─────────────────────────────────────────────────────────────
// Valor da parcela k (0-based): últimas centavos vão na última parcela
export function parcelaValor(valorTotal,np,k){
  const base=Math.round(valorTotal/np*100)/100;
  return k===np-1?Math.round((valorTotal-base*(np-1))*100)/100:base;
}
// Data da parcela k a partir da data inicial, preservando o dia (com clamp de fim de mês)
export function parcelaData(inicioStr,k){
  const [iy,im,id]=inicioStr.split("-").map(Number);
  const tm=im-1+k, ty=iy+Math.floor(tm/12), tmo=((tm%12)+12)%12;
  const lastDay=new Date(ty,tmo+1,0).getDate(), dd=Math.min(id,lastDay);
  return `${ty}-${String(tmo+1).padStart(2,"0")}-${String(dd).padStart(2,"0")}`;
}

// ── Splitwise ────────────────────────────────────────────────────────────────
// Saldo líquido por pessoa: + o que pagou, − a parte que consumiu, ± pagamentos de acerto
export function calcSaldos(src){
  if(!src)return {};
  const saldos={};
  (src.membros||[]).forEach(m=>{if(m&&m.nome)saldos[m.nome]=0;});
  (src.despesas||[]).forEach(d=>{
    if(!d)return;
    if(d.pagoPor)saldos[d.pagoPor]=(saldos[d.pagoPor]||0)+(d.valor||0);
    (d.divisao||[]).forEach(div=>{
      const nome=typeof div==="string"?div:div?.nome;
      const qto=typeof div==="string"?((d.valor||0)/((d.divisao||[]).length||1)):(div?.valor||0);
      if(nome)saldos[nome]=(saldos[nome]||0)-qto;
    });
  });
  (src.pagamentos||[]).forEach(p=>{if(!p)return;if(p.de)saldos[p.de]=(saldos[p.de]||0)+(p.valor||0);if(p.para)saldos[p.para]=(saldos[p.para]||0)-(p.valor||0);});
  return saldos;
}
// Liquidação: menor conjunto de transferências que zera os saldos
export function calcDividas(src){
  const saldos=calcSaldos(src);
  const devedores=Object.entries(saldos).filter(([,v])=>v<-0.01).map(([n,v])=>({nome:n,valor:-v}));
  const credores=Object.entries(saldos).filter(([,v])=>v>0.01).map(([n,v])=>({nome:n,valor:v}));
  const transacoes=[];const dev=[...devedores],cred=[...credores];
  while(dev.length&&cred.length){
    const d=dev[0],c=cred[0],v=Math.min(d.valor,c.valor);
    if(v>0.01)transacoes.push({de:d.nome,para:c.nome,valor:v});
    d.valor-=v;c.valor-=v;
    if(d.valor<0.01)dev.shift();if(c.valor<0.01)cred.shift();
  }
  return transacoes;
}
export function totaisPorPessoa(src){
  const t={};
  (src?.membros||[]).forEach(m=>{if(m&&m.nome)t[m.nome]={pagou:0,consumiu:0};});
  (src?.despesas||[]).forEach(d=>{
    if(!d)return;
    if(d.pagoPor&&t[d.pagoPor])t[d.pagoPor].pagou+=(d.valor||0);
    (d.divisao||[]).forEach(div=>{const n=typeof div==="string"?div:div?.nome;const q=typeof div==="string"?((d.valor||0)/((d.divisao||[]).length||1)):(div?.valor||0);if(n&&t[n])t[n].consumiu+=q;});
  });
  return t;
}

// ── Orçamento / salário ──────────────────────────────────────────────────────
export function salarioMensal(valor,freq){
  if(!valor||valor<=0)return 0;
  return freq==="semanal"?valor*52/12:freq==="quinzenal"?valor*26/12:freq==="anual"?valor/12:valor;
}

// ── Câmbio (consolidado multi-país) ──────────────────────────────────────────
// cambio = {brl,aud,usd} = valor de 1 unidade de cada moeda EM BRL
export function converteMoeda(valor,de,para,cambio){
  if(!cambio)return null;
  const emBRL={br:cambio.brl,au:cambio.aud,us:cambio.usd};
  const moedaParaBRL={BRL:cambio.brl,AUD:cambio.aud,USD:cambio.usd};
  const valorBRL=valor*(emBRL[de]||1);
  return valorBRL/(moedaParaBRL[para]||1);
}

// ── Simulador de juros compostos ─────────────────────────────────────────────
export function taxaMensalSim(tipo,taxa,indice,pctInd){
  if(tipo==="fixo")return parseFloat(taxa)/100;
  const base=INDICES_RATE[indice]||10.5;
  const anual=tipo==="pct"?base*(parseFloat(pctInd)||100)/100:base+parseFloat(taxa||0);
  return Math.pow(1+anual/100,1/12)-1;
}
export function simularJuros(ini,ap,meses,tm){
  let saldo=ini;const pts=[{mes:0,saldo:Math.round(ini)}];
  for(let i=1;i<=meses;i++){saldo=saldo*(1+tm)+ap;if(i%(Math.max(1,Math.floor(meses/12)))===0||i===meses)pts.push({mes:i,saldo:Math.round(saldo)});}
  const rendimento=saldo-(ini+ap*meses);
  return {saldo,pts,rendimento,aportado:ini+ap*meses};
}

// ── Backup: snapshots sem fotos (e mescla de volta ao restaurar) ─────────────
// As fotos de NF (base64, 1–5MB cada) NÃO entram no snapshot — senão cada
// backup diário carregaria megabytes. Ao restaurar, as fotos que existem nos
// dados atuais são devolvidas às transações correspondentes (por id).
export function semFotos(all){
  const out={};
  for(const k of Object.keys(all||{})){
    const p=all[k];
    if(!p||typeof p!=="object"||Array.isArray(p)){out[k]=p;continue;}
    out[k]={...p,transacoes:(p.transacoes||[]).map(t=>t&&t.nfImg?{...t,nfImg:null}:t)};
  }
  return out;
}
export function mesclarFotos(backup,atual){
  const fotos={};
  for(const k of Object.keys(atual||{})){
    for(const t of (atual[k]?.transacoes||[]))if(t&&t.id&&t.nfImg)fotos[t.id]=t.nfImg;
  }
  const out={};
  for(const k of Object.keys(backup||{})){
    const p=backup[k];
    if(!p||typeof p!=="object"||Array.isArray(p)){out[k]=p;continue;}
    out[k]={...p,transacoes:(p.transacoes||[]).map(t=>t&&t.id&&!t.nfImg&&fotos[t.id]?{...t,nfImg:fotos[t.id]}:t)};
  }
  return out;
}

// ── Projeção de fluxo de caixa ───────────────────────────────────────────────
export function addDias(dataStr,n){const[y,m,d]=dataStr.split("-").map(Number);const dt=new Date(y,m-1,d+n);return _ymdC(dt);}
// Datas futuras (1..dias a partir de hoje) em que uma recorrência ocorre
export function ocorrenciasRecorrencia(rec,hojeStr,dias){
  const out=[];const[hy,hm,hd]=hojeStr.split("-").map(Number);const hojeD=new Date(hy,hm-1,hd);
  const freq=rec.frequencia||"mensal";
  // Com "primeira parcela" (inicio): a âncora é exata para qualquer frequência
  if(rec.inicio){
    const fim=addDias(hojeStr,dias);
    const passo=freq==="quinzenal"?14:freq==="semanal"?7:0;
    if(passo>0){
      let cur=rec.inicio;
      for(let k=0;k<600;k++){if(cur>fim)break;if(cur>hojeStr)out.push(cur);cur=addDias(cur,passo);}
    }else{
      const[iy,im,id]=rec.inicio.split("-").map(Number);
      for(let k=0;k<Math.ceil(dias/28)+14;k++){
        const s=_ymdC(_clampDia(iy,im-1+k,id));
        if(s>fim)break;
        if(s>hojeStr)out.push(s);
      }
    }
    return out;
  }
  if(freq==="semanal"||freq==="quinzenal"){
    const alvo=rec.diaSemana!=null?rec.diaSemana:1;
    const passoDias=freq==="quinzenal"?14:7;
    let ultimo=null;
    for(let n=1;n<=dias;n++){
      const dt=new Date(hy,hm-1,hd+n);
      if(dt.getDay()!==alvo)continue;
      const s=_ymdC(dt);
      if(ultimo&&diasAte(s,new Date(ultimo+"T00:00:00"))<passoDias)continue; // quinzenal sem âncora: fase aproximada
      out.push(s);ultimo=s;
    }
  }else{
    for(let k=0;k<=Math.ceil(dias/28)+1;k++){
      const s=_ymdC(_clampDia(hy,hm-1+k,rec.dia||1));
      const off=diasAte(s,hojeD);
      if(off>=1&&off<=dias)out.push(s);
    }
  }
  return out;
}
// Projeta o saldo em caixa dia a dia:
//  saldoHoje + transações FUTURAS já lançadas (parcelas etc.) + recorrências
//  (puladas se a transação daquela data já existe — evita contar 2x) +
//  salário declarado distribuído por dia (mensal×12÷365).
export function projetarFluxo({saldoHoje,hojeStr,dias=90,txs=[],recorrencias=[],salarioMes=0}){
  const[hy,hm,hd]=hojeStr.split("-").map(Number);const hojeD=new Date(hy,hm-1,hd);
  const deltas=new Array(dias+1).fill(0);
  const jaLancada=new Set();
  for(const t of txs){
    if(!t||!t.data)continue;
    if(t.recorrenciaId)jaLancada.add(`${t.recorrenciaId}|${t.data}`);
    const off=diasAte(t.data,hojeD);
    if(off==null||off<1||off>dias)continue;
    deltas[off]+=(t.tipo==="receita"?1:-1)*(t.valor||0);
  }
  for(const rec of(recorrencias||[])){
    for(const dstr of ocorrenciasRecorrencia(rec,hojeStr,dias)){
      if(jaLancada.has(`${rec.id}|${dstr}`))continue;
      const off=diasAte(dstr,hojeD);
      if(off>=1&&off<=dias)deltas[off]+=(rec.tipo==="receita"?1:-1)*(rec.valor||0);
    }
  }
  const salDia=salarioMes>0?salarioMes*12/365:0;
  let saldo=saldoHoje;const diario=[{off:0,saldo}];let minimo={off:0,saldo};
  for(let n=1;n<=dias;n++){
    saldo+=deltas[n]+salDia;
    diario.push({off:n,saldo});
    if(saldo<minimo.saldo)minimo={off:n,saldo};
  }
  const em=n=>diario[Math.min(n,dias)].saldo;
  return{diario,minimo:{...minimo,data:addDias(hojeStr,minimo.off)},d30:em(30),d60:em(60),d90:em(90)};
}

// ── Importação de extrato: marcação de duplicatas (conciliação) ──────────────
// Duplicata = mesma data + mesmo tipo + mesmo valor (em centavos), contra os
// lançamentos do MESMO banco (ou sem banco definido). Conta ocorrências:
// se o extrato tem 2 pedágios iguais no dia e o app já tem 1, marca só 1.
export function marcarDuplicatas(candidatas,existentes,bancoId){
  const chave=t=>`${t.data}|${t.tipo}|${Math.round((t.valor||0)*100)}`;
  const pool=new Map();
  for(const t of (existentes||[])){
    if(!t)continue;
    if(bancoId&&t.bancoId&&t.bancoId!==bancoId)continue; // outro banco não conta
    const k=chave(t);pool.set(k,(pool.get(k)||0)+1);
  }
  return (candidatas||[]).map(c=>{
    const k=chave(c);const n=pool.get(k)||0;
    if(n>0){pool.set(k,n-1);return {...c,dup:true};}
    return {...c,dup:false};
  });
}

// ── Push: agenda de avisos (próximos N dias) ─────────────────────────────────
// Gera as linhas que o app grava em push_agenda: proventos agendados e contas
// recorrentes (despesas) que ocorrem na janela. O cron do worker envia o push
// na manhã do dia (notify_on <= hoje e ainda não enviado).
export function montarAgendaPush({proventosAgendados=[],recorrencias=[],hojeStr,dias=7}){
  const[y,m,d]=hojeStr.split("-").map(Number);const hojeD=new Date(y,m-1,d);
  const ev=[];
  for(const a of (proventosAgendados||[])){
    if(!a||!a.dataPagamento)continue;
    const off=diasAte(a.dataPagamento,hojeD);
    if(off!=null&&off>=0&&off<=dias)ev.push({notify_on:a.dataPagamento,titulo:`💰 Provento: ${a.ticker||"ativo"}`});
  }
  for(const rec of (recorrencias||[])){
    if(!rec||rec.tipo!=="despesa")continue;
    for(const dstr of ocorrenciasRecorrencia(rec,hojeStr,dias)){
      ev.push({notify_on:dstr,titulo:`📅 ${rec.descricao||"Conta recorrente"}`});
    }
  }
  // 📊 Relatório mensal: aviso na manhã do dia 1 (o do mês que fechou)
  const[ay,am]=hojeStr.split("-").map(Number);
  const cand=[];
  if(hojeStr.endsWith("-01"))cand.push(hojeStr);
  cand.push(_ymdC(new Date(ay,am,1))); // dia 1 do mês seguinte
  for(const d1 of cand){
    const off=diasAte(d1,new Date(ay,am-1,Number(hojeStr.slice(8,10))));
    if(off!=null&&off>=0&&off<=dias&&!ev.some(e=>e.notify_on===d1&&e.titulo.startsWith("📊")))
      ev.push({notify_on:d1,titulo:"📊 Relatório mensal pronto"});
  }
  return ev.sort((a,b)=>a.notify_on.localeCompare(b.notify_on));
}

// ── Compra e venda de ações com corretagem ───────────────────────────────────
// Convenção da corretora: o preço médio é a média de EXECUÇÃO (a corretagem
// NÃO entra no PM). A corretagem é lançada à parte como despesa real
// ("Corretagem") — assim o PM do app bate com o da corretora, o caixa fecha
// e o custo com taxas fica visível. O valor da taxa fica no histórico
// (base de custo fiscal reconstruível).
export function compraAcao(qtdAntiga,pmAntigo,qtdNova,preco,corretagem){
  const investido=qtdNova*preco;                       // vai para a posição
  const totalPago=investido+(corretagem||0);           // sai da conta
  const custoAntigo=(pmAntigo||0)*(qtdAntiga||0);
  const qtdTotal=(qtdAntiga||0)+qtdNova;
  const pmNovo=qtdTotal>0?(custoAntigo+investido)/qtdTotal:0;
  return {qtdTotal,pmNovo,custoTotal:custoAntigo+investido,investido,totalPago};
}
export function vendaAcao(qtdAtual,pm,qtdVendida,preco,corretagem){
  const q=Math.min(qtdVendida||0,qtdAtual||0);
  const recebidoBruto=q*preco;                         // vira o "Resgate"
  const recebidoLiquido=recebidoBruto-(corretagem||0); // o que entra de fato
  const custoVendido=(pm||0)*q;
  return {qtdRestante:(qtdAtual||0)-q,recebidoBruto,recebidoLiquido,custoVendido,resultado:recebidoBruto-custoVendido,vendeuTudo:((qtdAtual||0)-q)<=1e-9};
}

// ── Splitwise: despesas recorrentes ──────────────────────────────────────────
// Datas de ocorrência de uma recorrência, do início até hoje (inclusive).
// semanal = a cada 7 dias · quinzenal = a cada 14 · mensal = mesmo dia (com
// clamp de fim de mês: dia 31 vira 28/29/30 quando o mês não tem 31).
export function ocorrenciasSWAte(inicio,freq,hojeStr,maxIter=600){
  const out=[];
  if(!inicio||!hojeStr||inicio>hojeStr)return out;
  const [iy,im,id]=inicio.split("-").map(Number);
  if(freq==="mensal"){
    for(let k=0;k<maxIter;k++){
      const d=_clampDia(iy,im-1+k,id);
      const s=_ymdC(d);
      if(s>hojeStr)break;
      out.push(s);
    }
  }else{
    const passo=freq==="quinzenal"?14:7;
    let cur=inicio;
    for(let k=0;k<maxIter;k++){
      if(cur>hojeStr)break;
      out.push(cur);
      cur=addDias(cur,passo);
    }
  }
  return out;
}
// Quais ocorrências ainda NÃO viraram despesa (chave: recorrenciaId|data).
// É o que impede lançamento duplicado quando duas pessoas abrem o app.
export function pendentesRecorrenciaSW(rec,hojeStr,jaLancadas){
  if(!rec||!rec.id||rec.pausada)return [];
  const feitas=jaLancadas instanceof Set?jaLancadas:new Set(jaLancadas||[]);
  return ocorrenciasSWAte(rec.inicio,rec.frequencia||"mensal",hojeStr)
    .filter(d=>!feitas.has(`${rec.id}|${d}`));
}

// ── Relatório mensal ─────────────────────────────────────────────────────────
// Fecha o mês: recebido/gasto, maiores gastos, renda fixa (rendimento do mês
// por CÁLCULO — determinístico, sem snapshot) e ações (variação do mês via
// snapshots de fim de mês, descontando aportes e somando vendas do período).
export function relatorioMensal({mesKey,transacoes=[],investimentos=[],snapIni=null,snapFim=null}){
  const txs=(transacoes||[]).filter(t=>t&&t.data&&t.data.startsWith(mesKey));
  const {receitas,despesas}=totaisTransacoes(txs);
  const gastos=txs.filter(t=>t.tipo==="despesa"&&!CAT_INTERNAS.includes(t.categoria));
  const porCat={};
  for(const t of gastos){const c=t.categoria||"Outros";porCat[c]=(porCat[c]||0)+(t.valor||0);}
  const todasCategorias=Object.entries(porCat).map(([categoria,total])=>({categoria,total,pct:despesas>0?total/despesas*100:0})).sort((a,b)=>b.total-a.total);
  const topCategorias=todasCategorias.slice(0,5);
  // Fixos (lançados por recorrência) vs variáveis — a parte do gasto que você controla
  const fixos=gastos.filter(t=>t.recorrenciaId).reduce((a,t)=>a+(t.valor||0),0);
  const variaveis=despesas-fixos;
  const poupancaPct=receitas>0?(receitas-despesas)/receitas*100:null;
  const topLancamentos=[...gastos].sort((a,b)=>(b.valor||0)-(a.valor||0)).slice(0,5).map(t=>({descricao:t.descricao,valor:t.valor,data:t.data,categoria:t.categoria}));
  const [y,m]=mesKey.split("-").map(Number);
  const fimD=new Date(y,m,0), iniD=new Date(y,m-1,0);   // último dia do mês / do anterior
  const fimStr=_ymdC(fimD);
  const rf=(investimentos||[]).filter(i=>i&&((i.taxaRF!=null&&i.taxaRF!=="")||i.indice)&&i.data&&i.data<=fimStr).map(i=>{
    const vFim=calcValorAtualRF(i,fimD), vIni=calcValorAtualRF(i,iniD);
    const investido=(i.valorInvestido||i.valor||0);
    return {descricao:i.descricao||i.ticker||"Renda fixa",rendMes:vFim-vIni,acumulado:vFim-investido,valorFim:vFim};
  });
  const rfTotalMes=rf.reduce((a,x)=>a+x.rendMes,0);
  const temBaseAcoes=Array.isArray(snapIni)&&Array.isArray(snapFim);
  const acoes=[];
  if(temBaseAcoes){
    for(const f of snapFim){
      if(!f||!f.id||!(f.quantidade>0))continue;
      const ini=snapIni.find(x=>x&&x.id===f.id);
      const inv=(investimentos||[]).find(x=>x&&x.id===f.id);
      const aportesMes=(inv?.aportes||[]).filter(a=>a&&a.data&&a.data.startsWith(mesKey)).reduce((s,a)=>s+(a.quantidade||0)*(a.preco||0),0);
      const vendasMes=(inv?.vendas||[]).filter(v=>v&&v.data&&v.data.startsWith(mesKey)).reduce((s,v)=>s+(v.quantidade||0)*(v.preco||0),0);
      const nome=f.ticker||f.descricao||"ativo";
      if(!ini){acoes.push({nome,valorFim:f.valorAtual||0,ganho:null,novo:true});continue;}
      acoes.push({nome,valorFim:f.valorAtual||0,ganho:(f.valorAtual||0)-(ini.valorAtual||0)-aportesMes+vendasMes});
    }
    acoes.sort((a,b)=>Math.abs(b.ganho||0)-Math.abs(a.ganho||0));
  }
  const acoesTotalGanho=acoes.reduce((a,x)=>a+(x.ganho||0),0);
  return {receitas,despesas,saldoMes:receitas-despesas,topCategorias,todasCategorias,topLancamentos,fixos,variaveis,poupancaPct,rf,rfTotalMes,acoes,acoesTotalGanho,temBaseAcoes};
}

// Compara dois relatórios mensais (atual vs anterior) — deltas e percentuais.
// pct é null quando não há base de comparação (anterior zero/ausente).
export function compararMeses(atual,anterior){
  const d=(a,b)=>({delta:a-(b||0),pct:(b>0)?((a-b)/b*100):null});
  const antCat={};
  for(const c of (anterior?.todasCategorias||[]))antCat[c.categoria]=c.total;
  return {
    temBase:!!anterior&&((anterior.receitas||0)>0||(anterior.despesas||0)>0),
    receitas:d(atual.receitas,anterior?.receitas),
    despesas:d(atual.despesas,anterior?.despesas),
    saldo:{delta:atual.saldoMes-(anterior?.saldoMes||0),pct:null},
    categorias:Object.fromEntries((atual.todasCategorias||[]).map(c=>[c.categoria,d(c.total,antCat[c.categoria])])),
  };
}

// ── Relatório: curva do gasto acumulado dia a dia ────────────────────────────
// Uma linha por dia do mês com o total gasto até ali (exclui categorias
// internas). Comparada com a do mês anterior, mostra o RITMO do gasto.
export function serieGastoAcumulado(transacoes,mesKey){
  const [y,m]=mesKey.split("-").map(Number);
  const ultimo=new Date(y,m,0).getDate();
  const porDia=new Array(ultimo+1).fill(0);
  for(const t of (transacoes||[])){
    if(!t||t.tipo!=="despesa"||!t.data||!t.data.startsWith(mesKey))continue;
    if(CAT_INTERNAS.includes(t.categoria))continue;
    const d=Math.min(ultimo,Math.max(1,parseInt(t.data.slice(8,10))||1));
    porDia[d]+=(t.valor||0);
  }
  let acc=0;const serie=[];
  for(let d=1;d<=ultimo;d++){acc+=porDia[d];serie.push({dia:d,acumulado:Math.round(acc*100)/100});}
  return serie;
}

// ── Extrato com saldo corrente ───────────────────────────────────────────────
// Igual ao extrato do banco: cada linha mostra o saldo APÓS o lançamento.
// Ordena por data (empate: ordem de criação) e devolve do mais recente para
// o mais antigo. INVARIANTE: o saldo da primeira linha = saldoBancoCalc.
export function extratoComSaldo(banco,transacoes){
  const doBanco=(transacoes||[]).map((t,i)=>({t,i})).filter(x=>x.t&&x.t.bancoId===banco.id);
  doBanco.sort((a,b)=>((a.t.data||"").localeCompare(b.t.data||""))||(a.i-b.i));
  let s=banco.saldoInicial||0;
  const out=doBanco.map(({t})=>{
    s+=t.tipo==="receita"?(t.valor||0):-(t.valor||0);
    return {...t,saldoApos:Math.round(s*100)/100};
  });
  return out.reverse();
}

// ── Rentabilidade da Renda Fixa (dia · mês · ano · desde o início) ───────────
// Usa calcValorAtualRF (determinístico, sem depender de snapshot) para achar
// o valor total da carteira RF em qualquer instante do passado.
function _valorTotalRF(rf,data){return (rf||[]).reduce((a,i)=>a+calcValorAtualRF(i,data),0);}
export function rentabilidadeRF(investimentosRF,hoje=new Date()){
  const rf=(investimentosRF||[]).filter(Boolean);
  const hj=new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate());
  const ontem=new Date(hj);ontem.setDate(ontem.getDate()-1);
  const inicioMes=new Date(hj.getFullYear(),hj.getMonth(),1);
  const inicioAno=new Date(hj.getFullYear(),0,1);
  const vHoje=_valorTotalRF(rf,hj);
  const investidoTotal=rf.reduce((a,i)=>a+(i.valorInvestido||i.valor||0),0);
  const calc=(base)=>{const v=_valorTotalRF(rf,base);return {valor:vHoje-v,pct:v>0?(vHoje-v)/v*100:null};};
  return {
    valorTotal:Math.round(vHoje*100)/100,
    dia:calc(ontem),
    mes:calc(inicioMes),
    ano:calc(inicioAno),
    desdeInicio:{valor:vHoje-investidoTotal,pct:investidoTotal>0?(vHoje-investidoTotal)/investidoTotal*100:null},
  };
}
// Curva diária de rentabilidade (%) entre duas datas — para o gráfico "no mês/no ano".
// pct de cada dia é relativo ao valor do PRIMEIRO dia da série (a "baseline").
export function serieRentabilidadeRF(investimentosRF,inicio,fim){
  const rf=(investimentosRF||[]).filter(Boolean);
  const ini=new Date(inicio.getFullYear(),inicio.getMonth(),inicio.getDate());
  const fimD=new Date(fim.getFullYear(),fim.getMonth(),fim.getDate());
  const base=_valorTotalRF(rf,ini);
  const out=[];
  for(let d=new Date(ini);d<=fimD;d.setDate(d.getDate()+1)){
    const v=_valorTotalRF(rf,d);
    out.push({data:_ymdC(d),valor:Math.round(v*100)/100,pct:base>0?Math.round((v-base)/base*100*10000)/10000:0});
  }
  return out;
}

// ── Composição da carteira de ações (para o donut) ───────────────────────────
// % de cada ativo sobre o total investido em renda variável (não-RF).
export function composicaoAcoes(investimentos){
  const acoes=(investimentos||[]).filter(i=>i&&!((i.taxaRF!=null&&i.taxaRF!=="")||i.indice));
  const itens=acoes.map(i=>({ticker:i.ticker||i.descricao||"Ativo",valor:i.valorAtual||i.valorInvestido||i.valor||0}))
    .filter(x=>x.valor>0.005);
  const total=itens.reduce((a,x)=>a+x.valor,0);
  return itens.map(x=>({...x,pct:total>0?x.valor/total*100:0})).sort((a,b)=>b.valor-a.valor);
}
