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
// Taxas anuais aproximadas (%). Atualizado manualmente — não há fonte ao vivo.
// Verificado em 15/07/2026: Selic 14,25% (Copom, reunião de 17/06/2026), CDI
// ~14,15% (acompanha a Selic de perto), IPCA 4,64% (acum. 12m, IBGE, jun/2026).
// LIMITE HONESTO: isto é uma taxa ÚNICA e FIXA aplicada a todo o período da
// aplicação — não reconstrói a trajetória real (o CDI variou ao longo do
// tempo, inclusive antes desta atualização). Quanto mais antiga a aplicação,
// maior o desvio possível entre o valor calculado aqui e o extrato real do
// banco. Reveja este valor periodicamente (o antigo, 10.5%, ficou defasado
// por meses e foi a causa raiz de uma divergência real relatada em 15/07/2026).
export const INDICES_RATE={CDI:14.15,Selic:14.25,IPCA:4.64,IGPM:5.1};

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
// Único critério correto de RF: o campo `tipo`. NUNCA usar indice/taxaRF para
// classificar — todo ativo (inclusive ações) nasce com indice:"CDI" e
// taxaRF:0 por padrão no formulário, então esses campos sempre existem e um
// filtro baseado neles classifica TUDO como RF por engano (bug real, corrigido
// em 14/07/2026 — atingia também o relatório mensal).
export function isRFAtivo(inv){return !!inv&&(inv.tipo==="Renda Fixa"||inv.tipo==="Tesouro Direto");}
export function calcRFAnual(inv){const indice=inv.indice||"CDI",taxa=parseFloat(inv.taxaRF)||0,pct=parseFloat(inv.pctIndice)||100;if(indice==="Prefixado")return taxa;const base=INDICES_RATE[indice]||10.5;return inv.rfTipo==="pct"?base*(pct/100):base+taxa;}
// `agora` é parâmetro (default = hoje) só para permitir teste determinístico.
export function calcValorAtualRF(inv,agora=new Date()){const anos=(agora-new Date(inv.data))/(1000*60*60*24*365);return(inv.valorInvestido||inv.valor||0)*Math.pow(1+calcRFAnual(inv)/100,Math.max(0,anos));}
export function calcImpostoBR(r,m){if(r<=0)return 0;if(m<=6)return r*0.225;if(m<=12)return r*0.20;if(m<=24)return r*0.175;return r*0.15;}
export function calcImpostoAU(r,m){if(r<=0)return 0;return(m>=12?r*0.5:r)*0.325;}

