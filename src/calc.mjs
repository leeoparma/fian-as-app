// ============================================================================
// calc.mjs — Matemática pura do Controle Financeiro
// Regra da casa: funções SEM tela, SEM rede, SEM estado. Entradas → saídas.
// Toda função aqui é coberta por tests/calc.test.mjs (rode: node --test tests/)
// A matemática foi COPIADA do App.jsx — comportamento idêntico ao app.
// ============================================================================

// ── Constantes de negócio ────────────────────────────────────────────────────
// Movimentos internos: não são receita nem despesa de verdade (não entram nos totais)
export const CAT_INTERNAS=["Transferência","Aplicação","Resgate"];
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
