import { useState, useEffect, useRef, useCallback } from "react";

const SUPA_URL="https://llpzdrqgvkpxjnecttkb.supabase.co";
const SUPA_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxscHpkcnFndmtweGpuZWN0dGtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3MDA2MjAsImV4cCI6MjA5NjI3NjYyMH0.X3DDKVRppRO-NiC5a2Cc0JrpFAaf5J-hymFHv6vNQ6Q";
const WORKER="https://controlfinanceiro.leeo-parms.workers.dev";
const supa={
  h:{"Content-Type":"application/json","apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`},
  ah:t=>({"Content-Type":"application/json","apikey":SUPA_KEY,"Authorization":`Bearer ${t}`}),
  async signUp(e,p){return(await fetch(`${SUPA_URL}/auth/v1/signup`,{method:"POST",headers:supa.h,body:JSON.stringify({email:e,password:p})})).json();},
  async signIn(e,p){return(await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`,{method:"POST",headers:supa.h,body:JSON.stringify({email:e,password:p})})).json();},
  async signOut(t){await fetch(`${SUPA_URL}/auth/v1/logout`,{method:"POST",headers:supa.ah(t)});},
  async load(t,id){const r=await(await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${id}&select=data`,{headers:supa.ah(t)})).json();return r?.[0]?.data||null;},
  async save(t,id,d){await fetch(`${SUPA_URL}/rest/v1/profiles`,{method:"POST",headers:{...supa.ah(t),"Prefer":"resolution=merge-duplicates"},body:JSON.stringify({id,data:d,updated_at:new Date().toISOString()})});},
  async loadShared(codigo){const r=await(await fetch(`${SUPA_URL}/rest/v1/splitwise?codigo=eq.${codigo}&select=data`,{headers:supa.h})).json();return r?.[0]?.data||null;},
  async saveShared(codigo,d){await fetch(`${SUPA_URL}/rest/v1/splitwise`,{method:"POST",headers:{...supa.h,"Prefer":"resolution=merge-duplicates"},body:JSON.stringify({codigo,data:d,updated_at:new Date().toISOString()})});},
};

const D={bg:"#0a0e1a",bg2:"#0f1629",bg3:"#151d35",card:"#111827",card2:"#1a2235",border:"#1e2d4a",border2:"#253352",green:"#00d084",red:"#ff4757",blue:"#3b82f6",gold:"#f59e0b",purple:"#8b5cf6",text:"#f1f5f9",text2:"#94a3b8",text3:"#64748b"};
const CORES=[D.green,D.blue,D.purple,D.gold,D.red,"#06b6d4","#ec4899"];
const PROFILES=[{id:"br",label:"🇧🇷 Brasil",currency:"R$",market:"brazil",locale:"pt-BR"},{id:"au",label:"🇦🇺 Austrália",currency:"A$",market:"australia",locale:"en-AU"}];
const CAT_D_DEF=["Alimentação","Transporte","Saúde","Lazer","Moradia","Educação","Assinatura","Vestuário","Outros"];
const CAT_R_DEF=["Salário","Freelance","Investimentos","Aluguel","Dividendos","Bônus","Outros"];
const TIPOS_INV=["Ações","FII","ETF","Cripto","Renda Fixa","Tesouro Direto","Outros"];
const INDICES_RF=["CDI","IPCA","Selic","IGPM","Prefixado"];
const INDICES_RATE={CDI:10.5,Selic:10.5,IPCA:4.62,IGPM:5.1};
const MESES=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const TABS=["Dashboard","Bancos","Lançamentos","Cartão","Investimentos","Metas","Análise","Splitwise"];
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
const EMPTY={transacoes:[],faturas:[],investimentos:[],metas:[],bancos:[],orcamentos:[],recorrencias:[],dividendos:[],catD:[...CAT_D_DEF],catR:[...CAT_R_DEF]};
const EMPTY_ALL={br:{...EMPTY},au:{...EMPTY}};
const lsGet=k=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):null;}catch{return null;}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,5);
const fmtM=(v,cur="R$")=>cur+" "+Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtPct=v=>v!=null?Number(v).toFixed(2)+"%":"—";

function calcRFAnual(inv){const indice=inv.indice||"CDI",taxa=parseFloat(inv.taxaRF)||0,pct=parseFloat(inv.pctIndice)||100;if(indice==="Prefixado")return taxa;const base=INDICES_RATE[indice]||10.5;return inv.rfTipo==="pct"?base*(pct/100):base+taxa;}
function calcValorAtualRF(inv){const anos=(new Date()-new Date(inv.data))/(1000*60*60*24*365);return(inv.valorInvestido||inv.valor||0)*Math.pow(1+calcRFAnual(inv)/100,Math.max(0,anos));}
function calcImpostoBR(r,m){if(r<=0)return 0;if(m<=6)return r*0.225;if(m<=12)return r*0.20;if(m<=24)return r*0.175;return r*0.15;}
function calcImpostoAU(r,m){if(r<=0)return 0;return(m>=12?r*0.5:r)*0.325;}

async function askClaude(prompt,maxTokens=900,images=[]){
  try{
    const content=images.length>0?[...images.map(({base64,mediaType})=>({type:"image",source:{type:"base64",media_type:mediaType||"image/jpeg",data:base64}})),{type:"text",text:prompt}]:[{type:"text",text:prompt}];
    const res=await fetch(WORKER,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:maxTokens,messages:[{role:"user",content}]})});
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const d=await res.json();if(d.error)throw new Error(d.error.message);
    return d.content.filter(b=>b.type==="text").map(b=>b.text).join("").replace(/```json|```/g,"").trim();
  }catch(e){console.error("askClaude:",e);throw e;}
}

async function fetchPrecoReal(ticker, profileId) {
  try {
    const market = profileId || "au";
    const r = await fetch(`${WORKER}/quote?ticker=${encodeURIComponent(ticker)}&market=${market}`);
    if (!r.ok) return null;
    const d = await r.json();
    if (d?.preco_atual) return d;
  } catch {}
  return null;
}

const GS=`*{box-sizing:border-box;margin:0;padding:0;}body{background:${D.bg};color:${D.text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}input,select,textarea{background:${D.bg3};color:${D.text};border:1px solid ${D.border2};border-radius:8px;padding:8px 12px;font-size:13px;width:100%;outline:none;transition:border-color .2s;}input:focus,select:focus{border-color:${D.green};}input::placeholder{color:${D.text3};}select option{background:${D.bg3};}::-webkit-scrollbar{width:4px;height:4px;}::-webkit-scrollbar-thumb{background:${D.border2};border-radius:2px;}`;

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
function ChartModal({ticker,onClose}){
  const sym=/^[A-Z0-9]{1,6}(\.[A-Z]+)?$/.test(ticker)?ticker:"BMFBOVESPA:"+ticker;
  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,backdropFilter:"blur(6px)"}}>
    <div onClick={e=>e.stopPropagation()} style={{background:D.card,border:`1px solid ${D.border2}`,borderRadius:16,padding:"1rem",width:"min(96vw,800px)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{fontSize:18,fontWeight:700,color:D.text}}>{ticker}</span>
        <button onClick={onClose} style={{border:"none",background:"none",cursor:"pointer",fontSize:22,color:D.text3}}>✕</button>
      </div>
      <TVWidget type="advanced-chart" config={{symbol:sym,interval:"D",locale:"pt_BR",style:"1",width:"100%",height:500,allow_symbol_change:true}}/>
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
function PieChart({slices}){
  let cum=0;const total=slices.reduce((a,b)=>a+b.v,0);
  if(!total)return <p style={{fontSize:13,color:D.text3}}>Sem dados.</p>;
  const paths=slices.filter(s=>s.v>0).map(s=>{const pct=s.v/total,start=cum,end=cum+pct;cum=end;const x1=Math.cos(2*Math.PI*start-Math.PI/2),y1=Math.sin(2*Math.PI*start-Math.PI/2),x2=Math.cos(2*Math.PI*end-Math.PI/2),y2=Math.sin(2*Math.PI*end-Math.PI/2);return{d:`M0,0 L${x1},${y1} A1,1,0,${pct>0.5?1:0},1,${x2},${y2}Z`,color:s.color,label:s.label,pct:Math.round(pct*100)};});
  return <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
    <svg viewBox="-1.15 -1.15 2.3 2.3" style={{width:110,height:110,flexShrink:0}}>{paths.map((p,i)=><path key={i} d={p.d} fill={p.color} stroke={D.bg2} strokeWidth="0.04"/>)}</svg>
    <div style={{display:"flex",flexDirection:"column",gap:5,flex:1}}>{paths.map((p,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:11}}><div style={{width:8,height:8,borderRadius:2,background:p.color,flexShrink:0}}/><span style={{color:D.text2,flex:1}}>{p.label}</span><span style={{color:p.color,fontWeight:600}}>{p.pct}%</span></div>)}</div>
  </div>;
}
function LineChart({data,currency}){
  const vals=data.map(d=>d.v),max=Math.max(...vals,1),min=Math.min(...vals,0),range=max-min||1;
  const W=320,H=110,pad=14;
  const pts=data.map((d,i)=>`${pad+(i/(data.length-1||1))*(W-pad*2)},${H-pad-((d.v-min)/range)*(H-pad*2)}`).join(" ");
  return <div><svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:H}}>
    <polyline points={pts} fill="none" stroke={D.green} strokeWidth="2" style={{filter:`drop-shadow(0 0 4px ${D.green})`}}/>
    {data.map((d,i)=>{const x=pad+(i/(data.length-1||1))*(W-pad*2),y=H-pad-((d.v-min)/range)*(H-pad*2);return <circle key={i} cx={x} cy={y} r="3" fill={D.green}><title>{d.label}: {fmtM(d.v,currency)}</title></circle>;})}
  </svg></div>;
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
      <Btn color={D.green} onClick={()=>onSave({...result,nfImg:img||null,nfManual:!img,nfB64:b64})}>Salvar NF</Btn>
    </div>
  </Modal>;
}

