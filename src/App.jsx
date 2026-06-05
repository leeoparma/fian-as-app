import { useState, useEffect, useRef } from "react";

// ── Paleta ───────────────────────────────────────────────────────────────────
const C = { receita:"#1D9E75", despesa:"#D85A30", cartao:"#7F77DD", invest:"#378ADD", meta:"#BA7517", banco:"#0E7490" };
const INVEST_CORES = ["#378ADD","#1D9E75","#7F77DD","#D85A30","#BA7517"];

// ── Constantes ────────────────────────────────────────────────────────────────
const PROFILES = [
  { id:"br", label:"🇧🇷 Brasil",    currency:"R$",  locale:"pt-BR", market:"brazil" },
  { id:"au", label:"🇦🇺 Austrália", currency:"A$",  locale:"en-AU", market:"australia" },
];
const CAT_D  = ["Alimentação","Transporte","Saúde","Lazer","Moradia","Educação","Outros"];
const CAT_R  = ["Salário","Freelance","Investimentos","Outros"];
const TIPOS_INV = ["Renda Fixa","Ações","FII","Cripto","ETF","Outros"];
const CARTOES   = ["Nubank","Itaú","Bradesco","C6","ANZ","CommBank","Westpac","Outro"];
const MESES     = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const TABS      = ["Dashboard","Bancos","Receitas & Despesas","Cartão","Investimentos","Metas","Análise"];
const hoje      = new Date();
const MES_ATUAL = hoje.getMonth();
const ANO_ATUAL = hoje.getFullYear();
const EMPTY_PROFILE = { transacoes:[], faturas:[], investimentos:[], metas:[], bancos:[] };

// ── Storage ───────────────────────────────────────────────────────────────────
const lsGet = k => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):null; } catch{ return null; } };
const lsSet = (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch{} };

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtMoney = (v, currency="R$") => currency + " " + Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const uid = () => Date.now() + Math.random().toString(36).slice(2,6);

// ── Componentes base ──────────────────────────────────────────────────────────
function MiniBar({valor,total,cor}) {
  const p = total>0?Math.min(100,(valor/total)*100):0;
  return <div style={{background:"#e5e7eb",borderRadius:4,height:6,marginTop:4}}>
    <div style={{width:p+"%",background:cor,borderRadius:4,height:6,transition:"width .4s"}}/>
  </div>;
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
    padding:"8px 16px",borderRadius:8,fontSize:13,fontWeight:500,cursor:disabled?"not-allowed":"pointer",
    opacity:disabled?0.6:1,transition:"opacity .15s",
    ...(outline
      ? {background:"#fff",border:`1px solid ${color||C.receita}`,color:color||C.receita}
      : {background:color||C.receita,border:"none",color:"#fff"}),
    ...style
  }}>{children}</button>;
}
const inputStyle = {display:"block",width:"100%",marginTop:4,padding:"7px 10px",borderRadius:8,border:"1px solid #e5e7eb",fontSize:13,boxSizing:"border-box"};

// ── Claude API helper ─────────────────────────────────────────────────────────
async function askClaude(prompt, maxTokens=800) {
  const res = await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:maxTokens,
      messages:[{role:"user",content:prompt}] })
  });
  const d = await res.json();
  return d.content.filter(b=>b.type==="text").map(b=>b.text).join("").replace(/```json|```/g,"").trim();
}

// ── TradingView ───────────────────────────────────────────────────────────────
function TVWidget({type,config}) {
  const ref = useRef(null);
  const key = JSON.stringify(config);
  useEffect(()=>{
    const el=ref.current; if(!el) return;
    el.innerHTML="";
    const w=document.createElement("div"); w.className="tradingview-widget-container__widget"; el.appendChild(w);
    const s=document.createElement("script"); s.type="text/javascript"; s.async=true;
    s.src=`https://s3.tradingview.com/external-embedding/embed-widget-${type}.js`;
    s.innerHTML=JSON.stringify(config); el.appendChild(s);
    return ()=>{ el.innerHTML=""; };
  },[key]);
  return <div ref={ref} style={{minHeight:config.height||400,borderRadius:8,overflow:"hidden",background:"#f3f4f6",display:"flex",alignItems:"center",justifyContent:"center"}}>
    <p style={{color:"#9ca3af",fontSize:13}}>Carregando TradingView...</p>
  </div>;
}

function ChartModal({ticker,onClose}) {
  const symbol = /^[A-Z]{1,5}(\.[A-Z]+)?$/.test(ticker)?ticker:"BMFBOVESPA:"+ticker;
  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300}}>
    <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:14,padding:"1rem",width:"min(96vw,760px)",boxSizing:"border-box"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <span style={{fontSize:15,fontWeight:700}}>{ticker}</span>
        <button onClick={onClose} style={{border:"none",background:"none",cursor:"pointer",fontSize:22,color:"#9ca3af"}}>✕</button>
      </div>
      <TVWidget type="advanced-chart" config={{symbol,interval:"D",locale:"pt_BR",theme:"light",style:"1",width:"100%",height:460,allow_symbol_change:true}}/>
      <p style={{fontSize:11,color:"#9ca3af",marginTop:4,textAlign:"center"}}>TradingView</p>
    </div>
  </div>;
}

