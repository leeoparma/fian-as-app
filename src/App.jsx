import { useState, useEffect, useRef } from "react";

// ── Paleta ───────────────────────────────────────────────────────────────────
const C = { receita:"#1D9E75", despesa:"#D85A30", cartao:"#7F77DD", invest:"#378ADD", meta:"#BA7517", banco:"#0E7490" };
const INVEST_CORES = ["#378ADD","#1D9E75","#7F77DD","#D85A30","#BA7517","#0E7490","#6366f1"];

// ── Constantes ────────────────────────────────────────────────────────────────
const PROFILES = [
  { id:"br", label:"🇧🇷 Brasil",    currency:"R$",  market:"brazil" },
  { id:"au", label:"🇦🇺 Austrália", currency:"A$",  market:"australia" },
];
const CAT_D_DEFAULT  = ["Alimentação","Transporte","Saúde","Lazer","Moradia","Educação","Assinatura","Vestuário","Outros"];
const CAT_R_DEFAULT  = ["Salário","Freelance","Investimentos","Aluguel","Dividendos","Bônus","Outros"];
const TIPOS_INV = ["Ações","FII","ETF","Cripto","Renda Fixa","Tesouro Direto","Outros"];
const INDICES_RF = ["CDI","IPCA","Selic","IGPM","Prefixado"];
const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const TABS  = ["Dashboard","Bancos","Lançamentos","Cartão","Investimentos","Metas","Análise"];
const WL_CATEGORIAS = ["Todas","Banco","Infraestrutura","Fundo Imobiliário","Energia","Tecnologia","Varejo","Saúde","Agronegócio","Mineração","Petróleo","ETF","Exterior","Outros"];
const INDICADORES_COMP = [
  {key:"preco",   label:"Preço",        fmt:v=>v!=null?"R$ "+Number(v).toFixed(2):"—", higher:false},
  {key:"pl",      label:"P/L",          fmt:v=>v!=null?Number(v).toFixed(1)+"x":"—",   higher:false},
  {key:"pvp",     label:"P/VP",         fmt:v=>v!=null?Number(v).toFixed(2)+"x":"—",   higher:false},
  {key:"dy",      label:"DY",           fmt:v=>v!=null?Number(v).toFixed(2)+"%":"—",   higher:true},
  {key:"roe",     label:"ROE",          fmt:v=>v!=null?Number(v).toFixed(2)+"%":"—",   higher:true},
  {key:"divida_ebitda", label:"Dív/EBITDA", fmt:v=>v!=null?Number(v).toFixed(2)+"x":"—", higher:false},
  {key:"cagr_lucro",    label:"CAGR Lucro",  fmt:v=>v!=null?Number(v).toFixed(2)+"%":"—", higher:true},
  {key:"margem_liquida",label:"Margem Líq.", fmt:v=>v!=null?Number(v).toFixed(2)+"%":"—", higher:true},
];

const hoje = new Date();
const MES_ATUAL = hoje.getMonth();
const ANO_ATUAL = hoje.getFullYear();
const EMPTY = { transacoes:[], faturas:[], investimentos:[], metas:[], bancos:[], catD:[...CAT_D_DEFAULT], catR:[...CAT_R_DEFAULT] };

// ── Storage ───────────────────────────────────────────────────────────────────
const lsGet = k => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):null; } catch{ return null; } };
const lsSet = (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch{} };
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,5);

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtM = (v,cur="R$") => cur+" "+Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtPct = v => v!=null ? Number(v).toFixed(2)+"%" : "—";

// ── Claude API ────────────────────────────────────────────────────────────────
async function askClaude(prompt, maxTokens=900) {
  const res = await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:maxTokens,messages:[{role:"user",content:prompt}]})
  });
  const d = await res.json();
  return d.content.filter(b=>b.type==="text").map(b=>b.text).join("").replace(/```json|```/g,"").trim();
}

// ── Componentes base ──────────────────────────────────────────────────────────
const inputSt = {display:"block",width:"100%",marginTop:4,padding:"7px 10px",borderRadius:8,border:"1px solid #e5e7eb",fontSize:13,boxSizing:"border-box"};
function MiniBar({valor,total,cor}) {
  const p=total>0?Math.min(100,(valor/total)*100):0;
  return <div style={{background:"#e5e7eb",borderRadius:4,height:6,marginTop:4}}><div style={{width:p+"%",background:cor,borderRadius:4,height:6,transition:"width .4s"}}/></div>;
}
function Card({children,style}) {
  return <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:12,padding:"1rem 1.25rem",...style}}>{children}</div>;
}
function MetricCard({label,value,color,sub}) {
  return <div style={{background:"#f9fafb",borderRadius:8,padding:"0.85rem 1rem"}}>
    <p style={{margin:0,fontSize:12,color:"#6b7280"}}>{label}</p>
    <p style={{margin:"2px 0 0",fontSize:19,fontWeight:700,color:color||"#111"}}>{value}</p>
    {sub&&<p style={{margin:0,fontSize:11,color:"#9ca3af"}}>{sub}</p>}
  </div>;
}
function Btn({children,onClick,color,disabled,style,outline}) {
  return <button onClick={onClick} disabled={disabled} style={{
    padding:"8px 16px",borderRadius:8,fontSize:13,fontWeight:500,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.6:1,
    ...(outline?{background:"#fff",border:`1px solid ${color||C.receita}`,color:color||C.receita}:{background:color||C.receita,border:"none",color:"#fff"}),
    ...style
  }}>{children}</button>;
}
function Modal({title,onClose,children}) {
  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
    <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:14,padding:"1.5rem",width:360,boxSizing:"border-box",display:"flex",flexDirection:"column",gap:12,maxHeight:"90vh",overflowY:"auto"}}>
      <h3 style={{margin:0,fontSize:16,fontWeight:700}}>{title}</h3>
      {children}
    </div>
  </div>;
}

// ── TradingView ───────────────────────────────────────────────────────────────
function TVWidget({type,config}) {
  const ref=useRef(null);
  useEffect(()=>{
    const el=ref.current; if(!el) return; el.innerHTML="";
    const w=document.createElement("div"); w.className="tradingview-widget-container__widget"; el.appendChild(w);
    const s=document.createElement("script"); s.type="text/javascript"; s.async=true;
    s.src=`https://s3.tradingview.com/external-embedding/embed-widget-${type}.js`;
    s.innerHTML=JSON.stringify(config); el.appendChild(s);
    return ()=>{ el.innerHTML=""; };
  },[JSON.stringify(config)]);
  return <div ref={ref} style={{minHeight:config.height||400,borderRadius:8,overflow:"hidden",background:"#f3f4f6",display:"flex",alignItems:"center",justifyContent:"center"}}>
    <p style={{color:"#9ca3af",fontSize:13}}>Carregando TradingView...</p>
  </div>;
}
function ChartModal({ticker,onClose}) {
  const sym=/^[A-Z]{1,5}(\.[A-Z]+)?$/.test(ticker)?ticker:"BMFBOVESPA:"+ticker;
  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300}}>
    <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:14,padding:"1rem",width:"min(96vw,760px)",boxSizing:"border-box"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <span style={{fontSize:15,fontWeight:700}}>{ticker}</span>
        <button onClick={onClose} style={{border:"none",background:"none",cursor:"pointer",fontSize:22,color:"#9ca3af"}}>✕</button>
      </div>
      <TVWidget type="advanced-chart" config={{symbol:sym,interval:"D",locale:"pt_BR",theme:"light",style:"1",width:"100%",height:460,allow_symbol_change:true}}/>
    </div>
  </div>;
}

// ── Gráficos simples ──────────────────────────────────────────────────────────
function BarChart({data,currency}) {
  const max=Math.max(...data.map(d=>Math.max(d.r,d.d)),1);
  return <div style={{overflowX:"auto"}}>
    <div style={{display:"flex",gap:8,alignItems:"flex-end",minWidth:data.length*60,height:140,padding:"0 4px"}}>
      {data.map((d,i)=><div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
        <div style={{width:"100%",display:"flex",gap:2,alignItems:"flex-end",height:110}}>
          <div title={`Receita: ${fmtM(d.r,currency)}`} style={{flex:1,background:C.receita,borderRadius:"3px 3px 0 0",height:Math.max(2,(d.r/max)*110)+"px",transition:"height .4s"}}/>
          <div title={`Despesa: ${fmtM(d.d,currency)}`} style={{flex:1,background:C.despesa,borderRadius:"3px 3px 0 0",height:Math.max(2,(d.d/max)*110)+"px",transition:"height .4s"}}/>
        </div>
        <span style={{fontSize:9,color:"#9ca3af"}}>{d.label}</span>
      </div>)}
    </div>
    <div style={{display:"flex",gap:12,justifyContent:"center",marginTop:6}}>
      <span style={{fontSize:11,color:C.receita}}>■ Receitas</span>
      <span style={{fontSize:11,color:C.despesa}}>■ Despesas</span>
    </div>
  </div>;
}
function PieChart({slices}) {
  let cum=0;
  const total=slices.reduce((a,b)=>a+b.v,0);
  if(total===0) return <p style={{fontSize:13,color:"#9ca3af"}}>Sem dados.</p>;
  const paths=slices.filter(s=>s.v>0).map(s=>{
    const pct=s.v/total, start=cum, end=cum+pct; cum=end;
    const x1=Math.cos(2*Math.PI*start-Math.PI/2),y1=Math.sin(2*Math.PI*start-Math.PI/2);
    const x2=Math.cos(2*Math.PI*end-Math.PI/2),y2=Math.sin(2*Math.PI*end-Math.PI/2);
    const lg=pct>0.5?1:0;
    return {d:`M0,0 L${x1},${y1} A1,1,0,${lg},1,${x2},${y2}Z`,color:s.color,label:s.label,pct:Math.round(pct*100)};
  });
  return <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
    <svg viewBox="-1.1 -1.1 2.2 2.2" style={{width:120,height:120,flexShrink:0}}>
      {paths.map((p,i)=><path key={i} d={p.d} fill={p.color} stroke="#fff" strokeWidth="0.03"/>)}
    </svg>
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      {paths.map((p,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:11}}>
        <div style={{width:10,height:10,borderRadius:2,background:p.color,flexShrink:0}}/>
        <span style={{color:"#374151"}}>{p.label}</span>
        <span style={{color:"#9ca3af",marginLeft:"auto"}}>{p.pct}%</span>
      </div>)}
    </div>
  </div>;
}
function LineChart({data,currency}) {
  const vals=data.map(d=>d.v);
  const max=Math.max(...vals,1), min=Math.min(...vals,0);
  const range=max-min||1;
  const W=300,H=100,pad=10;
  const pts=data.map((d,i)=>{
    const x=pad+(i/(data.length-1||1))*(W-pad*2);
    const y=H-pad-((d.v-min)/range)*(H-pad*2);
    return `${x},${y}`;
  }).join(" ");
  return <div style={{overflowX:"auto"}}>
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",maxWidth:W,height:H}}>
      <polyline points={pts} fill="none" stroke={C.invest} strokeWidth="2"/>
      {data.map((d,i)=>{
        const x=pad+(i/(data.length-1||1))*(W-pad*2);
        const y=H-pad-((d.v-min)/range)*(H-pad*2);
        return <circle key={i} cx={x} cy={y} r="3" fill={C.invest}><title>{d.label}: {fmtM(d.v,currency)}</title></circle>;
      })}
    </svg>
    <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#9ca3af",marginTop:2,padding:"0 10px"}}>
      {data.filter((_,i)=>i%Math.max(1,Math.floor(data.length/6))===0).map((d,i)=><span key={i}>{d.label}</span>)}
    </div>
  </div>;
}