// Valor líquido de uma RF em BR: desconta o IR regressivo sobre o rendimento
// bruto acumulado até `agora`. Reaproveita calcImpostoBR (mesma tabela oficial
// exibida no extrato do banco: 22,5% até 6m · 20% até 12m · 17,5% até 24m · 15% acima).
// `series` (opcional): quando informado, usa calcValorAtualRFHistorico (série
// real do BCB) para o bruto — MESMO caminho que o card usa. Sem `series`, cai
// na fórmula de taxa fixa (calcValorAtualRF), como antes (bug real, achado em
// 15/07/2026: header/IR/líquido da RF usavam a fórmula enquanto o card já
// usava a série real, e os dois divergiam na mesma tela).
export function calcValorLiquidoRF(inv,agora=new Date(),series=null){
  const valorBruto=series?calcValorAtualRFHistorico(inv,series,agora).valor:calcValorAtualRF(inv,agora);
  const investido=inv.valorInvestido||inv.valor||0;
  const rendimento=valorBruto-investido;
  const dias=Math.max(0,(agora-new Date(inv.data))/86400000);
  const meses=dias/30; // aproximação em meses da tabela regressiva (180/360/720 dias)
  const imposto=calcImpostoBR(rendimento,meses);
  return {
    valorBruto:Math.round(valorBruto*100)/100,
    rendimento:Math.round(rendimento*100)/100,
    imposto:Math.round(imposto*100)/100,
    valorLiquido:Math.round((valorBruto-imposto)*100)/100,
  };
}

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
// ── Trava anti-base64: nada de imagem entra em profiles.data ────────────────
// Incidente 29/06-11/07/2026: UMA foto de NF de 2,82MB morava dentro de
// `transacoes[].nfImg` como data-URL, ou seja, dentro da coluna `data` do
// Supabase — e `supa.load()` faz `select=data` sem filtro, então TODO boot
// baixava os 2,82MB. Custo real medido: 2,13MB por load com gzip (base64 de
// JPEG não comprime), 130× o payload de hoje.
//
// Esta função é o ponto único que impede a recaída. Ela NÃO joga a foto fora:
// devolve o payload limpo E as fotos separadas, para quem chamar enfileirar
// ANTES de gravar. A ordem importa — limpar antes de enfileirar perde a foto.
export function extraiFotosBase64(all){
  const fotos=[];
  const out={};
  for(const k of Object.keys(all||{})){
    const p=all[k];
    if(!p||typeof p!=="object"||Array.isArray(p)){out[k]=p;continue;}
    let mudou=false;
    const txs=(p.transacoes||[]).map(t=>{
      // só data-URL sai; `nfPath` (a referência do Storage) e null ficam
      if(!t||typeof t.nfImg!=="string"||!t.nfImg.startsWith("data:"))return t;
      mudou=true;
      fotos.push({perfil:k,txId:t.id??null,dataUrl:t.nfImg});
      // nfPendente marca a transação enquanto o upload não confirmou, para a
      // tela poder dizer "foto aguardando envio" em vez de fingir que não existe
      const {nfImg,...resto}=t;
      return {...resto,nfImg:null,nfPendente:true};
    });
    out[k]=mudou?{...p,transacoes:txs}:p;
  }
  return {limpo:out,fotos};
}
// Guarda de asserção — usada em teste e no log de diagnóstico. Não corrige nada.
export function contemBase64(all){
  for(const k of Object.keys(all||{})){
    const p=all[k];
    if(!p||typeof p!=="object"||Array.isArray(p))continue;
    for(const t of (p.transacoes||[]))if(t&&typeof t.nfImg==="string"&&t.nfImg.startsWith("data:"))return true;
  }
  return false;
}
export function mesclarFotos(backup,atual){
  const fotos={};
  for(const k of Object.keys(atual||{})){
    // nfPath é a referência do Storage; nfImg só sobrevive aqui como legado
    for(const t of (atual[k]?.transacoes||[]))if(t&&t.id&&(t.nfPath||t.nfImg))fotos[t.id]=t.nfPath?{nfPath:t.nfPath}:{nfImg:t.nfImg};
  }
  const out={};
  for(const k of Object.keys(backup||{})){
    const p=backup[k];
    if(!p||typeof p!=="object"||Array.isArray(p)){out[k]=p;continue;}
    out[k]={...p,transacoes:(p.transacoes||[]).map(t=>t&&t.id&&!t.nfImg&&!t.nfPath&&fotos[t.id]?{...t,...fotos[t.id]}:t)};
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
// Posição de renda variável — a fonte da verdade do card. O custo é SEMPRE
// quantidade × PM ponderado; o campo gravado valorInvestido é IGNORADO
// quando existe PM: ele podia ficar podre depois de uma edição manual
// (saveInv preservava o valor antigo ao editar ação — bug real, 23/07/2026,
// CXSE3 mostrando +34,8% quando os próprios números do card davam 24,6%).
// Fallback: ativo legado SEM PM/quantidade (ex: tipo "Outros" só com valor)
// continua usando valorInvestido||valor, como sempre foi.
export function posicaoRV(inv){
  const qtd=inv?.quantidade||0,pm=inv?.precoMedio||0;
  const custo=qtd*pm>0?qtd*pm:(inv?.valorInvestido||inv?.valor||0);
  const atual=inv?.valorAtual!=null?inv.valorAtual:custo;
  const lucro=atual-custo;
  return {
    custo:Math.round(custo*100)/100,
    atual:Math.round(atual*100)/100,
    lucro:Math.round(lucro*100)/100,
    pct:custo>0?lucro/custo*100:0,
  };
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
  const rf=(investimentos||[]).filter(i=>isRFAtivo(i)&&i.data&&i.data<=fimStr).map(i=>{
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
// Valor total da carteira RF numa data, e a "fonte" agregada honesta:
// "historico" só se TODOS os ativos tiverem série real cobrindo o período,
// "formula" se NENHUM tiver, "misto" nos demais casos — nunca finge um
// consenso que não existe.
function _valorTotalRF(rf,data,series){
  let valor=0,nHist=0;
  for(const i of (rf||[])){
    if(series){const r=calcValorAtualRFHistorico(i,series,data);valor+=r.valor;if(r.fonte==="historico")nHist++;}
    else valor+=calcValorAtualRF(i,data);
  }
  const fonte=!series?"formula":nHist===0?"formula":nHist===(rf||[]).length?"historico":"misto";
  return {valor,fonte};
}
export function rentabilidadeRF(investimentosRF,hoje=new Date(),series=null){
  const rf=(investimentosRF||[]).filter(Boolean);
  const hj=new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate());
  const ontem=new Date(hj);ontem.setDate(ontem.getDate()-1);
  const inicioMes=new Date(hj.getFullYear(),hj.getMonth(),1);
  const inicioAno=new Date(hj.getFullYear(),0,1);
  const {valor:vHoje,fonte}=_valorTotalRF(rf,hj,series);
  const investidoTotal=rf.reduce((a,i)=>a+(i.valorInvestido||i.valor||0),0);
  const calc=(base)=>{const {valor:v}=_valorTotalRF(rf,base,series);return {valor:vHoje-v,pct:v>0?(vHoje-v)/v*100:null};};
  return {
    valorTotal:Math.round(vHoje*100)/100,
    fonte, // "historico" | "formula" | "misto"
    dia:calc(ontem),
    mes:calc(inicioMes),
    ano:calc(inicioAno),
    desdeInicio:{valor:vHoje-investidoTotal,pct:investidoTotal>0?(vHoje-investidoTotal)/investidoTotal*100:null},
  };
}
// Curva diária de rentabilidade (%) entre duas datas — para o gráfico "no mês/no ano".
// pct de cada dia é relativo ao valor do PRIMEIRO dia da série (a "baseline").
export function serieRentabilidadeRF(investimentosRF,inicio,fim,series=null){
  const rf=(investimentosRF||[]).filter(Boolean);
  const ini=new Date(inicio.getFullYear(),inicio.getMonth(),inicio.getDate());
  const fimD=new Date(fim.getFullYear(),fim.getMonth(),fim.getDate());
  const base=_valorTotalRF(rf,ini,series).valor;
  const out=[];
  for(let d=new Date(ini);d<=fimD;d.setDate(d.getDate()+1)){
    const {valor:v}=_valorTotalRF(rf,d,series);
    out.push({data:_ymdC(d),valor:Math.round(v*100)/100,pct:base>0?Math.round((v-base)/base*100*10000)/10000:0});
  }
  return out;
}

// ── Composição da carteira de ações (para o donut) ───────────────────────────
// % de cada ativo sobre o total investido em renda variável (não-RF).
export function composicaoAcoes(investimentos){
  const acoes=(investimentos||[]).filter(i=>!isRFAtivo(i));
  const itens=acoes.map(i=>({ticker:i.ticker||i.descricao||"Ativo",valor:i.valorAtual||i.valorInvestido||i.valor||0}))
    .filter(x=>x.valor>0.005);
  const total=itens.reduce((a,x)=>a+x.valor,0);
  return itens.map(x=>({...x,pct:total>0?x.valor/total*100:0})).sort((a,b)=>b.valor-a.valor);
}

// ── Rentabilidade da Renda Variável (ações) ──────────────────────────────────
// Diferente da RF, ações não têm fórmula — o valor depende do preço de
// mercado. "Desde o início" é sempre calculável (não depende de snapshot):
// ganho não realizado das posições atuais + ganho realizado das vendas
// registradas nelas. "No mês"/"No ano" comparam a foto mensal mais próxima
// do início do período contra os valores ATUAIS (ao vivo), descontando
// aportes e somando vendas do período — igual ao relatório mensal.
// LIMITE HONESTO: não existe granularidade diária (sem "1 dia"/"1 ano" tick-a-tick);
// e um ativo TOTALMENTE vendido sai da carteira e seu ganho realizado
// histórico não é mais somado aqui (seguindo o mesmo limite já aceito no
// relatório mensal).
export function rentabilidadeAcoesDesdeInicio(investimentos){
  const acoes=(investimentos||[]).filter(i=>!isRFAtivo(i));
  const valorAtual=acoes.reduce((a,i)=>a+(i.valorAtual||i.valorInvestido||i.valor||0),0);
  const custo=acoes.reduce((a,i)=>a+(i.valorInvestido||i.valor||0),0);
  const realizado=acoes.reduce((a,i)=>a+(i.vendas||[]).reduce((s,v)=>s+(v.resultado||0),0),0);
  const valor=Math.round((valorAtual-custo+realizado)*100)/100;
  return {valor,pct:custo>0?Math.round((valorAtual-custo)/custo*100*10000)/10000:null,valorAtual:Math.round(valorAtual*100)/100};
}
// Ganho entre uma foto (snapIni) e os valores atuais ao vivo — testável isolado.
export function ganhoAcoesEntreSnapshots(investimentos,snapIni,iniStr,fimStr){
  if(!Array.isArray(snapIni)||!snapIni.length)return {temBase:false,valor:0,pct:null};
  let ganho=0,baseTotal=0;
  const vivos=(investimentos||[]).filter(i=>!isRFAtivo(i));
  for(const f of vivos){
    const ini=snapIni.find(x=>x&&x.id===f.id);
    if(!ini)continue; // ativo novo no período — sem base, não entra na conta
    const valorFim=f.valorAtual||f.valorInvestido||f.valor||0;
    const aportesPeriodo=(f.aportes||[]).filter(a=>a&&a.data&&a.data>=iniStr&&a.data<=fimStr).reduce((s,a)=>s+(a.quantidade||0)*(a.preco||0),0);
    const vendasPeriodo=(f.vendas||[]).filter(v=>v&&v.data&&v.data>=iniStr&&v.data<=fimStr).reduce((s,v)=>s+(v.quantidade||0)*(v.preco||0),0);
    ganho+=valorFim-(ini.valorAtual||0)-aportesPeriodo+vendasPeriodo;
    baseTotal+=ini.valorAtual||0;
  }
  return {temBase:true,valor:Math.round(ganho*100)/100,pct:baseTotal>0?Math.round(ganho/baseTotal*100*10000)/10000:null};
}
// Monta o pacote completo (mês corrente + ano corrente), escolhendo a foto
// mais próxima do início de cada período dentro do historico salvo.
export function rentabilidadeAcoes(investimentos,historico,hoje=new Date()){
  const hist=(historico||[]).filter(h=>h&&Array.isArray(h.ativos));
  const mesKeyAtual=`${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,"0")}`;
  const [ay,am]=mesKeyAtual.split("-").map(Number);
  const mesAnteriorKey=`${am===1?ay-1:ay}-${String(am===1?12:am-1).padStart(2,"0")}`;
  const snapMes=hist.find(h=>h.mes===mesAnteriorKey)?.ativos;
  const iniAnoStr=`${ay}-01-01`;
  const snapAno=[...hist].filter(h=>h.mes<mesKeyAtual).sort((a,b)=>a.mes.localeCompare(b.mes))[0]?.ativos; // foto mais antiga disponível no ano
  const fimStr=_ymdC(hoje);
  return {
    desdeInicio:rentabilidadeAcoesDesdeInicio(investimentos),
    mes:ganhoAcoesEntreSnapshots(investimentos,snapMes,`${mesAnteriorKey}-01`,fimStr),
    ano:ganhoAcoesEntreSnapshots(investimentos,snapAno,iniAnoStr,fimStr),
  };
}

// ── Renda fixa com série histórica REAL (BCB) ────────────────────────────────
// Em vez de uma taxa única fixa aplicada a todo o período (calcValorAtualRF),
// usa a taxa REAL de cada dia/mês publicada pelo Banco Central. Sempre que a
// série não cobrir o período (sem internet, ativo mais antigo que os dados
// buscados, etc.), cai de volta para calcValorAtualRF — nunca finge precisão
// que não tem.

// Composição diária (CDI/Selic): convenção ANBIMA — "X% do índice" eleva CADA
// fator diário a (pct/100). Dias sem registro na série (feriados/fins de
// semana) são pulados — o índice diário só existe em dia útil.
export function compoeFatorDiario(serieDiaria,dataIniStr,dataFimStr,pct=100){
  let fator=1;
  for(const p of (serieDiaria||[])){
    if(!p||!p.data||p.data<dataIniStr||p.data>dataFimStr)continue;
    fator*=Math.pow(1+(p.valor||0)/100,pct/100);
  }
  return fator;
}

// Composição mensal (IPCA): só meses CHEIOS dentro do período contam — é a
// convenção usual de correção de CDBs/NTN-B IPCA+ (aplica no aniversário mensal).
export function compoeFatorMensal(serieMensal,dataIniStr,dataFimStr){
  let fator=1;
  for(const p of (serieMensal||[])){
    if(!p||!p.data||p.data<dataIniStr||p.data>=dataFimStr)continue;
    fator*=(1+(p.valor||0)/100);
  }
  return fator;
}

// Valor atual usando série histórica real. `series` = {CDI:[{data,valor}],
// IPCA:[{data,valor}]} (datas em "YYYY-MM-DD", valor em % — cru do BCB).
// Devolve {valor, fonte:"historico"|"formula"} — o app SEMPRE sabe e mostra
// qual dos dois está usando, nunca mistura em silêncio.
export function calcValorAtualRFHistorico(inv,series,agora=new Date()){
  const investido=inv.valorInvestido||inv.valor||0;
  const indice=inv.indice||"CDI";
  if(indice==="Prefixado")return {valor:calcValorAtualRF(inv,agora),fonte:"formula"};
  const dataIni=inv.data,dataFim=_ymdC(agora);
  const serie=series&&series[indice];
  if(!dataIni||!serie||!serie.length||serie[0].data>dataIni){
    return {valor:calcValorAtualRF(inv,agora),fonte:"formula"};
  }
  const anos=Math.max(0,(agora-new Date(dataIni))/(1000*60*60*24*365));
  const pct=parseFloat(inv.pctIndice)||100,taxaAd=parseFloat(inv.taxaRF)||0;
  let fator;
  if(indice==="IPCA"){
    fator=compoeFatorMensalProRata(serie,dataIni,dataFim); // pro-rata do mês de compra — testado com dados reais
    if(inv.rfTipo==="mais")fator*=Math.pow(1+taxaAd/100,anos);
    else fator*=Math.pow(pct/100,1); // "% do IPCA" é raro, mas mantém consistência
  }else{ // CDI / Selic — diário
    fator=inv.rfTipo==="pct"
      ?compoeFatorDiario(serie,dataIni,dataFim,pct)
      :compoeFatorDiario(serie,dataIni,dataFim,100)*Math.pow(1+taxaAd/100,anos);
  }
  return {valor:investido*fator,fonte:"historico"};
}

// ── IPCA-15 como prévia do mês corrente ──────────────────────────────────────
// O IPCA oficial (série 433) só é publicado por volta do dia 10 do mês
// seguinte — enquanto isso, calcValorAtualRFHistorico simplesmente NÃO conta
// o mês corrente (correto, mas subestima o rendimento real, já que o banco
// costuma projetar a correção antes da publicação oficial). O IPCA-15 (série
// 7478, prévia da inflação, publicada no MEIO do próprio mês) preenche essa
// lacuna com dado real do IBGE — nunca inventado.
// Regra: o oficial SEMPRE tem prioridade. A prévia só entra nos meses em que
// o oficial ainda não foi publicado.
export function mesclarIPCAcomPrevia(serieOficial,serieIPCA15){
  const oficial=(serieOficial||[]).filter(Boolean);
  const chavesOficiais=new Set(oficial.map(p=>p.data));
  const previaExtra=(serieIPCA15||[]).filter(p=>p&&p.data&&!chavesOficiais.has(p.data));
  return [...oficial,...previaExtra].sort((a,b)=>a.data.localeCompare(b.data));
}

// ── Correção pro-rata do mês de compra (IPCA) ────────────────────────────────
// compoeFatorMensal só conta meses CHEIOS — quem compra no meio do mês fica
// sem NENHUM crédito daquele mês, tratando igual quem comprou no dia 2 e no
// dia 30. Isso é um viés sistemático (subestima sempre). O pro-rata credita a
// fração de dias efetivamente aplicados no mês de compra — mais justo em
// princípio, mesmo sem reproduzir a interpolação exata e proprietária de cada
// banco (que usa projeção geométrica dia a dia, não documentada publicamente).
export function compoeFatorMensalProRata(serieMensal,dataIniStr,dataFimStr){
  const [iy,im,id]=dataIniStr.split("-").map(Number);
  const diasNoMes=new Date(iy,im,0).getDate();
  const diasRestantes=diasNoMes-id+1;
  const chaveMesIni=`${iy}-${String(im).padStart(2,"0")}-01`;
  const entradaMesIni=(serieMensal||[]).find(p=>p&&p.data===chaveMesIni);
  let fator=1;
  if(entradaMesIni){ // aplica sempre — quando diasRestantes=diasNoMes (compra no dia 1), o expoente vira 1 = mês cheio, naturalmente
    fator*=Math.pow(1+entradaMesIni.valor/100,diasRestantes/diasNoMes);
  }
  const proxMesStr=_ymdC(new Date(iy,im,1)); // 1º dia do mês seguinte — meses cheios a partir daqui
  fator*=compoeFatorMensal(serieMensal,proxMesStr,dataFimStr);
  return fator;
}

// ═══════════════════════════════════════════════════════════════════════════
// Análise fundamentalista — eixo PREÇO (Graham) e eixo QUALIDADE (Buy & Hold)
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ Diferente do resto deste arquivo, errar aqui não produz número feio na
// tela: produz decisão de compra ou venda errada, com dinheiro real. Todo
// teste destas funções confere contra conta feita à mão, nunca contra o que
// o código produziu.

// ── Critério defensivo de Graham ────────────────────────────────────────────
// Graham pedia P/L < 15 E P/VP < 1,5, mas o teste que ele de fato aplicava é o
// PRODUTO: P/L × P/VP < 22,5 (= 15 × 1,5). O produto permite compensação — P/L
// alto com P/VP bem baixo ainda passa. Devolvemos os três para a tela mostrar
// a conta, não só o veredito.
export function grahamDefensivo(pl,pvp){
  const n=v=>(typeof v==="number"&&Number.isFinite(v))?v:null;
  const _pl=n(pl),_pvp=n(pvp);
  const vazio={pl:_pl,pvp:_pvp,pl_ok:null,pvp_ok:null,produto:null,produto_ok:null,aprovado:null};
  if(_pl==null||_pvp==null) return {...vazio,motivo:"P/L ou P/VP ausente"};
  // ⚠️ ARMADILHA: com P/L ou P/VP negativo o PRODUTO fica negativo e passaria
  // no teste "< 22,5" — uma empresa com prejuízo ou patrimônio negativo seria
  // classificada como barata. Múltiplo negativo não é múltiplo baixo.
  if(_pl<=0) return {...vazio,pl_ok:false,pvp_ok:_pvp<1.5,aprovado:false,motivo:"P/L não positivo (prejuízo) — múltiplo inaplicável"};
  if(_pvp<=0) return {...vazio,pl_ok:_pl<15,pvp_ok:false,aprovado:false,motivo:"P/VP não positivo (patrimônio negativo) — múltiplo inaplicável"};
  const produto=_pl*_pvp;
  return {
    pl:_pl,pvp:_pvp,
    pl_ok:_pl<15,pvp_ok:_pvp<1.5,
    produto:Math.round(produto*100)/100,
    produto_ok:produto<22.5,
    aprovado:produto<22.5,   // o veredito é o PRODUTO, como Graham usava
    motivo:null,
  };
}

// ── Número de Graham ────────────────────────────────────────────────────────
//   número = √(22,5 × LPA × VPA)   ·   margem = (número − preço) / preço
// A margem é positiva quando o papel está ABAIXO do valor intrínseco estimado.
export function numeroGraham(lpa,vpa,preco){
  const n=v=>(typeof v==="number"&&Number.isFinite(v))?v:null;
  const _lpa=n(lpa),_vpa=n(vpa),_preco=n(preco);
  const na=m=>({numero:null,margem_seguranca_pct:null,aplicavel:false,motivo:m});
  if(_lpa==null||_vpa==null) return na("LPA ou VPA ausente");
  // ⚠️ Graham foi desenhado para empresa LUCRATIVA. Com LPA ou VPA negativo o
  // radicando fica negativo, a raiz não existe nos reais e Math.sqrt devolve
  // NaN — que vazaria para a tela como "NaN". A fórmula é INAPLICÁVEL nesse
  // caso, o que é diferente de dizer que a ação está "cara".
  if(_lpa<=0) return na("empresa sem lucro (LPA ≤ 0) — fórmula inaplicável");
  if(_vpa<=0) return na("patrimônio líquido negativo (VPA ≤ 0) — fórmula inaplicável");
  const numero=Math.sqrt(22.5*_lpa*_vpa);
  // margem calculada com o número SEM arredondar, senão o erro de 2 casas
  // se propaga para o percentual
  const margem=(_preco!=null&&_preco>0)?((numero-_preco)/_preco*100):null;
  return {
    numero:Math.round(numero*100)/100,
    margem_seguranca_pct:margem==null?null:Math.round(margem*10)/10,
    aplicavel:true,motivo:null,
  };
}

// ── Preço-teto de Bazin ─────────────────────────────────────────────────────
//   teto = provento médio anual / DY desejado   (padrão do método: 6%)
// A média é sobre os 5 anos FECHADOS — o ano corrente está pela metade e
// derrubaria a média.
// ⚠️ Ano SEM provento entra na média como ZERO, não é descartado. A tabela do
// Fundamentus omite o ano sem pagamento, e dividir só pelos anos presentes
// inflaria o teto de uma empresa que deixou de pagar — exatamente o erro que
// o método de Bazin não perdoa. Dividir por 5 é a leitura correta e a
// conservadora.
export function precoTetoBazin(proventoPorAno,pagouTodoAno,dyAlvo=0.06,anoAtual=new Date().getFullYear()){
  const mapa=new Map();
  for(const p of (proventoPorAno||[])) if(p&&Number.isFinite(p.valor)) mapa.set(Number(p.ano),p.valor);
  const janela=Array.from({length:5},(_,i)=>anoAtual-5+i);   // 5 anos fechados
  const presentes=janela.map(a=>mapa.get(a)).filter(v=>Number.isFinite(v)&&v>0);
  const rotulo=`${janela[0]}-${janela[4]}`;
  if(!presentes.length||!(dyAlvo>0)) {
    return {teto:null,media_provento:null,anos_com_provento:0,janela:rotulo,historico_com_buraco:true,
            motivo:presentes.length?"DY alvo inválido":"sem provento nos 5 anos fechados"};
  }
  const media=presentes.reduce((s,v)=>s+v,0)/janela.length;   // divide por 5, não por presentes.length
  const buraco=(pagouTodoAno===false)||presentes.length<janela.length;
  return {
    teto:Math.round((media/dyAlvo)*100)/100,
    media_provento:Math.round(media*10000)/10000,
    anos_com_provento:presentes.length,
    janela:rotulo,
    // Bazin pressupõe pagamento consistente: com buraco, o teto sai mas a tela
    // precisa avisar que a série não sustenta a premissa do método.
    historico_com_buraco:buraco,
    motivo:null,
  };
}

// ── CAGR do lucro ───────────────────────────────────────────────────────────
// A fonte (Yahoo incomeStatementHistory) entrega 4 anos, então são 3 períodos.
// Rotular como "4 anos", nunca como 5 — mesma honestidade do "sem prejuízo".
export function cagrLucro(lucroAnual){
  const s=(lucroAnual||[]).filter(x=>x&&Number.isFinite(x.ano)&&Number.isFinite(x.valor)).sort((a,b)=>a.ano-b.ano);
  if(s.length<2) return null;
  const ini=s[0].valor,fim=s[s.length-1].valor;
  // Partir de prejuízo (ou chegar nele) torna a taxa percentual indefinida —
  // null, nunca Infinity nem NaN.
  if(ini<=0||fim<=0) return null;
  return Math.round((Math.pow(fim/ini,1/(s.length-1))-1)*1000)/10;
}

// ── Checklist Buy and Hold — 8 critérios ────────────────────────────────────
// São 8, não 10. Dois ficaram de fora por FALTA DE DADO CONFIÁVEL, decisão
// tomada e registrada no CLAUDE.md:
//   · "lucro nos últimos 20 trimestres" — a fonte entrega 4 trimestres
//   · "payout sustentável" — exigiria nº de ações histórico; com desdobramento
//     na janela o número sai distorcido, e número aproximado que informa
//     decisão de compra é pior que critério ausente
export const CHECKLIST_PADRAO={
  criterios:{
    anos_bolsa:true, sem_prejuizo:true, provento_crescente:true, roe:true,
    divida:true, cresc_receita:true, cresc_lucro:true, liquidez:true,
  },
  corte_liquidez:1000000,   // R$/dia. Investidor10 usa ~R$11M; 1M é mais
                            // realista para posição pessoal. Configurável.
};

// Formata número para pt-BR nos textos de detalhe. O app inteiro usa vírgula
// decimal; sem isto o checklist mostraria "5.3 anos" ao lado de "430.210.000".
const _n=(v,dec=1)=>v==null?"":Number(v).toLocaleString("pt-BR",{minimumFractionDigits:dec,maximumFractionDigits:dec});

export function checklistBuyAndHold(dados,config){
  const d=dados||{};
  const cfg={...CHECKLIST_PADRAO,...(config||{})};
  const lig={...CHECKLIST_PADRAO.criterios,...((config||{}).criterios||{})};
  const num=v=>(typeof v==="number"&&Number.isFinite(v))?v:null;

  const cagrL=cagrLucro(d.lucro_anual);
  const anosBolsa=num(d.anos_bolsa);
  const roe=num(d.roe);
  const divPat=num(d.div_liq_patrim);
  const cresRec=num(d.cres_rec_5a);
  const vol=num(d.vol_med_2m);
  const cagrProv=num(d.cagr_provento_5a);
  const anosOk=num(d.anos_sem_prejuizo), anosAval=num(d.lucro_anos_avaliados);

  // passou: true | false | null (null = sem dado, não dá para afirmar)
  const defs=[
    {id:"anos_bolsa",nome:"Mais de 5 anos de Bolsa",
     passou:anosBolsa==null?null:anosBolsa>5,
     valor:anosBolsa,
     // ⚠️ quando anos_bolsa_minimo é true o número é um PISO, não a idade real
     // (o Yahoo tem piso em 2000-02-01). A tela deve dizer "mais de X anos".
     detalhe:anosBolsa==null?"sem dado":(d.anos_bolsa_minimo?`mais de ${_n(anosBolsa)} anos (piso da fonte)`:`${_n(anosBolsa)} anos`),
     e_minimo:!!d.anos_bolsa_minimo},

    {id:"sem_prejuizo",nome:"Sem prejuízo (4 anos)",   // NÃO é "nunca deu prejuízo"
     passou:(anosOk==null||anosAval==null||anosAval===0)?null:anosOk===anosAval,
     valor:anosOk,
     detalhe:(anosOk==null||anosAval==null)?"sem dado":`${anosOk} de ${anosAval} anos com lucro`},

    // ⚠️ ARMADILHA DO PROVENTO: a tabela anual do Fundamentus OMITE o ano sem
    // pagamento em vez de trazer zero, então uma empresa que pulou um ano ainda
    // produz CAGR positivo. Exigir os DOIS é o que impede exibir "dividendos
    // crescentes" para quem falhou em pagar.
    {id:"provento_crescente",nome:"Provento crescente (5 anos)",
     passou:(cagrProv==null||d.pagou_todo_ano_5a==null)?null:(cagrProv>0&&d.pagou_todo_ano_5a===true),
     valor:cagrProv,
     detalhe:cagrProv==null?"sem dado":`${_n(cagrProv)}%/ano${d.pagou_todo_ano_5a===false?" — mas deixou de pagar em algum ano":""}`},

    {id:"roe",nome:"ROE acima de 10%",
     passou:roe==null?null:roe>10, valor:roe,
     detalhe:roe==null?"sem dado":`${_n(roe)}%`},

    {id:"divida",nome:"Dívida menor que patrimônio",
     passou:divPat==null?null:divPat<1, valor:divPat,
     detalhe:divPat==null?"sem dado":`dív. líq./patrim. = ${_n(divPat,2)}`},

    {id:"cresc_receita",nome:"Receita crescente (5 anos)",
     passou:cresRec==null?null:cresRec>0, valor:cresRec,
     detalhe:cresRec==null?"sem dado":`${_n(cresRec)}%/ano`},

    {id:"cresc_lucro",nome:"Lucro crescente (4 anos)",   // 4, limite da fonte
     passou:cagrL==null?null:cagrL>0, valor:cagrL,
     detalhe:cagrL==null?"sem dado":`${_n(cagrL)}%/ano`},

    {id:"liquidez",nome:"Liquidez diária",
     passou:vol==null?null:vol>=cfg.corte_liquidez, valor:vol,
     detalhe:vol==null?"sem dado":`${Math.round(vol).toLocaleString("pt-BR")}/dia (corte ${Math.round(cfg.corte_liquidez).toLocaleString("pt-BR")})`},
  ];

  const criterios=defs.map(c=>({...c,ligado:lig[c.id]!==false}));
  const ativos=criterios.filter(c=>c.ligado);
  return {
    criterios,
    aprovados:ativos.filter(c=>c.passou===true).length,
    avaliados:ativos.length,                              // desligar tira do denominador
    sem_dado:ativos.filter(c=>c.passou===null).length,    // ligado mas sem dado
    corte_liquidez:cfg.corte_liquidez,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FII — triagem (fundos imobiliários)
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ NÃO reaproveitar Graham, Bazin nem o checklist Buy and Hold aqui. FII é
// outro regime: FFO no lugar de lucro, VP/Cota no lugar de VPA, distribuição
// obrigatória por lei (95% do lucro semestral) no lugar de política de
// dividendos, e "ROE > 10%" não tem equivalente. Aplicar as réguas de ação a
// FII produz número plausível e ERRADO — a mesma falha que tirou o DY de IA
// da watchlist.

// ── Tipo do fundo ───────────────────────────────────────────────────────────
// O campo "Segmento" do Fundamentus é inservível: classifica MXRF11 (fundo de
// papel/CRI) como "Logística", e joga 56% do universo em "Multicategoria"/
// "Outros". Derivar de Qtd de imóveis é confiável e verificável.
// ⚠️ Limite honesto: sem imóveis NÃO distingue fundo de papel de FoF — os dois
// caem em "papel". A tabela não tem como separar, então o rótulo é o que dá
// para sustentar, não o que seria ideal.
export function tipoFii(qtdImoveis){
  if(qtdImoveis==null||!Number.isFinite(qtdImoveis))return null;
  return qtdImoveis>0?"tijolo":"papel";
}

// ── Guarda do zero-filler (4ª vez nesta base) ───────────────────────────────
// Vacância e Cap Rate só existem como conceito para quem TEM imóvel. Na tabela
// geral, 412 dos 560 fundos trazem vacância 0,00% — a maioria por não ter
// imóvel nenhum. Um filtro "vacância < 5%" aprovaria esses 412 como se fossem
// exemplares. Zero de fundo de papel não é excelência, é ausência de conceito.
// Fundo de tijolo COM 0% é real (totalmente locado, ex.: TRXF11 com 97 imóveis)
// e por isso o corte é pela contagem de imóveis, nunca pelo valor lido.
export function metricasImovel(qtdImoveis,vacancia,capRate){
  const temImovel=Number.isFinite(qtdImoveis)&&qtdImoveis>0;
  return {
    vacancia: temImovel?(Number.isFinite(vacancia)?vacancia:null):null,
    cap_rate: temImovel?(Number.isFinite(capRate)?capRate:null):null,
    aplicavel: temImovel,
  };
}

// ── DY de 12 meses, calculado do histórico ──────────────────────────────────
// ⚠️ NUNCA usar o campo "Div. Yield" pronto do Fundamentus: ele não é
// reproduzível. Para MXRF11 os próprios dados deles dão três respostas —
// soma dos 12 rendimentos ÷ preço = 12,40%, Dividendo/cota ÷ preço = 12,19%,
// e o campo exibido diz 13,30%. Ferramenta de decisão não pode exibir número
// que não se consegue refazer.
//
// Janela de 12 meses ENCERRADA no último pagamento (trailing 12m), não "os 12
// pagamentos mais recentes": fundo que pulou meses somaria menos, que é o
// correto — pegar os 12 últimos alcançaria 14 meses atrás e inflaria o DY,
// o mesmo erro que a média de Bazin evita ao dividir sempre por 5.
// historico: [{data:"YYYY-MM-DD", valor:number}]
export function dyFii12m(historico,preco){
  const h=(historico||[]).filter(p=>p&&typeof p.data==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(p.data)&&Number.isFinite(p.valor))
    .sort((a,b)=>a.data.localeCompare(b.data));
  const vazio={dy_pct:null,soma_12m:null,meses_pagos:0,pagou_todos_12m:false,janela:null,motivo:"sem histórico"};
  if(!h.length)return vazio;
  // Aritmética de MÊS, não de data: 12 pagamentos mensais vão do mês M-11 ao M,
  // então comparar datas exatas rejeitaria um histórico completo por um dia.
  const mnum=d=>{const[y,m]=d.split("-").map(Number);return y*12+(m-1);};
  const fimM=mnum(h[h.length-1].data), iniM=fimM-11;
  // Histórico que não alcança 12 meses: null, NUNCA um DY parcial anualizado —
  // fundo com 6 meses de vida somaria meio ano e pareceria render metade.
  if(fimM-mnum(h[0].data)+1<12)return {...vazio,motivo:"histórico menor que 12 meses"};
  const janela=h.filter(p=>{const m=mnum(p.data);return m>=iniM&&m<=fimM;});
  const soma=janela.reduce((s,p)=>s+p.valor,0);
  const meses=new Set(janela.map(p=>p.data.slice(0,7))).size;
  const rot=m=>`${Math.floor(m/12)}-${String(m%12+1).padStart(2,"0")}`;
  return {
    dy_pct:(Number.isFinite(preco)&&preco>0)?Math.round((soma/preco*100)*100)/100:null,
    soma_12m:Math.round(soma*10000)/10000,
    meses_pagos:meses,
    pagou_todos_12m:meses===12,   // o critério que mais separa FII bom de armadilha
    janela:`${rot(iniM)} → ${rot(fimM)}`,
    motivo:null,
  };
}

// ── Tendência da distribuição ───────────────────────────────────────────────
// Compara a soma dos últimos 12 meses com os 12 anteriores. Com 10 anos de
// histórico dá para ver se o rendimento cresce, estagna ou encolhe.
export function tendenciaFii(historico){
  const h=(historico||[]).filter(p=>p&&/^\d{4}-\d{2}-\d{2}$/.test(p.data||"")&&Number.isFinite(p.valor))
    .sort((a,b)=>a.data.localeCompare(b.data));
  if(h.length<4)return null;
  const mnum=d=>{const[y,m]=d.split("-").map(Number);return y*12+(m-1);};
  const fimM=mnum(h[h.length-1].data);
  if(fimM-mnum(h[0].data)+1<24)return null;   // sem 24 meses não há o que comparar
  const soma=(de,ate)=>h.filter(p=>{const m=mnum(p.data);return m>=de&&m<=ate;}).reduce((s,p)=>s+p.valor,0);
  const a1=soma(fimM-11,fimM), a2=soma(fimM-23,fimM-12);
  if(!(a2>0)||!(a1>0))return null;            // sem base de comparação: null, não 0
  return Math.round(((a1/a2-1)*100)*10)/10;
}

// ── Configuração da triagem ─────────────────────────────────────────────────
export const FII_PADRAO={
  criterios:{pvp:true,dy:true,liquidez:true,consistencia:true,vacancia:true},
  pvp_max:1.05,          // abaixo de 1,00 é o clássico, mas corta bons com ágio pequeno
  dy_min_tijolo:8,       // %
  dy_min_papel:10,       // papel exige mais porque carrega risco de crédito —
                         // régua única faria tijolo parecer sempre pior
  liquidez_min:500000,   // R$/dia. FII é menos líquido que ação (o padrão de
                         // ações é 1M); configurável.
  vacancia_max:10,       // % — só se aplica a tijolo
};

// ── Filtro composto ─────────────────────────────────────────────────────────
// `f` é o fundo já normalizado: {papel,cotacao,pvp,liquidez,qtd_imoveis,
//  vacancia,cap_rate,dy_pct,pagou_todos_12m}
// passou: true | false | null (null = sem dado, NÃO conta como reprovado)
export function filtraFii(f,config){
  const cfg={...FII_PADRAO,...(config||{})};
  const lig={...FII_PADRAO.criterios,...((config||{}).criterios||{})};
  const n=v=>Number.isFinite(v)?v:null;
  const tipo=tipoFii(n(f?.qtd_imoveis));
  const im=metricasImovel(n(f?.qtd_imoveis),n(f?.vacancia),n(f?.cap_rate));
  const pvp=n(f?.pvp), liq=n(f?.liquidez), dy=n(f?.dy_pct);
  const dyMin=tipo==="papel"?cfg.dy_min_papel:cfg.dy_min_tijolo;

  const defs=[
    {id:"pvp",nome:`P/VP até ${cfg.pvp_max}`,passou:pvp==null?null:pvp<=cfg.pvp_max,valor:pvp},
    {id:"dy",nome:`DY 12m ≥ ${dyMin}% (${tipo||"?"})`,passou:dy==null?null:dy>=dyMin,valor:dy},
    {id:"liquidez",nome:"Liquidez diária",passou:liq==null?null:liq>=cfg.liquidez_min,valor:liq},
    {id:"consistencia",nome:"Pagou nos 12 meses",passou:f?.pagou_todos_12m==null?null:!!f.pagou_todos_12m,valor:f?.meses_pagos??null},
    // vacância só entra para quem tem imóvel; para papel é null (não avaliado),
    // nunca "aprovado por ter 0%"
    {id:"vacancia",nome:"Vacância",passou:!im.aplicavel?null:(im.vacancia==null?null:im.vacancia<=cfg.vacancia_max),valor:im.vacancia},
  ];
  const criterios=defs.map(c=>({...c,ligado:lig[c.id]!==false}));
  const ativos=criterios.filter(c=>c.ligado);
  return {
    ...f, tipo, vacancia:im.vacancia, cap_rate:im.cap_rate,
    criterios,
    aprovados:ativos.filter(c=>c.passou===true).length,
    avaliados:ativos.length,
    sem_dado:ativos.filter(c=>c.passou===null).length,
    // aprovado = nenhum critério ligado REPROVOU (sem dado não reprova)
    aprovado:ativos.every(c=>c.passou!==false),
  };
}

// ── Série mensal de rendimentos de FII ──────────────────────────────────────
// Monta um eixo de meses CONTÍNUO. Isso é o ponto: a fonte OMITE o mês sem
// pagamento (mesma armadilha do provento de ação, onde o ano sem pagamento
// some da tabela). Se o gráfico plotasse só os pontos existentes, um fundo que
// parou de pagar em março apareceria com a linha ligando fevereiro a abril —
// interpolando por cima do buraco, que é justamente o sinal que importa.
// Aqui o mês vazio vira uma entrada explícita com valor null.
//
// ⚠️ Mês com DOIS pagamentos existe (MXRF11 em jun/2019 e out/2025: 113
// lançamentos para 111 meses). Somamos os do mesmo mês e devolvemos
// `lancamentos` para a tela sinalizar — não dá para distinguir distribuição
// extra de linha duplicada na fonte, então o honesto é somar e avisar.
export function serieRendimentosFii(historico,{meses=36,ate=null}={}){
  const h=(historico||[]).filter(p=>p&&/^\d{4}-\d{2}/.test(p.data||"")&&Number.isFinite(p.valor));
  if(!h.length)return [];
  const mnum=mk=>{const[y,m]=mk.split("-").map(Number);return y*12+(m-1);};
  const rot=n=>`${Math.floor(n/12)}-${String(n%12+1).padStart(2,"0")}`;
  const porMes=new Map();
  for(const p of h){
    const mk=p.data.slice(0,7), a=porMes.get(mk)||{soma:0,n:0};
    a.soma+=p.valor; a.n++; porMes.set(mk,a);
  }
  const fimM=ate?mnum(ate.slice(0,7)):Math.max(...[...porMes.keys()].map(mnum));
  const iniM=fimM-(meses-1);
  const out=[];
  for(let m=iniM;m<=fimM;m++){
    const mk=rot(m), a=porMes.get(mk);
    out.push({
      mes:mk,
      valor:a?Math.round(a.soma*100000)/100000:null,   // null = não pagou, NÃO zero
      lancamentos:a?a.n:0,
      vazio:!a,
      multiplo:!!a&&a.n>1,                              // sinaliza mês com 2+ lançamentos
    });
  }
  return out;
}

// Resumo da série, para a tela dizer o que a curva mostra sem o usuário
// precisar interpretar sozinho.
export function resumoRendimentosFii(serie){
  const arr=(serie||[]).filter(Boolean);
  const s=arr.filter(p=>!p.vazio&&Number.isFinite(p.valor));
  // ⚠️ Buraco no MEIO da série é pagamento falhado. Buraco no FIM é quase
  // sempre atraso da fonte (o Fundamentus publica o mês com semanas de
  // defasagem). Contar os dois juntos faria TODO fundo aparecer com "2 meses
  // sem distribuição" — alarme falso em cima de dado que informa compra.
  const ultimoPago=arr.map(p=>!p.vazio).lastIndexOf(true);
  const mesesDesdeUltimo=ultimoPago<0?arr.length:(arr.length-1-ultimoPago);
  const vazios=ultimoPago<0?0:arr.slice(0,ultimoPago).filter(p=>p.vazio).length;
  if(s.length<2)return {media:null,min:null,max:null,meses_sem_pagamento:vazios,meses_desde_ultimo:mesesDesdeUltimo,variacao_pct:null,tendencia:null};
  const vals=s.map(p=>p.valor);
  const media=vals.reduce((a,b)=>a+b,0)/vals.length;
  // compara a média da 1ª metade com a da 2ª — mostra tendência sem prometer
  // precisão de regressão
  const meio=Math.floor(s.length/2);
  const m1=s.slice(0,meio).reduce((a,p)=>a+p.valor,0)/meio;
  const m2=s.slice(meio).reduce((a,p)=>a+p.valor,0)/(s.length-meio);
  const varPct=m1>0?Math.round(((m2/m1-1)*100)*10)/10:null;
  return {
    media:Math.round(media*100000)/100000,
    min:Math.min(...vals), max:Math.max(...vals),
    meses_sem_pagamento:vazios,        // só os do MEIO da série
    meses_desde_ultimo:mesesDesdeUltimo, // atraso da fonte OU fundo parado
    variacao_pct:varPct,
    tendencia:varPct==null?null:(varPct>5?"alta":varPct<-5?"queda":"estável"),
  };
}

// ── Corte do ruído inicial de séries longas (P/VP) ──────────────────────────
// A série de P/VP do MXRF11 vai de 0,807 a 9,269 — o topo é dos primeiros
// meses, quando o patrimônio era minúsculo e qualquer oscilação virava
// múltiplo absurdo. Plotar com essa escala produz uma reta rente ao zero com
// um pico ilegível: o gráfico existe e não comunica nada.
// Corta os primeiros `descartarMeses` e devolve a faixa da janela EXIBIDA,
// para a tela poder dizer se 0,88 é desconto ou é onde o fundo sempre andou.
export function serieRecortada(serie,{descartarMeses=24,maxPontos=180}={}){
  const s=(serie||[]).filter(p=>p&&Number.isFinite(p.valor)&&/^\d{4}-\d{2}/.test(p.mes||p.data||""));
  if(!s.length)return {pontos:[],min:null,max:null,atual:null,descartados:0};
  const key=p=>(p.mes||p.data).slice(0,7);
  const mnum=mk=>{const[y,m]=mk.split("-").map(Number);return y*12+(m-1);};
  const iniM=mnum(key(s[0]))+descartarMeses;
  let pontos=s.filter(p=>mnum(key(p))>=iniM);
  // Se o corte deixaria pouco ponto, NÃO volta para a série inteira — isso
  // traria o ruído de volta, que é o que o corte existe para tirar. Fica com
  // os 12 mais recentes: gráfico curto e legível vence gráfico longo ilegível.
  if(pontos.length<12)pontos=s.slice(-Math.min(12,s.length));
  if(pontos.length>maxPontos){               // afina para não pesar na tela
    const passo=Math.ceil(pontos.length/maxPontos);
    pontos=pontos.filter((_,i)=>i%passo===0||i===pontos.length-1);
  }
  const vals=pontos.map(p=>p.valor);
  return {
    pontos,
    min:Math.round(Math.min(...vals)*1000)/1000,
    max:Math.round(Math.max(...vals)*1000)/1000,
    atual:pontos[pontos.length-1].valor,
    descartados:s.length-pontos.length,
  };
}

// ── Cobertura da distribuição pelo FFO ──────────────────────────────────────
// A pergunta que importa em FII: a distribuição cabe no resultado operacional?
// FFO abaixo do distribuído significa pagar com venda de ativo ou caixa
// acumulado — sustentável por um tempo, não para sempre.
//
// ⚠️ Por que NÃO "FFO por cota": exigiria o nº de cotas de CADA trimestre. Só
// temos o de hoje, e FII faz emissão com frequência — o MXRF11 saiu de R$ 253
// milhões para R$ 4,3 bilhões de patrimônio. Dividir o FFO de 2017 pelas cotas
// de 2026 produziria uma curva de "crescimento" que é só diluição. Como a fonte
// dá FFO e distribuição na MESMA unidade (R$ absolutos, mesmos períodos), a
// comparação sai exata sem cotas nenhuma.
//
// ⚠️ FFO NEGATIVO existe (MXRF11 em 2017-03: −323.638). Não vira zero nem
// valor absoluto: fica negativo, e a cobertura fica negativa.
// janela padrão de 12 trimestres (3 anos): 38 linhas é ilegível, 4 é curto
// demais para ver padrão. A média agregada é SEMPRE calculada sobre a MESMA
// janela exibida — nunca sobre um recorte diferente do que está na tela.
export function coberturaFfoFii(ffo,dividendo,{janela=12}={}){
  const dm=new Map((dividendo||[]).filter(p=>p&&p.mes).map(p=>[p.mes,p.valor]));
  const base=(ffo||[]).filter(p=>p&&p.mes&&Number.isFinite(p.valor)).slice(-janela);
  const linhas=base.map(p=>{
    const d=dm.get(p.mes);
    // ⚠️ Zero-filler, 5ª vez neste projeto: trimestre sem distribuição confiável
    // vira null (a tela mostra "—"), NUNCA 0,00 — mas conta como zero no
    // agregado, porque não distribuir É informação, não ausência dela.
    const temD=Number.isFinite(d)&&d>0;
    const neg=p.valor<0;
    return {
      mes:p.mes, ffo:p.valor, distribuido:temD?d:null,
      // Cobertura = FFO ÷ distribuído. NÃO o inverso: <100% precisa significar
      // "pagou mais do que ganhou" para casar com vermelho. Com dist/FFO, um
      // fundo que distribui além do resultado daria >100% e sairia verde.
      // FFO negativo: percentual não tem sentido — "n/a", não um número torto.
      cobertura_pct:(neg||!temD)?null:Math.round((p.valor/d*100)*10)/10,
      sem_distribuicao:!temD,
      ffo_negativo:neg,
    };
  });
  const somaFfo=linhas.reduce((a,l)=>a+l.ffo,0);
  const somaDist=linhas.reduce((a,l)=>a+(l.distribuido||0),0);   // ausente = 0
  // Agregado em vez de média de percentuais: média daria peso igual a
  // trimestres de tamanhos diferentes, e a regra antiga descartava em silêncio
  // justamente os trimestres sem distribuição, que são os mais informativos.
  const agregada=somaDist>0?Math.round((somaFfo/somaDist*100)*10)/10:null;
  return {
    linhas:[...linhas].reverse(),          // mais recente primeiro, para a tabela
    janela:linhas.length,                  // quantidade REAL, para o rótulo não mentir
    soma_ffo:somaFfo, soma_distribuido:somaDist,
    cobertura_agregada_pct:agregada,
    trimestres_descobertos:linhas.filter(l=>l.cobertura_pct!=null&&l.cobertura_pct<100).length,
    trimestres_sem_distribuicao:linhas.filter(l=>l.sem_distribuicao).length,
    tem_ffo_negativo:linhas.some(l=>l.ffo_negativo),
    alerta:agregada==null?null:(agregada<100?"distribuindo acima do resultado":null),
  };
}