// ── Aba Bancos ────────────────────────────────────────────────────────────────
function BancosTab({data,setData,currency}) {
  const [modal,setModal] = useState(null);
  const [form,setForm] = useState({});
  const [transf,setTransf] = useState({de:"",para:"",valor:"",desc:""});

  function saldoBanco(banco) {
    const txs = data.transacoes.filter(t=>t.bancoId===banco.id);
    const entradas = txs.filter(t=>t.tipo==="receita").reduce((a,b)=>a+b.valor,0);
    const saidas   = txs.filter(t=>t.tipo==="despesa").reduce((a,b)=>a+b.valor,0);
    return (banco.saldoInicial||0) + entradas - saidas;
  }

  function saveBanco() {
    const b={id:form.editId||uid(),nome:form.nome||"Banco",saldoInicial:parseFloat(form.saldoInicial)||0,limite:parseFloat(form.limite)||0,tipo:form.tipo||"corrente"};
    setData(d=>({...d,bancos:form.editId?d.bancos.map(x=>x.id===form.editId?b:x):[...d.bancos,b]}));
    setModal(null); setForm({});
  }

  function doTransf() {
    const v=parseFloat(transf.valor); if(!v||!transf.de||!transf.para||transf.de===transf.para) return;
    const dt=hoje.toISOString().slice(0,10);
    const saida={id:uid(),tipo:"despesa",descricao:`Transferência → ${data.bancos.find(b=>b.id===transf.para)?.nome||""}`,valor:v,categoria:"Transferência",data:dt,bancoId:transf.de};
    const entrada={id:uid(),tipo:"receita",descricao:`Transferência ← ${data.bancos.find(b=>b.id===transf.de)?.nome||""}`,valor:v,categoria:"Transferência",data:dt,bancoId:transf.para};
    setData(d=>({...d,transacoes:[...d.transacoes,saida,entrada]}));
    setTransf({de:"",para:"",valor:"",desc:""});
  }

  const totalSaldos = data.bancos.reduce((a,b)=>a+saldoBanco(b),0);

  return <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <Btn onClick={()=>{setModal("banco");setForm({});}}>+ Novo banco</Btn>
      <span style={{fontSize:13,color:"#6b7280"}}>Total: <strong>{fmtMoney(totalSaldos,currency)}</strong></span>
    </div>

    {data.bancos.length===0&&<p style={{fontSize:13,color:"#9ca3af"}}>Nenhum banco cadastrado.</p>}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:10}}>
      {data.bancos.map(b=>{
        const saldo=saldoBanco(b);
        const txs=data.transacoes.filter(t=>t.bancoId===b.id).sort((a,c)=>c.data.localeCompare(a.data)).slice(0,5);
        return <Card key={b.id}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <p style={{margin:"0 0 2px",fontSize:14,fontWeight:700,color:C.banco}}>🏦 {b.nome}</p>
              <p style={{margin:0,fontSize:11,color:"#9ca3af",textTransform:"capitalize"}}>{b.tipo}</p>
            </div>
            <div style={{display:"flex",gap:4}}>
              <button onClick={()=>{setModal("banco");setForm({...b,editId:b.id});}} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>✏️</button>
              <button onClick={()=>setData(d=>({...d,bancos:d.bancos.filter(x=>x.id!==b.id)}))} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>🗑</button>
            </div>
          </div>
          <p style={{margin:"8px 0 2px",fontSize:20,fontWeight:700,color:saldo>=0?C.receita:C.despesa}}>{fmtMoney(saldo,currency)}</p>
          {b.limite>0&&<p style={{margin:0,fontSize:11,color:"#9ca3af"}}>Limite: {fmtMoney(b.limite,currency)}</p>}
          {txs.length>0&&<div style={{marginTop:10,borderTop:"1px solid #f3f4f6",paddingTop:8}}>
            <p style={{fontSize:11,color:"#9ca3af",margin:"0 0 4px"}}>Últimas movimentações</p>
            {txs.map(t=><div key={t.id} style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2}}>
              <span style={{color:"#6b7280",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:120}}>{t.descricao}</span>
              <span style={{fontWeight:600,color:t.tipo==="receita"?C.receita:C.despesa}}>{t.tipo==="receita"?"+":"-"}{fmtMoney(t.valor,currency)}</span>
            </div>)}
          </div>}
        </Card>;
      })}
    </div>

    {data.bancos.length>=2&&<Card>
      <p style={{fontSize:14,fontWeight:700,marginBottom:10}}>↔ Transferência entre bancos</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
        <label style={{fontSize:12,color:"#6b7280"}}>De
          <select value={transf.de} onChange={e=>setTransf(f=>({...f,de:e.target.value}))} style={inputStyle}>
            <option value="">Selecione...</option>
            {data.bancos.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
        </label>
        <label style={{fontSize:12,color:"#6b7280"}}>Para
          <select value={transf.para} onChange={e=>setTransf(f=>({...f,para:e.target.value}))} style={inputStyle}>
            <option value="">Selecione...</option>
            {data.bancos.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
        </label>
      </div>
      <label style={{fontSize:12,color:"#6b7280",display:"block",marginBottom:8}}>Valor ({currency})
        <input type="number" value={transf.valor} onChange={e=>setTransf(f=>({...f,valor:e.target.value}))} style={inputStyle}/>
      </label>
      <Btn onClick={doTransf} color={C.banco}>Transferir</Btn>
    </Card>}

    {modal==="banco"&&<div onClick={()=>setModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:14,padding:"1.5rem",width:320,boxSizing:"border-box",display:"flex",flexDirection:"column",gap:12}}>
        <h3 style={{margin:0,fontSize:16,fontWeight:700}}>{form.editId?"Editar banco":"Novo banco"}</h3>
        <label style={{fontSize:13}}>Nome do banco<input value={form.nome||""} onChange={e=>setForm(f=>({...f,nome:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:13}}>Tipo
          <select value={form.tipo||"corrente"} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} style={inputStyle}>
            <option value="corrente">Conta Corrente</option><option value="poupança">Poupança</option><option value="investimento">Conta Investimento</option>
          </select>
        </label>
        <label style={{fontSize:13}}>Saldo inicial ({currency})<input type="number" value={form.saldoInicial||""} onChange={e=>setForm(f=>({...f,saldoInicial:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:13}}>Limite de crédito ({currency})<input type="number" value={form.limite||""} onChange={e=>setForm(f=>({...f,limite:e.target.value}))} style={inputStyle}/></label>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn outline color="#6b7280" onClick={()=>setModal(null)}>Cancelar</Btn>
          <Btn onClick={saveBanco}>Salvar</Btn>
        </div>
      </div>
    </div>}
  </div>;
}

// ── Aba Investimentos (com P&L + dividendos) ──────────────────────────────────
function InvestimentosTab({data,setData,currency}) {
  const [modal,setModal] = useState(false);
  const [form,setForm] = useState({});
  const [chartTicker,setChartTicker] = useState(null);
  const [loadingId,setLoadingId] = useState(null);

  const totalInvest = data.investimentos.reduce((a,b)=>a+(b.valorAtual||b.valor*( b.quantidade||1)),0);

  async function buscarDados(inv) {
    setLoadingId(inv.id);
    try {
      const txt = await askClaude(`JSON only, no markdown. For stock ${inv.ticker||inv.descricao} give: {"preco_atual":number,"lucro_pct":number,"prox_dividendo":"YYYY-MM-DD or null","valor_dividendo":number or null,"dy":number or null,"moeda":"${currency}","resumo":"1 sentence pt-BR"}. Preço médio pago: ${inv.precoMedio||0}. Quantidade: ${inv.quantidade||1}.`, 500);
      const obj = JSON.parse(txt);
      const valorAtual = obj.preco_atual * (inv.quantidade||1);
      const lucro = valorAtual - (inv.precoMedio||0)*(inv.quantidade||1);
      setData(d=>({...d,investimentos:d.investimentos.map(x=>x.id===inv.id?{...x,...obj,valorAtual,lucro}:x)}));
    } catch{}
    setLoadingId(null);
  }

  function saveInv() {
    const i={id:form.editId||uid(),tipo:form.tipo||"Ações",descricao:form.descricao||"",ticker:form.ticker||"",quantidade:parseFloat(form.quantidade)||1,precoMedio:parseFloat(form.precoMedio)||0,valor:parseFloat(form.precoMedio||0)*parseFloat(form.quantidade||1),data:form.data||hoje.toISOString().slice(0,10)};
    setData(d=>({...d,investimentos:form.editId?d.investimentos.map(x=>x.id===form.editId?i:x):[...d.investimentos,i]}));
    setModal(false); setForm({});
  }

  const tiposI = TIPOS_INV.map(t=>({t,v:data.investimentos.filter(i=>i.tipo===t).reduce((a,b)=>a+(b.valorAtual||b.valor),0)})).filter(x=>x.v>0);

  return <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
    {chartTicker&&<ChartModal ticker={chartTicker} onClose={()=>setChartTicker(null)}/>}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <Btn onClick={()=>{setModal(true);setForm({});}} color={C.invest}>+ Novo ativo</Btn>
      <span style={{fontSize:13,color:"#6b7280"}}>Total: <strong>{fmtMoney(totalInvest,currency)}</strong></span>
    </div>

    {tiposI.length>0&&<Card>
      <p style={{fontSize:13,fontWeight:700,marginBottom:10}}>Por tipo</p>
      {tiposI.map((x,i)=><div key={x.t} style={{marginBottom:8}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:"#6b7280"}}>{x.t}</span><span style={{fontWeight:600}}>{fmtMoney(x.v,currency)} ({totalInvest>0?Math.round(x.v/totalInvest*100):0}%)</span></div>
        <MiniBar valor={x.v} total={totalInvest} cor={INVEST_CORES[i%INVEST_CORES.length]}/>
      </div>)}
    </Card>}

    {data.investimentos.length===0&&<p style={{fontSize:13,color:"#9ca3af"}}>Nenhum ativo cadastrado.</p>}
    {data.investimentos.map(inv=>{
      const custo=(inv.precoMedio||0)*(inv.quantidade||1);
      const atual=inv.valorAtual||custo;
      const lucro=inv.lucro!==undefined?inv.lucro:atual-custo;
      const lucropct=custo>0?(lucro/custo*100):0;
      return <Card key={inv.id} style={{gap:0}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              {inv.ticker&&<span onClick={()=>setChartTicker(inv.ticker)} style={{fontSize:15,fontWeight:700,color:C.invest,cursor:"pointer",textDecoration:"underline"}}>{inv.ticker}</span>}
              <span style={{fontSize:13,color:"#374151",fontWeight:500}}>{inv.descricao}</span>
              <span style={{fontSize:11,background:"#f3f4f6",color:"#6b7280",borderRadius:4,padding:"2px 6px"}}>{inv.tipo}</span>
            </div>
            <p style={{margin:"2px 0 0",fontSize:12,color:"#9ca3af"}}>{inv.quantidade} unidades · Preço médio: {fmtMoney(inv.precoMedio||0,currency)}</p>
          </div>
          <div style={{display:"flex",gap:4}}>
            <button onClick={()=>buscarDados(inv)} disabled={loadingId===inv.id} title="Atualizar dados" style={{border:"none",background:"none",cursor:"pointer",fontSize:16,opacity:loadingId===inv.id?0.4:1}}>🔄</button>
            <button onClick={()=>{setModal(true);setForm({...inv,editId:inv.id});}} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>✏️</button>
            <button onClick={()=>setData(d=>({...d,investimentos:d.investimentos.filter(x=>x.id!==inv.id)}))} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>🗑</button>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8,marginTop:12}}>
          <MetricCard label="Custo total" value={fmtMoney(custo,currency)}/>
          <MetricCard label="Valor atual" value={fmtMoney(atual,currency)}/>
          <MetricCard label="Lucro/Prejuízo" value={fmtMoney(lucro,currency)} color={lucro>=0?C.receita:C.despesa} sub={lucropct.toFixed(2)+"%"}/>
          {inv.preco_atual&&<MetricCard label="Preço atual" value={fmtMoney(inv.preco_atual,currency)}/>}
          {inv.dy!=null&&<MetricCard label="DY" value={Number(inv.dy).toFixed(2)+"%"} color={C.meta}/>}
          {inv.prox_dividendo&&<MetricCard label="Próx. dividendo" value={inv.prox_dividendo} sub={inv.valor_dividendo?fmtMoney(inv.valor_dividendo,currency)+" /ação":""} color={C.banco}/>}
        </div>
        {inv.resumo&&<p style={{fontSize:12,color:"#6b7280",marginTop:8,padding:"6px 10px",background:"#f9fafb",borderRadius:6}}>{inv.resumo}</p>}
      </Card>;
    })}

    {modal&&<div onClick={()=>setModal(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:14,padding:"1.5rem",width:340,boxSizing:"border-box",display:"flex",flexDirection:"column",gap:12,maxHeight:"90vh",overflowY:"auto"}}>
        <h3 style={{margin:0,fontSize:16,fontWeight:700}}>{form.editId?"Editar ativo":"Novo ativo"}</h3>
        <label style={{fontSize:13}}>Tipo<select value={form.tipo||"Ações"} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} style={inputStyle}>{TIPOS_INV.map(t=><option key={t}>{t}</option>)}</select></label>
        <label style={{fontSize:13}}>Ticker (ex: PETR4, AAPL)<input value={form.ticker||""} onChange={e=>setForm(f=>({...f,ticker:e.target.value.toUpperCase()}))} style={inputStyle}/></label>
        <label style={{fontSize:13}}>Descrição<input value={form.descricao||""} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:13}}>Quantidade<input type="number" value={form.quantidade||""} onChange={e=>setForm(f=>({...f,quantidade:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:13}}>Preço médio pago ({currency})<input type="number" value={form.precoMedio||""} onChange={e=>setForm(f=>({...f,precoMedio:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:13}}>Data de compra<input type="date" value={form.data||hoje.toISOString().slice(0,10)} onChange={e=>setForm(f=>({...f,data:e.target.value}))} style={inputStyle}/></label>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn outline color="#6b7280" onClick={()=>setModal(false)}>Cancelar</Btn>
          <Btn onClick={saveInv} color={C.invest}>Salvar</Btn>
        </div>
      </div>
    </div>}
  </div>;
}

// ── Aba Análise ───────────────────────────────────────────────────────────────
const WL_CATEGORIAS = ["Todas","Banco","Infraestrutura","Fundo Imobiliário","Energia","Tecnologia","Varejo","Saúde","Agronegócio","Mineração","Petróleo","ETF","Exterior","Outros"];
const INDICADORES_COMP = [
  {key:"preco",label:"Preço",fmt:v=>v!=null?"R$ "+Number(v).toFixed(2):"—"},
  {key:"pl",label:"P/L",fmt:v=>v!=null?Number(v).toFixed(1)+"x":"—"},
  {key:"pvp",label:"P/VP",fmt:v=>v!=null?Number(v).toFixed(2)+"x":"—"},
  {key:"dy",label:"DY",fmt:v=>v!=null?Number(v).toFixed(2)+"%":"—"},
  {key:"roe",label:"ROE",fmt:v=>v!=null?Number(v).toFixed(2)+"%":"—"},
  {key:"divida_ebitda",label:"Dív/EBITDA",fmt:v=>v!=null?Number(v).toFixed(2)+"x":"—"},
  {key:"cagr_lucro",label:"CAGR Lucro",fmt:v=>v!=null?Number(v).toFixed(2)+"%":"—"},
  {key:"margem_liquida",label:"Margem Líq.",fmt:v=>v!=null?Number(v).toFixed(2)+"%":"—"},
];

function AnaliseTab({investimentos,profileId,market}) {
  const WL_KEY = `watchlist_${profileId}`;
  const [watchlist,setWatchlist] = useState(()=>lsGet(WL_KEY)||[]);
  const [wInput,setWInput]       = useState("");
  const [wCategoria,setWCategoria] = useState("");
  const [wFiltro,setWFiltro]     = useState("Todas");
  const [wLoading,setWLoading]   = useState(false);
  const [chartTicker,setChartTicker] = useState(null);
  const [news,setNews]           = useState({});
  const [newsLoading,setNewsLoading] = useState(false);
  // Comparador
  const [compInput,setCompInput] = useState("");
  const [compList,setCompList]   = useState([]);
  const [compLoading,setCompLoading] = useState(false);
  const [compData,setCompData]   = useState([]);
  // Fundamentalista selector
  const [fundTicker,setFundTicker] = useState("");
  const [fundInput,setFundInput]   = useState("");
  const [fundSymbol,setFundSymbol] = useState("BMFBOVESPA:PETR4");
  // Calculadora / Simulador / Alocação
  const [calcForm,setCalcForm]   = useState({pc:"",pa:"",qt:""});
  const [calcRes,setCalcRes]     = useState(null);
  const [simForm,setSimForm]     = useState({ini:"",ap:"",taxa:"",meses:""});
  const [simRes,setSimRes]       = useState(null);
  const [alocRes,setAlocRes]     = useState(null);
  const [alocLoading,setAlocLoading] = useState(false);
  const [erro,setErro]           = useState("");

  useEffect(()=>{ lsSet(WL_KEY,watchlist); },[watchlist]);

  async function addWatch() {
    const t=wInput.trim().toUpperCase(); if(!t||watchlist.find(w=>w.ticker===t)){setWInput("");return;}
    setWLoading(true); setErro("");
    try {
      const txt=await askClaude(`JSON only. Fundamentals for ${t}: {"ticker":"${t}","nome":"short name","setor":"str","categoria":"one of: Banco|Infraestrutura|Fundo Imobiliário|Energia|Tecnologia|Varejo|Saúde|Agronegócio|Mineração|Petróleo|ETF|Exterior|Outros","preco":number,"pl":number|null,"dy":number|null,"roe":number|null}`,400);
      const obj = JSON.parse(txt);
      if(wCategoria) obj.categoria = wCategoria;
      setWatchlist(p=>[...p,obj]);
    } catch { setWatchlist(p=>[...p,{ticker:t,nome:t,setor:"—",categoria:wCategoria||"Outros",preco:null,pl:null,dy:null,roe:null}]); }
    setWInput(""); setWLoading(false);
  }

  async function fetchNews() {
    if(watchlist.length===0){setErro("Adicione ativos à watchlist primeiro.");return;}
    setNewsLoading(true); setErro("");
    const tickers=watchlist.map(w=>w.ticker).join(", ");
    try {
      const txt=await askClaude(`Analista financeiro. Para cada ativo: ${tickers}, JSON array sem markdown: [{"ticker":"XX","noticias":[{"titulo":"str","resumo":"2 frases pt-BR","tipo":"resultado|dividendo|fato_relevante|noticia","data":"YYYY-MM-DD ou recente"}]}]. Eventos mais relevantes e recentes.`,1500);
      const arr=JSON.parse(txt); const map={};
      arr.forEach(item=>{ map[item.ticker]=item.noticias; });
      setNews(map);
    } catch{ setErro("Erro ao buscar notícias."); }
    setNewsLoading(false);
  }

  async function addComp() {
    const t=compInput.trim().toUpperCase(); if(!t||compList.includes(t)){setCompInput("");return;}
    setCompList(p=>[...p,t]); setCompInput("");
  }

  async function compararAtivos() {
    if(compList.length<2){setErro("Adicione pelo menos 2 ativos para comparar.");return;}
    setCompLoading(true); setErro("");
    try {
      const txt=await askClaude(`JSON array only, no markdown. One object per ticker for: ${compList.join(",")}. Each: {"ticker":"","nome":"","preco":number|null,"pl":number|null,"pvp":number|null,"dy":number|null,"roe":number|null,"divida_ebitda":number|null,"cagr_lucro":number|null,"margem_liquida":number|null}`,1200);
      setCompData(JSON.parse(txt));
    } catch{ setErro("Erro ao comparar ativos."); }
    setCompLoading(false);
  }

  function applyFundSymbol() {
    const t=fundInput.trim().toUpperCase(); if(!t) return;
    const sym=/^[A-Z]{1,5}(\.[A-Z]+)?$/.test(t)?t:"BMFBOVESPA:"+t;
    setFundSymbol(sym); setFundTicker(t); setFundInput("");
  }

  function calcRent() {
    const pc=parseFloat(calcForm.pc),pa=parseFloat(calcForm.pa),qt=parseFloat(calcForm.qt);
    if(!pc||!pa||!qt) return;
    setCalcRes({investido:pc*qt,atual:pa*qt,lucro:(pa-pc)*qt,pct:((pa-pc)/pc)*100});
  }

  function simJuros() {
    const ini=parseFloat(simForm.ini)||0,ap=parseFloat(simForm.ap)||0;
    const taxa=parseFloat(simForm.taxa)||0,meses=parseInt(simForm.meses)||0;
    if(!meses) return;
    const tm=taxa/100; let saldo=ini;
    const pts=[{mes:0,saldo:Math.round(ini)}];
    for(let i=1;i<=meses;i++){saldo=saldo*(1+tm)+ap;if(i%(Math.max(1,Math.floor(meses/12)))===0||i===meses)pts.push({mes:i,saldo:Math.round(saldo)});}
    setSimRes({saldo:Math.round(saldo),aportado:Math.round(ini+ap*meses),juros:Math.round(saldo-(ini+ap*meses)),pts});
  }

  async function sugerirAloc() {
    if(!investimentos.length){setErro("Adicione investimentos primeiro.");return;}
    setAlocLoading(true); setErro("");
    const resumo=investimentos.map(i=>`${i.tipo}: ${i.valor}`).join(", ");
    try {
      const txt=await askClaude(`Carteira: ${resumo}. JSON only: {"analise":"2 frases","sugestao":[{"tipo":"str","pct_atual":0,"pct_ideal":0,"acao":"str"}]}`);
      setAlocRes(JSON.parse(txt));
    } catch{ setErro("Erro ao gerar sugestão."); }
    setAlocLoading(false);
  }

  const tipoIcons  = {resultado:"📊",dividendo:"💰",fato_relevante:"📢",noticia:"📰"};
  const tipoColors = {resultado:"#dbeafe",dividendo:"#d1fae5",fato_relevante:"#fef3c7",noticia:"#f3f4f6"};
  const tipoLine   = {resultado:C.invest,dividendo:C.receita,fato_relevante:"#f59e0b",noticia:"#9ca3af"};

  const wlFiltrada = wFiltro==="Todas" ? watchlist : watchlist.filter(w=>(w.categoria||"Outros")===wFiltro);
  const categoriasUsadas = ["Todas",...new Set(watchlist.map(w=>w.categoria||"Outros"))];

  // melhor valor highlight para comparador
  function isBest(key,val,arr) {
    if(val==null) return false;
    const vals=arr.map(a=>a[key]).filter(v=>v!=null);
    if(vals.length<2) return false;
    const better=["dy","roe","cagr_lucro","margem_liquida"];
    const lower=["pl","pvp","divida_ebitda"];
    if(better.includes(key)) return val===Math.max(...vals);
    if(lower.includes(key)) return val===Math.min(...vals);
    return false;
  }

  return <div style={{display:"flex",flexDirection:"column",gap:"1.25rem"}}>
    {chartTicker&&<ChartModal ticker={chartTicker} onClose={()=>setChartTicker(null)}/>}
    {erro&&<p style={{fontSize:12,color:C.despesa,margin:0,padding:"8px 12px",background:"#fef2f2",borderRadius:8}}>{erro}</p>}

    {/* ── Watchlist ── */}
    <Card>
      <p style={{fontSize:14,fontWeight:700,margin:"0 0 2px"}}>Carteira de acompanhamento</p>
      <p style={{fontSize:12,color:"#6b7280",margin:"0 0 10px"}}>Clique num ativo para abrir o gráfico</p>
      <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
        <input value={wInput} onChange={e=>setWInput(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&addWatch()}
          placeholder="Ticker (ex: PETR4)" style={{flex:1,minWidth:120,...inputStyle,marginTop:0}}/>
        <select value={wCategoria} onChange={e=>setWCategoria(e.target.value)} style={{...inputStyle,marginTop:0,minWidth:150,flex:1}}>
          <option value="">Categoria (auto)</option>
          {WL_CATEGORIAS.filter(c=>c!=="Todas").map(c=><option key={c}>{c}</option>)}
        </select>
        <Btn onClick={addWatch} disabled={wLoading} color={C.invest} style={{whiteSpace:"nowrap"}}>{wLoading?"...":"+ Adicionar"}</Btn>
      </div>

      {/* Filtro por categoria */}
      {watchlist.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:12}}>
        {categoriasUsadas.map(cat=>(
          <button key={cat} onClick={()=>setWFiltro(cat)} style={{
            padding:"4px 10px",borderRadius:16,fontSize:11,cursor:"pointer",fontWeight:wFiltro===cat?600:400,
            background:wFiltro===cat?C.invest:"#f3f4f6",color:wFiltro===cat?"#fff":"#6b7280",border:"none"
          }}>{cat} {cat!=="Todas"?`(${watchlist.filter(w=>(w.categoria||"Outros")===cat).length})`:""}</button>
        ))}
      </div>}

      {wlFiltrada.length===0&&<p style={{fontSize:13,color:"#9ca3af"}}>Nenhum ativo {wFiltro!=="Todas"?"nesta categoria":""} adicionado.</p>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))",gap:8}}>
        {wlFiltrada.map(w=><div key={w.ticker} onClick={()=>setChartTicker(w.ticker)}
          style={{background:"#f9fafb",borderRadius:10,padding:"10px 12px",cursor:"pointer",border:"1px solid #e5e7eb",position:"relative",transition:"border-color .15s"}}
          onMouseEnter={e=>e.currentTarget.style.borderColor=C.invest}
          onMouseLeave={e=>e.currentTarget.style.borderColor="#e5e7eb"}>
          <button onClick={e=>{e.stopPropagation();setWatchlist(p=>p.filter(x=>x.ticker!==w.ticker));}} style={{position:"absolute",top:5,right:6,border:"none",background:"none",cursor:"pointer",fontSize:12,color:"#9ca3af"}}>✕</button>
          <p style={{margin:"0 0 1px",fontSize:13,fontWeight:700,color:C.invest}}>{w.ticker}</p>
          <p style={{margin:"0 0 2px",fontSize:11,color:"#9ca3af",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{w.nome}</p>
          {w.categoria&&<span style={{fontSize:10,background:"#f0fdf4",color:"#166534",borderRadius:4,padding:"1px 5px",display:"inline-block",marginBottom:4}}>{w.categoria}</span>}
          <p style={{margin:"2px 0 4px",fontSize:15,fontWeight:700,color:"#111"}}>{w.preco!=null?"R$ "+Number(w.preco).toFixed(2):"—"}</p>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {w.pl!=null&&<span style={{fontSize:10,background:"#dbeafe",color:"#1e40af",borderRadius:4,padding:"2px 5px"}}>P/L {Number(w.pl).toFixed(1)}</span>}
            {w.dy!=null&&<span style={{fontSize:10,background:"#d1fae5",color:"#065f46",borderRadius:4,padding:"2px 5px"}}>DY {Number(w.dy).toFixed(1)}%</span>}
          </div>
          <p style={{margin:"5px 0 0",fontSize:10,color:"#9ca3af"}}>Ver gráfico →</p>
        </div>)}
      </div>
    </Card>

    {/* ── Comparador ── */}
    <Card>
      <p style={{fontSize:14,fontWeight:700,margin:"0 0 2px"}}>Comparador de ativos</p>
      <p style={{fontSize:12,color:"#6b7280",margin:"0 0 10px"}}>Adicione quantos ativos quiser e compare os indicadores lado a lado</p>
      <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
        <input value={compInput} onChange={e=>setCompInput(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&addComp()}
          placeholder="Ticker (ex: ITUB4)" style={{flex:1,minWidth:120,...inputStyle,marginTop:0}}/>
        <Btn onClick={addComp} color={C.cartao} style={{whiteSpace:"nowrap"}}>+ Adicionar</Btn>
        <Btn onClick={compararAtivos} disabled={compLoading||compList.length<2} color={C.invest} style={{whiteSpace:"nowrap"}}>{compLoading?"Comparando...":"Comparar"}</Btn>
      </div>
      {compList.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
        {compList.map(t=><span key={t} style={{display:"flex",alignItems:"center",gap:4,background:"#dbeafe",color:"#1e40af",borderRadius:16,padding:"3px 10px",fontSize:12,fontWeight:600}}>
          {t}
          <button onClick={()=>{setCompList(p=>p.filter(x=>x!==t));setCompData(p=>p.filter(x=>x.ticker!==t));}} style={{border:"none",background:"none",cursor:"pointer",color:"#1e40af",fontSize:13,lineHeight:1,padding:0}}>✕</button>
        </span>)}
      </div>}
      {compData.length>=2&&<div style={{overflowX:"auto",marginTop:4}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:400}}>
          <thead>
            <tr style={{background:"#f9fafb"}}>
              <th style={{textAlign:"left",padding:"8px 10px",borderBottom:"1px solid #e5e7eb",color:"#6b7280",fontWeight:600,fontSize:12}}>Indicador</th>
              {compData.map(a=><th key={a.ticker} style={{textAlign:"right",padding:"8px 10px",borderBottom:"1px solid #e5e7eb",color:C.invest,fontWeight:700}}>
                <div>{a.ticker}</div>
                <div style={{fontSize:10,color:"#9ca3af",fontWeight:400}}>{a.nome}</div>
              </th>)}
            </tr>
          </thead>
          <tbody>
            {INDICADORES_COMP.map((ind,ri)=><tr key={ind.key} style={{background:ri%2===0?"#fff":"#f9fafb"}}>
              <td style={{padding:"7px 10px",color:"#6b7280",borderBottom:"1px solid #f3f4f6",fontWeight:500}}>{ind.label}</td>
              {compData.map(a=>{
                const best=isBest(ind.key,a[ind.key],compData);
                return <td key={a.ticker} style={{padding:"7px 10px",textAlign:"right",borderBottom:"1px solid #f3f4f6",fontWeight:best?700:400,color:best?C.receita:"#111",background:best?"#f0fdf4":"transparent"}}>
                  {ind.fmt(a[ind.key])}
                  {best&&<span style={{marginLeft:4,fontSize:10}}>✓</span>}
                </td>;
              })}
            </tr>)}
          </tbody>
        </table>
        <p style={{fontSize:11,color:"#9ca3af",marginTop:6}}>✓ Verde = melhor valor no indicador</p>
      </div>}
    </Card>

    {/* ── Alertas ── */}
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
        <div>
          <p style={{fontSize:14,fontWeight:700,margin:"0 0 2px"}}>🔔 Alertas e anúncios</p>
          <p style={{fontSize:12,color:"#6b7280",margin:0}}>Eventos recentes dos seus ativos</p>
        </div>
        <Btn onClick={fetchNews} disabled={newsLoading} color={C.banco} style={{fontSize:12,padding:"6px 12px"}}>{newsLoading?"Buscando...":"Atualizar notícias"}</Btn>
      </div>
      {Object.keys(news).length===0&&!newsLoading&&<p style={{fontSize:13,color:"#9ca3af",marginTop:8}}>Clique em "Atualizar notícias" para buscar anúncios.</p>}
      {newsLoading&&<div style={{textAlign:"center",padding:"2rem",color:"#9ca3af",fontSize:13}}>Buscando notícias e anúncios...</div>}
      {Object.entries(news).map(([ticker,noticias])=><div key={ticker} style={{marginBottom:16}}>
        <p style={{fontSize:13,fontWeight:700,color:C.invest,margin:"0 0 8px"}}>{ticker}</p>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {noticias.map((n,i)=><div key={i} style={{background:tipoColors[n.tipo]||"#f9fafb",borderRadius:8,padding:"8px 12px",borderLeft:`3px solid ${tipoLine[n.tipo]||"#9ca3af"}`}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
              <span style={{fontSize:14}}>{tipoIcons[n.tipo]||"📰"}</span>
              <span style={{fontSize:12,fontWeight:600,color:"#374151"}}>{n.titulo}</span>
              <span style={{fontSize:10,color:"#9ca3af",marginLeft:"auto"}}>{n.data}</span>
            </div>
            <p style={{margin:0,fontSize:12,color:"#6b7280"}}>{n.resumo}</p>
          </div>)}
        </div>
      </div>)}
    </Card>

    {/* ── Indicadores fundamentalistas TradingView ── */}
    <Card>
      <p style={{fontSize:14,fontWeight:700,margin:"0 0 2px"}}>Indicadores fundamentalistas</p>
      <p style={{fontSize:12,color:"#6b7280",margin:"0 0 10px"}}>Dados em tempo real do TradingView</p>
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <input value={fundInput} onChange={e=>setFundInput(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&applyFundSymbol()}
          placeholder="Digite o ticker (ex: ITUB4, AAPL)" style={{flex:1,...inputStyle,marginTop:0}}/>
        <Btn onClick={applyFundSymbol} color={C.invest} style={{whiteSpace:"nowrap"}}>Ver indicadores</Btn>
      </div>
      {fundTicker&&<p style={{fontSize:12,color:"#6b7280",margin:"0 0 8px"}}>Exibindo: <strong style={{color:C.invest}}>{fundTicker}</strong></p>}
      {/* Watchlist como atalhos */}
      {watchlist.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:10}}>
        {watchlist.map(w=><button key={w.ticker} onClick={()=>{setFundSymbol(/^[A-Z]{1,5}(\.[A-Z]+)?$/.test(w.ticker)?w.ticker:"BMFBOVESPA:"+w.ticker);setFundTicker(w.ticker);}} style={{
          padding:"3px 10px",borderRadius:16,fontSize:11,cursor:"pointer",border:"1px solid #e5e7eb",
          background:fundTicker===w.ticker?C.invest:"#f9fafb",color:fundTicker===w.ticker?"#fff":"#374151",fontWeight:fundTicker===w.ticker?700:400
        }}>{w.ticker}</button>)}
      </div>}
      <TVWidget type="financials" config={{symbol:fundSymbol,colorTheme:"light",isTransparent:false,displayMode:"regular",width:"100%",height:490,locale:"pt_BR"}}/>
    </Card>

    <Card>
      <p style={{fontSize:14,fontWeight:700,margin:"0 0 2px"}}>Screener de ações</p>
      <p style={{fontSize:12,color:"#6b7280",margin:"0 0 10px"}}>Filtre ativos por P/L, DY, ROE e mais</p>
      <TVWidget type="screener" config={{width:"100%",height:490,defaultColumn:"overview",defaultScreen:"most_capitalized",market,showToolbar:true,colorTheme:"light",locale:"pt_BR"}}/>
    </Card>

    {/* ── Calculadora ── */}
    <Card>
      <p style={{fontSize:14,fontWeight:700,margin:"0 0 10px"}}>Calcular rentabilidade</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,marginBottom:10}}>
        {[["Preço de compra","pc"],["Preço atual","pa"],["Quantidade","qt"]].map(([l,k])=>(
          <label key={k} style={{fontSize:12,color:"#6b7280"}}>{l}<input type="number" value={calcForm[k]} onChange={e=>setCalcForm(f=>({...f,[k]:e.target.value}))} style={inputStyle}/></label>
        ))}
      </div>
      <Btn onClick={calcRent}>Calcular</Btn>
      {calcRes&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,marginTop:12}}>
        <MetricCard label="Investido" value={fmtMoney(calcRes.investido,"R$")}/>
        <MetricCard label="Valor atual" value={fmtMoney(calcRes.atual,"R$")}/>
        <MetricCard label="Lucro/Prejuízo" value={fmtMoney(calcRes.lucro,"R$")} color={calcRes.lucro>=0?C.receita:C.despesa}/>
        <MetricCard label="Rentabilidade" value={calcRes.pct.toFixed(2)+"%"} color={calcRes.pct>=0?C.receita:C.despesa}/>
      </div>}
    </Card>

    {/* ── Simulador ── */}
    <Card>
      <p style={{fontSize:14,fontWeight:700,margin:"0 0 10px"}}>Simular juros compostos</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,marginBottom:10}}>
        {[["Valor inicial","ini"],["Aporte mensal","ap"],["Taxa mensal (%)","taxa"],["Período (meses)","meses"]].map(([l,k])=>(
          <label key={k} style={{fontSize:12,color:"#6b7280"}}>{l}<input type="number" value={simForm[k]} onChange={e=>setSimForm(f=>({...f,[k]:e.target.value}))} style={inputStyle}/></label>
        ))}
      </div>
      <Btn onClick={simJuros} color={C.meta}>Simular</Btn>
      {simRes&&<div style={{marginTop:12}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,marginBottom:12}}>
          <MetricCard label="Patrimônio final" value={fmtMoney(simRes.saldo,"R$")} color={C.receita}/>
          <MetricCard label="Total aportado" value={fmtMoney(simRes.aportado,"R$")}/>
          <MetricCard label="Juros ganhos" value={fmtMoney(simRes.juros,"R$")} color={C.invest}/>
        </div>
        {simRes.pts.map((p,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,marginBottom:4}}>
          <span style={{minWidth:58,color:"#9ca3af"}}>Mês {p.mes}</span>
          <div style={{flex:1,background:"#e5e7eb",borderRadius:4,height:8}}><div style={{width:Math.round(p.saldo/simRes.saldo*100)+"%",background:C.invest,borderRadius:4,height:8}}/></div>
          <span style={{minWidth:90,textAlign:"right",fontWeight:600}}>{fmtMoney(p.saldo,"R$")}</span>
        </div>)}
      </div>}
    </Card>

    {/* ── Alocação ── */}
    <Card>
      <p style={{fontSize:14,fontWeight:700,margin:"0 0 2px"}}>Sugestão de alocação ideal</p>
      <p style={{fontSize:12,color:"#6b7280",margin:"0 0 10px"}}>Baseado nos seus investimentos cadastrados</p>
      <Btn onClick={sugerirAloc} disabled={alocLoading} color={C.cartao}>{alocLoading?"Analisando...":"Analisar carteira"}</Btn>
      {alocRes&&<div style={{marginTop:12}}>
        <p style={{fontSize:13,color:"#374151",marginBottom:12}}>{alocRes.analise}</p>
        {alocRes.sugestao.map((s,i)=><div key={i} style={{background:"#f9fafb",borderRadius:8,padding:"10px 12px",marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:3}}>
            <span style={{fontWeight:600}}>{s.tipo}</span>
            <span style={{color:"#6b7280"}}>{s.pct_atual}% → <strong style={{color:C.invest}}>{s.pct_ideal}%</strong></span>
          </div>
          <p style={{margin:0,fontSize:12,color:"#9ca3af"}}>{s.acao}</p>
        </div>)}
      </div>}
    </Card>
  </div>;
}