// ── Renda Fixa helpers ────────────────────────────────────────────────────────
const INDICES_RATE = { CDI:10.5, Selic:10.5, IPCA:4.62, IGPM:5.1 };
function calcRFAnual(inv) {
  const indice=inv.indice||"CDI";
  const taxa=parseFloat(inv.taxaRF)||0;
  const pct=parseFloat(inv.pctIndice)||100;
  if(indice==="Prefixado") return taxa;
  const base=INDICES_RATE[indice]||10.5;
  if(inv.rfTipo==="pct") return base*(pct/100);
  return base+taxa;
}
function calcValorAtualRF(inv) {
  const anos=(new Date()-new Date(inv.data))/(1000*60*60*24*365);
  const taxaAnual=calcRFAnual(inv)/100;
  return (inv.valorInvestido||inv.valor||0)*Math.pow(1+taxaAnual,Math.max(0,anos));
}

// ── Aba Bancos ────────────────────────────────────────────────────────────────
function BancosTab({data,setData,currency}) {
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [transf,setTransf]=useState({de:"",para:"",valor:""});
  const [extratoBanco,setExtratoBanco]=useState(null);

  function saldoConta(b) {
    const txs=data.transacoes.filter(t=>t.bancoId===b.id);
    return (b.saldoInicial||0)+txs.filter(t=>t.tipo==="receita").reduce((a,x)=>a+x.valor,0)-txs.filter(t=>t.tipo==="despesa").reduce((a,x)=>a+x.valor,0);
  }
  function saldoInvest(b) {
    return data.investimentos.filter(i=>i.bancoId===b.id).reduce((a,i)=>a+(i.valorAtual||i.valorInvestido||i.valor||0),0);
  }
  function saveBanco() {
    const b={id:form.editId||uid(),nome:form.nome||"Banco",saldoInicial:parseFloat(form.saldoInicial)||0,limite:parseFloat(form.limite)||0,tipo:form.tipo||"corrente"};
    setData(d=>({...d,bancos:form.editId?d.bancos.map(x=>x.id===form.editId?b:x):[...d.bancos,b]}));
    setModal(null); setForm({});
  }
  function doTransf() {
    const v=parseFloat(transf.valor); if(!v||!transf.de||!transf.para||transf.de===transf.para) return;
    const dt=hoje.toISOString().slice(0,10);
    setData(d=>({...d,transacoes:[...d.transacoes,
      {id:uid(),tipo:"despesa",descricao:`Transf. → ${d.bancos.find(b=>b.id===transf.para)?.nome}`,valor:v,categoria:"Transferência",data:dt,bancoId:transf.de},
      {id:uid(),tipo:"receita",descricao:`Transf. ← ${d.bancos.find(b=>b.id===transf.de)?.nome}`,valor:v,categoria:"Transferência",data:dt,bancoId:transf.para}
    ]}));
    setTransf({de:"",para:"",valor:""});
  }

  const totalSaldos=data.bancos.reduce((a,b)=>a+saldoConta(b),0);
  const totalInvest=data.bancos.reduce((a,b)=>a+saldoInvest(b),0);

  const bExtr=extratoBanco?data.bancos.find(b=>b.id===extratoBanco):null;
  const txExtr=bExtr?data.transacoes.filter(t=>t.bancoId===extratoBanco).sort((a,b)=>b.data.localeCompare(a.data)):[];

  return <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
      <Btn onClick={()=>{setModal("banco");setForm({});}}>+ Novo banco</Btn>
      <div style={{display:"flex",gap:12,fontSize:13}}>
        <span style={{color:"#6b7280"}}>Conta: <strong style={{color:C.banco}}>{fmtM(totalSaldos,currency)}</strong></span>
        <span style={{color:"#6b7280"}}>Invest: <strong style={{color:C.invest}}>{fmtM(totalInvest,currency)}</strong></span>
      </div>
    </div>

    {data.bancos.length===0&&<p style={{fontSize:13,color:"#9ca3af"}}>Nenhum banco cadastrado.</p>}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10}}>
      {data.bancos.map(b=>{
        const sc=saldoConta(b), si=saldoInvest(b);
        const [exp,setExp]=useState(false);
        return <Card key={b.id}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <p style={{margin:"0 0 2px",fontSize:14,fontWeight:700,color:C.banco}}>🏦 {b.nome}</p>
              <p style={{margin:0,fontSize:11,color:"#9ca3af",textTransform:"capitalize"}}>{b.tipo}</p>
            </div>
            <div style={{display:"flex",gap:4}}>
              <button onClick={()=>setExtratoBanco(extratoBanco===b.id?null:b.id)} title="Extrato" style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>📄</button>
              <button onClick={()=>{setModal("banco");setForm({...b,editId:b.id});}} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>✏️</button>
              <button onClick={()=>setData(d=>({...d,bancos:d.bancos.filter(x=>x.id!==b.id)}))} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>🗑</button>
            </div>
          </div>
          <p style={{margin:"8px 0 0",fontSize:11,color:"#6b7280"}}>Saldo conta</p>
          <p style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:sc>=0?C.receita:C.despesa}}>{fmtM(sc,currency)}</p>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}} onClick={()=>setExp(e=>!e)}>
            <p style={{margin:0,fontSize:11,color:"#6b7280"}}>Investimentos: <strong style={{color:C.invest}}>{fmtM(si,currency)}</strong></p>
            <span style={{fontSize:10,color:"#9ca3af"}}>{exp?"▲":"▼"}</span>
          </div>
          {exp&&<div style={{marginTop:8,borderTop:"1px solid #f3f4f6",paddingTop:8}}>
            {data.investimentos.filter(i=>i.bancoId===b.id).length===0
              ?<p style={{fontSize:11,color:"#9ca3af"}}>Nenhum investimento vinculado.</p>
              :data.investimentos.filter(i=>i.bancoId===b.id).map(i=><div key={i.id} style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}>
                <span style={{color:"#374151"}}>{i.ticker||i.descricao||i.tipo}</span>
                <span style={{fontWeight:600,color:C.invest}}>{fmtM(i.valorAtual||i.valorInvestido||i.valor||0,currency)}</span>
              </div>)
            }
          </div>}
          {b.limite>0&&<p style={{margin:"4px 0 0",fontSize:11,color:"#9ca3af"}}>Limite: {fmtM(b.limite,currency)}</p>}
        </Card>;
      })}
    </div>

    {/* Extrato */}
    {extratoBanco&&bExtr&&<Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <p style={{margin:0,fontSize:14,fontWeight:700}}>📄 Extrato — {bExtr.nome}</p>
        <button onClick={()=>setExtratoBanco(null)} style={{border:"none",background:"none",cursor:"pointer",fontSize:18,color:"#9ca3af"}}>✕</button>
      </div>
      {txExtr.length===0?<p style={{fontSize:13,color:"#9ca3af"}}>Sem movimentações.</p>:
      txExtr.map(t=><div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #f3f4f6",fontSize:13}}>
        <div>
          <p style={{margin:0,fontWeight:500}}>{t.descricao}</p>
          <p style={{margin:0,fontSize:11,color:"#9ca3af"}}>{t.categoria} · {t.data}</p>
        </div>
        <span style={{fontWeight:700,color:t.tipo==="receita"?C.receita:C.despesa}}>{t.tipo==="receita"?"+":"-"}{fmtM(t.valor,currency)}</span>
      </div>)}
    </Card>}

    {/* Transferência */}
    {data.bancos.length>=2&&<Card>
      <p style={{fontSize:14,fontWeight:700,marginBottom:10}}>↔ Transferência entre bancos</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
        <label style={{fontSize:12,color:"#6b7280"}}>De
          <select value={transf.de} onChange={e=>setTransf(f=>({...f,de:e.target.value}))} style={inputSt}><option value="">Selecione...</option>{data.bancos.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}</select>
        </label>
        <label style={{fontSize:12,color:"#6b7280"}}>Para
          <select value={transf.para} onChange={e=>setTransf(f=>({...f,para:e.target.value}))} style={inputSt}><option value="">Selecione...</option>{data.bancos.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}</select>
        </label>
      </div>
      <label style={{fontSize:12,color:"#6b7280",display:"block",marginBottom:8}}>Valor<input type="number" value={transf.valor} onChange={e=>setTransf(f=>({...f,valor:e.target.value}))} style={inputSt}/></label>
      <Btn onClick={doTransf} color={C.banco}>Transferir</Btn>
    </Card>}

    {modal==="banco"&&<Modal title={form.editId?"Editar banco":"Novo banco"} onClose={()=>setModal(null)}>
      <label style={{fontSize:13}}>Nome<input value={form.nome||""} onChange={e=>setForm(f=>({...f,nome:e.target.value}))} style={inputSt}/></label>
      <label style={{fontSize:13}}>Tipo<select value={form.tipo||"corrente"} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} style={inputSt}><option value="corrente">Conta Corrente</option><option value="poupança">Poupança</option><option value="investimento">Conta Investimento</option><option value="digital">Conta Digital</option></select></label>
      <label style={{fontSize:13}}>Saldo inicial ({currency})<input type="number" value={form.saldoInicial||""} onChange={e=>setForm(f=>({...f,saldoInicial:e.target.value}))} style={inputSt}/></label>
      <label style={{fontSize:13}}>Limite de crédito ({currency})<input type="number" value={form.limite||""} onChange={e=>setForm(f=>({...f,limite:e.target.value}))} style={inputSt}/></label>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
        <Btn outline color="#6b7280" onClick={()=>setModal(null)}>Cancelar</Btn>
        <Btn onClick={saveBanco}>Salvar</Btn>
      </div>
    </Modal>}
  </div>;
}

