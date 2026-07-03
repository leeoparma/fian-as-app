import { useState, useEffect, useRef, useCallback, Component } from "react";
// Matemática pura extraída para src/calc.mjs — testada por tests/calc.test.mjs (GitHub Actions)
import {
  CAT_INTERNAS, INDICES_RATE,
  _clampDia, _ymdC, _ddmm, faturaDeCompra, vencimentoDe, faturaAbertaHoje,
  calcRFAnual, calcValorAtualRF, calcImpostoBR, calcImpostoAU,
  aporteMedio, totalProventoAgendado, diasAte,
  totaisTransacoes, saldoBanco as saldoBancoCalc, parcelaValor, parcelaData,
  calcSaldos as calcSaldosPure, calcDividas as calcDividasPure, totaisPorPessoa as totaisPorPessoaPure,
  salarioMensal, converteMoeda, taxaMensalSim, simularJuros,
} from "./calc.mjs";

const SUPA_URL="https://llpzdrqgvkpxjnecttkb.supabase.co";
const SUPA_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxscHpkcnFndmtweGpuZWN0dGtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3MDA2MjAsImV4cCI6MjA5NjI3NjYyMH0.X3DDKVRppRO-NiC5a2Cc0JrpFAaf5J-hymFHv6vNQ6Q";
const WORKER="https://controlfinanceiro.leeo-parms.workers.dev";
const supa={
  h:{"Content-Type":"application/json","apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`},
  ah:t=>({"Content-Type":"application/json","apikey":SUPA_KEY,"Authorization":`Bearer ${t}`}),
  async signUp(e,p){return(await fetch(`${SUPA_URL}/auth/v1/signup`,{method:"POST",headers:supa.h,body:JSON.stringify({email:e,password:p})})).json();},
  async signIn(e,p){return(await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`,{method:"POST",headers:supa.h,body:JSON.stringify({email:e,password:p})})).json();},
  async signOut(t){await fetch(`${SUPA_URL}/auth/v1/logout`,{method:"POST",headers:supa.ah(t)});},
  // Troca o refresh_token por um access_token novo (o access dura ~1h)
  async refresh(rt){const r=await fetch(`${SUPA_URL}/auth/v1/token?grant_type=refresh_token`,{method:"POST",headers:supa.h,body:JSON.stringify({refresh_token:rt})});if(!r.ok)return null;return r.json();},
  async load(t,id){
    const resp=await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${id}&select=data`,{headers:supa.ah(t)});
    if(!resp.ok){const e=new Error("Supabase load HTTP "+resp.status);e.status=resp.status;throw e;} // 4xx/5xx (ex: restoring) -> erro, NÃO conta vazia
    const r=await resp.json();
    if(!Array.isArray(r)) throw new Error("Resposta inesperada do servidor"); // formato errado -> erro
    return r?.[0]?.data||null; // array vazio = conta realmente nova
  },
  async save(t,id,d){const resp=await fetch(`${SUPA_URL}/rest/v1/profiles`,{method:"POST",headers:{...supa.ah(t),"Prefer":"resolution=merge-duplicates"},body:JSON.stringify({id,data:d,updated_at:new Date().toISOString()})});if(!resp.ok){const e=new Error("Supabase save HTTP "+resp.status);e.status=resp.status;throw e;}},
  async loadShared(codigo){const r=await fetch(`${SUPA_URL}/rest/v1/rpc/load_shared`,{method:"POST",headers:supa.h,body:JSON.stringify({p_codigo:codigo})});if(!r.ok)return null;const d=await r.json();return d||null;},
  async saveShared(codigo,d){await fetch(`${SUPA_URL}/rest/v1/rpc/save_shared`,{method:"POST",headers:supa.h,body:JSON.stringify({p_codigo:codigo,p_data:d})});},
};

const D={bg:"#0a0e1a",bg2:"#0f1629",bg3:"#151d35",card:"#111827",card2:"#1a2235",border:"#1e2d4a",border2:"#253352",green:"#00d084",red:"#ff4757",blue:"#3b82f6",gold:"#f59e0b",purple:"#8b5cf6",text:"#f1f5f9",text2:"#94a3b8",text3:"#64748b"};
const CORES=[D.green,D.blue,D.purple,D.gold,D.red,"#06b6d4","#ec4899"];
// ── Sessão: renovação automática do token ─────────────────────────────────────
// O access_token do Supabase dura ~1h. Sem renovar, o app "morre" em silêncio
// (banner de sem conexão, IA com 401). Aqui: renova usando o refresh_token,
// com trava para não renovar duas vezes ao mesmo tempo.
let _renovando=null;
async function renovarSessao(){
  if(_renovando)return _renovando;
  _renovando=(async()=>{
    try{
      const s=lsGet("session");
      if(!s?.refresh)return null;               // sessão antiga, sem refresh guardado → precisa relogar 1x
      const r=await supa.refresh(s.refresh);
      if(!r?.access_token)return null;          // refresh vencido/revogado → relogar
      const ns={...s,token:r.access_token,refresh:r.refresh_token||s.refresh,user:r.user||s.user};
      lsSet("session",ns);                      // authHdr() e os saves passam a usar o token novo
      return ns;
    }catch{return null;}
  })();
  try{return await _renovando;}finally{_renovando=null;}
}
// Salva na nuvem lendo o token NA HORA (não um token velho preso na closure);
// se tomar 401, renova a sessão e tenta mais uma vez.
async function salvarComRetry(id,dados){
  const t=lsGet("session")?.token;
  if(!t)return;
  try{await supa.save(t,id,dados);}
  catch(e){
    if(e?.status===401){
      const ns=await renovarSessao();
      if(!ns)throw e;
      await supa.save(ns.token,id,dados);
    }else throw e;
  }
}

const PROFILES=[{id:"br",label:"🇧🇷 Brasil",currency:"R$",market:"brazil",locale:"pt-BR"},{id:"au",label:"🇦🇺 Austrália",currency:"A$",market:"australia",locale:"en-AU"},{id:"us",label:"🇺🇸 EUA",currency:"US$",market:"usa",locale:"en-US"}];

// Calcula se a bolsa de um perfil está aberta AGORA (sem API, usa horário local de cada bolsa)
// B3: 10-17 Brasília | ASX: 10-16 Sydney | NYSE: 9:30-16 Nova York. Seg-sex.

// Nome do mercado por perfil (para textos e prompts de IA) — cobre os 3 países
function nomeMercado(profileId){
  return {br:"bolsa brasileira B3",us:"bolsa americana (NYSE/Nasdaq)",au:"bolsa australiana ASX"}[profileId]||"bolsa australiana ASX";
}
function nomeMercadoCurto(profileId){
  return {br:"brasileira B3",us:"americana NYSE/Nasdaq",au:"australiana ASX"}[profileId]||"australiana ASX";
}
function nomeIndice(profileId){
  return {br:"Ibovespa",us:"S&P 500",au:"ASX 200"}[profileId]||"ASX 200";
}
function nomePais(profileId){
  return {br:"brasileiro",us:"americano",au:"australiano"}[profileId]||"australiano";
}

function mercadoAberto(profileId){
  const tz={br:"America/Sao_Paulo",au:"Australia/Sydney",us:"America/New_York"}[profileId];
  if(!tz)return null;
  try{
    const agora=new Date();
    const fmt=new Intl.DateTimeFormat("en-US",{timeZone:tz,weekday:"short",hour:"2-digit",minute:"2-digit",hour12:false});
    const parts=fmt.formatToParts(agora);
    const wd=parts.find(p=>p.type==="weekday")?.value;
    let h=parseInt(parts.find(p=>p.type==="hour")?.value||"0");
    const m=parseInt(parts.find(p=>p.type==="minute")?.value||"0");
    if(h===24)h=0;
    const mins=h*60+m;
    if(["Sat","Sun"].includes(wd))return false;
    const janela={br:[600,1020],au:[600,960],us:[570,960]}[profileId]; // em minutos
    return mins>=janela[0]&&mins<janela[1];
  }catch{return null;}
}
const CAT_D_DEF=["Alimentação","Transporte","Saúde","Lazer","Moradia","Educação","Assinatura","Vestuário","Outros"];
const CAT_R_DEF=["Salário","Freelance","Investimentos","Aluguel","Dividendos","Bônus","Outros"];
const TIPOS_INV=["Ações","FII","ETF","Cripto","Renda Fixa","Tesouro Direto","Outros"];
const INDICES_RF=["CDI","IPCA","Selic","IGPM","Prefixado"];
const MESES=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const TABS=["Dashboard","Bancos","Lançamentos","Cartão","Investimentos","Metas","Análise","Splitwise","Relatórios"];
const WL_CATS=["Todas","Banco","Infraestrutura","Fundo Imobiliário","Energia","Tecnologia","Varejo","Saúde","Agronegócio","Mineração","Petróleo","ETF","Exterior","Outros"];
const IND_COMP=[
  {key:"preco",label:"Preço",fmt:(v,cur)=>v!=null?`${cur} ${Number(v).toFixed(2)}`:"—",higher:false},
  {key:"pl",label:"P/L",fmt:v=>v!=null?Number(v).toFixed(1)+"x":"—",higher:false},
  {key:"pvp",label:"P/VP",fmt:v=>v!=null?Number(v).toFixed(2)+"x":"—",higher:false},
  {key:"dy",label:"DY",fmt:v=>v!=null?Number(v).toFixed(2)+"%":"—",higher:true},
  {key:"roe",label:"ROE",fmt:v=>v!=null?Number(v).toFixed(2)+"%":"—",higher:true},
  {key:"divida_ebitda",label:"Dív/EBITDA",fmt:v=>v!=null?Number(v).toFixed(2)+"x":"—",higher:false},
  {key:"cagr_lucro",label:"CAGR",fmt:v=>v!=null?Number(v).toFixed(2)+"%":"—",higher:true},
  {key:"margem_liquida",label:"Margem",fmt:v=>v!=null?Number(v).toFixed(2)+"%":"—",higher:true},
];

const hoje=new Date(),MES_ATUAL=hoje.getMonth(),ANO_ATUAL=hoje.getFullYear();
const EMPTY={transacoes:[],faturas:[],investimentos:[],metas:[],bancos:[],orcamentos:[],recorrencias:[],dividendos:[],proventosAgendados:[],watchlist:[],alertas:[],historico:[],aporteMensal:0,salario:null,catD:[...CAT_D_DEF],catR:[...CAT_R_DEF]};
const EMPTY_ALL={br:{...EMPTY},au:{...EMPTY}};
const lsGet=k=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):null;}catch{return null;}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,5);
const fmtM=(v,cur="R$")=>cur+" "+Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtPct=v=>v!=null?Number(v).toFixed(2)+"%":"—";

// ===== IMPORTAÇÃO DE EXTRATO (OFX / CSV) =====
function _splitCSVLine(line,sep){const out=[];let cur="";let inQ=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){inQ=!inQ;continue;}if(c===sep&&!inQ){out.push(cur);cur="";continue;}cur+=c;}out.push(cur);return out;}
function parseOFX(text){
  const txs=[];
  const blocks=text.split(/<STMTTRN>/i).slice(1);
  for(const b of blocks){
    const get=tag=>{const m=b.match(new RegExp("<"+tag+">([^<\\r\\n]*)","i"));return m?m[1].trim():"";};
    const dtRaw=get("DTPOSTED");const valorRaw=get("TRNAMT");
    const nm=get("NAME");const mm=get("MEMO");
    let desc=[nm,mm].filter(Boolean).join(" - ")||"Sem descrição";
    if(nm&&mm&&mm.toUpperCase().includes(nm.toUpperCase()))desc=mm; // evita duplicar
    if(!valorRaw||!dtRaw)continue;
    const data=`${dtRaw.slice(0,4)}-${dtRaw.slice(4,6)}-${dtRaw.slice(6,8)}`;
    const num=parseFloat(valorRaw.replace(",","."));
    if(isNaN(num))continue;
    txs.push({data,descricao:desc,valor:Math.abs(num),tipo:num>0?"receita":"despesa"});
  }
  return txs;
}
function parseCSV(text){
  const txs=[];
  const lines=text.split(/\r?\n/).filter(l=>l.trim());
  if(!lines.length)return txs;
  const sep=(lines[0].match(/;/g)||[]).length>0?";":",";
  const cols=_splitCSVLine(lines[0],sep).map(c=>c.toLowerCase().trim());
  const hasHeader=/data|date|valor|amount|hist|desc|narration|lan[çc]amento/i.test(lines[0])&&!/^\d/.test(lines[0].trim());
  let iData,iDesc,iValor;
  if(hasHeader){
    iData=cols.findIndex(c=>/data|date/.test(c));
    iDesc=cols.findIndex(c=>/desc|hist|memo|detalhe|narration|transaction|lan[çc]amento|movimenta|estabelec|favorecido|benefici/i.test(c));
    iValor=cols.findIndex(c=>/valor|amount|montante/.test(c));
    if(iData<0)iData=0;if(iDesc<0)iDesc=1;if(iValor<0)iValor=cols.length-1;
  }else{
    // CSV sem cabeçalho (ex: CommBank "Data,Valor,Descrição,Saldo") — detecta colunas pela natureza
    const first=_splitCSVLine(lines[0],sep).map(c=>c.trim());
    iData=first.findIndex(c=>/^\d{1,2}\/\d{1,2}\/\d{4}$|^\d{4}-\d{2}-\d{2}/.test(c));
    if(iData<0)iData=0;
    const isNum=s=>/^-?\$?[\d.,]+$/.test(s.replace(/\s/g,""))&&/\d/.test(s);
    iValor=-1;for(let k=0;k<first.length;k++){if(k===iData)continue;if(isNum(first[k])){iValor=k;break;}}
    if(iValor<0)iValor=1;
    let melhor=-1,maxLetras=0;
    for(let k=0;k<first.length;k++){if(k===iData||k===iValor)continue;const letras=(first[k].match(/[a-zA-Z]/g)||[]).length;if(letras>maxLetras){maxLetras=letras;melhor=k;}}
    iDesc=melhor>=0?melhor:2;
  }
  const start=hasHeader?1:0;
  for(let i=start;i<lines.length;i++){
    const parts=_splitCSVLine(lines[i],sep);
    if(parts.length<2)continue;
    const dataRaw=(parts[iData]||"").trim();const desc=(parts[iDesc]||"Sem descrição").trim();
    let v=(parts[iValor]||"").trim().replace(/\s/g,"").replace(/\$/g,"");
    if(v.includes(",")&&v.includes(".")){if(v.lastIndexOf(",")>v.lastIndexOf("."))v=v.replace(/\./g,"").replace(",",".");else v=v.replace(/,/g,"");}
    else if(v.includes(","))v=v.replace(",",".");
    const num=parseFloat(v);if(isNaN(num))continue;
    let data=dataRaw;
    const br=dataRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(br)data=`${br[3]}-${br[2].padStart(2,"0")}-${br[1].padStart(2,"0")}`;
    const iso=dataRaw.match(/^(\d{4})-(\d{2})-(\d{2})/);if(iso)data=`${iso[1]}-${iso[2]}-${iso[3]}`;
    txs.push({data,descricao:desc,valor:Math.abs(num),tipo:num>0?"receita":"despesa"});
  }
  return txs;
}
// Categorização automática por palavra-chave na descrição
const _CAT_RULES=[
  [/uber|99|cabify|taxi|posto|shell|ipiranga|combustivel|fuel|metro|onibus|estacion|parking/i,"Transporte"],
  [/ifood|rappi|mercado|supermerc|restaurant|padaria|lanchonete|food|cafe|bar |pizzaria|grocery|woolworths|coles|aldi/i,"Alimentação"],
  [/farmacia|drogaria|hospital|clinica|medic|saude|health|pharmacy|chemist|dentist/i,"Saúde"],
  [/netflix|spotify|prime|disney|hbo|youtube|assinatura|subscription|apple\.com|google/i,"Assinatura"],
  [/cinema|teatro|show|ingresso|game|steam|lazer|entertain/i,"Lazer"],
  [/aluguel|condominio|luz|energia|agua|gas|internet|vivo|claro|tim|rent|electricity|water|stone property/i,"Moradia"],
  [/escola|faculdade|curso|udemy|alura|livro|education|tuition|university/i,"Educação"],
  [/zara|renner|cea|riachuelo|nike|adidas|roupa|vestuario|clothing|myer/i,"Vestuário"],
  [/salario|salary|pagamento|payroll|provento|wage/i,"Salário"],
  [/dividend|jcp|rendiment/i,"Dividendos"],
  [/finance|mazda|car loan|financ|emprestimo|loan/i,"Transporte"],
];
function categorizar(descricao,tipo){
  const d=descricao||"";
  for(const[re,cat]of _CAT_RULES){if(re.test(d)){if(tipo==="receita"&&!["Salário","Dividendos"].includes(cat))continue;return cat;}}
  return null; // null = precisa categorizar manualmente
}

// calcRFAnual / calcValorAtualRF / calcImpostoBR / calcImpostoAU → src/calc.mjs

const authHdr=()=>{const t=lsGet("session")?.token;return t?{"Authorization":`Bearer ${t}`}:{};};
async function askClaude(prompt,maxTokens=900,images=[]){
  try{
    const content=images.length>0?[...images.map(({base64,mediaType})=>({type:"image",source:{type:"base64",media_type:mediaType||"image/jpeg",data:base64}})),{type:"text",text:prompt}]:[{type:"text",text:prompt}];
    const res=await fetch(WORKER,{method:"POST",headers:{"Content-Type":"application/json",...authHdr()},body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:maxTokens,messages:[{role:"user",content}]})});
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const d=await res.json();if(d.error)throw new Error(d.error.message);
    return d.content.filter(b=>b.type==="text").map(b=>b.text).join("").replace(/```json|```/g,"").trim();
  }catch(e){console.error("askClaude:",e);throw e;}
}

// Cache de preços em memória (evita buscar o mesmo ticker repetidamente)
const _precoCache = {};
const PRECO_TTL = 15000; // 15 segundos

async function fetchPrecoReal(ticker, profileId, full=false) {
  const market = profileId || "au";
  const cacheKey = `${ticker}_${market}_${full?"f":"s"}`;
  const cached = _precoCache[cacheKey];
  if (cached && (Date.now() - cached.ts) < PRECO_TTL) return cached.data;
  try {
    const r = await fetch(`${WORKER}/quote?ticker=${encodeURIComponent(ticker)}&market=${market}${full?"&full=1":""}`);
    if (!r.ok) return null;
    const d = await r.json();
    if (d?.preco_atual) {
      _precoCache[cacheKey] = { data: d, ts: Date.now() };
      return d;
    }
  } catch {}
  return null;
}

const GS=`*{box-sizing:border-box;margin:0;padding:0;}body{background:${D.bg};color:${D.text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}input,select,textarea{background:${D.bg3};color:${D.text};border:1px solid ${D.border2};border-radius:8px;padding:8px 12px;font-size:13px;width:100%;outline:none;transition:border-color .2s;}input:focus,select:focus{border-color:${D.green};}input::placeholder{color:${D.text3};}select option{background:${D.bg3};}::-webkit-scrollbar{width:4px;height:4px;}::-webkit-scrollbar-thumb{background:${D.border2};border-radius:2px;}`;

const GRAF_HELP={
  barras:"📊 Barras — receitas (verde) e despesas (vermelho) de cada um dos últimos 6 meses, lado a lado. Serve para comparar o que entrou e o que saiu, mês a mês.",
  patrimonio:"💰 Patrimônio — quanto você TEM ao longo do tempo: saldo dos bancos + investimentos, mês a mês. O último ponto é o valor de hoje. Toque nos pontos para ver o valor de cada mês.",
  pizza_d:"🥧 Despesas — suas despesas do mês atual divididas por categoria. Toque numa fatia para ver os lançamentos daquela categoria.",
  pizza_r:"🥧 Receitas — suas receitas do mês atual divididas por categoria. Toque numa fatia para ver os lançamentos daquela categoria.",
  linha:"📈 Linha — fluxo de caixa acumulado dos últimos 6 meses: soma de (receitas − despesas) mês a mês. Subindo = você guardou; descendo = gastou mais do que ganhou. Não é o patrimônio; usa só o que foi lançado. Toque nos pontos para ver cada mês.",
};
function Tip({text,children}){
  const [show,setShow]=useState(false);
  return <span style={{position:"relative",display:"inline-flex",alignItems:"center",gap:4}}>
    {children}
    <span onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)} onClick={()=>setShow(s=>!s)} style={{width:14,height:14,borderRadius:"50%",background:D.border2,color:D.text3,fontSize:9,display:"inline-flex",alignItems:"center",justifyContent:"center",cursor:"help",flexShrink:0,fontWeight:700}}>?</span>
    {show&&<span style={{position:"absolute",bottom:"calc(100% + 6px)",left:0,background:D.card2,border:`1px solid ${D.border2}`,borderRadius:8,padding:"8px 12px",fontSize:11,color:D.text2,whiteSpace:"normal",zIndex:999,lineHeight:1.6,boxShadow:"0 4px 20px rgba(0,0,0,0.5)",minWidth:200,maxWidth:260}}>{text}</span>}
  </span>;
}
function Card({children,style,glow}){return <div style={{background:D.card,border:`1px solid ${D.border}`,borderRadius:14,padding:"1rem 1.25rem",...(glow?{boxShadow:`0 0 20px ${D.green}22`}:{}),...style}}>{children}</div>;}
function MetricCard({label,value,color,sub,tip}){
  return <div style={{background:D.card2,border:`1px solid ${D.border}`,borderRadius:12,padding:"0.9rem"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
      {tip?<Tip text={tip}><p style={{margin:0,fontSize:10,color:D.text3,textTransform:"uppercase",letterSpacing:"0.5px"}}>{label}</p></Tip>:<p style={{margin:0,fontSize:10,color:D.text3,textTransform:"uppercase",letterSpacing:"0.5px"}}>{label}</p>}
    </div>
    <p style={{margin:"5px 0 0",fontSize:20,fontWeight:700,color:color||D.text}}>{value}</p>
    {sub&&<p style={{margin:"2px 0 0",fontSize:10,color:D.text3}}>{sub}</p>}
  </div>;
}
function Btn({children,onClick,color,disabled,style,outline,sm}){
  const c=color||D.green;
  return <button onClick={onClick} disabled={disabled} style={{padding:sm?"5px 12px":"9px 18px",borderRadius:8,fontSize:sm?11:13,fontWeight:600,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1,transition:"all .15s",...(outline?{background:"transparent",border:`1px solid ${c}`,color:c}:{background:c,border:"none",color:c===D.green||c===D.gold?"#000":"#fff"}),...style}}>{children}</button>;
}
function Modal({title,onClose,children,wide}){
  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,backdropFilter:"blur(4px)"}}>
    <div onClick={e=>e.stopPropagation()} style={{background:D.card,border:`1px solid ${D.border2}`,borderRadius:16,padding:"1.5rem",width:wide?"min(96vw,600px)":"min(96vw,400px)",display:"flex",flexDirection:"column",gap:12,maxHeight:"90vh",overflowY:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <h3 style={{fontSize:16,fontWeight:700,color:D.text}}>{title}</h3>
        <button onClick={onClose} style={{border:"none",background:"none",cursor:"pointer",fontSize:20,color:D.text3}}>✕</button>
      </div>
      {children}
    </div>
  </div>;
}
function Badge({children,color}){const c=color||D.green;return <span style={{fontSize:10,background:c+"22",color:c,borderRadius:20,padding:"2px 8px",fontWeight:600,border:`1px solid ${c}44`}}>{children}</span>;}
function MiniBar({valor,total,cor}){const p=total>0?Math.min(100,(valor/total)*100):0;return <div style={{background:D.bg3,borderRadius:4,height:5,marginTop:4,overflow:"hidden"}}><div style={{width:p+"%",background:cor,borderRadius:4,height:5,transition:"width .5s",boxShadow:`0 0 6px ${cor}88`}}/></div>;}

function TVWidget({type,config}){
  const ref=useRef(null);
  useEffect(()=>{const el=ref.current;if(!el)return;el.innerHTML="";const w=document.createElement("div");w.className="tradingview-widget-container__widget";el.appendChild(w);const s=document.createElement("script");s.type="text/javascript";s.async=true;s.src=`https://s3.tradingview.com/external-embedding/embed-widget-${type}.js`;s.innerHTML=JSON.stringify({...config,theme:"dark",colorTheme:"dark"});el.appendChild(s);return()=>{el.innerHTML="";};},[JSON.stringify(config)]);
  return <div ref={ref} style={{minHeight:config.height||400,borderRadius:10,overflow:"hidden",background:D.bg3,display:"flex",alignItems:"center",justifyContent:"center"}}><p style={{color:D.text3,fontSize:13}}>Carregando TradingView...</p></div>;
}
function ChartModal({ticker,onClose,currency="A$",market="au",dyAlvo=6}){
  // Monta o símbolo do TradingView com a bolsa CERTA (senão ele pega bolsa errada, ex: GETTEX alemã)
  const sym=(()=>{
    if(ticker.includes(":"))return ticker; // já tem bolsa
    const base=ticker.replace(/\.(AX|SA)$/i,""); // tira sufixo .AX/.SA
    if(market==="br")return "BMFBOVESPA:"+base;
    if(market==="us")return base; // EUA: TradingView acha NASDAQ/NYSE corretamente sozinho
    return "ASX:"+base; // mercado australiano
  })();
  const [dados,setDados]=useState(null);
  const [loading,setLoading]=useState(true);
  const [erro,setErro]=useState(false);
  const [aba,setAba]=useState("resumo");
  const [news,setNews]=useState(null);
  const [fatos,setFatos]=useState(null);
  const [newsLoading,setNewsLoading]=useState(false);
  const [descIA,setDescIA]=useState(null);
  const [descIALoading,setDescIALoading]=useState(false);
  useEffect(()=>{
    let vivo=true;
    setLoading(true);setErro(false);
    fetch(`${WORKER}/raiox?ticker=${encodeURIComponent(ticker)}&market=${market}`)
      .then(r=>r.json()).then(d=>{if(vivo){if(d&&!d.error)setDados(d);else setErro(true);setLoading(false);}})
      .catch(()=>{if(vivo){setErro(true);setLoading(false);}});
    return()=>{vivo=false;};
  },[ticker,market]);
  // Gera descrição da empresa via IA quando o Yahoo não traz (BR e alguns ETFs) — cacheia no localStorage por ticker
  useEffect(()=>{
    if(aba!=="sobre"||!dados||dados.descricao||descIALoading||descIA)return;
    const cacheKey=`sobre_${market}_${ticker}`;
    const cached=lsGet(cacheKey);
    if(cached){setDescIA(cached);return;}
    setDescIALoading(true);
    const nome=dados?.nome&&dados.nome!==ticker?dados.nome:ticker;
    const setorTxt=dados?.setor?` (setor: ${dados.setor})`:"";
    askClaude(`Descreva em português, em no máximo 3 frases, o que a empresa ${nome}${setorTxt} faz — o negócio principal, como ela ganha dinheiro e em que mercado atua. NÃO inclua números, cotações, indicadores, preços, datas nem recomendações. Apenas o perfil qualitativo do negócio. Se você não conhece esta empresa com segurança, responda exatamente "SEM_DADOS".`,300)
      .then(txt=>{
        const limpo=(txt||"").trim();
        if(!limpo||/SEM_DADOS/i.test(limpo)){setDescIA("__none__");lsSet(cacheKey,"__none__");}
        else{setDescIA(limpo);lsSet(cacheKey,limpo);}
        setDescIALoading(false);
      })
      .catch(()=>{setDescIA("__none__");setDescIALoading(false);});
  },[aba,dados,ticker,market]);
  function carregarNews(){
    if(news||newsLoading)return;
    setNewsLoading(true);
    // Passa o nome da empresa quando houver — melhora muito a relevância das notícias
    const nome=dados?.nome&&dados.nome!==ticker?dados.nome:"";
    const qNome=nome?`&nome=${encodeURIComponent(nome)}`:"";
    fetch(`${WORKER}/news?ticker=${encodeURIComponent(ticker)}&market=${market}${qNome}`).then(r=>r.json()).then(d=>{const arr=Array.isArray(d)?d:(d.items||[]);setNews(arr.slice(0,10));setFatos(Array.isArray(d?.fatos)?d.fatos:[]);setNewsLoading(false);}).catch(()=>{setNews([]);setFatos([]);setNewsLoading(false);});
  }
  const preco=dados?.preco_atual??dados?.preco??null;
  const teto=(dados?.dy&&dados.dy>0&&preco)?preco*(dados.dy/dyAlvo):null;
  const nomeEmp=dados?.nome&&dados.nome!==ticker?dados.nome:null;
  // Linha de indicador estilo AGF: label à esquerda, valor à direita
  const Lin=({label,valor,suf="",cor,pre=""})=><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${D.border}`}}>
    <span style={{fontSize:12,color:D.text2}}>{label}</span>
    <span style={{fontSize:13,fontWeight:700,color:valor==null?D.text3:(cor||D.text)}}>{valor!=null?`${pre}${typeof valor==="number"?valor.toFixed(2):valor}${suf}`:"—"}</span>
  </div>;
  // Seção nomeada estilo AGF: título em faixa + card
  const Sec=({titulo,children})=><div style={{background:D.bg2,borderRadius:12,overflow:"hidden",marginBottom:12,border:`1px solid ${D.border}`}}>
    <div style={{background:D.green+"18",padding:"9px 14px",borderBottom:`1px solid ${D.green}33`}}><span style={{fontSize:13,fontWeight:800,color:D.green}}>{titulo}</span></div>
    <div style={{padding:"4px 14px 10px"}}>{children}</div>
  </div>;
  const Var=({label,v})=><div style={{textAlign:"center",flex:1}}>
    <p style={{margin:0,fontSize:10,color:D.text3,textTransform:"uppercase"}}>{label}</p>
    <p style={{margin:"3px 0 0",fontSize:14,fontWeight:800,color:v==null?D.text3:v>=0?D.green:D.red}}>{v==null?"—":`${v>=0?"▲":"▼"} ${Math.abs(v).toFixed(1)}%`}</p>
  </div>;
  const Chip=({label,valor})=><div style={{background:D.bg3,borderRadius:10,padding:"8px 12px",flex:"1 1 120px",border:`1px solid ${D.border}`}}>
    <p style={{margin:0,fontSize:10,color:D.text3,textTransform:"uppercase"}}>{label}</p>
    <p style={{margin:"2px 0 0",fontSize:13,fontWeight:700,color:D.text}}>{valor}</p>
  </div>;
  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,backdropFilter:"blur(6px)",padding:12}}>
    <div onClick={e=>e.stopPropagation()} style={{background:D.card,border:`1px solid ${D.border2}`,borderRadius:18,width:"min(96vw,860px)",maxHeight:"94vh",overflowY:"auto"}}>
      {/* Cabeçalho rico estilo AGF */}
      <div style={{padding:"16px 18px 0",position:"sticky",top:0,background:D.card,zIndex:2}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:46,height:46,borderRadius:12,background:`linear-gradient(135deg,${D.green}33,${D.blue}33)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:D.green,flexShrink:0}}>{ticker.slice(0,2)}</div>
            <div>
              <p style={{margin:0,fontSize:22,fontWeight:800,color:D.text,lineHeight:1.1}}>{ticker}</p>
              <p style={{margin:"1px 0 0",fontSize:11,color:D.text3}}>{market==="br"?"BRASIL · B3":market==="us"?"EUA · NYSE/Nasdaq":"AUSTRÁLIA · ASX"}{nomeEmp?` · ${nomeEmp}`:""}</p>
            </div>
          </div>
          <button onClick={onClose} style={{border:"none",background:D.bg3,cursor:"pointer",fontSize:18,color:D.text3,width:32,height:32,borderRadius:8,flexShrink:0}}>✕</button>
        </div>
        {!loading&&!erro&&preco!=null&&<div style={{display:"flex",alignItems:"baseline",gap:10,marginBottom:14,flexWrap:"wrap"}}>
          <span style={{fontSize:30,fontWeight:800,color:D.text}}>{currency} {Number(preco).toFixed(2)}</span>
          {dados?.variacao_dia!=null&&<span style={{fontSize:15,fontWeight:700,color:dados.variacao_dia>=0?D.green:D.red}}>{dados.variacao_dia>=0?"▲":"▼"} {Math.abs(dados.variacao_dia).toFixed(2)}%</span>}
          {(()=>{
            const st=dados?.market_state;
            const aberto=st==="REGULAR";
            const pre=st==="PRE";const pos=st==="POST";
            const cor=aberto?D.green:(pre||pos)?D.gold:D.text3;
            const txt=aberto?"Aberto":pre?"Pré-mercado":pos?"After-market":"Fechado";
            return <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,fontWeight:600,color:cor,alignSelf:"center"}}>
              <span style={{width:8,height:8,borderRadius:"50%",background:cor,boxShadow:aberto?`0 0 6px ${D.green}`:"none",display:"inline-block"}}/>{txt}
            </span>;
          })()}
        </div>}
        {/* Abas */}
        <div style={{display:"flex",gap:4,flexWrap:"wrap",borderBottom:`1px solid ${D.border}`,paddingBottom:0}}>
          {[["resumo","Indicadores"],["sobre","Sobre"],["dividendos","Proventos"],["grafico","Cotação"],["noticias","Notícias"]].map(([v,l])=><button key={v} onClick={()=>{setAba(v);if(v==="noticias")carregarNews();}} style={{padding:"8px 14px",border:"none",borderBottom:aba===v?`2px solid ${D.green}`:"2px solid transparent",cursor:"pointer",fontSize:13,fontWeight:aba===v?700:500,background:"transparent",color:aba===v?D.green:D.text3}}>{l}</button>)}
        </div>
      </div>
      <div style={{padding:"14px 18px 18px"}}>
      {loading&&<p style={{fontSize:13,color:D.text3,padding:"40px 0",textAlign:"center"}}>⏳ Buscando dados de {ticker}...</p>}
      {erro&&<p style={{fontSize:13,color:D.red,padding:"30px 0",textAlign:"center"}}>Não consegui buscar os dados agora. Tente novamente em instantes.</p>}
      {!loading&&!erro&&dados&&<>
        {aba==="resumo"&&<div>
          {/* Chips de contexto estilo AGF */}
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
            {(dados.max_52!=null||dados.min_52!=null)&&<Chip label="Mín/Máx 52 sem" valor={`${dados.min_52?.toFixed(2)||"—"} / ${dados.max_52?.toFixed(2)||"—"}`}/>}
            {dados.margem_liquida!=null&&<Chip label="Margem líquida" valor={`${dados.margem_liquida.toFixed(1)}%`}/>}
            {dados.divida_ebitda!=null&&<Chip label="Dívida/EBITDA" valor={`${dados.divida_ebitda.toFixed(1)}x`}/>}
          </div>
          {/* Variações */}
          <div style={{display:"flex",gap:6,background:D.bg2,borderRadius:12,padding:"12px 6px",marginBottom:12,border:`1px solid ${D.border}`}}>
            <Var label="Semana" v={dados.var_semana}/><Var label="Mês" v={dados.var_mes}/><Var label="Ano" v={dados.var_ano}/>
          </div>
          {/* Preço teto */}
          {teto!=null&&<div style={{background:preco<=teto?D.green+"18":D.red+"18",border:`1px solid ${preco<=teto?D.green:D.red}44`,borderRadius:12,padding:"12px 14px",marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><p style={{margin:0,fontSize:11,color:D.text3}}>Preço teto · método Bazin (DY alvo {dyAlvo}%)</p>
              <p style={{margin:"3px 0 0",fontSize:20,fontWeight:800,color:preco<=teto?D.green:D.red}}>{currency} {teto.toFixed(2)}</p></div>
              <span style={{fontSize:13,fontWeight:700,color:preco<=teto?D.green:D.red,textAlign:"right"}}>{preco<=teto?"✓ Abaixo\ndo teto":"✗ Acima\ndo teto"}</span>
            </div>
          </div>}
          {/* Seções de indicadores estilo AGF */}
          <Sec titulo="Indicadores de avaliação">
            <Lin label="P/L (Preço/Lucro)" valor={dados.pl} cor={dados.pl!=null?(dados.pl<15?D.green:dados.pl>25?D.red:D.text):undefined}/>
            <Lin label="P/VP (Preço/Valor patrim.)" valor={dados.pvp} cor={dados.pvp!=null?(dados.pvp<1.5?D.green:dados.pvp>3?D.red:D.text):undefined}/>
          </Sec>
          <Sec titulo="Indicadores de rentabilidade">
            <Lin label="ROE (Retorno s/ patrimônio)" valor={dados.roe} suf="%" cor={dados.roe!=null?(dados.roe>15?D.green:dados.roe<8?D.red:D.text):undefined}/>
            <Lin label="Margem líquida" valor={dados.margem_liquida} suf="%" cor={dados.margem_liquida!=null?(dados.margem_liquida>15?D.green:D.text):undefined}/>
          </Sec>
          <Sec titulo="Indicadores de dividendos">
            <Lin label="Dividend Yield (DY)" valor={dados.dy} suf="%" cor={dados.dy!=null?(dados.dy>=dyAlvo?D.green:D.text):undefined}/>
            {dados.valor_dividendo!=null&&<Lin label="Dividendo/ação (ano)" valor={dados.valor_dividendo} pre={currency+" "} cor={D.gold}/>}
          </Sec>
          <p style={{fontSize:10,color:D.text3,marginTop:6,lineHeight:1.5}}>⚠️ Dados do Yahoo Finance, podem ter atraso. Preço teto é o método Bazin (régua baseada em dividendos), não é recomendação de compra ou venda. Cores são referência geral, não conselho de investimento.</p>
        </div>}
        {aba==="dividendos"&&<div>
          {dados.prox_dividendo&&<div style={{background:D.green+"18",border:`1px solid ${D.green}44`,borderRadius:12,padding:"12px 14px",marginBottom:14}}>
            <p style={{margin:0,fontSize:11,color:D.text3}}>Próximo pagamento</p>
            <p style={{margin:"3px 0 0",fontSize:18,fontWeight:800,color:D.green}}>{dados.prox_dividendo.split("-").reverse().join("/")}</p>
            {dados.valor_dividendo&&<p style={{margin:"2px 0 0",fontSize:12,color:D.text2}}>{currency} {Number(dados.valor_dividendo).toFixed(2)}/ação ao ano</p>}
          </div>}
          {dados.hist_dividendos?.length>0?<Sec titulo="Histórico de proventos por ano">
            {dados.hist_dividendos.map(h=>{const max=Math.max(...dados.hist_dividendos.map(x=>x.valor));return <div key={h.ano} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0"}}>
              <span style={{fontSize:12,fontWeight:700,color:D.text2,width:42}}>{h.ano}</span>
              <div style={{flex:1,height:20,background:D.bg3,borderRadius:5,overflow:"hidden"}}><div style={{height:"100%",width:`${max>0?h.valor/max*100:0}%`,background:`linear-gradient(90deg,${D.gold}cc,${D.gold})`,borderRadius:5}}/></div>
              <span style={{fontSize:12,fontWeight:700,color:D.gold,width:78,textAlign:"right"}}>{currency} {h.valor.toFixed(2)}</span>
            </div>;})}
          </Sec>:<p style={{fontSize:12,color:D.text3,padding:"20px 0",textAlign:"center"}}>Sem histórico de dividendos disponível para este ativo no Yahoo.</p>}
        </div>}
        {aba==="sobre"&&<div>
          {(()=>{
            const desc=dados?.descricao;const ceo=dados?.ceo;const site=dados?.website;
            const setor=dados?.setor;const indu=dados?.industria;const func=dados?.funcionarios;const pais=dados?.pais;
            const temIA=descIA&&descIA!=="__none__";
            const temAlgo=desc||ceo||site||setor||func||temIA;
            if(!temAlgo&&!descIALoading)return <p style={{fontSize:12,color:D.text3,padding:"24px 0",textAlign:"center"}}>Informações da empresa não disponíveis para este ativo.<br/>(comum em ETFs, fundos e ações recém-listadas)</p>;
            return <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {desc&&<div>
                <p style={{fontSize:12,fontWeight:700,color:D.text2,margin:"0 0 6px"}}>Sobre a empresa</p>
                <p style={{fontSize:12,color:D.text3,lineHeight:1.6,margin:0}}>{desc}</p>
              </div>}
              {!desc&&descIALoading&&<div>
                <p style={{fontSize:12,fontWeight:700,color:D.text2,margin:"0 0 6px"}}>Sobre a empresa</p>
                <p style={{fontSize:12,color:D.text3,padding:"6px 0"}}>🤖 Gerando descrição com IA...</p>
              </div>}
              {!desc&&temIA&&<div>
                <p style={{fontSize:12,fontWeight:700,color:D.text2,margin:"0 0 6px"}}>Sobre a empresa</p>
                <p style={{fontSize:12,color:D.text3,lineHeight:1.6,margin:0}}>{descIA}</p>
                <p style={{fontSize:10,color:D.text3,margin:"6px 0 0",fontStyle:"italic"}}>🤖 Gerado por IA — perfil qualitativo, pode conter imprecisões.</p>
              </div>}
              {(setor||indu)&&<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {setor&&<Badge color={D.blue}>{setor}</Badge>}
                {indu&&<Badge color={D.text3}>{indu}</Badge>}
              </div>}
              <div style={{display:"flex",flexDirection:"column",gap:1}}>
                {ceo&&<div style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid ${D.border}`}}><span style={{fontSize:12,color:D.text3}}>👤 CEO</span><span style={{fontSize:12,color:D.text,fontWeight:600}}>{ceo}</span></div>}
                {func&&<div style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid ${D.border}`}}><span style={{fontSize:12,color:D.text3}}>👥 Funcionários</span><span style={{fontSize:12,color:D.text,fontWeight:600}}>{Number(func).toLocaleString("pt-BR")}</span></div>}
                {pais&&<div style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid ${D.border}`}}><span style={{fontSize:12,color:D.text3}}>🌍 País</span><span style={{fontSize:12,color:D.text,fontWeight:600}}>{pais}</span></div>}
                {site&&<div style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid ${D.border}`}}><span style={{fontSize:12,color:D.text3}}>🔗 Website</span><a href={site.startsWith("http")?site:`https://${site}`} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:D.blue,fontWeight:600,textDecoration:"none"}}>{site.replace(/^https?:\/\//,"")}</a></div>}
              </div>
            </div>;
          })()}
        </div>}
        {aba==="grafico"&&<div style={{borderRadius:12,overflow:"hidden"}}><TVWidget type="advanced-chart" config={{symbol:sym,interval:"D",locale:"pt_BR",style:"1",width:"100%",height:440,allow_symbol_change:true}}/></div>}
        {aba==="noticias"&&<div>
          {newsLoading&&<p style={{fontSize:12,color:D.text3,padding:"20px 0",textAlign:"center"}}>⏳ Buscando notícias...</p>}
          {fatos&&fatos.length>0&&<div style={{marginBottom:14}}>
            <p style={{fontSize:12,fontWeight:700,color:D.gold,margin:"0 0 8px"}}>📢 Fatos Relevantes</p>
            {fatos.map((f,i)=><a key={i} href={f.link} target="_blank" rel="noopener noreferrer" style={{display:"block",padding:"11px 13px",background:D.gold+"11",borderRadius:10,marginBottom:7,textDecoration:"none",border:`1px solid ${D.gold}33`}}>
              <p style={{margin:0,fontSize:13,color:D.text,fontWeight:600,lineHeight:1.35}}>{f.titulo}</p>
              {f.data&&<p style={{margin:"4px 0 0",fontSize:10,color:D.text3}}>{f.data}</p>}
            </a>)}
          </div>}
          {fatos&&fatos.length>0&&news&&news.length>0&&<p style={{fontSize:12,fontWeight:700,color:D.text2,margin:"0 0 8px"}}>📰 Notícias</p>}
          {news&&news.length===0&&(!fatos||fatos.length===0)&&<p style={{fontSize:12,color:D.text3,padding:"20px 0",textAlign:"center"}}>Nenhuma notícia recente encontrada.</p>}
          {news&&news.map((n,i)=><a key={i} href={n.link||n.url} target="_blank" rel="noopener noreferrer" style={{display:"block",padding:"11px 13px",background:D.bg2,borderRadius:10,marginBottom:7,textDecoration:"none",border:`1px solid ${D.border}`}}>
            <p style={{margin:0,fontSize:13,color:D.text,fontWeight:600,lineHeight:1.35}}>{n.title||n.titulo}</p>
            {(n.pubDate||n.data)&&<p style={{margin:"4px 0 0",fontSize:10,color:D.text3}}>{n.pubDate||n.data}</p>}
          </a>)}
        </div>}
      </>}
      </div>
    </div>
  </div>;
}

function BarChart({data,currency}){
  const max=Math.max(...data.map(d=>Math.max(d.r,d.d)),1);
  return <div><div style={{display:"flex",gap:6,alignItems:"flex-end",height:120,padding:"0 4px"}}>
    {data.map((d,i)=><div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
      <div style={{width:"100%",display:"flex",gap:2,alignItems:"flex-end",height:90}}>
        <div style={{flex:1,background:D.green,borderRadius:"3px 3px 0 0",height:Math.max(2,(d.r/max)*90)+"px"}}/>
        <div style={{flex:1,background:D.red,borderRadius:"3px 3px 0 0",height:Math.max(2,(d.d/max)*90)+"px"}}/>
      </div>
      <span style={{fontSize:9,color:D.text3}}>{d.label}</span>
    </div>)}
  </div>
  <div style={{display:"flex",gap:16,justifyContent:"center",marginTop:8}}><span style={{fontSize:11,color:D.green}}>● Receitas</span><span style={{fontSize:11,color:D.red}}>● Despesas</span></div></div>;
}
function PieChart({slices,currency,onSlice}){
  const [sel,setSel]=useState(null);
  let cum=0;const total=slices.reduce((a,b)=>a+b.v,0);
  if(!total)return <p style={{fontSize:13,color:D.text3}}>Sem dados.</p>;
  const fmtV=v=>currency?fmtM(v,currency):String(Math.round(v));
  const paths=slices.filter(s=>s.v>0).map(s=>{const pct=s.v/total,start=cum,end=cum+pct;cum=end;const x1=Math.cos(2*Math.PI*start-Math.PI/2),y1=Math.sin(2*Math.PI*start-Math.PI/2),x2=Math.cos(2*Math.PI*end-Math.PI/2),y2=Math.sin(2*Math.PI*end-Math.PI/2);return{d:`M0,0 L${x1},${y1} A1,1,0,${pct>0.5?1:0},1,${x2},${y2}Z`,color:s.color,label:s.label,pct:Math.round(pct*100),v:s.v,cat:s.cat};});
  const ativo=sel!=null&&paths[sel]?paths[sel]:null;
  const clica=(i,p)=>{setSel(sel===i?null:i);if(onSlice)onSlice(p);};
  return <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
    <svg viewBox="-1.15 -1.15 2.3 2.3" style={{width:110,height:110,flexShrink:0}}>{paths.map((p,i)=><path key={i} d={p.d} fill={p.color} stroke={D.bg2} strokeWidth="0.04" style={{cursor:"pointer",opacity:sel==null||sel===i?1:0.4,transition:"opacity .15s"}} onClick={()=>clica(i,p)} onMouseEnter={()=>setSel(i)} onMouseLeave={()=>setSel(null)}><title>{p.label}: {fmtV(p.v)} ({p.pct}%)</title></path>)}</svg>
    <div style={{display:"flex",flexDirection:"column",gap:5,flex:1,minWidth:140}}>
      {paths.map((p,i)=><div key={i} onClick={()=>clica(i,p)} onMouseEnter={()=>setSel(i)} onMouseLeave={()=>setSel(null)} style={{display:"flex",alignItems:"center",gap:8,fontSize:11,cursor:"pointer",opacity:sel==null||sel===i?1:0.5}}><div style={{width:8,height:8,borderRadius:2,background:p.color,flexShrink:0}}/><span style={{color:D.text2,flex:1}}>{p.label}</span><span style={{color:p.color,fontWeight:600,fontVariantNumeric:"tabular-nums"}}>{sel===i?fmtV(p.v):`${p.pct}%`}</span></div>)}
      <div style={{borderTop:`1px solid ${D.border}`,marginTop:4,paddingTop:6,fontSize:11,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{color:D.text3}}>{ativo?ativo.label:"Total"}</span><span style={{fontWeight:700,color:ativo?ativo.color:D.text}}>{fmtV(ativo?ativo.v:total)}</span></div>
    </div>
  </div>;
}
function LineChart({data,currency}){
  const [sel,setSel]=useState(null);
  const vals=data.map(d=>d.v),max=Math.max(...vals,1),min=Math.min(...vals,0),range=max-min||1;
  const W=320,H=110,pad=14;
  const coord=(d,i)=>({x:pad+(i/(data.length-1||1))*(W-pad*2),y:H-pad-((d.v-min)/range)*(H-pad*2)});
  const pts=data.map((d,i)=>{const{x,y}=coord(d,i);return `${x},${y}`;}).join(" ");
  const s=sel!=null&&data[sel]?coord(data[sel],sel):null;
  const leftPct=s?(s.x/W)*100:0,topPct=s?(s.y/H)*100:0;
  const tx=leftPct>72?"-88%":leftPct<28?"-12%":"-50%";
  const ty=topPct<32?"48%":"-140%";
  return <div style={{position:"relative"}}>
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:H,display:"block"}}>
      <polyline points={pts} fill="none" stroke={D.green} strokeWidth="2" style={{filter:`drop-shadow(0 0 4px ${D.green})`}}/>
      {data.map((d,i)=>{const{x,y}=coord(d,i);const active=sel===i;return <g key={i}>
        <circle cx={x} cy={y} r={active?5:3} fill={D.green} style={active?{filter:`drop-shadow(0 0 5px ${D.green})`}:undefined}/>
        <circle cx={x} cy={y} r="13" fill="transparent" style={{cursor:"pointer"}} onMouseEnter={()=>setSel(i)} onMouseLeave={()=>setSel(null)} onClick={()=>setSel(v=>v===i?null:i)}/>
      </g>;})}
    </svg>
    {s&&<div style={{position:"absolute",left:`${leftPct}%`,top:`${topPct}%`,transform:`translate(${tx},${ty})`,pointerEvents:"none",background:D.bg3,border:`1px solid ${D.green}55`,borderRadius:8,padding:"4px 9px",fontSize:11,color:D.text,whiteSpace:"nowrap",boxShadow:"0 4px 14px rgba(0,0,0,.45)",zIndex:5}}>
      <span style={{color:D.text3}}>{data[sel].label}</span> · <b style={{color:D.green}}>{fmtM(data[sel].v,currency)}</b>
    </div>}
  </div>;
}

// ── OCR Nota Fiscal ───────────────────────────────────────────────────────────
function NFModal({onClose,onSave,currency}){
  const [mode,setMode]=useState("choice");
  const [img,setImg]=useState(null);const [b64,setB64]=useState(null);const [mt,setMt]=useState("image/jpeg");
  const [loading,setLoading]=useState(false);
  const [result,setResult]=useState({valor:0,data:hoje.toISOString().slice(0,10),descricao:"",categoria:"Outros"});
  const fileRef=useRef(null);

  async function processImg(file){
    setLoading(true);
    const reader=new FileReader();
    reader.onload=async e=>{
      const full=e.target.result,base64=full.split(",")[1],mediaType=file.type||"image/jpeg";
      setB64(base64);setMt(mediaType);
      try{
        const txt=await askClaude(`Analise esta nota fiscal/recibo. JSON APENAS: {"valor":number,"data":"YYYY-MM-DD","descricao":"nome do estabelecimento","categoria":"Alimentação|Transporte|Saúde|Lazer|Moradia|Educação|Assinatura|Vestuário|Outros"}`,400,[{base64,mediaType}]);
        setResult(JSON.parse(txt));
      }catch{/* mantém form vazio para preenchimento manual */}
      setLoading(false);setMode("form");
    };
    reader.readAsDataURL(file);
  }

  if(mode==="choice")return <Modal title="📷 Nota Fiscal" onClose={onClose}>
    <p style={{fontSize:12,color:D.text3}}>Como deseja lançar a nota fiscal?</p>
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <button onClick={()=>fileRef.current.click()} style={{padding:"14px",borderRadius:10,background:D.bg3,border:`1px solid ${D.border2}`,color:D.text,cursor:"pointer",fontSize:13,textAlign:"left"}}>
        <p style={{margin:0,fontWeight:600}}>📷 Tirar foto com IA</p>
        <p style={{margin:"2px 0 0",fontSize:11,color:D.text3}}>A IA lê e preenche os dados automaticamente</p>
      </button>
      <button onClick={()=>setMode("form")} style={{padding:"14px",borderRadius:10,background:D.bg3,border:`1px solid ${D.border2}`,color:D.text,cursor:"pointer",fontSize:13,textAlign:"left"}}>
        <p style={{margin:0,fontWeight:600}}>✏️ Preencher manualmente</p>
        <p style={{margin:"2px 0 0",fontSize:11,color:D.text3}}>Digita os dados da NF — aparece no relatório de IR</p>
      </button>
    </div>
    <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f){setImg(URL.createObjectURL(f));processImg(f);}}}/>
  </Modal>;

  return <Modal title="📷 Nota Fiscal" onClose={onClose}>
    {loading&&<p style={{textAlign:"center",color:D.green,fontSize:13}}>🤖 Analisando com IA...</p>}
    {img&&<img src={img} style={{width:"100%",borderRadius:8,maxHeight:160,objectFit:"cover"}}/>}
    <label style={{fontSize:12,color:D.text3}}>Descrição / Estabelecimento<input value={result.descricao} onChange={e=>setResult(r=>({...r,descricao:e.target.value}))} style={{marginTop:4}}/></label>
    <label style={{fontSize:12,color:D.text3}}>Valor ({currency})<input type="number" value={result.valor||""} onChange={e=>setResult(r=>({...r,valor:parseFloat(e.target.value)||0}))} style={{marginTop:4}}/></label>
    <label style={{fontSize:12,color:D.text3}}>Data<input type="date" value={result.data} onChange={e=>setResult(r=>({...r,data:e.target.value}))} style={{marginTop:4}}/></label>
    <label style={{fontSize:12,color:D.text3}}>Categoria<select value={result.categoria} onChange={e=>setResult(r=>({...r,categoria:e.target.value}))} style={{marginTop:4}}>{CAT_D_DEF.map(c=><option key={c}>{c}</option>)}</select></label>
    {!img&&<p style={{fontSize:11,color:D.text3,padding:"6px 10px",background:D.bg3,borderRadius:6}}>📋 Lançamento manual — aparecerá no extrato de NFs para IR</p>}
    <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
      <Btn outline color={D.text3} onClick={onClose}>Cancelar</Btn>
      <Btn color={D.green} onClick={()=>{const du=b64?`data:${mt};base64,${b64}`:null;onSave({...result,nfImg:du,nfManual:!du});}}>Salvar NF</Btn>
    </div>
  </Modal>;
}

// ── Score ─────────────────────────────────────────────────────────────────────
// ── Radar de proventos (Dashboard) ────────────────────────────────────────────
function ProventosRadar({data,currency}){
  const [sel,setSel]=useState(null);
  const h=new Date();
  const ags=(data.proventosAgendados||[]).map(a=>{const dias=diasAte(a.dataPagamento,h);if(dias==null||dias<0)return null;return {...a,dias,total:totalProventoAgendado(a)};}).filter(Boolean).sort((a,b)=>a.dias-b.dias); // testado em calc.mjs
  if(ags.length===0)return null;
  const JANELA=30;
  const dentro=ags.filter(a=>a.dias<=JANELA);
  const depois=ags.filter(a=>a.dias>JANELA);
  const totJanela=dentro.reduce((s,a)=>s+a.total,0);
  // agrupa por dia (para pontos no mesmo dia)
  const porDia={};dentro.forEach(a=>{(porDia[a.dias]=porDia[a.dias]||[]).push(a);});
  const dias=Object.keys(porDia).map(Number).sort((a,b)=>a-b);
  const prox=ags[0];
  const quando=d=>d===0?"hoje":d===1?"amanhã":`em ${d} dias`;
  return <Card style={{border:`1px solid ${D.gold}44`,background:`linear-gradient(135deg,${D.card},${D.gold}0a)`}}>
    <style>{`@keyframes pvPulse{0%,100%{box-shadow:0 0 0 0 ${D.gold}66}50%{box-shadow:0 0 0 7px ${D.gold}00}}`}</style>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",flexWrap:"wrap",gap:6}}>
      <p style={{margin:0,fontSize:13,fontWeight:700,color:D.text}}>📡 Radar de proventos <span style={{fontSize:10,color:D.text3,fontWeight:400}}>próximos {JANELA} dias</span></p>
      {totJanela>0&&<p style={{margin:0,fontSize:13,fontWeight:800,color:D.gold}}>{fmtM(totJanela,currency)}</p>}
    </div>
    {dentro.length>0?<>
      <div style={{position:"relative",height:34,margin:"14px 2px 2px"}}>
        <div style={{position:"absolute",top:16,left:0,right:0,height:2,background:`linear-gradient(90deg,${D.gold}88,${D.border2})`,borderRadius:2}}/>
        {[0,10,20,30].map(dd=><span key={dd} style={{position:"absolute",top:24,left:`calc(${(dd/JANELA)*100}% - 8px)`,fontSize:8,color:D.text3}}>{dd===0?"hoje":`+${dd}d`}</span>)}
        {dias.map(dd=>{const grupo=porDia[dd];const ativo=sel===dd;const primeiro=dd===dias[0];
          return <div key={dd} onClick={()=>setSel(s=>s===dd?null:dd)} style={{position:"absolute",top:10,left:`calc(${(dd/JANELA)*100}% - 7px)`,width:14,height:14,borderRadius:"50%",background:ativo?D.gold:D.card,border:`2.5px solid ${D.gold}`,cursor:"pointer",animation:primeiro?"pvPulse 1.6s infinite":"none",zIndex:2}}>
            {grupo.length>1&&<span style={{position:"absolute",top:-9,right:-6,fontSize:8,fontWeight:800,color:D.gold}}>×{grupo.length}</span>}
          </div>;})}
      </div>
      {sel!=null&&porDia[sel]?<div style={{marginTop:10,padding:"8px 10px",background:D.bg3,borderRadius:8,border:`1px solid ${D.gold}33`}}>
        {porDia[sel].map(a=><p key={a.id} style={{margin:"2px 0",fontSize:12,color:D.text2}}>{a.ticker} · <b style={{color:D.gold}}>{fmtM(a.total,currency)}</b> {quando(a.dias)} ({(a.dataPagamento||"").split("-").reverse().join("/")})</p>)}
      </div>
      :<p style={{margin:"8px 0 0",fontSize:12,color:D.text2}}>Próximo: <b style={{color:D.text}}>{prox.ticker}</b> · <b style={{color:D.gold}}>{fmtM(prox.total,currency)}</b> {quando(prox.dias)}<span style={{color:D.text3,fontSize:10}}> · toque nos pontos</span></p>}
    </>:<p style={{margin:"8px 0 0",fontSize:12,color:D.text2}}>Nada nos próximos {JANELA} dias. Próximo: <b style={{color:D.text}}>{prox.ticker}</b> · <b style={{color:D.gold}}>{fmtM(prox.total,currency)}</b> {quando(prox.dias)}.</p>}
    {depois.length>0&&dentro.length>0&&<p style={{margin:"6px 0 0",fontSize:10,color:D.text3}}>+{depois.length} agendado{depois.length>1?"s":""} depois de {JANELA} dias</p>}
  </Card>;
}

function ScoreCard({data}){
  const txMes=data.transacoes.filter(t=>{const d=new Date(t.data);return d.getMonth()===MES_ATUAL&&d.getFullYear()===ANO_ATUAL;});
  const r=txMes.filter(t=>t.tipo==="receita").reduce((a,b)=>a+b.valor,0);
  const d=txMes.filter(t=>t.tipo==="despesa").reduce((a,b)=>a+b.valor,0);
  const inv=data.investimentos.reduce((a,b)=>a+(b.valorAtual||b.valorInvestido||b.valor||0),0);
  let score=0;
  if(r>0&&d/r<0.7)score+=25;else if(r>0&&d/r<0.9)score+=15;
  if(inv>0)score+=25;if(data.metas.length>0)score+=15;if(data.bancos.length>0)score+=20;if(data.orcamentos?.length>0)score+=15;
  const cor=score>=80?D.green:score>=50?D.gold:D.red;
  const label=score>=80?"Excelente":score>=60?"Bom":score>=40?"Regular":"Atenção";
  const circ=2*Math.PI*36,dash=(score/100)*circ;
  return <div style={{display:"flex",alignItems:"center",gap:14}}>
    <svg width={84} height={84} viewBox="0 0 84 84">
      <circle cx="42" cy="42" r="36" fill="none" stroke={D.bg3} strokeWidth="7"/>
      <circle cx="42" cy="42" r="36" fill="none" stroke={cor} strokeWidth="7" strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ/4} strokeLinecap="round" style={{filter:`drop-shadow(0 0 5px ${cor})`}}/>
      <text x="42" y="42" textAnchor="middle" dy="0.35em" fill={cor} fontSize="16" fontWeight="700">{score}</text>
    </svg>
    <div>
      <Tip text="Score 0-100: proporção receita/despesa, investimentos, metas, bancos e orçamentos.">
        <p style={{fontSize:17,fontWeight:700,color:cor}}>{label}</p>
      </Tip>
      <p style={{fontSize:11,color:D.text3,marginTop:2}}>Score de saúde financeira</p>
    </div>
  </div>;
}

// ── Login ─────────────────────────────────────────────────────────────────────
function LoginScreen({onLogin}){
  const [mode,setMode]=useState("login");const [email,setEmail]=useState(()=>lsGet("last_email")||"");const [pass,setPass]=useState("");
  const [loading,setLoading]=useState(false);const [erro,setErro]=useState("");const [msg,setMsg]=useState("");
  const [estrelas]=useState(()=>Array.from({length:34},()=>({top:Math.random()*100,left:Math.random()*100,size:Math.random()*1.6+0.8,delay:Math.random()*4,dur:2+Math.random()*3})));
  const lembrado=!!lsGet("last_email");
  async function handle(){if(!email||!pass){setErro("Preencha email e senha.");return;}setLoading(true);setErro("");setMsg("");
    try{if(mode==="register"){const r=await supa.signUp(email,pass);if(r.error)setErro(r.error.message);else{setMsg("✅ Conta criada! Verifique seu email.");setMode("login");}}
    else{const r=await supa.signIn(email,pass);if(r.error)setErro("Email ou senha incorretos.");else{lsSet("last_email",email);onLogin(r.access_token,r.user,r.refresh_token);}}}catch{setErro("Erro de conexão.");}setLoading(false);}
  return <div style={{position:"relative",minHeight:"100vh",overflow:"hidden",background:`radial-gradient(ellipse at top,${D.bg2} 0%,${D.bg} 70%)`,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
    <style>{`
      @keyframes flLogoFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
      @keyframes flGlow{0%,100%{opacity:.28;transform:scale(1)}50%{opacity:.44;transform:scale(1.12)}}
      @keyframes flCardIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
      @keyframes flTwinkle{0%,100%{opacity:.12}50%{opacity:.85}}
      @keyframes flShoot{0%{transform:translate(0,0) rotate(32deg);opacity:0}6%{opacity:1}26%{opacity:1}42%{transform:translate(340px,212px) rotate(32deg);opacity:0}100%{transform:translate(340px,212px) rotate(32deg);opacity:0}}
      @keyframes flDraw{0%{stroke-dashoffset:1300;opacity:0}12%{opacity:1}58%{stroke-dashoffset:0;opacity:1}84%{opacity:1}100%{stroke-dashoffset:0;opacity:0}}
      @keyframes flPulse{0%,100%{opacity:.04}50%{opacity:.13}}
      .fl-glow{position:absolute;border-radius:50%;filter:blur(64px);pointer-events:none}
      .fl-glass{background:rgba(255,255,255,.045);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.09);box-shadow:0 24px 64px rgba(0,0,0,.5);animation:flCardIn .6s ease both}
      .fl-star{position:absolute;border-radius:50%;background:#fff;pointer-events:none}
    `}</style>
    <div className="fl-glow" style={{width:340,height:340,top:-80,left:-60,background:`radial-gradient(circle,${D.green}4d,transparent 70%)`,animation:"flGlow 12s ease-in-out infinite"}}/>
    <div className="fl-glow" style={{width:360,height:360,bottom:-90,right:-70,background:`radial-gradient(circle,${D.blue}40,transparent 70%)`,animation:"flGlow 14s ease-in-out infinite 2s"}}/>
    {estrelas.map((s,i)=><div key={i} className="fl-star" style={{top:s.top+"%",left:s.left+"%",width:s.size,height:s.size,animation:`flTwinkle ${s.dur}s ease-in-out ${s.delay}s infinite`}}/>)}
    <div style={{position:"absolute",top:"10%",left:"-8%",width:90,height:2,borderRadius:2,background:`linear-gradient(90deg,transparent,${D.green})`,filter:`drop-shadow(0 0 6px ${D.green})`,opacity:0,pointerEvents:"none",animation:"flShoot 8s ease-in 1.5s infinite"}}/>
    <div style={{position:"absolute",top:"24%",left:"6%",width:70,height:2,borderRadius:2,background:"linear-gradient(90deg,transparent,#fff)",filter:"drop-shadow(0 0 6px #fff)",opacity:0,pointerEvents:"none",animation:"flShoot 11s ease-in 5s infinite"}}/>
    <svg viewBox="0 0 400 200" preserveAspectRatio="none" style={{position:"absolute",left:0,right:0,bottom:0,width:"100%",height:"44%",pointerEvents:"none"}}>
      <path d="M0,175 L33,158 L66,168 L100,140 L133,150 L166,118 L200,128 L233,95 L266,105 L300,70 L333,82 L366,48 L400,32 L400,200 L0,200 Z" fill={D.green} style={{opacity:.07,animation:"flPulse 6s ease-in-out infinite"}}/>
      <path d="M0,175 L33,158 L66,168 L100,140 L133,150 L166,118 L200,128 L233,95 L266,105 L300,70 L333,82 L366,48 L400,32" fill="none" stroke={D.green} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{filter:`drop-shadow(0 0 5px ${D.green})`,strokeDasharray:1300,animation:"flDraw 6s ease-in-out infinite"}}/>
    </svg>
    <div style={{position:"relative",width:"min(100%,400px)",zIndex:1}}>
      <div style={{textAlign:"center",marginBottom:"2rem"}}>
        <div style={{marginBottom:12}}><img src="/logo.svg" alt="logo" style={{width:84,height:84,borderRadius:20,filter:`drop-shadow(0 0 24px ${D.green}77)`,animation:"flLogoFloat 5s ease-in-out infinite"}}/></div>
        <h1 style={{fontSize:24,fontWeight:800,color:D.text,margin:0}}>Controle Financeiro</h1>
        <p style={{color:D.text3,fontSize:13,marginTop:4}}>Gerencie suas finanças em qualquer lugar</p>
        {lembrado&&mode==="login"&&<p style={{color:D.green,fontSize:13,marginTop:8,fontWeight:600}}>Que bom te ver de novo 👋</p>}
      </div>
      <div className="fl-glass" style={{borderRadius:20,padding:"2rem"}}>
        {erro&&<div style={{background:D.red+"22",border:`1px solid ${D.red}44`,borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:12,color:D.red}}>{erro}</div>}
        {msg&&<div style={{background:D.green+"22",border:`1px solid ${D.green}44`,borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:12,color:D.green}}>{msg}</div>}
        <div style={{display:"flex",gap:4,marginBottom:"1.5rem",background:D.bg3,borderRadius:10,padding:4}}>
          {[["login","Entrar"],["register","Criar conta"]].map(([v,l])=><button key={v} onClick={()=>{setMode(v);setErro("");setMsg("");}} style={{flex:1,padding:"9px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:mode===v?700:400,background:mode===v?D.green:"transparent",color:mode===v?"#000":D.text3,transition:"all .2s"}}>{l}</button>)}
        </div>
        <label style={{fontSize:12,color:D.text3,display:"block",marginBottom:12}}>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} placeholder="seu@email.com" style={{marginTop:6}}/></label>
        <label style={{fontSize:12,color:D.text3,display:"block",marginBottom:20}}>Senha<input type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} placeholder="••••••••" style={{marginTop:6}}/></label>
        <Btn onClick={handle} disabled={loading} style={{width:"100%",padding:"12px",fontSize:14,borderRadius:10}}>{loading?"Aguarde...":(mode==="login"?"Entrar →":"Criar conta →")}</Btn>
        <p style={{fontSize:11,color:D.text3,textAlign:"center",marginTop:16}}>🔒 Dados sincronizados em todos os dispositivos</p>
      </div>
    </div>
  </div>;
}

// ── BancoCard ─────────────────────────────────────────────────────────────────
function BancoCard({b,data,setData,currency,extratoBanco,setExtratoBanco,onEdit}){
  const [exp,setExp]=useState(false);
  function sc(){const txs=data.transacoes.filter(t=>t.bancoId===b.id);return(b.saldoInicial||0)+txs.filter(t=>t.tipo==="receita").reduce((a,x)=>a+x.valor,0)-txs.filter(t=>t.tipo==="despesa").reduce((a,x)=>a+x.valor,0);}
  function si(){return data.investimentos.filter(i=>i.bancoId===b.id).reduce((a,i)=>a+(i.valorAtual||i.valorInvestido||i.valor||0),0);}
  const sC=sc(),sI=si();
  return <Card>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
      <div><p style={{margin:"0 0 2px",fontSize:14,fontWeight:700,color:D.blue}}>🏦 {b.nome}</p><p style={{margin:0,fontSize:11,color:D.text3,textTransform:"capitalize"}}>{b.tipo}</p></div>
      <div style={{display:"flex",gap:4}}>
        <button onClick={()=>setExtratoBanco(extratoBanco===b.id?null:b.id)} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>📄</button>
        <button onClick={()=>onEdit(b)} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>✏️</button>
        <button onClick={()=>setData(d=>({...d,bancos:d.bancos.filter(x=>x.id!==b.id)}))} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>🗑</button>
      </div>
    </div>
    <p style={{margin:"10px 0 0",fontSize:11,color:D.text3}}>Saldo conta</p>
    <p style={{margin:"0 0 8px",fontSize:22,fontWeight:700,color:sC>=0?D.green:D.red}}>{fmtM(sC,currency)}</p>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",padding:"6px 10px",background:D.bg3,borderRadius:8}} onClick={()=>setExp(e=>!e)}>
      <p style={{margin:0,fontSize:11,color:D.text3}}>Investimentos: <strong style={{color:D.blue}}>{fmtM(sI,currency)}</strong></p>
      <span style={{fontSize:10,color:D.text3}}>{exp?"▲":"▼"}</span>
    </div>
    {exp&&<div style={{marginTop:8,borderTop:`1px solid ${D.border}`,paddingTop:8}}>
      {data.investimentos.filter(i=>i.bancoId===b.id).length===0?<p style={{fontSize:11,color:D.text3}}>Nenhum investimento.</p>:data.investimentos.filter(i=>i.bancoId===b.id).map(i=><div key={i.id} style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}><span style={{color:D.text2}}>{i.ticker||i.descricao||i.tipo}</span><span style={{fontWeight:600,color:D.blue}}>{fmtM(i.valorAtual||i.valorInvestido||0,currency)}</span></div>)}
    </div>}
    {b.limite>0&&<p style={{margin:"4px 0 0",fontSize:11,color:D.text3}}>Limite: {fmtM(b.limite,currency)}</p>}
  </Card>;
}

// ── Bancos Tab ────────────────────────────────────────────────────────────────
function BancosTab({data,setData,currency}){
  const [modal,setModal]=useState(false);const [form,setForm]=useState({});
  const [transf,setTransf]=useState({de:"",para:"",valor:""});const [extratoBanco,setExtratoBanco]=useState(null);
  function saveBanco(){const clampDia=v=>{const n=parseInt(v,10);return n>=1&&n<=31?n:null;};const b={id:form.editId||uid(),nome:form.nome||"Banco",saldoInicial:parseFloat(form.saldoInicial)||0,limite:parseFloat(form.limite)||0,tipo:form.tipo||"corrente",diaFecha:clampDia(form.diaFecha),diaVence:clampDia(form.diaVence)};setData(d=>({...d,bancos:form.editId?d.bancos.map(x=>x.id===form.editId?b:x):[...d.bancos,b]}));setModal(false);setForm({});}
  function doTransf(){const v=parseFloat(transf.valor);if(!v||!transf.de||!transf.para||transf.de===transf.para)return;const dt=hoje.toISOString().slice(0,10);setData(d=>({...d,transacoes:[...d.transacoes,{id:uid(),tipo:"despesa",descricao:`Transf. → ${d.bancos.find(b=>b.id===transf.para)?.nome}`,valor:v,categoria:"Transferência",data:dt,bancoId:transf.de},{id:uid(),tipo:"receita",descricao:`Transf. ← ${d.bancos.find(b=>b.id===transf.de)?.nome}`,valor:v,categoria:"Transferência",data:dt,bancoId:transf.para}]}));setTransf({de:"",para:"",valor:""});}
  function sc(b){const txs=data.transacoes.filter(t=>t.bancoId===b.id);return(b.saldoInicial||0)+txs.filter(t=>t.tipo==="receita").reduce((a,x)=>a+x.valor,0)-txs.filter(t=>t.tipo==="despesa").reduce((a,x)=>a+x.valor,0);}
  const totalC=data.bancos.reduce((a,b)=>a+sc(b),0);
  const totalI=data.bancos.reduce((a,b)=>a+data.investimentos.filter(i=>i.bancoId===b.id).reduce((x,y)=>x+(y.valorAtual||y.valorInvestido||y.valor||0),0),0);
  const bExtr=extratoBanco?data.bancos.find(b=>b.id===extratoBanco):null;
  const txExtr=bExtr?data.transacoes.filter(t=>t.bancoId===extratoBanco).sort((a,b)=>b.data.localeCompare(a.data)):[];
  return <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
      <Btn onClick={()=>{setModal(true);setForm({});}}>+ Novo banco</Btn>
      <div style={{display:"flex",gap:12,fontSize:13}}><span style={{color:D.text3}}>Conta: <strong style={{color:D.blue}}>{fmtM(totalC,currency)}</strong></span><span style={{color:D.text3}}>Invest: <strong style={{color:D.green}}>{fmtM(totalI,currency)}</strong></span></div>
    </div>
    {data.bancos.length===0&&<p style={{fontSize:13,color:D.text3}}>Nenhum banco cadastrado.</p>}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10}}>
      {data.bancos.map(b=><BancoCard key={b.id} b={b} data={data} setData={setData} currency={currency} extratoBanco={extratoBanco} setExtratoBanco={setExtratoBanco} onEdit={b=>{setModal(true);setForm({...b,editId:b.id});}}/>)}
    </div>
    {extratoBanco&&bExtr&&<Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <p style={{fontSize:14,fontWeight:700,color:D.text}}>📄 Extrato — {bExtr.nome}</p>
        <button onClick={()=>setExtratoBanco(null)} style={{border:"none",background:"none",cursor:"pointer",fontSize:18,color:D.text3}}>✕</button>
      </div>
      {txExtr.length===0?<p style={{fontSize:13,color:D.text3}}>Sem movimentações.</p>:txExtr.map(t=><div key={t.id} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${D.border}`,fontSize:13}}>
        <div><p style={{margin:0,fontWeight:500,color:D.text}}>{t.descricao}</p><p style={{margin:0,fontSize:11,color:D.text3}}>{t.categoria} · {t.data}</p></div>
        <span style={{fontWeight:700,color:t.tipo==="receita"?D.green:D.red}}>{t.tipo==="receita"?"+":"-"}{fmtM(t.valor,currency)}</span>
      </div>)}
    </Card>}
    {data.bancos.length>=2&&<Card>
      <p style={{fontSize:14,fontWeight:700,color:D.text,marginBottom:10}}>↔ Transferência entre bancos</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
        <label style={{fontSize:12,color:D.text3}}>De<select value={transf.de} onChange={e=>setTransf(f=>({...f,de:e.target.value}))} style={{marginTop:4}}><option value="">Selecione...</option>{data.bancos.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}</select></label>
        <label style={{fontSize:12,color:D.text3}}>Para<select value={transf.para} onChange={e=>setTransf(f=>({...f,para:e.target.value}))} style={{marginTop:4}}><option value="">Selecione...</option>{data.bancos.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}</select></label>
      </div>
      <label style={{fontSize:12,color:D.text3,display:"block",marginBottom:8}}>Valor<input type="number" value={transf.valor} onChange={e=>setTransf(f=>({...f,valor:e.target.value}))} style={{marginTop:4}}/></label>
      <Btn onClick={doTransf} color={D.blue}>Transferir</Btn>
    </Card>}
    {modal&&<Modal title={form.editId?"Editar banco":"Novo banco"} onClose={()=>setModal(false)}>
      <label style={{fontSize:12,color:D.text3}}>Nome<input value={form.nome||""} onChange={e=>setForm(f=>({...f,nome:e.target.value}))} placeholder="Ex: Nubank, ANZ..." style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Tipo<select value={form.tipo||"corrente"} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} style={{marginTop:4}}><option value="corrente">Conta Corrente</option><option value="poupança">Poupança</option><option value="investimento">Conta Investimento</option><option value="digital">Conta Digital</option><option value="cartão">Cartão de crédito</option></select></label>
      <label style={{fontSize:12,color:D.text3}}>Saldo inicial ({currency})<input type="number" value={form.saldoInicial||""} onChange={e=>setForm(f=>({...f,saldoInicial:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Limite crédito ({currency})<input type="number" value={form.limite||""} onChange={e=>setForm(f=>({...f,limite:e.target.value}))} style={{marginTop:4}}/></label>
      {(form.tipo||"corrente")==="cartão"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <label style={{fontSize:12,color:D.text3}}>Fecha dia<input type="number" min="1" max="31" value={form.diaFecha||""} onChange={e=>setForm(f=>({...f,diaFecha:e.target.value}))} placeholder="ex: 7" style={{marginTop:4}}/></label>
        <label style={{fontSize:12,color:D.text3}}>Vence dia<input type="number" min="1" max="31" value={form.diaVence||""} onChange={e=>setForm(f=>({...f,diaVence:e.target.value}))} placeholder="ex: 20" style={{marginTop:4}}/></label>
      </div>}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn outline color={D.text3} onClick={()=>setModal(false)}>Cancelar</Btn><Btn onClick={saveBanco}>Salvar</Btn></div>
    </Modal>}
  </div>;
}

// ── Lançamentos Tab ───────────────────────────────────────────────────────────
function LancamentosTab({data,setData,currency,mes,profileId}){
  const [modal,setModal]=useState(null);const [form,setForm]=useState({});
  const [showNF,setShowNF]=useState(false);const [showExtratoNF,setShowExtratoNF]=useState(false);
  const [newCatD,setNewCatD]=useState("");const [newCatR,setNewCatR]=useState("");
  const [modalOrc,setModalOrc]=useState(false);const [orcForm,setOrcForm]=useState({});
  const [modalRec,setModalRec]=useState(false);const [recForm,setRecForm]=useState({});
  const [quickValor,setQuickValor]=useState("");
  const [quickOrigem,setQuickOrigem]=useState("Conta Corrente");
  const [quickCat,setQuickCat]=useState("Outros");
  const [quickTipo,setQuickTipo]=useState("despesa");
  const [impItens,setImpItens]=useState(null);
  const [impBanco,setImpBanco]=useState("");
  const [nfView,setNfView]=useState(null);
  const [delParc,setDelParc]=useState(null);
  const isAU=profileId==="au";  // AU: ano fiscal 1 jul–30 jun · BR/US: ano-calendário 1 jan–31 dez
  const FY_ATUAL=isAU?(MES_ATUAL>=6?ANO_ATUAL:ANO_ATUAL-1):ANO_ATUAL;
  const [fyPdf,setFyPdf]=useState(FY_ATUAL);
  const impRef=useRef(null);
  const ORIGENS=["Conta Corrente","Pix","TED","DOC","Cartão Débito","Dinheiro"];
  const catD=data.catD||CAT_D_DEF,catR=data.catR||CAT_R_DEF;

  function addCat(tipo,nome){if(!nome.trim())return;setData(d=>({...d,[tipo==="D"?"catD":"catR"]:[...(tipo==="D"?d.catD||CAT_D_DEF:d.catR||CAT_R_DEF),nome.trim()]}));}

  function exportarNFsPDF(){
    const ini=isAU?new Date(fyPdf,6,1,0,0,0):new Date(fyPdf,0,1,0,0,0);
    const fim=isAU?new Date(fyPdf+1,5,30,23,59,59):new Date(fyPdf,11,31,23,59,59);
    const itens=nfsComNF.filter(t=>{const d=new Date(t.data);return d>=ini&&d<=fim;}).sort((a,b)=>a.data.localeCompare(b.data));
    if(!itens.length){alert(isAU?`Nenhuma nota fiscal entre 1 jul ${fyPdf} e 30 jun ${fyPdf+1}.`:`Nenhuma nota fiscal no ano ${fyPdf}.`);return;}
    const total=itens.reduce((a,t)=>a+(t.valor||0),0);
    const fyLabel=isAU?`${fyPdf}–${String(fyPdf+1).slice(2)}`:`${fyPdf}`;
    const tituloPeriodo=isAU?`Ano fiscal ${fyLabel}`:`Ano-calendário ${fyLabel}`;
    const subPeriodo=isAU?`Período 1 jul ${fyPdf} – 30 jun ${fyPdf+1}`:`Período 1 jan ${fyPdf} – 31 dez ${fyPdf}`;
    const escH=s=>String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const lista=itens.map(t=>`<tr><td>${escH(t.data)}</td><td>${escH(t.descricao)}</td><td>${escH(t.categoria)}</td><td style="text-align:right">${fmtM(t.valor,currency)}</td><td style="text-align:center">${t.nfImg?"✓":"—"}</td></tr>`).join("");
    const paginas=itens.map(t=>`<div class="nf">
      <h2>${escH(t.descricao||"Nota fiscal")}</h2>
      <table class="meta"><tr><td>Data</td><td>${escH(t.data)}</td></tr><tr><td>Categoria</td><td>${escH(t.categoria)}</td></tr><tr><td>Valor</td><td>${fmtM(t.valor,currency)}</td></tr></table>
      ${t.nfImg?`<img src="${t.nfImg}"/>`:'<p class="sem">Sem foto — lançamento manual</p>'}
    </div>`).join("");
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>NFs ${tituloPeriodo}</title>
<style>body{font-family:system-ui,Arial,sans-serif;color:#111;margin:0;padding:24px}h1{font-size:18px;margin:0 0 4px}h2{font-size:15px;margin:0 0 8px}.cover{margin-bottom:8px}.nf{page-break-before:always;padding-top:8px}.nf img{max-width:100%;max-height:760px;object-fit:contain;border:1px solid #ccc;border-radius:6px;margin-top:8px}table.meta{border-collapse:collapse;font-size:13px;margin-bottom:6px}table.meta td{border:1px solid #ddd;padding:4px 10px}table.meta td:first-child{color:#666;font-weight:600}.sem{color:#999;font-style:italic}table.lista{width:100%;border-collapse:collapse;font-size:12px;margin-top:10px}table.lista th,table.lista td{border-bottom:1px solid #eee;padding:5px 8px;text-align:left}table.lista th{background:#f4f4f4}</style>
</head><body>
<div class="cover">
<h1>🧾 Notas Fiscais — ${tituloPeriodo}</h1>
<p style="font-size:12px;color:#666">${subPeriodo} · Gerado em ${new Date().toLocaleString("pt-BR")} · ${itens.length} nota(s) · Total ${fmtM(total,currency)}</p>
<table class="lista"><thead><tr><th>Data</th><th>Estabelecimento</th><th>Categoria</th><th style="text-align:right">Valor</th><th style="text-align:center">Foto</th></tr></thead><tbody>${lista}</tbody></table>
</div>
${paginas}
<script>window.onload=function(){window.print();}</script>
</body></html>`;
    const w=window.open("","_blank");
    if(!w){alert("Permita pop-ups neste site para gerar o PDF.");return;}
    w.document.write(html);w.document.close();
  }
  const txMes=data.transacoes.filter(t=>{const d=new Date(t.data);return d.getMonth()===mes&&d.getFullYear()===ANO_ATUAL;});

  function saveQuick(){
    const v=parseFloat(quickValor);if(!v)return;
    if(data.bancos.length===0){alert("Cadastre um banco primeiro!");return;}
    const banco=data.bancos[0];
    const t={id:uid(),tipo:quickTipo,descricao:`${quickOrigem}`,valor:v,
      categoria:quickCat||(quickTipo==="receita"?catR[0]:catD[0]),
      data:hoje.toISOString().slice(0,10),bancoId:banco.id,
      nfImg:null,nfManual:false};
    setData(d=>({...d,transacoes:[...d.transacoes,t]}));
    setQuickValor("");
  }

  function saveT(){
    if(!form.bancoId&&data.bancos.length>0){alert("Selecione um banco!");return;}
    const valorNum=parseFloat(form.valor)||0;
    if(valorNum<=0){alert("⚠️ O valor precisa ser maior que zero.\n\nDica: confira se você digitou o número no campo VALOR (e não no campo Descrição).");return;}
    const np=(profileId==="br"&&!form.editId&&(form.tipo||"despesa")!=="receita")?Math.max(1,parseInt(form.parcelas)||1):1;
    if(np>1){
      const grupo=uid();
      const desc=form.descricao||"Compra parcelada";
      const cat=form.categoria||catD[0];
      const inicio=form.data||hoje.toISOString().slice(0,10);
      const novas=[];
      for(let k=0;k<np;k++){
        const dstr=parcelaData(inicio,k);           // testado em calc.mjs
        const val=parcelaValor(valorNum,np,k);      // testado em calc.mjs
        novas.push({id:uid(),tipo:"despesa",descricao:`${desc} (${k+1}/${np})`,valor:val,categoria:cat,data:dstr,bancoId:form.bancoId||null,nfImg:k===0?(form.nfImg||null):null,nfManual:false,parceladoId:grupo});
      }
      setData(d=>({...d,transacoes:[...d.transacoes,...novas]}));
      setModal(null);setForm({});
      return;
    }
    const t={id:form.editId||uid(),tipo:form.tipo||"despesa",descricao:form.descricao||"Sem descrição",
      valor:valorNum,categoria:form.categoria||(form.tipo==="receita"?catR[0]:catD[0]),
      data:form.data||hoje.toISOString().slice(0,10),bancoId:form.bancoId||null,
      nfImg:form.nfImg||null,nfManual:form.nfManual||false};
    setData(d=>({...d,transacoes:form.editId?d.transacoes.map(x=>x.id===form.editId?t:x):[...d.transacoes,t]}));
    setModal(null);setForm({});
  }

  function abrirImport(){
    if(data.bancos.length===0){alert("Cadastre um banco primeiro na aba Bancos!");return;}
    impRef.current?.click();
  }
  function lerArquivo(e){
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const txt=ev.target.result;
        const isOFX=/\.ofx$/i.test(file.name)||/<STMTTRN>|<OFX>/i.test(txt);
        let parsed=isOFX?parseOFX(txt):parseCSV(txt);
        if(!parsed.length){alert("Não encontrei lançamentos nesse arquivo. Verifique se é um extrato OFX ou CSV do seu banco.");e.target.value="";return;}
        // Detecta duplicados: mesma data + mesmo valor + mesmo tipo já existente
        const existentes=data.transacoes;
        const itens=parsed.map(p=>{
          const dup=existentes.some(t=>t.data===p.data&&Math.abs(t.valor-p.valor)<0.01&&t.tipo===p.tipo);
          const catSugerida=categorizar(p.descricao,p.tipo);
          return {...p,dup,incluir:!dup,categoria:catSugerida||(p.tipo==="receita"?catR[0]:catD[0]),autoCat:!!catSugerida};
        });
        setImpBanco(data.bancos[0]?.id||"");
        setImpItens(itens);
      }catch(err){alert("Erro ao ler o arquivo. Tente exportar novamente do banco em formato OFX.");}
      e.target.value="";
    };
    reader.readAsText(file,"ISO-8859-1"); // bancos BR usam latin1; CSVs UTF-8 também leem ok
  }
  function confirmarImport(){
    const novos=impItens.filter(i=>i.incluir).map(i=>({id:uid(),tipo:i.tipo,descricao:i.descricao,valor:i.valor,categoria:i.categoria,data:i.data,bancoId:impBanco||null,nfImg:null,nfManual:false}));
    if(!novos.length){setImpItens(null);return;}
    setData(d=>({...d,transacoes:[...d.transacoes,...novos]}));
    setImpItens(null);
    alert(`✅ ${novos.length} lançamento${novos.length!==1?"s":""} importado${novos.length!==1?"s":""}!`);
  }
  function saveOrc(){
    const cat=orcForm.categoria||catD[0];
    const val=parseFloat(orcForm.valor)||0;
    if(val<=0){alert("Defina um limite maior que zero.");return;}
    setData(d=>{
      const lista=d.orcamentos||[];
      // edição direta de um item existente (clicou no ✏️)
      if(orcForm.editId) return {...d,orcamentos:lista.map(x=>x.id===orcForm.editId?{...x,categoria:cat,valor:val}:x)};
      // sem editId: se já existe orçamento dessa categoria, ATUALIZA (não duplica)
      const existe=lista.find(x=>x.categoria===cat);
      if(existe) return {...d,orcamentos:lista.map(x=>x.categoria===cat?{...x,valor:val}:x)};
      return {...d,orcamentos:[...lista,{id:uid(),categoria:cat,valor:val}]};
    });
    setOrcForm({});
  }
  function saveRec(){const r={id:recForm.editId||uid(),tipo:recForm.tipo||"despesa",descricao:recForm.descricao||"",valor:parseFloat(recForm.valor)||0,categoria:recForm.categoria||catD[0],frequencia:recForm.frequencia||"mensal",dia:parseInt(recForm.dia)||1,diaSemana:recForm.diaSemana!=null?parseInt(recForm.diaSemana):1,bancoId:recForm.bancoId||null};setData(d=>({...d,recorrencias:recForm.editId?(d.recorrencias||[]).map(x=>x.id===recForm.editId?r:x):[...(d.recorrencias||[]),r]}));setModalRec(false);setRecForm({});}
  const nfsComNF=data.transacoes.filter(t=>t.nfImg||t.nfManual);

  const nfFileRef=useRef(null);
  function handleNFFile(e){
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>setForm(f=>({...f,nfImg:ev.target.result,nfManual:false}));
    reader.readAsDataURL(file);
  }

  return <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
    {nfView&&<div onClick={()=>setNfView(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,zIndex:300,padding:16,cursor:"zoom-out"}}>
      <img src={nfView} onClick={e=>e.stopPropagation()} style={{maxWidth:"100%",maxHeight:"80vh",objectFit:"contain",borderRadius:8,cursor:"default"}}/>
      <button onClick={e=>{e.stopPropagation();fetch(nfView).then(r=>r.blob()).then(b=>{const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download="nota-fiscal-"+Date.now()+(b.type==="image/png"?".png":".jpg");a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}).catch(()=>{});}} style={{padding:"9px 18px",borderRadius:8,border:"none",background:D.green,color:"#000",fontSize:13,fontWeight:600,cursor:"pointer"}}>⬇️ Baixar imagem</button>
      <button onClick={()=>setNfView(null)} style={{position:"absolute",top:16,right:16,width:40,height:40,borderRadius:20,border:"none",background:"rgba(255,255,255,0.15)",color:"#fff",fontSize:20,cursor:"pointer"}}>✕</button>
    </div>}
    {showNF&&<NFModal currency={currency} onClose={()=>setShowNF(false)} onSave={dados=>{setForm(f=>({...f,...dados,tipo:"despesa"}));setShowNF(false);setModal("tx");}}/>}

    {impItens&&<Modal title="📥 Revisar importação" onClose={()=>setImpItens(null)}>
      {(()=>{
        const novos=impItens.filter(i=>!i.dup);
        const dups=impItens.filter(i=>i.dup);
        const semCat=novos.filter(i=>i.incluir&&!i.autoCat);
        return <div>
          <p style={{fontSize:13,color:D.text2,marginBottom:6}}>Encontrei <b style={{color:D.text}}>{novos.length}</b> lançamento{novos.length!==1?"s":""} novo{novos.length!==1?"s":""}{dups.length>0&&<span style={{color:D.text3}}> ({dups.length} já existe{dups.length!==1?"m":""}, ignorado{dups.length!==1?"s":""})</span>}.</p>
          {semCat.length>0&&<p style={{fontSize:12,color:D.gold,marginBottom:8}}>⚠️ {semCat.length} sem categoria automática — revise abaixo.</p>}
          <div style={{marginBottom:10}}>
            <label style={{fontSize:11,color:D.text3,display:"block",marginBottom:4}}>Banco / conta destes lançamentos:</label>
            <select value={impBanco} onChange={e=>setImpBanco(e.target.value)} style={{width:"100%",padding:"7px 8px",fontSize:12}}>
              {data.bancos.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}
            </select>
          </div>
          <div style={{maxHeight:340,overflowY:"auto",display:"flex",flexDirection:"column",gap:6}}>
            {novos.map((it,idx)=>{
              const realIdx=impItens.indexOf(it);
              return <div key={idx} style={{background:D.bg3,borderRadius:8,padding:"8px 10px",border:`1px solid ${it.incluir?D.border:D.border2}`,opacity:it.incluir?1:0.5}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                  <input type="checkbox" checked={it.incluir} onChange={e=>{const v=e.target.checked;setImpItens(arr=>arr.map((x,i)=>i===realIdx?{...x,incluir:v}:x));}} style={{width:16,height:16,cursor:"pointer",flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    {it.incluir
                      ?<input value={it.descricao} onChange={e=>{const v=e.target.value;setImpItens(arr=>arr.map((x,i)=>i===realIdx?{...x,descricao:v}:x));}} placeholder="Nome do lançamento" style={{width:"100%",fontSize:12,fontWeight:600,padding:"3px 6px",marginBottom:2}}/>
                      :<p style={{margin:0,fontSize:12,fontWeight:600,color:D.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.descricao}</p>}
                    <p style={{margin:0,fontSize:10,color:D.text3}}>{it.data.split("-").reverse().join("/")}</p>
                  </div>
                  <span style={{fontSize:13,fontWeight:700,color:it.tipo==="receita"?D.green:D.red,flexShrink:0}}>{it.tipo==="receita"?"+":"−"}{fmtM(it.valor,currency)}</span>
                </div>
                {it.incluir&&<select value={it.categoria} onChange={e=>{const v=e.target.value;setImpItens(arr=>arr.map((x,i)=>i===realIdx?{...x,categoria:v,autoCat:true}:x));}} style={{width:"100%",padding:"4px 6px",fontSize:11,border:it.autoCat?`1px solid ${D.border}`:`1px solid ${D.gold}`}}>
                  {(it.tipo==="receita"?catR:catD).map(c=><option key={c} value={c}>{c}</option>)}
                </select>}
              </div>;
            })}
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}>
            <Btn outline color={D.text3} onClick={()=>setImpItens(null)}>Cancelar</Btn>
            <Btn color={D.green} onClick={confirmarImport}>Importar {novos.filter(i=>i.incluir).length}</Btn>
          </div>
        </div>;
      })()}
    </Modal>}

    <Card style={{border:`1px solid ${D.gold}44`}}>
      <p style={{fontSize:13,fontWeight:700,color:D.gold,marginBottom:8}}>⚡ Lançamento rápido — caiu no banco</p>
      <div style={{display:"flex",gap:4,marginBottom:8}}>
        {["despesa","receita"].map(t=><button key={t} onClick={()=>setQuickTipo(t)} style={{flex:1,padding:"6px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:quickTipo===t?700:400,background:quickTipo===t?(t==="despesa"?D.red:D.green):"transparent",color:quickTipo===t?"#fff":D.text3}}>{t==="despesa"?"↓ Saída":"↑ Entrada"}</button>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
        <label style={{fontSize:12,color:D.text3}}>Valor ({currency})
          <input type="number" value={quickValor} onChange={e=>setQuickValor(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&saveQuick()}
            placeholder="0,00" style={{marginTop:4}}/>
        </label>
        <label style={{fontSize:12,color:D.text3}}>Origem
          <select value={quickOrigem} onChange={e=>setQuickOrigem(e.target.value)} style={{marginTop:4}}>
            {ORIGENS.map(o=><option key={o}>{o}</option>)}
          </select>
        </label>
      </div>
      <label style={{fontSize:12,color:D.text3,display:"block",marginBottom:8}}>Categoria
        <select value={quickCat} onChange={e=>setQuickCat(e.target.value)} style={{marginTop:4}}>
          {(quickTipo==="receita"?catR:catD).map(c=><option key={c}>{c}</option>)}
        </select>
      </label>
      {data.bancos.length>0&&<p style={{fontSize:10,color:D.text3,marginBottom:6}}>→ Lançado em: <strong style={{color:D.blue}}>{data.bancos[0].nome}</strong> · {hoje.toLocaleDateString("pt-BR")}</p>}
      <Btn onClick={saveQuick} color={D.gold} style={{width:"100%"}}>Lançar agora</Btn>
    </Card>

    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      <Btn onClick={()=>{setModal("tx");setForm({});}}>+ Lançamento completo</Btn>
      <Btn onClick={()=>setShowNF(true)} color={D.blue} outline sm>📷 Nota Fiscal c/ IA</Btn>
      <Btn onClick={abrirImport} color={D.green} outline sm>📥 Importar extrato</Btn>
      <Btn onClick={()=>{setModalOrc(true);setOrcForm({});}} color={D.gold} outline sm>🎯 Orçamento</Btn>
      <Btn onClick={()=>{setModalRec(true);setRecForm({});}} color={D.purple} outline sm>🔄 Recorrência</Btn>
      {nfsComNF.length>0&&<Btn onClick={()=>setShowExtratoNF(true)} color={D.green} outline sm>🧾 NFs para IR ({nfsComNF.length})</Btn>}
    </div>
    <input ref={impRef} type="file" accept=".ofx,.csv,.txt" onChange={lerArquivo} style={{display:"none"}}/>

    {showExtratoNF&&<Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <p style={{fontSize:14,fontWeight:700,color:D.text}}>🧾 Notas Fiscais para IR</p>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <select value={fyPdf} onChange={e=>setFyPdf(+e.target.value)} style={{fontSize:11,padding:"4px 6px"}}>
            {[FY_ATUAL,FY_ATUAL-1,FY_ATUAL-2].map(y=><option key={y} value={y}>{isAU?`Ano fiscal ${y}–${String(y+1).slice(2)}`:`Ano ${y}`}</option>)}
          </select>
          <Btn sm color={D.blue} onClick={exportarNFsPDF}>{isAU?"📄 PDF ano fiscal":"📄 PDF do ano"}</Btn>
          <Btn sm color={D.green} onClick={()=>{const csv=["Data,Descrição,Categoria,Valor,Tipo",...nfsComNF.map(t=>`${t.data},"${t.descricao}",${t.categoria},${t.valor},${t.nfImg?"Foto":"Manual"}`)].join("\n");const b=new Blob([csv],{type:"text/csv"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download="NFs_IR.csv";a.click();}}>⬇️ CSV</Btn>
          <button onClick={()=>setShowExtratoNF(false)} style={{border:"none",background:"none",cursor:"pointer",color:D.text3,fontSize:18}}>✕</button>
        </div>
      </div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead><tr style={{background:D.bg3}}>
          <th style={{padding:"8px",textAlign:"left",color:D.text3}}>Data</th>
          <th style={{padding:"8px",textAlign:"left",color:D.text3}}>Descrição</th>
          <th style={{padding:"8px",textAlign:"left",color:D.text3}}>Cat.</th>
          <th style={{padding:"8px",textAlign:"right",color:D.text3}}>Valor</th>
          <th style={{padding:"8px",textAlign:"center",color:D.text3}}>NF</th>
        </tr></thead>
        <tbody>{nfsComNF.map(t=><tr key={t.id} style={{borderBottom:`1px solid ${D.border}`}}>
          <td style={{padding:"8px",color:D.text2}}>{t.data}</td>
          <td style={{padding:"8px",color:D.text}}>{t.descricao}</td>
          <td style={{padding:"8px"}}><Badge color={D.purple}>{t.categoria}</Badge></td>
          <td style={{padding:"8px",textAlign:"right",color:D.red,fontWeight:600}}>{fmtM(t.valor,currency)}</td>
          <td style={{padding:"8px",textAlign:"center"}}>
            {t.nfImg
              ?<img src={t.nfImg} style={{width:32,height:32,objectFit:"cover",borderRadius:4,cursor:"pointer",border:`1px solid ${D.green}`}} onClick={()=>setNfView(t.nfImg)}/>
              :<span style={{fontSize:10,color:D.text3}}>Manual</span>}
          </td>
        </tr>)}</tbody>
      </table>
      <p style={{fontSize:11,color:D.text3,marginTop:6}}>Total: <strong style={{color:D.red}}>{fmtM(nfsComNF.reduce((a,b)=>a+b.valor,0),currency)}</strong></p></div>
    </Card>}

    {data.recorrencias?.length>0&&<Card>
      <p style={{fontSize:13,fontWeight:700,color:D.text,marginBottom:8}}>🔄 Recorrentes</p>
      {data.recorrencias.map(r=><div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",background:D.bg3,borderRadius:8,fontSize:12,marginBottom:4}}>
        <span style={{color:D.text2}}>{r.descricao} <span style={{color:D.text3,fontSize:10}}>{r.frequencia==="semanal"?`toda ${["dom","seg","ter","qua","qui","sex","sáb"][r.diaSemana!=null?r.diaSemana:1]}`:r.frequencia==="quinzenal"?`a cada 2 sem · ${["dom","seg","ter","qua","qui","sex","sáb"][r.diaSemana!=null?r.diaSemana:1]}`:`dia ${r.dia}`}</span></span>
        <div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{fontWeight:700,color:r.tipo==="receita"?D.green:D.red}}>{r.tipo==="receita"?"+":"-"}{fmtM(r.valor,currency)}</span><button onClick={()=>{setRecForm({editId:r.id,tipo:r.tipo,descricao:r.descricao,valor:String(r.valor),categoria:r.categoria,frequencia:r.frequencia||"mensal",dia:r.dia,diaSemana:r.diaSemana,bancoId:r.bancoId});setModalRec(true);}} style={{border:"none",background:"none",cursor:"pointer",color:D.text3,fontSize:12}}>✏️</button><button onClick={()=>setData(d=>({...d,recorrencias:(d.recorrencias||[]).filter(x=>x.id!==r.id)}))} style={{border:"none",background:"none",cursor:"pointer",color:D.red,fontSize:12}}>🗑</button></div>
      </div>)}
    </Card>}

    {data.bancos.length===0&&<div style={{background:D.red+"22",border:`1px solid ${D.red}44`,borderRadius:10,padding:"10px 14px",fontSize:12,color:D.red}}>⚠️ Cadastre um banco primeiro.</div>}
    {txMes.length===0&&<p style={{fontSize:13,color:D.text3}}>Nenhum lançamento neste mês.</p>}
    {txMes.sort((a,b)=>b.data.localeCompare(a.data)).map(t=><Card key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"0.75rem 1rem"}}>
      <div style={{width:36,height:36,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",background:t.tipo==="receita"?D.green+"22":D.red+"22",fontSize:16,flexShrink:0}}>{t.tipo==="receita"?"↑":"↓"}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}><p style={{margin:0,fontSize:13,fontWeight:600,color:D.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.descricao}</p>{t.nfImg&&<img src={t.nfImg} style={{width:22,height:22,objectFit:"cover",borderRadius:3,cursor:"pointer",flexShrink:0}} onClick={()=>setNfView(t.nfImg)} title="Ver NF"/>}{!t.nfImg&&t.nfManual&&<span title="NF Manual" style={{fontSize:11}}>📋</span>}</div>
        <p style={{margin:0,fontSize:11,color:D.text3}}>{t.categoria} · {t.data}{t.bancoId?` · 🏦 ${data.bancos.find(b=>b.id===t.bancoId)?.nome||""}`:""}</p>
      </div>
      <span style={{fontWeight:700,color:t.tipo==="receita"?D.green:D.red,fontSize:14,flexShrink:0}}>{t.tipo==="receita"?"+":"-"}{fmtM(t.valor,currency)}</span>
      <div style={{display:"flex",gap:4}}>
        <button onClick={()=>{setModal("tx");setForm({...t,editId:t.id});}} style={{border:"none",background:"none",cursor:"pointer",fontSize:13,color:D.text3}}>✏️</button>
        <button onClick={()=>t.parceladoId?setDelParc(t):setData(d=>({...d,transacoes:d.transacoes.filter(x=>x.id!==t.id)}))} style={{border:"none",background:"none",cursor:"pointer",fontSize:13,color:D.red}}>🗑</button>
      </div>
    </Card>)}

    {delParc&&(()=>{
      const grupo=data.transacoes.filter(x=>x.parceladoId===delParc.parceladoId);
      const n=grupo.length;
      const base=(delParc.descricao||"").replace(/\s*\(\d+\/\d+\)\s*$/,"");
      const totalGrupo=grupo.reduce((a,x)=>a+x.valor,0);
      const del=ids=>{setData(d=>({...d,transacoes:d.transacoes.filter(x=>!ids.includes(x.id))}));setDelParc(null);};
      return <Modal title="Apagar compra parcelada" onClose={()=>setDelParc(null)}>
        <p style={{fontSize:13,color:D.text2,lineHeight:1.5,margin:"0 0 4px"}}><b>{base}</b></p>
        <p style={{fontSize:12,color:D.text3,lineHeight:1.5,margin:"0 0 12px"}}>Esta compra tem <b>{n} parcela{n>1?"s":""}</b> (total {fmtM(totalGrupo,currency)}). O que deseja apagar?</p>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <Btn color={D.red} onClick={()=>del(grupo.map(x=>x.id))}>🗑 Apagar todas as {n} parcelas</Btn>
          <Btn outline color={D.text3} onClick={()=>del([delParc.id])}>Apagar só esta parcela ({delParc.descricao.match(/\((\d+\/\d+)\)/)?.[1]||""})</Btn>
          <Btn outline color={D.text3} onClick={()=>setDelParc(null)}>Cancelar</Btn>
        </div>
      </Modal>;
    })()}
    {modal==="tx"&&<Modal title={form.editId?"Editar":"Novo lançamento completo"} onClose={()=>setModal(null)}>
      <label style={{fontSize:12,color:D.text3}}>Tipo<select value={form.tipo||"despesa"} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} style={{marginTop:4}}><option value="despesa">Despesa</option><option value="receita">Receita</option></select></label>
      <label style={{fontSize:12,color:D.text3}}>Descrição<input value={form.descricao||""} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Valor ({currency})<input type="number" value={form.valor||""} onChange={e=>setForm(f=>({...f,valor:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Categoria<select value={form.categoria||""} onChange={e=>setForm(f=>({...f,categoria:e.target.value}))} style={{marginTop:4}}>{(form.tipo==="receita"?catR:catD).map(c=><option key={c}>{c}</option>)}</select></label>
      <div style={{display:"flex",gap:6}}><input placeholder="Nova categoria..." value={form.tipo==="receita"?newCatR:newCatD} onChange={e=>form.tipo==="receita"?setNewCatR(e.target.value):setNewCatD(e.target.value)} style={{flex:1}}/><Btn sm onClick={()=>{addCat(form.tipo==="receita"?"R":"D",form.tipo==="receita"?newCatR:newCatD);form.tipo==="receita"?setNewCatR(""):setNewCatD("");}}>+ Add</Btn></div>
      <label style={{fontSize:12,color:D.text3}}>Data<input type="date" value={form.data||hoje.toISOString().slice(0,10)} onChange={e=>setForm(f=>({...f,data:e.target.value}))} style={{marginTop:4}}/></label>
      {profileId==="br"&&(form.tipo||"despesa")!=="receita"&&!form.editId&&<label style={{fontSize:12,color:D.text3}}>Parcelas (cartão BR)
        <select value={form.parcelas||1} onChange={e=>setForm(f=>({...f,parcelas:+e.target.value}))} style={{marginTop:4}}>
          {Array.from({length:24},(_,i)=>i+1).map(n=><option key={n} value={n}>{n===1?"À vista (1×)":`${n}×`}</option>)}
        </select>
        {(+form.parcelas>1)&&(()=>{const v=parseFloat(form.valor)||0;return v>0?<span style={{display:"block",fontSize:11,color:D.purple,marginTop:4}}>{form.parcelas}× de ~{fmtM(Math.round(v/(+form.parcelas)*100)/100,currency)} · cria {form.parcelas} lançamentos, 1 por mês, marcados (1/{form.parcelas})…</span>:<span style={{display:"block",fontSize:11,color:D.text3,marginTop:4}}>Digite o valor total da compra acima.</span>;})()}
      </label>}
      <label style={{fontSize:12,color:D.text3}}>Banco <span style={{color:D.red}}>*</span><select value={form.bancoId||""} onChange={e=>setForm(f=>({...f,bancoId:e.target.value}))} style={{marginTop:4}}><option value="">Selecione...</option>{data.bancos.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}</select></label>
      <div style={{borderTop:`1px solid ${D.border}`,paddingTop:10}}>
        <p style={{fontSize:12,color:D.text3,marginBottom:6}}>📎 Nota Fiscal (opcional)</p>
        <input ref={nfFileRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleNFFile}/>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>nfFileRef.current.click()} style={{flex:1,padding:"8px",borderRadius:8,border:`1px dashed ${D.border2}`,background:D.bg3,cursor:"pointer",fontSize:12,color:D.text3,textAlign:"center"}}>
            {form.nfImg?"🖼 Trocar foto":"📷 Anexar foto da NF"}
          </button>
          {form.nfImg&&<button onClick={()=>setForm(f=>({...f,nfImg:null}))} style={{padding:"8px 12px",borderRadius:8,border:`1px solid ${D.red}44`,background:"transparent",cursor:"pointer",fontSize:12,color:D.red}}>✕</button>}
        </div>
        {form.nfImg&&<img src={form.nfImg} style={{width:"100%",borderRadius:8,marginTop:8,maxHeight:160,objectFit:"cover",border:`1px solid ${D.green}44`}}/>}
        {!form.nfImg&&<p style={{fontSize:10,color:D.text3,marginTop:4}}>Sem foto — aparecerá como lançamento manual no extrato de NFs</p>}
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn outline color={D.text3} onClick={()=>setModal(null)}>Cancelar</Btn><Btn onClick={saveT}>Salvar</Btn></div>
    </Modal>}

    {modalOrc&&<Modal title="🎯 Orçamentos mensais" onClose={()=>{setModalOrc(false);setOrcForm({});}}>
      {(data.orcamentos||[]).length>0&&<div style={{marginBottom:12}}>
        <p style={{fontSize:11,color:D.text3,marginBottom:6}}>Orçamentos atuais — ✏️ edita, 🗑 remove:</p>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {(data.orcamentos||[]).map(o=><div key={o.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,background:D.bg3,borderRadius:8,padding:"7px 10px",border:orcForm.editId===o.id?`1px solid ${D.gold}`:`1px solid ${D.border}`}}>
            <span style={{fontSize:12,color:D.text2}}>{o.categoria}</span>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:12,fontWeight:600,color:D.gold}}>{fmtM(o.valor,currency)}</span>
              <button onClick={()=>setOrcForm({editId:o.id,categoria:o.categoria,valor:String(o.valor)})} style={{border:"none",background:"none",cursor:"pointer",fontSize:13,color:D.text3}}>✏️</button>
              <button onClick={()=>setData(d=>({...d,orcamentos:(d.orcamentos||[]).filter(x=>x.id!==o.id)}))} style={{border:"none",background:"none",cursor:"pointer",fontSize:13,color:D.red}}>🗑</button>
            </div>
          </div>)}
        </div>
        <div style={{borderTop:`1px solid ${D.border}`,margin:"12px 0 0"}}/>
      </div>}
      <p style={{fontSize:12,color:D.text2,fontWeight:600,margin:"0 0 6px"}}>{orcForm.editId?"Editar orçamento":"Novo orçamento"}</p>
      <label style={{fontSize:12,color:D.text3}}>Categoria<select value={orcForm.categoria||""} onChange={e=>setOrcForm(f=>({...f,categoria:e.target.value}))} style={{marginTop:4}}><option value="">Selecione...</option>{catD.map(c=><option key={c}>{c}</option>)}</select></label>
      <label style={{fontSize:12,color:D.text3,marginTop:8,display:"block"}}>Limite ({currency})<input type="number" value={orcForm.valor||""} onChange={e=>setOrcForm(f=>({...f,valor:e.target.value}))} style={{marginTop:4}}/></label>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:10}}>
        {orcForm.editId&&<Btn outline color={D.text3} onClick={()=>setOrcForm({})}>Cancelar edição</Btn>}
        <Btn outline color={D.text3} onClick={()=>{setModalOrc(false);setOrcForm({});}}>Fechar</Btn>
        <Btn color={D.gold} onClick={saveOrc}>{orcForm.editId?"Atualizar":"Adicionar"}</Btn>
      </div>
    </Modal>}
    {modalRec&&<Modal title={recForm.editId?"Editar recorrência":"Nova recorrência"} onClose={()=>{setModalRec(false);setRecForm({});}}>
      <label style={{fontSize:12,color:D.text3}}>Tipo<select value={recForm.tipo||"despesa"} onChange={e=>setRecForm(f=>({...f,tipo:e.target.value}))} style={{marginTop:4}}><option value="despesa">Despesa</option><option value="receita">Receita</option></select></label>
      <label style={{fontSize:12,color:D.text3}}>Descrição<input value={recForm.descricao||""} onChange={e=>setRecForm(f=>({...f,descricao:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Valor ({currency})<input type="number" value={recForm.valor||""} onChange={e=>setRecForm(f=>({...f,valor:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Categoria<select value={recForm.categoria||""} onChange={e=>setRecForm(f=>({...f,categoria:e.target.value}))} style={{marginTop:4}}>{(recForm.tipo==="receita"?catR:catD).map(c=><option key={c}>{c}</option>)}</select></label>
      <label style={{fontSize:12,color:D.text3}}>Frequência<select value={recForm.frequencia||"mensal"} onChange={e=>setRecForm(f=>({...f,frequencia:e.target.value}))} style={{marginTop:4}}><option value="mensal">Mensal</option><option value="semanal">Semanal</option><option value="quinzenal">Quinzenal (a cada 2 semanas)</option></select></label>
      {(recForm.frequencia||"mensal")==="mensal"&&<label style={{fontSize:12,color:D.text3}}>Dia do mês<input type="number" min="1" max="31" value={recForm.dia||""} onChange={e=>setRecForm(f=>({...f,dia:e.target.value}))} style={{marginTop:4}}/></label>}
      {(recForm.frequencia==="semanal"||recForm.frequencia==="quinzenal")&&<label style={{fontSize:12,color:D.text3}}>Dia da semana<select value={recForm.diaSemana!=null?recForm.diaSemana:1} onChange={e=>setRecForm(f=>({...f,diaSemana:e.target.value}))} style={{marginTop:4}}>{["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"].map((d,i)=><option key={i} value={i}>{d}</option>)}</select></label>}
      {recForm.frequencia==="quinzenal"&&<p style={{fontSize:11,color:D.text3,marginTop:4,marginBottom:0}}>📅 A cada 2 semanas (uma sim, outra não), no dia escolhido. A 1ª ocorrência define o ritmo.</p>}
      {data.bancos.length>0&&<label style={{fontSize:12,color:D.text3}}>Banco<select value={recForm.bancoId||""} onChange={e=>setRecForm(f=>({...f,bancoId:e.target.value}))} style={{marginTop:4}}><option value="">Nenhum</option>{data.bancos.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}</select></label>}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn outline color={D.text3} onClick={()=>setModalRec(false)}>Cancelar</Btn><Btn color={D.purple} onClick={saveRec}>Salvar</Btn></div>
    </Modal>}
  </div>;
}

// ── Investimentos Tab ─────────────────────────────────────────────────────────
function InvestimentosTab({data,setData,currency,profileId}){
  const [view,setView]=useState("classe");
  const [modal,setModal]=useState(false);const [form,setForm]=useState({});
  const [chartTicker,setChartTicker]=useState(null);const [loadingId,setLoadingId]=useState(null);
  const [modalDiv,setModalDiv]=useState(false);const [divForm,setDivForm]=useState({});
  const [modalAg,setModalAg]=useState(false);const [agForm,setAgForm]=useState({});
  const [atualizandoTodos,setAtualizandoTodos]=useState(false);
  const [aporteInput,setAporteInput]=useState(()=>String(data.aporteMensal||""));
  const [modalAporte,setModalAporte]=useState(null);const [aporteForm,setAporteForm]=useState({});
  const [modalResgate,setModalResgate]=useState(null);const [resgateForm,setResgateForm]=useState({});

  // Aporta mais unidades numa ação existente e RECALCULA o preço médio
  function aportar(){
    const inv=data.investimentos.find(x=>x.id===modalAporte);
    if(!inv)return;
    const qtdNova=parseFloat(aporteForm.quantidade);
    const precoNovo=parseFloat(aporteForm.preco);
    if(!qtdNova||qtdNova<=0||!precoNovo||precoNovo<=0)return;
    const {qtdTotal,pmNovo,custoTotal:viNovo}=aporteMedio(inv.quantidade||0,inv.precoMedio||0,qtdNova,precoNovo); // testado em calc.mjs
    // Mantém o preço atual de mercado se existir, recalcula valor atual
    const precoAtual=inv.preco_atual||pmNovo;
    const valorAtual=precoAtual*qtdTotal;
    // Registra o aporte no histórico da posição
    const histAporte={data:aporteForm.data||hoje.toISOString().slice(0,10),quantidade:qtdNova,preco:precoNovo};
    const atualizado={...inv,quantidade:qtdTotal,precoMedio:Math.round(pmNovo*100)/100,valorInvestido:Math.round(viNovo*100)/100,valor:Math.round(viNovo*100)/100,valorAtual:Math.round(valorAtual*100)/100,lucro:Math.round((valorAtual-viNovo)*100)/100,aportes:[...(inv.aportes||[]),histAporte]};
    setData(d=>({...d,investimentos:d.investimentos.map(x=>x.id===inv.id?atualizado:x)}));
    setModalAporte(null);setAporteForm({});
  }

  const isBR=profileId==="br";
  const totalInvest=data.investimentos.reduce((a,b)=>a+(b.valorAtual||b.valorInvestido||b.valor||0),0);
  const totalInvestido=data.investimentos.reduce((a,b)=>a+(b.valorInvestido||b.valor||0),0);
  const totalLucro=totalInvest-totalInvestido;
  const rentTotal=totalInvestido>0?((totalInvest-totalInvestido)/totalInvestido)*100:0;

  const rendaVariavel=data.investimentos.filter(i=>["Ações","FII","ETF","Cripto"].includes(i.tipo));
  const rendaFixa=data.investimentos.filter(i=>["Renda Fixa","Tesouro Direto"].includes(i.tipo));
  const outros=data.investimentos.filter(i=>i.tipo==="Outros");
  const totalRV=rendaVariavel.reduce((a,b)=>a+(b.valorAtual||b.valorInvestido||0),0);
  const totalRF=rendaFixa.reduce((a,b)=>a+(b.valorAtual||b.valorInvestido||0),0);
  const totalOu=outros.reduce((a,b)=>a+(b.valorAtual||b.valorInvestido||0),0);

  const divMes=(data.dividendos||[]).filter(d=>{const dt=new Date(d.data);return dt.getMonth()===MES_ATUAL&&dt.getFullYear()===ANO_ATUAL;});
  const totDiv=divMes.reduce((a,b)=>a+b.valor,0);
  const hojeStr=hoje.toISOString().slice(0,10);
  // Próximos dividendos: só os com data futura (ou no máximo 7 dias atrás), evita datas velhas
  const proxDiv=data.investimentos.filter(i=>i.prox_dividendo&&i.prox_dividendo>=hojeStr).sort((a,b)=>a.prox_dividendo.localeCompare(b.prox_dividendo));
  // Dividendos com data já vencida (para avisar que precisam atualizar)
  const divVencidos=data.investimentos.filter(i=>i.prox_dividendo&&i.prox_dividendo<hojeStr);
  // Proventos agendados manualmente (a receber)
  const agendados=(data.proventosAgendados||[]).slice().sort((a,b)=>(a.dataPagamento||"").localeCompare(b.dataPagamento||""));
  const agFuturos=agendados.filter(a=>(a.dataPagamento||"")>=hojeStr);
  const agVencidos=agendados.filter(a=>(a.dataPagamento||"")<hojeStr);
  const totalAgTotal=totalProventoAgendado; // testado em calc.mjs
  const totalAReceber=agFuturos.reduce((s,a)=>s+totalAgTotal(a),0);
  const em7=new Date(hoje.getTime()+7*864e5).toISOString().slice(0,10);
  const agProximos=agFuturos.filter(a=>(a.dataPagamento||"")<=em7);
  // Estimativa de renda passiva pelo DY histórico
  const estDY=data.investimentos.filter(i=>i.dy>0&&(i.valorAtual||i.valorInvestido||i.valor)>0).map(i=>({ticker:i.ticker||i.descricao||i.tipo,dy:i.dy,anual:(i.valorAtual||i.valorInvestido||i.valor||0)*i.dy/100})).sort((a,b)=>b.anual-a.anual);
  const totEstAnual=estDY.reduce((s,x)=>s+x.anual,0);

  async function buscarDados(inv){
    if(inv.tipo==="Renda Fixa"||inv.tipo==="Tesouro Direto"){
      const va=calcValorAtualRF(inv);
      setData(d=>({...d,investimentos:d.investimentos.map(x=>x.id===inv.id?{...x,valorAtual:va,lucro:va-(inv.valorInvestido||inv.valor||0),preco_atual:va/(inv.quantidade||1)}:x)}));
      return;
    }
    if(!inv.ticker) return;
    setLoadingId(inv.id);
    const real=await fetchPrecoReal(inv.ticker, profileId, true);
    if(real?.preco_atual){
      const va=real.preco_atual*(inv.quantidade||1);
      const lucro=va-(inv.precoMedio||0)*(inv.quantidade||1);
      // Usa dados de dividendo REAIS do Yahoo quando disponíveis
      const divUpdate={};
      if(real.dy!=null) divUpdate.dy=Math.round(real.dy*100)/100;
      if(real.prox_dividendo) divUpdate.prox_dividendo=real.prox_dividendo;
      if(real.ex_dividendo) divUpdate.ex_dividendo=real.ex_dividendo;
      if(real.valor_dividendo!=null) divUpdate.valor_dividendo=Math.round(real.valor_dividendo*100)/100;
      setData(d=>({...d,investimentos:d.investimentos.map(x=>x.id===inv.id?{...x,preco_atual:real.preco_atual,variacao_dia:real.variacao_dia,valorAtual:va,lucro,...divUpdate,ultimaAtualizacao:new Date().toLocaleTimeString("pt-BR")}:x)}));
      // Só pede ao Claude o que o Yahoo NÃO trouxe (resumo, ou dividendo faltante)
      if(!real.dy||!real.prox_dividendo){
        try{
          const mercado=nomeMercado(profileId);
          const txt=await askClaude(`Para o ativo ${inv.ticker} na ${mercado} com preço atual de ${real.preco_atual}, retorne APENAS JSON: {${!real.dy?'"dy":number_or_null,':''}${!real.prox_dividendo?'"prox_dividendo":"YYYY-MM-DD or null","valor_dividendo":number_or_null,':''}"resumo":"1 frase sobre perspectiva atual"}. Use a data real do próximo pagamento de dividendo se souber; caso contrário use null.`,300);
          const extra=JSON.parse(txt);
          // Não sobrescreve o que o Yahoo já trouxe
          const limpo={};
          if(!real.dy&&extra.dy!=null) limpo.dy=extra.dy;
          if(!real.prox_dividendo&&extra.prox_dividendo) limpo.prox_dividendo=extra.prox_dividendo;
          if(!real.valor_dividendo&&extra.valor_dividendo!=null) limpo.valor_dividendo=extra.valor_dividendo;
          if(extra.resumo) limpo.resumo=extra.resumo;
          if(Object.keys(limpo).length) setData(d=>({...d,investimentos:d.investimentos.map(x=>x.id===inv.id?{...x,...limpo}:x)}));
        }catch{}
      }
    }else{
      try{
        const mercado=nomeMercado(profileId);
        const txt=await askClaude(`Preço de fechamento mais recente do ativo ${inv.ticker} na ${mercado}. JSON apenas: {"preco_atual":number}`,150);
        const obj=JSON.parse(txt);
        if(obj.preco_atual>0){const va=obj.preco_atual*(inv.quantidade||1);setData(d=>({...d,investimentos:d.investimentos.map(x=>x.id===inv.id?{...x,preco_atual:obj.preco_atual,valorAtual:va,lucro:va-(inv.precoMedio||0)*(inv.quantidade||1),ultimaAtualizacao:new Date().toLocaleTimeString("pt-BR")}:x)}));}
      }catch{}
    }
    setLoadingId(null);
  }

  const invRefreshRef = useRef(null);
  useEffect(()=>{
    invRefreshRef.current=setInterval(async()=>{
      const ativos=data.investimentos.filter(i=>i.ticker||(i.tipo==="Renda Fixa"||i.tipo==="Tesouro Direto"));
      for(const inv of ativos) await buscarDados(inv);
    },60000);
    return()=>clearInterval(invRefreshRef.current);
  },[data.investimentos.length,profileId]);

  async function atualizarTodos(){
    setAtualizandoTodos(true);
    const ativos=data.investimentos.filter(i=>i.ticker||i.tipo==="Renda Fixa"||i.tipo==="Tesouro Direto");
    for(const inv of ativos){await buscarDados(inv);}
    setAtualizandoTodos(false);
  }

  function saveInv(){
    const isRF=form.tipo==="Renda Fixa"||form.tipo==="Tesouro Direto";
    const vi=parseFloat(form.valorInvestido)||parseFloat(form.precoMedio||0)*parseFloat(form.quantidade||1)||0;
    const i={id:form.editId||uid(),tipo:form.tipo||"Ações",descricao:form.descricao||"",ticker:(form.ticker||"").toUpperCase(),quantidade:parseFloat(form.quantidade)||1,precoMedio:parseFloat(form.precoMedio)||0,valorInvestido:vi,valor:vi,data:form.data||hoje.toISOString().slice(0,10),bancoId:form.bancoId||null,indice:form.indice||"CDI",taxaRF:parseFloat(form.taxaRF)||0,pctIndice:parseFloat(form.pctIndice)||100,rfTipo:form.rfTipo||"pct",vencimento:form.vencimento||""};
    if(isRF){i.valorAtual=calcValorAtualRF(i);i.lucro=i.valorAtual-vi;}
    const debita=!form.editId&&form.bancoId&&form.debitarBanco!==false&&vi>0;
    let aplicTx=null;
    if(debita){aplicTx={id:uid(),tipo:"despesa",descricao:`Aplicação: ${i.ticker||i.descricao||i.tipo}`,valor:vi,categoria:"Aplicação",data:i.data,bancoId:i.bancoId};i.aplicacaoTxId=aplicTx.id;}
    setData(d=>({...d,investimentos:form.editId?d.investimentos.map(x=>x.id===form.editId?i:x):[...d.investimentos,i],transacoes:aplicTx?[...d.transacoes,aplicTx]:d.transacoes}));setModal(false);setForm({});
  }
  function saveDiv(){const d={id:divForm.editId||uid(),ticker:divForm.ticker||"",valor:parseFloat(divForm.valor)||0,data:divForm.data||hoje.toISOString().slice(0,10),tipo:divForm.tipo||"Dividendo"};setData(dd=>({...dd,dividendos:divForm.editId?(dd.dividendos||[]).map(x=>x.id===divForm.editId?d:x):[...(dd.dividendos||[]),d]}));setModalDiv(false);setDivForm({});}
  function saveAg(){const q=parseFloat(agForm.quantidade)||0,va=parseFloat(agForm.valorAcao)||0;const a={id:agForm.editId||uid(),ticker:(agForm.ticker||"").toUpperCase(),valorAcao:va,quantidade:q,dataPagamento:agForm.dataPagamento||hojeStr,dataCom:agForm.dataCom||"",tipo:agForm.tipo||"Dividendo"};setData(dd=>({...dd,proventosAgendados:agForm.editId?(dd.proventosAgendados||[]).map(x=>x.id===agForm.editId?a:x):[...(dd.proventosAgendados||[]),a]}));setModalAg(false);setAgForm({});}
  function receberAg(a){const total=totalAgTotal(a);if(!window.confirm(`Marcar como recebido? Vai lançar ${fmtM(total,currency)} de ${a.ticker} nos proventos recebidos.`))return;setData(dd=>({...dd,dividendos:[...(dd.dividendos||[]),{id:uid(),ticker:a.ticker,valor:Math.round(total*100)/100,data:a.dataPagamento,tipo:a.tipo||"Dividendo"}],proventosAgendados:(dd.proventosAgendados||[]).filter(x=>x.id!==a.id)}));}
  function delAg(id){setData(dd=>({...dd,proventosAgendados:(dd.proventosAgendados||[]).filter(x=>x.id!==id)}));}

  const isRFForm=form.tipo==="Renda Fixa"||form.tipo==="Tesouro Direto";

  function InvList({invs,emptyMsg}){
    return invs.length===0?<p style={{fontSize:13,color:D.text3,padding:"12px 0"}}>{emptyMsg}</p>:<div style={{display:"flex",flexDirection:"column",gap:8}}>
      {invs.map(inv=>{
        const custo=inv.valorInvestido||inv.valor||0,atual=inv.valorAtual||custo,lucro=inv.lucro!==undefined?inv.lucro:atual-custo,lpct=custo>0?(lucro/custo*100):0;
        const isRFItem=inv.tipo==="Renda Fixa"||inv.tipo==="Tesouro Direto";
        return <div key={inv.id} style={{background:D.bg3,borderRadius:10,padding:"12px 14px",border:`1px solid ${lucro>0?D.green+"33":lucro<0?D.red+"33":D.border}`}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8}}>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                {inv.ticker&&<span onClick={()=>setChartTicker(inv.ticker)} style={{fontSize:14,fontWeight:700,color:D.blue,cursor:"pointer",textDecoration:"underline"}}>{inv.ticker}</span>}
                <span style={{fontSize:12,color:D.text2}}>{inv.descricao||inv.tipo}</span>
                {inv.ultimaAtualizacao&&<span style={{fontSize:9,color:D.text3}}>🕐 {inv.ultimaAtualizacao}</span>}
              </div>
              {isRFItem?<p style={{margin:"2px 0 0",fontSize:11,color:D.text3}}>{inv.rfTipo==="pct"?`${inv.pctIndice||100}% ${inv.indice}`:`${inv.indice}+${inv.taxaRF||0}%`}{inv.vencimento&&` · Venc: ${inv.vencimento}`}</p>
              :<p style={{margin:"2px 0 0",fontSize:11,color:D.text3}}>{inv.quantidade}un · PM:{fmtM(inv.precoMedio||0,currency)}{inv.preco_atual?` · Atual:${fmtM(inv.preco_atual,currency)}`:""}</p>}
            </div>
            <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
              <div style={{textAlign:"right"}}>
                <p style={{margin:0,fontSize:15,fontWeight:700,color:D.text}}>{fmtM(atual,currency)}</p>
                <p style={{margin:0,fontSize:11,color:lucro>=0?D.green:D.red,fontWeight:600}}>{lucro>=0?"+":""}{fmtM(lucro,currency)} ({lpct>=0?"+":""}{lpct.toFixed(1)}%)</p>
              </div>
              <button onClick={()=>buscarDados(inv)} disabled={loadingId===inv.id} style={{border:"none",background:"none",cursor:"pointer",fontSize:15,opacity:loadingId===inv.id?0.4:1,color:D.green,flexShrink:0}}>{loadingId===inv.id?"⏳":"🔄"}</button>
              {!isRFItem&&<button onClick={()=>{setModalAporte(inv.id);setAporteForm({});}} title="Aportar mais (recalcula preço médio)" style={{border:"none",background:"none",cursor:"pointer",fontSize:14,color:D.blue}}>➕</button>}
              <button onClick={()=>{setModalResgate(inv.id);setResgateForm({valor:String(inv.valorAtual||inv.valorInvestido||inv.valor||0),bancoId:inv.bancoId||""});}} title="Resgatar (devolver à conta)" style={{border:"none",background:"none",cursor:"pointer",fontSize:14,color:D.green}}>💵</button>
              <button onClick={()=>{setModal(true);setForm({...inv,editId:inv.id});}} style={{border:"none",background:"none",cursor:"pointer",fontSize:12,color:D.text3}}>✏️</button>
              <button onClick={()=>setData(d=>({...d,investimentos:d.investimentos.filter(x=>x.id!==inv.id),transacoes:inv.aplicacaoTxId?d.transacoes.filter(t=>t.id!==inv.aplicacaoTxId):d.transacoes}))} style={{border:"none",background:"none",cursor:"pointer",fontSize:12,color:D.red}}>🗑</button>
            </div>
          </div>
          {isRFItem&&<div style={{marginTop:6,display:"flex",gap:6}}><Badge color={D.gold}>Taxa: {calcRFAnual(inv).toFixed(2)}% a.a.</Badge></div>}
          {!isRFItem&&inv.dy>0&&<div style={{marginTop:6,display:"flex",gap:6}}><Badge color={D.gold}>DY {inv.dy}%</Badge>{inv.prox_dividendo&&<Badge color={D.green}>Div: {inv.prox_dividendo}</Badge>}</div>}
          {inv.resumo&&<p style={{margin:"6px 0 0",fontSize:11,color:D.text3,borderTop:`1px solid ${D.border}`,paddingTop:6}}>{inv.resumo}</p>}
        </div>;
      })}
    </div>;
  }

  return <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
    {chartTicker&&<ChartModal ticker={chartTicker} currency={currency} market={profileId} onClose={()=>setChartTicker(null)}/>}
    <Card glow style={{background:`linear-gradient(135deg,${D.bg3},${D.card2})`,border:`1px solid ${D.blue}33`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
        <div>
          <p style={{fontSize:10,color:D.text3,textTransform:"uppercase",letterSpacing:"1px",marginBottom:4}}>Total investido · Atualizado em {hoje.toLocaleDateString("pt-BR")}</p>
          <p style={{fontSize:30,fontWeight:800,color:D.text}}>{fmtM(totalInvest,currency)}</p>
          <p style={{fontSize:13,color:totalLucro>=0?D.green:D.red,marginTop:2}}>{totalLucro>=0?"▲":"▼"} {fmtM(Math.abs(totalLucro),currency)} ({rentTotal>=0?"+":""}{rentTotal.toFixed(2)}%)</p>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <Btn sm onClick={()=>{setModal(true);setForm({});}} color={D.blue}>+ Novo ativo</Btn>
          <Btn sm onClick={atualizarTodos} disabled={atualizandoTodos} color={D.green} outline>{atualizandoTodos?"Atualizando...":"🔄 Atualizar todos"}</Btn>
          <Btn sm onClick={()=>{setModalDiv(true);setDivForm({});}} color={D.gold} outline>💰 Dividendo</Btn>
        </div>
      </div>
    </Card>

    {/* Meta de aporte mensal */}
    <Card>
      <p style={{fontSize:13,fontWeight:700,color:D.text,marginBottom:6}}>🎯 Meta de aporte mensal</p>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
        <input type="number" value={aporteInput} onChange={e=>setAporteInput(e.target.value)} placeholder={`Valor (${currency})`} style={{flex:1,minWidth:120}}/>
        <Btn sm color={D.green} onClick={()=>setData(d=>({...d,aporteMensal:parseFloat(aporteInput)||0}))}>Salvar meta</Btn>
      </div>
      {data.aporteMensal>0&&(()=>{
        const invMes=data.investimentos.filter(i=>{const dt=new Date(i.data);return dt.getMonth()===MES_ATUAL&&dt.getFullYear()===ANO_ATUAL;}).reduce((a,b)=>a+(b.valorInvestido||b.valor||0),0);
        const pct=Math.min(100,Math.round(invMes/data.aporteMensal*100));
        const cor=pct>=100?D.green:pct>=50?D.gold:D.red;
        return <div style={{marginTop:8}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
            <span style={{color:D.text3}}>Aportado este mês</span>
            <span style={{color:cor,fontWeight:600}}>{fmtM(invMes,currency)} / {fmtM(data.aporteMensal,currency)}</span>
          </div>
          <div style={{height:8,background:D.bg3,borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:cor,transition:"width .3s"}}/></div>
          <p style={{margin:"4px 0 0",fontSize:11,color:D.text3}}>{pct>=100?"✅ Meta atingida este mês!":`Faltam ${fmtM(Math.max(0,data.aporteMensal-invMes),currency)} para a meta`}</p>
        </div>;
      })()}
    </Card>

    <div style={{display:"flex",gap:4,background:D.card,borderRadius:10,padding:4,border:`1px solid ${D.border}`}}>
      {[["classe","Por Classe"],["rv","Renda Variável"],["rf","Renda Fixa"],["proventos","Proventos"]].map(([v,l])=><button key={v} onClick={()=>setView(v)} style={{flex:1,padding:"7px 8px",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:view===v?700:400,background:view===v?D.blue:"transparent",color:view===v?"#fff":D.text3,whiteSpace:"nowrap"}}>{l}</button>)}
    </div>

    {view==="classe"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
      {[{label:"Renda Variável",icon:"📈",color:D.blue,invs:rendaVariavel,total:totalRV},{label:"Renda Fixa",icon:"🏛️",color:D.gold,invs:rendaFixa,total:totalRF},{label:"Outros",icon:"💼",color:D.purple,invs:outros,total:totalOu}].filter(c=>c.invs.length>0).map(c=><Card key={c.label} style={{border:`1px solid ${c.color}33`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:18}}>{c.icon}</span>
            <div>
              <p style={{margin:0,fontSize:13,fontWeight:700,color:D.text}}>{c.label}</p>
              <p style={{margin:0,fontSize:10,color:D.text3}}>{c.invs.length} ativo{c.invs.length!==1?"s":""} · {totalInvest>0?Math.round(c.total/totalInvest*100):0}%</p>
            </div>
          </div>
          <p style={{fontSize:17,fontWeight:700,color:c.color}}>{fmtM(c.total,currency)}</p>
        </div>
        <MiniBar valor={c.total} total={totalInvest} cor={c.color}/>
      </Card>)}
      <PieChart slices={[{label:"Renda Variável",v:totalRV,color:D.blue},{label:"Renda Fixa",v:totalRF,color:D.gold},{label:"Outros",v:totalOu,color:D.purple}].filter(s=>s.v>0)} currency={currency}/>
    </div>}

    {view==="rv"&&<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div><p style={{margin:0,fontSize:14,fontWeight:700,color:D.text}}>📈 Renda Variável</p><p style={{margin:0,fontSize:11,color:D.text3}}>Total: {fmtM(totalRV,currency)}</p></div>
        <Badge color={D.blue}>{rendaVariavel.length} ativos</Badge>
      </div>
      <InvList invs={rendaVariavel} emptyMsg="Nenhum ativo de renda variável cadastrado."/>
    </div>}

    {view==="rf"&&<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div><p style={{margin:0,fontSize:14,fontWeight:700,color:D.text}}>🏛️ Renda Fixa</p><p style={{margin:0,fontSize:11,color:D.text3}}>Total: {fmtM(totalRF,currency)}</p></div>
        <Badge color={D.gold}>{rendaFixa.length} ativos</Badge>
      </div>
      <InvList invs={rendaFixa} emptyMsg="Nenhum ativo de renda fixa cadastrado."/>
    </div>}

    {view==="proventos"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
      {agProximos.length>0&&<Card style={{border:`1px solid ${D.green}55`,background:D.green+"12"}}>
        <p style={{fontSize:12,fontWeight:700,color:D.green,margin:"0 0 4px"}}>🔔 A receber nos próximos dias</p>
        {agProximos.map(a=>{const dd=(a.dataPagamento||"").split("-").reverse().join("/");return <p key={a.id} style={{margin:"2px 0",fontSize:12,color:D.text2}}>{a.ticker} · <b style={{color:D.green}}>{fmtM(totalAgTotal(a),currency)}</b> em {dd}</p>;})}
      </Card>}

      <Card style={{border:`1px solid ${D.gold}33`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:8}}>
          <div><p style={{margin:0,fontSize:13,fontWeight:700,color:D.text}}>💰 A receber (agendados)</p><p style={{margin:"2px 0 0",fontSize:11,color:D.text3}}>Total futuro: <b style={{color:D.gold}}>{fmtM(totalAReceber,currency)}</b></p></div>
          <Btn sm color={D.gold} onClick={()=>{setModalAg(true);setAgForm({});}}>+ Agendar</Btn>
        </div>
        {agFuturos.length===0&&agVencidos.length===0&&<p style={{fontSize:12,color:D.text3,margin:0}}>Registre o que sua corretora anunciou (ex.: ITUB4, R$ 0,80/ação, paga em 15/08) e acompanhe aqui quanto vai receber e quando.</p>}
        {[...agFuturos,...agVencidos].map(a=>{const venceu=(a.dataPagamento||"")<hojeStr;return <div key={a.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderTop:`1px solid ${D.border}`,gap:8}}>
          <div style={{flex:1,minWidth:0}}>
            <p style={{margin:0,fontSize:13,fontWeight:700,color:D.text}}>{a.ticker} <span style={{fontSize:10,color:D.text3,fontWeight:400}}>{a.tipo}</span></p>
            <p style={{margin:"2px 0 0",fontSize:11,color:venceu?D.gold:D.text3}}>{venceu?"⏰ pagou em ":"paga em "}{(a.dataPagamento||"").split("-").reverse().join("/")}{a.dataCom?` · data-com ${a.dataCom.split("-").reverse().join("/")}`:""}</p>
            <p style={{margin:"2px 0 0",fontSize:11,color:D.text3}}>{a.quantidade} × {fmtM(a.valorAcao,currency)}/ação</p>
          </div>
          <div style={{textAlign:"right"}}>
            <p style={{margin:0,fontSize:14,fontWeight:700,color:D.gold}}>{fmtM(totalAgTotal(a),currency)}</p>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:3}}>
              {venceu&&<button onClick={()=>receberAg(a)} style={{border:"none",background:"none",cursor:"pointer",color:D.green,fontSize:12,fontWeight:700}}>✓ Recebi</button>}
              <button onClick={()=>{setModalAg(true);setAgForm({...a,editId:a.id});}} style={{border:"none",background:"none",cursor:"pointer",color:D.text3,fontSize:12}}>✏️</button>
              <button onClick={()=>delAg(a.id)} style={{border:"none",background:"none",cursor:"pointer",color:D.red,fontSize:12}}>🗑</button>
            </div>
          </div>
        </div>;})}
      </Card>

      {estDY.length>0&&<Card style={{border:`1px solid ${D.blue}33`}}>
        <p style={{margin:0,fontSize:13,fontWeight:700,color:D.text}}>📈 Estimativa de renda passiva</p>
        <p style={{margin:"2px 0 8px",fontSize:11,color:D.text3}}>Baseada no DY histórico × sua posição. É estimativa, não valor garantido nem a data real.</p>
        {estDY.map(x=><div key={x.ticker} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"4px 0",borderTop:`1px solid ${D.border}`}}>
          <span style={{color:D.text2}}>{x.ticker} <span style={{color:D.text3,fontSize:10}}>DY {x.dy}%</span></span>
          <span style={{color:D.text}}>{fmtM(x.anual,currency)}/ano · <span style={{color:D.text3}}>{fmtM(x.anual/12,currency)}/mês</span></span>
        </div>)}
        <div style={{display:"flex",justifyContent:"space-between",marginTop:8,paddingTop:8,borderTop:`1px solid ${D.border2}`,fontSize:12,fontWeight:700}}>
          <span style={{color:D.text2}}>Total estimado</span>
          <span style={{color:D.blue}}>{fmtM(totEstAnual,currency)}/ano · {fmtM(totEstAnual/12,currency)}/mês</span>
        </div>
      </Card>}

      <Card style={{background:`linear-gradient(135deg,${D.bg3},${D.card2})`,border:`1px solid ${D.gold}33`}}>
        <p style={{fontSize:10,color:D.text3,textTransform:"uppercase",letterSpacing:"1px",marginBottom:4}}>Recebido este mês · {hoje.toLocaleDateString("pt-BR")}</p>
        <p style={{fontSize:28,fontWeight:800,color:D.gold}}>{fmtM(totDiv,currency)}</p>
        <p style={{fontSize:11,color:D.text3,marginTop:2}}>{divMes.length} provento{divMes.length!==1?"s":""} recebido{divMes.length!==1?"s":""}</p>
      </Card>
      <p style={{fontSize:13,fontWeight:700,color:D.text}}>Recebidos</p>
      {divMes.length===0&&<p style={{fontSize:13,color:D.text3}}>Nenhum provento registrado este mês. Clique em "💰 Dividendo" para registrar.</p>}
      {divMes.map(d=><Card key={d.id} style={{border:`1px solid ${D.gold}33`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <p style={{margin:0,fontSize:15,fontWeight:700,color:D.text}}>{d.ticker}</p>
            <p style={{margin:"4px 0",fontSize:12,color:D.text3}}>Posição <span style={{color:D.gold,fontWeight:600}}>{fmtM(d.valor,currency)}</span></p>
            <p style={{margin:0,fontSize:12,color:D.text3}}>Ativo <span style={{color:D.text,fontWeight:600,textTransform:"uppercase"}}>{d.tipo}</span></p>
            <p style={{margin:"4px 0 0",fontSize:12,color:D.text3}}>Data de pagamento <span style={{color:D.text}}>{d.data}</span></p>
          </div>
          <button onClick={()=>setData(dd=>({...dd,dividendos:(dd.dividendos||[]).filter(x=>x.id!==d.id)}))} style={{border:"none",background:"none",cursor:"pointer",color:D.red,fontSize:13}}>🗑</button>
        </div>
      </Card>)}
      {proxDiv.length>0&&<><p style={{fontSize:13,fontWeight:700,color:D.text,marginTop:8}}>📅 Próximos dividendos</p>{proxDiv.map(inv=><Card key={inv.id} style={{border:`1px solid ${D.green}33`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <p style={{margin:0,fontSize:14,fontWeight:700,color:D.green}}>{inv.ticker}</p>
            <p style={{margin:"2px 0 0",fontSize:11,color:D.text3}}>Pagamento: {inv.prox_dividendo}{inv.ex_dividendo?` · Ex: ${inv.ex_dividendo}`:""}</p>
          </div>
          {inv.valor_dividendo>0&&<p style={{fontSize:15,fontWeight:700,color:D.gold}}>{fmtM(inv.valor_dividendo,currency)}/ação</p>}
        </div>
      </Card>)}</>}
      {divVencidos.length>0&&<Card style={{border:`1px solid ${D.gold}33`,background:D.gold+"08"}}>
        <p style={{fontSize:12,color:D.gold,margin:0}}>⏰ {divVencidos.length} ativo{divVencidos.length>1?"s":""} com data de dividendo vencida ({divVencidos.map(d=>d.ticker).join(", ")}). Clique em <strong>"🔄 Atualizar todos"</strong> no topo para buscar as datas mais recentes do mercado.</p>
      </Card>}
    </div>}

    {modal&&<Modal title={form.editId?"Editar ativo":"Novo ativo"} onClose={()=>setModal(false)}>
      <label style={{fontSize:12,color:D.text3}}>Tipo<select value={form.tipo||"Ações"} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} style={{marginTop:4}}>{TIPOS_INV.map(t=><option key={t}>{t}</option>)}</select></label>
      {!isRFForm&&<><label style={{fontSize:12,color:D.text3}}>Ticker<input value={form.ticker||""} onChange={e=>setForm(f=>({...f,ticker:e.target.value.toUpperCase()}))} placeholder={isBR?"Ex: PETR4":"Ex: BHP.AX"} style={{marginTop:4}}/></label><label style={{fontSize:12,color:D.text3}}>Descrição<input value={form.descricao||""} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} style={{marginTop:4}}/></label><label style={{fontSize:12,color:D.text3}}>Quantidade<input type="number" value={form.quantidade||""} onChange={e=>setForm(f=>({...f,quantidade:e.target.value}))} style={{marginTop:4}}/></label><label style={{fontSize:12,color:D.text3}}>Preço médio ({currency})<input type="number" value={form.precoMedio||""} onChange={e=>setForm(f=>({...f,precoMedio:e.target.value}))} style={{marginTop:4}}/></label></>}
      {isRFForm&&<><label style={{fontSize:12,color:D.text3}}>Descrição<input value={form.descricao||""} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} style={{marginTop:4}}/></label><label style={{fontSize:12,color:D.text3}}>Valor investido ({currency})<input type="number" value={form.valorInvestido||""} onChange={e=>setForm(f=>({...f,valorInvestido:e.target.value}))} style={{marginTop:4}}/></label><label style={{fontSize:12,color:D.text3}}>Índice<select value={form.indice||"CDI"} onChange={e=>setForm(f=>({...f,indice:e.target.value}))} style={{marginTop:4}}>{INDICES_RF.map(i=><option key={i}>{i}</option>)}</select></label>{(form.indice||"CDI")!=="Prefixado"&&<><label style={{fontSize:12,color:D.text3}}>Tipo<select value={form.rfTipo||"pct"} onChange={e=>setForm(f=>({...f,rfTipo:e.target.value}))} style={{marginTop:4}}><option value="pct">% do índice</option><option value="mais">Índice + %</option></select></label>{(form.rfTipo||"pct")==="pct"?<label style={{fontSize:12,color:D.text3}}>% do índice<input type="number" value={form.pctIndice||""} onChange={e=>setForm(f=>({...f,pctIndice:e.target.value}))} placeholder="Ex: 102" style={{marginTop:4}}/></label>:<label style={{fontSize:12,color:D.text3}}>Taxa adicional %<input type="number" value={form.taxaRF||""} onChange={e=>setForm(f=>({...f,taxaRF:e.target.value}))} placeholder="Ex: 9" style={{marginTop:4}}/></label>}</>}{(form.indice||"CDI")==="Prefixado"&&<label style={{fontSize:12,color:D.text3}}>Taxa prefixada %<input type="number" value={form.taxaRF||""} onChange={e=>setForm(f=>({...f,taxaRF:e.target.value}))} style={{marginTop:4}}/></label>}<label style={{fontSize:12,color:D.text3}}>Vencimento<input type="date" value={form.vencimento||""} onChange={e=>setForm(f=>({...f,vencimento:e.target.value}))} style={{marginTop:4}}/></label></>}
      <label style={{fontSize:12,color:D.text3}}>Data de compra<input type="date" value={form.data||hoje.toISOString().slice(0,10)} onChange={e=>setForm(f=>({...f,data:e.target.value}))} style={{marginTop:4}}/></label>
      {data.bancos.length>0&&<label style={{fontSize:12,color:D.text3}}>Vincular ao banco<select value={form.bancoId||""} onChange={e=>setForm(f=>({...f,bancoId:e.target.value}))} style={{marginTop:4}}><option value="">Nenhum</option>{data.bancos.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}</select></label>}
      {!form.editId&&form.bancoId&&<label style={{fontSize:12,color:D.text2,display:"flex",alignItems:"center",gap:8,marginTop:8,cursor:"pointer"}}><input type="checkbox" checked={form.debitarBanco!==false} onChange={e=>setForm(f=>({...f,debitarBanco:e.target.checked}))} style={{width:"auto"}}/>Debitar este valor da conta do banco (aplicação). Desmarque se o dinheiro já está na corretora.</label>}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn outline color={D.text3} onClick={()=>setModal(false)}>Cancelar</Btn><Btn color={D.blue} onClick={saveInv}>Salvar</Btn></div>
    </Modal>}
    {modalResgate&&(()=>{const inv=data.investimentos.find(x=>x.id===modalResgate);if(!inv)return null;
      return <Modal title="💵 Resgatar investimento" onClose={()=>setModalResgate(null)}>
        <p style={{fontSize:13,color:D.text2,margin:"0 0 4px"}}><b>{inv.ticker||inv.descricao||inv.tipo}</b></p>
        <p style={{fontSize:11,color:D.text3,margin:"0 0 12px",lineHeight:1.5}}>Valor de mercado: {fmtM(inv.valorAtual||inv.valorInvestido||0,currency)} · aplicado: {fmtM(inv.valorInvestido||inv.valor||0,currency)}. Ajuste abaixo para o que <b>realmente caiu na conta</b> (após IR/taxas, se houver).</p>
        <label style={{fontSize:12,color:D.text3}}>Valor que voltou ({currency})<input type="number" value={resgateForm.valor||""} onChange={e=>setResgateForm(f=>({...f,valor:e.target.value}))} style={{marginTop:4}}/></label>
        <label style={{fontSize:12,color:D.text3,display:"block",marginTop:8}}>Creditar no banco<select value={resgateForm.bancoId||""} onChange={e=>setResgateForm(f=>({...f,bancoId:e.target.value}))} style={{marginTop:4}}><option value="">Não creditar (só remover)</option>{data.bancos.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}</select></label>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}><Btn outline color={D.text3} onClick={()=>setModalResgate(null)}>Cancelar</Btn><Btn color={D.green} onClick={()=>{const v=parseFloat(resgateForm.valor)||0;const bid=resgateForm.bancoId;setData(d=>({...d,investimentos:d.investimentos.filter(x=>x.id!==inv.id),transacoes:(bid&&v>0)?[...d.transacoes,{id:uid(),tipo:"receita",descricao:`Resgate: ${inv.ticker||inv.descricao||inv.tipo}`,valor:v,categoria:"Resgate",data:hoje.toISOString().slice(0,10),bancoId:bid}]:d.transacoes}));setModalResgate(null);setResgateForm({});}}>Resgatar</Btn></div>
      </Modal>;
    })()}
    {modalAporte&&(()=>{const inv=data.investimentos.find(x=>x.id===modalAporte);if(!inv)return null;
      const qN=parseFloat(aporteForm.quantidade)||0,pN=parseFloat(aporteForm.preco)||0;
      const qA=inv.quantidade||0,pmA=inv.precoMedio||0;
      const qT=qA+qN,pmNovo=qT>0?((pmA*qA)+(pN*qN))/qT:0;
      return <Modal title={`Aportar em ${inv.ticker||inv.descricao}`} onClose={()=>{setModalAporte(null);setAporteForm({});}}>
        <div style={{background:D.bg3,borderRadius:8,padding:"10px 12px",marginBottom:10}}>
          <p style={{fontSize:11,color:D.text3,margin:0}}>Posição atual</p>
          <p style={{fontSize:13,color:D.text,margin:"2px 0 0"}}>{qA} un · PM {fmtM(pmA,currency)}</p>
        </div>
        {(inv.aportes&&inv.aportes.length>0)&&<div style={{marginBottom:10}}>
          <p style={{fontSize:11,fontWeight:700,color:D.text3,margin:"0 0 6px"}}>📋 Histórico de aportes</p>
          <div style={{maxHeight:120,overflowY:"auto"}}>
            {[...inv.aportes].reverse().map((ap,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:D.text3,padding:"4px 0",borderBottom:`1px solid ${D.border}`}}>
              <span>{ap.data}</span>
              <span style={{color:D.text2}}>{ap.quantidade} un × {fmtM(ap.preco,currency)}</span>
            </div>)}
          </div>
        </div>}
        <label style={{fontSize:12,color:D.text3}}>Quantidade comprada agora<input type="number" autoFocus value={aporteForm.quantidade||""} onChange={e=>setAporteForm(f=>({...f,quantidade:e.target.value}))} placeholder="Ex: 5" style={{marginTop:4}}/></label>
        <label style={{fontSize:12,color:D.text3}}>Preço pago por unidade ({currency})<input type="number" value={aporteForm.preco||""} onChange={e=>setAporteForm(f=>({...f,preco:e.target.value}))} placeholder="Ex: 185.50" style={{marginTop:4}}/></label>
        <label style={{fontSize:12,color:D.text3}}>Data<input type="date" value={aporteForm.data||hoje.toISOString().slice(0,10)} onChange={e=>setAporteForm(f=>({...f,data:e.target.value}))} style={{marginTop:4}}/></label>
        {qN>0&&pN>0&&<div style={{background:D.blue+"15",border:`1px solid ${D.blue}44`,borderRadius:8,padding:"10px 12px",marginTop:10}}>
          <p style={{fontSize:11,color:D.text3,margin:0}}>Depois do aporte</p>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}><span style={{fontSize:12,color:D.text2}}>Quantidade</span><span style={{fontSize:13,fontWeight:600,color:D.text}}>{qA} → {qT} un</span></div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:2}}><span style={{fontSize:12,color:D.text2}}>Preço médio</span><span style={{fontSize:13,fontWeight:700,color:D.blue}}>{fmtM(pmA,currency)} → {fmtM(pmNovo,currency)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:2}}><span style={{fontSize:12,color:D.text2}}>Total investido</span><span style={{fontSize:13,fontWeight:600,color:D.text}}>{fmtM(pmA*qA+pN*qN,currency)}</span></div>
        </div>}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:10}}><Btn outline color={D.text3} onClick={()=>{setModalAporte(null);setAporteForm({});}}>Cancelar</Btn><Btn color={D.blue} onClick={aportar}>Confirmar aporte</Btn></div>
      </Modal>;})()}
    {modalDiv&&<Modal title="Registrar provento" onClose={()=>setModalDiv(false)}>
      <label style={{fontSize:12,color:D.text3}}>Ticker<input value={divForm.ticker||""} onChange={e=>setDivForm(f=>({...f,ticker:e.target.value.toUpperCase()}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Valor recebido ({currency})<input type="number" value={divForm.valor||""} onChange={e=>setDivForm(f=>({...f,valor:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Tipo<select value={divForm.tipo||"Dividendo"} onChange={e=>setDivForm(f=>({...f,tipo:e.target.value}))} style={{marginTop:4}}><option>Dividendo</option><option>JCP</option><option>JUROS SOBRE CAPITAL PROPRIO</option><option>Rendimento FII</option><option>Rendimento ETF</option></select></label>
      <label style={{fontSize:12,color:D.text3}}>Data de pagamento<input type="date" value={divForm.data||hoje.toISOString().slice(0,10)} onChange={e=>setDivForm(f=>({...f,data:e.target.value}))} style={{marginTop:4}}/></label>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn outline color={D.text3} onClick={()=>setModalDiv(false)}>Cancelar</Btn><Btn color={D.gold} onClick={saveDiv}>Salvar</Btn></div>
    </Modal>}
    {modalAg&&<Modal title={agForm.editId?"Editar agendamento":"Agendar provento"} onClose={()=>{setModalAg(false);setAgForm({});}}>
      <p style={{fontSize:11,color:D.text3,marginTop:0,lineHeight:1.5}}>Registre o que a corretora anunciou. Ex.: a XP diz que ITUB4 paga R$ 0,80/ação em 15/08 → preencha abaixo e o app calcula quanto você recebe.</p>
      {data.investimentos.filter(i=>i.ticker).length>0&&<label style={{fontSize:12,color:D.text3}}>Puxar da carteira (opcional)<select value="" onChange={e=>{const inv=data.investimentos.find(i=>i.id===e.target.value);if(inv)setAgForm(f=>({...f,ticker:(inv.ticker||"").toUpperCase(),quantidade:inv.quantidade||f.quantidade}));}} style={{marginTop:4}}><option value="">— escolher ativo —</option>{data.investimentos.filter(i=>i.ticker).map(i=><option key={i.id} value={i.id}>{i.ticker} ({i.quantidade||0} ações)</option>)}</select></label>}
      <label style={{fontSize:12,color:D.text3}}>Ticker<input value={agForm.ticker||""} onChange={e=>setAgForm(f=>({...f,ticker:e.target.value.toUpperCase()}))} placeholder="Ex: ITUB4" style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Quantidade de ações<input type="number" value={agForm.quantidade||""} onChange={e=>setAgForm(f=>({...f,quantidade:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Valor por ação ({currency})<input type="number" step="0.0001" value={agForm.valorAcao||""} onChange={e=>setAgForm(f=>({...f,valorAcao:e.target.value}))} placeholder="Ex: 0.80" style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Tipo<select value={agForm.tipo||"Dividendo"} onChange={e=>setAgForm(f=>({...f,tipo:e.target.value}))} style={{marginTop:4}}><option>Dividendo</option><option>JCP</option><option>Rendimento FII</option><option>Rendimento ETF</option></select></label>
      <label style={{fontSize:12,color:D.text3}}>Data de pagamento<input type="date" value={agForm.dataPagamento||""} onChange={e=>setAgForm(f=>({...f,dataPagamento:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Data-com (opcional — último dia p/ ter direito)<input type="date" value={agForm.dataCom||""} onChange={e=>setAgForm(f=>({...f,dataCom:e.target.value}))} style={{marginTop:4}}/></label>
      {parseFloat(agForm.valorAcao)>0&&parseFloat(agForm.quantidade)>0&&<p style={{fontSize:12,color:D.text2,marginTop:6}}>Total a receber: <b style={{color:D.gold}}>{fmtM((parseFloat(agForm.valorAcao)||0)*(parseFloat(agForm.quantidade)||0),currency)}</b></p>}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn outline color={D.text3} onClick={()=>{setModalAg(false);setAgForm({});}}>Cancelar</Btn><Btn color={D.gold} onClick={saveAg}>Salvar</Btn></div>
    </Modal>}
  </div>;
}

// ── Metas Tab ─────────────────────────────────────────────────────────────────
function MetasTab({data,setData,currency}){
  const [modal,setModal]=useState(false);const [form,setForm]=useState({});
  function saveMeta(){const m={id:form.editId||uid(),nome:form.nome||"Meta",objetivo:parseFloat(form.objetivo)||0,atual:parseFloat(form.atual)||0,prazo:form.prazo||""};setData(d=>({...d,metas:form.editId?d.metas.map(x=>x.id===form.editId?m:x):[...d.metas,m]}));setModal(false);setForm({});}
  return <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
    <Btn onClick={()=>{setModal(true);setForm({});}} style={{alignSelf:"flex-start"}}>+ Nova meta</Btn>
    {data.metas.length===0&&<p style={{fontSize:13,color:D.text3}}>Nenhuma meta criada.</p>}
    {data.metas.map(m=>{
      const p=m.objetivo>0?Math.min(100,Math.round(m.atual/m.objetivo*100)):0;
      const cor=p>=100?D.green:p>=60?D.blue:p>=30?D.gold:D.red;
      const falta=Math.max(0,m.objetivo-m.atual);
      const meses=m.prazo&&falta>0?Math.max(1,Math.ceil((new Date(m.prazo)-new Date())/(1000*60*60*24*30))):null;
      return <Card key={m.id} style={{border:`1px solid ${cor}33`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
          <div><p style={{margin:0,fontSize:15,fontWeight:700,color:D.text}}>🎯 {m.nome}</p>{m.prazo&&<p style={{fontSize:11,color:D.text3,marginTop:2}}>Prazo: {m.prazo}</p>}</div>
          <div style={{display:"flex",gap:4,alignItems:"center"}}>
            <span style={{fontSize:22,fontWeight:800,color:cor}}>{p}%</span>
            <button onClick={()=>{setModal(true);setForm({...m,editId:m.id});}} style={{border:"none",background:"none",cursor:"pointer",fontSize:13,color:D.text3}}>✏️</button>
            <button onClick={()=>setData(d=>({...d,metas:d.metas.filter(x=>x.id!==m.id)}))} style={{border:"none",background:"none",cursor:"pointer",fontSize:13,color:D.red}}>🗑</button>
          </div>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:6,color:D.text2}}><span>{fmtM(m.atual,currency)}</span><span style={{color:D.text3}}>{fmtM(m.objetivo,currency)}</span></div>
        <div style={{background:D.bg3,borderRadius:8,height:10,overflow:"hidden"}}><div style={{width:p+"%",background:`linear-gradient(90deg,${cor},${cor}cc)`,height:10,borderRadius:8,boxShadow:`0 0 10px ${cor}88`}}/></div>
        {meses&&falta>0&&<p style={{fontSize:11,color:D.text3,marginTop:6}}>Faltam {fmtM(falta,currency)} · Sugerido: {fmtM(falta/meses,currency)}/mês</p>}
        {p>=100&&<p style={{fontSize:12,color:D.green,marginTop:6}}>🎉 Meta atingida!</p>}
        <div style={{marginTop:10,display:"flex",gap:8,alignItems:"center"}}><span style={{fontSize:11,color:D.text3}}>Atualizar:</span><input type="number" defaultValue={m.atual} onBlur={e=>setData(d=>({...d,metas:d.metas.map(x=>x.id===m.id?{...x,atual:parseFloat(e.target.value)||0}:x)}))} style={{width:120}}/></div>
      </Card>;
    })}
    {modal&&<Modal title={form.editId?"Editar meta":"Nova meta"} onClose={()=>setModal(false)}>
      <label style={{fontSize:12,color:D.text3}}>Nome<input value={form.nome||""} onChange={e=>setForm(f=>({...f,nome:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Objetivo ({currency})<input type="number" value={form.objetivo||""} onChange={e=>setForm(f=>({...f,objetivo:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Valor atual ({currency})<input type="number" value={form.atual||""} onChange={e=>setForm(f=>({...f,atual:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Prazo<input type="date" value={form.prazo||""} onChange={e=>setForm(f=>({...f,prazo:e.target.value}))} style={{marginTop:4}}/></label>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn outline color={D.text3} onClick={()=>setModal(false)}>Cancelar</Btn><Btn color={D.gold} onClick={saveMeta}>Salvar</Btn></div>
    </Modal>}
  </div>;
}

// ── Splitwise Tab ─────────────────────────────────────────────────────────────
function SplitwiseTab({currency,userEmail}){
  // Multi-grupo: lista de códigos que participo + qual está ativo
  const [grupos,setGrupos]=useState(()=>{try{return JSON.parse(lsGet("sw_grupos")||"[]");}catch{return [];}});
  const [ativo,setAtivo]=useState(()=>lsGet("sw_ativo")||"");
  const [nomeUser,setNomeUser]=useState(()=>lsGet("sw_nome")||"");
  const [swData,setSwData]=useState(null);
  const [loading,setLoading]=useState(false);
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [inputCod,setInputCod]=useState("");
  const [setupNome,setSetupNome]=useState("");
  const [saldosGrupos,setSaldosGrupos]=useState({});
  const [mesSel,setMesSel]=useState(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;}); // "AAAA-MM" recorte do mês (data local)
  const [catView,setCatView]=useState("grupo"); // "grupo" ou nome do membro: pizza por pessoa
  const [catDet,setCatDet]=useState(null); // categoria aberta para ver os lançamentos

  // Ícones por categoria (estilo app oficial)
  const CATS=[
    {nome:"Casa",icone:"🏠",cor:D.gold},
    {nome:"Mercado",icone:"🛒",cor:D.green},
    {nome:"Comida",icone:"🍽️",cor:"#f59e0b"},
    {nome:"Transporte",icone:"🚗",cor:D.blue},
    {nome:"Internet",icone:"📶",cor:"#06b6d4"},
    {nome:"Viagem",icone:"✈️",cor:"#8b5cf6"},
    {nome:"Lazer",icone:"🎉",cor:"#ec4899"},
    {nome:"Saúde",icone:"⚕️",cor:"#ef4444"},
    {nome:"Outros",icone:"🧾",cor:D.text3},
  ];
  const iconeCat=(c)=>{const f=CATS.find(x=>x.nome===c);return f?f.icone:"🧾";};
  const corCat=(c)=>{const f=CATS.find(x=>x.nome===c);return f?f.cor:D.text3;};

  useEffect(()=>{if(ativo)loadSW(ativo);},[ativo]);
  // Calcula o saldo de cada grupo pra mostrar na lista
  useEffect(()=>{if(!ativo&&grupos.length&&nomeUser)calcularSaldosLista();},[grupos,ativo,nomeUser]);

  function normalizaSW(d){
    if(!d||typeof d!=="object")return null;
    return {codigo:d.codigo||ativo,nome:d.nome||d.codigo||ativo,membros:Array.isArray(d.membros)?d.membros.filter(m=>m&&m.nome):[],despesas:Array.isArray(d.despesas)?d.despesas:[],pagamentos:Array.isArray(d.pagamentos)?d.pagamentos:[]};
  }

  async function loadSW(cod){
    setLoading(true);
    try{const local=lsGet(`sw_${cod}`);if(local)setSwData(normalizaSW(local));}catch{}
    try{const remoto=await supa.loadShared(cod);if(remoto){const n=normalizaSW(remoto);setSwData(n);lsSet(`sw_${cod}`,n);}}catch{}
    setLoading(false);
  }

  function saveSW(d){
    const n=normalizaSW(d);
    setSwData(n);
    lsSet(`sw_${ativo}`,n);
    supa.saveShared(ativo,n).catch(()=>{});
  }

  // Saldo de um membro num conjunto de dados
  function saldoDe(data,nome){
    if(!data)return 0;
    let s=0;
    (data.despesas||[]).forEach(d=>{
      if(!d)return;
      if(d.pagoPor===nome)s+=(d.valor||0);
      (d.divisao||[]).forEach(div=>{
        const n=typeof div==="string"?div:div?.nome;
        const q=typeof div==="string"?((d.valor||0)/((d.divisao||[]).length||1)):(div?.valor||0);
        if(n===nome)s-=q;
      });
    });
    (data.pagamentos||[]).forEach(p=>{if(!p)return;if(p.de===nome)s+=(p.valor||0);if(p.para===nome)s-=(p.valor||0);});
    return s;
  }

  async function calcularSaldosLista(){
    const res={};
    for(const cod of grupos){
      try{
        let d=lsGet(`sw_${cod}`);
        const remoto=await supa.loadShared(cod);
        if(remoto){d=remoto;lsSet(`sw_${cod}`,remoto);}
        if(d)res[cod]={saldo:saldoDe(d,nomeUser),nome:d.nome||cod,membros:(d.membros||[]).length};
      }catch{}
    }
    setSaldosGrupos(res);
  }

  function criarGrupo(){
    if(!setupNome.trim()||!form.nomeGrupo?.trim())return;
    const nome=setupNome.trim();
    const cod=(form.nomeGrupo.trim().toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,12)||"GRUPO")+"-"+Math.random().toString(36).slice(2,6).toUpperCase();
    if(!nomeUser){lsSet("sw_nome",nome);setNomeUser(nome);}
    const d={codigo:cod,nome:form.nomeGrupo.trim(),membros:[{nome,email:userEmail||nome}],despesas:[],pagamentos:[]};
    lsSet(`sw_${cod}`,normalizaSW(d));supa.saveShared(cod,normalizaSW(d)).catch(()=>{});
    const ng=[...new Set([...grupos,cod])];setGrupos(ng);lsSet("sw_grupos",JSON.stringify(ng));
    lsSet("sw_ativo",cod);setAtivo(cod);
    setForm({});setSetupNome("");setModal(null);
  }

  async function entrarGrupo(){
    if(!inputCod.trim()||!(nomeUser||setupNome.trim()))return;
    const cod=inputCod.trim().toUpperCase(),nome=(nomeUser||setupNome.trim());
    if(!nomeUser){lsSet("sw_nome",nome);setNomeUser(nome);}
    let grupo=null;
    try{grupo=await supa.loadShared(cod);}catch{}
    if(!grupo){grupo=lsGet(`sw_${cod}`);}
    if(grupo){
      const g=normalizaSW(grupo);
      if(!g.membros.find(m=>m.nome===nome)){g.membros.push({nome,email:userEmail||nome});}
      lsSet(`sw_${cod}`,g);supa.saveShared(cod,g).catch(()=>{});
    }else{
      const d={codigo:cod,nome:cod,membros:[{nome,email:userEmail||nome}],despesas:[],pagamentos:[]};
      lsSet(`sw_${cod}`,d);supa.saveShared(cod,d).catch(()=>{});
    }
    const ng=[...new Set([...grupos,cod])];setGrupos(ng);lsSet("sw_grupos",JSON.stringify(ng));
    lsSet("sw_ativo",cod);setAtivo(cod);
    setInputCod("");setSetupNome("");setModal(null);
  }

  function sairDaLista(cod){
    const ng=grupos.filter(g=>g!==cod);setGrupos(ng);lsSet("sw_grupos",JSON.stringify(ng));
    if(ativo===cod){setAtivo("");lsSet("sw_ativo","");setSwData(null);}
  }

  function voltarLista(){setAtivo("");lsSet("sw_ativo","");setSwData(null);}

  function addMembro(){
    if(!form.novoMembro?.trim())return;
    const nome=form.novoMembro.trim();
    if(swData.membros.find(m=>m.nome===nome)){setForm(f=>({...f,novoMembro:""}));return;}
    saveSW({...swData,membros:[...swData.membros,{nome}]});setForm(f=>({...f,novoMembro:""}));
  }

  function removerMembro(nome){
    if(nome===nomeUser)return;
    saveSW({...swData,membros:swData.membros.filter(m=>m.nome!==nome)});
  }

  function addDespesa(){
    if(!form.descricao||!form.valor||!form.pagoPor)return;
    const membros=swData.membros.map(m=>m.nome);
    const selecionados=(form.divisao&&form.divisao.length)?form.divisao:membros;
    const porPessoa=parseFloat(form.valor)/selecionados.length;
    const d={id:uid(),descricao:form.descricao,valor:parseFloat(form.valor),pagoPor:form.pagoPor,data:form.data||hoje.toISOString().slice(0,10),categoria:form.categoria||"Outros",divisao:selecionados.map(nome=>({nome,valor:porPessoa})),criadoPor:nomeUser,historico:[]};
    saveSW({...swData,despesas:[...swData.despesas,d]});setModal(null);setForm({});
  }

  function editarDespesa(){
    if(!form.descricao||!form.valor||!form.pagoPor||!form.id)return;
    const original=swData.despesas.find(x=>x.id===form.id);
    if(!original)return;
    const membros=swData.membros.map(m=>m.nome);
    const selecionados=(form.divisao&&form.divisao.length)?form.divisao:membros;
    const porPessoa=parseFloat(form.valor)/selecionados.length;
    // Monta o registro do que mudou (antes → depois)
    const mudancas=[];
    if(original.descricao!==form.descricao)mudancas.push(`descrição: "${original.descricao}" → "${form.descricao}"`);
    if((original.valor||0)!==parseFloat(form.valor))mudancas.push(`valor: ${fmtM(original.valor,currency)} → ${fmtM(parseFloat(form.valor),currency)}`);
    if(original.pagoPor!==form.pagoPor)mudancas.push(`pago por: ${original.pagoPor} → ${form.pagoPor}`);
    if(original.categoria!==(form.categoria||"Outros"))mudancas.push(`categoria: ${original.categoria||"Outros"} → ${form.categoria||"Outros"}`);
    const logEntry={quem:nomeUser,quando:new Date().toISOString(),mudancas:mudancas.length?mudancas:["ajustes na divisão"]};
    const atualizada={...original,descricao:form.descricao,valor:parseFloat(form.valor),pagoPor:form.pagoPor,data:form.data||original.data,categoria:form.categoria||"Outros",divisao:selecionados.map(nome=>({nome,valor:porPessoa})),historico:[...(original.historico||[]),logEntry]};
    saveSW({...swData,despesas:swData.despesas.map(x=>x.id===form.id?atualizada:x)});
    setModal(null);setForm({});
  }

  function registrarPagamento(){
    if(!form.de||!form.para||!form.valor)return;
    const p={id:uid(),de:form.de,para:form.para,valor:parseFloat(form.valor),data:form.data||hoje.toISOString().slice(0,10),mesRef:form.mesRef||mesSel,quem:nomeUser};
    saveSW({...swData,pagamentos:[...swData.pagamentos,p]});setModal(null);setForm({});
  }

  // Quita uma dívida do acerto de contas com 1 clique (registra o pagamento exato)
  function quitarDivida(de,para,valor){
    const p={id:uid(),de,para,valor:Math.round(valor*100)/100,data:hoje.toISOString().slice(0,10),mesRef:mesSel,quem:nomeUser,settle:true};
    saveSW({...swData,pagamentos:[...swData.pagamentos,p]});
  }

  function desfazerPagamento(id){
    saveSW({...swData,pagamentos:swData.pagamentos.filter(p=>p.id!==id)});
  }

  const calcSaldos=(src=swData)=>calcSaldosPure(src); // testado em calc.mjs

  const calcDividas=(src=swData)=>calcDividasPure(src); // testado em calc.mjs

  // Gastos do grupo por categoria (para o gráfico)
  function gastosPorCategoria(src=swData){
    const por={};
    (src?.despesas||[]).forEach(d=>{if(!d)return;const c=d.categoria||"Outros";por[c]=(por[c]||0)+(d.valor||0);});
    return Object.entries(por).map(([nome,v])=>({label:`${iconeCat(nome)} ${nome}`,cat:nome,v,color:corCat(nome)})).filter(s=>s.v>0).sort((a,b)=>b.v-a.v);
  }

  // Gastos por categoria de UMA pessoa = a parte que ela consumiu (divisão)
  function gastosPorCategoriaPessoa(src,pessoa){
    if(pessoa==="grupo")return gastosPorCategoria(src);
    const por={};
    (src?.despesas||[]).forEach(d=>{if(!d)return;const c=d.categoria||"Outros";(d.divisao||[]).forEach(div=>{const n=typeof div==="string"?div:div?.nome;const q=typeof div==="string"?((d.valor||0)/((d.divisao||[]).length||1)):(div?.valor||0);if(n===pessoa)por[c]=(por[c]||0)+q;});});
    return Object.entries(por).map(([nome,v])=>({label:`${iconeCat(nome)} ${nome}`,cat:nome,v,color:corCat(nome)})).filter(s=>s.v>0).sort((a,b)=>b.v-a.v);
  }

  // Totais: quanto cada pessoa pagou e quanto consumiu
  const totaisPorPessoa=(src=swData)=>totaisPorPessoaPure(src); // testado em calc.mjs

  // ───── TELA: LISTA DE GRUPOS (nenhum grupo aberto) ─────
  if(!ativo){
    return <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
      <Card style={{border:`1px solid ${D.green}33`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <p style={{fontSize:16,fontWeight:700,color:D.text,margin:0}}>💸 Splitwise</p>
            <p style={{fontSize:12,color:D.text3,margin:"4px 0 0"}}>Seus grupos de despesas compartilhadas</p>
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn onClick={()=>{setForm({});setModal("novoGrupo");}} color={D.green} sm>+ Novo grupo</Btn>
            <Btn onClick={()=>{setForm({});setModal("entrarGrupo");}} color={D.blue} outline sm>Entrar com código</Btn>
          </div>
        </div>
      </Card>
      {grupos.length===0&&<Card><p style={{fontSize:13,color:D.text3,textAlign:"center",padding:"20px 0"}}>Nenhum grupo ainda.<br/>Crie um grupo ou entre com um código.</p></Card>}
      {grupos.map(cod=>{
        const info=saldosGrupos[cod]||{saldo:0,nome:cod,membros:0};
        const s=info.saldo;
        return <Card key={cod} style={{cursor:"pointer",transition:"border .15s"}} >
          <div onClick={()=>{lsSet("sw_ativo",cod);setAtivo(cod);}} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:44,height:44,borderRadius:12,background:D.bg3,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>👥</div>
              <div>
                <p style={{fontSize:15,fontWeight:700,color:D.text,margin:0}}>{info.nome}</p>
                <p style={{fontSize:11,color:D.text3,margin:"2px 0 0"}}>{info.membros} {info.membros===1?"membro":"membros"} · {cod}</p>
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              {Math.abs(s)<0.01
                ?<p style={{fontSize:13,color:D.text3,margin:0,fontWeight:600}}>quitado ✓</p>
                :<><p style={{fontSize:10,color:D.text3,margin:0}}>{s>0?"te devem":"você deve"}</p>
                   <p style={{fontSize:17,fontWeight:700,color:s>0?D.green:"#f59e0b",margin:0}}>{fmtM(Math.abs(s),currency)}</p></>}
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:8}}>
            <button onClick={()=>sairDaLista(cod)} style={{border:"none",background:"none",cursor:"pointer",color:D.text3,fontSize:11}}>remover da lista</button>
          </div>
        </Card>;
      })}
      {modal==="novoGrupo"&&<Modal title="Criar novo grupo" onClose={()=>setModal(null)}>
        {!nomeUser&&<label style={{fontSize:12,color:D.text3}}>Seu nome<input value={setupNome} onChange={e=>setSetupNome(e.target.value)} placeholder="Ex: Leonardo" style={{marginTop:4}}/></label>}
        <label style={{fontSize:12,color:D.text3}}>Nome do grupo<input value={form.nomeGrupo||""} onChange={e=>setForm(f=>({...f,nomeGrupo:e.target.value}))} placeholder="Ex: Crazy Family" style={{marginTop:4}}/></label>
        <p style={{fontSize:11,color:D.text3,marginTop:6}}>Um código único será gerado para compartilhar com o grupo.</p>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn outline color={D.text3} onClick={()=>setModal(null)}>Cancelar</Btn><Btn color={D.green} onClick={criarGrupo}>Criar</Btn></div>
      </Modal>}
      {modal==="entrarGrupo"&&<Modal title="Entrar em grupo" onClose={()=>setModal(null)}>
        {!nomeUser&&<label style={{fontSize:12,color:D.text3}}>Seu nome<input value={setupNome} onChange={e=>setSetupNome(e.target.value)} placeholder="Ex: Leonardo" style={{marginTop:4}}/></label>}
        <label style={{fontSize:12,color:D.text3}}>Código do grupo<input value={inputCod} onChange={e=>setInputCod(e.target.value.toUpperCase())} placeholder="Ex: CRAZYFAMILY-X7K2" style={{marginTop:4}}/></label>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn outline color={D.text3} onClick={()=>setModal(null)}>Cancelar</Btn><Btn color={D.blue} onClick={entrarGrupo}>Entrar</Btn></div>
      </Modal>}
    </div>;
  }

  // ───── TELA: DENTRO DE UM GRUPO ─────
  if(loading&&!swData)return <div><button onClick={voltarLista} style={{border:"none",background:"none",cursor:"pointer",color:D.green,fontSize:13,marginBottom:8}}>← Meus grupos</button><p style={{color:D.text3,fontSize:13}}>Carregando...</p></div>;
  if(!swData)return <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}><Card><p style={{fontSize:13,color:D.text3}}>Não foi possível carregar. <button onClick={()=>loadSW(ativo)} style={{color:D.green,background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>Tentar de novo</button> ou <button onClick={voltarLista} style={{color:D.blue,background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>voltar</button>.</p></Card></div>;

  const ehPagDoMes=x=>((x?.mesRef||(x?.data||"").slice(0,7))===mesSel);
  const dadosMes={...swData,despesas:(swData.despesas||[]).filter(d=>(d?.data||"").slice(0,7)===mesSel),pagamentos:(swData.pagamentos||[]).filter(ehPagDoMes)};
  const saldos=calcSaldos(dadosMes);const dividas=calcDividas(dadosMes);const meuSaldo=saldos[nomeUser]||0;
  const meuSaldoGeral=calcSaldos()[nomeUser]||0;
  const [ay,am]=mesSel.split("-");const labelMes=`${MESES[(+am)-1]} ${ay}`;
  const passoMes=delta=>{let y=+ay,m=(+am)-1+delta;y+=Math.floor(m/12);m=((m%12)+12)%12;setMesSel(`${y}-${String(m+1).padStart(2,"0")}`);};
  const temDespesasMes=dadosMes.despesas.length>0;

  return <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
    <button onClick={voltarLista} style={{border:"none",background:"none",cursor:"pointer",color:D.green,fontSize:13,textAlign:"left",padding:0}}>← Meus grupos</button>
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16}}>
      <button onClick={()=>passoMes(-1)} style={{border:`1px solid ${D.border}`,background:D.bg3,color:D.text,cursor:"pointer",borderRadius:8,padding:"4px 12px",fontSize:14}}>◀</button>
      <span style={{fontSize:15,fontWeight:700,color:D.text,minWidth:120,textAlign:"center"}}>{labelMes}</span>
      <button onClick={()=>passoMes(1)} style={{border:`1px solid ${D.border}`,background:D.bg3,color:D.text,cursor:"pointer",borderRadius:8,padding:"4px 12px",fontSize:14}}>▶</button>
    </div>
    <Card style={{border:`1px solid ${D.green}33`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
        <div>
          <p style={{fontSize:16,fontWeight:700,color:D.text,margin:0}}>👥 {swData.nome}</p>
          <p style={{fontSize:11,color:D.text3,margin:"2px 0 0"}}>{swData.membros.length} membro{swData.membros.length!==1?"s":""} · código {swData.codigo}</p>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:8,alignItems:"center"}}>
            {swData.membros.map(m=><Badge key={m.nome} color={m.nome===nomeUser?D.green:D.text3}>{m.nome}</Badge>)}
            <button onClick={()=>{setForm({});setModal("membros");}} style={{border:`1px dashed ${D.text3}66`,background:"none",cursor:"pointer",color:D.text3,fontSize:10,borderRadius:20,padding:"2px 8px"}}>+ membro</button>
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <p style={{fontSize:11,color:D.text3,margin:0}}>Seu saldo em {MESES[(+am)-1]}</p>
          {Math.abs(meuSaldo)<0.01
            ?<p style={{fontSize:20,fontWeight:700,color:D.text3,margin:0}}>quitado ✓</p>
            :<><p style={{fontSize:22,fontWeight:700,color:meuSaldo>0?D.green:"#f59e0b",margin:0}}>{fmtM(Math.abs(meuSaldo),currency)}</p>
               <p style={{fontSize:10,color:meuSaldo>0?D.green:"#f59e0b",margin:0}}>{meuSaldo>0?"te devem neste mês":"você deve neste mês"}</p></>}
          {Math.abs(meuSaldoGeral)>=0.01&&<p style={{fontSize:10,color:D.text3,margin:"4px 0 0"}}>geral (todos os meses): {fmtM(Math.abs(meuSaldoGeral),currency)} {meuSaldoGeral>0?"a receber":"a pagar"}</p>}
        </div>
      </div>
    </Card>

    {dividas.length>0?<Card>
      <p style={{fontSize:13,fontWeight:700,color:D.text,marginBottom:10}}>Acerto de {labelMes}</p>
      {dividas.map((d,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",background:D.bg3,borderRadius:10,marginBottom:6,gap:8,flexWrap:"wrap"}}>
        <span style={{fontSize:13,color:D.text,flex:1,minWidth:140}}><span style={{color:"#f59e0b",fontWeight:600}}>{d.de===nomeUser?"Você":d.de}</span> deve a <span style={{color:D.green,fontWeight:600}}>{d.para===nomeUser?"você":d.para}</span></span>
        <span style={{fontSize:14,fontWeight:700,color:D.text}}>{fmtM(d.valor,currency)}</span>
        <Btn onClick={()=>quitarDivida(d.de,d.para,d.valor)} color={D.green} sm>Quitar</Btn>
      </div>)}
    </Card>:temDespesasMes?<Card><p style={{fontSize:13,fontWeight:700,color:D.green,margin:0}}>✓ Tudo quitado em {labelMes}</p></Card>:null}

    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      <Btn onClick={()=>{setModal("despesa");setForm({pagoPor:nomeUser,divisao:swData.membros.map(m=>m.nome),categoria:"Outros"});}} color={D.green}>+ Nova despesa</Btn>
      <Btn onClick={()=>{setModal("pagamento");setForm({de:nomeUser});}} color={D.blue} outline>✓ Pagamento</Btn>
      <Btn onClick={()=>loadSW(ativo)} color={D.purple} outline sm>🔄 Atualizar</Btn>
    </div>

    {dadosMes.despesas.length>0&&(()=>{const cats=gastosPorCategoriaPessoa(dadosMes,catView);const totalGrupo=cats.reduce((a,b)=>a+b.v,0);const opcoes=["grupo",...dadosMes.membros.map(m=>m.nome)];return <Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:6}}>
        <p style={{fontSize:13,fontWeight:700,color:D.text,margin:0}}>Gastos de {labelMes} por categoria</p>
        <span style={{fontSize:12,color:D.text3}}>{catView==="grupo"?"total":catView===nomeUser?"sua parte":"parte"} {fmtM(totalGrupo,currency)}</span>
      </div>
      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:10}}>{opcoes.map(o=><button key={o} onClick={()=>setCatView(o)} style={{padding:"3px 10px",borderRadius:16,fontSize:11,cursor:"pointer",border:catView===o?`1px solid ${D.green}`:`1px solid ${D.border}`,background:catView===o?D.green+"22":"transparent",color:catView===o?D.green:D.text3}}>{o==="grupo"?"Grupo":o===nomeUser?"Você":o}</button>)}</div>
      {cats.length===0?<p style={{fontSize:12,color:D.text3}}>Sem consumo nesta visão neste mês.</p>:<PieChart slices={cats} currency={currency} onSlice={p=>setCatDet(prev=>prev===p.cat?null:p.cat)}/>}
      {catDet&&(()=>{const itens=dadosMes.despesas.filter(d=>(d.categoria||"Outros")===catDet).sort((a,b)=>(b.data||"").localeCompare(a.data||""));const totCat=itens.reduce((a,d)=>a+(d.valor||0),0);return <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${D.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <span style={{fontSize:12,fontWeight:700,color:D.text}}>{iconeCat(catDet)} {catDet} · {itens.length} lançamento{itens.length!==1?"s":""}</span>
          <button onClick={()=>setCatDet(null)} style={{border:"none",background:"none",cursor:"pointer",color:D.text3,fontSize:14}}>✕</button>
        </div>
        {itens.length===0?<p style={{fontSize:12,color:D.text3}}>Nenhum lançamento nesta categoria neste mês.</p>:itens.map(d=><div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${D.border}`,gap:8}}>
          <div style={{flex:1,minWidth:0}}>
            <p style={{margin:0,fontSize:12,color:D.text}}>{d.descricao||"(sem descrição)"}</p>
            <p style={{margin:"1px 0 0",fontSize:10,color:D.text3}}>{d.data}{d.pagoPor?` · ${d.pagoPor===nomeUser?"você":d.pagoPor} pagou`:""}</p>
          </div>
          <span style={{fontSize:13,fontWeight:700,color:D.text}}>{fmtM(d.valor||0,currency)}</span>
        </div>)}
        <div style={{display:"flex",justifyContent:"space-between",marginTop:6,fontSize:11,color:D.text3}}><span>Total {catDet} no grupo</span><span style={{fontWeight:700,color:D.text2}}>{fmtM(totCat,currency)}</span></div>
      </div>;})()}
    </Card>;})()}

    {dadosMes.despesas.length>0&&(()=>{const tot=totaisPorPessoa(dadosMes);const ent=Object.entries(tot);return <Card>
      <p style={{fontSize:13,fontWeight:700,color:D.text,marginBottom:10}}>Totais por pessoa · {labelMes}</p>
      <div style={{display:"flex",fontSize:10,color:D.text3,padding:"0 0 6px",borderBottom:`1px solid ${D.border}`}}>
        <span style={{flex:1}}>Pessoa</span><span style={{width:90,textAlign:"right"}}>Pagou</span><span style={{width:90,textAlign:"right"}}>Consumiu</span>
      </div>
      {ent.map(([nome,v])=><div key={nome} style={{display:"flex",fontSize:13,padding:"8px 0",borderBottom:`1px solid ${D.border}`,alignItems:"center"}}>
        <span style={{flex:1,color:nome===nomeUser?D.green:D.text,fontWeight:nome===nomeUser?600:400}}>{nome}{nome===nomeUser?" (você)":""}</span>
        <span style={{width:90,textAlign:"right",color:D.text2}}>{fmtM(v.pagou,currency)}</span>
        <span style={{width:90,textAlign:"right",color:D.text3}}>{fmtM(v.consumiu,currency)}</span>
      </div>)}
    </Card>;})()}

    {dadosMes.pagamentos.length>0&&<Card>
      <p style={{fontSize:13,fontWeight:700,color:D.text,marginBottom:10}}>Pagamentos de {labelMes}</p>
      {[...dadosMes.pagamentos].reverse().map(p=><div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${D.border}`,gap:8}}>
        <div style={{flex:1,minWidth:0}}>
          <p style={{margin:0,fontSize:13,color:D.text}}><span style={{color:"#f59e0b",fontWeight:600}}>{p.de===nomeUser?"Você":p.de}</span> pagou <span style={{color:D.green,fontWeight:600}}>{p.para===nomeUser?"você":p.para}</span>{p.settle?<span style={{fontSize:10,color:D.green,marginLeft:6}}>✓ quitação</span>:null}</p>
          <p style={{margin:"2px 0 0",fontSize:10,color:D.text3}}>{p.data}{p.quem?` · registrado por ${p.quem}`:""}</p>
        </div>
        <span style={{fontSize:14,fontWeight:700,color:D.text}}>{fmtM(p.valor,currency)}</span>
        <button onClick={()=>desfazerPagamento(p.id)} style={{border:"none",background:"none",cursor:"pointer",color:D.text3,fontSize:12}}>🗑</button>
      </div>)}
    </Card>}

    <Card>
      <p style={{fontSize:13,fontWeight:700,color:D.text,marginBottom:10}}>Despesas de {labelMes}</p>
      {dadosMes.despesas.length===0&&<p style={{fontSize:13,color:D.text3}}>Nenhuma despesa em {labelMes}. Use ◀ ▶ para trocar de mês ou adicione uma nova.</p>}
      {[...dadosMes.despesas].reverse().slice(0,30).map(d=>{
        const minhaParte=(d.divisao||[]).find(x=>(typeof x==="string"?x:x?.nome)===nomeUser);
        const meuValor=minhaParte?(typeof minhaParte==="string"?(d.valor/d.divisao.length):minhaParte.valor):0;
        const euPaguei=d.pagoPor===nomeUser;
        const lent=euPaguei?(d.valor-meuValor):0;
        const borrowed=!euPaguei?meuValor:0;
        return <div key={d.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${D.border}`}}>
          <div style={{width:40,height:40,borderRadius:10,background:corCat(d.categoria)+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{iconeCat(d.categoria)}</div>
          <div style={{flex:1,minWidth:0}}>
            <p style={{margin:0,fontSize:14,fontWeight:600,color:D.text}}>{d.descricao}{(d.historico&&d.historico.length>0)&&<span title="editada" style={{fontSize:10,color:D.text3,marginLeft:6,fontWeight:400}}>✎ editada</span>}</p>
            <p style={{margin:"2px 0 0",fontSize:11,color:D.text3}}>{d.pagoPor===nomeUser?"Você":d.pagoPor} pagou {fmtM(d.valor,currency)}</p>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            {lent>0.01&&<><p style={{margin:0,fontSize:10,color:D.green}}>você emprestou</p><p style={{margin:0,fontSize:14,fontWeight:700,color:D.green}}>{fmtM(lent,currency)}</p></>}
            {borrowed>0.01&&<><p style={{margin:0,fontSize:10,color:"#f59e0b"}}>você pegou</p><p style={{margin:0,fontSize:14,fontWeight:700,color:"#f59e0b"}}>{fmtM(borrowed,currency)}</p></>}
            {lent<=0.01&&borrowed<=0.01&&<p style={{margin:0,fontSize:12,color:D.text3}}>—</p>}
          </div>
          <div style={{display:"flex",gap:6,flexShrink:0}}>
            <button onClick={()=>{setForm({id:d.id,descricao:d.descricao,valor:String(d.valor),pagoPor:d.pagoPor,data:d.data,categoria:d.categoria||"Outros",divisao:(d.divisao||[]).map(x=>typeof x==="string"?x:x.nome)});setModal("editar");}} style={{border:"none",background:"none",cursor:"pointer",color:D.text3,fontSize:13}}>✏️</button>
            <button onClick={()=>saveSW({...swData,despesas:swData.despesas.filter(x=>x.id!==d.id)})} style={{border:"none",background:"none",cursor:"pointer",color:D.text3,fontSize:13}}>🗑</button>
          </div>
        </div>;
      })}
    </Card>

    {modal==="membros"&&<Modal title="Membros do grupo" onClose={()=>setModal(null)}>
      <p style={{fontSize:11,color:D.text3,marginBottom:8}}>Adicione as pessoas que dividem as despesas (mesmo que não usem o app).</p>
      {swData.membros.map(m=><div key={m.nome} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${D.border}`}}>
        <span style={{fontSize:13,color:m.nome===nomeUser?D.green:D.text}}>{m.nome}{m.nome===nomeUser?" (você)":""}</span>
        {m.nome!==nomeUser&&<button onClick={()=>removerMembro(m.nome)} style={{border:"none",background:"none",cursor:"pointer",color:D.red,fontSize:11}}>remover</button>}
      </div>)}
      <label style={{fontSize:12,color:D.text3,marginTop:10,display:"block"}}>Adicionar pessoa<input value={form.novoMembro||""} onChange={e=>setForm(f=>({...f,novoMembro:e.target.value}))} placeholder="Ex: Tamysa" style={{marginTop:4}} onKeyDown={e=>{if(e.key==="Enter")addMembro();}}/></label>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn color={D.green} onClick={addMembro}>+ Adicionar</Btn><Btn outline color={D.text3} onClick={()=>setModal(null)}>Fechar</Btn></div>
    </Modal>}

    {modal==="despesa"&&<Modal title="Nova despesa" onClose={()=>setModal(null)}>
      <label style={{fontSize:12,color:D.text3}}>Descrição<input value={form.descricao||""} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Valor ({currency})<input type="number" value={form.valor||""} onChange={e=>setForm(f=>({...f,valor:e.target.value}))} style={{marginTop:4}}/></label>
      <div style={{marginTop:4}}>
        <p style={{fontSize:12,color:D.text3,marginBottom:6}}>Categoria</p>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{CATS.map(c=><button key={c.nome} onClick={()=>setForm(f=>({...f,categoria:c.nome}))} style={{border:`1px solid ${(form.categoria||"Outros")===c.nome?c.cor:D.border}`,background:(form.categoria||"Outros")===c.nome?c.cor+"22":"none",borderRadius:8,padding:"4px 8px",cursor:"pointer",fontSize:12,color:D.text2}}>{c.icone} {c.nome}</button>)}</div>
      </div>
      <label style={{fontSize:12,color:D.text3,marginTop:4,display:"block"}}>Pago por<select value={form.pagoPor||nomeUser} onChange={e=>setForm(f=>({...f,pagoPor:e.target.value}))} style={{marginTop:4}}>{swData.membros.map(m=><option key={m.nome}>{m.nome}</option>)}</select></label>
      <label style={{fontSize:12,color:D.text3}}>Data<input type="date" value={form.data||hoje.toISOString().slice(0,10)} onChange={e=>setForm(f=>({...f,data:e.target.value}))} style={{marginTop:4}}/></label>
      <div style={{marginTop:4}}>
        <p style={{fontSize:12,color:D.text3,marginBottom:6}}>Dividir entre:</p>
        {swData.membros.map(m=><label key={m.nome} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:D.text2,marginBottom:6,cursor:"pointer"}}>
          <input type="checkbox" checked={(form.divisao||swData.membros.map(x=>x.nome)).includes(m.nome)} onChange={e=>{const curr=form.divisao||swData.membros.map(x=>x.nome);setForm(f=>({...f,divisao:e.target.checked?[...curr,m.nome]:curr.filter(n=>n!==m.nome)}));}} style={{width:"auto",marginTop:0}}/>
          {m.nome}{m.nome===nomeUser?" (você)":""}
        </label>)}
        {form.valor&&(form.divisao||swData.membros.map(m=>m.nome)).length>0&&<p style={{fontSize:11,color:D.gold}}>= {fmtM(parseFloat(form.valor)/((form.divisao||swData.membros.map(m=>m.nome)).length),currency)}/pessoa</p>}
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn outline color={D.text3} onClick={()=>setModal(null)}>Cancelar</Btn><Btn color={D.green} onClick={addDespesa}>Adicionar</Btn></div>
    </Modal>}

    {modal==="editar"&&(()=>{const orig=swData.despesas.find(x=>x.id===form.id);const hist=orig?.historico||[];return <Modal title="Editar despesa" onClose={()=>setModal(null)}>
      <label style={{fontSize:12,color:D.text3}}>Descrição<input value={form.descricao||""} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Valor ({currency})<input type="number" value={form.valor||""} onChange={e=>setForm(f=>({...f,valor:e.target.value}))} style={{marginTop:4}}/></label>
      <div style={{marginTop:4}}>
        <p style={{fontSize:12,color:D.text3,marginBottom:6}}>Categoria</p>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{CATS.map(c=><button key={c.nome} onClick={()=>setForm(f=>({...f,categoria:c.nome}))} style={{border:`1px solid ${(form.categoria||"Outros")===c.nome?c.cor:D.border}`,background:(form.categoria||"Outros")===c.nome?c.cor+"22":"none",borderRadius:8,padding:"4px 8px",cursor:"pointer",fontSize:12,color:D.text2}}>{c.icone} {c.nome}</button>)}</div>
      </div>
      <label style={{fontSize:12,color:D.text3,marginTop:4,display:"block"}}>Pago por<select value={form.pagoPor||nomeUser} onChange={e=>setForm(f=>({...f,pagoPor:e.target.value}))} style={{marginTop:4}}>{swData.membros.map(m=><option key={m.nome}>{m.nome}</option>)}</select></label>
      <label style={{fontSize:12,color:D.text3}}>Data<input type="date" value={form.data||hoje.toISOString().slice(0,10)} onChange={e=>setForm(f=>({...f,data:e.target.value}))} style={{marginTop:4}}/></label>
      <div style={{marginTop:4}}>
        <p style={{fontSize:12,color:D.text3,marginBottom:6}}>Dividir entre:</p>
        {swData.membros.map(m=><label key={m.nome} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:D.text2,marginBottom:6,cursor:"pointer"}}>
          <input type="checkbox" checked={(form.divisao||[]).includes(m.nome)} onChange={e=>{const curr=form.divisao||[];setForm(f=>({...f,divisao:e.target.checked?[...curr,m.nome]:curr.filter(n=>n!==m.nome)}));}} style={{width:"auto",marginTop:0}}/>
          {m.nome}{m.nome===nomeUser?" (você)":""}
        </label>)}
      </div>
      {hist.length>0&&<div style={{marginTop:8,padding:"8px 10px",background:D.bg3,borderRadius:8}}>
        <p style={{fontSize:11,fontWeight:700,color:D.text3,margin:"0 0 6px"}}>📝 Histórico de edições</p>
        {[...hist].reverse().map((h,i)=><div key={i} style={{fontSize:10,color:D.text3,marginBottom:6,borderLeft:`2px solid ${D.border}`,paddingLeft:8}}>
          <span style={{color:D.text2,fontWeight:600}}>{h.quem}</span> · {new Date(h.quando).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}
          {(h.mudancas||[]).map((m,j)=><div key={j} style={{marginTop:2}}>• {m}</div>)}
        </div>)}
      </div>}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}><Btn outline color={D.text3} onClick={()=>setModal(null)}>Cancelar</Btn><Btn color={D.green} onClick={editarDespesa}>Salvar alterações</Btn></div>
    </Modal>;})()}

    {modal==="pagamento"&&<Modal title="Registrar pagamento" onClose={()=>setModal(null)}>
      <label style={{fontSize:12,color:D.text3}}>Quem pagou<select value={form.de||nomeUser} onChange={e=>setForm(f=>({...f,de:e.target.value}))} style={{marginTop:4}}>{swData.membros.map(m=><option key={m.nome}>{m.nome}</option>)}</select></label>
      <label style={{fontSize:12,color:D.text3}}>Para quem<select value={form.para||""} onChange={e=>setForm(f=>({...f,para:e.target.value}))} style={{marginTop:4}}><option value="">Selecione...</option>{swData.membros.filter(m=>m.nome!==form.de).map(m=><option key={m.nome}>{m.nome}</option>)}</select></label>
      <label style={{fontSize:12,color:D.text3}}>Valor ({currency})<input type="number" value={form.valor||""} onChange={e=>setForm(f=>({...f,valor:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Data<input type="date" value={form.data||hoje.toISOString().slice(0,10)} onChange={e=>setForm(f=>({...f,data:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Referente ao mês<input type="month" value={form.mesRef||mesSel} onChange={e=>setForm(f=>({...f,mesRef:e.target.value}))} style={{marginTop:4}}/></label>
      <p style={{fontSize:10,color:D.text3,margin:"4px 0 0",lineHeight:1.4}}>O mês que este pagamento quita — ex: a Carol pagou em julho o fechamento de junho → escolha junho.</p>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn outline color={D.text3} onClick={()=>setModal(null)}>Cancelar</Btn><Btn color={D.blue} onClick={registrarPagamento}>Registrar</Btn></div>
    </Modal>}
  </div>;
}


// ── Análise Tab ───────────────────────────────────────────────────────────────
function AnaliseTab({data,setData,investimentos,profileId,market,currency}){
  // Watchlist agora vem do Supabase (data.watchlist), sincroniza entre dispositivos
  const watchlist=data.watchlist||[];
  const setWatchlist=(updater)=>{
    setData(d=>{
      const atual=d.watchlist||[];
      const nova=typeof updater==="function"?updater(atual):updater;
      return{...d,watchlist:nova};
    });
  };
  const [wInput,setWInput]=useState("");const [wCat,setWCat]=useState("");const [wFiltro,setWFiltro]=useState("Todas");const [wLoading,setWLoading]=useState(false);
  const [wlUpd,setWlUpd]=useState(null);
  const [chartTicker,setChartTicker]=useState(null);
  const [news,setNews]=useState({});const [newsLoading,setNewsLoading]=useState(false);
  const [compInput,setCompInput]=useState("");const [compList,setCompList]=useState([]);const [compLoading,setCompLoading]=useState(false);const [compData,setCompData]=useState([]);
  const [fundTicker,setFundTicker]=useState("");const [fundInput,setFundInput]=useState("");const [fundSymbol,setFundSymbol]=useState("BMFBOVESPA:PETR4");
  const [screenerSearch,setScreenerSearch]=useState("");
  const [dyAlvo,setDyAlvo]=useState(()=>parseFloat(lsGet("dy_alvo"))||6);
  const [indiceData,setIndiceData]=useState(null);
  const [indiceLoading,setIndiceLoading]=useState(false);
  const [alertaEdit,setAlertaEdit]=useState(null);
  const [alertaPreco,setAlertaPreco]=useState("");
  const [alertaTipo,setAlertaTipo]=useState("acima");
  const [calcForm,setCalcForm]=useState({pc:"",pa:"",qt:"",tipo:"acao",indice:"CDI",taxa:"",meses:""});const [calcRes,setCalcRes]=useState(null);
  const [simForm,setSimForm]=useState({ini:"",ap:"",tipo:"fixo",taxa:"",indice:"CDI",pctInd:"100",meses:""});const [simRes,setSimRes]=useState(null);
  const [alocRes,setAlocRes]=useState(null);const [alocLoading,setAlocLoading]=useState(false);
  const [notaRisco,setNotaRisco]=useState(null);const [riscoLoading,setRiscoLoading]=useState(false);
  const [sugestoes,setSugestoes]=useState(null);const [sugestLoading,setSugestLoading]=useState(false);
  const [erro,setErro]=useState("");
  const isBR=profileId==="br";

  // ── NOVOS ESTADOS ──────────────────────────────────────────────────────────
  // Chat com analista IA
  const [chatMsgs,setChatMsgs]=useState([{role:"assistant",content:`Olá! Sou seu analista financeiro IA. Posso responder perguntas sobre ações, FIIs, ETFs, análise fundamentalista, comparativos e estratégias de investimento no mercado ${nomePais(profileId)}. Como posso ajudar?`}]);
  const [chatInput,setChatInput]=useState("");const [chatLoading,setChatLoading]=useState(false);
  const chatRef=useRef(null);

  // Extended Thinking para sugestões
  const [thinkingMode,setThinkingMode]=useState(false);
  const [thinkingLog,setThinkingLog]=useState("");const [showThinking,setShowThinking]=useState(false);

  // Análise de notícias + impacto no preço
  const [newsImpact,setNewsImpact]=useState({});const [newsImpactLoading,setNewsImpactLoading]=useState(false);

  // Análise de carteira pessoal vs sugestões
  const [carteirAnalise,setCarteiraAnalise]=useState(null);const [carteiraLoading,setCarteiraLoading]=useState(false);

  // Relatório detalhado por ação
  const [relatorio,setRelatorio]=useState(null);const [relatorioTicker,setRelatorioTicker]=useState("");const [relatorioLoading,setRelatorioLoading]=useState(false);

  // Migração: se havia watchlist no localStorage antigo, move pro Supabase uma vez
  useEffect(()=>{
    const old=lsGet(`watchlist_${profileId}`);
    if(old&&old.length&&(!data.watchlist||data.watchlist.length===0)){
      setWatchlist(old);
      lsSet(`watchlist_${profileId}`,[]); // limpa o antigo após migrar
    }
  },[profileId]);

  // Watchlist persiste automaticamente via Supabase (data.watchlist).
  // Atualiza preços periodicamente, lendo o estado mais recente via ref.
  const wlRef=useRef(watchlist);
  useEffect(()=>{wlRef.current=watchlist;},[watchlist]);
  const wlRefreshRef=useRef(null);
  useEffect(()=>{
    async function refreshAll(){
      const atual=wlRef.current||[];
      if(!atual.length) return;
      const updated=await Promise.all(atual.map(async w=>{
        const real=await fetchPrecoReal(w.ticker,profileId,true);
        if(!real) return w;
        return{...w,preco:real.preco_atual,variacao_dia:real.variacao_dia,variacao_dia_abs:real.variacao_dia_abs,pl:real.pl??w.pl,dy:real.dy??w.dy,roe:real.roe??w.roe};
      }));
      setWatchlist(updated);
      setWlUpd(new Date());
    }
    refreshAll();
    wlRefreshRef.current=setInterval(refreshAll,30000);
    return()=>clearInterval(wlRefreshRef.current);
  },[profileId,watchlist.length]);

  // Scroll automático do chat
  useEffect(()=>{if(chatRef.current)chatRef.current.scrollTop=chatRef.current.scrollHeight;},[chatMsgs]);

  async function comparaIndice(){
    setIndiceLoading(true);
    try{
      const symbol=isBR?"^BVSP":"^AXJO";
      const r=await fetch(`${WORKER}/indice?symbol=${encodeURIComponent(symbol)}`);
      const d=await r.json();
      const varIndice=d?.variacao_12m;
      const totInvestido=investimentos.reduce((a,b)=>a+(b.valorInvestido||b.valor||0),0);
      const totAtual=investimentos.reduce((a,b)=>a+(b.valorAtual||b.valorInvestido||b.valor||0),0);
      const rentCarteira=totInvestido>0?((totAtual-totInvestido)/totInvestido)*100:0;
      setIndiceData({rentCarteira,varIndice:varIndice!=null?varIndice:null,nomeIndice:nomeIndice(profileId)});
    }catch(e){
      setIndiceData({erro:true,nomeIndice:nomeIndice(profileId)});
    }
    setIndiceLoading(false);
  }

  const alertas=data.alertas||[];
  function alertaDoTicker(ticker){return alertas.find(a=>a.ticker===ticker);}
  function alertaAtingido(ticker,precoAtual){const a=alertaDoTicker(ticker);if(!a||precoAtual==null)return false;return a.tipo==="acima"?precoAtual>=a.preco:precoAtual<=a.preco;}
  function salvarAlerta(ticker){const p=parseFloat(alertaPreco);if(!p){return;}setData(d=>({...d,alertas:[...(d.alertas||[]).filter(a=>a.ticker!==ticker),{ticker,preco:p,tipo:alertaTipo}]}));setAlertaEdit(null);setAlertaPreco("");}
  function removerAlerta(ticker){setData(d=>({...d,alertas:(d.alertas||[]).filter(a=>a.ticker!==ticker)}));}

  async function addWatch(){
    const t=wInput.trim().toUpperCase();
    setWLoading(true);
    // Busca preço + indicadores fundamentalistas reais do Yahoo (full=true)
    const real=await fetchPrecoReal(t,profileId,true);
    let obj={ticker:t,nome:real?.nome||t,categoria:wCat||"Outros",preco:real?.preco_atual||null,variacao_dia:real?.variacao_dia||null,pl:real?.pl??null,dy:real?.dy??null,roe:real?.roe??null,pvp:real?.pvp??null,currency};
    // Claude só para nome curto e categoria (e indicadores que o Yahoo não tiver)
    try{
      const mercado=nomeMercadoCurto(profileId);
      const precisaIA=!obj.pl||!obj.dy||!obj.roe;
      const txt=await askClaude(`Para o ativo ${t} na bolsa ${mercado}, retorne APENAS JSON: {"nome":"nome curto","categoria":"Banco|Infraestrutura|Fundo Imobiliário|Energia|Tecnologia|Varejo|Saúde|Agronegócio|Mineração|Petróleo|ETF|Exterior|Outros"${precisaIA?',"pl":number_or_null,"dy":number_or_null,"roe":number_or_null':''}}`,300);
      const parsed=JSON.parse(txt);
      obj={...obj,
        nome:(obj.nome&&obj.nome!==t)?obj.nome:(parsed.nome||t),
        categoria:wCat||parsed.categoria||"Outros",
        pl:obj.pl??parsed.pl??null,
        dy:obj.dy??parsed.dy??null,
        roe:obj.roe??parsed.roe??null};
    }catch{}
    setWatchlist(p=>[...p,obj]);
    setWInput("");setWLoading(false);
  }

  function addToComp(ticker){if(!compList.includes(ticker))setCompList(p=>[...p,ticker]);}


  // ── fetchNews com Google News RSS real ─────────────────────────────────────
  async function fetchNews(){
    if(!watchlist.length){setErro("Adicione ativos à watchlist.");return;}
    setNewsLoading(true);setErro("");
    const tickers=[...new Set([...watchlist.map(w=>w.ticker),...investimentos.map(i=>i.ticker).filter(Boolean)])];
    try{
      const map={};
      for(const ticker of tickers){
        const r=await fetch(`${WORKER}/news?ticker=${encodeURIComponent(ticker)}&market=${profileId}`);
        const d=await r.json();
        if(!d.items||d.items.length===0){map[ticker]=[];continue;}
        const lista=d.items.map((it,i)=>`${i+1}. "${it.title}" (${new Date(it.pubDate).toLocaleDateString("pt-BR")})`).join("\n");
        try{
          const txt=await askClaude(`Para cada notícia abaixo sobre ${ticker}, classifique tipo e impacto e escreva um resumo curto em português (1-2 frases). Notícias:\n${lista}\nRetorne APENAS JSON array: [{"tipo":"resultado|dividendo|fato_relevante|noticia|macro","impacto":"positivo|negativo|neutro","resumo":"..."}]`,600);
          const s=txt.indexOf("["),e=txt.lastIndexOf("]");
          const class_=JSON.parse(txt.slice(s,e+1));
          map[ticker]=d.items.map((it,i)=>({titulo:it.title,data:it.pubDate?new Date(it.pubDate).toISOString().slice(0,10):"",link:it.link,fonte:it.source,tipo:class_[i]?.tipo||"noticia",impacto:class_[i]?.impacto||"neutro",resumo:class_[i]?.resumo||""}));
        }catch{
          map[ticker]=d.items.map(it=>({titulo:it.title,data:it.pubDate?new Date(it.pubDate).toISOString().slice(0,10):"",link:it.link,fonte:it.source,tipo:"noticia",impacto:"neutro",resumo:""}));
        }
      }
      setNews(map);
    }catch(e){setErro("Erro ao buscar notícias: "+e.message);}
    setNewsLoading(false);
  }

  // ── NOVO: Análise de impacto das notícias no preço ─────────────────────────
  async function analisarImpactoNoticias(ticker, noticias){
    if(!noticias||noticias.length===0) return;
    setNewsImpactLoading(true);
    try{
      const precoReal=await fetchPrecoReal(ticker,profileId);
      const preco=precoReal?.preco_atual||"desconhecido";
      const resumoNoticias=noticias.map((n,i)=>`${i+1}. [${n.tipo}] ${n.titulo} — ${n.data}`).join("\n");
      const txt=await askClaude(
        `Analista sênior de mercado. Ativo: ${ticker}. Preço atual: ${currency} ${preco}.\n\nNotícias recentes:\n${resumoNoticias}\n\nRetorne APENAS JSON: {"tendencia":"alta|baixa|lateral","confianca":"alta|media|baixa","preco_alvo_curto":number_or_null,"preco_alvo_medio":number_or_null,"resumo_impacto":"3 frases sobre impacto consolidado das notícias no preço","acao_recomendada":"Comprar|Manter|Vender|Aguardar","principais_riscos":["r1","r2"],"principais_catalisadores":["c1","c2"]}`,
        800
      );
      const s=txt.indexOf("{"),e=txt.lastIndexOf("}");
      const impact=JSON.parse(txt.slice(s,e+1));
      setNewsImpact(prev=>({...prev,[ticker]:impact}));
    }catch(err){console.error(err);}
    setNewsImpactLoading(false);
  }

  // ── NOVO: Chat com analista IA ─────────────────────────────────────────────
  async function enviarChat(){
    if(!chatInput.trim()||chatLoading) return;
    const userMsg={role:"user",content:chatInput.trim()};
    const novaMsgs=[...chatMsgs,userMsg];
    setChatMsgs(novaMsgs);setChatInput("");setChatLoading(true);
    try{
      const mercado=nomeMercadoCurto(profileId);
      const carteira=investimentos.length>0?`\nCarteira do usuário: ${investimentos.map(i=>`${i.ticker||i.tipo}:${currency}${i.valorAtual||i.valorInvestido||0}`).join(", ")}`:"";
      const watchStr=watchlist.length>0?`\nWatchlist: ${watchlist.map(w=>`${w.ticker}@${currency}${w.preco||"?"}`).join(", ")}`:"";
      const systemPrompt=`Você é um analista financeiro especialista na bolsa ${mercado}. Responda em português de forma clara, objetiva e com dados quando possível.${carteira}${watchStr}`;
      const msgs=novaMsgs.slice(-10).map(m=>({role:m.role,content:m.content}));
      const res=await fetch(WORKER,{method:"POST",headers:{"Content-Type":"application/json",...authHdr()},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1500,system:systemPrompt,messages:msgs})});
      const d=await res.json();
      const resposta=d.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"Erro ao obter resposta.";
      setChatMsgs(prev=>[...prev,{role:"assistant",content:resposta}]);
    }catch{setChatMsgs(prev=>[...prev,{role:"assistant",content:"Erro ao conectar com o analista. Tente novamente."}]);}
    setChatLoading(false);
  }

  // ── NOVO: Sugestões com Extended Thinking (Adaptive) ──────────────────────
  async function buscarSugestoesThinking(){
    setSugestLoading(true);setErro("");setThinkingLog("");setShowThinking(false);
    const mercado=nomeMercadoCurto(profileId);
    try{
      // Busca preços reais da watchlist para contexto
      const precoCtx=watchlist.length>0?`\nAtivos em acompanhamento: ${watchlist.map(w=>`${w.ticker}@${currency}${w.preco||"?"} (P/L:${w.pl||"?"}, DY:${w.dy||"?"}%)`).join(", ")}`:"";
      const carteiraCtx=investimentos.length>0?`\nCarteira atual: ${investimentos.map(i=>`${i.ticker||i.tipo}:${currency}${i.valorAtual||i.valorInvestido||0}`).join(", ")}`:"";

      const res=await fetch(WORKER,{method:"POST",headers:{"Content-Type":"application/json",...authHdr()},body:JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:5000,
        thinking:{type:"adaptive"},
        messages:[{role:"user",content:`Você é um analista fundamentalista sênior. Analise profundamente o mercado ${mercado} e identifique as 5 melhores oportunidades de compra considerando: P/L justo, DY atrativo, ROE elevado, crescimento de lucros, saúde financeira e momento de mercado.${precoCtx}${carteiraCtx}\n\nRetorne APENAS JSON sem markdown: {"mercado":"${({br:"Brasil",us:"EUA",au:"Austrália"}[profileId]||"Austrália")}","metodologia":"breve descrição da análise","acoes":[{"ticker":"str","nome":"str","setor":"str","preco":number,"pl":number,"pvp":number,"dy":number,"roe":number,"cagr_lucro":number,"score":0-10,"recomendacao":"Compra Forte|Compra|Neutro","justificativa":"3-4 frases detalhadas sobre tese de investimento","riscos":"2 riscos principais","potencial_upside":"XX%","horizonte":"Curto|Médio|Longo prazo"}]}`}]
      })});
      const d=await res.json();
      if(d.error) throw new Error(d.error.message||"Erro na API");

      // Extrai thinking se disponível
      const thinkingBlock=d.content?.find(b=>b.type==="thinking");
      if(thinkingBlock?.thinking){setThinkingLog(thinkingBlock.thinking);}

      const textBlock=d.content?.find(b=>b.type==="text");
      if(!textBlock||!textBlock.text) throw new Error("A IA não retornou resposta. Tente novamente ou desligue o Thinking.");
      const txt=textBlock.text.replace(/```json|```/g,"").trim();
      const s=txt.indexOf("{"),e=txt.lastIndexOf("}");
      if(s===-1||e===-1) throw new Error("Resposta em formato inesperado. Tente novamente.");
      let result;
      try{result=JSON.parse(txt.slice(s,e+1));}
      catch{throw new Error("A análise veio incompleta. Tente novamente ou desligue o Thinking.");}

      // Enriquece com preços reais
      if(result.acoes){
        for(const acao of result.acoes){
          const real=await fetchPrecoReal(acao.ticker,profileId);
          if(real?.preco_atual){acao.preco=real.preco_atual;acao.variacao_dia=real.variacao_dia||null;}
        }
      }
      setSugestoes(result);
    }catch(e){setErro("Erro ao analisar mercado: "+(e.message||"erro desconhecido")+(/524|timeout/i.test(e.message||"")?" (a análise demorou demais — tente desligar o Thinking)":""));}
    setSugestLoading(false);
  }

  // Sugestões sem thinking (modo rápido)
  async function buscarSugestoes(){
    if(thinkingMode){buscarSugestoesThinking();return;}
    setSugestLoading(true);setErro("");
    const mercado=nomeMercadoCurto(profileId);
    try{
      const txt=await askClaude(`Analista fundamentalista. Melhores 5 oportunidades de compra na bolsa ${mercado} hoje. Critérios: P/L baixo, DY alto, ROE alto, crescimento, saúde financeira. JSON: {"mercado":"${({br:"Brasil",us:"EUA",au:"Austrália"}[profileId]||"Austrália")}","acoes":[{"ticker":"str","nome":"str","setor":"str","preco":number,"pl":number,"pvp":number,"dy":number,"roe":number,"cagr_lucro":number,"score":0-10,"recomendacao":"Compra Forte|Compra|Neutro","justificativa":"3-4 frases","riscos":"2 riscos principais","potencial_upside":"XX%","horizonte":"Curto|Médio|Longo prazo"}]}`,1500);
      const s=txt.indexOf("{"),e=txt.lastIndexOf("}");
      if(s===-1) throw new Error();
      const result=JSON.parse(txt.slice(s,e+1));
      // Enriquece com preços reais
      if(result.acoes){
        for(const acao of result.acoes){
          const real=await fetchPrecoReal(acao.ticker,profileId);
          if(real?.preco_atual){acao.preco=real.preco_atual;acao.variacao_dia=real.variacao_dia||null;}
        }
      }
      setSugestoes(result);
    }catch{setErro("Erro ao buscar sugestões.");}
    setSugestLoading(false);
  }

  // ── NOVO: Relatório detalhado por ação ─────────────────────────────────────
  async function gerarRelatorio(ticker){
    setRelatorioTicker(ticker);setRelatorioLoading(true);setRelatorio(null);
    const mercado=nomeMercadoCurto(profileId);
    try{
      const real=await fetchPrecoReal(ticker,profileId);
      const preco=real?.preco_atual?`${currency} ${real.preco_atual}`:"preço não disponível";
      const variacao=real?.variacao_dia!=null?`(${real.variacao_dia>=0?"+":""}${real.variacao_dia.toFixed(2)}% hoje)`:"";

      // Busca notícias reais
      let noticiasCtx="";
      try{
        const rn=await fetch(`${WORKER}/news?ticker=${encodeURIComponent(ticker)}&market=${profileId}`);
        const dn=await rn.json();
        if(dn.items?.length>0) noticiasCtx=`\nNotícias recentes: ${dn.items.slice(0,3).map(n=>n.title).join(" | ")}`;
      }catch{}

      const res=await fetch(WORKER,{method:"POST",headers:{"Content-Type":"application/json",...authHdr()},body:JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:4000,
        messages:[{role:"user",content:`Gere um relatório completo de análise fundamentalista para ${ticker} na bolsa ${mercado}. Preço atual: ${preco} ${variacao}.${noticiasCtx}\n\nRetorne APENAS JSON válido e completo, sem markdown e sem texto antes ou depois: {"ticker":"${ticker}","nome":"nome completo","setor":"setor","subsetor":"subsetor","preco_atual":"${preco}","variacao_dia":"${variacao}","resumo_empresa":"3 frases sobre o negócio","tese_investimento":"4-5 frases detalhadas","indicadores":{"pl":number_or_null,"pvp":number_or_null,"dy":number_or_null,"roe":number_or_null,"roic":number_or_null,"margem_liquida":number_or_null,"divida_ebitda":number_or_null,"cagr_lucro_5a":number_or_null},"pontos_fortes":["p1","p2","p3"],"pontos_fracos":["f1","f2","f3"],"riscos":["r1","r2","r3"],"catalisadores":["c1","c2","c3"],"valuation":"justo|descontado|sobrevalorizado","score_geral":0-10,"recomendacao":"Compra Forte|Compra|Neutro|Vender","preco_alvo_12m":number_or_null,"upside_potencial":"XX%","horizonte_recomendado":"Curto|Médio|Longo prazo","conclusao":"3 frases de conclusão"}`}]
      })});
      const d=await res.json();
      if(d.error) throw new Error(d.error.message||"Erro na API");
      const textBlock=d.content?.find(b=>b.type==="text");
      if(!textBlock||!textBlock.text) throw new Error("A IA não retornou o relatório. Tente novamente.");
      const txt=textBlock.text.replace(/```json|```/g,"").trim();
      const s=txt.indexOf("{"),e=txt.lastIndexOf("}");
      if(s===-1||e===-1) throw new Error("Resposta em formato inesperado. Tente novamente.");
      let parsed;
      try{parsed=JSON.parse(txt.slice(s,e+1));}
      catch{throw new Error("O relatório veio incompleto. Tente novamente.");}
      setRelatorio(parsed);
    }catch(e){setErro("Erro ao gerar relatório: "+(e.message||"erro desconhecido"));}
    setRelatorioLoading(false);
  }

  // ── NOVO: Análise de carteira pessoal vs sugestões ────────────────────────
  async function analisarCarteira(){
    if(!investimentos.length){setErro("Adicione investimentos primeiro.");return;}
    setCarteiraLoading(true);setErro("");
    const mercado=nomeMercadoCurto(profileId);
    try{
      // Busca preços atuais de todos os investimentos
      const invComPrecos=await Promise.all(investimentos.map(async inv=>{
        if(!inv.ticker) return inv;
        const real=await fetchPrecoReal(inv.ticker,profileId);
        return{...inv,preco_atual:real?.preco_atual||inv.preco_atual||null,variacao_dia:real?.variacao_dia||null};
      }));

      const carteiraDetalhada=invComPrecos.map(i=>`${i.ticker||i.tipo}: investido ${currency}${i.valorInvestido||i.valor||0}, atual ${currency}${i.valorAtual||i.valorInvestido||0}, preço ${i.preco_atual||"?"}`).join("\n");

      const res=await fetch(WORKER,{method:"POST",headers:{"Content-Type":"application/json",...authHdr()},body:JSON.stringify({
        model:"claude-sonnet-4-6",
        max_tokens:4000,
        messages:[{role:"user",content:`Você é um gestor de portfólio sênior. Analise a carteira de investimentos abaixo na bolsa ${mercado} e forneça recomendações precisas.\n\nCarteira atual:\n${carteiraDetalhada}\n\nRetorne APENAS JSON válido e completo, sem markdown e sem texto antes ou depois: {"resumo_carteira":"3 frases sobre estado atual","score_carteira":0-10,"diversificacao":"boa|regular|fraca","concentracao_risco":"baixo|medio|alto","retorno_estimado_12m":"XX%","recomendacoes":[{"ativo":"ticker ou tipo","acao":"Manter|Aumentar|Reduzir|Vender|Diversificar","prioridade":"alta|media|baixa","justificativa":"2 frases","percentual_sugerido":"XX% da carteira"}],"ativos_adicionar":[{"ticker":"str","justificativa":"por que faz sentido com sua carteira atual","complementaridade":"como complementa o portfólio"}],"ativos_remover":[{"ticker":"str","motivo":"str"}],"alocacao_ideal":[{"classe":"Ações|FII|ETF|Renda Fixa|Cripto|Outros","pct_atual":0,"pct_ideal":0}],"conclusao":"3 frases finais com plano de ação"}`}]
      })});
      const d=await res.json();
      if(d.error) throw new Error(d.error.message||"Erro na API");
      const textBlock=d.content?.find(b=>b.type==="text");
      if(!textBlock||!textBlock.text) throw new Error("A IA não retornou análise (resposta vazia). Tente novamente.");
      const txt=textBlock.text.replace(/```json|```/g,"").trim();
      const s=txt.indexOf("{"),e=txt.lastIndexOf("}");
      if(s===-1||e===-1) throw new Error("Resposta em formato inesperado. Tente novamente.");
      let parsed;
      try{parsed=JSON.parse(txt.slice(s,e+1));}
      catch{throw new Error("A análise veio incompleta. Tente novamente (o resultado pode ter sido cortado).");}
      setCarteiraAnalise(parsed);
    }catch(e){setErro("Erro ao analisar carteira: "+(e.message||"erro desconhecido. Tente novamente."));}
    setCarteiraLoading(false);
  }

  async function compararAtivos(){
    if(compList.length<2){setErro("Adicione pelo menos 2 ativos.");return;}
    setCompLoading(true);setErro("");
    const mercado=nomeMercadoCurto(profileId);
    const moeda=isBR?"BRL":"AUD";
    try{
      const precos={};
      await Promise.all(compList.map(async t=>{
        const real=await fetchPrecoReal(t,profileId);
        if(real?.preco_atual) precos[t]=real;
      }));
      const txt=await askClaude(`Analista financeiro. Bolsa ${mercado} em ${moeda}. Retorne APENAS JSON array com indicadores fundamentais (NÃO preço) para [${compList.join(",")}]: [{"ticker":"","nome":"","pl":number_or_null,"pvp":number_or_null,"dy":number_or_null,"roe":number_or_null,"divida_ebitda":number_or_null,"cagr_lucro":number_or_null,"margem_liquida":number_or_null}]`,1200);
      const s=txt.indexOf("["),e=txt.lastIndexOf("]");if(s===-1)throw new Error();
      const arr=JSON.parse(txt.slice(s,e+1));
      const final=arr.map(a=>({...a,preco:precos[a.ticker]?.preco_atual||precos[a.ticker?.replace(".AX","")]?.preco_atual||a.preco||null,variacao_dia:precos[a.ticker]?.variacao_dia||null}));
      setCompData(final);
    }catch{setErro("Erro ao comparar.");}
    setCompLoading(false);
  }

  async function sugerirAloc(){
    if(!investimentos.length){setErro("Adicione investimentos.");return;}
    setAlocLoading(true);setErro("");
    try{const txt=await askClaude(`Consultor financeiro. Carteira: ${investimentos.map(i=>`${i.tipo}:${i.valorInvestido||i.valor||0}`).join(",")}. JSON: {"analise":"2 frases","sugestao":[{"tipo":"str","pct_atual":0,"pct_ideal":0,"acao":"str"}]}`,800);const s=txt.indexOf("{"),e=txt.lastIndexOf("}");if(s===-1)throw new Error();setAlocRes(JSON.parse(txt.slice(s,e+1)));}
    catch(e){setErro("Erro: "+e.message);}setAlocLoading(false);
  }

  async function avaliarRisco(){
    if(!investimentos.length){setErro("Adicione investimentos.");return;}
    setRiscoLoading(true);setErro("");
    try{const txt=await askClaude(`Analista de risco. Carteira: ${investimentos.map(i=>`${i.tipo}:${i.valorInvestido||i.valor||0}`).join(",")}. JSON: {"perfil":"Conservador|Moderado|Arrojado","nota":0,"descricao":"2 frases","riscos":["r1","r2","r3"]}`,600);const s=txt.indexOf("{"),e=txt.lastIndexOf("}");if(s===-1)throw new Error();setNotaRisco(JSON.parse(txt.slice(s,e+1)));}
    catch{setErro("Erro ao avaliar risco.");}setRiscoLoading(false);
  }

  function calcRent(){
    if(calcForm.tipo==="acao"){const pc=parseFloat(calcForm.pc),pa=parseFloat(calcForm.pa),qt=parseFloat(calcForm.qt);if(!pc||!pa||!qt)return;const lucro=(pa-pc)*qt;const imposto=isBR?calcImpostoBR(lucro,parseInt(calcForm.meses)||12):calcImpostoAU(lucro,parseInt(calcForm.meses)||12);setCalcRes({investido:pc*qt,atual:pa*qt,lucro,lucroLiq:lucro-imposto,imposto,pct:((pa-pc)/pc)*100});}
    else{const vi=parseFloat(calcForm.pc),m=parseInt(calcForm.meses)||12;if(!vi)return;const fakeInv={indice:calcForm.indice,taxaRF:calcForm.taxa,pctIndice:"100",rfTipo:"mais",valorInvestido:vi,valor:vi,data:new Date(Date.now()-m*30*24*60*60*1000).toISOString().slice(0,10)};const va=calcValorAtualRF(fakeInv);const lucro=va-vi;const imposto=isBR?calcImpostoBR(lucro,m):calcImpostoAU(lucro,m);setCalcRes({investido:vi,atual:va,lucro,lucroLiq:lucro-imposto,imposto,pct:((va-vi)/vi)*100,taxa:calcRFAnual(fakeInv).toFixed(2)});}
  }

  function simJuros(){
    const ini=parseFloat(simForm.ini)||0,ap=parseFloat(simForm.ap)||0,meses=parseInt(simForm.meses)||0;if(!meses)return;
    const tm=taxaMensalSim(simForm.tipo,simForm.taxa,simForm.indice,simForm.pctInd); // testado em calc.mjs
    const {saldo,pts,rendimento}=simularJuros(ini,ap,meses,tm);                       // testado em calc.mjs
    const imposto=isBR?calcImpostoBR(rendimento,meses):calcImpostoAU(rendimento,meses);
    const aliquota=isBR?(meses<=6?"22.5%":meses<=12?"20%":meses<=24?"17.5%":"15%"):(meses>=12?"50% desc.×32.5%":"32.5%");
    setSimRes({saldo:Math.round(saldo),saldoLiq:Math.round(saldo-imposto),aportado:Math.round(ini+ap*meses),juros:Math.round(rendimento),imposto:Math.round(imposto),pts,aliquota});
  }

  const wlFilt=wFiltro==="Todas"?watchlist:watchlist.filter(w=>(w.categoria||"Outros")===wFiltro);
  const cats=["Todas",...new Set(watchlist.map(w=>w.categoria||"Outros"))];
  function isBest(key,val,arr){if(val==null)return false;const vals=arr.map(a=>a[key]).filter(v=>v!=null);if(vals.length<2)return false;const ind=IND_COMP.find(i=>i.key===key);return ind?.higher?val===Math.max(...vals):val===Math.min(...vals);}
  const tipoIcons={resultado:"📊",dividendo:"💰",fato_relevante:"📢",noticia:"📰"};
  const tipoLine={resultado:D.blue,dividendo:D.green,fato_relevante:D.gold,noticia:D.text3};
  const screenerSymbol=screenerSearch.trim().toUpperCase()||null;

  const recScore=carteirAnalise?.score_carteira||0;
  const recCor=recScore>=7?D.green:recScore>=5?D.gold:D.red;

  return <div style={{display:"flex",flexDirection:"column",gap:"1.25rem"}}>
    {chartTicker&&<ChartModal ticker={chartTicker} currency={currency} market={market} dyAlvo={dyAlvo} onClose={()=>setChartTicker(null)}/>}
    {erro&&<div style={{background:D.red+"22",border:`1px solid ${D.red}44`,borderRadius:10,padding:"10px 14px",fontSize:12,color:D.red,display:"flex",justifyContent:"space-between"}}>{erro}<button onClick={()=>setErro("")} style={{border:"none",background:"none",cursor:"pointer",color:D.red}}>✕</button></div>}

    {/* ── NOVO: Chat com Analista IA ───────────────────────────────────────── */}
    <Card style={{border:`1px solid ${D.blue}33`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div>
          <p style={{fontSize:14,fontWeight:700,color:D.text}}>🤖 Analista IA</p>
          <p style={{fontSize:11,color:D.text3}}>Pergunte sobre ações, estratégias e mercado</p>
        </div>
        <Badge color={D.blue}>claude-sonnet-4-6</Badge>
      </div>
      <div ref={chatRef} style={{height:220,overflowY:"auto",display:"flex",flexDirection:"column",gap:8,marginBottom:10,padding:"8px",background:D.bg3,borderRadius:10}}>
        {chatMsgs.map((m,i)=><div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
          <div style={{maxWidth:"85%",padding:"8px 12px",borderRadius:m.role==="user"?"12px 12px 4px 12px":"12px 12px 12px 4px",background:m.role==="user"?D.blue:D.card2,fontSize:12,color:D.text,lineHeight:1.6,whiteSpace:"pre-wrap"}}>
            {m.role==="assistant"&&<span style={{fontSize:10,color:D.blue,display:"block",marginBottom:4}}>🤖 Analista IA</span>}
            {m.content}
          </div>
        </div>)}
        {chatLoading&&<div style={{display:"flex",justifyContent:"flex-start"}}>
          <div style={{padding:"8px 12px",borderRadius:"12px 12px 12px 4px",background:D.card2,fontSize:12,color:D.text3}}>⏳ Analisando...</div>
        </div>}
      </div>
      <div style={{display:"flex",gap:8}}>
        <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&enviarChat()} placeholder={`Pergunte sobre ${isBR?"PETR4, VALE3, dividendos...":"BHP, CBA, dividends..."}`} style={{flex:1,fontSize:12}}/>
        <Btn onClick={enviarChat} disabled={chatLoading||!chatInput.trim()} color={D.blue} sm>Enviar</Btn>
        <Btn onClick={()=>setChatMsgs([{role:"assistant",content:`Olá! Sou seu analista financeiro IA. Como posso ajudar?`}])} color={D.text3} outline sm>Limpar</Btn>
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
        {[`Quais ${isBR?"ações":"stocks"} pagam mais dividendos?`,"Compare FIIs de logística","Qual o melhor setor agora?","Explique P/L e P/VP"].map((q,i)=><button key={i} onClick={()=>{setChatInput(q);}} style={{fontSize:10,padding:"3px 8px",borderRadius:12,border:`1px solid ${D.border2}`,background:"transparent",color:D.text3,cursor:"pointer"}}>{q}</button>)}
      </div>
    </Card>

    {/* ── Sugestões com Extended Thinking ─────────────────────────────────── */}
    <Card style={{border:`1px solid ${D.gold}33`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8,flexWrap:"wrap",gap:8}}>
        <div>
          <p style={{fontSize:14,fontWeight:700,color:D.text}}>🔍 Melhores ações para comprar agora</p>
          <p style={{fontSize:11,color:D.text3}}>Análise fundamentalista com preços reais</p>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          <button onClick={()=>setThinkingMode(t=>!t)} style={{fontSize:11,padding:"4px 10px",borderRadius:16,border:`1px solid ${thinkingMode?D.purple:D.border2}`,background:thinkingMode?D.purple+"22":"transparent",color:thinkingMode?D.purple:D.text3,cursor:"pointer"}}>
            {thinkingMode?"🧠 Thinking ON":"🧠 Thinking OFF"}
          </button>
          <Btn sm color={D.gold} onClick={buscarSugestoes} disabled={sugestLoading}>{sugestLoading?"Analisando...":"Analisar mercado"}</Btn>
        </div>
      </div>

      {thinkingMode&&<div style={{background:D.purple+"11",border:`1px solid ${D.purple}33`,borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:11,color:D.purple}}>
        🧠 <strong>Extended Thinking ativo</strong> — Claude vai raciocinar profundamente antes de responder. Mais lento, mas mais preciso.
      </div>}

      {!sugestoes&&!sugestLoading&&<p style={{fontSize:12,color:D.text3}}>Análise fundamentalista do mercado {nomePais(profileId)} com preços em tempo real.</p>}

      {sugestoes&&<>
        {sugestoes.metodologia&&<p style={{fontSize:11,color:D.text3,marginBottom:10,padding:"6px 10px",background:D.bg3,borderRadius:6}}>📋 Metodologia: {sugestoes.metodologia}</p>}

        {thinkingLog&&<div style={{marginBottom:10}}>
          <button onClick={()=>setShowThinking(t=>!t)} style={{fontSize:11,padding:"4px 10px",borderRadius:16,border:`1px solid ${D.purple}44`,background:"transparent",color:D.purple,cursor:"pointer"}}>
            {showThinking?"▲ Ocultar":"▼ Ver"} raciocínio do Claude ({Math.round(thinkingLog.length/4)} tokens)
          </button>
          {showThinking&&<div style={{marginTop:8,padding:"10px 14px",background:D.purple+"11",borderRadius:8,fontSize:11,color:D.text3,lineHeight:1.7,maxHeight:200,overflowY:"auto",whiteSpace:"pre-wrap"}}>{thinkingLog}</div>}
        </div>}

        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {sugestoes.acoes?.map((a,i)=><div key={i} style={{background:D.bg3,borderRadius:12,padding:"14px 16px",border:`1px solid ${a.recomendacao==="Compra Forte"?D.green+"55":a.recomendacao==="Compra"?D.blue+"44":D.border}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8,flexWrap:"wrap",gap:8}}>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <span onClick={()=>setChartTicker(a.ticker)} style={{fontSize:16,fontWeight:800,color:D.green,cursor:"pointer"}}>{a.ticker}</span>
                <span style={{fontSize:12,color:D.text2}}>{a.nome}</span>
                <Badge color={D.purple}>{a.setor}</Badge>
                <Badge color={a.recomendacao==="Compra Forte"?D.green:a.recomendacao==="Compra"?D.blue:D.text3}>{a.recomendacao}</Badge>
                {a.horizonte&&<Badge color={D.gold}>{a.horizonte}</Badge>}
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <p style={{margin:0,fontSize:16,fontWeight:700,color:D.text}}>{a.preco?`${currency} ${Number(a.preco).toFixed(2)}`:"—"}</p>
                {a.variacao_dia!=null&&<p style={{margin:0,fontSize:11,fontWeight:600,color:a.variacao_dia>=0?D.green:D.red}}>{a.variacao_dia>=0?"▲":"▼"} {Math.abs(a.variacao_dia).toFixed(2)}% hoje</p>}
                <p style={{margin:0,fontSize:12,color:D.green,fontWeight:600}}>↑ {a.potencial_upside}</p>
              </div>
            </div>

            <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
              {a.pl!=null&&<Badge color={D.blue}>P/L {Number(a.pl).toFixed(1)}x</Badge>}
              {a.pvp!=null&&<Badge color={D.blue}>P/VP {Number(a.pvp).toFixed(2)}x</Badge>}
              {a.dy!=null&&<Badge color={D.gold}>DY {Number(a.dy).toFixed(1)}%</Badge>}
              {a.roe!=null&&<Badge color={D.purple}>ROE {Number(a.roe).toFixed(1)}%</Badge>}
              {a.cagr_lucro!=null&&<Badge color={D.green}>CAGR {Number(a.cagr_lucro).toFixed(1)}%</Badge>}
              <div style={{display:"flex",alignItems:"center",gap:3,padding:"2px 8px",borderRadius:20,background:D.gold+"22",border:`1px solid ${D.gold}44`}}>
                {Array.from({length:10},(_,j)=><div key={j} style={{width:6,height:6,borderRadius:1,background:j<a.score?D.gold:D.bg2}}/>)}
                <span style={{fontSize:10,color:D.gold,fontWeight:700,marginLeft:2}}>{a.score}/10</span>
              </div>
            </div>

            <p style={{margin:"0 0 6px",fontSize:12,color:D.text2,lineHeight:1.6}}>{a.justificativa}</p>
            {a.riscos&&<p style={{margin:0,fontSize:11,color:D.red,opacity:0.8}}>⚠️ {a.riscos}</p>}

            <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
              <button onClick={()=>addToComp(a.ticker)} style={{border:`1px solid ${D.blue}`,background:"transparent",color:D.blue,borderRadius:6,padding:"3px 10px",fontSize:10,cursor:"pointer"}}>+ Comparar</button>
              <button onClick={()=>setWatchlist(w=>w.find(x=>x.ticker===a.ticker)?w:[...w,{ticker:a.ticker,nome:a.nome,categoria:a.setor,preco:a.preco,variacao_dia:a.variacao_dia,dy:a.dy,pl:a.pl,currency}])} style={{border:`1px solid ${D.green}`,background:"transparent",color:D.green,borderRadius:6,padding:"3px 10px",fontSize:10,cursor:"pointer"}}>+ Watchlist</button>
              <button onClick={()=>gerarRelatorio(a.ticker)} style={{border:`1px solid ${D.gold}`,background:"transparent",color:D.gold,borderRadius:6,padding:"3px 10px",fontSize:10,cursor:"pointer"}}>📄 Relatório</button>
            </div>
          </div>)}
        </div>
      </>}
    </Card>

    {/* ── NOVO: Relatório Detalhado ─────────────────────────────────────────── */}
    {(relatorio||relatorioLoading)&&<Card style={{border:`1px solid ${D.gold}44`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div>
          <p style={{fontSize:14,fontWeight:700,color:D.text}}>📄 Relatório: {relatorioTicker}</p>
          <p style={{fontSize:11,color:D.text3}}>Análise fundamentalista completa</p>
        </div>
        {relatorio&&<button onClick={()=>setRelatorio(null)} style={{border:"none",background:"none",cursor:"pointer",color:D.text3,fontSize:18}}>✕</button>}
      </div>
      {relatorioLoading&&<div style={{textAlign:"center",padding:"30px 0"}}>
        <p style={{color:D.purple,fontSize:13}}>📄 Gerando relatório de {relatorioTicker}...</p>
        <p style={{color:D.text3,fontSize:11,marginTop:4}}>Buscando preço real e notícias recentes</p>
      </div>}
      {relatorio&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
          <div>
            <p style={{margin:0,fontSize:18,fontWeight:800,color:D.text}}>{relatorio.ticker} <span style={{fontSize:13,color:D.text3,fontWeight:400}}>— {relatorio.nome}</span></p>
            <p style={{margin:"2px 0",fontSize:12,color:D.text3}}>{relatorio.setor} › {relatorio.subsetor}</p>
            <p style={{margin:0,fontSize:11,color:D.text3,lineHeight:1.6}}>{relatorio.resumo_empresa}</p>
          </div>
          <div style={{textAlign:"right"}}>
            <p style={{margin:0,fontSize:22,fontWeight:800,color:D.text}}>{relatorio.preco_atual}</p>
            <p style={{margin:0,fontSize:12,color:D.text3}}>{relatorio.variacao_dia}</p>
            <Badge color={relatorio.recomendacao==="Compra Forte"?D.green:relatorio.recomendacao==="Compra"?D.blue:relatorio.recomendacao==="Vender"?D.red:D.text3}>{relatorio.recomendacao}</Badge>
          </div>
        </div>

        {/* Indicadores */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(90px,1fr))",gap:6}}>
          {[["P/L",relatorio.indicadores?.pl,"x"],["P/VP",relatorio.indicadores?.pvp,"x"],["DY",relatorio.indicadores?.dy,"%"],["ROE",relatorio.indicadores?.roe,"%"],["ROIC",relatorio.indicadores?.roic,"%"],["Margem",relatorio.indicadores?.margem_liquida,"%"],["Dív/EBITDA",relatorio.indicadores?.divida_ebitda,"x"],["CAGR 5a",relatorio.indicadores?.cagr_lucro_5a,"%"]].map(([l,v,u])=>v!=null&&<div key={l} style={{background:D.bg3,borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
            <p style={{margin:0,fontSize:9,color:D.text3,textTransform:"uppercase"}}>{l}</p>
            <p style={{margin:"2px 0 0",fontSize:14,fontWeight:700,color:D.blue}}>{Number(v).toFixed(2)}{u}</p>
          </div>)}
        </div>

        {/* Score + Alvo */}
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:120,background:D.bg3,borderRadius:10,padding:"10px 14px"}}>
            <p style={{margin:0,fontSize:11,color:D.text3}}>Score Geral</p>
            <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4}}>
              {Array.from({length:10},(_,j)=><div key={j} style={{width:10,height:10,borderRadius:2,background:j<relatorio.score_geral?D.gold:D.bg2}}/>)}
              <span style={{fontSize:16,fontWeight:700,color:D.gold}}>{relatorio.score_geral}/10</span>
            </div>
          </div>
          {relatorio.preco_alvo_12m&&<div style={{flex:1,minWidth:120,background:D.bg3,borderRadius:10,padding:"10px 14px"}}>
            <p style={{margin:0,fontSize:11,color:D.text3}}>Preço alvo 12m</p>
            <p style={{margin:"4px 0 0",fontSize:18,fontWeight:700,color:D.green}}>{currency} {Number(relatorio.preco_alvo_12m).toFixed(2)}</p>
            <p style={{margin:0,fontSize:11,color:D.green}}>↑ {relatorio.upside_potencial} · {relatorio.horizonte_recomendado}</p>
          </div>}
          <div style={{flex:1,minWidth:120,background:D.bg3,borderRadius:10,padding:"10px 14px"}}>
            <p style={{margin:0,fontSize:11,color:D.text3}}>Valuation</p>
            <p style={{margin:"4px 0 0",fontSize:14,fontWeight:700,color:relatorio.valuation==="descontado"?D.green:relatorio.valuation==="sobrevalorizado"?D.red:D.gold,textTransform:"capitalize"}}>{relatorio.valuation}</p>
          </div>
        </div>

        {/* Tese */}
        <div style={{background:D.bg3,borderRadius:10,padding:"12px 14px"}}>
          <p style={{margin:"0 0 6px",fontSize:12,fontWeight:700,color:D.text}}>📈 Tese de Investimento</p>
          <p style={{margin:0,fontSize:12,color:D.text2,lineHeight:1.7}}>{relatorio.tese_investimento}</p>
        </div>

        {/* Pontos fortes/fracos/riscos/catalisadores */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div style={{background:D.green+"11",borderRadius:10,padding:"10px 12px",border:`1px solid ${D.green}33`}}>
            <p style={{margin:"0 0 6px",fontSize:11,fontWeight:700,color:D.green}}>✅ Pontos Fortes</p>
            {relatorio.pontos_fortes?.map((p,i)=><p key={i} style={{margin:"0 0 3px",fontSize:11,color:D.text2}}>• {p}</p>)}
          </div>
          <div style={{background:D.red+"11",borderRadius:10,padding:"10px 12px",border:`1px solid ${D.red}33`}}>
            <p style={{margin:"0 0 6px",fontSize:11,fontWeight:700,color:D.red}}>❌ Pontos Fracos</p>
            {relatorio.pontos_fracos?.map((p,i)=><p key={i} style={{margin:"0 0 3px",fontSize:11,color:D.text2}}>• {p}</p>)}
          </div>
          <div style={{background:D.gold+"11",borderRadius:10,padding:"10px 12px",border:`1px solid ${D.gold}33`}}>
            <p style={{margin:"0 0 6px",fontSize:11,fontWeight:700,color:D.gold}}>⚠️ Riscos</p>
            {relatorio.riscos?.map((p,i)=><p key={i} style={{margin:"0 0 3px",fontSize:11,color:D.text2}}>• {p}</p>)}
          </div>
          <div style={{background:D.blue+"11",borderRadius:10,padding:"10px 12px",border:`1px solid ${D.blue}33`}}>
            <p style={{margin:"0 0 6px",fontSize:11,fontWeight:700,color:D.blue}}>🚀 Catalisadores</p>
            {relatorio.catalisadores?.map((p,i)=><p key={i} style={{margin:"0 0 3px",fontSize:11,color:D.text2}}>• {p}</p>)}
          </div>
        </div>

        {/* Conclusão */}
        <div style={{background:`linear-gradient(135deg,${D.bg3},${D.card2})`,borderRadius:10,padding:"12px 14px",border:`1px solid ${D.border2}`}}>
          <p style={{margin:"0 0 6px",fontSize:12,fontWeight:700,color:D.text}}>🎯 Conclusão</p>
          <p style={{margin:0,fontSize:12,color:D.text2,lineHeight:1.7}}>{relatorio.conclusao}</p>
        </div>
      </div>}
    </Card>}

    {/* ── NOVO: Análise de Carteira Pessoal ────────────────────────────────── */}
    <Card style={{border:`1px solid ${D.purple}33`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8,flexWrap:"wrap",gap:8}}>
        <div>
          <p style={{fontSize:14,fontWeight:700,color:D.text}}>💼 Análise da Minha Carteira</p>
          <p style={{fontSize:11,color:D.text3}}>IA analisa seu portfólio e sugere melhorias</p>
        </div>
        <Btn sm color={D.purple} onClick={analisarCarteira} disabled={carteiraLoading}>{carteiraLoading?"Analisando...":"Analisar carteira"}</Btn>
      </div>

      {carteiraLoading&&<div style={{textAlign:"center",padding:"20px 0"}}>
        <p style={{color:D.purple,fontSize:13}}>💼 Analisando seu portfólio...</p>
        <p style={{color:D.text3,fontSize:11,marginTop:4}}>Buscando preços reais e calculando performance</p>
      </div>}

      {!carteirAnalise&&!carteiraLoading&&<p style={{fontSize:12,color:D.text3}}>Análise profunda da sua carteira com recomendações personalizadas, ativos para adicionar/remover e alocação ideal.</p>}

      {carteirAnalise&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
        {/* Score carteira */}
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:150,background:D.bg3,borderRadius:10,padding:"12px 14px"}}>
            <p style={{margin:"0 0 4px",fontSize:11,color:D.text3}}>Score da Carteira</p>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <p style={{margin:0,fontSize:28,fontWeight:800,color:recCor}}>{carteirAnalise.score_carteira}/10</p>
              <div><p style={{margin:0,fontSize:11,color:recCor,fontWeight:600}}>Diversificação: {carteirAnalise.diversificacao}</p><p style={{margin:0,fontSize:11,color:D.text3}}>Risco: {carteirAnalise.concentracao_risco}</p></div>
            </div>
          </div>
          <div style={{flex:1,minWidth:150,background:D.bg3,borderRadius:10,padding:"12px 14px"}}>
            <p style={{margin:"0 0 4px",fontSize:11,color:D.text3}}>Retorno estimado 12m</p>
            <p style={{margin:0,fontSize:22,fontWeight:700,color:D.green}}>{carteirAnalise.retorno_estimado_12m}</p>
          </div>
        </div>

        <p style={{fontSize:12,color:D.text2,lineHeight:1.6,padding:"8px 12px",background:D.bg3,borderRadius:8}}>{carteirAnalise.resumo_carteira}</p>

        {/* Recomendações por ativo */}
        {carteirAnalise.recomendacoes?.length>0&&<div>
          <p style={{fontSize:12,fontWeight:700,color:D.text,marginBottom:8}}>Recomendações por ativo</p>
          {carteirAnalise.recomendacoes.map((r,i)=>{
            const ac=r.acao;
            const cor=ac==="Aumentar"?D.green:ac==="Vender"||ac==="Reduzir"?D.red:ac==="Diversificar"?D.gold:D.blue;
            return <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"8px 12px",background:D.bg3,borderRadius:8,marginBottom:6,border:`1px solid ${cor}33`}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:3}}><span style={{fontSize:13,fontWeight:700,color:D.text}}>{r.ativo}</span><Badge color={cor}>{r.acao}</Badge><Badge color={r.prioridade==="alta"?D.red:r.prioridade==="media"?D.gold:D.text3}>{r.prioridade}</Badge></div>
                <p style={{margin:0,fontSize:11,color:D.text3}}>{r.justificativa}</p>
                {r.percentual_sugerido&&<p style={{margin:"2px 0 0",fontSize:10,color:cor}}>Sugestão: {r.percentual_sugerido}</p>}
              </div>
            </div>;
          })}
        </div>}

        {/* Ativos para adicionar */}
        {carteirAnalise.ativos_adicionar?.length>0&&<div>
          <p style={{fontSize:12,fontWeight:700,color:D.green,marginBottom:6}}>➕ Adicionar à carteira</p>
          {carteirAnalise.ativos_adicionar.map((a,i)=><div key={i} style={{padding:"8px 12px",background:D.green+"11",borderRadius:8,marginBottom:6,border:`1px solid ${D.green}33`}}>
            <p style={{margin:"0 0 2px",fontSize:13,fontWeight:700,color:D.green}}>{a.ticker}</p>
            <p style={{margin:0,fontSize:11,color:D.text3}}>{a.justificativa}</p>
            <p style={{margin:"2px 0 0",fontSize:10,color:D.text3,fontStyle:"italic"}}>{a.complementaridade}</p>
          </div>)}
        </div>}

        {/* Ativos para remover */}
        {carteirAnalise.ativos_remover?.length>0&&<div>
          <p style={{fontSize:12,fontWeight:700,color:D.red,marginBottom:6}}>➖ Considerar remover</p>
          {carteirAnalise.ativos_remover.map((a,i)=><div key={i} style={{padding:"8px 12px",background:D.red+"11",borderRadius:8,marginBottom:6,border:`1px solid ${D.red}33`}}>
            <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,fontWeight:700,color:D.red}}>{a.ticker}</span></div>
            <p style={{margin:"2px 0 0",fontSize:11,color:D.text3}}>{a.motivo}</p>
          </div>)}
        </div>}

        {/* Alocação ideal */}
        {carteirAnalise.alocacao_ideal?.length>0&&<div>
          <p style={{fontSize:12,fontWeight:700,color:D.text,marginBottom:8}}>📊 Alocação ideal</p>
          {carteirAnalise.alocacao_ideal.map((a,i)=><div key={i} style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
              <span style={{color:D.text2}}>{a.classe}</span>
              <span style={{color:D.text3}}>{a.pct_atual}% → <strong style={{color:D.green}}>{a.pct_ideal}%</strong></span>
            </div>
            <div style={{background:D.bg3,borderRadius:4,height:6,overflow:"hidden",display:"flex"}}>
              <div style={{width:a.pct_atual+"%",background:D.text3,height:6}}/>
              <div style={{width:Math.max(0,a.pct_ideal-a.pct_atual)+"%",background:D.green+"66",height:6}}/>
            </div>
          </div>)}
        </div>}

        <div style={{background:`linear-gradient(135deg,${D.bg3},${D.card2})`,borderRadius:10,padding:"12px 14px",border:`1px solid ${D.border2}`}}>
          <p style={{margin:"0 0 4px",fontSize:12,fontWeight:700,color:D.text}}>🎯 Plano de Ação</p>
          <p style={{margin:0,fontSize:12,color:D.text2,lineHeight:1.7}}>{carteirAnalise.conclusao}</p>
        </div>
      </div>}
    </Card>

    {/* Comparação com índice */}
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:indiceData?10:0}}>
        <p style={{fontSize:14,fontWeight:700,color:D.text,margin:0}}>📊 Carteira vs {nomeIndice(profileId)}</p>
        <Btn sm color={D.blue} outline onClick={comparaIndice} disabled={indiceLoading}>{indiceLoading?"Buscando...":"Comparar"}</Btn>
      </div>
      {indiceData&&!indiceData.erro&&<div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:130,background:D.bg3,borderRadius:8,padding:"10px 12px"}}>
            <p style={{margin:0,fontSize:10,color:D.text3,textTransform:"uppercase"}}>Minha carteira</p>
            <p style={{margin:"2px 0 0",fontSize:20,fontWeight:800,color:indiceData.rentCarteira>=0?D.green:D.red}}>{indiceData.rentCarteira>=0?"+":""}{indiceData.rentCarteira.toFixed(2)}%</p>
          </div>
          <div style={{flex:1,minWidth:130,background:D.bg3,borderRadius:8,padding:"10px 12px"}}>
            <p style={{margin:0,fontSize:10,color:D.text3,textTransform:"uppercase"}}>{indiceData.nomeIndice} (12m)</p>
            <p style={{margin:"2px 0 0",fontSize:20,fontWeight:800,color:indiceData.varIndice==null?D.text3:indiceData.varIndice>=0?D.green:D.red}}>{indiceData.varIndice==null?"—":`${indiceData.varIndice>=0?"+":""}${indiceData.varIndice.toFixed(2)}%`}</p>
          </div>
        </div>
        {indiceData.varIndice!=null&&<p style={{margin:"8px 0 0",fontSize:12,fontWeight:600,color:indiceData.rentCarteira>=indiceData.varIndice?D.green:D.gold}}>
          {indiceData.rentCarteira>=indiceData.varIndice?`✓ Sua carteira está ${(indiceData.rentCarteira-indiceData.varIndice).toFixed(1)} pontos acima do índice`:`Sua carteira está ${(indiceData.varIndice-indiceData.rentCarteira).toFixed(1)} pontos abaixo do índice`}
        </p>}
        <p style={{margin:"8px 0 0",fontSize:10,color:D.text3,lineHeight:1.5}}>⚠️ Comparação aproximada: rentabilidade total da sua carteira (desde a compra de cada ativo) vs variação do índice nos últimos 12 meses. As janelas de tempo diferem, então use como referência geral, não medida exata.</p>
      </div>}
      {indiceData?.erro&&<p style={{fontSize:12,color:D.red,marginTop:8}}>Não consegui buscar o índice agora. Tente novamente em instantes.</p>}
      {!indiceData&&<p style={{fontSize:12,color:D.text3,marginTop:8}}>Clique em "Comparar" para ver se sua carteira está rendendo mais que o {nomeIndice(profileId)}.</p>}
    </Card>

    {/* Watchlist */}
    <Card>
      <p style={{fontSize:14,fontWeight:700,color:D.text,marginBottom:4}}>Carteira de acompanhamento</p>
      {watchlist.length>0&&(()=>{
        const vs=watchlist.map(w=>w.variacao_dia).filter(v=>typeof v==="number");
        const media=vs.length?vs.reduce((a,b)=>a+b,0)/vs.length:null;
        return <p style={{margin:"0 0 8px",fontSize:11,color:D.text3}}>
          {wlUpd?`Atualizado ${wlUpd.toLocaleTimeString("pt-BR")} · auto a cada 30s`:"Atualizando…"}
          {media!=null&&<> · média do dia <b style={{color:media>=0?D.green:D.red}}>{media>=0?"▲":"▼"} {Math.abs(media).toFixed(2)}%</b> <span style={{color:D.text3}}>(peso igual)</span></>}
        </p>;
      })()}
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,fontSize:11,color:D.text3}}>
        <span>Preço teto: DY alvo de</span>
        <input type="number" value={dyAlvo} onChange={e=>{const v=parseFloat(e.target.value)||6;setDyAlvo(v);lsSet("dy_alvo",v);}} style={{width:54,padding:"3px 6px",fontSize:11}} min="1" max="20" step="0.5"/>
        <span>% (método Bazin — ajuste à sua estratégia)</span>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
        <input value={wInput} onChange={e=>setWInput(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&addWatch()} placeholder={isBR?"Ticker (ex: PETR4)...":"Ticker (ex: BHP.AX)..."} style={{flex:1,minWidth:100}}/>
        <select value={wCat} onChange={e=>setWCat(e.target.value)} style={{minWidth:130,flex:1}}><option value="">Categoria (auto)</option>{WL_CATS.filter(c=>c!=="Todas").map(c=><option key={c}>{c}</option>)}</select>
        <Btn onClick={addWatch} disabled={wLoading}>{wLoading?"Buscando...":"+ Add"}</Btn>
      </div>
      {watchlist.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:10}}>{cats.map(c=><button key={c} onClick={()=>setWFiltro(c)} style={{padding:"3px 10px",borderRadius:16,fontSize:11,cursor:"pointer",border:wFiltro===c?`1px solid ${D.green}`:`1px solid ${D.border}`,background:wFiltro===c?D.green+"22":"transparent",color:wFiltro===c?D.green:D.text3}}>{c}{c!=="Todas"?` (${watchlist.filter(w=>(w.categoria||"Outros")===c).length})`:""}</button>)}</div>}
      {wlFilt.length===0&&<p style={{fontSize:13,color:D.text3}}>Nenhum ativo.</p>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(145px,1fr))",gap:8}}>
        {wlFilt.map(w=><div key={w.ticker} style={{background:D.bg3,borderRadius:10,padding:"10px 12px",border:`1px solid ${D.border}`,position:"relative"}} onMouseEnter={e=>e.currentTarget.style.borderColor=D.green} onMouseLeave={e=>e.currentTarget.style.borderColor=D.border}>
          <button onClick={()=>setWatchlist(p=>p.filter(x=>x.ticker!==w.ticker))} style={{position:"absolute",top:5,right:6,border:"none",background:"none",cursor:"pointer",fontSize:11,color:D.text3}}>✕</button>
          <p onClick={()=>setChartTicker(w.ticker)} style={{margin:"0 0 2px",fontSize:13,fontWeight:700,color:D.green,cursor:"pointer"}}>{w.ticker}</p>
          <p style={{margin:"0 0 3px",fontSize:11,color:D.text3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{w.nome||"—"}</p>
          {w.categoria&&<div style={{marginBottom:4}}><Badge color={D.blue}>{w.categoria}</Badge></div>}
          <p style={{margin:"2px 0 2px",fontSize:15,fontWeight:700,color:D.text}}>{w.preco!=null?`${currency} ${Number(w.preco).toFixed(2)}`:"—"}</p>
          {w.variacao_dia!=null&&<p style={{margin:"0 0 4px",fontSize:11,fontWeight:600,color:w.variacao_dia>=0?D.green:D.red}}>{w.variacao_dia>=0?"▲":"▼"} {Math.abs(w.variacao_dia).toFixed(2)}%{typeof w.variacao_dia_abs==="number"?` (${w.variacao_dia_abs>=0?"+":"−"}${currency} ${Math.abs(w.variacao_dia_abs).toFixed(2)})`:""} hoje</p>}
          <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
            {w.pl!=null&&<Badge color={D.blue}>P/L {Number(w.pl).toFixed(1)}</Badge>}
            {w.dy!=null&&<Badge color={D.gold}>DY {Number(w.dy).toFixed(1)}%</Badge>}
          </div>
          {w.dy!=null&&w.dy>0&&w.preco!=null&&(()=>{
            const teto=w.preco*(w.dy/dyAlvo);
            const abaixo=w.preco<=teto;
            return <div style={{marginTop:5,padding:"4px 6px",borderRadius:6,background:abaixo?D.green+"18":D.red+"18",border:`1px solid ${abaixo?D.green:D.red}44`}}>
              <p style={{margin:0,fontSize:10,color:D.text3}}>Preço teto ({dyAlvo}% DY)</p>
              <p style={{margin:0,fontSize:12,fontWeight:700,color:abaixo?D.green:D.red}}>{currency} {teto.toFixed(2)} {abaixo?"✓ abaixo":"✗ acima"}</p>
            </div>;
          })()}
          {(()=>{
            const alerta=alertaDoTicker(w.ticker);
            const atingido=alertaAtingido(w.ticker,w.preco);
            if(alertaEdit===w.ticker)return <div style={{marginTop:6,padding:6,background:D.bg2,borderRadius:6}}>
              <div style={{display:"flex",gap:3,marginBottom:4}}>
                <button onClick={()=>setAlertaTipo("acima")} style={{flex:1,fontSize:9,padding:3,borderRadius:4,border:"none",cursor:"pointer",background:alertaTipo==="acima"?D.green:D.bg3,color:alertaTipo==="acima"?"#000":D.text3}}>≥ Acima</button>
                <button onClick={()=>setAlertaTipo("abaixo")} style={{flex:1,fontSize:9,padding:3,borderRadius:4,border:"none",cursor:"pointer",background:alertaTipo==="abaixo"?D.red:D.bg3,color:alertaTipo==="abaixo"?"#fff":D.text3}}>≤ Abaixo</button>
              </div>
              <input type="number" value={alertaPreco} onChange={e=>setAlertaPreco(e.target.value)} onKeyDown={e=>e.key==="Enter"&&salvarAlerta(w.ticker)} placeholder={`Preço (${currency})`} style={{fontSize:11,padding:"4px 6px",marginBottom:4,width:"100%"}} autoFocus/>
              <div style={{display:"flex",gap:3}}>
                <button onClick={()=>salvarAlerta(w.ticker)} style={{flex:1,fontSize:9,padding:3,borderRadius:4,border:"none",cursor:"pointer",background:D.green,color:"#000"}}>Salvar</button>
                <button onClick={()=>{setAlertaEdit(null);setAlertaPreco("");}} style={{flex:1,fontSize:9,padding:3,borderRadius:4,border:`1px solid ${D.border2}`,cursor:"pointer",background:"transparent",color:D.text3}}>Cancelar</button>
              </div>
            </div>;
            if(alerta)return <div style={{marginTop:6,display:"flex",alignItems:"center",gap:4,padding:"3px 6px",background:atingido?D.gold+"22":D.bg2,borderRadius:6,fontSize:10}}>
              <span style={{color:atingido?D.gold:D.text3}}>{atingido?"🔔":"🎯"} {alerta.tipo==="acima"?"≥":"≤"} {currency} {Number(alerta.preco).toFixed(2)}{atingido?" atingido!":""}</span>
              <button onClick={()=>removerAlerta(w.ticker)} style={{marginLeft:"auto",border:"none",background:"none",cursor:"pointer",color:D.red,fontSize:10}}>✕</button>
            </div>;
            return null;
          })()}
          <div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}}>
            <button onClick={()=>addToComp(w.ticker)} style={{flex:1,border:`1px solid ${D.blue}44`,background:"transparent",color:D.blue,borderRadius:5,padding:"2px 4px",fontSize:9,cursor:"pointer"}}>+ Comp</button>
            <button onClick={()=>gerarRelatorio(w.ticker)} style={{flex:1,border:`1px solid ${D.gold}44`,background:"transparent",color:D.gold,borderRadius:5,padding:"2px 4px",fontSize:9,cursor:"pointer"}}>📄 Rep.</button>
            {!alertaDoTicker(w.ticker)&&alertaEdit!==w.ticker&&<button onClick={()=>{setAlertaEdit(w.ticker);setAlertaPreco(w.preco?String(w.preco):"");setAlertaTipo("acima");}} style={{flex:1,border:`1px solid ${D.purple}44`,background:"transparent",color:D.purple,borderRadius:5,padding:"2px 4px",fontSize:9,cursor:"pointer"}}>🔔 Alerta</button>}
          </div>
        </div>)}
      </div>
    </Card>

    {/* Nota de risco */}
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <p style={{fontSize:14,fontWeight:700,color:D.text}}>⚖️ Nota de risco</p>
        <Btn sm color={D.purple} onClick={avaliarRisco} disabled={riscoLoading}>{riscoLoading?"Avaliando...":"Avaliar"}</Btn>
      </div>
      {notaRisco?<div>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
          <div style={{width:56,height:56,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:notaRisco.nota>=7?D.green+"22":notaRisco.nota>=4?D.gold+"22":D.red+"22",border:`2px solid ${notaRisco.nota>=7?D.green:notaRisco.nota>=4?D.gold:D.red}`,fontSize:18,fontWeight:700,color:notaRisco.nota>=7?D.green:notaRisco.nota>=4?D.gold:D.red}}>{notaRisco.nota}</div>
          <div><p style={{margin:0,fontSize:15,fontWeight:700,color:D.text}}>{notaRisco.perfil}</p><p style={{margin:"2px 0 0",fontSize:12,color:D.text3}}>{notaRisco.descricao}</p></div>
        </div>
        {notaRisco.riscos?.map((r,i)=><div key={i} style={{fontSize:12,color:D.text3,padding:"4px 10px",background:D.bg3,borderRadius:6,borderLeft:`2px solid ${D.gold}`,marginBottom:4}}>⚠️ {r}</div>)}
      </div>:<p style={{fontSize:12,color:D.text3}}>Clique "Avaliar" para análise de risco da carteira.</p>}
    </Card>

    {/* Comparador */}
    <Card>
      <p style={{fontSize:14,fontWeight:700,color:D.text,marginBottom:8}}>Comparador de ativos</p>
      <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
        <input value={compInput} onChange={e=>setCompInput(e.target.value.toUpperCase())} onKeyDown={e=>{if(e.key==="Enter"){const t=compInput.trim().toUpperCase();if(t&&!compList.includes(t))setCompList(p=>[...p,t]);setCompInput("");}}} placeholder={isBR?"Ticker (ex: ITUB4)...":"Ticker (ex: CBA.AX)..."} style={{flex:1}}/>
        <Btn sm color={D.purple} onClick={()=>{const t=compInput.trim().toUpperCase();if(t&&!compList.includes(t))setCompList(p=>[...p,t]);setCompInput("");}}>+ Add</Btn>
        <Btn sm onClick={compararAtivos} disabled={compLoading||compList.length<2}>{compLoading?"Comparando...":"Comparar"}</Btn>
        {compData.length>0&&<Btn sm color={D.red} outline onClick={()=>{setCompList([]);setCompData([]);}}>Limpar</Btn>}
      </div>
      {compList.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>{compList.map(t=><span key={t} style={{display:"flex",alignItems:"center",gap:4,background:D.blue+"22",color:D.blue,borderRadius:16,padding:"3px 10px",fontSize:12,fontWeight:600,border:`1px solid ${D.blue}44`}}>{t}<button onClick={()=>{setCompList(p=>p.filter(x=>x!==t));setCompData(p=>p.filter(x=>x.ticker!==t));}} style={{border:"none",background:"none",cursor:"pointer",color:D.blue,padding:0}}>✕</button></span>)}</div>}
      {compData.length>=2&&<div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:360}}>
          <thead><tr style={{background:D.bg3}}>
            <th style={{textAlign:"left",padding:"8px",borderBottom:`1px solid ${D.border}`,color:D.text3}}>Indicador</th>
            {compData.map(a=><th key={a.ticker} style={{textAlign:"right",padding:"8px",borderBottom:`1px solid ${D.border}`,color:D.green,fontWeight:700}}><div>{a.ticker}</div><div style={{fontSize:10,color:D.text3,fontWeight:400}}>{a.nome}</div></th>)}
          </tr></thead>
          <tbody>{IND_COMP.map((ind,ri)=><tr key={ind.key} style={{background:ri%2?D.bg3+"88":"transparent"}}>
            <td style={{padding:"7px 8px",color:D.text3}}>{ind.label}</td>
            {compData.map(a=>{const best=isBest(ind.key,a[ind.key],compData);return <td key={a.ticker} style={{padding:"7px 8px",textAlign:"right",fontWeight:best?700:400,color:best?D.green:D.text,background:best?D.green+"11":"transparent"}}>
              {ind.key==="preco"?ind.fmt(a[ind.key],currency):ind.fmt(a[ind.key])}{best?" ✓":""}
            </td>;})}
          </tr>)}</tbody>
        </table>
        <p style={{fontSize:10,color:D.text3,marginTop:4}}>✓ Verde = melhor valor · Moeda: {currency}</p>
      </div>}
    </Card>

    {/* Alertas — notícias reais */}
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <p style={{fontSize:14,fontWeight:700,color:D.text}}>🔔 Alertas e anúncios</p>
        <Btn sm onClick={fetchNews} disabled={newsLoading}>{newsLoading?"Buscando...":"Atualizar"}</Btn>
      </div>
      {Object.keys(news).length===0&&!newsLoading&&<p style={{fontSize:12,color:D.text3}}>Clique "Atualizar" para buscar notícias reais via Google News.</p>}
      {Object.entries(news).map(([ticker,noticias])=><div key={ticker} style={{marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <p style={{fontSize:13,fontWeight:700,color:D.green,margin:0}}>{ticker}</p>
          <Btn sm color={D.blue} outline onClick={()=>analisarImpactoNoticias(ticker,noticias)} disabled={newsImpactLoading}>
            {newsImpactLoading?"Analisando...":"📊 Impacto no preço"}
          </Btn>
        </div>

        {/* Análise de impacto */}
        {newsImpact[ticker]&&<div style={{marginBottom:8,padding:"10px 14px",background:D.bg3,borderRadius:10,border:`1px solid ${newsImpact[ticker].tendencia==="alta"?D.green+"44":newsImpact[ticker].tendencia==="baixa"?D.red+"44":D.border}`}}>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:6}}>
            <Badge color={newsImpact[ticker].tendencia==="alta"?D.green:newsImpact[ticker].tendencia==="baixa"?D.red:D.text3}>
              {newsImpact[ticker].tendencia==="alta"?"▲ Tendência Alta":newsImpact[ticker].tendencia==="baixa"?"▼ Tendência Baixa":"→ Lateral"}
            </Badge>
            <Badge color={newsImpact[ticker].confianca==="alta"?D.green:newsImpact[ticker].confianca==="media"?D.gold:D.text3}>Confiança {newsImpact[ticker].confianca}</Badge>
            <Badge color={newsImpact[ticker].acao_recomendada==="Comprar"?D.green:newsImpact[ticker].acao_recomendada==="Vender"?D.red:D.gold}>{newsImpact[ticker].acao_recomendada}</Badge>
            {newsImpact[ticker].preco_alvo_curto&&<Badge color={D.blue}>Alvo curto: {currency} {newsImpact[ticker].preco_alvo_curto}</Badge>}
          </div>
          <p style={{margin:"0 0 6px",fontSize:12,color:D.text2,lineHeight:1.6}}>{newsImpact[ticker].resumo_impacto}</p>
          {newsImpact[ticker].principais_catalisadores?.length>0&&<p style={{margin:"0 0 3px",fontSize:11,color:D.green}}>🚀 {newsImpact[ticker].principais_catalisadores.join(" · ")}</p>}
          {newsImpact[ticker].principais_riscos?.length>0&&<p style={{margin:0,fontSize:11,color:D.red}}>⚠️ {newsImpact[ticker].principais_riscos.join(" · ")}</p>}
        </div>}

        {noticias.length===0&&<p style={{fontSize:12,color:D.text3}}>Nenhuma notícia recente encontrada.</p>}
        {noticias.map((n,i)=>{
          const impactoCor=n.impacto==="positivo"?D.green:n.impacto==="negativo"?D.red:D.text3;
          return <div key={i} style={{background:D.bg3,borderRadius:8,padding:"8px 12px",marginBottom:6,borderLeft:`3px solid ${tipoLine[n.tipo]||D.text3}`}}>
            <div style={{display:"flex",gap:6,marginBottom:3,alignItems:"center",flexWrap:"wrap"}}>
              <span>{tipoIcons[n.tipo]||"📰"}</span>
              <a href={n.link} target="_blank" rel="noopener noreferrer" style={{fontSize:12,fontWeight:600,color:D.text,flex:1,textDecoration:"none",minWidth:0}}>{n.titulo}</a>
              <span style={{fontSize:10,background:impactoCor+"22",color:impactoCor,borderRadius:4,padding:"2px 6px",fontWeight:600,border:`1px solid ${impactoCor}44`,flexShrink:0}}>
                {n.impacto==="positivo"?"▲ Positivo":n.impacto==="negativo"?"▼ Negativo":"● Neutro"}
              </span>
              <span style={{fontSize:10,color:D.text3,flexShrink:0}}>{n.data}</span>
            </div>
            {n.resumo&&<p style={{margin:0,fontSize:12,color:D.text2}}>{n.resumo}</p>}
            {n.fonte&&<p style={{margin:"2px 0 0",fontSize:10,color:D.text3}}>Fonte: {n.fonte}</p>}
          </div>;
        })}
      </div>)}
    </Card>

    {/* Indicadores TradingView */}
    <Card>
      <p style={{fontSize:14,fontWeight:700,color:D.text,marginBottom:8}}>Indicadores fundamentalistas</p>
      <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
        <input value={fundInput} onChange={e=>setFundInput(e.target.value.toUpperCase())} onKeyDown={e=>{if(e.key==="Enter"){const t=fundInput.trim().toUpperCase();if(t){setFundSymbol(isBR&&!/\./.test(t)?"BMFBOVESPA:"+t:t);setFundTicker(t);setFundInput("");}}}} placeholder={isBR?"Ticker (ex: PETR4)...":"Ticker (ex: BHP.AX)..."} style={{flex:1}}/>
        <Btn onClick={()=>{const t=fundInput.trim().toUpperCase();if(t){setFundSymbol(isBR&&!/\./.test(t)?"BMFBOVESPA:"+t:t);setFundTicker(t);setFundInput("");}}}>Ver</Btn>
      </div>
      {watchlist.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>{watchlist.map(w=><button key={w.ticker} onClick={()=>{setFundSymbol(isBR&&!/\./.test(w.ticker)?"BMFBOVESPA:"+w.ticker:w.ticker);setFundTicker(w.ticker);}} style={{padding:"3px 10px",borderRadius:16,fontSize:11,cursor:"pointer",border:fundTicker===w.ticker?`1px solid ${D.green}`:`1px solid ${D.border}`,background:fundTicker===w.ticker?D.green+"22":"transparent",color:fundTicker===w.ticker?D.green:D.text3}}>{w.ticker}</button>)}</div>}
      <TVWidget type="financials" config={{symbol:fundSymbol,displayMode:"regular",width:"100%",height:490,locale:"pt_BR"}}/>
    </Card>

    {/* Screener */}
    <Card>
      <p style={{fontSize:14,fontWeight:700,color:D.text,marginBottom:6}}>Screener de ações</p>
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        <input value={screenerSearch} onChange={e=>setScreenerSearch(e.target.value.toUpperCase())} placeholder={`Buscar ticker (ex: ${isBR?"VALE3":"RIO.AX"})...`} style={{flex:1}}/>
        {screenerSearch&&<Btn sm color={D.text3} outline onClick={()=>setScreenerSearch("")}>Limpar</Btn>}
      </div>
      {screenerSearch?<TVWidget type="financials" config={{symbol:isBR&&!/\./.test(screenerSearch)?"BMFBOVESPA:"+screenerSearch:screenerSearch,displayMode:"regular",width:"100%",height:490,locale:"pt_BR"}}/>:<TVWidget type="screener" config={{width:"100%",height:490,defaultColumn:"overview",defaultScreen:"most_capitalized",market,showToolbar:true,locale:"pt_BR"}}/>}
    </Card>

    {/* Simulador */}
    <Card>
      <p style={{fontSize:14,fontWeight:700,color:D.text,marginBottom:10}}>Simular juros compostos</p>
      <label style={{fontSize:12,color:D.text3,display:"block",marginBottom:8}}>Tipo<select value={simForm.tipo} onChange={e=>setSimForm(f=>({...f,tipo:e.target.value}))} style={{marginTop:4}}><option value="fixo">Taxa fixa mensal</option><option value="pct">% de índice (ex: 102% CDI)</option><option value="mais">Índice + % (ex: IPCA+9%)</option></select></label>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:8,marginBottom:10}}>
        <label style={{fontSize:12,color:D.text3}}>Valor inicial<input type="number" value={simForm.ini} onChange={e=>setSimForm(f=>({...f,ini:e.target.value}))} style={{marginTop:4}}/></label>
        <label style={{fontSize:12,color:D.text3}}>Aporte mensal<input type="number" value={simForm.ap} onChange={e=>setSimForm(f=>({...f,ap:e.target.value}))} style={{marginTop:4}}/></label>
        {simForm.tipo!=="fixo"&&<label style={{fontSize:12,color:D.text3}}>Índice<select value={simForm.indice} onChange={e=>setSimForm(f=>({...f,indice:e.target.value}))} style={{marginTop:4}}>{INDICES_RF.filter(i=>i!=="Prefixado").map(i=><option key={i}>{i}</option>)}</select></label>}
        {simForm.tipo==="fixo"&&<label style={{fontSize:12,color:D.text3}}>Taxa mensal %<input type="number" value={simForm.taxa} onChange={e=>setSimForm(f=>({...f,taxa:e.target.value}))} style={{marginTop:4}}/></label>}
        {simForm.tipo==="pct"&&<label style={{fontSize:12,color:D.text3}}>% do índice<input type="number" value={simForm.pctInd} onChange={e=>setSimForm(f=>({...f,pctInd:e.target.value}))} placeholder="Ex: 102" style={{marginTop:4}}/></label>}
        {simForm.tipo==="mais"&&<label style={{fontSize:12,color:D.text3}}>Taxa adicional %<input type="number" value={simForm.taxa} onChange={e=>setSimForm(f=>({...f,taxa:e.target.value}))} placeholder="Ex: 9" style={{marginTop:4}}/></label>}
        <label style={{fontSize:12,color:D.text3}}>Período (meses)<input type="number" value={simForm.meses} onChange={e=>setSimForm(f=>({...f,meses:e.target.value}))} style={{marginTop:4}}/></label>
      </div>
      <Btn onClick={simJuros} color={D.gold}>Simular</Btn>
      {simRes&&<div style={{marginTop:12}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:8,marginBottom:12}}>
          <MetricCard label="Patrimônio bruto" value={fmtM(simRes.saldo,currency)} color={D.blue}/>
          <MetricCard label="Total aportado" value={fmtM(simRes.aportado,currency)}/>
          <MetricCard label="Juros ganhos" value={fmtM(simRes.juros,currency)} color={D.green}/>
          <MetricCard label="Imposto estimado" value={fmtM(simRes.imposto,currency)} color={D.red} sub={simRes.aliquota}/>
          <MetricCard label="Patrimônio líquido" value={fmtM(simRes.saldoLiq,currency)} color={D.green}/>
        </div>
        {simRes.pts.map((p,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,marginBottom:4}}>
          <span style={{minWidth:55,color:D.text3}}>Mês {p.mes}</span>
          <div style={{flex:1,background:D.bg3,borderRadius:4,height:7,overflow:"hidden"}}><div style={{width:Math.round(p.saldo/simRes.saldo*100)+"%",background:D.green,height:7,borderRadius:4}}/></div>
          <span style={{minWidth:90,textAlign:"right",fontWeight:600,color:D.text}}>{fmtM(p.saldo,currency)}</span>
        </div>)}
      </div>}
    </Card>

  </div>;
}


// ── Cartão Tab ────────────────────────────────────────────────────────────────
// ── Ciclo de fatura de cartão (datas testadas isolado, 14/14) ────────────────
// helpers de ciclo de fatura → src/calc.mjs

function CartaoTab({data,setData,currency,mes}){
  const hojeStr=new Date().toISOString().slice(0,10);
  const [histAberto,setHistAberto]=useState({});
  const sBanco=b=>{const txs=data.transacoes.filter(t=>t.bancoId===b.id);return(b.saldoInicial||0)+txs.filter(t=>t.tipo==="receita").reduce((a,x)=>a+x.valor,0)-txs.filter(t=>t.tipo==="despesa").reduce((a,x)=>a+x.valor,0);};
  const cartoes=data.bancos.filter(b=>b.tipo==="cartão").map(b=>{
    const saldo=sBanco(b), limite=b.limite||0, usado=Math.max(0,-saldo);
    const disp=limite>0?limite-usado:null, pct=limite>0?Math.min(100,usado/limite*100):0;
    const txs=data.transacoes.filter(t=>t.bancoId===b.id);
    const gastoMes=txs.filter(t=>{if(t.tipo!=="despesa")return false;const d=new Date(t.data);return d.getMonth()===mes&&d.getFullYear()===ANO_ATUAL;}).reduce((a,x)=>a+x.valor,0);
    const futuras=txs.filter(t=>t.tipo==="despesa"&&t.parceladoId&&t.data>hojeStr).reduce((a,x)=>a+x.valor,0);
    const diaFecha=b.diaFecha||null, diaVence=b.diaVence||null;
    let faturas=null;
    if(diaFecha){
      const grupos={};
      txs.filter(t=>t.tipo==="despesa").forEach(t=>{const k=_ymdC(faturaDeCompra(diaFecha,t.data));(grupos[k]=grupos[k]||[]).push(t);});
      const abertaK=_ymdC(faturaAbertaHoje(diaFecha,new Date()));
      if(!grupos[abertaK]) grupos[abertaK]=[];
      faturas=Object.keys(grupos).sort().map(k=>{
        const fechaDate=new Date(k+"T00:00:00");
        const venceDate=diaVence?vencimentoDe(fechaDate,diaFecha,diaVence):null;
        const total=grupos[k].reduce((a,x)=>a+x.valor,0);
        const status=k<abertaK?"anterior":k===abertaK?"aberta":"futura";
        return {k,fechaDate,venceDate,total,itens:grupos[k].slice().sort((a,b)=>a.data.localeCompare(b.data)),status};
      });
    }
    return {b,saldo,limite,usado,disp,pct,gastoMes,futuras,diaFecha,diaVence,faturas};
  });
  const totLimite=cartoes.reduce((a,c)=>a+c.limite,0);
  const totUsado=cartoes.reduce((a,c)=>a+c.usado,0);
  const totFuturas=cartoes.reduce((a,c)=>a+c.futuras,0);
  const faturasAntigas=data.faturas||[];

  return <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
    <Card>
      <p style={{fontSize:14,fontWeight:700,color:D.text,marginBottom:4}}>💳 Cartões</p>
      <p style={{fontSize:11,color:D.text3,lineHeight:1.5}}>Calculado dos seus lançamentos. Um banco aparece aqui quando você o marca como <b>Cartão de crédito</b> (na aba Bancos → editar → Tipo). Você lança compra por compra — sem fatura fechada.</p>
    </Card>

    {cartoes.length===0
      ? <Card><p style={{fontSize:13,color:D.text3}}>Nenhum cartão marcado ainda. Na aba <b>Bancos</b>, edite o banco que é cartão de crédito e mude o <b>Tipo</b> para <b>Cartão de crédito</b>. Contas com cheque especial não são cartão — deixe como Conta Corrente.</p></Card>
      : <>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10}}>
          <MetricCard label="Limite total" value={fmtM(totLimite,currency)} color={D.blue}/>
          <MetricCard label="Usado" value={fmtM(totUsado,currency)} color={D.red}/>
          <MetricCard label="Disponível" value={fmtM(totLimite-totUsado,currency)} color={totLimite-totUsado>=0?D.green:D.red}/>
          {totFuturas>0&&<MetricCard label="Parcelas futuras" value={fmtM(totFuturas,currency)} color={D.gold}/>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:10}}>
          {cartoes.map(c=><Card key={c.b.id} style={{border:`1px solid ${D.purple}33`}}>
            <p style={{margin:"0 0 8px",fontSize:14,fontWeight:700,color:D.purple}}>💳 {c.b.nome}</p>
            {c.limite>0?<>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}><span style={{color:D.text3}}>Usado</span><span style={{color:D.text,fontWeight:600}}>{fmtM(c.usado,currency)} / {fmtM(c.limite,currency)}</span></div>
              <div style={{background:D.bg3,borderRadius:5,height:8,overflow:"hidden",marginBottom:6}}><div style={{width:c.pct+"%",height:8,borderRadius:5,background:c.pct>90?D.red:c.pct>70?D.gold:D.green}}/></div>
              <p style={{margin:0,fontSize:13}}><span style={{color:D.text3}}>Disponível: </span><span style={{fontWeight:700,color:c.disp>=0?D.green:D.red}}>{fmtM(c.disp,currency)}</span></p>
            </>:<p style={{margin:0,fontSize:12,color:D.text3}}>Sem limite definido — saldo {fmtM(c.saldo,currency)}</p>}
            {c.faturas&&(()=>{
              const aberta=c.faturas.find(f=>f.status==="aberta");
              const futuras=c.faturas.filter(f=>f.status==="futura");
              const anteriores=c.faturas.filter(f=>f.status==="anterior").reverse();
              const exp=histAberto[c.b.id];
              return <div style={{marginTop:10,paddingTop:8,borderTop:`1px solid ${D.border}`}}>
                {aberta&&<div style={{background:D.bg3,borderRadius:8,padding:"8px 10px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                    <span style={{fontSize:11,color:D.text3,fontWeight:600}}>FATURA ABERTA</span>
                    <span style={{fontSize:18,fontWeight:800,color:D.gold}}>{fmtM(aberta.total,currency)}</span>
                  </div>
                  <p style={{margin:"2px 0 0",fontSize:11,color:D.text3}}>fecha {_ddmm(aberta.fechaDate)}{aberta.venceDate?` · vence ${_ddmm(aberta.venceDate)}`:""}</p>
                </div>}
                {futuras.length>0&&<div style={{marginBottom:6}}>
                  <p style={{margin:"0 0 4px",fontSize:11,color:D.text3,fontWeight:600}}>Próximas faturas</p>
                  {futuras.map(f=><div key={f.k} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}>
                    <span style={{color:D.text3}}>{MESES[f.fechaDate.getMonth()]}/{f.fechaDate.getFullYear()}{f.venceDate?` · vence ${_ddmm(f.venceDate)}`:""}</span>
                    <span style={{color:D.text2,fontWeight:600}}>{fmtM(f.total,currency)}</span>
                  </div>)}
                </div>}
                {anteriores.length>0&&<>
                  <button onClick={()=>setHistAberto(h=>({...h,[c.b.id]:!h[c.b.id]}))} style={{border:"none",background:"none",cursor:"pointer",fontSize:11,color:D.blue,padding:0}}>{exp?"▼":"▶"} Faturas anteriores ({anteriores.length})</button>
                  {exp&&<div style={{marginTop:4}}>
                    {anteriores.map(f=><div key={f.k} style={{fontSize:12,padding:"3px 0",borderBottom:`1px solid ${D.border}`,display:"flex",justifyContent:"space-between"}}>
                      <span style={{color:D.text3}}>{MESES[f.fechaDate.getMonth()]}/{f.fechaDate.getFullYear()}{f.venceDate?` · venceu ${_ddmm(f.venceDate)}`:""}</span>
                      <span style={{color:D.text2,fontWeight:600}}>{fmtM(f.total,currency)}</span>
                    </div>)}
                    <p style={{margin:"6px 0 0",fontSize:10,color:D.text3,lineHeight:1.4}}>Agrupamento das mesmas compras que já contam no "Usado" — não é dívida extra. O app não marca fatura como paga.</p>
                  </div>}
                </>}
              </div>;
            })()}
            {!c.diaFecha&&<p style={{margin:"8px 0 0",fontSize:11,color:D.text3,lineHeight:1.4}}>💡 Configure <b>fecha dia</b> e <b>vence dia</b> na aba Bancos (editar este cartão) para ver as faturas por ciclo.</p>}
            <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8,fontSize:11,color:D.text3,marginTop:10,paddingTop:8,borderTop:`1px solid ${D.border}`}}>
              <span>Gasto no mês: <b style={{color:D.text2}}>{fmtM(c.gastoMes,currency)}</b></span>
              {c.futuras>0&&<span>Parcelas a vir: <b style={{color:D.gold}}>{fmtM(c.futuras,currency)}</b></span>}
            </div>
          </Card>)}
        </div>
      </>}

    {faturasAntigas.length>0&&<Card>
      <p style={{fontSize:12,fontWeight:600,color:D.text3,marginBottom:4}}>📁 Faturas antigas (recurso aposentado)</p>
      <p style={{fontSize:11,color:D.text3,marginBottom:8,lineHeight:1.5}}>Agora você lança item por item. Estes são registros do modelo antigo de fatura fechada — pode apagar se não precisar mais.</p>
      {faturasAntigas.map(f=><div key={f.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,padding:"5px 0",borderBottom:`1px solid ${D.border}`}}>
        <span style={{color:D.text2}}>{f.cartao||"Cartão"} · {fmtM(f.valor,currency)}{f.vencimento?` · ${f.vencimento}`:""}</span>
        <button onClick={()=>setData(d=>({...d,faturas:d.faturas.filter(x=>x.id!==f.id)}))} style={{border:"none",background:"none",cursor:"pointer",fontSize:12,color:D.red}}>🗑</button>
      </div>)}
    </Card>}
  </div>;
}

// ── Motor de recorrência: decide se/quando lançar (testado em isolado) ────────
// Retorna a data "YYYY-MM-DD" a lançar, ou null. Lança no máx. 1 ocorrência por
// carga do app (não preenche retroativamente vários períodos perdidos).
function proximoLancamentoRec(rec, datasLancadas, hojeD){
  const freq = rec.frequencia || "mensal";
  const pad = n => String(n).padStart(2,"0");
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const parse = s => new Date(s+"T00:00:00");
  const datas = (datasLancadas||[]).slice().sort();
  const ultima = datas.length ? datas[datas.length-1] : null;

  if(freq==="semanal"){
    const alvoWd = (rec.diaSemana!=null ? +rec.diaSemana : 1); // 0=Dom..6=Sáb
    const inicioSemana = new Date(hojeD); inicioSemana.setHours(0,0,0,0);
    inicioSemana.setDate(hojeD.getDate()-hojeD.getDay()); // domingo desta semana
    const jaNestaSemana = datas.some(d=> parse(d) >= inicioSemana);
    if(jaNestaSemana) return null;
    const alvo = new Date(inicioSemana); alvo.setDate(inicioSemana.getDate()+alvoWd);
    const hojeZero = new Date(hojeD); hojeZero.setHours(0,0,0,0);
    if(hojeZero < alvo) return null;
    return ymd(alvo);
  }
  if(freq==="quinzenal"){
    // a cada 2 semanas, ancorado num dia da semana (ex: financiamento toda 2ª segunda)
    const alvoWd = (rec.diaSemana!=null ? +rec.diaSemana : 1);
    const inicioSemana = new Date(hojeD); inicioSemana.setHours(0,0,0,0);
    inicioSemana.setDate(hojeD.getDate()-hojeD.getDay());
    const alvo = new Date(inicioSemana); alvo.setDate(inicioSemana.getDate()+alvoWd);
    const hojeZero = new Date(hojeD); hojeZero.setHours(0,0,0,0);
    if(hojeZero < alvo) return null;              // ainda não chegou o dia-alvo desta semana
    if(!ultima) return ymd(alvo);                 // 1ª vez: ancora nesta semana
    const diff = Math.round((alvo.getTime() - parse(ultima).getTime())/86400000);
    if(diff>0 && diff%14===0) return ymd(alvo);   // só nas semanas alternadas (14, 28, ...)
    return null;
  }
  // mensal (padrão e legado)
  const dia = rec.dia || 1;
  const mAtual=hojeD.getMonth(), aAtual=hojeD.getFullYear();
  const jaNesteMes = datas.some(d=>{const x=parse(d);return x.getMonth()===mAtual&&x.getFullYear()===aAtual;});
  if(jaNesteMes) return null;
  if(hojeD.getDate() < dia) return null;
  return `${aAtual}-${pad(mAtual+1)}-${pad(dia)}`;
}

// ── Relatórios Tab ────────────────────────────────────────────────────────────
function RelatoriosTab({data,setData,currency}){
  const [periodo,setPeriodo]=useState("mes:"+MES_ATUAL);  // "mes:<0-11>" | "ano" | "tudo"
  const [bancoFiltro,setBancoFiltro]=useState("");         // "" = todos
  const [tipoFiltro,setTipoFiltro]=useState("");           // "" = ambos
  const [catFiltro,setCatFiltro]=useState("");             // "" = todas
  const [dDe,setDDe]=useState("");const [dAte,setDAte]=useState("");  // intervalo de datas
  const [aiResult,setAiResult]=useState(null);
  const [aiLoading,setAiLoading]=useState(false);
  const [aiErro,setAiErro]=useState("");

  const nomeBanco=id=>data.bancos.find(b=>b.id===id)?.nome||"—";

  const txs=(data.transacoes||[]).filter(t=>{
    const d=new Date(t.data);
    if(periodo.startsWith("mes:")){const m=+periodo.split(":")[1];if(d.getMonth()!==m||d.getFullYear()!==ANO_ATUAL)return false;}
    else if(periodo==="ano"){if(d.getFullYear()!==ANO_ATUAL)return false;}
    else if(periodo==="intervalo"){if(dDe&&t.data<dDe)return false;if(dAte&&t.data>dAte)return false;}
    if(bancoFiltro&&t.bancoId!==bancoFiltro)return false;
    if(tipoFiltro&&t.tipo!==tipoFiltro)return false;
    if(catFiltro&&t.categoria!==catFiltro)return false;
    return true;
  }).sort((a,b)=>b.data.localeCompare(a.data));

  const {receitas:totR,despesas:totD}=totaisTransacoes(txs); // testado em calc.mjs (exclui categorias internas)

  const porCat={};
  txs.filter(t=>t.tipo==="despesa").forEach(t=>{porCat[t.categoria]=(porCat[t.categoria]||0)+(t.valor||0);});
  const catList=Object.entries(porCat).map(([cat,v])=>({cat,v})).sort((a,b)=>b.v-a.v);

  const porBanco={};
  txs.forEach(t=>{const k=t.bancoId||"sem";if(!porBanco[k])porBanco[k]={r:0,d:0};porBanco[k][t.tipo==="receita"?"r":"d"]+=(t.valor||0);});
  const bancoList=Object.entries(porBanco).map(([id,o])=>({nome:id==="sem"?"Sem banco":nomeBanco(id),...o}));

  const labelPeriodo=periodo.startsWith("mes:")?`${MESES[+periodo.split(":")[1]]} ${ANO_ATUAL}`:periodo==="ano"?`Ano ${ANO_ATUAL}`:periodo==="intervalo"?`${dDe||"início"} a ${dAte||"hoje"}`:"Todo o histórico";
  const catsDisponiveis=[...new Set((data.transacoes||[]).map(t=>t.categoria).filter(Boolean))].sort((a,b)=>a.localeCompare(b));

  // ── IA: "Como uso meu dinheiro" — números calculados aqui no JS, IA só interpreta ──
  const ESSENCIAIS_PADRAO=["Moradia","Saúde","Alimentação","Educação"];
  const catFlags=data.catFlags||{};
  const flagDe=cat=>catFlags[cat]||(ESSENCIAIS_PADRAO.includes(cat)?"essencial":"cortar");
  function setFlag(cat,flag){setData(d=>({...d,catFlags:{...(d.catFlags||{}),[cat]:flag}}));}
  const mesesSet=new Set(txs.map(t=>(t.data||"").slice(0,7)).filter(Boolean));
  const nMeses=Math.max(1,mesesSet.size);
  const rendaMensal=totR/nMeses, despMensal=totD/nMeses;
  const catAnalise=catList.map(c=>{const mensal=c.v/nMeses;return {cat:c.cat,mensal,anual:mensal*12,pctRenda:rendaMensal>0?mensal/rendaMensal*100:null,flag:flagDe(c.cat)};});

  async function analisarIA(){
    if(aiLoading)return;
    setAiLoading(true);setAiErro("");setAiResult(null);
    try{
      const linhasCat=catAnalise.map(c=>`- ${c.cat}: ${fmtM(c.mensal,currency)}/mês (≈ ${fmtM(c.anual,currency)}/ano)${c.pctRenda!=null?` = ${c.pctRenda.toFixed(0)}% da renda`:""} [${c.flag==="essencial"?"ESSENCIAL — nao sugerir corte":"pode cortar"}]`).join("\n");
      const metasTxt=(data.metas||[]).length?data.metas.map(m=>`- ${m.nome}: objetivo ${fmtM(m.objetivo||0,currency)}, ja guardado ${fmtM(m.atual||0,currency)}`).join("\n"):"Nenhuma meta cadastrada.";
      const prompt=`Voce e um consultor financeiro pessoal falando em portugues do Brasil, tom acolhedor e honesto, linguagem simples.\n\nREGRAS:\n- Os numeros abaixo JA ESTAO CALCULADOS. Use EXATAMENTE esses valores. NUNCA recalcule, some ou invente numeros.\n- NUNCA sugira cortar categorias marcadas como ESSENCIAL.\n- "Desperdicio" sao SUGESTOES a confirmar, nao acusacoes.\n\nDados (media mensal do periodo "${labelPeriodo}", base de ${nMeses} ${nMeses>1?"meses":"mes"}):\nRenda mensal: ${fmtM(rendaMensal,currency)}\nDespesas mensais: ${fmtM(despMensal,currency)}\nSobra por mes: ${fmtM(rendaMensal-despMensal,currency)}\n\nGastos por categoria:\n${linhasCat}\n\nMetas de poupanca:\n${metasTxt}\n\nEscreva EXATAMENTE 4 secoes com estes titulos, nada antes nem depois:\n\n💬 Como voce usa seu dinheiro\n(2-4 frases sobre o peso das categorias na renda, em linguagem simples.)\n\n🔍 Candidatos a desperdicio\n(2-4 categorias 'pode cortar' que parecem altas, citando o valor por mes e por ano que eu ja te dei. Deixe claro que e sugestao a confirmar, nao acusacao.)\n\n💡 Ajustes sem perder qualidade de vida\n(Sugestoes concretas so nas categorias 'pode cortar'. Respeite as essenciais.)\n\n🎯 Plano de quanto guardar\n(Um valor realista por mes pra guardar e como dividir entre as metas acima. Sem metas, sugira comecar uma reserva de emergencia.)\n\nMaximo ~320 palavras. Sem tabelas.`;
      const txt=await askClaude(prompt,1100);
      setAiResult(txt||"Não veio resposta. Tente de novo.");
    }catch(e){setAiErro("Não consegui gerar a análise agora. Tente de novo em instantes.");}
    setAiLoading(false);
  }

  function baixarCSV(){
    const sep=";";
    const esc=s=>`"${String(s==null?"":s).replace(/"/g,'""')}"`;
    const numBR=n=>(n||0).toFixed(2).replace(".",",");
    const linhas=[["Data","Tipo","Descrição","Categoria","Banco","Valor"].join(sep)];
    txs.forEach(t=>{linhas.push([t.data,t.tipo==="receita"?"Receita":"Despesa",esc(t.descricao),esc(t.categoria),esc(nomeBanco(t.bancoId)),numBR(t.valor)].join(sep));});
    linhas.push("");
    linhas.push([esc("TOTAL RECEITAS"),"","","","",numBR(totR)].join(sep));
    linhas.push([esc("TOTAL DESPESAS"),"","","","",numBR(totD)].join(sep));
    linhas.push([esc("SALDO"),"","","","",numBR(totR-totD)].join(sep));
    const conteudo="\ufeff"+linhas.join("\r\n"); // BOM p/ Excel ler acentos
    const blob=new Blob([conteudo],{type:"text/csv;charset=utf-8;"});
    const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download=`relatorio_${labelPeriodo.replace(/\s/g,"_")}.csv`;a.click();URL.revokeObjectURL(u);
  }

  function imprimir(){
    const escH=s=>String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const linhasTx=txs.map(t=>`<tr><td>${t.data}</td><td>${t.tipo==="receita"?"Receita":"Despesa"}</td><td>${escH(t.descricao)}</td><td>${escH(t.categoria)}</td><td>${escH(nomeBanco(t.bancoId))}</td><td style="text-align:right;color:${t.tipo==="receita"?"#0a7d3b":"#b91c1c"};font-variant-numeric:tabular-nums">${t.tipo==="receita"?"+":"−"}${fmtM(t.valor,currency)}</td></tr>`).join("");
    const linhasCat=catList.map(c=>`<tr><td>${escH(c.cat)}</td><td style="text-align:right">${fmtM(c.v,currency)}</td></tr>`).join("");
    const logoURL=`${location.origin}/logo.svg`;
    const metaLinha=`Gerado em ${new Date().toLocaleString("pt-BR")}${bancoFiltro?` · Banco: ${escH(nomeBanco(bancoFiltro))}`:""}${tipoFiltro?` · ${tipoFiltro==="receita"?"Só receitas":"Só despesas"}`:""}${catFiltro?` · Categoria: ${escH(catFiltro)}`:""}`;
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Relatório ${labelPeriodo}</title>
<style>
*{box-sizing:border-box}
body{font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;color:#1f2937;margin:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:12px;line-height:1.5}
.wrap{max-width:840px;margin:0 auto;padding:40px 40px 48px}
.lh{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:14px;border-bottom:2px solid #0a7d3b}
.lh .brand{display:flex;align-items:center;gap:12px}
.lh img{width:42px;height:42px;border-radius:9px}
.lh .nm{font-size:16px;font-weight:800;letter-spacing:.3px;color:#111}
.lh .tg{font-size:10px;color:#6b7280;letter-spacing:.5px;text-transform:uppercase;margin-top:1px}
.lh .doc{text-align:right}
.lh .doc .l1{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#0a7d3b;font-weight:700}
.lh .doc .l2{font-size:18px;font-weight:800;color:#111;margin-top:2px}
.meta{font-size:10px;color:#9ca3af;margin:8px 0 0}
.summary{display:flex;margin:24px 0;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden}
.summary .c{flex:1;padding:12px 16px;border-right:1px solid #e5e7eb}
.summary .c:last-child{border-right:none}
.summary .lbl{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px}
.summary .val{font-size:17px;font-weight:800;margin-top:3px;font-variant-numeric:tabular-nums}
h2{font-size:11px;margin:28px 0 8px;color:#111;text-transform:uppercase;letter-spacing:.8px;font-weight:700;display:flex;align-items:center;gap:7px}
h2:before{content:"";width:9px;height:9px;background:#0a7d3b;border-radius:2px;display:inline-block}
table{width:100%;border-collapse:collapse;font-size:11.5px}
th{text-align:left;padding:7px 10px;font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;border-bottom:1.5px solid #111}
td{padding:6px 10px;border-bottom:1px solid #f0f1f3}
tbody tr:nth-child(even){background:#fafbfc}
.ft{margin-top:34px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:9.5px;color:#9ca3af;display:flex;justify-content:space-between}
@page{margin:14mm}
</style></head><body>
<div class="wrap">
<div class="lh">
  <div class="brand"><img id="lg" src="${logoURL}" alt=""><div><div class="nm">Controle Financeiro</div><div class="tg">Gestão de finanças pessoais</div></div></div>
  <div class="doc"><div class="l1">Relatório financeiro</div><div class="l2">${labelPeriodo}</div></div>
</div>
<div class="meta">${metaLinha}</div>
<div class="summary">
  <div class="c"><div class="lbl">Receitas</div><div class="val" style="color:#0a7d3b">${fmtM(totR,currency)}</div></div>
  <div class="c"><div class="lbl">Despesas</div><div class="val" style="color:#b91c1c">${fmtM(totD,currency)}</div></div>
  <div class="c"><div class="lbl">Saldo do período</div><div class="val" style="color:${totR-totD>=0?'#0a7d3b':'#b91c1c'}">${fmtM(totR-totD,currency)}</div></div>
</div>
<h2>Despesas por categoria</h2><table><thead><tr><th>Categoria</th><th style="text-align:right">Total</th></tr></thead><tbody>${linhasCat||'<tr><td colspan="2">Sem despesas no período</td></tr>'}</tbody></table>
<h2>Lançamentos (${txs.length})</h2><table><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Banco</th><th style="text-align:right">Valor</th></tr></thead><tbody>${linhasTx||'<tr><td colspan="6">Nenhum lançamento</td></tr>'}</tbody></table>
<div class="ft"><span>Controle Financeiro</span><span>Documento gerado em ${new Date().toLocaleDateString("pt-BR")}</span></div>
</div>
<script>window.addEventListener('load',function(){var img=document.getElementById('lg');function go(){window.print();}if(img&&!img.complete){img.addEventListener('load',go);img.addEventListener('error',go);setTimeout(go,800);}else{setTimeout(go,250);}});</script>
</body></html>`;
    const w=window.open("","_blank");
    if(!w){alert("Permita pop-ups neste site para gerar o relatório em PDF.");return;}
    w.document.write(html);w.document.close();
  }

  return <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
    <Card>
      <p style={{fontSize:14,fontWeight:700,color:D.text,marginBottom:10}}>📄 Relatórios</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8}}>
        <label style={{fontSize:11,color:D.text3}}>Período
          <select value={periodo} onChange={e=>setPeriodo(e.target.value)} style={{marginTop:4}}>
            {MESES.map((m,i)=><option key={i} value={"mes:"+i}>{m} {ANO_ATUAL}</option>)}
            <option value="ano">Ano {ANO_ATUAL} (todos os meses)</option>
            <option value="intervalo">Intervalo de datas…</option>
            <option value="tudo">Todo o histórico</option>
          </select>
        </label>
        {periodo==="intervalo"&&<>
          <label style={{fontSize:11,color:D.text3}}>De<input type="date" value={dDe} onChange={e=>setDDe(e.target.value)} style={{marginTop:4}}/></label>
          <label style={{fontSize:11,color:D.text3}}>Até<input type="date" value={dAte} onChange={e=>setDAte(e.target.value)} style={{marginTop:4}}/></label>
        </>}
        <label style={{fontSize:11,color:D.text3}}>Banco
          <select value={bancoFiltro} onChange={e=>setBancoFiltro(e.target.value)} style={{marginTop:4}}>
            <option value="">Todos</option>
            {data.bancos.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
        </label>
        <label style={{fontSize:11,color:D.text3}}>Tipo
          <select value={tipoFiltro} onChange={e=>setTipoFiltro(e.target.value)} style={{marginTop:4}}>
            <option value="">Receitas + Despesas</option>
            <option value="receita">Só receitas</option>
            <option value="despesa">Só despesas</option>
          </select>
        </label>
        <label style={{fontSize:11,color:D.text3}}>Categoria
          <select value={catFiltro} onChange={e=>setCatFiltro(e.target.value)} style={{marginTop:4}}>
            <option value="">Todas</option>
            {catsDisponiveis.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
        <Btn color={D.green} onClick={baixarCSV} sm>⬇️ Baixar CSV (Excel)</Btn>
        <Btn color={D.blue} outline sm onClick={imprimir}>🖨 Imprimir / PDF</Btn>
      </div>
    </Card>

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10}}>
      <MetricCard label="Receitas" value={fmtM(totR,currency)} color={D.green}/>
      <MetricCard label="Despesas" value={fmtM(totD,currency)} color={D.red}/>
      <MetricCard label="Saldo" value={fmtM(totR-totD,currency)} color={totR-totD>=0?D.green:D.red}/>
    </div>

    {catList.length>0&&<Card>
      <p style={{fontSize:13,fontWeight:700,color:D.text,marginBottom:8}}>Despesas por categoria</p>
      {catList.map(c=>{const pct=totD>0?(c.v/totD*100):0;return <div key={c.cat} style={{marginBottom:8}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}><span style={{color:D.text2}}>{c.cat}</span><span style={{fontWeight:600,color:D.text}}>{fmtM(c.v,currency)} <span style={{color:D.text3,fontWeight:400}}>({pct.toFixed(0)}%)</span></span></div>
        <div style={{background:D.bg3,borderRadius:4,height:5,overflow:"hidden"}}><div style={{width:pct+"%",background:D.red,height:5,borderRadius:4}}/></div>
      </div>;})}
    </Card>}

    <Card>
      <p style={{fontSize:13,fontWeight:700,color:D.text,marginBottom:4}}>🤖 Como uso meu dinheiro</p>
      <p style={{fontSize:11,color:D.text3,marginBottom:10,lineHeight:1.5}}>A IA explica seus gastos e sugere onde dá pra economizar. Os números são calculados pelo app — a IA só interpreta. Marque o que é <b style={{color:D.green}}>essencial</b> pra ela não sugerir cortar.</p>
      {catAnalise.length===0
        ? <p style={{fontSize:12,color:D.text3}}>Sem despesas neste período. Escolha um mês com lançamentos lá em cima.</p>
        : <>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
            {catAnalise.map(c=><div key={c.cat} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
              <span style={{fontSize:12,color:D.text2,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.cat} <span style={{color:D.text3}}>· {fmtM(c.mensal,currency)}/mês</span></span>
              <div style={{display:"flex",gap:4,flexShrink:0}}>
                <button onClick={()=>setFlag(c.cat,"essencial")} style={{fontSize:10,padding:"3px 8px",borderRadius:6,border:`1px solid ${c.flag==="essencial"?D.green:D.border}`,background:c.flag==="essencial"?D.green:"transparent",color:c.flag==="essencial"?"#06281d":D.text3,cursor:"pointer",fontWeight:600}}>Essencial</button>
                <button onClick={()=>setFlag(c.cat,"cortar")} style={{fontSize:10,padding:"3px 8px",borderRadius:6,border:`1px solid ${c.flag==="cortar"?D.gold:D.border}`,background:c.flag==="cortar"?D.gold:"transparent",color:c.flag==="cortar"?"#2a1d00":D.text3,cursor:"pointer",fontWeight:600}}>Pode cortar</button>
              </div>
            </div>)}
          </div>
          <Btn color={D.purple} sm onClick={analisarIA} disabled={aiLoading}>{aiLoading?"Analisando…":"🤖 Analisar com IA"}</Btn>
          {aiErro&&<p style={{fontSize:12,color:D.red,marginTop:10}}>{aiErro}</p>}
          {aiResult&&<div style={{marginTop:12,padding:12,background:D.bg3,borderRadius:8,border:`1px solid ${D.border}`}}>
            <p style={{whiteSpace:"pre-wrap",fontSize:12.5,lineHeight:1.6,color:D.text,margin:0}}>{aiResult}</p>
            <p style={{fontSize:10,color:D.text3,marginTop:10,marginBottom:0}}>⚠️ Sugestões geradas por IA a partir dos seus números. Confira antes de decidir.</p>
          </div>}
        </>}
    </Card>

    {bancoList.length>0&&<Card>
      <p style={{fontSize:13,fontWeight:700,color:D.text,marginBottom:8}}>Movimentação por banco</p>
      {bancoList.map((b,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:i<bancoList.length-1?`1px solid ${D.border}`:"none",fontSize:12}}>
        <span style={{color:D.text2}}>🏦 {b.nome}</span>
        <div style={{display:"flex",gap:12}}><span style={{color:D.green}}>+{fmtM(b.r,currency)}</span><span style={{color:D.red}}>-{fmtM(b.d,currency)}</span></div>
      </div>)}
    </Card>}

    <Card>
      <p style={{fontSize:13,fontWeight:700,color:D.text,marginBottom:8}}>Lançamentos do período ({txs.length})</p>
      {txs.length===0&&<p style={{fontSize:12,color:D.text3}}>Nenhum lançamento com esses filtros.</p>}
      {txs.map(t=><div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${D.border}`,fontSize:12}}>
        <div style={{minWidth:0,flex:1}}><p style={{margin:0,color:D.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.descricao}</p><p style={{margin:0,fontSize:10,color:D.text3}}>{t.categoria} · {t.data} · {nomeBanco(t.bancoId)}</p></div>
        <span style={{fontWeight:700,color:t.tipo==="receita"?D.green:D.red,flexShrink:0,marginLeft:8}}>{t.tipo==="receita"?"+":"-"}{fmtM(t.valor,currency)}</span>
      </div>)}
    </Card>
  </div>;
}

// ── Error Boundary: mostra o erro na tela em vez de tela branca ───────────────
class ErrorBoundary extends Component{
  constructor(props){super(props);this.state={erro:null,info:null};}
  static getDerivedStateFromError(erro){return{erro};}
  componentDidCatch(erro,info){this.setState({info});try{console.error("App crash:",erro,info);}catch{}}
  render(){
    if(this.state.erro){
      const msg=this.state.erro?.message||String(this.state.erro);
      const stack=this.state.info?.componentStack||this.state.erro?.stack||"";
      return <div style={{minHeight:"100vh",background:"#0a0e1a",color:"#f1f5f9",padding:"24px",fontFamily:"system-ui,sans-serif"}}>
        <div style={{maxWidth:680,margin:"0 auto"}}>
          <h2 style={{color:"#ff4757",fontSize:18}}>⚠️ Ocorreu um erro no app</h2>
          <p style={{color:"#94a3b8",fontSize:13,marginTop:8}}>Os seus dados estão seguros. Tente o "Modo seguro" abaixo — ele recarrega o app numa tela simples. Se não resolver, tire um print desta tela e envie.</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",margin:"12px 0"}}>
            <button onClick={()=>{try{location.reload();}catch{}}} style={{padding:"10px 16px",background:"#00d084",color:"#000",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer"}}>🔄 Recarregar</button>
            <button onClick={()=>{try{localStorage.setItem("active_profile","br");localStorage.setItem("force_tab","0");location.reload();}catch{}}} style={{padding:"10px 16px",background:"#3b82f6",color:"#fff",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer"}}>🛡️ Modo seguro</button>
          </div>
          <pre style={{whiteSpace:"pre-wrap",wordBreak:"break-word",background:"#111827",border:"1px solid #1e2d4a",borderRadius:8,padding:"12px",fontSize:11,color:"#f59e0b",marginTop:8}}>{msg}</pre>
          <pre style={{whiteSpace:"pre-wrap",wordBreak:"break-word",background:"#111827",border:"1px solid #1e2d4a",borderRadius:8,padding:"12px",fontSize:10,color:"#64748b",marginTop:8,maxHeight:300,overflow:"auto"}}>{stack}</pre>
        </div>
      </div>;
    }
    return this.props.children;
  }
}

// ── App Principal ─────────────────────────────────────────────────────────────
function AppInner(){
  const [session,setSession]=useState(()=>lsGet("session"));
  // Mantém o token vivo enquanto o app está aberto (o access dura ~1h; renova a cada 45 min)
  useEffect(()=>{
    if(!session?.refresh)return;
    const iv=setInterval(async()=>{const ns=await renovarSessao();if(ns)setSession(ns);},45*60*1000);
    return ()=>clearInterval(iv);
  },[session?.refresh]);
  const [allData,setAllData]=useState(()=>lsGet("all_profiles")||EMPTY_ALL);
  const [syncing,setSyncing]=useState(false);
  const [profileId,setProfileId]=useState(()=>lsGet("active_profile")||"br");
  const [tab,setTab]=useState(0);
  const [mes,setMes]=useState(MES_ATUAL);
  const [grafico,setGrafico]=useState("barras");
  const [modalSal,setModalSal]=useState(false);const [salForm,setSalForm]=useState({});
  const [modalTransf,setModalTransf]=useState(false);const [transfForm,setTransfForm]=useState({});
  const [catDet,setCatDet]=useState(null); // {cat,tipo} aberto no gráfico de pizza
  const saveTimer=useRef(null);
  const importRef=useRef(null);
  // Trava de segurança: só permite salvar no Supabase DEPOIS de carregar com sucesso.
  // Evita que uma leitura falha (ex: Supabase acordando da pausa) sobrescreva dados bons com vazio.
  const loadOk=useRef(false);
  const [syncErro,setSyncErro]=useState(false);
  const [cambio,setCambio]=useState(null);          // {brl,usd,aud} valor de cada moeda em BRL
  const [moedaCons,setMoedaCons]=useState(()=>lsGet("moeda_cons")||"BRL"); // moeda de exibição do consolidado
  const [cambioErro,setCambioErro]=useState(false);

  // Busca câmbio uma vez ao entrar (e quando pedir)
  async function carregarCambio(){
    setCambioErro(false);
    try{
      const r=await fetch(`${WORKER}/cambio`);
      const d=await r.json();
      if(d&&d.usd&&d.aud){setCambio(d);}else{setCambioErro(true);}
    }catch{setCambioErro(true);}
  }
  useEffect(()=>{if(session)carregarCambio();},[session]);

  // Patrimônio de UM perfil na sua própria moeda
  function patrimonioPerfil(pid){
    const d=allData[pid]||{};
    const bancos=Array.isArray(d.bancos)?d.bancos:[];
    const txs=Array.isArray(d.transacoes)?d.transacoes:[];
    const invs=Array.isArray(d.investimentos)?d.investimentos:[];
    const totB=bancos.reduce((a,b)=>{const t=txs.filter(x=>x.bancoId===b.id);return a+(b.saldoInicial||0)+t.filter(x=>x.tipo==="receita").reduce((s,x)=>s+x.valor,0)-t.filter(x=>x.tipo==="despesa").reduce((s,x)=>s+x.valor,0);},0);
    const totI=invs.reduce((a,b)=>a+(b.valorAtual||b.valorInvestido||b.valor||0),0);
    return totB+totI;
  }

  // Converte um valor da moeda de origem para a moeda de destino usando o câmbio (base BRL)
  const converte=(valor,de,para)=>converteMoeda(valor,de,para,cambio); // testado em calc.mjs

  // Patrimônio consolidado dos 3 perfis na moeda escolhida
  function patrimonioConsolidado(){
    if(!cambio)return null;
    let total=0;
    for(const p of PROFILES){total+=converte(patrimonioPerfil(p.id),p.id,moedaCons)||0;}
    return total;
  }

  useEffect(()=>{
    if(!session) return;
    loadOk.current=false;
    setSyncErro(false);
    (async()=>{
      setSyncing(true);
      try{
        // Garante token fresco antes de carregar (o access dura ~1h)
        let sess=session;
        if(session.refresh){const ns=await renovarSessao();if(ns){sess=ns;setSession(ns);}}
        let r;
        try{r=await supa.load(sess.token,sess.user.id);}
        catch(e){
          if(e?.status===401){const ns=await renovarSessao();if(!ns)throw e;sess=ns;setSession(ns);r=await supa.load(ns.token,ns.user.id);}
          else throw e;
        }
        if(r){
          // Carregou dados da nuvem com sucesso → libera o salvamento
          setAllData(r);
          lsSet("all_profiles",r);
          loadOk.current=true;
        }else{
          // load retornou null = conta sem dados na nuvem.
          // Se há dados locais com conteúdo real, faz um "upload" inicial seguro
          // (envia o local para a nuvem) em vez de só liberar o save.
          const local=lsGet("all_profiles");
          const temConteudo=local&&Object.values(local).some(p=>p&&((p.transacoes?.length)||(p.investimentos?.length)||(p.bancos?.length)));
          loadOk.current=true;
          if(temConteudo){
            try{await salvarComRetry(session.user.id,local);}catch{}
          }
        }
      }catch{
        // Leitura falhou (Supabase fora/instável). NÃO libera salvamento,
        // mantém os dados locais e avisa o usuário — nada é sobrescrito.
        setSyncErro(true);
        loadOk.current=false;
      }
      setSyncing(false);
    })();
  },[session?.token]);

  // Transferência entre países: cria as duas pernas (e a taxa) de uma vez,
  // nos DOIS perfis, com a mesma proteção do setData (loadOk + save debounced).
  function fazerTransferencia(){
    const de=transfForm.de,para=transfForm.para;
    const vEnv=parseFloat(transfForm.valorEnviado)||0;
    const vRec=parseFloat(transfForm.valorRecebido)||0;
    const taxa=parseFloat(transfForm.taxa)||0;
    if(!de||!para||de===para){alert("Escolha países de origem e destino diferentes.");return;}
    if(vEnv<=0||vRec<=0){alert("Preencha o valor enviado e o valor recebido.");return;}
    const dt=transfForm.data||hoje.toISOString().slice(0,10);
    const labelDe=PROFILES.find(p=>p.id===de)?.label||de;
    const labelPara=PROFILES.find(p=>p.id===para)?.label||para;
    const obs=transfForm.descricao?` — ${transfForm.descricao}`:"";
    const transfId=uid();
    setAllData(all=>{
      const pDe={...(all[de]||{...EMPTY})},pPara={...(all[para]||{...EMPTY})};
      const txsDe=[...(pDe.transacoes||[]),
        {id:uid(),tipo:"despesa",descricao:`Transf. → ${labelPara}${obs}`,valor:vEnv,categoria:"Transferência",data:dt,bancoId:transfForm.bancoDe||null,transfId},
        ...(taxa>0?[{id:uid(),tipo:"despesa",descricao:`Taxa de remessa → ${labelPara}`,valor:taxa,categoria:"Câmbio",data:dt,bancoId:transfForm.bancoDe||null,transfId}]:[])];
      const txsPara=[...(pPara.transacoes||[]),
        {id:uid(),tipo:"receita",descricao:`Transf. ← ${labelDe}${obs}`,valor:vRec,categoria:"Transferência",data:dt,bancoId:transfForm.bancoPara||null,transfId}];
      const updated={...all,[de]:{...pDe,transacoes:txsDe},[para]:{...pPara,transacoes:txsPara}};
      lsSet("all_profiles",updated);
      if(session&&loadOk.current){
        clearTimeout(saveTimer.current);
        saveTimer.current=setTimeout(()=>salvarComRetry(session.user.id,updated).catch(()=>{}),1500);
      }
      return updated;
    });
    setModalTransf(false);setTransfForm({});
  }

  function setData(upd){setAllData(all=>{
    const prev=all[profileId]||{...EMPTY};
    const next=typeof upd==="function"?upd(prev):{...prev,...upd};
    const updated={...all,[profileId]:next};
    lsSet("all_profiles",updated);
    // Só envia ao Supabase se a leitura inicial tiver dado certo (loadOk).
    // Assim nunca salvamos vazio por cima de dados bons quando a nuvem está fora.
    if(session&&loadOk.current){
      clearTimeout(saveTimer.current);
      saveTimer.current=setTimeout(()=>salvarComRetry(session.user.id,updated).catch(()=>{}),1500);
    }
    return updated;
  });}
  function handleLogin(t,u,rt){const s={token:t,user:u,refresh:rt||null};setSession(s);lsSet("session",s);}
  async function handleLogout(){
    // Logout local imediato — não trava se o Supabase estiver fora
    try{ if(session) supa.signOut(session.token).catch(()=>{}); }catch{}
    setSession(null);lsSet("session",null);
  }
  useEffect(()=>{lsSet("active_profile",profileId);setTab(0);},[profileId]);

  useEffect(()=>{
    if(!session)return;
    const prof=allData[profileId];
    if(!prof||!prof.recorrencias?.length)return;
    const hojeD=new Date();
    prof.recorrencias.forEach(rec=>{
      const datasLancadas=(prof.transacoes||[]).filter(t=>t.recorrenciaId===rec.id).map(t=>t.data);
      const dataLanc=proximoLancamentoRec(rec,datasLancadas,hojeD);
      if(dataLanc){setData(d=>({...d,transacoes:[...d.transacoes,{id:uid(),tipo:rec.tipo,descricao:rec.descricao,valor:rec.valor,categoria:rec.categoria,data:dataLanc,bancoId:rec.bancoId||null,recorrenciaId:rec.id}]}));}
    });
  },[profileId,session]);

  const snapDone=useRef(false);
  useEffect(()=>{
    snapDone.current=false;
  },[profileId]);
  useEffect(()=>{
    if(!session||snapDone.current)return;
    const prof=allData[profileId];
    if(!prof)return;
    const t=setTimeout(()=>{
      if(snapDone.current)return;
      const p=allData[profileId];if(!p)return;
      const hojeD=new Date();
      const mesKey=`${hojeD.getFullYear()}-${String(hojeD.getMonth()+1).padStart(2,"0")}`;
      const tB=(p.bancos||[]).reduce((acc,b)=>{const txs=(p.transacoes||[]).filter(t=>t.bancoId===b.id);return acc+(b.saldoInicial||0)+txs.filter(t=>t.tipo==="receita").reduce((a,x)=>a+x.valor,0)-txs.filter(t=>t.tipo==="despesa").reduce((a,x)=>a+x.valor,0);},0);
      const tI=(p.investimentos||[]).reduce((a,b)=>a+(b.valorAtual||b.valorInvestido||b.valor||0),0);
      const pat=Math.round((tB+tI)*100)/100;
      const hist=p.historico||[];
      const existente=hist.find(h=>h.mes===mesKey);
      if(existente&&Math.abs((existente.patrimonio||0)-pat)<0.01){snapDone.current=true;return;}
      const novoHist=[...hist.filter(h=>h.mes!==mesKey),{mes:mesKey,patrimonio:pat,bancos:Math.round(tB*100)/100,investimentos:Math.round(tI*100)/100}].sort((a,b)=>a.mes.localeCompare(b.mes)).slice(-24);
      setData(d=>({...d,historico:novoHist}));
      snapDone.current=true;
    },3000);
    return()=>clearTimeout(t);
  },[profileId,session]);

  function exportar(){const p={version:4,exportedAt:new Date().toISOString(),all_profiles:allData,watchlist_br:lsGet("watchlist_br")||[],watchlist_au:lsGet("watchlist_au")||[]};const b=new Blob([JSON.stringify(p,null,2)],{type:"application/json"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=`financas_${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(u);}
  function importar(e){const file=e.target.files[0];if(!file)return;const r=new FileReader();r.onload=ev=>{try{const p=JSON.parse(ev.target.result);if(!p.all_profiles){alert("Arquivo inválido.");return;}if(!window.confirm("Substituir todos os dados?"))return;lsSet("all_profiles",p.all_profiles);if(p.watchlist_br)lsSet("watchlist_br",p.watchlist_br);if(p.watchlist_au)lsSet("watchlist_au",p.watchlist_au);setAllData(p.all_profiles);if(session)salvarComRetry(session.user.id,p.all_profiles).catch(()=>{});alert("✅ Dados restaurados!");}catch{alert("Arquivo inválido.");}};r.readAsText(file);e.target.value="";}

  if(!session)return <><style>{GS}</style><LoginScreen onLogin={handleLogin}/></>;

  const profile=PROFILES.find(p=>p.id===profileId);
  const currency=profile.currency;
  // Mescla com EMPTY e SANITIZA: garante que campos que devem ser array sejam array,
  // mesmo se vierem corrompidos do localStorage/nuvem. Evita crash de renderização.
  const data=(()=>{
    const raw={...EMPTY,...(allData[profileId]||{})};
    const arrayFields=["transacoes","faturas","investimentos","metas","bancos","orcamentos","recorrencias","dividendos","proventosAgendados","watchlist","alertas","historico","catD","catR"];
    for(const f of arrayFields){ if(!Array.isArray(raw[f])) raw[f]=Array.isArray(EMPTY[f])?[...EMPTY[f]]:[]; }
    if(typeof raw.aporteMensal!=="number") raw.aporteMensal=0;
    return raw;
  })();
  const catD=data.catD.length?data.catD:CAT_D_DEF,catR=data.catR.length?data.catR:CAT_R_DEF;

  const txMes=data.transacoes.filter(t=>{const d=new Date(t.data);return d.getMonth()===mes&&d.getFullYear()===ANO_ATUAL;});
  const {receitas:totR,despesas:totD}=totaisTransacoes(txMes); // testado em calc.mjs (exclui categorias internas)
  const totInv=data.investimentos.reduce((a,b)=>a+(b.valorAtual||b.valorInvestido||b.valor||0),0);
  function saldoBanco(b){return saldoBancoCalc(b,data.transacoes);} // testado em calc.mjs
  const totBancos=data.bancos.reduce((a,b)=>a+saldoBanco(b),0);
  const patrimonioLiq=totBancos+totInv;
  const tiposI=TIPOS_INV.map(t=>({t,v:data.investimentos.filter(i=>i.tipo===t).reduce((a,b)=>a+(b.valorAtual||b.valorInvestido||b.valor||0),0)})).filter(x=>x.v>0);
  const ultimos6=Array.from({length:6},(_,i)=>{const d=new Date(ANO_ATUAL,MES_ATUAL-5+i,1),m=d.getMonth(),a=d.getFullYear();const txs=data.transacoes.filter(t=>{const td=new Date(t.data);return td.getMonth()===m&&td.getFullYear()===a&&!CAT_INTERNAS.includes(t.categoria);});const tt=totaisTransacoes(txs);return{label:MESES[m],r:tt.receitas,d:tt.despesas};});
  let acc=0;const lineData=ultimos6.map(d=>{acc+=d.r-d.d;return{label:d.label,v:acc};});
  const catPieD=catD.map((c,i)=>({label:c,cat:c,v:txMes.filter(t=>t.tipo==="despesa"&&t.categoria===c).reduce((a,b)=>a+b.valor,0),color:CORES[i%CORES.length]})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v);
  const catPieR=catR.map((c,i)=>({label:c,cat:c,v:txMes.filter(t=>t.tipo==="receita"&&t.categoria===c).reduce((a,b)=>a+b.valor,0),color:CORES[i%CORES.length]})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v);

  return <>
    <style>{GS}</style>
    <div style={{maxWidth:780,margin:"0 auto",padding:"0.75rem 1rem 4rem",minHeight:"100vh"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem",flexWrap:"wrap",gap:8,padding:"0.75rem 1rem",background:D.card,borderRadius:14,border:`1px solid ${D.border}`,position:"sticky",top:8,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <img src="/logo.svg" alt="logo" style={{width:34,height:34,borderRadius:9,filter:`drop-shadow(0 0 8px ${D.green}66)`}}/>
          <div><p style={{margin:0,fontSize:15,fontWeight:800,color:D.text}}>Controle Financeiro</p>{syncing&&<p style={{margin:0,fontSize:10,color:D.green}}>● sincronizando...</p>}{!syncing&&syncErro&&<p style={{margin:0,fontSize:10,color:D.gold}}>⚠ sem conexão com a nuvem — alterações não estão sendo salvas online</p>}</div>
        </div>
        <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
          {PROFILES.map(p=>{const aberto=mercadoAberto(p.id);const corBola=aberto===true?D.green:aberto===false?D.text3:"transparent";return <button key={p.id} onClick={()=>setProfileId(p.id)} title={aberto===true?"Mercado aberto":aberto===false?"Mercado fechado":""} style={{padding:"5px 12px",borderRadius:20,fontSize:12,cursor:"pointer",fontWeight:profileId===p.id?700:400,background:profileId===p.id?D.green:"transparent",color:profileId===p.id?"#000":D.text3,border:`1px solid ${profileId===p.id?D.green:D.border}`,display:"inline-flex",alignItems:"center",gap:6}}><span style={{width:7,height:7,borderRadius:"50%",background:corBola,boxShadow:aberto===true?`0 0 5px ${D.green}`:"none",flexShrink:0}}/>{p.label}</button>;})}
          <div style={{width:1,height:20,background:D.border}}/>
          <button onClick={exportar} style={{padding:"5px 10px",borderRadius:16,fontSize:11,cursor:"pointer",background:"transparent",border:`1px solid ${D.border}`,color:D.text3}}>⬇️</button>
          <button onClick={()=>importRef.current.click()} style={{padding:"5px 10px",borderRadius:16,fontSize:11,cursor:"pointer",background:"transparent",border:`1px solid ${D.border}`,color:D.text3}}>⬆️</button>
          <input ref={importRef} type="file" accept=".json" onChange={importar} style={{display:"none"}}/>
          <button onClick={handleLogout} style={{padding:"5px 10px",borderRadius:16,fontSize:11,cursor:"pointer",background:D.red+"22",border:`1px solid ${D.red}44`,color:D.red}}>Sair</button>
        </div>
      </div>

      <div style={{display:"flex",gap:2,marginBottom:"1.25rem",background:D.card,borderRadius:12,padding:4,border:`1px solid ${D.border}`,overflowX:"auto"}}>
        {TABS.map((t,i)=><button key={t} onClick={()=>setTab(i)} style={{padding:"7px 11px",borderRadius:9,fontSize:11,cursor:"pointer",border:"none",background:tab===i?D.green:"transparent",color:tab===i?"#000":D.text3,fontWeight:tab===i?700:400,whiteSpace:"nowrap",flexShrink:0}}>{t}</button>)}
      </div>

      {(tab===0||tab===2||tab===3)&&<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:"1rem"}}>
        <span style={{fontSize:12,color:D.text3}}>Mês:</span>
        <select value={mes} onChange={e=>setMes(+e.target.value)} style={{width:"auto",padding:"5px 10px"}}>{MESES.map((m,i)=><option key={m} value={i}>{m} {ANO_ATUAL}</option>)}</select>
      </div>}

      {tab===0&&<div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
        <Card glow style={{background:`linear-gradient(135deg,${D.bg3},${D.card2})`,border:`1px solid ${D.green}33`}}>
          <p style={{fontSize:10,color:D.text3,textTransform:"uppercase",letterSpacing:"1px",marginBottom:6}}>Patrimônio Líquido Total</p>
          <p style={{fontSize:34,fontWeight:800,color:D.green,textShadow:`0 0 20px ${D.green}66`}}>{fmtM(patrimonioLiq,currency)}</p>
          <p style={{fontSize:11,color:D.text3,marginTop:4}}>Bancos + Investimentos</p>
        </Card>

        {(()=>{const cons=patrimonioConsolidado();const simbolo={BRL:"R$",AUD:"A$",USD:"US$"}[moedaCons];return <Card style={{border:`1px solid ${D.blue}33`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:6}}>
            <p style={{fontSize:10,color:D.text3,textTransform:"uppercase",letterSpacing:"1px",margin:0}}>🌍 Patrimônio Consolidado (3 países)</p>
            <div style={{display:"flex",gap:4,alignItems:"center"}}>
              {["BRL","AUD","USD"].map(m=><button key={m} onClick={()=>{setMoedaCons(m);lsSet("moeda_cons",m);}} style={{padding:"3px 9px",borderRadius:14,fontSize:10,cursor:"pointer",border:`1px solid ${moedaCons===m?D.blue:D.border}`,background:moedaCons===m?D.blue+"22":"transparent",color:moedaCons===m?D.blue:D.text3,fontWeight:moedaCons===m?700:400}}>{({BRL:"R$",AUD:"A$",USD:"US$"})[m]}</button>)}
              <button onClick={()=>{setTransfForm({de:profileId,para:PROFILES.find(p=>p.id!==profileId)?.id,data:hoje.toISOString().slice(0,10)});setModalTransf(true);}} style={{padding:"3px 10px",borderRadius:14,fontSize:10,cursor:"pointer",border:`1px solid ${D.green}55`,background:D.green+"15",color:D.green,fontWeight:700}}>💱 Transferir</button>
            </div>
          </div>
          {cambioErro&&!cambio&&<p style={{fontSize:13,color:D.gold}}>⚠ Câmbio indisponível agora. <button onClick={carregarCambio} style={{color:D.blue,background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>Tentar de novo</button></p>}
          {!cambioErro&&!cambio&&<p style={{fontSize:13,color:D.text3}}>Carregando câmbio...</p>}
          {cons!=null&&<>
            <p style={{fontSize:30,fontWeight:800,color:D.blue,textShadow:`0 0 18px ${D.blue}55`}}>{fmtM(cons,simbolo)}</p>
            <div style={{display:"flex",flexDirection:"column",gap:3,marginTop:8}}>
              {PROFILES.map(p=>{const v=patrimonioPerfil(p.id);const conv=converte(v,p.id,moedaCons);return <div key={p.id} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:D.text3}}>
                <span>{p.label} <span style={{color:D.text3}}>({fmtM(v,p.currency)})</span></span>
                <span style={{color:D.text2}}>{conv!=null?fmtM(conv,simbolo):"—"}</span>
              </div>;})}
            </div>
            <p style={{fontSize:9,color:D.text3,marginTop:8,fontStyle:"italic"}}>Estimativa — converte pelo câmbio atual, que varia ao longo do dia. {cambio?.atualizado?`Câmbio de ${new Date(cambio.atualizado).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}`:""} · <button onClick={carregarCambio} style={{color:D.blue,background:"none",border:"none",cursor:"pointer",textDecoration:"underline",fontSize:9}}>atualizar</button></p>
          </>}
        </Card>;})()}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10}}>
          <MetricCard label="Receitas" value={fmtM(totR,currency)} color={D.green}/>
          <MetricCard label="Despesas" value={fmtM(totD,currency)} color={D.red}/>
          <MetricCard label="Saldo Bancos" value={fmtM(totBancos,currency)} color={totBancos>=0?D.green:D.red}/>
          <MetricCard label="Investimentos" value={fmtM(totInv,currency)} color={D.blue}/>
        </div>
        <Card><ScoreCard data={data}/></Card>
        <ProventosRadar data={data} currency={currency}/>
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
            <Tip text={GRAF_HELP[grafico]}><p style={{fontSize:14,fontWeight:700,color:D.text}}>Evolução financeira</p></Tip>
            <div style={{display:"flex",gap:3}}>
              {[["barras","📊"],["patrimonio","💰"],["pizza_d","🥧D"],["pizza_r","🥧R"],["linha","📈"]].map(([v,l])=><button key={v} onClick={()=>setGrafico(v)} style={{padding:"4px 10px",borderRadius:16,fontSize:11,cursor:"pointer",border:grafico===v?`1px solid ${D.green}`:`1px solid ${D.border}`,background:grafico===v?D.green+"22":"transparent",color:grafico===v?D.green:D.text3}}>{l}</button>)}
            </div>
          </div>
          {grafico==="barras"&&<BarChart data={ultimos6} currency={currency}/>}
          {grafico==="patrimonio"&&(()=>{
            const mesKeyAtual=`${ANO_ATUAL}-${String(MES_ATUAL+1).padStart(2,"0")}`;
            const h=[...(data.historico||[]).filter(x=>x.mes!==mesKeyAtual),{mes:mesKeyAtual,patrimonio:patrimonioLiq}].sort((a,b)=>a.mes.localeCompare(b.mes)).slice(-12);
            if(h.length<2)return <p style={{fontSize:12,color:D.text3,padding:"20px 0",textAlign:"center"}}>📊 O histórico de patrimônio aparece aqui conforme você usa o app ao longo dos meses. Precisa de pelo menos 2 meses de dados (o app registra automaticamente 1x por mês).</p>;
            const pts=h.map(x=>{const[a,m]=x.mes.split("-");return{label:MESES[parseInt(m)-1],v:x.patrimonio};});
            const prim=h[0].patrimonio,ult=h[h.length-1].patrimonio;
            const variacao=prim>0?((ult-prim)/prim*100):0;
            return <div>
              <div style={{display:"flex",gap:12,marginBottom:10,flexWrap:"wrap"}}>
                <div><p style={{margin:0,fontSize:10,color:D.text3,textTransform:"uppercase"}}>Atual</p><p style={{margin:0,fontSize:18,fontWeight:700,color:D.green}}>{fmtM(ult,currency)}</p></div>
                <div><p style={{margin:0,fontSize:10,color:D.text3,textTransform:"uppercase"}}>Variação período</p><p style={{margin:0,fontSize:18,fontWeight:700,color:variacao>=0?D.green:D.red}}>{variacao>=0?"▲":"▼"} {Math.abs(variacao).toFixed(1)}%</p></div>
              </div>
              <LineChart data={pts} currency={currency}/>
            </div>;
          })()}
          {grafico==="pizza_d"&&<PieChart slices={catPieD} currency={currency} onSlice={p=>setCatDet(prev=>prev&&prev.cat===p.cat&&prev.tipo==="despesa"?null:{cat:p.cat,tipo:"despesa"})}/>}
          {grafico==="pizza_r"&&<PieChart slices={catPieR} currency={currency} onSlice={p=>setCatDet(prev=>prev&&prev.cat===p.cat&&prev.tipo==="receita"?null:{cat:p.cat,tipo:"receita"})}/>}
          {(grafico==="pizza_d"||grafico==="pizza_r")&&catDet&&catDet.tipo===(grafico==="pizza_d"?"despesa":"receita")&&(()=>{
            const itens=txMes.filter(t=>t.tipo===catDet.tipo&&(t.categoria||"")===catDet.cat).sort((a,b)=>(b.data||"").localeCompare(a.data||""));
            const tot=itens.reduce((a,t)=>a+(t.valor||0),0);
            return <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${D.border}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <span style={{fontSize:12,fontWeight:700,color:D.text}}>{catDet.cat} · {itens.length} lançamento{itens.length!==1?"s":""}</span>
                <button onClick={()=>setCatDet(null)} style={{border:"none",background:"none",cursor:"pointer",color:D.text3,fontSize:14}}>✕</button>
              </div>
              {itens.length===0?<p style={{fontSize:12,color:D.text3}}>Nada neste mês.</p>:itens.map(t=><div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${D.border}`,gap:8}}>
                <div style={{flex:1,minWidth:0}}>
                  <p style={{margin:0,fontSize:12,color:D.text}}>{t.descricao||"(sem descrição)"}</p>
                  <p style={{margin:"1px 0 0",fontSize:10,color:D.text3}}>{t.data}{t.bancoId?` · ${(data.bancos.find(b=>b.id===t.bancoId)||{}).nome||""}`:""}</p>
                </div>
                <span style={{fontSize:13,fontWeight:700,color:catDet.tipo==="despesa"?D.red:D.green}}>{fmtM(t.valor||0,currency)}</span>
              </div>)}
              <div style={{display:"flex",justifyContent:"space-between",marginTop:6,fontSize:11,color:D.text3}}><span>Total {catDet.cat} no mês</span><span style={{fontWeight:700,color:D.text2}}>{fmtM(tot,currency)}</span></div>
            </div>;
          })()}
          {grafico==="linha"&&<LineChart data={lineData} currency={currency}/>}
        </Card>
        {data.orcamentos?.length>0&&(()=>{
          const sal=data.salario;
          const salMensal=sal?salarioMensal(sal.valor,sal.freq):0; // testado em calc.mjs
          const orcTotal=data.orcamentos.reduce((a,o)=>a+(o.valor||0),0);
          const gastoOrcadas=data.orcamentos.reduce((a,o)=>a+txMes.filter(t=>t.tipo==="despesa"&&t.categoria===o.categoria).reduce((s,t)=>s+t.valor,0),0);
          const linhas=data.orcamentos.map(o=>{const gasto=txMes.filter(t=>t.tipo==="despesa"&&t.categoria===o.categoria).reduce((a,t)=>a+t.valor,0);const pctReal=o.valor>0?gasto/o.valor*100:0;return {o,gasto,pctReal,resta:o.valor-gasto};}).sort((a,b)=>b.pctReal-a.pctReal);
          const sobra=salMensal-totD;
          return <Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <p style={{fontSize:13,fontWeight:700,color:D.text,margin:0}}>🎯 Orçamento</p>
              <button onClick={()=>{setSalForm(sal?{valor:sal.valor,freq:sal.freq}:{freq:"semanal"});setModalSal(true);}} style={{border:"none",background:"none",cursor:"pointer",fontSize:11,color:D.blue}}>{salMensal>0?"✏️ salário":"+ definir salário"}</button>
            </div>
            {salMensal>0&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:8,marginBottom:12}}>
              <div style={{background:D.bg3,borderRadius:8,padding:"8px 10px"}}><p style={{margin:0,fontSize:10,color:D.text3}}>SALÁRIO/MÊS</p><p style={{margin:"2px 0 0",fontSize:15,fontWeight:700,color:D.text}}>{fmtM(salMensal,currency)}</p></div>
              <div style={{background:D.bg3,borderRadius:8,padding:"8px 10px"}}><p style={{margin:0,fontSize:10,color:D.text3}}>GASTO REAL (MÊS)</p><p style={{margin:"2px 0 0",fontSize:15,fontWeight:700,color:totD/salMensal>0.9?D.red:totD/salMensal>0.7?D.gold:D.text}}>{fmtM(totD,currency)}</p><p style={{margin:0,fontSize:10,color:D.text3}}>{Math.round(totD/salMensal*100)}% do salário</p></div>
              <div style={{background:D.bg3,borderRadius:8,padding:"8px 10px"}}><p style={{margin:0,fontSize:10,color:D.text3}}>SOBRA / POUPANÇA</p><p style={{margin:"2px 0 0",fontSize:15,fontWeight:700,color:sobra>=0?D.green:D.red}}>{fmtM(sobra,currency)}</p><p style={{margin:0,fontSize:10,color:D.text3}}>{Math.round(sobra/salMensal*100)}% do salário</p></div>
            </div>}
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:D.text3,marginBottom:4}}>
              <span>Orçado: <b style={{color:D.text2}}>{fmtM(orcTotal,currency)}</b>{salMensal>0?` · ${Math.round(orcTotal/salMensal*100)}% do salário`:""}</span>
              <span>gasto nas orçadas: <b style={{color:D.text2}}>{fmtM(gastoOrcadas,currency)}</b></span>
            </div>
            <div style={{background:D.bg3,borderRadius:4,height:6,overflow:"hidden",marginBottom:12}}><div style={{width:Math.min(100,orcTotal>0?gastoOrcadas/orcTotal*100:0)+"%",height:6,background:gastoOrcadas>orcTotal?D.red:D.green}}/></div>
            {linhas.map(({o,gasto,pctReal,resta})=>{const pct=Math.min(100,pctReal);const cor=pctReal>90?D.red:pctReal>70?D.gold:D.green;return <div key={o.id} style={{marginBottom:10}}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}><span style={{color:D.text2}}>{o.categoria}</span><span style={{color:cor,fontWeight:600}}>{fmtM(gasto,currency)} / {fmtM(o.valor,currency)}</span></div><div style={{background:D.bg3,borderRadius:4,height:5,overflow:"hidden"}}><div style={{width:pct+"%",background:cor,height:5,borderRadius:4}}/></div><div style={{display:"flex",justifyContent:"space-between",marginTop:2}}><span style={{fontSize:10,color:resta<0?D.red:D.text3}}>{resta<0?`⚠️ estourou ${fmtM(-resta,currency)}`:`resta ${fmtM(resta,currency)}`}</span><span style={{fontSize:10,color:D.text3}}>{Math.round(pctReal)}%</span></div></div>;})}
          </Card>;
        })()}
        {data.bancos.length>0&&<Card><p style={{fontSize:13,fontWeight:700,color:D.text,marginBottom:8}}>Bancos</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8}}>{data.bancos.map(b=>{const s=saldoBanco(b);return <div key={b.id} style={{background:D.bg3,borderRadius:10,padding:"10px 14px"}}><p style={{margin:0,fontSize:11,color:D.blue,fontWeight:600}}>🏦 {b.nome}</p><p style={{margin:"4px 0 0",fontSize:17,fontWeight:700,color:s>=0?D.green:D.red}}>{fmtM(s,currency)}</p></div>;})}</div></Card>}
        {tiposI.length>0&&<Card><p style={{fontSize:13,fontWeight:700,color:D.text,marginBottom:8}}>Carteira</p>{tiposI.map((x,i)=><div key={x.t} style={{marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:D.text2}}>{x.t}</span><span style={{fontWeight:600,color:CORES[i%CORES.length]}}>{fmtM(x.v,currency)} <span style={{color:D.text3,fontWeight:400}}>({totInv>0?Math.round(x.v/totInv*100):0}%)</span></span></div><MiniBar valor={x.v} total={totInv} cor={CORES[i%CORES.length]}/></div>)}</Card>}
      </div>}

      {tab===1&&<BancosTab data={data} setData={setData} currency={currency}/>}
      {tab===2&&<LancamentosTab data={data} setData={setData} currency={currency} mes={mes} profileId={profileId}/>}
      {tab===3&&<CartaoTab data={data} setData={setData} currency={currency} mes={mes}/>}
      {tab===4&&<InvestimentosTab data={data} setData={setData} currency={currency} profileId={profileId}/>}
      {tab===5&&<MetasTab data={data} setData={setData} currency={currency}/>}
      {tab===6&&<AnaliseTab data={data} setData={setData} investimentos={data.investimentos} profileId={profileId} market={profileId} currency={currency}/>}
      {tab===7&&<SplitwiseTab currency={currency} userEmail={session?.user?.email}/>}
      {tab===8&&<RelatoriosTab data={data} setData={setData} currency={currency}/>}
      {modalTransf&&(()=>{
        const de=transfForm.de,para=transfForm.para;
        const curDe=PROFILES.find(p=>p.id===de)?.currency||"";
        const curPara=PROFILES.find(p=>p.id===para)?.currency||"";
        const bancosDe=(allData[de]?.bancos)||[],bancosPara=(allData[para]?.bancos)||[];
        return <Modal title="💱 Transferência entre países" onClose={()=>{setModalTransf(false);setTransfForm({});}}>
        <p style={{fontSize:11,color:D.text3,marginTop:0,lineHeight:1.5}}>Cria as duas pernas de uma vez, na categoria <b>Transferência</b> (não conta como gasto nem como renda — só move os saldos). A taxa, se houver, entra como despesa real em "Câmbio".</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <label style={{fontSize:12,color:D.text3}}>Sai de<select value={de||""} onChange={e=>setTransfForm(f=>({...f,de:e.target.value,bancoDe:""}))} style={{marginTop:4}}>{PROFILES.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
          <label style={{fontSize:12,color:D.text3}}>Vai para<select value={para||""} onChange={e=>setTransfForm(f=>({...f,para:e.target.value,bancoPara:""}))} style={{marginTop:4}}>{PROFILES.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
          <label style={{fontSize:12,color:D.text3}}>Banco de origem{bancosDe.length===0&&" (nenhum)"}<select value={transfForm.bancoDe||""} onChange={e=>setTransfForm(f=>({...f,bancoDe:e.target.value}))} style={{marginTop:4}}><option value="">—</option>{bancosDe.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}</select></label>
          <label style={{fontSize:12,color:D.text3}}>Banco de destino{bancosPara.length===0&&" (nenhum)"}<select value={transfForm.bancoPara||""} onChange={e=>setTransfForm(f=>({...f,bancoPara:e.target.value}))} style={{marginTop:4}}><option value="">—</option>{bancosPara.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}</select></label>
          <label style={{fontSize:12,color:D.text3}}>Valor enviado ({curDe})<input type="number" step="0.01" value={transfForm.valorEnviado||""} onChange={e=>setTransfForm(f=>({...f,valorEnviado:e.target.value}))} style={{marginTop:4}}/></label>
          <label style={{fontSize:12,color:D.text3}}>Valor recebido ({curPara})<input type="number" step="0.01" value={transfForm.valorRecebido||""} onChange={e=>setTransfForm(f=>({...f,valorRecebido:e.target.value}))} placeholder="o que chegou de fato" style={{marginTop:4}}/></label>
          <label style={{fontSize:12,color:D.text3}}>Taxa da remessa ({curDe}, opcional)<input type="number" step="0.01" value={transfForm.taxa||""} onChange={e=>setTransfForm(f=>({...f,taxa:e.target.value}))} style={{marginTop:4}}/></label>
          <label style={{fontSize:12,color:D.text3}}>Data<input type="date" value={transfForm.data||""} onChange={e=>setTransfForm(f=>({...f,data:e.target.value}))} style={{marginTop:4}}/></label>
        </div>
        <label style={{fontSize:12,color:D.text3,display:"block",marginTop:8}}>Observação (opcional)<input value={transfForm.descricao||""} onChange={e=>setTransfForm(f=>({...f,descricao:e.target.value}))} placeholder="Ex: Wise, envio p/ investir" style={{marginTop:4}}/></label>
        {parseFloat(transfForm.valorEnviado)>0&&parseFloat(transfForm.valorRecebido)>0&&de&&para&&de!==para&&<p style={{fontSize:12,color:D.text2,marginTop:8,lineHeight:1.6}}>Vai criar: <b style={{color:D.red}}>−{fmtM(parseFloat(transfForm.valorEnviado),curDe)}</b> em {PROFILES.find(p=>p.id===de)?.label}{parseFloat(transfForm.taxa)>0&&<> + taxa <b style={{color:D.red}}>−{fmtM(parseFloat(transfForm.taxa),curDe)}</b></>} e <b style={{color:D.green}}>+{fmtM(parseFloat(transfForm.valorRecebido),curPara)}</b> em {PROFILES.find(p=>p.id===para)?.label}.</p>}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:10}}><Btn outline color={D.text3} onClick={()=>{setModalTransf(false);setTransfForm({});}}>Cancelar</Btn><Btn color={D.green} onClick={fazerTransferencia}>Transferir</Btn></div>
      </Modal>;})()}
      {modalSal&&<Modal title="💰 Salário esperado" onClose={()=>setModalSal(false)}>
        <p style={{fontSize:11,color:D.text3,marginBottom:10,lineHeight:1.5}}>Usado para projetar seus gastos como % do salário <b>garantido</b>. Extra (bônus, freela) fica de fora — é folga. Fica salvo por perfil ({currency}).</p>
        <label style={{fontSize:12,color:D.text3,display:"block",marginBottom:8}}>Valor ({currency})<input type="number" value={salForm.valor||""} onChange={e=>setSalForm(f=>({...f,valor:e.target.value}))} placeholder="ex: 1875" style={{marginTop:4}}/></label>
        <label style={{fontSize:12,color:D.text3,display:"block"}}>Frequência<select value={salForm.freq||"semanal"} onChange={e=>setSalForm(f=>({...f,freq:e.target.value}))} style={{marginTop:4}}>
          <option value="semanal">Semanal</option>
          <option value="quinzenal">Quinzenal (a cada 2 semanas)</option>
          <option value="mensal">Mensal</option>
          <option value="anual">Anual</option>
        </select></label>
        {parseFloat(salForm.valor)>0&&(()=>{const m=salarioMensal(parseFloat(salForm.valor),salForm.freq||"semanal");return <p style={{fontSize:13,color:D.green,marginTop:10,fontWeight:600}}>≈ {fmtM(m,currency)}/mês</p>;})()}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:14}}>
          <Btn outline color={D.red} sm onClick={()=>{setData(d=>({...d,salario:null}));setModalSal(false);}}>Remover</Btn>
          <div style={{display:"flex",gap:8}}>
            <Btn outline color={D.text3} onClick={()=>setModalSal(false)}>Cancelar</Btn>
            <Btn onClick={()=>{const v=parseFloat(salForm.valor)||0;setData(d=>({...d,salario:v>0?{valor:v,freq:salForm.freq||"semanal"}:null}));setModalSal(false);}}>Salvar</Btn>
          </div>
        </div>
      </Modal>}
    </div>
  </>;
}

export default function App(){
  return <ErrorBoundary><AppInner/></ErrorBoundary>;
}