// ── Score ─────────────────────────────────────────────────────────────────────
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
  const [mode,setMode]=useState("login");const [email,setEmail]=useState("");const [pass,setPass]=useState("");
  const [loading,setLoading]=useState(false);const [erro,setErro]=useState("");const [msg,setMsg]=useState("");
  async function handle(){if(!email||!pass){setErro("Preencha email e senha.");return;}setLoading(true);setErro("");setMsg("");
    try{if(mode==="register"){const r=await supa.signUp(email,pass);if(r.error)setErro(r.error.message);else{setMsg("✅ Conta criada! Verifique seu email.");setMode("login");}}
    else{const r=await supa.signIn(email,pass);if(r.error)setErro("Email ou senha incorretos.");else onLogin(r.access_token,r.user);}}catch{setErro("Erro de conexão.");}setLoading(false);}
  return <div style={{minHeight:"100vh",background:`radial-gradient(ellipse at top,${D.bg2} 0%,${D.bg} 70%)`,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
    <div style={{width:"min(100%,400px)"}}>
      <div style={{textAlign:"center",marginBottom:"2rem"}}>
        <div style={{fontSize:52,marginBottom:12,filter:`drop-shadow(0 0 20px ${D.green})`}}>💰</div>
        <h1 style={{fontSize:24,fontWeight:800,color:D.text}}>Controle Financeiro</h1>
        <p style={{color:D.text3,fontSize:13,marginTop:4}}>Gerencie suas finanças em qualquer lugar</p>
      </div>
      <div style={{background:D.card,border:`1px solid ${D.border}`,borderRadius:20,padding:"2rem"}}>
        {erro&&<div style={{background:D.red+"22",border:`1px solid ${D.red}44`,borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:12,color:D.red}}>{erro}</div>}
        {msg&&<div style={{background:D.green+"22",border:`1px solid ${D.green}44`,borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:12,color:D.green}}>{msg}</div>}
        <div style={{display:"flex",gap:4,marginBottom:"1.5rem",background:D.bg3,borderRadius:10,padding:4}}>
          {[["login","Entrar"],["register","Criar conta"]].map(([v,l])=><button key={v} onClick={()=>{setMode(v);setErro("");setMsg("");}} style={{flex:1,padding:"9px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:mode===v?700:400,background:mode===v?D.green:"transparent",color:mode===v?"#000":D.text3}}>{l}</button>)}
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
  function saveBanco(){const b={id:form.editId||uid(),nome:form.nome||"Banco",saldoInicial:parseFloat(form.saldoInicial)||0,limite:parseFloat(form.limite)||0,tipo:form.tipo||"corrente"};setData(d=>({...d,bancos:form.editId?d.bancos.map(x=>x.id===form.editId?b:x):[...d.bancos,b]}));setModal(false);setForm({});}
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
      <label style={{fontSize:12,color:D.text3}}>Tipo<select value={form.tipo||"corrente"} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} style={{marginTop:4}}><option value="corrente">Conta Corrente</option><option value="poupança">Poupança</option><option value="investimento">Conta Investimento</option><option value="digital">Conta Digital</option></select></label>
      <label style={{fontSize:12,color:D.text3}}>Saldo inicial ({currency})<input type="number" value={form.saldoInicial||""} onChange={e=>setForm(f=>({...f,saldoInicial:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Limite crédito ({currency})<input type="number" value={form.limite||""} onChange={e=>setForm(f=>({...f,limite:e.target.value}))} style={{marginTop:4}}/></label>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn outline color={D.text3} onClick={()=>setModal(false)}>Cancelar</Btn><Btn onClick={saveBanco}>Salvar</Btn></div>
    </Modal>}
  </div>;
}

// ── Lançamentos Tab ───────────────────────────────────────────────────────────

function LancamentosTab({data,setData,currency,mes}){
  const [modal,setModal]=useState(null);const [form,setForm]=useState({});
  const [showNF,setShowNF]=useState(false);const [showExtratoNF,setShowExtratoNF]=useState(false);
  const [newCatD,setNewCatD]=useState("");const [newCatR,setNewCatR]=useState("");
  const [modalOrc,setModalOrc]=useState(false);const [orcForm,setOrcForm]=useState({});
  const [modalRec,setModalRec]=useState(false);const [recForm,setRecForm]=useState({});
  // ⚡ Lançamento rápido
  const [quickValor,setQuickValor]=useState("");
  const [quickOrigem,setQuickOrigem]=useState("Conta Corrente");
  const [quickCat,setQuickCat]=useState("Outros");
  const [quickTipo,setQuickTipo]=useState("despesa");
  const ORIGENS=["Conta Corrente","Pix","TED","DOC","Cartão Débito","Dinheiro"];
  const catD=data.catD||CAT_D_DEF,catR=data.catR||CAT_R_DEF;

  function addCat(tipo,nome){if(!nome.trim())return;setData(d=>({...d,[tipo==="D"?"catD":"catR"]:[...(tipo==="D"?d.catD||CAT_D_DEF:d.catR||CAT_R_DEF),nome.trim()]}));}
  const txMes=data.transacoes.filter(t=>{const d=new Date(t.data);return d.getMonth()===mes&&d.getFullYear()===ANO_ATUAL;});

  // ⚡ Salva lançamento rápido
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
    const t={id:form.editId||uid(),tipo:form.tipo||"despesa",descricao:form.descricao||"Sem descrição",
      valor:parseFloat(form.valor)||0,categoria:form.categoria||(form.tipo==="receita"?catR[0]:catD[0]),
      data:form.data||hoje.toISOString().slice(0,10),bancoId:form.bancoId||null,
      nfImg:form.nfImg||null,nfManual:form.nfManual||false};
    setData(d=>({...d,transacoes:form.editId?d.transacoes.map(x=>x.id===form.editId?t:x):[...d.transacoes,t]}));
    setModal(null);setForm({});
  }
  function saveOrc(){const o={id:orcForm.editId||uid(),categoria:orcForm.categoria||catD[0],valor:parseFloat(orcForm.valor)||0};setData(d=>({...d,orcamentos:orcForm.editId?(d.orcamentos||[]).map(x=>x.id===orcForm.editId?o:x):[...(d.orcamentos||[]),o]}));setModalOrc(false);setOrcForm({});}
  function saveRec(){const r={id:recForm.editId||uid(),tipo:recForm.tipo||"despesa",descricao:recForm.descricao||"",valor:parseFloat(recForm.valor)||0,categoria:recForm.categoria||catD[0],dia:parseInt(recForm.dia)||1,bancoId:recForm.bancoId||null};setData(d=>({...d,recorrencias:recForm.editId?(d.recorrencias||[]).map(x=>x.id===recForm.editId?r:x):[...(d.recorrencias||[]),r]}));setModalRec(false);setRecForm({});}
  const nfsComNF=data.transacoes.filter(t=>t.nfImg||t.nfManual);

  // Anexar foto NF no modal de lançamento
  const nfFileRef=useRef(null);
  function handleNFFile(e){
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>setForm(f=>({...f,nfImg:ev.target.result,nfManual:false}));
    reader.readAsDataURL(file);
  }

  return <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
    {showNF&&<NFModal currency={currency} onClose={()=>setShowNF(false)} onSave={dados=>{setForm(f=>({...f,...dados,tipo:"despesa"}));setShowNF(false);setModal("tx");}}/>}

    {/* ⚡ LANÇAMENTO RÁPIDO */}
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
      <Btn onClick={()=>{setModalOrc(true);setOrcForm({});}} color={D.gold} outline sm>🎯 Orçamento</Btn>
      <Btn onClick={()=>{setModalRec(true);setRecForm({});}} color={D.purple} outline sm>🔄 Recorrência</Btn>
      {nfsComNF.length>0&&<Btn onClick={()=>setShowExtratoNF(true)} color={D.green} outline sm>🧾 NFs para IR ({nfsComNF.length})</Btn>}
    </div>

    {showExtratoNF&&<Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <p style={{fontSize:14,fontWeight:700,color:D.text}}>🧾 Notas Fiscais para IR</p>
        <div style={{display:"flex",gap:8}}>
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
              ?<img src={t.nfImg} style={{width:32,height:32,objectFit:"cover",borderRadius:4,cursor:"pointer",border:`1px solid ${D.green}`}} onClick={()=>window.open(t.nfImg)}/>
              :<span style={{fontSize:10,color:D.text3}}>Manual</span>}
          </td>
        </tr>)}</tbody>
      </table>
      <p style={{fontSize:11,color:D.text3,marginTop:6}}>Total: <strong style={{color:D.red}}>{fmtM(nfsComNF.reduce((a,b)=>a+b.valor,0),currency)}</strong></p></div>
    </Card>}

    {data.recorrencias?.length>0&&<Card>
      <p style={{fontSize:13,fontWeight:700,color:D.text,marginBottom:8}}>🔄 Recorrentes</p>
      {data.recorrencias.map(r=><div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",background:D.bg3,borderRadius:8,fontSize:12,marginBottom:4}}>
        <span style={{color:D.text2}}>{r.descricao} <span style={{color:D.text3,fontSize:10}}>dia {r.dia}</span></span>
        <div style={{display:"flex",gap:8}}><span style={{fontWeight:700,color:r.tipo==="receita"?D.green:D.red}}>{r.tipo==="receita"?"+":"-"}{fmtM(r.valor,currency)}</span><button onClick={()=>setData(d=>({...d,recorrencias:(d.recorrencias||[]).filter(x=>x.id!==r.id)}))} style={{border:"none",background:"none",cursor:"pointer",color:D.red,fontSize:12}}>🗑</button></div>
      </div>)}
    </Card>}

    {data.bancos.length===0&&<div style={{background:D.red+"22",border:`1px solid ${D.red}44`,borderRadius:10,padding:"10px 14px",fontSize:12,color:D.red}}>⚠️ Cadastre um banco primeiro.</div>}
    {txMes.length===0&&<p style={{fontSize:13,color:D.text3}}>Nenhum lançamento neste mês.</p>}
    {txMes.sort((a,b)=>b.data.localeCompare(a.data)).map(t=><Card key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"0.75rem 1rem"}}>
      <div style={{width:36,height:36,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",background:t.tipo==="receita"?D.green+"22":D.red+"22",fontSize:16,flexShrink:0}}>{t.tipo==="receita"?"↑":"↓"}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}><p style={{margin:0,fontSize:13,fontWeight:600,color:D.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.descricao}</p>{t.nfImg&&<img src={t.nfImg} style={{width:22,height:22,objectFit:"cover",borderRadius:3,cursor:"pointer",flexShrink:0}} onClick={()=>window.open(t.nfImg)} title="Ver NF"/>}{!t.nfImg&&t.nfManual&&<span title="NF Manual" style={{fontSize:11}}>📋</span>}</div>
        <p style={{margin:0,fontSize:11,color:D.text3}}>{t.categoria} · {t.data}{t.bancoId?` · 🏦 ${data.bancos.find(b=>b.id===t.bancoId)?.nome||""}`:""}</p>
      </div>
      <span style={{fontWeight:700,color:t.tipo==="receita"?D.green:D.red,fontSize:14,flexShrink:0}}>{t.tipo==="receita"?"+":"-"}{fmtM(t.valor,currency)}</span>
      <div style={{display:"flex",gap:4}}>
        <button onClick={()=>{setModal("tx");setForm({...t,editId:t.id});}} style={{border:"none",background:"none",cursor:"pointer",fontSize:13,color:D.text3}}>✏️</button>
        <button onClick={()=>setData(d=>({...d,transacoes:d.transacoes.filter(x=>x.id!==t.id)}))} style={{border:"none",background:"none",cursor:"pointer",fontSize:13,color:D.red}}>🗑</button>
      </div>
    </Card>)}

    {/* Modal lançamento completo — com campo foto NF */}
    {modal==="tx"&&<Modal title={form.editId?"Editar":"Novo lançamento completo"} onClose={()=>setModal(null)}>
      <label style={{fontSize:12,color:D.text3}}>Tipo<select value={form.tipo||"despesa"} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} style={{marginTop:4}}><option value="despesa">Despesa</option><option value="receita">Receita</option></select></label>
      <label style={{fontSize:12,color:D.text3}}>Descrição<input value={form.descricao||""} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Valor ({currency})<input type="number" value={form.valor||""} onChange={e=>setForm(f=>({...f,valor:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Categoria<select value={form.categoria||""} onChange={e=>setForm(f=>({...f,categoria:e.target.value}))} style={{marginTop:4}}>{(form.tipo==="receita"?catR:catD).map(c=><option key={c}>{c}</option>)}</select></label>
      <div style={{display:"flex",gap:6}}><input placeholder="Nova categoria..." value={form.tipo==="receita"?newCatR:newCatD} onChange={e=>form.tipo==="receita"?setNewCatR(e.target.value):setNewCatD(e.target.value)} style={{flex:1}}/><Btn sm onClick={()=>{addCat(form.tipo==="receita"?"R":"D",form.tipo==="receita"?newCatR:newCatD);form.tipo==="receita"?setNewCatR(""):setNewCatD("");}}>+ Add</Btn></div>
      <label style={{fontSize:12,color:D.text3}}>Data<input type="date" value={form.data||hoje.toISOString().slice(0,10)} onChange={e=>setForm(f=>({...f,data:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Banco <span style={{color:D.red}}>*</span><select value={form.bancoId||""} onChange={e=>setForm(f=>({...f,bancoId:e.target.value}))} style={{marginTop:4}}><option value="">Selecione...</option>{data.bancos.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}</select></label>

      {/* ── CAMPO FOTO NF ── */}
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

    {modalOrc&&<Modal title="Orçamento mensal" onClose={()=>setModalOrc(false)}>
      <label style={{fontSize:12,color:D.text3}}>Categoria<select value={orcForm.categoria||""} onChange={e=>setOrcForm(f=>({...f,categoria:e.target.value}))} style={{marginTop:4}}>{catD.map(c=><option key={c}>{c}</option>)}</select></label>
      <label style={{fontSize:12,color:D.text3,marginTop:8,display:"block"}}>Limite ({currency})<input type="number" value={orcForm.valor||""} onChange={e=>setOrcForm(f=>({...f,valor:e.target.value}))} style={{marginTop:4}}/></label>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn outline color={D.text3} onClick={()=>setModalOrc(false)}>Cancelar</Btn><Btn color={D.gold} onClick={saveOrc}>Salvar</Btn></div>
    </Modal>}
    {modalRec&&<Modal title="Nova recorrência" onClose={()=>setModalRec(false)}>
      <label style={{fontSize:12,color:D.text3}}>Tipo<select value={recForm.tipo||"despesa"} onChange={e=>setRecForm(f=>({...f,tipo:e.target.value}))} style={{marginTop:4}}><option value="despesa">Despesa</option><option value="receita">Receita</option></select></label>
      <label style={{fontSize:12,color:D.text3}}>Descrição<input value={recForm.descricao||""} onChange={e=>setRecForm(f=>({...f,descricao:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Valor ({currency})<input type="number" value={recForm.valor||""} onChange={e=>setRecForm(f=>({...f,valor:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Categoria<select value={recForm.categoria||""} onChange={e=>setRecForm(f=>({...f,categoria:e.target.value}))} style={{marginTop:4}}>{(recForm.tipo==="receita"?catR:catD).map(c=><option key={c}>{c}</option>)}</select></label>
      <label style={{fontSize:12,color:D.text3}}>Dia do mês<input type="number" min="1" max="31" value={recForm.dia||""} onChange={e=>setRecForm(f=>({...f,dia:e.target.value}))} style={{marginTop:4}}/></label>
      {data.bancos.length>0&&<label style={{fontSize:12,color:D.text3}}>Banco<select value={recForm.bancoId||""} onChange={e=>setRecForm(f=>({...f,bancoId:e.target.value}))} style={{marginTop:4}}><option value="">Nenhum</option>{data.bancos.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}</select></label>}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn outline color={D.text3} onClick={()=>setModalRec(false)}>Cancelar</Btn><Btn color={D.purple} onClick={saveRec}>Salvar</Btn></div>
    </Modal>}
  </div>;
}

// ── Investimentos Tab (estilo XP) ─────────────────────────────────────────────
function InvestimentosTab({data,setData,currency,profileId}){
  const [view,setView]=useState("classe");
  const [modal,setModal]=useState(false);const [form,setForm]=useState({});
  const [chartTicker,setChartTicker]=useState(null);const [loadingId,setLoadingId]=useState(null);
  const [modalDiv,setModalDiv]=useState(false);const [divForm,setDivForm]=useState({});
  const [atualizandoTodos,setAtualizandoTodos]=useState(false);

  const isBR=profileId==="br";
  const totalInvest=data.investimentos.reduce((a,b)=>a+(b.valorAtual||b.valorInvestido||b.valor||0),0);
  const totalInvestido=data.investimentos.reduce((a,b)=>a+(b.valorInvestido||b.valor||0),0);
  const totalLucro=totalInvest-totalInvestido;
  const rentTotal=totalInvestido>0?((totalInvest-totalInvestido)/totalInvestido)*100:0;

  // Classificação estilo XP
  const rendaVariavel=data.investimentos.filter(i=>["Ações","FII","ETF","Cripto"].includes(i.tipo));
  const rendaFixa=data.investimentos.filter(i=>["Renda Fixa","Tesouro Direto"].includes(i.tipo));
  const outros=data.investimentos.filter(i=>i.tipo==="Outros");
  const totalRV=rendaVariavel.reduce((a,b)=>a+(b.valorAtual||b.valorInvestido||0),0);
  const totalRF=rendaFixa.reduce((a,b)=>a+(b.valorAtual||b.valorInvestido||0),0);
  const totalOu=outros.reduce((a,b)=>a+(b.valorAtual||b.valorInvestido||0),0);

  // Proventos
  const divMes=(data.dividendos||[]).filter(d=>{const dt=new Date(d.data);return dt.getMonth()===MES_ATUAL&&dt.getFullYear()===ANO_ATUAL;});
  const totDiv=divMes.reduce((a,b)=>a+b.valor,0);
  const proxDiv=data.investimentos.filter(i=>i.prox_dividendo).sort((a,b)=>a.prox_dividendo.localeCompare(b.prox_dividendo));

  async function buscarDados(inv){
  if(inv.tipo==="Renda Fixa"||inv.tipo==="Tesouro Direto"){
    const va=calcValorAtualRF(inv);
    setData(d=>({...d,investimentos:d.investimentos.map(x=>x.id===inv.id?{...x,valorAtual:va,lucro:va-(inv.valorInvestido||inv.valor||0),preco_atual:va/(inv.quantidade||1)}:x)}));
    return;
  }
  if(!inv.ticker) return;
  setLoadingId(inv.id);
  const real=await fetchPrecoReal(inv.ticker);
  if(real?.preco_atual){
    const va=real.preco_atual*(inv.quantidade||1);
    const lucro=va-(inv.precoMedio||0)*(inv.quantidade||1);
    setData(d=>({...d,investimentos:d.investimentos.map(x=>x.id===inv.id?{...x,preco_atual:real.preco_atual,variacao_dia:real.variacao_dia,valorAtual:va,lucro,ultimaAtualizacao:new Date().toLocaleTimeString("pt-BR")}:x)}));
    try{
      const mercado=isBR?"bolsa brasileira B3":"bolsa australiana ASX";
      const txt=await askClaude(`Para o ativo ${inv.ticker} na ${mercado} com preço atual de ${real.preco_atual}, retorne APENAS JSON: {"dy":number_or_null,"prox_dividendo":"YYYY-MM-DD or null","valor_dividendo":number_or_null,"resumo":"1 frase sobre perspectiva atual"}`,300);
      const extra=JSON.parse(txt);
      setData(d=>({...d,investimentos:d.investimentos.map(x=>x.id===inv.id?{...x,...extra}:x)}));
    }catch{}
  }else{
    try{
      const mercado=isBR?"bolsa brasileira B3":"bolsa australiana ASX";
      const txt=await askClaude(`Preço de fechamento mais recente do ativo ${inv.ticker} na ${mercado}. JSON apenas: {"preco_atual":number}`,150);
      const obj=JSON.parse(txt);
      if(obj.preco_atual>0){const va=obj.preco_atual*(inv.quantidade||1);setData(d=>({...d,investimentos:d.investimentos.map(x=>x.id===inv.id?{...x,preco_atual:obj.preco_atual,valorAtual:va,lucro:va-(inv.precoMedio||0)*(inv.quantidade||1),ultimaAtualizacao:new Date().toLocaleTimeString("pt-BR")}:x)}));}
    }catch{}
  }
  setLoadingId(null);
}

  // Auto-refresh investimentos a cada 60s
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
    setData(d=>({...d,investimentos:form.editId?d.investimentos.map(x=>x.id===form.editId?i:x):[...d.investimentos,i]}));setModal(false);setForm({});
  }
  function saveDiv(){const d={id:divForm.editId||uid(),ticker:divForm.ticker||"",valor:parseFloat(divForm.valor)||0,data:divForm.data||hoje.toISOString().slice(0,10),tipo:divForm.tipo||"Dividendo"};setData(dd=>({...dd,dividendos:divForm.editId?(dd.dividendos||[]).map(x=>x.id===divForm.editId?d:x):[...(dd.dividendos||[]),d]}));setModalDiv(false);setDivForm({});}

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
              <button onClick={()=>{setModal(true);setForm({...inv,editId:inv.id});}} style={{border:"none",background:"none",cursor:"pointer",fontSize:12,color:D.text3}}>✏️</button>
              <button onClick={()=>setData(d=>({...d,investimentos:d.investimentos.filter(x=>x.id!==inv.id)}))} style={{border:"none",background:"none",cursor:"pointer",fontSize:12,color:D.red}}>🗑</button>
            </div>
          </div>
          {isRFItem&&<div style={{marginTop:6,display:"flex",gap:6}}><Badge color={D.gold}>Taxa: {calcRFAnual(inv).toFixed(2)}% a.a.</Badge></div>}
          {!isRFItem&&inv.dy&&<div style={{marginTop:6,display:"flex",gap:6}}><Badge color={D.gold}>DY {inv.dy}%</Badge>{inv.prox_dividendo&&<Badge color={D.green}>Div: {inv.prox_dividendo}</Badge>}</div>}
          {inv.resumo&&<p style={{margin:"6px 0 0",fontSize:11,color:D.text3,borderTop:`1px solid ${D.border}`,paddingTop:6}}>{inv.resumo}</p>}
        </div>;
      })}
    </div>;
  }

  return <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
    {chartTicker&&<ChartModal ticker={chartTicker} onClose={()=>setChartTicker(null)}/>}

    {/* Header com total */}
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

    {/* Classes estilo XP */}
    <div style={{display:"flex",gap:4,background:D.card,borderRadius:10,padding:4,border:`1px solid ${D.border}`}}>
      {[["classe","Por Classe"],["rv","Renda Variável"],["rf","Renda Fixa"],["proventos","Proventos"]].map(([v,l])=><button key={v} onClick={()=>setView(v)} style={{flex:1,padding:"7px 8px",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:view===v?700:400,background:view===v?D.blue:"transparent",color:view===v?"#fff":D.text3,whiteSpace:"nowrap"}}>{l}</button>)}
    </div>

    {/* Visão por classe */}
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
      <PieChart slices={[{label:"Renda Variável",v:totalRV,color:D.blue},{label:"Renda Fixa",v:totalRF,color:D.gold},{label:"Outros",v:totalOu,color:D.purple}].filter(s=>s.v>0)}/>
    </div>}

    {/* Renda Variável */}
    {view==="rv"&&<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div><p style={{margin:0,fontSize:14,fontWeight:700,color:D.text}}>📈 Renda Variável</p><p style={{margin:0,fontSize:11,color:D.text3}}>Total: {fmtM(totalRV,currency)}</p></div>
        <Badge color={D.blue}>{rendaVariavel.length} ativos</Badge>
      </div>
      <InvList invs={rendaVariavel} emptyMsg="Nenhum ativo de renda variável cadastrado."/>
    </div>}

    {/* Renda Fixa */}
    {view==="rf"&&<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div><p style={{margin:0,fontSize:14,fontWeight:700,color:D.text}}>🏛️ Renda Fixa</p><p style={{margin:0,fontSize:11,color:D.text3}}>Total: {fmtM(totalRF,currency)}</p></div>
        <Badge color={D.gold}>{rendaFixa.length} ativos</Badge>
      </div>
      <InvList invs={rendaFixa} emptyMsg="Nenhum ativo de renda fixa cadastrado."/>
    </div>}

    {/* Proventos estilo XP */}
    {view==="proventos"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
      <Card style={{background:`linear-gradient(135deg,${D.bg3},${D.card2})`,border:`1px solid ${D.gold}33`}}>
        <p style={{fontSize:10,color:D.text3,textTransform:"uppercase",letterSpacing:"1px",marginBottom:4}}>Total investido · {hoje.toLocaleDateString("pt-BR")}</p>
        <p style={{fontSize:28,fontWeight:800,color:D.gold}}>{fmtM(totDiv,currency)}</p>
        <p style={{fontSize:11,color:D.text3,marginTop:2}}>{divMes.length} ativo{divMes.length!==1?"s":""} encontrado{divMes.length!==1?"s":""}</p>
      </Card>
      <p style={{fontSize:13,fontWeight:700,color:D.text}}>Meus Ativos</p>
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
            <p style={{margin:"2px 0 0",fontSize:11,color:D.text3}}>Pagamento: {inv.prox_dividendo}</p>
          </div>
          {inv.valor_dividendo&&<p style={{fontSize:15,fontWeight:700,color:D.gold}}>{fmtM(inv.valor_dividendo,currency)}/ação</p>}
        </div>
      </Card>)}</>}
    </div>}

    {modal&&<Modal title={form.editId?"Editar ativo":"Novo ativo"} onClose={()=>setModal(false)}>
      <label style={{fontSize:12,color:D.text3}}>Tipo<select value={form.tipo||"Ações"} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} style={{marginTop:4}}>{TIPOS_INV.map(t=><option key={t}>{t}</option>)}</select></label>
      {!isRFForm&&<><label style={{fontSize:12,color:D.text3}}>Ticker<input value={form.ticker||""} onChange={e=>setForm(f=>({...f,ticker:e.target.value.toUpperCase()}))} placeholder={isBR?"Ex: PETR4":"Ex: BHP.AX"} style={{marginTop:4}}/></label><label style={{fontSize:12,color:D.text3}}>Descrição<input value={form.descricao||""} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} style={{marginTop:4}}/></label><label style={{fontSize:12,color:D.text3}}>Quantidade<input type="number" value={form.quantidade||""} onChange={e=>setForm(f=>({...f,quantidade:e.target.value}))} style={{marginTop:4}}/></label><label style={{fontSize:12,color:D.text3}}>Preço médio ({currency})<input type="number" value={form.precoMedio||""} onChange={e=>setForm(f=>({...f,precoMedio:e.target.value}))} style={{marginTop:4}}/></label></>}
      {isRFForm&&<><label style={{fontSize:12,color:D.text3}}>Descrição<input value={form.descricao||""} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} style={{marginTop:4}}/></label><label style={{fontSize:12,color:D.text3}}>Valor investido ({currency})<input type="number" value={form.valorInvestido||""} onChange={e=>setForm(f=>({...f,valorInvestido:e.target.value}))} style={{marginTop:4}}/></label><label style={{fontSize:12,color:D.text3}}>Índice<select value={form.indice||"CDI"} onChange={e=>setForm(f=>({...f,indice:e.target.value}))} style={{marginTop:4}}>{INDICES_RF.map(i=><option key={i}>{i}</option>)}</select></label>{(form.indice||"CDI")!=="Prefixado"&&<><label style={{fontSize:12,color:D.text3}}>Tipo<select value={form.rfTipo||"pct"} onChange={e=>setForm(f=>({...f,rfTipo:e.target.value}))} style={{marginTop:4}}><option value="pct">% do índice</option><option value="mais">Índice + %</option></select></label>{(form.rfTipo||"pct")==="pct"?<label style={{fontSize:12,color:D.text3}}>% do índice<input type="number" value={form.pctIndice||""} onChange={e=>setForm(f=>({...f,pctIndice:e.target.value}))} placeholder="Ex: 102" style={{marginTop:4}}/></label>:<label style={{fontSize:12,color:D.text3}}>Taxa adicional %<input type="number" value={form.taxaRF||""} onChange={e=>setForm(f=>({...f,taxaRF:e.target.value}))} placeholder="Ex: 9" style={{marginTop:4}}/></label>}</>}{(form.indice||"CDI")==="Prefixado"&&<label style={{fontSize:12,color:D.text3}}>Taxa prefixada %<input type="number" value={form.taxaRF||""} onChange={e=>setForm(f=>({...f,taxaRF:e.target.value}))} style={{marginTop:4}}/></label>}<label style={{fontSize:12,color:D.text3}}>Vencimento<input type="date" value={form.vencimento||""} onChange={e=>setForm(f=>({...f,vencimento:e.target.value}))} style={{marginTop:4}}/></label></>}
      <label style={{fontSize:12,color:D.text3}}>Data de compra<input type="date" value={form.data||hoje.toISOString().slice(0,10)} onChange={e=>setForm(f=>({...f,data:e.target.value}))} style={{marginTop:4}}/></label>
      {data.bancos.length>0&&<label style={{fontSize:12,color:D.text3}}>Vincular ao banco<select value={form.bancoId||""} onChange={e=>setForm(f=>({...f,bancoId:e.target.value}))} style={{marginTop:4}}><option value="">Nenhum</option>{data.bancos.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}</select></label>}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn outline color={D.text3} onClick={()=>setModal(false)}>Cancelar</Btn><Btn color={D.blue} onClick={saveInv}>Salvar</Btn></div>
    </Modal>}
    {modalDiv&&<Modal title="Registrar provento" onClose={()=>setModalDiv(false)}>
      <label style={{fontSize:12,color:D.text3}}>Ticker<input value={divForm.ticker||""} onChange={e=>setDivForm(f=>({...f,ticker:e.target.value.toUpperCase()}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Valor recebido ({currency})<input type="number" value={divForm.valor||""} onChange={e=>setDivForm(f=>({...f,valor:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Tipo<select value={divForm.tipo||"Dividendo"} onChange={e=>setDivForm(f=>({...f,tipo:e.target.value}))} style={{marginTop:4}}><option>Dividendo</option><option>JCP</option><option>JUROS SOBRE CAPITAL PROPRIO</option><option>Rendimento FII</option><option>Rendimento ETF</option></select></label>
      <label style={{fontSize:12,color:D.text3}}>Data de pagamento<input type="date" value={divForm.data||hoje.toISOString().slice(0,10)} onChange={e=>setDivForm(f=>({...f,data:e.target.value}))} style={{marginTop:4}}/></label>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn outline color={D.text3} onClick={()=>setModalDiv(false)}>Cancelar</Btn><Btn color={D.gold} onClick={saveDiv}>Salvar</Btn></div>
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
  const [codigo,setCodigo]=useState(()=>lsGet("sw_codigo")||"");
  const [inputCod,setInputCod]=useState("");
  const [swData,setSwData]=useState(null);
  const [loading,setLoading]=useState(false);
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [nomeUser,setNomeUser]=useState(()=>lsGet("sw_nome")||"");
  const [setupNome,setSetupNome]=useState("");

  useEffect(()=>{if(codigo)loadSW();},[codigo]);

  async function loadSW(){
    setLoading(true);
    try{
      // Usa localStorage como fallback já que Supabase pode não ter tabela splitwise
      const local=lsGet(`sw_${codigo}`);
      if(local)setSwData(local);
    }catch{}
    setLoading(false);
  }

  function saveSW(d){
    setSwData(d);
    lsSet(`sw_${codigo}`,d);
  }

  function criarGrupo(){
    if(!setupNome.trim()||!inputCod.trim())return;
    const cod=inputCod.trim().toUpperCase();
    const nome=setupNome.trim();
    lsSet("sw_codigo",cod);lsSet("sw_nome",nome);
    setCodigo(cod);setNomeUser(nome);
    const d={codigo:cod,membros:[{nome,email:userEmail||nome}],despesas:[],pagamentos:[]};
    saveSW(d);setInputCod("");setSetupNome("");
  }

  function entrarGrupo(){
    if(!inputCod.trim()||!setupNome.trim())return;
    const cod=inputCod.trim().toUpperCase();
    const nome=setupNome.trim();
    lsSet("sw_codigo",cod);lsSet("sw_nome",nome);
    setCodigo(cod);setNomeUser(nome);
    const existing=lsGet(`sw_${cod}`);
    if(existing){
      if(!existing.membros.find(m=>m.nome===nome)){
        existing.membros.push({nome,email:userEmail||nome});
        saveSW(existing);
      }else{setSwData(existing);}
    }else{
      const d={codigo:cod,membros:[{nome,email:userEmail||nome}],despesas:[],pagamentos:[]};
      saveSW(d);
    }
    setInputCod("");setSetupNome("");
  }

  function addDespesa(){
    if(!form.descricao||!form.valor||!form.pagoPor)return;
    const membros=swData.membros.map(m=>m.nome);
    const selecionados=form.divisao||membros;
    const porPessoa=parseFloat(form.valor)/selecionados.length;
    const d={id:uid(),descricao:form.descricao,valor:parseFloat(form.valor),pagoPor:form.pagoPor,data:form.data||hoje.toISOString().slice(0,10),categoria:form.categoria||"Outros",divisao:selecionados.map(nome=>({nome,valor:porPessoa}))};
    saveSW({...swData,despesas:[...swData.despesas,d]});
    setModal(null);setForm({});
  }

  function registrarPagamento(){
    if(!form.de||!form.para||!form.valor)return;
    const p={id:uid(),de:form.de,para:form.para,valor:parseFloat(form.valor),data:form.data||hoje.toISOString().slice(0,10)};
    saveSW({...swData,pagamentos:[...swData.pagamentos,p]});
    setModal(null);setForm({});
  }

  function calcSaldos(){
    if(!swData)return {};
    const saldos={};
    swData.membros.forEach(m=>{saldos[m.nome]=0;});
    swData.despesas.forEach(d=>{
      saldos[d.pagoPor]=(saldos[d.pagoPor]||0)+d.valor;
      d.divisao.forEach(div=>{saldos[div.nome]=(saldos[div.nome]||0)-div.valor;});
    });
    swData.pagamentos?.forEach(p=>{
      saldos[p.de]=(saldos[p.de]||0)-p.valor;
      saldos[p.para]=(saldos[p.para]||0)+p.valor;
    });
    return saldos;
  }

  function calcDividas(){
    const saldos=calcSaldos();
    const devedores=Object.entries(saldos).filter(([,v])=>v<0).map(([n,v])=>({nome:n,valor:-v}));
    const credores=Object.entries(saldos).filter(([,v])=>v>0).map(([n,v])=>({nome:n,valor:v}));
    const transacoes=[];
    const dev=[...devedores],cred=[...credores];
    while(dev.length&&cred.length){
      const d=dev[0],c=cred[0];
      const v=Math.min(d.valor,c.valor);
      if(v>0.01)transacoes.push({de:d.nome,para:c.nome,valor:v});
      d.valor-=v;c.valor-=v;
      if(d.valor<0.01)dev.shift();
      if(c.valor<0.01)cred.shift();
    }
    return transacoes;
  }

  if(!codigo||!nomeUser){
    return <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
      <Card>
        <p style={{fontSize:16,fontWeight:700,color:D.text,marginBottom:4}}>💸 Splitwise</p>
        <p style={{fontSize:12,color:D.text3,marginBottom:16}}>Divida despesas com família e amigos. Todos veem quem deve o quê.</p>
        <label style={{fontSize:12,color:D.text3,display:"block",marginBottom:10}}>Seu nome<input value={setupNome} onChange={e=>setSetupNome(e.target.value)} placeholder="Ex: Leonardo" style={{marginTop:4}}/></label>
        <label style={{fontSize:12,color:D.text3,display:"block",marginBottom:12}}>Código do grupo<input value={inputCod} onChange={e=>setInputCod(e.target.value.toUpperCase())} placeholder="Ex: FAMILIA2024" style={{marginTop:4}}/></label>
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={criarGrupo} color={D.green}>Criar novo grupo</Btn>
          <Btn onClick={entrarGrupo} color={D.blue} outline>Entrar em grupo existente</Btn>
        </div>
        <p style={{fontSize:11,color:D.text3,marginTop:10}}>💡 Para compartilhar: informe o mesmo código para outras pessoas entrarem no seu grupo.</p>
      </Card>
    </div>;
  }

  if(loading||!swData)return <p style={{color:D.text3,fontSize:13}}>Carregando...</p>;

  const saldos=calcSaldos();const dividas=calcDividas();
  const meuSaldo=saldos[nomeUser]||0;

  return <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
    {/* Header */}
    <Card style={{border:`1px solid ${D.green}33`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
        <div>
          <p style={{fontSize:14,fontWeight:700,color:D.text}}>💸 Grupo: {swData.codigo}</p>
          <p style={{fontSize:11,color:D.text3}}>Olá, {nomeUser} · {swData.membros.length} membro{swData.membros.length!==1?"s":""}</p>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:6}}>{swData.membros.map(m=><Badge key={m.nome} color={m.nome===nomeUser?D.green:D.text3}>{m.nome}</Badge>)}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <p style={{fontSize:11,color:D.text3}}>Seu saldo</p>
          <p style={{fontSize:20,fontWeight:700,color:meuSaldo>=0?D.green:D.red}}>{meuSaldo>=0?"+":""}{fmtM(meuSaldo,currency)}</p>
          <p style={{fontSize:10,color:D.text3}}>{meuSaldo>0?"te devem":meuSaldo<0?"você deve":"quitado ✓"}</p>
        </div>
      </div>
    </Card>

    {/* Saldos */}
    <Card>
      <p style={{fontSize:13,fontWeight:700,color:D.text,marginBottom:10}}>Saldos do grupo</p>
      {Object.entries(saldos).map(([nome,val])=><div key={nome} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${D.border}`}}>
        <span style={{fontSize:13,color:nome===nomeUser?D.green:D.text,fontWeight:nome===nomeUser?600:400}}>{nome}{nome===nomeUser?" (você)":""}</span>
        <span style={{fontSize:13,fontWeight:700,color:val>=0?D.green:D.red}}>{val>=0?"+":""}{fmtM(val,currency)}</span>
      </div>)}
    </Card>

    {/* Quem deve pra quem */}
    {dividas.length>0&&<Card style={{border:`1px solid ${D.gold}33`}}>
      <p style={{fontSize:13,fontWeight:700,color:D.text,marginBottom:10}}>💰 Quem deve pra quem</p>
      {dividas.map((d,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:D.bg3,borderRadius:8,marginBottom:6,border:`1px solid ${(d.de===nomeUser||d.para===nomeUser)?D.gold+"44":D.border}`}}>
        <span style={{fontSize:13,color:D.text}}><span style={{color:D.red,fontWeight:600}}>{d.de}</span> deve para <span style={{color:D.green,fontWeight:600}}>{d.para}</span></span>
        <span style={{fontSize:14,fontWeight:700,color:D.gold}}>{fmtM(d.valor,currency)}</span>
      </div>)}
    </Card>}

    {/* Ações */}
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      <Btn onClick={()=>{setModal("despesa");setForm({pagoPor:nomeUser,divisao:swData.membros.map(m=>m.nome)});}} color={D.green}>+ Nova despesa</Btn>
      <Btn onClick={()=>{setModal("pagamento");setForm({de:nomeUser});}} color={D.blue} outline>✓ Registrar pagamento</Btn>
      <Btn onClick={()=>{setCodigo("");setNomeUser("");lsSet("sw_codigo","");lsSet("sw_nome","");}} color={D.red} outline sm>Sair do grupo</Btn>
    </div>

    {/* Despesas */}
    <Card>
      <p style={{fontSize:13,fontWeight:700,color:D.text,marginBottom:10}}>Despesas recentes</p>
      {swData.despesas.length===0&&<p style={{fontSize:13,color:D.text3}}>Nenhuma despesa ainda.</p>}
      {[...swData.despesas].reverse().slice(0,20).map(d=><div key={d.id} style={{padding:"10px 0",borderBottom:`1px solid ${D.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <p style={{margin:0,fontSize:13,fontWeight:600,color:D.text}}>{d.descricao}</p>
            <p style={{margin:"2px 0 0",fontSize:11,color:D.text3}}>{d.data} · Pago por <span style={{color:D.green}}>{d.pagoPor}</span></p>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontSize:14,fontWeight:700,color:D.text}}>{fmtM(d.valor,currency)}</span>
            <button onClick={()=>saveSW({...swData,despesas:swData.despesas.filter(x=>x.id!==d.id)})} style={{border:"none",background:"none",cursor:"pointer",color:D.red,fontSize:12}}>🗑</button>
          </div>
        </div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:4}}>{d.divisao.map(div=><span key={div.nome} style={{fontSize:10,background:D.bg3,color:D.text3,borderRadius:4,padding:"2px 6px"}}>{div.nome}: {fmtM(div.valor,currency)}</span>)}</div>
      </div>)}
    </Card>

    {modal==="despesa"&&<Modal title="Nova despesa" onClose={()=>setModal(null)}>
      <label style={{fontSize:12,color:D.text3}}>Descrição<input value={form.descricao||""} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Valor ({currency})<input type="number" value={form.valor||""} onChange={e=>setForm(f=>({...f,valor:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Pago por<select value={form.pagoPor||nomeUser} onChange={e=>setForm(f=>({...f,pagoPor:e.target.value}))} style={{marginTop:4}}>{swData.membros.map(m=><option key={m.nome}>{m.nome}</option>)}</select></label>
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

    {modal==="pagamento"&&<Modal title="Registrar pagamento" onClose={()=>setModal(null)}>
      <label style={{fontSize:12,color:D.text3}}>Quem pagou<select value={form.de||nomeUser} onChange={e=>setForm(f=>({...f,de:e.target.value}))} style={{marginTop:4}}>{swData.membros.map(m=><option key={m.nome}>{m.nome}</option>)}</select></label>
      <label style={{fontSize:12,color:D.text3}}>Para quem<select value={form.para||""} onChange={e=>setForm(f=>({...f,para:e.target.value}))} style={{marginTop:4}}><option value="">Selecione...</option>{swData.membros.filter(m=>m.nome!==form.de).map(m=><option key={m.nome}>{m.nome}</option>)}</select></label>
      <label style={{fontSize:12,color:D.text3}}>Valor ({currency})<input type="number" value={form.valor||""} onChange={e=>setForm(f=>({...f,valor:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Data<input type="date" value={form.data||hoje.toISOString().slice(0,10)} onChange={e=>setForm(f=>({...f,data:e.target.value}))} style={{marginTop:4}}/></label>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn outline color={D.text3} onClick={()=>setModal(null)}>Cancelar</Btn><Btn color={D.blue} onClick={registrarPagamento}>Registrar</Btn></div>
    </Modal>}
  </div>;
}

// ── Análise Tab ───────────────────────────────────────────────────────────────
function AnaliseTab({investimentos,profileId,market,currency}){
  const WL_KEY=`watchlist_${profileId}`;
  const [watchlist,setWatchlist]=useState(()=>lsGet(WL_KEY)||[]);
  const [wInput,setWInput]=useState("");const [wCat,setWCat]=useState("");const [wFiltro,setWFiltro]=useState("Todas");const [wLoading,setWLoading]=useState(false);
  const [chartTicker,setChartTicker]=useState(null);
  const [news,setNews]=useState({});const [newsLoading,setNewsLoading]=useState(false);
  const [compInput,setCompInput]=useState("");const [compList,setCompList]=useState([]);const [compLoading,setCompLoading]=useState(false);const [compData,setCompData]=useState([]);
  const [fundTicker,setFundTicker]=useState("");const [fundInput,setFundInput]=useState("");const [fundSymbol,setFundSymbol]=useState("BMFBOVESPA:PETR4");
  const [screenerSearch,setScreenerSearch]=useState("");
  const [calcForm,setCalcForm]=useState({pc:"",pa:"",qt:"",tipo:"acao",indice:"CDI",taxa:"",meses:""});const [calcRes,setCalcRes]=useState(null);
  const [simForm,setSimForm]=useState({ini:"",ap:"",tipo:"fixo",taxa:"",indice:"CDI",pctInd:"100",meses:""});const [simRes,setSimRes]=useState(null);
  const [alocRes,setAlocRes]=useState(null);const [alocLoading,setAlocLoading]=useState(false);
  const [notaRisco,setNotaRisco]=useState(null);const [riscoLoading,setRiscoLoading]=useState(false);
  const [sugestoes,setSugestoes]=useState(null);const [sugestLoading,setSugestLoading]=useState(false);
  const [erro,setErro]=useState("");
  const isBR=profileId==="br";
  useEffect(()=>{lsSet(WL_KEY,watchlist);},[watchlist]);

  // Auto-refresh watchlist a cada 60s
  
  const wlRefreshRef = useRef(null);
 useEffect(()=>{
  async function refreshAll(){
    if(!watchlist.length) return;
    const updated = await Promise.all(watchlist.map(async w=>{
      const real = await fetchPrecoReal(w.ticker);
      if(!real) return w;
      return {...w, preco:real.preco_atual, variacao_dia:real.variacao_dia};
    }));
    setWatchlist(updated);
  }
  refreshAll();
  wlRefreshRef.current=setInterval(refreshAll,60000);
  return()=>clearInterval(wlRefreshRef.current);
},[profileId]);
  
  async function addWatch() {
    const t = wInput.trim().toUpperCase();
    if (!t || watchlist.find(w => w.ticker === t)) { setWInput(""); return; }
    setWLoading(true);
    // 1. Busca preço real direto
    const real = await fetchPrecoReal(t);
    // 2. Claude só para nome/categoria/indicadores fundamentais
    let obj = { ticker: t, nome: t, categoria: wCat || "Outros", preco: real?.preco_atual || null, variacao_dia: real?.variacao_dia || null, pl: null, dy: real?.dy || null, roe: null, currency };
    try {
      const mercado = isBR ? "brasileira B3" : "australiana ASX";
      const txt = await askClaude(
        `Para o ativo ${t} na bolsa ${mercado}, retorne APENAS JSON com nome e indicadores fundamentais (não preço): {"nome":"nome curto","categoria":"Banco|Infraestrutura|Fundo Imobiliário|Energia|Tecnologia|Varejo|Saúde|Agronegócio|Mineração|Petróleo|ETF|Exterior|Outros","pl":number_or_null,"dy":number_or_null,"roe":number_or_null}`,
        300
      );
      const parsed = JSON.parse(txt);
      obj = { ...obj, nome: parsed.nome || obj.nome, categoria: wCat || parsed.categoria || "Outros", pl: parsed.pl || null, dy: real?.dy || parsed.dy || null, roe: parsed.roe || null };
    } catch {}
    setWatchlist(p => [...p, obj]);
    setWInput(""); setWLoading(false);
  }
  function addToComp(ticker){if(!compList.includes(ticker))setCompList(p=>[...p,ticker]);}

  async function fetchNews(){
    if(!watchlist.length){setErro("Adicione ativos à watchlist.");return;}
    setNewsLoading(true);setErro("");
    try{const txt=await askClaude(`Analista financeiro. Ativos: ${watchlist.map(w=>w.ticker).join(",")}. JSON: [{"ticker":"XX","noticias":[{"titulo":"str","resumo":"2 frases pt-BR","tipo":"resultado|dividendo|fato_relevante|noticia","data":"YYYY-MM-DD"}]}]`,1500);const arr=JSON.parse(txt);const map={};arr.forEach(x=>{map[x.ticker]=x.noticias;});setNews(map);}
    catch{setErro("Erro ao buscar notícias.");}setNewsLoading(false);
  }

  async function compararAtivos(){
    if(compList.length<2){setErro("Adicione pelo menos 2 ativos.");return;}
    setCompLoading(true);setErro("");
    const mercado=isBR?"brasileira B3":"australiana ASX";
    const moeda=isBR?"BRL":"AUD";
    try{
      const txt=await askClaude(`Analista financeiro. Dados de mercado atual da bolsa ${mercado} em ${moeda}. JSON array com um objeto por ticker [${compList.join(",")}]: {"ticker":"","nome":"","preco":number_or_null,"pl":number_or_null,"pvp":number_or_null,"dy":number_or_null,"roe":number_or_null,"divida_ebitda":number_or_null,"cagr_lucro":number_or_null,"margem_liquida":number_or_null}`,1400);
      const s=txt.indexOf("["),e=txt.lastIndexOf("]");if(s===-1)throw new Error();
      setCompData(JSON.parse(txt.slice(s,e+1)));
    }catch{setErro("Erro ao comparar.");}setCompLoading(false);
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

  async function buscarSugestoes(){
    setSugestLoading(true);setErro("");
    const mercado=isBR?"brasileira B3":"australiana ASX";
    try{
      const txt=await askClaude(`Analista fundamentalista. Melhores 5 oportunidades de compra na bolsa ${mercado} hoje. Critérios: P/L baixo, DY alto, ROE alto, crescimento, saúde financeira. JSON: {"mercado":"${isBR?"Brasil":"Austrália"}","acoes":[{"ticker":"str","nome":"str","setor":"str","preco":number,"pl":number,"dy":number,"roe":number,"score":0-10,"recomendacao":"Compra Forte|Compra|Neutro","justificativa":"2-3 frases","potencial_upside":"XX%"}]}`,1200);
      const s=txt.indexOf("{"),e=txt.lastIndexOf("}");if(s===-1)throw new Error();setSugestoes(JSON.parse(txt.slice(s,e+1)));
    }catch{setErro("Erro ao buscar sugestões.");}setSugestLoading(false);
  }

  function calcRent(){
    if(calcForm.tipo==="acao"){const pc=parseFloat(calcForm.pc),pa=parseFloat(calcForm.pa),qt=parseFloat(calcForm.qt);if(!pc||!pa||!qt)return;const lucro=(pa-pc)*qt;const imposto=isBR?calcImpostoBR(lucro,parseInt(calcForm.meses)||12):calcImpostoAU(lucro,parseInt(calcForm.meses)||12);setCalcRes({investido:pc*qt,atual:pa*qt,lucro,lucroLiq:lucro-imposto,imposto,pct:((pa-pc)/pc)*100});}
    else{const vi=parseFloat(calcForm.pc),m=parseInt(calcForm.meses)||12;if(!vi)return;const fakeInv={indice:calcForm.indice,taxaRF:calcForm.taxa,pctIndice:"100",rfTipo:"mais",valorInvestido:vi,valor:vi,data:new Date(Date.now()-m*30*24*60*60*1000).toISOString().slice(0,10)};const va=calcValorAtualRF(fakeInv);const lucro=va-vi;const imposto=isBR?calcImpostoBR(lucro,m):calcImpostoAU(lucro,m);setCalcRes({investido:vi,atual:va,lucro,lucroLiq:lucro-imposto,imposto,pct:((va-vi)/vi)*100,taxa:calcRFAnual(fakeInv).toFixed(2)});}
  }

  function simJuros(){
    const ini=parseFloat(simForm.ini)||0,ap=parseFloat(simForm.ap)||0,meses=parseInt(simForm.meses)||0;if(!meses)return;
    let tm;if(simForm.tipo==="fixo"){tm=parseFloat(simForm.taxa)/100;}
    else{const base=INDICES_RATE[simForm.indice]||10.5;const anual=simForm.tipo==="pct"?base*(parseFloat(simForm.pctInd)||100)/100:base+parseFloat(simForm.taxa||0);tm=Math.pow(1+anual/100,1/12)-1;}
    let saldo=ini;const pts=[{mes:0,saldo:Math.round(ini)}];
    for(let i=1;i<=meses;i++){saldo=saldo*(1+tm)+ap;if(i%(Math.max(1,Math.floor(meses/12)))===0||i===meses)pts.push({mes:i,saldo:Math.round(saldo)});}
    const rendimento=saldo-(ini+ap*meses);
    const imposto=isBR?calcImpostoBR(rendimento,meses):calcImpostoAU(rendimento,meses);
    const aliquota=isBR?(meses<=6?"22.5%":meses<=12?"20%":meses<=24?"17.5%":"15%"):(meses>=12?"50% desc.×32.5%":"32.5%");
    setSimRes({saldo:Math.round(saldo),saldoLiq:Math.round(saldo-imposto),aportado:Math.round(ini+ap*meses),juros:Math.round(rendimento),imposto:Math.round(imposto),pts,aliquota});
  }

  const wlFilt=wFiltro==="Todas"?watchlist:watchlist.filter(w=>(w.categoria||"Outros")===wFiltro);
  const cats=["Todas",...new Set(watchlist.map(w=>w.categoria||"Outros"))];
  function isBest(key,val,arr){if(val==null)return false;const vals=arr.map(a=>a[key]).filter(v=>v!=null);if(vals.length<2)return false;const ind=IND_COMP.find(i=>i.key===key);return ind?.higher?val===Math.max(...vals):val===Math.min(...vals);}
  const tipoIcons={resultado:"📊",dividendo:"💰",fato_relevante:"📢",noticia:"📰"};
  const tipoLine={resultado:D.blue,dividendo:D.green,fato_relevante:D.gold,noticia:D.text3};

  // Screener com busca manual
  const screenerSymbol=screenerSearch.trim().toUpperCase()||null;
  const screenerConfig=screenerSymbol
    ?{symbol:isBR?"BMFBOVESPA:"+screenerSymbol:screenerSymbol,width:"100%",height:490,locale:"pt_BR"}
    :{width:"100%",height:490,defaultColumn:"overview",defaultScreen:"most_capitalized",market,showToolbar:true,locale:"pt_BR"};

  return <div style={{display:"flex",flexDirection:"column",gap:"1.25rem"}}>
    {chartTicker&&<ChartModal ticker={chartTicker} onClose={()=>setChartTicker(null)}/>}
    {erro&&<div style={{background:D.red+"22",border:`1px solid ${D.red}44`,borderRadius:10,padding:"10px 14px",fontSize:12,color:D.red,display:"flex",justifyContent:"space-between"}}>{erro}<button onClick={()=>setErro("")} style={{border:"none",background:"none",cursor:"pointer",color:D.red}}>✕</button></div>}

    {/* Sugestões */}
    <Card style={{border:`1px solid ${D.gold}33`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
        <p style={{fontSize:14,fontWeight:700,color:D.text}}>🔍 Melhores ações para comprar agora</p>
        <Btn sm color={D.gold} onClick={buscarSugestoes} disabled={sugestLoading}>{sugestLoading?"Analisando...":"Analisar mercado"}</Btn>
      </div>
      {!sugestoes&&!sugestLoading&&<p style={{fontSize:12,color:D.text3}}>Análise fundamentalista do mercado {isBR?"brasileiro":"australiano"}.</p>}
      {sugestoes&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
        {sugestoes.acoes?.map((a,i)=><div key={i} style={{background:D.bg3,borderRadius:10,padding:"12px 14px",border:`1px solid ${a.recomendacao==="Compra Forte"?D.green+"44":D.blue+"33"}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <span onClick={()=>setChartTicker(a.ticker)} style={{fontSize:15,fontWeight:700,color:D.green,cursor:"pointer"}}>{a.ticker}</span>
              <span style={{fontSize:12,color:D.text2}}>{a.nome}</span>
              <Badge color={D.purple}>{a.setor}</Badge>
              <Badge color={a.recomendacao==="Compra Forte"?D.green:D.blue}>{a.recomendacao}</Badge>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <p style={{margin:0,fontSize:13,fontWeight:700,color:D.text}}>{fmtM(a.preco,currency)}</p>
              <p style={{margin:0,fontSize:11,color:D.green}}>↑ {a.potencial_upside}</p>
              <button onClick={()=>addToComp(a.ticker)} title="Adicionar ao comparador" style={{marginTop:4,border:`1px solid ${D.blue}`,background:"transparent",color:D.blue,borderRadius:6,padding:"2px 8px",fontSize:10,cursor:"pointer"}}>+ Comparar</button>
            </div>
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
            <Badge color={D.blue}>P/L {a.pl}</Badge><Badge color={D.gold}>DY {a.dy}%</Badge><Badge color={D.purple}>ROE {a.roe}%</Badge>
            <div style={{display:"flex",alignItems:"center",gap:3}}>{Array.from({length:10},(_,j)=><div key={j} style={{width:7,height:7,borderRadius:1,background:j<a.score?D.gold:D.bg2}}/>)}<span style={{fontSize:10,color:D.gold,fontWeight:700,marginLeft:3}}>{a.score}/10</span></div>
          </div>
          <p style={{margin:0,fontSize:12,color:D.text2,lineHeight:1.5}}>{a.justificativa}</p>
        </div>)}
      </div>}
    </Card>

    {/* Watchlist */}
    <Card>
      <p style={{fontSize:14,fontWeight:700,color:D.text,marginBottom:4}}>Carteira de acompanhamento</p>
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
          {w.variacao_dia!=null&&<p style={{margin:"0 0 4px",fontSize:11,fontWeight:600,color:w.variacao_dia>=0?D.green:D.red}}>{w.variacao_dia>=0?"▲":"▼"} {Math.abs(w.variacao_dia).toFixed(2)}% hoje</p>}
          <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
            {w.pl!=null&&<Badge color={D.blue}>P/L {Number(w.pl).toFixed(1)}</Badge>}
            {w.dy!=null&&<Badge color={D.gold}>DY {Number(w.dy).toFixed(1)}%</Badge>}
          </div>
          <button onClick={()=>addToComp(w.ticker)} style={{marginTop:5,border:`1px solid ${D.blue}44`,background:"transparent",color:D.blue,borderRadius:5,padding:"2px 6px",fontSize:9,cursor:"pointer",width:"100%"}}>+ Comparar</button>
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
      </div>:<p style={{fontSize:12,color:D.text3}}>Clique "Avaliar" para análise de risco.</p>}
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

    {/* Alertas */}
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <p style={{fontSize:14,fontWeight:700,color:D.text}}>🔔 Alertas e anúncios</p>
        <Btn sm onClick={fetchNews} disabled={newsLoading}>{newsLoading?"Buscando...":"Atualizar"}</Btn>
      </div>
      {Object.keys(news).length===0&&!newsLoading&&<p style={{fontSize:12,color:D.text3}}>Clique "Atualizar" para buscar anúncios.</p>}
      {Object.entries(news).map(([ticker,noticias])=><div key={ticker} style={{marginBottom:12}}><p style={{fontSize:13,fontWeight:700,color:D.green,margin:"0 0 6px"}}>{ticker}</p>{noticias.map((n,i)=><div key={i} style={{background:D.bg3,borderRadius:8,padding:"8px 12px",marginBottom:6,borderLeft:`3px solid ${tipoLine[n.tipo]||D.text3}`}}><div style={{display:"flex",gap:6,marginBottom:3}}><span>{tipoIcons[n.tipo]||"📰"}</span><span style={{fontSize:12,fontWeight:600,color:D.text}}>{n.titulo}</span><span style={{fontSize:10,color:D.text3,marginLeft:"auto"}}>{n.data}</span></div><p style={{margin:0,fontSize:12,color:D.text2}}>{n.resumo}</p></div>)}</div>)}
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

    {/* Screener com busca manual */}
    <Card>
      <p style={{fontSize:14,fontWeight:700,color:D.text,marginBottom:6}}>Screener de ações</p>
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        <input value={screenerSearch} onChange={e=>setScreenerSearch(e.target.value.toUpperCase())} placeholder={`Buscar ticker manualmente (ex: ${isBR?"VALE3":"RIO.AX"})...`} style={{flex:1}}/>
        {screenerSearch&&<Btn sm color={D.text3} outline onClick={()=>setScreenerSearch("")}>Limpar</Btn>}
      </div>
      {screenerSearch?<TVWidget type="financials" config={{symbol:isBR&&!/\./.test(screenerSearch)?"BMFBOVESPA:"+screenerSearch:screenerSearch,displayMode:"regular",width:"100%",height:490,locale:"pt_BR"}}/>:<TVWidget type="screener" config={{width:"100%",height:490,defaultColumn:"overview",defaultScreen:"most_capitalized",market,showToolbar:true,locale:"pt_BR"}}/>}
    </Card>

    {/* Calculadora com imposto */}
    <Card>
      <p style={{fontSize:14,fontWeight:700,color:D.text,marginBottom:10}}>Calcular rentabilidade</p>
      <label style={{fontSize:12,color:D.text3,display:"block",marginBottom:8}}>Tipo<select value={calcForm.tipo} onChange={e=>setCalcForm(f=>({...f,tipo:e.target.value}))} style={{marginTop:4}}><option value="acao">Ações / FII / ETF</option><option value="rf">Renda Fixa</option></select></label>
      {calcForm.tipo==="acao"?<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:8,marginBottom:10}}>
        {[["Preço compra","pc"],["Preço atual","pa"],["Quantidade","qt"],["Meses investido","meses"]].map(([l,k])=><label key={k} style={{fontSize:12,color:D.text3}}>{l}<input type="number" value={calcForm[k]||""} onChange={e=>setCalcForm(f=>({...f,[k]:e.target.value}))} style={{marginTop:4}}/></label>)}
      </div>:<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:8,marginBottom:10}}>
        <label style={{fontSize:12,color:D.text3}}>Valor investido<input type="number" value={calcForm.pc||""} onChange={e=>setCalcForm(f=>({...f,pc:e.target.value}))} style={{marginTop:4}}/></label>
        <label style={{fontSize:12,color:D.text3}}>Índice<select value={calcForm.indice} onChange={e=>setCalcForm(f=>({...f,indice:e.target.value}))} style={{marginTop:4}}>{INDICES_RF.map(i=><option key={i}>{i}</option>)}</select></label>
        <label style={{fontSize:12,color:D.text3}}>Taxa adicional %<input type="number" value={calcForm.taxa||""} onChange={e=>setCalcForm(f=>({...f,taxa:e.target.value}))} placeholder="Ex: 9" style={{marginTop:4}}/></label>
        <label style={{fontSize:12,color:D.text3}}>Meses<input type="number" value={calcForm.meses||""} onChange={e=>setCalcForm(f=>({...f,meses:e.target.value}))} style={{marginTop:4}}/></label>
      </div>}
      <Btn onClick={calcRent}>Calcular</Btn>
      {calcRes&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:8,marginTop:12}}>
        <MetricCard label="Investido" value={fmtM(calcRes.investido,currency)}/>
        <MetricCard label="Valor bruto" value={fmtM(calcRes.atual,currency)} color={D.blue}/>
        <MetricCard label="Lucro bruto" value={fmtM(calcRes.lucro,currency)} color={calcRes.lucro>=0?D.green:D.red} sub={calcRes.pct.toFixed(2)+"%"}/>
        <MetricCard label="Imposto est." value={fmtM(calcRes.imposto,currency)} color={D.red}/>
        <MetricCard label="Lucro líquido" value={fmtM(calcRes.lucroLiq,currency)} color={D.green}/>
        {calcRes.taxa&&<MetricCard label="Taxa a.a." value={calcRes.taxa+"%"} color={D.gold}/>}
      </div>}
    </Card>

    {/* Simulador com imposto */}
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

    {/* Alocação */}
    <Card>
      <p style={{fontSize:14,fontWeight:700,color:D.text,marginBottom:6}}>Sugestão de alocação ideal</p>
      <Btn onClick={sugerirAloc} disabled={alocLoading} color={D.purple}>{alocLoading?"Analisando...":"Analisar carteira"}</Btn>
      {alocRes&&<div style={{marginTop:12}}><p style={{fontSize:13,color:D.text2,marginBottom:10,lineHeight:1.6}}>{alocRes.analise}</p>{alocRes.sugestao?.map((s,i)=><div key={i} style={{background:D.bg3,borderRadius:10,padding:"10px 14px",marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}><span style={{fontWeight:600,color:D.text}}>{s.tipo}</span><span style={{color:D.text3}}>{s.pct_atual}% → <strong style={{color:D.green}}>{s.pct_ideal}%</strong></span></div><p style={{margin:0,fontSize:12,color:D.text3}}>{s.acao}</p></div>)}</div>}
    </Card>
  </div>;
}

// ── Cartão Tab ────────────────────────────────────────────────────────────────
function CartaoTab({data,setData,currency,mes}){
  const [modal,setModal]=useState(false);const [form,setForm]=useState({});
  const fatMes=data.faturas.filter(f=>f.mes===mes);const totF=fatMes.reduce((a,b)=>a+b.valor,0);
  function saveFatura(){const f={id:form.editId||uid(),cartao:form.cartao||"",valor:parseFloat(form.valor)||0,vencimento:form.vencimento||"",mes,bancoId:form.bancoId||null};setData(d=>{let fat=form.editId?d.faturas.map(x=>x.id===form.editId?f:x):[...d.faturas,f];let txs=[...d.transacoes];if(f.bancoId&&f.vencimento&&!form.editId)txs.push({id:uid(),tipo:"despesa",descricao:`Fatura ${f.cartao}`,valor:f.valor,categoria:"Cartão de Crédito",data:f.vencimento,bancoId:f.bancoId});return{...d,faturas:fat,transacoes:txs};});setModal(false);setForm({});}
  return <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
    <Btn onClick={()=>{setModal(true);setForm({});}} color={D.purple} style={{alignSelf:"flex-start"}}>+ Nova fatura</Btn>
    {fatMes.length===0&&<p style={{fontSize:13,color:D.text3}}>Nenhuma fatura neste mês.</p>}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:10}}>
      {fatMes.map(f=><Card key={f.id} style={{border:`1px solid ${D.purple}33`}}>
        <p style={{margin:"0 0 4px",fontSize:13,fontWeight:700,color:D.purple}}>{f.cartao||"Cartão"}</p>
        <p style={{margin:"0 0 2px",fontSize:22,fontWeight:700,color:D.text}}>{fmtM(f.valor,currency)}</p>
        {f.vencimento&&<p style={{margin:0,fontSize:11,color:D.text3}}>📅 Vence: {f.vencimento}</p>}
        {f.bancoId&&<p style={{margin:"2px 0 0",fontSize:11,color:D.blue}}>🏦 {data.bancos.find(b=>b.id===f.bancoId)?.nome} — débito auto</p>}
        <div style={{display:"flex",gap:4,marginTop:10}}>
          <button onClick={()=>{setModal(true);setForm({...f,editId:f.id});}} style={{border:"none",background:"none",cursor:"pointer",fontSize:13,color:D.text3}}>✏️</button>
          <button onClick={()=>setData(d=>({...d,faturas:d.faturas.filter(x=>x.id!==f.id)}))} style={{border:"none",background:"none",cursor:"pointer",fontSize:13,color:D.red}}>🗑</button>
        </div>
      </Card>)}
    </div>
    {fatMes.length>0&&<Card><p style={{fontSize:13,color:D.text2}}>Total: <strong style={{color:D.purple,fontSize:16}}>{fmtM(totF,currency)}</strong></p></Card>}
    {modal&&<Modal title={form.editId?"Editar fatura":"Nova fatura"} onClose={()=>setModal(false)}>
      <label style={{fontSize:12,color:D.text3}}>Cartão<input value={form.cartao||""} onChange={e=>setForm(f=>({...f,cartao:e.target.value}))} placeholder="Ex: Nubank, Santander..." style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Valor ({currency})<input type="number" value={form.valor||""} onChange={e=>setForm(f=>({...f,valor:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Vencimento<input type="date" value={form.vencimento||""} onChange={e=>setForm(f=>({...f,vencimento:e.target.value}))} style={{marginTop:4}}/></label>
      <label style={{fontSize:12,color:D.text3}}>Banco para débito<select value={form.bancoId||""} onChange={e=>setForm(f=>({...f,bancoId:e.target.value}))} style={{marginTop:4}}><option value="">Nenhum</option>{data.bancos.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}</select></label>
      {form.bancoId&&<div style={{background:D.green+"22",border:`1px solid ${D.green}44`,borderRadius:8,padding:"8px 12px",fontSize:11,color:D.green}}>✓ Débito automático em {data.bancos.find(b=>b.id===form.bancoId)?.nome}</div>}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn outline color={D.text3} onClick={()=>setModal(false)}>Cancelar</Btn><Btn color={D.purple} onClick={saveFatura}>Salvar</Btn></div>
    </Modal>}
  </div>;
}

// ── App Principal ─────────────────────────────────────────────────────────────
export default function App(){
  const [session,setSession]=useState(()=>lsGet("session"));
  const [allData,setAllData]=useState(()=>lsGet("all_profiles")||EMPTY_ALL);
  const [syncing,setSyncing]=useState(false);
  const [profileId,setProfileId]=useState(()=>lsGet("active_profile")||"br");
  const [tab,setTab]=useState(0);
  const [mes,setMes]=useState(MES_ATUAL);
  const [grafico,setGrafico]=useState("barras");
  const saveTimer=useRef(null);
  const importRef=useRef(null);

  useEffect(()=>{if(!session)return;(async()=>{setSyncing(true);try{const r=await supa.load(session.token,session.user.id);if(r){setAllData(r);lsSet("all_profiles",r);}}catch{}setSyncing(false);})();},[session?.token]);

  function setData(upd){setAllData(all=>{const prev=all[profileId]||{...EMPTY};const next=typeof upd==="function"?upd(prev):{...prev,...upd};const updated={...all,[profileId]:next};lsSet("all_profiles",updated);if(session){clearTimeout(saveTimer.current);saveTimer.current=setTimeout(()=>supa.save(session.token,session.user.id,updated).catch(()=>{}),1500);}return updated;});}
  function handleLogin(t,u){const s={token:t,user:u};setSession(s);lsSet("session",s);}
  async function handleLogout(){if(session)await supa.signOut(session.token);setSession(null);lsSet("session",null);}
  useEffect(()=>{lsSet("active_profile",profileId);setTab(0);},[profileId]);

  function exportar(){const p={version:4,exportedAt:new Date().toISOString(),all_profiles:allData,watchlist_br:lsGet("watchlist_br")||[],watchlist_au:lsGet("watchlist_au")||[]};const b=new Blob([JSON.stringify(p,null,2)],{type:"application/json"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=`financas_${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(u);}
  function importar(e){const file=e.target.files[0];if(!file)return;const r=new FileReader();r.onload=ev=>{try{const p=JSON.parse(ev.target.result);if(!p.all_profiles){alert("Arquivo inválido.");return;}if(!window.confirm("Substituir todos os dados?"))return;lsSet("all_profiles",p.all_profiles);if(p.watchlist_br)lsSet("watchlist_br",p.watchlist_br);if(p.watchlist_au)lsSet("watchlist_au",p.watchlist_au);setAllData(p.all_profiles);if(session)supa.save(session.token,session.user.id,p.all_profiles).catch(()=>{});alert("✅ Dados restaurados!");}catch{alert("Arquivo inválido.");}};r.readAsText(file);e.target.value="";}

  if(!session)return <><style>{GS}</style><LoginScreen onLogin={handleLogin}/></>;

  const profile=PROFILES.find(p=>p.id===profileId);
  const currency=profile.currency;
  const data=allData[profileId]||{...EMPTY};
  const catD=data.catD||CAT_D_DEF,catR=data.catR||CAT_R_DEF;

  const txMes=data.transacoes.filter(t=>{const d=new Date(t.data);return d.getMonth()===mes&&d.getFullYear()===ANO_ATUAL;});
  const totR=txMes.filter(t=>t.tipo==="receita").reduce((a,b)=>a+b.valor,0);
  const totD=txMes.filter(t=>t.tipo==="despesa").reduce((a,b)=>a+b.valor,0);
  const totInv=data.investimentos.reduce((a,b)=>a+(b.valorAtual||b.valorInvestido||b.valor||0),0);
  function saldoBanco(b){const txs=data.transacoes.filter(t=>t.bancoId===b.id);return(b.saldoInicial||0)+txs.filter(t=>t.tipo==="receita").reduce((a,x)=>a+x.valor,0)-txs.filter(t=>t.tipo==="despesa").reduce((a,x)=>a+x.valor,0);}
  const totBancos=data.bancos.reduce((a,b)=>a+saldoBanco(b),0);
  const patrimonioLiq=totBancos+totInv;
  const tiposI=TIPOS_INV.map(t=>({t,v:data.investimentos.filter(i=>i.tipo===t).reduce((a,b)=>a+(b.valorAtual||b.valorInvestido||b.valor||0),0)})).filter(x=>x.v>0);
  const ultimos6=Array.from({length:6},(_,i)=>{const d=new Date(ANO_ATUAL,MES_ATUAL-5+i,1),m=d.getMonth(),a=d.getFullYear();const txs=data.transacoes.filter(t=>{const td=new Date(t.data);return td.getMonth()===m&&td.getFullYear()===a;});return{label:MESES[m],r:txs.filter(t=>t.tipo==="receita").reduce((a,b)=>a+b.valor,0),d:txs.filter(t=>t.tipo==="despesa").reduce((a,b)=>a+b.valor,0)};});
  let acc=0;const lineData=ultimos6.map(d=>{acc+=d.r-d.d;return{label:d.label,v:acc};});
  const catPieD=catD.map((c,i)=>({label:c,v:txMes.filter(t=>t.tipo==="despesa"&&t.categoria===c).reduce((a,b)=>a+b.valor,0),color:CORES[i%CORES.length]})).filter(x=>x.v>0);
  const catPieR=catR.map((c,i)=>({label:c,v:txMes.filter(t=>t.tipo==="receita"&&t.categoria===c).reduce((a,b)=>a+b.valor,0),color:CORES[i%CORES.length]})).filter(x=>x.v>0);

  useEffect(()=>{
    if(!data.recorrencias?.length)return;
    data.recorrencias.forEach(rec=>{
      const jaLancou=data.transacoes.some(t=>t.recorrenciaId===rec.id&&new Date(t.data).getMonth()===MES_ATUAL&&new Date(t.data).getFullYear()===ANO_ATUAL);
      if(!jaLancou&&rec.dia<=hoje.getDate()){setData(d=>({...d,transacoes:[...d.transacoes,{id:uid(),tipo:rec.tipo,descricao:rec.descricao,valor:rec.valor,categoria:rec.categoria,data:`${ANO_ATUAL}-${String(MES_ATUAL+1).padStart(2,"0")}-${String(rec.dia).padStart(2,"0")}`,bancoId:rec.bancoId||null,recorrenciaId:rec.id}]}));}
    });
  },[profileId]);

  return <>
    <style>{GS}</style>
    <div style={{maxWidth:780,margin:"0 auto",padding:"0.75rem 1rem 4rem",minHeight:"100vh"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem",flexWrap:"wrap",gap:8,padding:"0.75rem 1rem",background:D.card,borderRadius:14,border:`1px solid ${D.border}`,position:"sticky",top:8,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:22,filter:`drop-shadow(0 0 8px ${D.green})`}}>💰</span>
          <div><p style={{margin:0,fontSize:15,fontWeight:800,color:D.text}}>Controle Financeiro</p>{syncing&&<p style={{margin:0,fontSize:10,color:D.green}}>● sincronizando...</p>}</div>
        </div>
        <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
          {PROFILES.map(p=><button key={p.id} onClick={()=>setProfileId(p.id)} style={{padding:"5px 12px",borderRadius:20,fontSize:12,cursor:"pointer",fontWeight:profileId===p.id?700:400,background:profileId===p.id?D.green:"transparent",color:profileId===p.id?"#000":D.text3,border:`1px solid ${profileId===p.id?D.green:D.border}`}}>{p.label}</button>)}
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
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10}}>
          <MetricCard label="Receitas" value={fmtM(totR,currency)} color={D.green}/>
          <MetricCard label="Despesas" value={fmtM(totD,currency)} color={D.red}/>
          <MetricCard label="Saldo Bancos" value={fmtM(totBancos,currency)} color={totBancos>=0?D.green:D.red}/>
          <MetricCard label="Investimentos" value={fmtM(totInv,currency)} color={D.blue}/>
        </div>
        <Card><ScoreCard data={data}/></Card>
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
            <p style={{fontSize:14,fontWeight:700,color:D.text}}>Evolução financeira</p>
            <div style={{display:"flex",gap:3}}>
              {[["barras","📊"],["pizza_d","🥧D"],["pizza_r","🥧R"],["linha","📈"]].map(([v,l])=><button key={v} onClick={()=>setGrafico(v)} style={{padding:"4px 10px",borderRadius:16,fontSize:11,cursor:"pointer",border:grafico===v?`1px solid ${D.green}`:`1px solid ${D.border}`,background:grafico===v?D.green+"22":"transparent",color:grafico===v?D.green:D.text3}}>{l}</button>)}
            </div>
          </div>
          {grafico==="barras"&&<BarChart data={ultimos6} currency={currency}/>}
          {grafico==="pizza_d"&&<PieChart slices={catPieD}/>}
          {grafico==="pizza_r"&&<PieChart slices={catPieR}/>}
          {grafico==="linha"&&<LineChart data={lineData} currency={currency}/>}
        </Card>
        {data.orcamentos?.length>0&&<Card>
          <p style={{fontSize:13,fontWeight:700,color:D.text,marginBottom:10}}>🎯 Orçamento</p>
          {data.orcamentos.map(orc=>{const gasto=txMes.filter(t=>t.tipo==="despesa"&&t.categoria===orc.categoria).reduce((a,b)=>a+b.valor,0);const pct=orc.valor>0?Math.min(100,(gasto/orc.valor)*100):0;const cor=pct>90?D.red:pct>70?D.gold:D.green;return <div key={orc.id} style={{marginBottom:10}}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}><span style={{color:D.text2}}>{orc.categoria}</span><span style={{color:cor,fontWeight:600}}>{fmtM(gasto,currency)} / {fmtM(orc.valor,currency)}</span></div><div style={{background:D.bg3,borderRadius:4,height:5,overflow:"hidden"}}><div style={{width:pct+"%",background:cor,height:5,borderRadius:4}}/></div>{pct>90&&<p style={{fontSize:10,color:D.red,marginTop:2}}>⚠️ {pct>=100?"Ultrapassado!":"Próximo do limite"}</p>}</div>;})}
        </Card>}
        {data.bancos.length>0&&<Card><p style={{fontSize:13,fontWeight:700,color:D.text,marginBottom:8}}>Bancos</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8}}>{data.bancos.map(b=>{const s=saldoBanco(b);return <div key={b.id} style={{background:D.bg3,borderRadius:10,padding:"10px 14px"}}><p style={{margin:0,fontSize:11,color:D.blue,fontWeight:600}}>🏦 {b.nome}</p><p style={{margin:"4px 0 0",fontSize:17,fontWeight:700,color:s>=0?D.green:D.red}}>{fmtM(s,currency)}</p></div>;})}</div></Card>}
        {tiposI.length>0&&<Card><p style={{fontSize:13,fontWeight:700,color:D.text,marginBottom:8}}>Carteira</p>{tiposI.map((x,i)=><div key={x.t} style={{marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:D.text2}}>{x.t}</span><span style={{fontWeight:600,color:CORES[i%CORES.length]}}>{fmtM(x.v,currency)} <span style={{color:D.text3,fontWeight:400}}>({totInv>0?Math.round(x.v/totInv*100):0}%)</span></span></div><MiniBar valor={x.v} total={totInv} cor={CORES[i%CORES.length]}/></div>)}</Card>}
      </div>}

      {tab===1&&<BancosTab data={data} setData={setData} currency={currency}/>}
      {tab===2&&<LancamentosTab data={data} setData={setData} currency={currency} mes={mes}/>}
      {tab===3&&<CartaoTab data={data} setData={setData} currency={currency} mes={mes}/>}
      {tab===4&&<InvestimentosTab data={data} setData={setData} currency={currency} profileId={profileId}/>}
      {tab===5&&<MetasTab data={data} setData={setData} currency={currency}/>}
      {tab===6&&<AnaliseTab investimentos={data.investimentos} profileId={profileId} market={profile.market} currency={currency}/>}
      {tab===7&&<SplitwiseTab currency={currency} userEmail={session?.user?.email}/>}
    </div>
  </>;
}