// ── Aba Investimentos ─────────────────────────────────────────────────────────
function InvestimentosTab({data,setData,currency}) {
  const [modal,setModal]=useState(false);
  const [form,setForm]=useState({});
  const [chartTicker,setChartTicker]=useState(null);
  const [loadingId,setLoadingId]=useState(null);

  const totalInvest=data.investimentos.reduce((a,b)=>a+(b.valorAtual||b.valorInvestido||b.valor||0),0);

  async function buscarDados(inv) {
    if(inv.tipo==="Renda Fixa"||inv.tipo==="Tesouro Direto") {
      const va=calcValorAtualRF(inv);
      setData(d=>({...d,investimentos:d.investimentos.map(x=>x.id===inv.id?{...x,valorAtual:va,lucro:va-(inv.valorInvestido||inv.valor||0)}:x)}));
      return;
    }
    setLoadingId(inv.id);
    try {
      const txt=await askClaude(`JSON only, no markdown. Stock ${inv.ticker||inv.descricao}: {"preco_atual":number,"prox_dividendo":"YYYY-MM-DD or null","valor_dividendo":number|null,"dy":number|null,"resumo":"1 sentence pt-BR"}`,500);
      const obj=JSON.parse(txt);
      const va=obj.preco_atual*(inv.quantidade||1);
      const lucro=va-(inv.precoMedio||0)*(inv.quantidade||1);
      setData(d=>({...d,investimentos:d.investimentos.map(x=>x.id===inv.id?{...x,...obj,valorAtual:va,lucro}:x)}));
    } catch{}
    setLoadingId(null);
  }

  function saveInv() {
    const isRF=form.tipo==="Renda Fixa"||form.tipo==="Tesouro Direto";
    const valorInvestido=parseFloat(form.valorInvestido)||parseFloat(form.precoMedio||0)*parseFloat(form.quantidade||1)||0;
    const i={
      id:form.editId||uid(), tipo:form.tipo||"Ações", descricao:form.descricao||"",
      ticker:form.ticker||"", quantidade:parseFloat(form.quantidade)||1,
      precoMedio:parseFloat(form.precoMedio)||0, valorInvestido,
      valor:valorInvestido, data:form.data||hoje.toISOString().slice(0,10),
      bancoId:form.bancoId||null,
      // Renda Fixa
      indice:form.indice||"CDI", taxaRF:parseFloat(form.taxaRF)||0,
      pctIndice:parseFloat(form.pctIndice)||100, rfTipo:form.rfTipo||"pct",
      vencimento:form.vencimento||"",
    };
    if(isRF) { i.valorAtual=calcValorAtualRF(i); i.lucro=i.valorAtual-valorInvestido; }
    setData(d=>({...d,investimentos:form.editId?d.investimentos.map(x=>x.id===form.editId?i:x):[...d.investimentos,i]}));
    setModal(false); setForm({});
  }

  const isRF=form.tipo==="Renda Fixa"||form.tipo==="Tesouro Direto";
  const tiposI=TIPOS_INV.map(t=>({t,v:data.investimentos.filter(i=>i.tipo===t).reduce((a,b)=>a+(b.valorAtual||b.valorInvestido||b.valor||0),0)})).filter(x=>x.v>0);

  return <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
    {chartTicker&&<ChartModal ticker={chartTicker} onClose={()=>setChartTicker(null)}/>}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <Btn onClick={()=>{setModal(true);setForm({});}} color={C.invest}>+ Novo ativo</Btn>
      <span style={{fontSize:13,color:"#6b7280"}}>Total: <strong>{fmtM(totalInvest,currency)}</strong></span>
    </div>
    {tiposI.length>0&&<Card>
      <p style={{fontSize:13,fontWeight:700,marginBottom:10}}>Por tipo</p>
      {tiposI.map((x,i)=><div key={x.t} style={{marginBottom:8}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:"#6b7280"}}>{x.t}</span><span style={{fontWeight:600}}>{fmtM(x.v,currency)} ({totalInvest>0?Math.round(x.v/totalInvest*100):0}%)</span></div>
        <MiniBar valor={x.v} total={totalInvest} cor={INVEST_CORES[i%INVEST_CORES.length]}/>
      </div>)}
    </Card>}
    {data.investimentos.length===0&&<p style={{fontSize:13,color:"#9ca3af"}}>Nenhum ativo cadastrado.</p>}
    {data.investimentos.map(inv=>{
      const custo=inv.valorInvestido||inv.valor||0;
      const atual=inv.valorAtual||custo;
      const lucro=inv.lucro!==undefined?inv.lucro:atual-custo;
      const lpct=custo>0?(lucro/custo*100):0;
      const isRFItem=inv.tipo==="Renda Fixa"||inv.tipo==="Tesouro Direto";
      return <Card key={inv.id}>
        <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              {inv.ticker&&<span onClick={()=>setChartTicker(inv.ticker)} style={{fontSize:15,fontWeight:700,color:C.invest,cursor:"pointer",textDecoration:"underline"}}>{inv.ticker}</span>}
              <span style={{fontSize:13,fontWeight:500}}>{inv.descricao||inv.tipo}</span>
              <span style={{fontSize:11,background:"#f3f4f6",color:"#6b7280",borderRadius:4,padding:"2px 6px"}}>{inv.tipo}</span>
              {inv.bancoId&&<span style={{fontSize:11,background:"#e0f2fe",color:C.banco,borderRadius:4,padding:"2px 6px"}}>🏦 {data.bancos.find(b=>b.id===inv.bancoId)?.nome}</span>}
            </div>
            {isRFItem?<p style={{margin:"2px 0 0",fontSize:12,color:"#9ca3af"}}>
              {inv.rfTipo==="pct"?`${inv.pctIndice||100}% do ${inv.indice}`:`${inv.indice} + ${inv.taxaRF||0}%`}
              {inv.vencimento&&` · Venc: ${inv.vencimento}`}
            </p>:<p style={{margin:"2px 0 0",fontSize:12,color:"#9ca3af"}}>{inv.quantidade} un. · PM: {fmtM(inv.precoMedio||0,currency)}</p>}
          </div>
          <div style={{display:"flex",gap:4}}>
            <button onClick={()=>buscarDados(inv)} disabled={loadingId===inv.id} title="Atualizar" style={{border:"none",background:"none",cursor:"pointer",fontSize:16,opacity:loadingId===inv.id?0.4:1}}>🔄</button>
            <button onClick={()=>{setModal(true);setForm({...inv,editId:inv.id});}} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>✏️</button>
            <button onClick={()=>setData(d=>({...d,investimentos:d.investimentos.filter(x=>x.id!==inv.id)}))} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>🗑</button>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8,marginTop:12}}>
          <MetricCard label="Investido" value={fmtM(custo,currency)}/>
          <MetricCard label="Valor atual" value={fmtM(atual,currency)}/>
          <MetricCard label="Lucro/Prejuízo" value={fmtM(lucro,currency)} color={lucro>=0?C.receita:C.despesa} sub={lpct.toFixed(2)+"%"}/>
          {!isRFItem&&inv.preco_atual&&<MetricCard label="Preço atual" value={fmtM(inv.preco_atual,currency)}/>}
          {!isRFItem&&inv.dy!=null&&<MetricCard label="DY" value={fmtPct(inv.dy)} color={C.meta}/>}
          {!isRFItem&&inv.prox_dividendo&&<MetricCard label="Próx. dividendo" value={inv.prox_dividendo} sub={inv.valor_dividendo?fmtM(inv.valor_dividendo,currency)+"/ação":""} color={C.banco}/>}
          {isRFItem&&<MetricCard label="Taxa efetiva" value={calcRFAnual(inv).toFixed(2)+"%a.a."} color={C.meta}/>}
        </div>
        {inv.resumo&&<p style={{fontSize:12,color:"#6b7280",marginTop:8,padding:"6px 10px",background:"#f9fafb",borderRadius:6}}>{inv.resumo}</p>}
      </Card>;
    })}

    {modal&&<Modal title={form.editId?"Editar ativo":"Novo ativo"} onClose={()=>setModal(false)}>
      <label style={{fontSize:13}}>Tipo<select value={form.tipo||"Ações"} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} style={inputSt}>{TIPOS_INV.map(t=><option key={t}>{t}</option>)}</select></label>
      {!isRF&&<><label style={{fontSize:13}}>Ticker<input value={form.ticker||""} onChange={e=>setForm(f=>({...f,ticker:e.target.value.toUpperCase()}))} style={inputSt}/></label>
      <label style={{fontSize:13}}>Descrição<input value={form.descricao||""} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} style={inputSt}/></label>
      <label style={{fontSize:13}}>Quantidade<input type="number" value={form.quantidade||""} onChange={e=>setForm(f=>({...f,quantidade:e.target.value}))} style={inputSt}/></label>
      <label style={{fontSize:13}}>Preço médio pago ({currency})<input type="number" value={form.precoMedio||""} onChange={e=>setForm(f=>({...f,precoMedio:e.target.value}))} style={inputSt}/></label></>}
      {isRF&&<>
        <label style={{fontSize:13}}>Descrição (ex: CDB Banco X)<input value={form.descricao||""} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} style={inputSt}/></label>
        <label style={{fontSize:13}}>Valor investido ({currency})<input type="number" value={form.valorInvestido||""} onChange={e=>setForm(f=>({...f,valorInvestido:e.target.value}))} style={inputSt}/></label>
        <label style={{fontSize:13}}>Índice<select value={form.indice||"CDI"} onChange={e=>setForm(f=>({...f,indice:e.target.value}))} style={inputSt}>{INDICES_RF.map(i=><option key={i}>{i}</option>)}</select></label>
        {(form.indice||"CDI")!=="Prefixado"&&<>
          <label style={{fontSize:13}}>Tipo de taxa<select value={form.rfTipo||"pct"} onChange={e=>setForm(f=>({...f,rfTipo:e.target.value}))} style={inputSt}><option value="pct">% do índice (ex: 102% CDI)</option><option value="mais">Índice + % (ex: IPCA + 9%)</option></select></label>
          {(form.rfTipo||"pct")==="pct"?<label style={{fontSize:13}}>% do índice (ex: 102)<input type="number" value={form.pctIndice||""} onChange={e=>setForm(f=>({...f,pctIndice:e.target.value}))} style={inputSt}/></label>
          :<label style={{fontSize:13}}>Taxa adicional % a.a.<input type="number" value={form.taxaRF||""} onChange={e=>setForm(f=>({...f,taxaRF:e.target.value}))} style={inputSt}/></label>}
        </>}
        {(form.indice||"CDI")==="Prefixado"&&<label style={{fontSize:13}}>Taxa prefixada % a.a.<input type="number" value={form.taxaRF||""} onChange={e=>setForm(f=>({...f,taxaRF:e.target.value}))} style={inputSt}/></label>}
        <label style={{fontSize:13}}>Vencimento<input type="date" value={form.vencimento||""} onChange={e=>setForm(f=>({...f,vencimento:e.target.value}))} style={inputSt}/></label>
      </>}
      <label style={{fontSize:13}}>Data de compra<input type="date" value={form.data||hoje.toISOString().slice(0,10)} onChange={e=>setForm(f=>({...f,data:e.target.value}))} style={inputSt}/></label>
      {data.bancos.length>0&&<label style={{fontSize:13}}>Vincular ao banco<select value={form.bancoId||""} onChange={e=>setForm(f=>({...f,bancoId:e.target.value}))} style={inputSt}><option value="">Nenhum</option>{data.bancos.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}</select></label>}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
        <Btn outline color="#6b7280" onClick={()=>setModal(false)}>Cancelar</Btn>
        <Btn onClick={saveInv} color={C.invest}>Salvar</Btn>
      </div>
    </Modal>}
  </div>;
}