// ── App principal ─────────────────────────────────────────────────────────────
export default function App() {
  const [profileId,setProfileId] = useState(()=>lsGet("active_profile")||"br");
  const [allData,setAllData] = useState(()=>lsGet("all_profiles")||{br:{...EMPTY_PROFILE},au:{...EMPTY_PROFILE}});
  const [tab,setTab] = useState(0);
  const [mes,setMes] = useState(MES_ATUAL);
  const [modal,setModal] = useState(null);
  const [form,setForm] = useState({});

  const profile = PROFILES.find(p=>p.id===profileId);
  const currency = profile.currency;
  const data = allData[profileId] || {...EMPTY_PROFILE};

  function setData(updater) {
    setAllData(all=>{
      const prev=all[profileId]||{...EMPTY_PROFILE};
      const next=typeof updater==="function"?updater(prev):{...prev,...updater};
      const updated={...all,[profileId]:next};
      lsSet("all_profiles",updated);
      return updated;
    });
  }

  useEffect(()=>{ lsSet("active_profile",profileId); setTab(0); },[profileId]);

  const txMes=data.transacoes.filter(t=>{const d=new Date(t.data);return d.getMonth()===mes&&d.getFullYear()===ANO_ATUAL;});
  const totR=txMes.filter(t=>t.tipo==="receita").reduce((a,b)=>a+b.valor,0);
  const totD=txMes.filter(t=>t.tipo==="despesa").reduce((a,b)=>a+b.valor,0);
  const saldo=totR-totD;
  const fatMes=data.faturas.filter(f=>f.mes===mes);
  const totF=fatMes.reduce((a,b)=>a+b.valor,0);
  const totInv=data.investimentos.reduce((a,b)=>a+(b.valorAtual||b.valor),0);
  const totBancos=data.bancos.reduce((a,b)=>a+(b.saldoInicial||0),0);

  const openModal=(tipo,item=null)=>{setModal(tipo);setForm(item?{...item,editId:item.id}:{});};
  const closeModal=()=>{setModal(null);setForm({});};
  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));

  function saveTransacao() {
    const t={id:form.editId||uid(),tipo:form.tipo||"despesa",descricao:form.descricao||"Sem descrição",valor:parseFloat(form.valor)||0,categoria:form.categoria||(form.tipo==="receita"?CAT_R[0]:CAT_D[0]),data:form.data||hoje.toISOString().slice(0,10),bancoId:form.bancoId||null};
    setData(d=>({...d,transacoes:form.editId?d.transacoes.map(x=>x.id===form.editId?t:x):[...d.transacoes,t]}));
    closeModal();
  }
  function saveFatura() {
    const f={id:form.editId||uid(),cartao:form.cartao||"Outro",valor:parseFloat(form.valor)||0,vencimento:form.vencimento||"",mes};
    setData(d=>({...d,faturas:form.editId?d.faturas.map(x=>x.id===form.editId?f:x):[...d.faturas,f]}));
    closeModal();
  }
  function saveMeta() {
    const m={id:form.editId||uid(),nome:form.nome||"Meta",objetivo:parseFloat(form.objetivo)||0,atual:parseFloat(form.atual)||0};
    setData(d=>({...d,metas:form.editId?d.metas.map(x=>x.id===form.editId?m:x):[...d.metas,m]}));
    closeModal();
  }
  const del=(col,id)=>setData(d=>({...d,[col]:d[col].filter(x=>x.id!==id)}));
  const updMeta=(id,v)=>setData(d=>({...d,metas:d.metas.map(m=>m.id===id?{...m,atual:parseFloat(v)||0}:m)}));

  const catD=CAT_D.map(c=>({c,t:txMes.filter(x=>x.tipo==="despesa"&&x.categoria===c).reduce((a,b)=>a+b.valor,0)})).filter(x=>x.t>0);
  const catR=CAT_R.map(c=>({c,t:txMes.filter(x=>x.tipo==="receita"&&x.categoria===c).reduce((a,b)=>a+b.valor,0)})).filter(x=>x.t>0);
  const tiposI=TIPOS_INV.map(t=>({t,v:data.investimentos.filter(i=>i.tipo===t).reduce((a,b)=>a+(b.valorAtual||b.valor),0)})).filter(x=>x.v>0);

  return (
    <div style={{fontFamily:"system-ui,sans-serif",maxWidth:740,margin:"0 auto",padding:"1rem 1rem 3rem",background:"#f9fafb",minHeight:"100vh"}}>

      {/* Header + troca de perfil */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem",flexWrap:"wrap",gap:8}}>
        <h1 style={{fontSize:20,fontWeight:800,margin:0,color:"#111"}}>💰 Controle Financeiro</h1>
        <div style={{display:"flex",gap:4}}>
          {PROFILES.map(p=>(
            <button key={p.id} onClick={()=>setProfileId(p.id)} style={{
              padding:"6px 14px",borderRadius:20,fontSize:13,cursor:"pointer",fontWeight:profileId===p.id?700:400,
              background:profileId===p.id?"#111":"#fff",color:profileId===p.id?"#fff":"#374151",
              border:"1px solid #e5e7eb",transition:"all .15s"
            }}>{p.label}</button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:4,marginBottom:"1.25rem",flexWrap:"wrap"}}>
        {TABS.map((t,i)=>(
          <button key={t} onClick={()=>setTab(i)} style={{
            padding:"6px 13px",borderRadius:20,fontSize:13,cursor:"pointer",
            border:tab===i?"none":"1px solid #d1d5db",
            background:tab===i?C.receita:"#fff",
            color:tab===i?"#fff":"#6b7280",fontWeight:tab===i?600:400
          }}>{t}</button>
        ))}
      </div>

      {/* Filtro mês */}
      {(tab===0||tab===2||tab===3)&&(
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:"1rem"}}>
          <span style={{fontSize:13,color:"#6b7280"}}>Mês:</span>
          <select value={mes} onChange={e=>setMes(+e.target.value)} style={{fontSize:13,padding:"5px 10px",borderRadius:8,border:"1px solid #e5e7eb"}}>
            {MESES.map((m,i)=><option key={m} value={i}>{m} {ANO_ATUAL}</option>)}
          </select>
        </div>
      )}

      {/* ── DASHBOARD ── */}
      {tab===0&&<div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10}}>
          <MetricCard label="Receitas" value={fmtMoney(totR,currency)} color={C.receita}/>
          <MetricCard label="Despesas" value={fmtMoney(totD,currency)} color={C.despesa}/>
          <MetricCard label="Saldo" value={fmtMoney(saldo,currency)} color={saldo>=0?C.receita:C.despesa}/>
          <MetricCard label="Investimentos" value={fmtMoney(totInv,currency)} color={C.invest}/>
        </div>
        {data.bancos.length>0&&<Card>
          <p style={{fontSize:13,fontWeight:700,marginBottom:10}}>Bancos</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:8}}>
            {data.bancos.map(b=>{
              const s=(b.saldoInicial||0)+data.transacoes.filter(t=>t.bancoId===b.id&&t.tipo==="receita").reduce((a,x)=>a+x.valor,0)-data.transacoes.filter(t=>t.bancoId===b.id&&t.tipo==="despesa").reduce((a,x)=>a+x.valor,0);
              return <div key={b.id} style={{background:"#f9fafb",borderRadius:8,padding:"8px 12px"}}>
                <p style={{margin:0,fontSize:12,color:C.banco,fontWeight:600}}>🏦 {b.nome}</p>
                <p style={{margin:"2px 0 0",fontSize:16,fontWeight:700,color:s>=0?C.receita:C.despesa}}>{fmtMoney(s,currency)}</p>
              </div>;
            })}
          </div>
        </Card>}
        <Card>
          <p style={{fontSize:13,fontWeight:700,marginBottom:10}}>Despesas por categoria</p>
          {catD.length===0?<p style={{fontSize:13,color:"#9ca3af"}}>Nenhuma despesa.</p>:
          catD.map((x,i)=><div key={x.c} style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:"#6b7280"}}>{x.c}</span><span style={{fontWeight:600}}>{fmtMoney(x.t,currency)}</span></div>
            <MiniBar valor={x.t} total={totD} cor={[C.despesa,"#7F77DD","#378ADD","#1D9E75","#BA7517","#D85A30","#888780"][i%7]}/>
          </div>)}
        </Card>
        <Card>
          <p style={{fontSize:13,fontWeight:700,marginBottom:10}}>Receitas por categoria</p>
          {catR.length===0?<p style={{fontSize:13,color:"#9ca3af"}}>Nenhuma receita.</p>:
          catR.map((x,i)=><div key={x.c} style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:"#6b7280"}}>{x.c}</span><span style={{fontWeight:600}}>{fmtMoney(x.t,currency)}</span></div>
            <MiniBar valor={x.t} total={totR} cor={[C.receita,"#378ADD","#7F77DD","#BA7517"][i%4]}/>
          </div>)}
        </Card>
        {tiposI.length>0&&<Card>
          <p style={{fontSize:13,fontWeight:700,marginBottom:10}}>Carteira</p>
          {tiposI.map((x,i)=><div key={x.t} style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:"#6b7280"}}>{x.t}</span><span style={{fontWeight:600}}>{fmtMoney(x.v,currency)} ({totInv>0?Math.round(x.v/totInv*100):0}%)</span></div>
            <MiniBar valor={x.v} total={totInv} cor={INVEST_CORES[i%INVEST_CORES.length]}/>
          </div>)}
        </Card>}
      </div>}

      {/* ── BANCOS ── */}
      {tab===1&&<BancosTab data={data} setData={setData} currency={currency}/>}

      {/* ── RECEITAS & DESPESAS ── */}
      {tab===2&&<div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
        <Btn onClick={()=>openModal("tx")} style={{alignSelf:"flex-start"}}>+ Nova transação</Btn>
        {txMes.length===0&&<p style={{fontSize:13,color:"#9ca3af"}}>Nenhuma transação neste mês.</p>}
        {txMes.sort((a,b)=>b.data.localeCompare(a.data)).map(t=>(
          <Card key={t.id} style={{display:"flex",alignItems:"center",gap:12,padding:"0.75rem 1rem"}}>
            <div style={{width:36,height:36,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",background:t.tipo==="receita"?"#d1fae5":"#fde8e8",fontSize:18}}>{t.tipo==="receita"?"↑":"↓"}</div>
            <div style={{flex:1}}>
              <p style={{margin:0,fontSize:14,fontWeight:600}}>{t.descricao}</p>
              <p style={{margin:0,fontSize:12,color:"#9ca3af"}}>{t.categoria} · {t.data}{t.bancoId&&` · 🏦 ${data.bancos.find(b=>b.id===t.bancoId)?.nome||""}`}</p>
            </div>
            <span style={{fontWeight:700,color:t.tipo==="receita"?C.receita:C.despesa,fontSize:15}}>{t.tipo==="receita"?"+":"-"}{fmtMoney(t.valor,currency)}</span>
            <div style={{display:"flex",gap:4}}>
              <button onClick={()=>openModal("tx",t)} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>✏️</button>
              <button onClick={()=>del("transacoes",t.id)} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>🗑</button>
            </div>
          </Card>
        ))}
      </div>}

      {/* ── CARTÃO ── */}
      {tab===3&&<div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
        <Btn onClick={()=>openModal("fat")} color={C.cartao} style={{alignSelf:"flex-start"}}>+ Nova fatura</Btn>
        {fatMes.length===0&&<p style={{fontSize:13,color:"#9ca3af"}}>Nenhuma fatura neste mês.</p>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10}}>
          {fatMes.map(f=><Card key={f.id}>
            <p style={{margin:"0 0 4px",fontSize:13,fontWeight:700,color:C.cartao}}>{f.cartao}</p>
            <p style={{margin:"0 0 2px",fontSize:20,fontWeight:700}}>{fmtMoney(f.valor,currency)}</p>
            {f.vencimento&&<p style={{margin:0,fontSize:11,color:"#9ca3af"}}>Vence: {f.vencimento}</p>}
            <div style={{display:"flex",gap:4,marginTop:8}}>
              <button onClick={()=>openModal("fat",f)} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>✏️</button>
              <button onClick={()=>del("faturas",f.id)} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>🗑</button>
            </div>
          </Card>)}
        </div>
        {fatMes.length>0&&<div style={{background:"#f9fafb",borderRadius:8,padding:"0.75rem 1rem",fontSize:14,border:"1px solid #e5e7eb"}}>Total: <strong>{fmtMoney(totF,currency)}</strong></div>}
      </div>}

      {/* ── INVESTIMENTOS ── */}
      {tab===4&&<InvestimentosTab data={data} setData={setData} currency={currency}/>}

      {/* ── METAS ── */}
      {tab===5&&<div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
        <Btn onClick={()=>openModal("meta")} color={C.meta} style={{alignSelf:"flex-start"}}>+ Nova meta</Btn>
        {data.metas.length===0&&<p style={{fontSize:13,color:"#9ca3af"}}>Nenhuma meta criada.</p>}
        {data.metas.map(m=>{
          const p=m.objetivo>0?Math.min(100,Math.round(m.atual/m.objetivo*100)):0;
          return <Card key={m.id}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{fontSize:15,fontWeight:700}}>🎯 {m.nome}</span>
              <div style={{display:"flex",gap:4}}>
                <button onClick={()=>openModal("meta",m)} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>✏️</button>
                <button onClick={()=>del("metas",m.id)} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>🗑</button>
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:6}}>
              <span style={{color:"#6b7280"}}>Progresso: {p}%</span>
              <span>{fmtMoney(m.atual,currency)} / {fmtMoney(m.objetivo,currency)}</span>
            </div>
            <div style={{background:"#e5e7eb",borderRadius:6,height:10}}>
              <div style={{width:p+"%",background:C.meta,borderRadius:6,height:10,transition:"width .4s"}}/>
            </div>
            <div style={{marginTop:10,display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontSize:12,color:"#9ca3af"}}>Atualizar:</span>
              <input type="number" defaultValue={m.atual} onBlur={e=>updMeta(m.id,e.target.value)} style={{width:110,padding:"5px 8px",borderRadius:8,border:"1px solid #e5e7eb",fontSize:13}}/>
            </div>
          </Card>;
        })}
      </div>}

      {/* ── ANÁLISE ── */}
      {tab===6&&<AnaliseTab investimentos={data.investimentos} profileId={profileId} market={profile.market}/>}

      {/* ── MODAIS ── */}
      {modal&&<div onClick={closeModal} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}>
        <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:14,padding:"1.5rem",width:340,boxSizing:"border-box",display:"flex",flexDirection:"column",gap:12,maxHeight:"90vh",overflowY:"auto"}}>
          <h3 style={{margin:0,fontSize:16,fontWeight:700}}>
            {modal==="tx"?(form.editId?"Editar transação":"Nova transação"):modal==="fat"?(form.editId?"Editar fatura":"Nova fatura"):(form.editId?"Editar meta":"Nova meta")}
          </h3>
          {modal==="tx"&&<>
            <label style={{fontSize:13}}>Tipo<select value={form.tipo||"despesa"} onChange={e=>setF("tipo",e.target.value)} style={inputStyle}><option value="despesa">Despesa</option><option value="receita">Receita</option></select></label>
            <label style={{fontSize:13}}>Descrição<input value={form.descricao||""} onChange={e=>setF("descricao",e.target.value)} style={inputStyle}/></label>
            <label style={{fontSize:13}}>Valor ({currency})<input type="number" value={form.valor||""} onChange={e=>setF("valor",e.target.value)} style={inputStyle}/></label>
            <label style={{fontSize:13}}>Categoria<select value={form.categoria||""} onChange={e=>setF("categoria",e.target.value)} style={inputStyle}>{(form.tipo==="receita"?CAT_R:CAT_D).map(c=><option key={c}>{c}</option>)}</select></label>
            <label style={{fontSize:13}}>Data<input type="date" value={form.data||hoje.toISOString().slice(0,10)} onChange={e=>setF("data",e.target.value)} style={inputStyle}/></label>
            {data.bancos.length>0&&<label style={{fontSize:13}}>Banco (opcional)<select value={form.bancoId||""} onChange={e=>setF("bancoId",e.target.value)} style={inputStyle}><option value="">Nenhum</option>{data.bancos.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}</select></label>}
          </>}
          {modal==="fat"&&<>
            <label style={{fontSize:13}}>Cartão<select value={form.cartao||""} onChange={e=>setF("cartao",e.target.value)} style={inputStyle}>{CARTOES.map(c=><option key={c}>{c}</option>)}</select></label>
            <label style={{fontSize:13}}>Valor ({currency})<input type="number" value={form.valor||""} onChange={e=>setF("valor",e.target.value)} style={inputStyle}/></label>
            <label style={{fontSize:13}}>Vencimento<input type="date" value={form.vencimento||""} onChange={e=>setF("vencimento",e.target.value)} style={inputStyle}/></label>
          </>}
          {modal==="meta"&&<>
            <label style={{fontSize:13}}>Nome<input value={form.nome||""} onChange={e=>setF("nome",e.target.value)} style={inputStyle}/></label>
            <label style={{fontSize:13}}>Objetivo ({currency})<input type="number" value={form.objetivo||""} onChange={e=>setF("objetivo",e.target.value)} style={inputStyle}/></label>
            <label style={{fontSize:13}}>Valor atual ({currency})<input type="number" value={form.atual||""} onChange={e=>setF("atual",e.target.value)} style={inputStyle}/></label>
          </>}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <Btn outline color="#6b7280" onClick={closeModal}>Cancelar</Btn>
            <Btn onClick={modal==="tx"?saveTransacao:modal==="fat"?saveFatura:saveMeta}>Salvar</Btn>
          </div>
        </div>
      </div>}
    </div>
  );
}