// ── Aba Análise ───────────────────────────────────────────────────────────────
function AnaliseTab({investimentos,profileId,market,currency}) {
  const WL_KEY=`watchlist_${profileId}`;
  const [watchlist,setWatchlist]=useState(()=>lsGet(WL_KEY)||[]);
  const [wInput,setWInput]=useState(""); const [wCat,setWCat]=useState(""); const [wFiltro,setWFiltro]=useState("Todas"); const [wLoading,setWLoading]=useState(false);
  const [chartTicker,setChartTicker]=useState(null);
  const [news,setNews]=useState({}); const [newsLoading,setNewsLoading]=useState(false);
  const [compInput,setCompInput]=useState(""); const [compList,setCompList]=useState([]); const [compLoading,setCompLoading]=useState(false); const [compData,setCompData]=useState([]);
  const [fundTicker,setFundTicker]=useState(""); const [fundInput,setFundInput]=useState(""); const [fundSymbol,setFundSymbol]=useState("BMFBOVESPA:PETR4");
  const [calcForm,setCalcForm]=useState({pc:"",pa:"",qt:"",tipo:"acao",indice:"CDI",taxa:"",pct:"100",meses:""});
  const [calcRes,setCalcRes]=useState(null);
  const [simForm,setSimForm]=useState({ini:"",ap:"",tipo:"fixo",taxa:"",indice:"CDI",pctInd:"100",meses:""});
  const [simRes,setSimRes]=useState(null);
  const [alocRes,setAlocRes]=useState(null); const [alocLoading,setAlocLoading]=useState(false);
  const [erro,setErro]=useState("");
  useEffect(()=>{ lsSet(WL_KEY,watchlist); },[watchlist]);

  async function addWatch() {
    const t=wInput.trim().toUpperCase(); if(!t||watchlist.find(w=>w.ticker===t)){setWInput("");return;}
    setWLoading(true);
    try {
      const txt=await askClaude(`JSON only. Fundamentals for ${t}: {"ticker":"${t}","nome":"short","setor":"str","categoria":"Banco|Infraestrutura|Fundo Imobiliário|Energia|Tecnologia|Varejo|Saúde|Agronegócio|Mineração|Petróleo|ETF|Exterior|Outros","preco":number,"pl":number|null,"dy":number|null,"roe":number|null}`,400);
      const obj=JSON.parse(txt); if(wCat) obj.categoria=wCat;
      setWatchlist(p=>[...p,obj]);
    } catch { setWatchlist(p=>[...p,{ticker:t,nome:t,categoria:wCat||"Outros",preco:null,pl:null,dy:null,roe:null}]); }
    setWInput(""); setWLoading(false);
  }

  async function fetchNews() {
    if(!watchlist.length){setErro("Adicione ativos à watchlist.");return;}
    setNewsLoading(true); setErro("");
    try {
      const txt=await askClaude(`Analista financeiro. Ativos: ${watchlist.map(w=>w.ticker).join(",")}. JSON array: [{"ticker":"XX","noticias":[{"titulo":"str","resumo":"2 frases pt-BR","tipo":"resultado|dividendo|fato_relevante|noticia","data":"YYYY-MM-DD"}]}]`,1500);
      const arr=JSON.parse(txt); const map={}; arr.forEach(x=>{map[x.ticker]=x.noticias;}); setNews(map);
    } catch{ setErro("Erro ao buscar notícias."); }
    setNewsLoading(false);
  }

  async function compararAtivos() {
    if(compList.length<2){setErro("Adicione pelo menos 2 ativos.");return;}
    setCompLoading(true); setErro("");
    try {
      const txt=await askClaude(`JSON array only, no markdown, no extra text. Tickers: ${compList.join(",")}. Each object: {"ticker":"","nome":"","preco":number|null,"pl":number|null,"pvp":number|null,"dy":number|null,"roe":number|null,"divida_ebitda":number|null,"cagr_lucro":number|null,"margem_liquida":number|null}. Return ONLY the JSON array.`,1400);
      const start=txt.indexOf("["), end=txt.lastIndexOf("]");
      if(start===-1||end===-1) throw new Error("no array");
      setCompData(JSON.parse(txt.slice(start,end+1)));
    } catch(e){ setErro("Erro ao comparar ativos. Tente novamente."); }
    setCompLoading(false);
  }

  function calcRent() {
    if(calcForm.tipo==="acao") {
      const pc=parseFloat(calcForm.pc),pa=parseFloat(calcForm.pa),qt=parseFloat(calcForm.qt);
      if(!pc||!pa||!qt) return;
      setCalcRes({investido:pc*qt,atual:pa*qt,lucro:(pa-pc)*qt,pct:((pa-pc)/pc)*100,tipo:"acao"});
    } else {
      const vi=parseFloat(calcForm.pc),m=parseInt(calcForm.meses)||12;
      if(!vi) return;
      const fakeInv={indice:calcForm.indice,taxaRF:calcForm.taxa,pctIndice:calcForm.pct,rfTipo:calcForm.taxa?"mais":"pct",valorInvestido:vi,valor:vi,data:new Date(Date.now()-m*30*24*60*60*1000).toISOString().slice(0,10)};
      const va=calcValorAtualRF(fakeInv);
      setCalcRes({investido:vi,atual:va,lucro:va-vi,pct:((va-vi)/vi)*100,tipo:"rf",taxa:calcRFAnual(fakeInv).toFixed(2)});
    }
  }

  function simJuros() {
    const ini=parseFloat(simForm.ini)||0,ap=parseFloat(simForm.ap)||0,meses=parseInt(simForm.meses)||0;
    if(!meses) return;
    let taxaMensal;
    if(simForm.tipo==="fixo") { taxaMensal=parseFloat(simForm.taxa)/100; }
    else {
      const base=INDICES_RATE[simForm.indice]||10.5;
      const anual=simForm.tipo==="pct"?base*(parseFloat(simForm.pctInd)||100)/100:base+parseFloat(simForm.taxa||0);
      taxaMensal=Math.pow(1+anual/100,1/12)-1;
    }
    let saldo=ini; const pts=[{mes:0,saldo:Math.round(ini)}];
    for(let i=1;i<=meses;i++){saldo=saldo*(1+taxaMensal)+ap;if(i%(Math.max(1,Math.floor(meses/12)))===0||i===meses)pts.push({mes:i,saldo:Math.round(saldo)});}
    setSimRes({saldo:Math.round(saldo),aportado:Math.round(ini+ap*meses),juros:Math.round(saldo-(ini+ap*meses)),pts});
  }

  async function sugerirAloc() {
    if(!investimentos.length){setErro("Adicione investimentos primeiro.");return;}
    setAlocLoading(true); setErro("");
    const resumo=investimentos.map(i=>`${i.tipo}:${i.valorInvestido||i.valor||0}`).join(",");
    try {
      const txt=await askClaude(`Você é um consultor financeiro. Carteira atual: ${resumo}. Responda SOMENTE com JSON válido, sem markdown, sem texto adicional: {"analise":"resumo em 2 frases","sugestao":[{"tipo":"string","pct_atual":0,"pct_ideal":0,"acao":"string"}]}`,800);
      const start=txt.indexOf("{"), end=txt.lastIndexOf("}");
      if(start===-1||end===-1) throw new Error("no json");
      setAlocRes(JSON.parse(txt.slice(start,end+1)));
    } catch(e){ setErro("Erro ao gerar sugestão: "+e.message); }
    setAlocLoading(false);
  }

  const tipoIcons={resultado:"📊",dividendo:"💰",fato_relevante:"📢",noticia:"📰"};
  const tipoLine={resultado:C.invest,dividendo:C.receita,fato_relevante:"#f59e0b",noticia:"#9ca3af"};
  const tipoColors={resultado:"#dbeafe",dividendo:"#d1fae5",fato_relevante:"#fef3c7",noticia:"#f3f4f6"};
  const wlFilt=wFiltro==="Todas"?watchlist:watchlist.filter(w=>(w.categoria||"Outros")===wFiltro);
  const cats=["Todas",...new Set(watchlist.map(w=>w.categoria||"Outros"))];
  function isBest(key,val,arr){if(val==null)return false;const vals=arr.map(a=>a[key]).filter(v=>v!=null);if(vals.length<2)return false;const ind=INDICADORES_COMP.find(i=>i.key===key);return ind?.higher?val===Math.max(...vals):val===Math.min(...vals);}

  return <div style={{display:"flex",flexDirection:"column",gap:"1.25rem"}}>
    {chartTicker&&<ChartModal ticker={chartTicker} onClose={()=>setChartTicker(null)}/>}
    {erro&&<p style={{fontSize:12,color:C.despesa,margin:0,padding:"8px 12px",background:"#fef2f2",borderRadius:8}}>{erro}<button onClick={()=>setErro("")} style={{marginLeft:8,border:"none",background:"none",cursor:"pointer",color:C.despesa}}>✕</button></p>}

    {/* Watchlist */}
    <Card>
      <p style={{fontSize:14,fontWeight:700,margin:"0 0 2px"}}>Carteira de acompanhamento</p>
      <p style={{fontSize:12,color:"#6b7280",margin:"0 0 10px"}}>Clique num ativo para ver o gráfico</p>
      <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
        <input value={wInput} onChange={e=>setWInput(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&addWatch()} placeholder="Ticker..." style={{flex:1,minWidth:100,...inputSt,marginTop:0}}/>
        <select value={wCat} onChange={e=>setWCat(e.target.value)} style={{...inputSt,marginTop:0,minWidth:140,flex:1}}>
          <option value="">Categoria (auto)</option>
          {WL_CATEGORIAS.filter(c=>c!=="Todas").map(c=><option key={c}>{c}</option>)}
        </select>
        <Btn onClick={addWatch} disabled={wLoading} color={C.invest}>{wLoading?"...":"+ Add"}</Btn>
      </div>
      {watchlist.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:10}}>
        {cats.map(c=><button key={c} onClick={()=>setWFiltro(c)} style={{padding:"3px 10px",borderRadius:16,fontSize:11,cursor:"pointer",border:"none",background:wFiltro===c?C.invest:"#f3f4f6",color:wFiltro===c?"#fff":"#6b7280",fontWeight:wFiltro===c?600:400}}>{c}{c!=="Todas"?` (${watchlist.filter(w=>(w.categoria||"Outros")===c).length})`:""}</button>)}
      </div>}
      {wlFilt.length===0&&<p style={{fontSize:13,color:"#9ca3af"}}>Nenhum ativo.</p>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))",gap:8}}>
        {wlFilt.map(w=><div key={w.ticker} onClick={()=>setChartTicker(w.ticker)} style={{background:"#f9fafb",borderRadius:10,padding:"10px 12px",cursor:"pointer",border:"1px solid #e5e7eb",position:"relative"}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.invest} onMouseLeave={e=>e.currentTarget.style.borderColor="#e5e7eb"}>
          <button onClick={e=>{e.stopPropagation();setWatchlist(p=>p.filter(x=>x.ticker!==w.ticker));}} style={{position:"absolute",top:5,right:6,border:"none",background:"none",cursor:"pointer",fontSize:12,color:"#9ca3af"}}>✕</button>
          <p style={{margin:"0 0 1px",fontSize:13,fontWeight:700,color:C.invest}}>{w.ticker}</p>
          <p style={{margin:"0 0 3px",fontSize:11,color:"#9ca3af",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{w.nome}</p>
          {w.categoria&&<span style={{fontSize:10,background:"#f0fdf4",color:"#166534",borderRadius:4,padding:"1px 5px",display:"inline-block",marginBottom:3}}>{w.categoria}</span>}
          <p style={{margin:"2px 0 4px",fontSize:15,fontWeight:700}}>{w.preco!=null?"R$ "+Number(w.preco).toFixed(2):"—"}</p>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {w.pl!=null&&<span style={{fontSize:10,background:"#dbeafe",color:"#1e40af",borderRadius:4,padding:"2px 5px"}}>P/L {Number(w.pl).toFixed(1)}</span>}
            {w.dy!=null&&<span style={{fontSize:10,background:"#d1fae5",color:"#065f46",borderRadius:4,padding:"2px 5px"}}>DY {Number(w.dy).toFixed(1)}%</span>}
          </div>
        </div>)}
      </div>
    </Card>

    {/* Comparador */}
    <Card>
      <p style={{fontSize:14,fontWeight:700,margin:"0 0 2px"}}>Comparador de ativos</p>
      <p style={{fontSize:12,color:"#6b7280",margin:"0 0 10px"}}>Compare quantos ativos quiser lado a lado</p>
      <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
        <input value={compInput} onChange={e=>setCompInput(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&(setCompList(p=>p.includes(compInput.trim().toUpperCase())?p:[...p,compInput.trim().toUpperCase()]),setCompInput(""))} placeholder="Ticker..." style={{flex:1,...inputSt,marginTop:0}}/>
        <Btn onClick={()=>{const t=compInput.trim().toUpperCase();if(t&&!compList.includes(t)){setCompList(p=>[...p,t]);}setCompInput("");}} color={C.cartao}>+ Add</Btn>
        <Btn onClick={compararAtivos} disabled={compLoading||compList.length<2} color={C.invest}>{compLoading?"Comparando...":"Comparar"}</Btn>
      </div>
      {compList.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
        {compList.map(t=><span key={t} style={{display:"flex",alignItems:"center",gap:4,background:"#dbeafe",color:"#1e40af",borderRadius:16,padding:"3px 10px",fontSize:12,fontWeight:600}}>
          {t}<button onClick={()=>{setCompList(p=>p.filter(x=>x!==t));setCompData(p=>p.filter(x=>x.ticker!==t));}} style={{border:"none",background:"none",cursor:"pointer",color:"#1e40af",fontSize:13,padding:0}}>✕</button>
        </span>)}
      </div>}
      {compData.length>=2&&<div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:400}}>
          <thead><tr style={{background:"#f9fafb"}}>
            <th style={{textAlign:"left",padding:"8px 10px",borderBottom:"1px solid #e5e7eb",color:"#6b7280",fontSize:12}}>Indicador</th>
            {compData.map(a=><th key={a.ticker} style={{textAlign:"right",padding:"8px 10px",borderBottom:"1px solid #e5e7eb",color:C.invest,fontWeight:700}}>
              <div>{a.ticker}</div><div style={{fontSize:10,color:"#9ca3af",fontWeight:400}}>{a.nome}</div>
            </th>)}
          </tr></thead>
          <tbody>{INDICADORES_COMP.map((ind,ri)=><tr key={ind.key} style={{background:ri%2?"#f9fafb":"#fff"}}>
            <td style={{padding:"7px 10px",color:"#6b7280",borderBottom:"1px solid #f3f4f6",fontWeight:500}}>{ind.label}</td>
            {compData.map(a=>{const best=isBest(ind.key,a[ind.key],compData);return <td key={a.ticker} style={{padding:"7px 10px",textAlign:"right",borderBottom:"1px solid #f3f4f6",fontWeight:best?700:400,color:best?C.receita:"#111",background:best?"#f0fdf4":"transparent"}}>{ind.fmt(a[ind.key])}{best?" ✓":""}</td>;})}
          </tr>)}</tbody>
        </table>
        <p style={{fontSize:11,color:"#9ca3af",marginTop:4}}>✓ Verde = melhor valor no indicador</p>
      </div>}
    </Card>

    {/* Alertas */}
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
        <div><p style={{fontSize:14,fontWeight:700,margin:"0 0 2px"}}>🔔 Alertas e anúncios</p><p style={{fontSize:12,color:"#6b7280",margin:0}}>Eventos recentes dos seus ativos</p></div>
        <Btn onClick={fetchNews} disabled={newsLoading} color={C.banco} style={{fontSize:12,padding:"6px 12px"}}>{newsLoading?"Buscando...":"Atualizar"}</Btn>
      </div>
      {Object.keys(news).length===0&&!newsLoading&&<p style={{fontSize:13,color:"#9ca3af"}}>Clique em "Atualizar" para buscar anúncios.</p>}
      {newsLoading&&<p style={{textAlign:"center",padding:"1.5rem",color:"#9ca3af",fontSize:13}}>Buscando notícias...</p>}
      {Object.entries(news).map(([ticker,noticias])=><div key={ticker} style={{marginBottom:12}}>
        <p style={{fontSize:13,fontWeight:700,color:C.invest,margin:"0 0 6px"}}>{ticker}</p>
        {noticias.map((n,i)=><div key={i} style={{background:tipoColors[n.tipo]||"#f9fafb",borderRadius:8,padding:"8px 12px",marginBottom:6,borderLeft:`3px solid ${tipoLine[n.tipo]||"#9ca3af"}`}}>
          <div style={{display:"flex",gap:6,marginBottom:2}}><span>{tipoIcons[n.tipo]||"📰"}</span><span style={{fontSize:12,fontWeight:600}}>{n.titulo}</span><span style={{fontSize:10,color:"#9ca3af",marginLeft:"auto"}}>{n.data}</span></div>
          <p style={{margin:0,fontSize:12,color:"#6b7280"}}>{n.resumo}</p>
        </div>)}
      </div>)}
    </Card>

    {/* Indicadores TradingView */}
    <Card>
      <p style={{fontSize:14,fontWeight:700,margin:"0 0 2px"}}>Indicadores fundamentalistas</p>
      <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
        <input value={fundInput} onChange={e=>setFundInput(e.target.value.toUpperCase())} onKeyDown={e=>{if(e.key==="Enter"){const t=fundInput.trim().toUpperCase();if(t){setFundSymbol(/^[A-Z]{1,5}(\.[A-Z]+)?$/.test(t)?t:"BMFBOVESPA:"+t);setFundTicker(t);setFundInput("");}}}} placeholder="Digite o ticker..." style={{flex:1,...inputSt,marginTop:0}}/>
        <Btn onClick={()=>{const t=fundInput.trim().toUpperCase();if(t){setFundSymbol(/^[A-Z]{1,5}(\.[A-Z]+)?$/.test(t)?t:"BMFBOVESPA:"+t);setFundTicker(t);setFundInput("");}}} color={C.invest}>Ver</Btn>
      </div>
      {watchlist.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
        {watchlist.map(w=><button key={w.ticker} onClick={()=>{setFundSymbol(/^[A-Z]{1,5}(\.[A-Z]+)?$/.test(w.ticker)?w.ticker:"BMFBOVESPA:"+w.ticker);setFundTicker(w.ticker);}} style={{padding:"3px 10px",borderRadius:16,fontSize:11,cursor:"pointer",border:"1px solid #e5e7eb",background:fundTicker===w.ticker?C.invest:"#f9fafb",color:fundTicker===w.ticker?"#fff":"#374151",fontWeight:fundTicker===w.ticker?700:400}}>{w.ticker}</button>)}
      </div>}
      <TVWidget type="financials" config={{symbol:fundSymbol,colorTheme:"light",isTransparent:false,displayMode:"regular",width:"100%",height:490,locale:"pt_BR"}}/>
    </Card>

    <Card>
      <p style={{fontSize:14,fontWeight:700,margin:"0 0 6px"}}>Screener de ações</p>
      <TVWidget type="screener" config={{width:"100%",height:490,defaultColumn:"overview",defaultScreen:"most_capitalized",market,showToolbar:true,colorTheme:"light",locale:"pt_BR"}}/>
    </Card>

    {/* Calculadora rentabilidade */}
    <Card>
      <p style={{fontSize:14,fontWeight:700,margin:"0 0 10px"}}>Calcular rentabilidade</p>
      <label style={{fontSize:12,color:"#6b7280",marginBottom:8,display:"block"}}>Tipo de investimento
        <select value={calcForm.tipo} onChange={e=>setCalcForm(f=>({...f,tipo:e.target.value}))} style={inputSt}>
          <option value="acao">Ações / FII / ETF</option>
          <option value="rf">Renda Fixa</option>
        </select>
      </label>
      {calcForm.tipo==="acao"?<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8,marginBottom:10}}>
        {[["Preço de compra","pc"],["Preço atual","pa"],["Quantidade","qt"]].map(([l,k])=><label key={k} style={{fontSize:12,color:"#6b7280"}}>{l}<input type="number" value={calcForm[k]} onChange={e=>setCalcForm(f=>({...f,[k]:e.target.value}))} style={inputSt}/></label>)}
      </div>:<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8,marginBottom:10}}>
        <label style={{fontSize:12,color:"#6b7280"}}>Valor investido<input type="number" value={calcForm.pc} onChange={e=>setCalcForm(f=>({...f,pc:e.target.value}))} style={inputSt}/></label>
        <label style={{fontSize:12,color:"#6b7280"}}>Índice<select value={calcForm.indice} onChange={e=>setCalcForm(f=>({...f,indice:e.target.value}))} style={inputSt}>{INDICES_RF.map(i=><option key={i}>{i}</option>)}</select></label>
        {calcForm.indice!=="Prefixado"?<label style={{fontSize:12,color:"#6b7280"}}>Taxa adicional % a.a.<input type="number" value={calcForm.taxa} onChange={e=>setCalcForm(f=>({...f,taxa:e.target.value}))} placeholder="Ex: 9 para IPCA+9%" style={inputSt}/></label>:<label style={{fontSize:12,color:"#6b7280"}}>Taxa prefixada % a.a.<input type="number" value={calcForm.taxa} onChange={e=>setCalcForm(f=>({...f,taxa:e.target.value}))} style={inputSt}/></label>}
        <label style={{fontSize:12,color:"#6b7280"}}>Período (meses)<input type="number" value={calcForm.meses} onChange={e=>setCalcForm(f=>({...f,meses:e.target.value}))} style={inputSt}/></label>
      </div>}
      <Btn onClick={calcRent}>Calcular</Btn>
      {calcRes&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8,marginTop:12}}>
        <MetricCard label="Investido" value={fmtM(calcRes.investido,currency)}/>
        <MetricCard label="Valor atual" value={fmtM(calcRes.atual,currency)}/>
        <MetricCard label="Lucro" value={fmtM(calcRes.lucro,currency)} color={calcRes.lucro>=0?C.receita:C.despesa}/>
        <MetricCard label="Rentabilidade" value={calcRes.pct.toFixed(2)+"%"} color={calcRes.pct>=0?C.receita:C.despesa}/>
        {calcRes.taxa&&<MetricCard label="Taxa efetiva a.a." value={calcRes.taxa+"%"} color={C.meta}/>}
      </div>}
    </Card>

    {/* Simulador */}
    <Card>
      <p style={{fontSize:14,fontWeight:700,margin:"0 0 10px"}}>Simular juros compostos</p>
      <label style={{fontSize:12,color:"#6b7280",display:"block",marginBottom:8}}>Tipo de taxa
        <select value={simForm.tipo} onChange={e=>setSimForm(f=>({...f,tipo:e.target.value}))} style={inputSt}>
          <option value="fixo">Taxa fixa mensal (%)</option>
          <option value="pct">% de índice (ex: 102% CDI)</option>
          <option value="mais">Índice + % (ex: IPCA + 9%)</option>
        </select>
      </label>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8,marginBottom:10}}>
        <label style={{fontSize:12,color:"#6b7280"}}>Valor inicial<input type="number" value={simForm.ini} onChange={e=>setSimForm(f=>({...f,ini:e.target.value}))} style={inputSt}/></label>
        <label style={{fontSize:12,color:"#6b7280"}}>Aporte mensal<input type="number" value={simForm.ap} onChange={e=>setSimForm(f=>({...f,ap:e.target.value}))} style={inputSt}/></label>
        {simForm.tipo!=="fixo"&&<label style={{fontSize:12,color:"#6b7280"}}>Índice<select value={simForm.indice} onChange={e=>setSimForm(f=>({...f,indice:e.target.value}))} style={inputSt}>{INDICES_RF.filter(i=>i!=="Prefixado").map(i=><option key={i}>{i}</option>)}</select></label>}
        {simForm.tipo==="fixo"&&<label style={{fontSize:12,color:"#6b7280"}}>Taxa mensal %<input type="number" value={simForm.taxa} onChange={e=>setSimForm(f=>({...f,taxa:e.target.value}))} style={inputSt}/></label>}
        {simForm.tipo==="pct"&&<label style={{fontSize:12,color:"#6b7280"}}>% do índice<input type="number" value={simForm.pctInd} onChange={e=>setSimForm(f=>({...f,pctInd:e.target.value}))} placeholder="Ex: 102" style={inputSt}/></label>}
        {simForm.tipo==="mais"&&<label style={{fontSize:12,color:"#6b7280"}}>Taxa adicional % a.a.<input type="number" value={simForm.taxa} onChange={e=>setSimForm(f=>({...f,taxa:e.target.value}))} placeholder="Ex: 9" style={inputSt}/></label>}
        <label style={{fontSize:12,color:"#6b7280"}}>Período (meses)<input type="number" value={simForm.meses} onChange={e=>setSimForm(f=>({...f,meses:e.target.value}))} style={inputSt}/></label>
      </div>
      <Btn onClick={simJuros} color={C.meta}>Simular</Btn>
      {simRes&&<div style={{marginTop:12}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8,marginBottom:12}}>
          <MetricCard label="Patrimônio final" value={fmtM(simRes.saldo,currency)} color={C.receita}/>
          <MetricCard label="Total aportado" value={fmtM(simRes.aportado,currency)}/>
          <MetricCard label="Juros ganhos" value={fmtM(simRes.juros,currency)} color={C.invest}/>
        </div>
        {simRes.pts.map((p,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,marginBottom:4}}>
          <span style={{minWidth:55,color:"#9ca3af"}}>Mês {p.mes}</span>
          <div style={{flex:1,background:"#e5e7eb",borderRadius:4,height:8}}><div style={{width:Math.round(p.saldo/simRes.saldo*100)+"%",background:C.invest,borderRadius:4,height:8}}/></div>
          <span style={{minWidth:90,textAlign:"right",fontWeight:600}}>{fmtM(p.saldo,currency)}</span>
        </div>)}
      </div>}
    </Card>

    {/* Alocação */}
    <Card>
      <p style={{fontSize:14,fontWeight:700,margin:"0 0 2px"}}>Sugestão de alocação ideal</p>
      <p style={{fontSize:12,color:"#6b7280",margin:"0 0 10px"}}>Baseado nos seus investimentos cadastrados</p>
      <Btn onClick={sugerirAloc} disabled={alocLoading} color={C.cartao}>{alocLoading?"Analisando...":"Analisar carteira"}</Btn>
      {alocRes&&<div style={{marginTop:12}}>
        <p style={{fontSize:13,color:"#374151",marginBottom:12}}>{alocRes.analise}</p>
        {alocRes.sugestao?.map((s,i)=><div key={i} style={{background:"#f9fafb",borderRadius:8,padding:"10px 12px",marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:3}}><span style={{fontWeight:600}}>{s.tipo}</span><span style={{color:"#6b7280"}}>{s.pct_atual}% → <strong style={{color:C.invest}}>{s.pct_ideal}%</strong></span></div>
          <p style={{margin:0,fontSize:12,color:"#9ca3af"}}>{s.acao}</p>
        </div>)}
      </div>}
    </Card>
  </div>;
}

// ── App principal ─────────────────────────────────────────────────────────────
export default function App() {
  const [profileId,setProfileId]=useState(()=>lsGet("active_profile")||"br");
  const [allData,setAllData]=useState(()=>lsGet("all_profiles")||{br:{...EMPTY},au:{...EMPTY}});
  const [tab,setTab]=useState(0);
  const [mes,setMes]=useState(MES_ATUAL);
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [grafico,setGrafico]=useState("barras");

  const profile=PROFILES.find(p=>p.id===profileId);
  const currency=profile.currency;
  const data=allData[profileId]||{...EMPTY};

  function setData(upd) {
    setAllData(all=>{
      const prev=all[profileId]||{...EMPTY};
      const next=typeof upd==="function"?upd(prev):{...prev,...upd};
      const updated={...all,[profileId]:next};
      lsSet("all_profiles",updated);
      return updated;
    });
  }

  useEffect(()=>{ lsSet("active_profile",profileId); setTab(0); },[profileId]);

  // Categorias customizáveis
  const catD=data.catD||CAT_D_DEFAULT;
  const catR=data.catR||CAT_R_DEFAULT;
  function addCat(tipo,nome) {
    if(!nome.trim()) return;
    setData(d=>({...d,[tipo==="D"?"catD":"catR"]:[...(tipo==="D"?d.catD||CAT_D_DEFAULT:d.catR||CAT_R_DEFAULT),nome.trim()]}));
  }

  const txMes=data.transacoes.filter(t=>{const d=new Date(t.data);return d.getMonth()===mes&&d.getFullYear()===ANO_ATUAL;});
  const totR=txMes.filter(t=>t.tipo==="receita").reduce((a,b)=>a+b.valor,0);
  const totD=txMes.filter(t=>t.tipo==="despesa").reduce((a,b)=>a+b.valor,0);
  const saldo=totR-totD;
  const fatMes=data.faturas.filter(f=>f.mes===mes);
  const totF=fatMes.reduce((a,b)=>a+b.valor,0);
  const totInv=data.investimentos.reduce((a,b)=>a+(b.valorAtual||b.valorInvestido||b.valor||0),0);

  function saldoBanco(b) {
    const txs=data.transacoes.filter(t=>t.bancoId===b.id);
    return (b.saldoInicial||0)+txs.filter(t=>t.tipo==="receita").reduce((a,x)=>a+x.valor,0)-txs.filter(t=>t.tipo==="despesa").reduce((a,x)=>a+x.valor,0);
  }
  const totBancos=data.bancos.reduce((a,b)=>a+saldoBanco(b),0);

  const openModal=(tipo,item=null)=>{setModal(tipo);setForm(item?{...item,editId:item.id}:{});};
  const closeModal=()=>{setModal(null);setForm({});};
  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));

  // Vencimento da fatura → lança como despesa no banco
  function saveFatura() {
    const f={id:form.editId||uid(),cartao:form.cartao||"Outro",valor:parseFloat(form.valor)||0,vencimento:form.vencimento||"",mes,bancoId:form.bancoId||null,debitado:false};
    setData(d=>{
      let fat=form.editId?d.faturas.map(x=>x.id===form.editId?f:x):[...d.faturas,f];
      // Lança despesa vinculada ao banco se houver banco e vencimento
      let txs=[...d.transacoes];
      if(f.bancoId&&f.vencimento&&!form.editId) {
        txs.push({id:uid(),tipo:"despesa",descricao:`Fatura ${f.cartao}`,valor:f.valor,categoria:"Cartão de Crédito",data:f.vencimento,bancoId:f.bancoId,faturaId:f.id});
      }
      return {...d,faturas:fat,transacoes:txs};
    });
    closeModal();
  }

  function saveTransacao() {
    if(!form.bancoId&&data.bancos.length>0){ alert("Selecione um banco!"); return; }
    const t={id:form.editId||uid(),tipo:form.tipo||"despesa",descricao:form.descricao||"Sem descrição",valor:parseFloat(form.valor)||0,categoria:form.categoria||(form.tipo==="receita"?catR[0]:catD[0]),data:form.data||hoje.toISOString().slice(0,10),bancoId:form.bancoId||null};
    setData(d=>({...d,transacoes:form.editId?d.transacoes.map(x=>x.id===form.editId?t:x):[...d.transacoes,t]}));
    closeModal();
  }
  function saveMeta() {
    const m={id:form.editId||uid(),nome:form.nome||"Meta",objetivo:parseFloat(form.objetivo)||0,atual:parseFloat(form.atual)||0};
    setData(d=>({...d,metas:form.editId?d.metas.map(x=>x.id===form.editId?m:x):[...d.metas,m]}));
    closeModal();
  }
  const del=(col,id)=>setData(d=>({...d,[col]:d[col].filter(x=>x.id!==id)}));
  const updMeta=(id,v)=>setData(d=>({...d,metas:d.metas.map(m=>m.id===id?{...m,atual:parseFloat(v)||0}:m)}));

  // Dados gráficos
  const ultimos6=Array.from({length:6},(_,i)=>{
    const d=new Date(ANO_ATUAL,MES_ATUAL-5+i,1);
    const m=d.getMonth(), a=d.getFullYear();
    const txs=data.transacoes.filter(t=>{const td=new Date(t.data);return td.getMonth()===m&&td.getFullYear()===a;});
    return {label:MESES[m],r:txs.filter(t=>t.tipo==="receita").reduce((a,b)=>a+b.valor,0),d:txs.filter(t=>t.tipo==="despesa").reduce((a,b)=>a+b.valor,0),v:0};
  });
  // saldo acumulado para linha
  let acc=0;
  const lineData=ultimos6.map(d=>{acc+=d.r-d.d;return{label:d.label,v:acc};});
  const catPieD=catD.map((c,i)=>({label:c,v:txMes.filter(t=>t.tipo==="despesa"&&t.categoria===c).reduce((a,b)=>a+b.valor,0),color:INVEST_CORES[i%INVEST_CORES.length]})).filter(x=>x.v>0);
  const catPieR=catR.map((c,i)=>({label:c,v:txMes.filter(t=>t.tipo==="receita"&&t.categoria===c).reduce((a,b)=>a+b.valor,0),color:INVEST_CORES[i%INVEST_CORES.length]})).filter(x=>x.v>0);

  const tiposI=TIPOS_INV.map(t=>({t,v:data.investimentos.filter(i=>i.tipo===t).reduce((a,b)=>a+(b.valorAtual||b.valorInvestido||b.valor||0),0)})).filter(x=>x.v>0);

  // Categorias para modal com input de nova categoria
  const [newCatD,setNewCatD]=useState(""); const [newCatR,setNewCatR]=useState("");

  // ── Backup / Restore ──
  function exportarDados() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      all_profiles: allData,
      watchlist_br: lsGet("watchlist_br") || [],
      watchlist_au: lsGet("watchlist_au") || [],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financas_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importarDados(e) {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const payload = JSON.parse(ev.target.result);
        if(!payload.all_profiles) { alert("Arquivo inválido."); return; }
        if(!window.confirm("Isso vai substituir todos os seus dados atuais. Confirma?")) return;
        lsSet("all_profiles", payload.all_profiles);
        if(payload.watchlist_br) lsSet("watchlist_br", payload.watchlist_br);
        if(payload.watchlist_au) lsSet("watchlist_au", payload.watchlist_au);
        setAllData(payload.all_profiles);
        alert("✅ Dados restaurados com sucesso!");
      } catch { alert("Erro ao ler o arquivo. Verifique se é um backup válido."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const importRef = useRef(null);

  return (
    <div style={{fontFamily:"system-ui,sans-serif",maxWidth:760,margin:"0 auto",padding:"1rem 1rem 3rem",background:"#f9fafb",minHeight:"100vh"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem",flexWrap:"wrap",gap:8}}>
        <h1 style={{fontSize:20,fontWeight:800,margin:0}}>💰 Controle Financeiro</h1>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          {PROFILES.map(p=><button key={p.id} onClick={()=>setProfileId(p.id)} style={{padding:"6px 14px",borderRadius:20,fontSize:13,cursor:"pointer",fontWeight:profileId===p.id?700:400,background:profileId===p.id?"#111":"#fff",color:profileId===p.id?"#fff":"#374151",border:"1px solid #e5e7eb"}}>{p.label}</button>)}
          <div style={{width:"1px",height:24,background:"#e5e7eb"}}/>
          <button onClick={exportarDados} title="Exportar backup" style={{padding:"6px 12px",borderRadius:20,fontSize:12,cursor:"pointer",background:"#fff",border:"1px solid #e5e7eb",color:"#374151",display:"flex",alignItems:"center",gap:4}}>⬇️ Exportar</button>
          <button onClick={()=>importRef.current.click()} title="Importar backup" style={{padding:"6px 12px",borderRadius:20,fontSize:12,cursor:"pointer",background:"#fff",border:"1px solid #e5e7eb",color:"#374151",display:"flex",alignItems:"center",gap:4}}>⬆️ Importar</button>
          <input ref={importRef} type="file" accept=".json" onChange={importarDados} style={{display:"none"}}/>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:4,marginBottom:"1.25rem",flexWrap:"wrap"}}>
        {TABS.map((t,i)=><button key={t} onClick={()=>setTab(i)} style={{padding:"6px 13px",borderRadius:20,fontSize:13,cursor:"pointer",border:tab===i?"none":"1px solid #d1d5db",background:tab===i?C.receita:"#fff",color:tab===i?"#fff":"#6b7280",fontWeight:tab===i?600:400}}>{t}</button>)}
      </div>

      {(tab===0||tab===2||tab===3)&&<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:"1rem"}}>
        <span style={{fontSize:13,color:"#6b7280"}}>Mês:</span>
        <select value={mes} onChange={e=>setMes(+e.target.value)} style={{fontSize:13,padding:"5px 10px",borderRadius:8,border:"1px solid #e5e7eb"}}>
          {MESES.map((m,i)=><option key={m} value={i}>{m} {ANO_ATUAL}</option>)}
        </select>
      </div>}

      {/* ── DASHBOARD ── */}
      {tab===0&&<div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10}}>
          <MetricCard label="Receitas" value={fmtM(totR,currency)} color={C.receita}/>
          <MetricCard label="Despesas" value={fmtM(totD,currency)} color={C.despesa}/>
          <MetricCard label="Saldo" value={fmtM(data.bancos.length>0?totBancos:saldo,currency)} color={(data.bancos.length>0?totBancos:saldo)>=0?C.receita:C.despesa} sub={data.bancos.length>0?"Soma dos bancos":"Receitas - Despesas"}/>
          <MetricCard label="Investimentos" value={fmtM(totInv,currency)} color={C.invest}/>
        </div>

        {/* Gráficos */}
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
            <p style={{margin:0,fontSize:14,fontWeight:700}}>Evolução financeira</p>
            <div style={{display:"flex",gap:4}}>
              {[["barras","📊 Barras"],["pizza_d","🥧 Despesas"],["pizza_r","🥧 Receitas"],["linha","📈 Saldo"]].map(([v,l])=><button key={v} onClick={()=>setGrafico(v)} style={{padding:"4px 10px",borderRadius:16,fontSize:11,cursor:"pointer",border:"none",background:grafico===v?C.invest:"#f3f4f6",color:grafico===v?"#fff":"#6b7280",fontWeight:grafico===v?600:400}}>{l}</button>)}
            </div>
          </div>
          {grafico==="barras"&&<BarChart data={ultimos6} currency={currency}/>}
          {grafico==="pizza_d"&&<><p style={{fontSize:12,color:"#6b7280",marginBottom:8}}>Despesas por categoria — {MESES[mes]}</p><PieChart slices={catPieD}/></>}
          {grafico==="pizza_r"&&<><p style={{fontSize:12,color:"#6b7280",marginBottom:8}}>Receitas por categoria — {MESES[mes]}</p><PieChart slices={catPieR}/></>}
          {grafico==="linha"&&<><p style={{fontSize:12,color:"#6b7280",marginBottom:8}}>Saldo acumulado (últimos 6 meses)</p><LineChart data={lineData} currency={currency}/></>}
        </Card>

        {data.bancos.length>0&&<Card>
          <p style={{fontSize:13,fontWeight:700,marginBottom:10}}>Bancos</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:8}}>
            {data.bancos.map(b=>{const s=saldoBanco(b);return <div key={b.id} style={{background:"#f9fafb",borderRadius:8,padding:"8px 12px"}}>
              <p style={{margin:0,fontSize:12,color:C.banco,fontWeight:600}}>🏦 {b.nome}</p>
              <p style={{margin:"2px 0 0",fontSize:16,fontWeight:700,color:s>=0?C.receita:C.despesa}}>{fmtM(s,currency)}</p>
            </div>;})}
          </div>
        </Card>}

        <Card>
          <p style={{fontSize:13,fontWeight:700,marginBottom:10}}>Despesas por categoria</p>
          {catD.map((c,i)=>{const t=txMes.filter(x=>x.tipo==="despesa"&&x.categoria===c).reduce((a,b)=>a+b.valor,0);if(!t)return null;return <div key={c} style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:"#6b7280"}}>{c}</span><span style={{fontWeight:600}}>{fmtM(t,currency)}</span></div>
            <MiniBar valor={t} total={totD} cor={INVEST_CORES[i%INVEST_CORES.length]}/>
          </div>;})}
        </Card>
        {tiposI.length>0&&<Card>
          <p style={{fontSize:13,fontWeight:700,marginBottom:10}}>Carteira</p>
          {tiposI.map((x,i)=><div key={x.t} style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:"#6b7280"}}>{x.t}</span><span style={{fontWeight:600}}>{fmtM(x.v,currency)} ({totInv>0?Math.round(x.v/totInv*100):0}%)</span></div>
            <MiniBar valor={x.v} total={totInv} cor={INVEST_CORES[i%INVEST_CORES.length]}/>
          </div>)}
        </Card>}
      </div>}

      {tab===1&&<BancosTab data={data} setData={setData} currency={currency}/>}

      {/* ── LANÇAMENTOS ── */}
      {tab===2&&<div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
        <Btn onClick={()=>openModal("tx")} style={{alignSelf:"flex-start"}}>+ Novo lançamento</Btn>
        {data.bancos.length===0&&<p style={{fontSize:12,color:C.despesa,padding:"8px 12px",background:"#fef2f2",borderRadius:8}}>⚠️ Cadastre um banco primeiro — é obrigatório vincular um banco ao lançamento.</p>}
        {txMes.length===0&&<p style={{fontSize:13,color:"#9ca3af"}}>Nenhum lançamento neste mês.</p>}
        {txMes.sort((a,b)=>b.data.localeCompare(a.data)).map(t=><Card key={t.id} style={{display:"flex",alignItems:"center",gap:12,padding:"0.75rem 1rem"}}>
          <div style={{width:36,height:36,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",background:t.tipo==="receita"?"#d1fae5":"#fde8e8",fontSize:18}}>{t.tipo==="receita"?"↑":"↓"}</div>
          <div style={{flex:1}}>
            <p style={{margin:0,fontSize:14,fontWeight:600}}>{t.descricao}</p>
            <p style={{margin:0,fontSize:12,color:"#9ca3af"}}>{t.categoria} · {t.data}{t.bancoId?` · 🏦 ${data.bancos.find(b=>b.id===t.bancoId)?.nome||""}`:""}</p>
          </div>
          <span style={{fontWeight:700,color:t.tipo==="receita"?C.receita:C.despesa,fontSize:15}}>{t.tipo==="receita"?"+":"-"}{fmtM(t.valor,currency)}</span>
          <div style={{display:"flex",gap:4}}>
            <button onClick={()=>openModal("tx",t)} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>✏️</button>
            <button onClick={()=>del("transacoes",t.id)} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>🗑</button>
          </div>
        </Card>)}
      </div>}

      {/* ── CARTÃO ── */}
      {tab===3&&<div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
        <Btn onClick={()=>openModal("fat")} color={C.cartao} style={{alignSelf:"flex-start"}}>+ Nova fatura</Btn>
        {fatMes.length===0&&<p style={{fontSize:13,color:"#9ca3af"}}>Nenhuma fatura neste mês.</p>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:10}}>
          {fatMes.map(f=><Card key={f.id}>
            <p style={{margin:"0 0 4px",fontSize:13,fontWeight:700,color:C.cartao}}>{f.cartao}</p>
            <p style={{margin:"0 0 2px",fontSize:20,fontWeight:700}}>{fmtM(f.valor,currency)}</p>
            {f.vencimento&&<p style={{margin:0,fontSize:11,color:"#9ca3af"}}>Vence: {f.vencimento}</p>}
            {f.bancoId&&<p style={{margin:"2px 0 0",fontSize:11,color:C.banco}}>🏦 {data.bancos.find(b=>b.id===f.bancoId)?.nome}</p>}
            <div style={{display:"flex",gap:4,marginTop:8}}>
              <button onClick={()=>openModal("fat",f)} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>✏️</button>
              <button onClick={()=>del("faturas",f.id)} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>🗑</button>
            </div>
          </Card>)}
        </div>
        {fatMes.length>0&&<div style={{background:"#f9fafb",borderRadius:8,padding:"0.75rem 1rem",fontSize:14,border:"1px solid #e5e7eb"}}>Total: <strong>{fmtM(totF,currency)}</strong></div>}
      </div>}

      {tab===4&&<InvestimentosTab data={data} setData={setData} currency={currency}/>}

      {/* ── METAS ── */}
      {tab===5&&<div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
        <Btn onClick={()=>openModal("meta")} color={C.meta} style={{alignSelf:"flex-start"}}>+ Nova meta</Btn>
        {data.metas.length===0&&<p style={{fontSize:13,color:"#9ca3af"}}>Nenhuma meta criada.</p>}
        {data.metas.map(m=>{const p=m.objetivo>0?Math.min(100,Math.round(m.atual/m.objetivo*100)):0;return <Card key={m.id}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:15,fontWeight:700}}>🎯 {m.nome}</span>
            <div style={{display:"flex",gap:4}}>
              <button onClick={()=>openModal("meta",m)} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>✏️</button>
              <button onClick={()=>del("metas",m.id)} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>🗑</button>
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:6}}><span style={{color:"#6b7280"}}>Progresso: {p}%</span><span>{fmtM(m.atual,currency)} / {fmtM(m.objetivo,currency)}</span></div>
          <div style={{background:"#e5e7eb",borderRadius:6,height:10}}><div style={{width:p+"%",background:C.meta,borderRadius:6,height:10,transition:"width .4s"}}/></div>
          <div style={{marginTop:10,display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontSize:12,color:"#9ca3af"}}>Atualizar:</span>
            <input type="number" defaultValue={m.atual} onBlur={e=>updMeta(m.id,e.target.value)} style={{width:110,padding:"5px 8px",borderRadius:8,border:"1px solid #e5e7eb",fontSize:13}}/>
          </div>
        </Card>;})}
      </div>}

      {tab===6&&<AnaliseTab investimentos={data.investimentos} profileId={profileId} market={profile.market} currency={currency}/>}

      {/* ── MODAIS ── */}
      {modal==="tx"&&<Modal title={form.editId?"Editar lançamento":"Novo lançamento"} onClose={closeModal}>
        <label style={{fontSize:13}}>Tipo<select value={form.tipo||"despesa"} onChange={e=>setF("tipo",e.target.value)} style={inputSt}><option value="despesa">Despesa</option><option value="receita">Receita</option></select></label>
        <label style={{fontSize:13}}>Descrição<input value={form.descricao||""} onChange={e=>setF("descricao",e.target.value)} style={inputSt}/></label>
        <label style={{fontSize:13}}>Valor ({currency})<input type="number" value={form.valor||""} onChange={e=>setF("valor",e.target.value)} style={inputSt}/></label>
        <label style={{fontSize:13}}>Categoria
          <select value={form.categoria||""} onChange={e=>setF("categoria",e.target.value)} style={inputSt}>
            {(form.tipo==="receita"?catR:catD).map(c=><option key={c}>{c}</option>)}
          </select>
        </label>
        <div style={{display:"flex",gap:6,marginTop:2}}>
          <input placeholder="Nova categoria..." value={form.tipo==="receita"?newCatR:newCatD} onChange={e=>form.tipo==="receita"?setNewCatR(e.target.value):setNewCatD(e.target.value)} style={{...inputSt,marginTop:0,flex:1}}/>
          <Btn onClick={()=>{addCat(form.tipo==="receita"?"R":"D",form.tipo==="receita"?newCatR:newCatD);form.tipo==="receita"?setNewCatR(""):setNewCatD("");}} style={{padding:"6px 10px",whiteSpace:"nowrap"}}>+ Add</Btn>
        </div>
        <label style={{fontSize:13}}>Data<input type="date" value={form.data||hoje.toISOString().slice(0,10)} onChange={e=>setF("data",e.target.value)} style={inputSt}/></label>
        <label style={{fontSize:13}}>Banco <span style={{color:C.despesa}}>*</span>
          <select value={form.bancoId||""} onChange={e=>setF("bancoId",e.target.value)} style={inputSt}>
            <option value="">Selecione o banco...</option>
            {data.bancos.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
        </label>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn outline color="#6b7280" onClick={closeModal}>Cancelar</Btn>
          <Btn onClick={saveTransacao}>Salvar</Btn>
        </div>
      </Modal>}

      {modal==="fat"&&<Modal title={form.editId?"Editar fatura":"Nova fatura"} onClose={closeModal}>
        <label style={{fontSize:13}}>Cartão<input value={form.cartao||""} onChange={e=>setF("cartao",e.target.value)} placeholder="Ex: Nubank, Itaú, Santander..." style={inputSt}/></label>
        <label style={{fontSize:13}}>Valor ({currency})<input type="number" value={form.valor||""} onChange={e=>setF("valor",e.target.value)} style={inputSt}/></label>
        <label style={{fontSize:13}}>Data de vencimento<input type="date" value={form.vencimento||""} onChange={e=>setF("vencimento",e.target.value)} style={inputSt}/></label>
        <label style={{fontSize:13}}>Banco para débito automático
          <select value={form.bancoId||""} onChange={e=>setF("bancoId",e.target.value)} style={inputSt}>
            <option value="">Nenhum</option>
            {data.bancos.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
        </label>
        {form.bancoId&&<p style={{fontSize:11,color:C.banco,margin:0,padding:"6px 10px",background:"#e0f2fe",borderRadius:6}}>✓ No vencimento, o valor será debitado automaticamente de {data.bancos.find(b=>b.id===form.bancoId)?.nome}</p>}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn outline color="#6b7280" onClick={closeModal}>Cancelar</Btn>
          <Btn onClick={saveFatura} color={C.cartao}>Salvar</Btn>
        </div>
      </Modal>}

      {modal==="meta"&&<Modal title={form.editId?"Editar meta":"Nova meta"} onClose={closeModal}>
        <label style={{fontSize:13}}>Nome<input value={form.nome||""} onChange={e=>setF("nome",e.target.value)} style={inputSt}/></label>
        <label style={{fontSize:13}}>Objetivo ({currency})<input type="number" value={form.objetivo||""} onChange={e=>setF("objetivo",e.target.value)} style={inputSt}/></label>
        <label style={{fontSize:13}}>Valor atual ({currency})<input type="number" value={form.atual||""} onChange={e=>setF("atual",e.target.value)} style={inputSt}/></label>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn outline color="#6b7280" onClick={closeModal}>Cancelar</Btn>
          <Btn onClick={saveMeta} color={C.meta}>Salvar</Btn>
        </div>
      </Modal>}
    </div>
  );
}
