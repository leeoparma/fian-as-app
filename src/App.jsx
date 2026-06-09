import { useState, useEffect, useRef } from "react";

// ---- STORAGE POLYFILL ----
// Usa window.storage se estiver no Claude.ai, senão usa localStorage
const store = {
  async get(key) {
    if (window.storage && window.storage !== store) return window.storage.get(key);
    const v = localStorage.getItem(key);
    if (v === null) throw new Error("Key not found: " + key);
    return { key, value: v };
  },
  async set(key, value) {
    if (window.storage && window.storage !== store) return window.storage.set(key, value);
    localStorage.setItem(key, value);
    return { key, value };
  },
};

const COLORS = {
  receita: "#1D9E75", despesa: "#D85A30", cartao: "#7F77DD",
  investimento: "#378ADD", meta: "#BA7517",
};
const CATEGORIAS_DESPESA = ["Alimentação","Transporte","Saúde","Lazer","Moradia","Educação","Outros"];
const CATEGORIAS_RECEITA = ["Salário","Freelance","Investimentos","Outros"];
const TIPOS_INVESTIMENTO = ["Renda Fixa","Ações","FII","Cripto","Outros"];
const CARTOES = ["Nubank","Itaú","Bradesco","C6","Outro"];
const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const hoje = new Date();
const mesAtual = hoje.getMonth();
const anoAtual = hoje.getFullYear();
const INVEST_CORES = ["#378ADD","#1D9E75","#7F77DD","#D85A30","#BA7517"];
const TABS = ["Dashboard","Receitas & Despesas","Cartão","Investimentos","Metas","Análise"];

function fmt(v) { return "R$ " + Number(v).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function pct(v) { return (v != null && v !== "" ? Number(v).toFixed(2) + "%" : "—"); }
function num(v,d=2) { return (v != null && v !== "" ? Number(v).toFixed(d) : "—"); }

function MiniBar({valor,total,cor}) {
  const p = total>0?Math.min(100,(valor/total)*100):0;
  return <div style={{background:"#eee",borderRadius:4,height:6,marginTop:4}}><div style={{width:p+"%",background:cor,borderRadius:4,height:6,transition:"width .4s"}}/></div>;
}
function Card({children,style}) {
  return <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:12,padding:"1rem 1.25rem",...style}}>{children}</div>;
}
function MetricCard({label,value,color,sub}) {
  return <div style={{background:"var(--color-background-secondary)",borderRadius:8,padding:"0.85rem 1rem",display:"flex",flexDirection:"column",gap:2}}>
    <span style={{fontSize:12,color:"var(--color-text-secondary)"}}>{label}</span>
    <span style={{fontSize:20,fontWeight:500,color:color||"var(--color-text-primary)"}}>{value}</span>
    {sub&&<span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>{sub}</span>}
  </div>;
}

const INITIAL = { transacoes:[], faturas:[], investimentos:[], metas:[] };

// ---- TRADINGVIEW WIDGETS ----
function TVWidget({ type, config }) {
  const id = "tv_" + type + "_" + Math.random().toString(36).slice(2,7);
  const containerId = useRef(id);
  useEffect(() => {
    const el = document.getElementById(containerId.current);
    if (!el) return;
    el.innerHTML = "";
    const div = document.createElement("div");
    div.className = "tradingview-widget-container__widget";
    el.appendChild(div);
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = `https://s3.tradingview.com/external-embedding/embed-widget-${type}.js`;
    script.async = true;
    script.innerHTML = JSON.stringify(config);
    el.appendChild(script);
    return () => { el.innerHTML = ""; };
  }, []);
  return <div id={containerId.current} style={{minHeight: config.height || 400, borderRadius:8, overflow:"hidden"}}><div style={{display:"flex",alignItems:"center",justifyContent:"center",height:200,fontSize:13,color:"var(--color-text-tertiary)"}}>Carregando...</div></div>;
}

function TVFundamentals() {
  return <TVWidget type="financials" config={{symbol:"BMFBOVESPA:PETR4",colorTheme:"light",isTransparent:false,largeChartUrl:"",displayMode:"regular",width:"100%",height:490,locale:"pt_BR"}}/>;
}

function TVScreener() {
  return <TVWidget type="screener" config={{width:"100%",height:490,defaultColumn:"overview",defaultScreen:"most_capitalized",market:"brazil",showToolbar:true,colorTheme:"light",locale:"pt_BR"}}/>;
}

// ---- WATCHLIST CHART MODAL ----
function ChartModal({ ticker, onClose }) {
  const containerId = "tv_chart_" + ticker.replace(/[^a-z0-9]/gi,"_");
  const symbol = /^[A-Z]{1,5}$/.test(ticker) ? ticker : "BMFBOVESPA:" + ticker;

  useEffect(() => {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => {
      if (window.TradingView) {
        new window.TradingView.widget({
          container_id: containerId,
          symbol,
          interval: "D",
          locale: "pt_BR",
          theme: "light",
          style: "1",
          width: "100%",
          height: 440,
          toolbar_bg: "#f1f3f6",
          allow_symbol_change: true,
          hide_side_toolbar: false,
          save_image: false,
        });
      }
    };
    el.appendChild(script);
    return () => { el.innerHTML = ""; };
  }, [ticker]);

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"var(--color-background-primary)",borderRadius:14,padding:"1rem",width:"min(95vw,700px)",boxSizing:"border-box"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <span style={{fontSize:15,fontWeight:500,color:"var(--color-text-primary)"}}>{ticker}</span>
          <button onClick={onClose} style={{border:"none",background:"none",cursor:"pointer",fontSize:20,color:"var(--color-text-tertiary)"}}>✕</button>
        </div>
        <div id={containerId} style={{borderRadius:8,overflow:"hidden",minHeight:440,background:"var(--color-background-secondary)",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <span style={{fontSize:13,color:"var(--color-text-tertiary)"}}>Carregando gráfico...</span>
        </div>
        <p style={{fontSize:11,color:"var(--color-text-tertiary)",marginTop:6,textAlign:"center"}}>Gráfico fornecido pelo TradingView</p>
      </div>
    </div>
  );
}

// ---- ANÁLISE ----
function AnaliseTab({ investimentos }) {
  const [tickerInput, setTickerInput] = useState("");
  const [ativos, setAtivos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [watchlist, setWatchlist] = useState([]);
  const [watchInput, setWatchInput] = useState("");
  const [chartTicker, setChartTicker] = useState(null);
  const [watchLoading, setWatchLoading] = useState(false);
  const watchLoaded = useRef(false);

  useEffect(() => {
    (async () => {
      try { const r = await store.get("watchlist"); if (r) setWatchlist(JSON.parse(r.value)); } catch {}
      watchLoaded.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!watchLoaded.current) return;
    store.set("watchlist", JSON.stringify(watchlist)).catch(()=>{});
  }, [watchlist]);

  async function addToWatchlist() {
    const t = watchInput.trim().toUpperCase();
    if (!t || watchlist.find(w => w.ticker === t)) { setWatchInput(""); return; }
    setWatchLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:600,
          messages:[{role:"user",content:`Retorne SOMENTE um objeto JSON para o ativo ${t}. Sem markdown. Campos: {"ticker":"${t}","nome":"Nome curto da empresa","setor":"setor","preco":número,"pl":número ou null,"dy":número percentual ou null,"roe":número percentual ou null}`}]
        })
      });
      const data = await res.json();
      const text = data.content.filter(b=>b.type==="text").map(b=>b.text).join("");
      const obj = JSON.parse(text.replace(/```json|```/g,"").trim());
      setWatchlist(prev => [...prev, obj]);
    } catch { setWatchlist(prev => [...prev, {ticker:t, nome:t, setor:"—", preco:null, pl:null, dy:null, roe:null}]); }
    setWatchInput(""); setWatchLoading(false);
  }
  const [compInput1, setCompInput1] = useState("");
  const [compInput2, setCompInput2] = useState("");
  const [comparando, setComparando] = useState(false);
  const [comparativo, setComparativo] = useState(null);
  const [calcForm, setCalcForm] = useState({preco_compra:"",preco_atual:"",quantidade:""});
  const [simForm, setSimForm] = useState({inicial:"",aporte:"",taxa:"",meses:""});
  const [simResultado, setSimResultado] = useState(null);
  const [calcResultado, setCalcResultado] = useState(null);
  const [alocSugest, setAlocSugest] = useState(null);
  const [alocLoading, setAlocLoading] = useState(false);

  async function buscarAtivo() {
    if (!tickerInput.trim()) return;
    setLoading(true); setErro("");
    const ticker = tickerInput.trim().toUpperCase();
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:1000,
          messages:[{role:"user",content:`Retorne SOMENTE um objeto JSON (sem markdown, sem texto extra) com os indicadores fundamentalistas mais recentes do ativo ${ticker} (bolsa brasileira B3 ou americana). Campos obrigatórios:
{
  "ticker": "${ticker}",
  "nome": "Nome da empresa",
  "preco": número,
  "pl": número ou null,
  "pvp": número ou null,
  "dy": número percentual ou null,
  "roe": número percentual ou null,
  "divida_ebitda": número ou null,
  "cagr_lucro": número percentual ou null,
  "setor": "string"
}
Use dados públicos mais recentes disponíveis. Se não souber um valor, use null.`}]
        })
      });
      const data = await res.json();
      const text = data.content.filter(b=>b.type==="text").map(b=>b.text).join("");
      const clean = text.replace(/```json|```/g,"").trim();
      const obj = JSON.parse(clean);
      setAtivos(prev => {
        const exists = prev.find(a=>a.ticker===obj.ticker);
        return exists ? prev.map(a=>a.ticker===obj.ticker?obj:a) : [...prev, obj];
      });
      setTickerInput("");
    } catch(e) { setErro("Não foi possível obter dados para " + ticker + ". Tente novamente."); }
    setLoading(false);
  }

  async function compararAtivos() {
    if (!compInput1.trim() || !compInput2.trim()) return;
    setComparando(true); setErro("");
    const t1 = compInput1.trim().toUpperCase();
    const t2 = compInput2.trim().toUpperCase();
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:1200,
          messages:[{role:"user",content:`Retorne SOMENTE um array JSON com dois objetos, um para cada ativo (${t1} e ${t2}). Sem markdown, sem texto extra. Cada objeto:
{"ticker":"","nome":"","preco":0,"pl":0,"pvp":0,"dy":0,"roe":0,"divida_ebitda":0,"cagr_lucro":0,"setor":""}
Use dados públicos mais recentes. Se não souber, use null.`}]
        })
      });
      const data = await res.json();
      const text = data.content.filter(b=>b.type==="text").map(b=>b.text).join("");
      const clean = text.replace(/```json|```/g,"").trim();
      const arr = JSON.parse(clean);
      setComparativo(arr);
    } catch(e) { setErro("Erro ao comparar ativos. Tente novamente."); }
    setComparando(false);
  }

  function calcRentabilidade() {
    const pc = parseFloat(calcForm.preco_compra);
    const pa = parseFloat(calcForm.preco_atual);
    const qt = parseFloat(calcForm.quantidade);
    if (!pc||!pa||!qt) return;
    const investido = pc * qt;
    const atual = pa * qt;
    const lucro = atual - investido;
    const rentPct = ((pa - pc) / pc) * 100;
    setCalcResultado({ investido, atual, lucro, rentPct });
  }

  function simularJuros() {
    const ini = parseFloat(simForm.inicial)||0;
    const ap = parseFloat(simForm.aporte)||0;
    const taxa = parseFloat(simForm.taxa)||0;
    const meses = parseInt(simForm.meses)||0;
    if (meses <= 0) return;
    const taxaMensal = taxa / 100;
    let saldo = ini;
    const pontos = [];
    for (let i = 0; i <= meses; i++) {
      if (i > 0) saldo = saldo * (1 + taxaMensal) + ap;
      if (i % Math.max(1, Math.floor(meses/12)) === 0 || i === meses)
        pontos.push({ mes: i, saldo: Math.round(saldo) });
    }
    const totalAportado = ini + ap * meses;
    const jurosGanhos = saldo - totalAportado;
    setSimResultado({ saldo: Math.round(saldo), totalAportado: Math.round(totalAportado), jurosGanhos: Math.round(jurosGanhos), pontos });
  }

  async function sugerirAlocacao() {
    if (investimentos.length === 0) { setErro("Adicione investimentos na aba Investimentos primeiro."); return; }
    setAlocLoading(true); setErro("");
    const resumo = investimentos.map(i => `${i.tipo}: R$${i.valor}`).join(", ");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:800,
          messages:[{role:"user",content:`Minha carteira atual: ${resumo}. Retorne SOMENTE um JSON sem markdown assim:
{"analise":"texto curto de 2 frases sobre a carteira atual","sugestao":[{"tipo":"Renda Fixa","pct_atual":0,"pct_ideal":0,"acao":"texto curto"}]}`}]
        })
      });
      const data = await res.json();
      const text = data.content.filter(b=>b.type==="text").map(b=>b.text).join("");
      const clean = text.replace(/```json|```/g,"").trim();
      setAlocSugest(JSON.parse(clean));
    } catch(e) { setErro("Erro ao gerar sugestão. Tente novamente."); }
    setAlocLoading(false);
  }



  return (
    <div style={{display:"flex",flexDirection:"column",gap:"1.25rem"}}>

      {chartTicker && <ChartModal ticker={chartTicker} onClose={()=>setChartTicker(null)}/>}

      {/* Watchlist */}
      <Card>
        <p style={{fontSize:14,fontWeight:500,margin:"0 0 4px",color:"var(--color-text-primary)"}}>Carteira de acompanhamento</p>
        <p style={{fontSize:12,color:"var(--color-text-tertiary)",margin:"0 0 10px"}}>Clique em um ativo para ver o gráfico</p>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <input value={watchInput} onChange={e=>setWatchInput(e.target.value.toUpperCase())}
            onKeyDown={e=>e.key==="Enter"&&addToWatchlist()}
            placeholder="Ex: PETR4, VALE3, AAPL..."
            style={{flex:1,fontSize:13,padding:"7px 10px"}}/>
          <button onClick={addToWatchlist} disabled={watchLoading} style={{
            padding:"7px 16px",borderRadius:8,background:COLORS.investimento,color:"#fff",
            border:"none",cursor:"pointer",fontSize:13,fontWeight:500,opacity:watchLoading?0.6:1
          }}>{watchLoading?"...":"+ Adicionar"}</button>
        </div>
        {watchlist.length===0 && <p style={{fontSize:13,color:"var(--color-text-tertiary)"}}>Nenhum ativo adicionado ainda.</p>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:8}}>
          {watchlist.map(w=>(
            <div key={w.ticker} onClick={()=>setChartTicker(w.ticker)} style={{
              background:"var(--color-background-secondary)",borderRadius:10,padding:"10px 12px",
              cursor:"pointer",border:"0.5px solid var(--color-border-tertiary)",
              transition:"border-color .15s",position:"relative"
            }}
            onMouseEnter={e=>e.currentTarget.style.borderColor="var(--color-border-primary)"}
            onMouseLeave={e=>e.currentTarget.style.borderColor="var(--color-border-tertiary)"}
            >
              <button onClick={e=>{e.stopPropagation();setWatchlist(prev=>prev.filter(x=>x.ticker!==w.ticker));}}
                style={{position:"absolute",top:6,right:6,border:"none",background:"none",cursor:"pointer",fontSize:12,color:"var(--color-text-tertiary)",lineHeight:1}}>✕</button>
              <p style={{margin:"0 0 2px",fontSize:13,fontWeight:500,color:COLORS.investimento}}>{w.ticker}</p>
              <p style={{margin:"0 0 6px",fontSize:11,color:"var(--color-text-tertiary)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{w.nome}</p>
              <p style={{margin:"0 0 2px",fontSize:15,fontWeight:500,color:"var(--color-text-primary)"}}>{w.preco!=null?"R$ "+Number(w.preco).toFixed(2):"—"}</p>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
                {w.pl!=null&&<span style={{fontSize:10,background:"#E6F1FB",color:"#0C447C",borderRadius:4,padding:"2px 5px"}}>P/L {Number(w.pl).toFixed(1)}</span>}
                {w.dy!=null&&<span style={{fontSize:10,background:"#E1F5EE",color:"#085041",borderRadius:4,padding:"2px 5px"}}>DY {Number(w.dy).toFixed(1)}%</span>}
              </div>
              <p style={{margin:"6px 0 0",fontSize:10,color:"var(--color-text-tertiary)"}}>Clique para ver gráfico</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Análise fundamentalista via TradingView */}
      <Card>
        <p style={{fontSize:14,fontWeight:500,margin:"0 0 4px",color:"var(--color-text-primary)"}}>Indicadores fundamentalistas</p>
        <p style={{fontSize:12,color:"var(--color-text-tertiary)",margin:"0 0 10px"}}>Dados reais do TradingView — troque o ticker no widget</p>
        <TVFundamentals />
      </Card>

      {/* Screener */}
      <Card>
        <p style={{fontSize:14,fontWeight:500,margin:"0 0 4px",color:"var(--color-text-primary)"}}>Screener de ações</p>
        <p style={{fontSize:12,color:"var(--color-text-tertiary)",margin:"0 0 10px"}}>Filtre e compare ativos por P/L, DY, ROE e mais</p>
        <TVScreener />
      </Card>

      {/* Calculadora de rentabilidade */}
      <Card>
        <p style={{fontSize:14,fontWeight:500,margin:"0 0 10px",color:"var(--color-text-primary)"}}>Calcular rentabilidade de aporte</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8,marginBottom:10}}>
          <label style={{fontSize:12,color:"var(--color-text-secondary)"}}>Preço de compra (R$)
            <input type="number" value={calcForm.preco_compra} onChange={e=>setCalcForm(f=>({...f,preco_compra:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,fontSize:13,padding:"6px 8px",boxSizing:"border-box"}} />
          </label>
          <label style={{fontSize:12,color:"var(--color-text-secondary)"}}>Preço atual (R$)
            <input type="number" value={calcForm.preco_atual} onChange={e=>setCalcForm(f=>({...f,preco_atual:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,fontSize:13,padding:"6px 8px",boxSizing:"border-box"}} />
          </label>
          <label style={{fontSize:12,color:"var(--color-text-secondary)"}}>Quantidade
            <input type="number" value={calcForm.quantidade} onChange={e=>setCalcForm(f=>({...f,quantidade:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,fontSize:13,padding:"6px 8px",boxSizing:"border-box"}} />
          </label>
        </div>
        <button onClick={calcRentabilidade} style={{padding:"7px 16px",borderRadius:8,background:COLORS.receita,color:"#fff",border:"none",cursor:"pointer",fontSize:13,fontWeight:500}}>Calcular</button>
        {calcResultado && (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,marginTop:12}}>
            <MetricCard label="Investido" value={fmt(calcResultado.investido)} />
            <MetricCard label="Valor atual" value={fmt(calcResultado.atual)} />
            <MetricCard label="Lucro / Prejuízo" value={fmt(calcResultado.lucro)} color={calcResultado.lucro>=0?COLORS.receita:COLORS.despesa} />
            <MetricCard label="Rentabilidade" value={calcResultado.rentPct.toFixed(2)+"%"} color={calcResultado.rentPct>=0?COLORS.receita:COLORS.despesa} />
          </div>
        )}
      </Card>

      {/* Simulador de juros compostos */}
      <Card>
        <p style={{fontSize:14,fontWeight:500,margin:"0 0 10px",color:"var(--color-text-primary)"}}>Simular juros compostos</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,marginBottom:10}}>
          <label style={{fontSize:12,color:"var(--color-text-secondary)"}}>Valor inicial (R$)
            <input type="number" value={simForm.inicial} onChange={e=>setSimForm(f=>({...f,inicial:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,fontSize:13,padding:"6px 8px",boxSizing:"border-box"}} />
          </label>
          <label style={{fontSize:12,color:"var(--color-text-secondary)"}}>Aporte mensal (R$)
            <input type="number" value={simForm.aporte} onChange={e=>setSimForm(f=>({...f,aporte:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,fontSize:13,padding:"6px 8px",boxSizing:"border-box"}} />
          </label>
          <label style={{fontSize:12,color:"var(--color-text-secondary)"}}>Taxa mensal (%)
            <input type="number" value={simForm.taxa} onChange={e=>setSimForm(f=>({...f,taxa:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,fontSize:13,padding:"6px 8px",boxSizing:"border-box"}} />
          </label>
          <label style={{fontSize:12,color:"var(--color-text-secondary)"}}>Período (meses)
            <input type="number" value={simForm.meses} onChange={e=>setSimForm(f=>({...f,meses:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,fontSize:13,padding:"6px 8px",boxSizing:"border-box"}} />
          </label>
        </div>
        <button onClick={simularJuros} style={{padding:"7px 16px",borderRadius:8,background:COLORS.meta,color:"#fff",border:"none",cursor:"pointer",fontSize:13,fontWeight:500}}>Simular</button>
        {simResultado && (
          <div style={{marginTop:12}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,marginBottom:12}}>
              <MetricCard label="Patrimônio final" value={fmt(simResultado.saldo)} color={COLORS.receita} />
              <MetricCard label="Total aportado" value={fmt(simResultado.totalAportado)} />
              <MetricCard label="Juros ganhos" value={fmt(simResultado.jurosGanhos)} color={COLORS.investimento} />
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {simResultado.pontos.map((p,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}>
                  <span style={{minWidth:60,color:"var(--color-text-tertiary)"}}>Mês {p.mes}</span>
                  <div style={{flex:1,background:"#eee",borderRadius:4,height:8}}>
                    <div style={{width:Math.round(p.saldo/simResultado.saldo*100)+"%",background:COLORS.investimento,borderRadius:4,height:8,transition:"width .3s"}}/>
                  </div>
                  <span style={{minWidth:90,textAlign:"right",fontWeight:500}}>{fmt(p.saldo)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Alocação ideal */}
      <Card>
        <p style={{fontSize:14,fontWeight:500,margin:"0 0 4px",color:"var(--color-text-primary)"}}>Sugestão de alocação ideal</p>
        <p style={{fontSize:12,color:"var(--color-text-tertiary)",margin:"0 0 10px"}}>Baseado nos seus investimentos cadastrados</p>
        <button onClick={sugerirAlocacao} disabled={alocLoading} style={{
          padding:"7px 16px",borderRadius:8,background:COLORS.cartao,color:"#fff",
          border:"none",cursor:"pointer",fontSize:13,fontWeight:500,opacity:alocLoading?0.6:1
        }}>{alocLoading?"Analisando...":"Analisar carteira"}</button>
        {alocSugest && (
          <div style={{marginTop:12}}>
            <p style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:12}}>{alocSugest.analise}</p>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {alocSugest.sugestao.map((s,i)=>(
                <div key={i} style={{background:"var(--color-background-secondary)",borderRadius:8,padding:"10px 12px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
                    <span style={{fontWeight:500}}>{s.tipo}</span>
                    <span style={{color:"var(--color-text-secondary)"}}>{s.pct_atual}% → <strong style={{color:COLORS.investimento}}>{s.pct_ideal}%</strong></span>
                  </div>
                  <p style={{margin:0,fontSize:12,color:"var(--color-text-tertiary)"}}>{s.acao}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState(0);
  const [data, setData] = useState(INITIAL);
  const [mesFiltro, setMesFiltro] = useState(mesAtual);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const loaded = useRef(false);

  useEffect(() => {
    (async () => {
      try { const r = await store.get("financas_data"); if (r) setData(JSON.parse(r.value)); } catch {}
      loaded.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    store.set("financas_data", JSON.stringify(data)).catch(()=>{});
  }, [data]);

  const transacoesMes = data.transacoes.filter(t => { const d=new Date(t.data); return d.getMonth()===mesFiltro&&d.getFullYear()===anoAtual; });
  const totalReceitas = transacoesMes.filter(t=>t.tipo==="receita").reduce((a,b)=>a+b.valor,0);
  const totalDespesas = transacoesMes.filter(t=>t.tipo==="despesa").reduce((a,b)=>a+b.valor,0);
  const saldo = totalReceitas - totalDespesas;
  const faturasMes = data.faturas.filter(f=>f.mes===mesFiltro);
  const totalFaturas = faturasMes.reduce((a,b)=>a+b.valor,0);
  const totalInvest = data.investimentos.reduce((a,b)=>a+b.valor,0);

  function openModal(tipo, item=null) { setModal(tipo); setForm(item?{...item,editId:item.id}:{}); }
  function closeModal() { setModal(null); setForm({}); }

  function saveTransacao() {
    const t={id:form.editId||Date.now(),tipo:form.tipo||"despesa",descricao:form.descricao||"Sem descrição",valor:parseFloat(form.valor)||0,categoria:form.categoria||"Outros",data:form.data||new Date().toISOString().slice(0,10)};
    setData(d=>({...d,transacoes:form.editId?d.transacoes.map(x=>x.id===form.editId?t:x):[...d.transacoes,t]}));
    closeModal();
  }
  function saveFatura() {
    const f={id:form.editId||Date.now(),cartao:form.cartao||"Outro",valor:parseFloat(form.valor)||0,vencimento:form.vencimento||"",mes:mesFiltro};
    setData(d=>({...d,faturas:form.editId?d.faturas.map(x=>x.id===form.editId?f:x):[...d.faturas,f]}));
    closeModal();
  }
  function saveInvestimento() {
    const inv={id:form.editId||Date.now(),tipo:form.tipo||"Renda Fixa",descricao:form.descricao||"",valor:parseFloat(form.valor)||0,data:form.data||new Date().toISOString().slice(0,10)};
    setData(d=>({...d,investimentos:form.editId?d.investimentos.map(x=>x.id===form.editId?inv:x):[...d.investimentos,inv]}));
    closeModal();
  }
  function saveMeta() {
    const m={id:form.editId||Date.now(),nome:form.nome||"Meta",objetivo:parseFloat(form.objetivo)||0,atual:parseFloat(form.atual)||0,cor:form.cor||COLORS.meta};
    setData(d=>({...d,metas:form.editId?d.metas.map(x=>x.id===form.editId?m:x):[...d.metas,m]}));
    closeModal();
  }
  function del(col,id) { setData(d=>({...d,[col]:d[col].filter(x=>x.id!==id)})); }
  function atualizarMeta(id,novoAtual) { setData(d=>({...d,metas:d.metas.map(m=>m.id===id?{...m,atual:parseFloat(novoAtual)||0}:m)})); }

  const catDespesas = CATEGORIAS_DESPESA.map(cat=>({cat,total:transacoesMes.filter(t=>t.tipo==="despesa"&&t.categoria===cat).reduce((a,b)=>a+b.valor,0)})).filter(x=>x.total>0);
  const catReceitas = CATEGORIAS_RECEITA.map(cat=>({cat,total:transacoesMes.filter(t=>t.tipo==="receita"&&t.categoria===cat).reduce((a,b)=>a+b.valor,0)})).filter(x=>x.total>0);
  const tiposInvest = TIPOS_INVESTIMENTO.map(tipo=>({tipo,total:data.investimentos.filter(i=>i.tipo===tipo).reduce((a,b)=>a+b.valor,0)})).filter(x=>x.total>0);

  return (
    <div style={{fontFamily:"var(--font-sans)",maxWidth:700,margin:"0 auto",padding:"0.5rem 0 2rem"}}>
      <h2 style={{fontSize:20,fontWeight:500,margin:"0.5rem 0 1rem",color:"var(--color-text-primary)"}}>Controle Financeiro</h2>

      <div style={{display:"flex",gap:4,marginBottom:"1.25rem",flexWrap:"wrap"}}>
        {TABS.map((t,i)=>(
          <button key={t} onClick={()=>setTab(i)} style={{
            padding:"6px 14px",borderRadius:20,fontSize:13,cursor:"pointer",
            border:tab===i?"none":"0.5px solid var(--color-border-secondary)",
            background:tab===i?COLORS.receita:"transparent",
            color:tab===i?"#fff":"var(--color-text-secondary)",
            fontWeight:tab===i?500:400,
          }}>{t}</button>
        ))}
      </div>

      {(tab===0||tab===1||tab===2)&&(
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:"1rem"}}>
          <span style={{fontSize:13,color:"var(--color-text-secondary)"}}>Mês:</span>
          <select value={mesFiltro} onChange={e=>setMesFiltro(+e.target.value)} style={{fontSize:13,padding:"4px 8px"}}>
            {MESES.map((m,i)=><option key={m} value={i}>{m} {anoAtual}</option>)}
          </select>
        </div>
      )}

      {/* DASHBOARD */}
      {tab===0&&(
        <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10}}>
            <MetricCard label="Receitas" value={fmt(totalReceitas)} color={COLORS.receita}/>
            <MetricCard label="Despesas" value={fmt(totalDespesas)} color={COLORS.despesa}/>
            <MetricCard label="Saldo" value={fmt(saldo)} color={saldo>=0?COLORS.receita:COLORS.despesa}/>
            <MetricCard label="Investimentos" value={fmt(totalInvest)} color={COLORS.investimento}/>
          </div>
          <Card>
            <p style={{fontSize:13,fontWeight:500,marginBottom:10,color:"var(--color-text-primary)"}}>Despesas por categoria</p>
            {catDespesas.length===0&&<p style={{fontSize:13,color:"var(--color-text-tertiary)"}}>Nenhuma despesa neste mês.</p>}
            {catDespesas.map((c,i)=>(
              <div key={c.cat} style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                  <span style={{color:"var(--color-text-secondary)"}}>{c.cat}</span>
                  <span style={{fontWeight:500}}>{fmt(c.total)}</span>
                </div>
                <MiniBar valor={c.total} total={totalDespesas} cor={[COLORS.despesa,"#7F77DD","#378ADD","#1D9E75","#BA7517","#D85A30","#888780"][i%7]}/>
              </div>
            ))}
          </Card>
          <Card>
            <p style={{fontSize:13,fontWeight:500,marginBottom:10,color:"var(--color-text-primary)"}}>Receitas por categoria</p>
            {catReceitas.length===0&&<p style={{fontSize:13,color:"var(--color-text-tertiary)"}}>Nenhuma receita neste mês.</p>}
            {catReceitas.map((c,i)=>(
              <div key={c.cat} style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                  <span style={{color:"var(--color-text-secondary)"}}>{c.cat}</span>
                  <span style={{fontWeight:500}}>{fmt(c.total)}</span>
                </div>
                <MiniBar valor={c.total} total={totalReceitas} cor={[COLORS.receita,"#378ADD","#7F77DD","#BA7517"][i%4]}/>
              </div>
            ))}
          </Card>
          {tiposInvest.length>0&&(
            <Card>
              <p style={{fontSize:13,fontWeight:500,marginBottom:10,color:"var(--color-text-primary)"}}>Carteira de investimentos</p>
              {tiposInvest.map((t,i)=>(
                <div key={t.tipo} style={{marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                    <span style={{color:"var(--color-text-secondary)"}}>{t.tipo}</span>
                    <span style={{fontWeight:500}}>{fmt(t.total)} ({totalInvest>0?Math.round(t.total/totalInvest*100):0}%)</span>
                  </div>
                  <MiniBar valor={t.total} total={totalInvest} cor={INVEST_CORES[i%INVEST_CORES.length]}/>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* RECEITAS & DESPESAS */}
      {tab===1&&(
        <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
          <button onClick={()=>openModal("transacao")} style={{padding:"8px 16px",borderRadius:8,background:COLORS.receita,color:"#fff",border:"none",cursor:"pointer",fontSize:13,fontWeight:500,alignSelf:"flex-start"}}>+ Nova transação</button>
          {transacoesMes.length===0&&<p style={{fontSize:13,color:"var(--color-text-tertiary)"}}>Nenhuma transação neste mês.</p>}
          {transacoesMes.sort((a,b)=>b.data.localeCompare(a.data)).map(t=>(
            <Card key={t.id} style={{display:"flex",alignItems:"center",gap:12,padding:"0.75rem 1rem"}}>
              <div style={{width:36,height:36,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",background:t.tipo==="receita"?"#E1F5EE":"#FAECE7",fontSize:18}}>{t.tipo==="receita"?"↑":"↓"}</div>
              <div style={{flex:1}}>
                <p style={{margin:0,fontSize:14,fontWeight:500,color:"var(--color-text-primary)"}}>{t.descricao}</p>
                <p style={{margin:0,fontSize:12,color:"var(--color-text-tertiary)"}}>{t.categoria} · {t.data}</p>
              </div>
              <span style={{fontWeight:500,color:t.tipo==="receita"?COLORS.receita:COLORS.despesa,fontSize:15}}>{t.tipo==="receita"?"+":"-"}{fmt(t.valor)}</span>
              <div style={{display:"flex",gap:4}}>
                <button onClick={()=>openModal("transacao",t)} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>✏️</button>
                <button onClick={()=>del("transacoes",t.id)} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>🗑</button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* CARTÃO */}
      {tab===2&&(
        <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
          <button onClick={()=>openModal("fatura")} style={{padding:"8px 16px",borderRadius:8,background:COLORS.cartao,color:"#fff",border:"none",cursor:"pointer",fontSize:13,fontWeight:500,alignSelf:"flex-start"}}>+ Nova fatura</button>
          {faturasMes.length===0&&<p style={{fontSize:13,color:"var(--color-text-tertiary)"}}>Nenhuma fatura neste mês.</p>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10}}>
            {faturasMes.map(f=>(
              <Card key={f.id}>
                <p style={{margin:"0 0 4px",fontSize:13,fontWeight:500,color:COLORS.cartao}}>{f.cartao}</p>
                <p style={{margin:"0 0 2px",fontSize:20,fontWeight:500}}>{fmt(f.valor)}</p>
                {f.vencimento&&<p style={{margin:0,fontSize:11,color:"var(--color-text-tertiary)"}}>Vence: {f.vencimento}</p>}
                <div style={{display:"flex",gap:4,marginTop:8}}>
                  <button onClick={()=>openModal("fatura",f)} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>✏️</button>
                  <button onClick={()=>del("faturas",f.id)} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>🗑</button>
                </div>
              </Card>
            ))}
          </div>
          {faturasMes.length>0&&<div style={{background:"var(--color-background-secondary)",borderRadius:8,padding:"0.75rem 1rem",fontSize:14}}><span style={{color:"var(--color-text-secondary)"}}>Total de faturas: </span><strong>{fmt(totalFaturas)}</strong></div>}
        </div>
      )}

      {/* INVESTIMENTOS */}
      {tab===3&&(
        <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <button onClick={()=>openModal("investimento")} style={{padding:"8px 16px",borderRadius:8,background:COLORS.investimento,color:"#fff",border:"none",cursor:"pointer",fontSize:13,fontWeight:500}}>+ Novo aporte</button>
            <span style={{fontSize:13,color:"var(--color-text-secondary)"}}>Total: <strong>{fmt(totalInvest)}</strong></span>
          </div>
          {tiposInvest.length>0&&(
            <Card>
              <p style={{fontSize:13,fontWeight:500,marginBottom:10,color:"var(--color-text-primary)"}}>Por tipo</p>
              {tiposInvest.map((t,i)=>(
                <div key={t.tipo} style={{marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                    <span style={{color:"var(--color-text-secondary)"}}>{t.tipo}</span>
                    <span style={{fontWeight:500}}>{fmt(t.total)} ({totalInvest>0?Math.round(t.total/totalInvest*100):0}%)</span>
                  </div>
                  <MiniBar valor={t.total} total={totalInvest} cor={INVEST_CORES[i%INVEST_CORES.length]}/>
                </div>
              ))}
            </Card>
          )}
          {data.investimentos.length===0&&<p style={{fontSize:13,color:"var(--color-text-tertiary)"}}>Nenhum aporte registrado.</p>}
          {data.investimentos.sort((a,b)=>b.data.localeCompare(a.data)).map(inv=>(
            <Card key={inv.id} style={{display:"flex",alignItems:"center",gap:12,padding:"0.75rem 1rem"}}>
              <div style={{width:36,height:36,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",background:"#E6F1FB",fontSize:18}}>📈</div>
              <div style={{flex:1}}>
                <p style={{margin:0,fontSize:14,fontWeight:500,color:"var(--color-text-primary)"}}>{inv.descricao||inv.tipo}</p>
                <p style={{margin:0,fontSize:12,color:"var(--color-text-tertiary)"}}>{inv.tipo} · {inv.data}</p>
              </div>
              <span style={{fontWeight:500,color:COLORS.investimento,fontSize:15}}>{fmt(inv.valor)}</span>
              <div style={{display:"flex",gap:4}}>
                <button onClick={()=>openModal("investimento",inv)} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>✏️</button>
                <button onClick={()=>del("investimentos",inv.id)} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>🗑</button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* METAS */}
      {tab===4&&(
        <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
          <button onClick={()=>openModal("meta")} style={{padding:"8px 16px",borderRadius:8,background:COLORS.meta,color:"#fff",border:"none",cursor:"pointer",fontSize:13,fontWeight:500,alignSelf:"flex-start"}}>+ Nova meta</button>
          {data.metas.length===0&&<p style={{fontSize:13,color:"var(--color-text-tertiary)"}}>Nenhuma meta criada.</p>}
          {data.metas.map(m=>{
            const p=m.objetivo>0?Math.min(100,Math.round(m.atual/m.objetivo*100)):0;
            return (
              <Card key={m.id}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:15,fontWeight:500}}>🎯 {m.nome}</span>
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>openModal("meta",m)} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>✏️</button>
                    <button onClick={()=>del("metas",m.id)} style={{border:"none",background:"none",cursor:"pointer",fontSize:14}}>🗑</button>
                  </div>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:6}}>
                  <span style={{color:"var(--color-text-secondary)"}}>Progresso: {p}%</span>
                  <span>{fmt(m.atual)} / {fmt(m.objetivo)}</span>
                </div>
                <div style={{background:"#eee",borderRadius:6,height:10}}>
                  <div style={{width:p+"%",background:m.cor||COLORS.meta,borderRadius:6,height:10,transition:"width .4s"}}/>
                </div>
                <div style={{marginTop:10,display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{fontSize:12,color:"var(--color-text-tertiary)"}}>Atualizar valor atual:</span>
                  <input type="number" defaultValue={m.atual} onBlur={e=>atualizarMeta(m.id,e.target.value)} style={{width:100,fontSize:13,padding:"4px 8px"}}/>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ANÁLISE */}
      {tab===5&&<AnaliseTab investimentos={data.investimentos}/>}

      {/* MODAIS */}
      {modal&&(
        <div onClick={closeModal} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--color-background-primary)",borderRadius:14,padding:"1.5rem",width:340,boxSizing:"border-box",display:"flex",flexDirection:"column",gap:12}}>
            <h3 style={{margin:0,fontSize:16,fontWeight:500}}>
              {modal==="transacao"?(form.editId?"Editar transação":"Nova transação"):modal==="fatura"?(form.editId?"Editar fatura":"Nova fatura"):modal==="investimento"?(form.editId?"Editar aporte":"Novo aporte"):(form.editId?"Editar meta":"Nova meta")}
            </h3>
            {modal==="transacao"&&<>
              <label style={{fontSize:13}}>Tipo<select value={form.tipo||"despesa"} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} style={{display:"block",width:"100%",marginTop:4}}><option value="despesa">Despesa</option><option value="receita">Receita</option></select></label>
              <label style={{fontSize:13}}>Descrição<input value={form.descricao||""} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,boxSizing:"border-box"}}/></label>
              <label style={{fontSize:13}}>Valor (R$)<input type="number" value={form.valor||""} onChange={e=>setForm(f=>({...f,valor:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,boxSizing:"border-box"}}/></label>
              <label style={{fontSize:13}}>Categoria<select value={form.categoria||""} onChange={e=>setForm(f=>({...f,categoria:e.target.value}))} style={{display:"block",width:"100%",marginTop:4}}>{(form.tipo==="receita"?CATEGORIAS_RECEITA:CATEGORIAS_DESPESA).map(c=><option key={c}>{c}</option>)}</select></label>
              <label style={{fontSize:13}}>Data<input type="date" value={form.data||new Date().toISOString().slice(0,10)} onChange={e=>setForm(f=>({...f,data:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,boxSizing:"border-box"}}/></label>
            </>}
            {modal==="fatura"&&<>
              <label style={{fontSize:13}}>Cartão<select value={form.cartao||""} onChange={e=>setForm(f=>({...f,cartao:e.target.value}))} style={{display:"block",width:"100%",marginTop:4}}>{CARTOES.map(c=><option key={c}>{c}</option>)}</select></label>
              <label style={{fontSize:13}}>Valor (R$)<input type="number" value={form.valor||""} onChange={e=>setForm(f=>({...f,valor:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,boxSizing:"border-box"}}/></label>
              <label style={{fontSize:13}}>Vencimento<input type="date" value={form.vencimento||""} onChange={e=>setForm(f=>({...f,vencimento:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,boxSizing:"border-box"}}/></label>
            </>}
            {modal==="investimento"&&<>
              <label style={{fontSize:13}}>Tipo<select value={form.tipo||""} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} style={{display:"block",width:"100%",marginTop:4}}>{TIPOS_INVESTIMENTO.map(t=><option key={t}>{t}</option>)}</select></label>
              <label style={{fontSize:13}}>Descrição<input value={form.descricao||""} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,boxSizing:"border-box"}}/></label>
              <label style={{fontSize:13}}>Valor (R$)<input type="number" value={form.valor||""} onChange={e=>setForm(f=>({...f,valor:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,boxSizing:"border-box"}}/></label>
              <label style={{fontSize:13}}>Data<input type="date" value={form.data||new Date().toISOString().slice(0,10)} onChange={e=>setForm(f=>({...f,data:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,boxSizing:"border-box"}}/></label>
            </>}
            {modal==="meta"&&<>
              <label style={{fontSize:13}}>Nome<input value={form.nome||""} onChange={e=>setForm(f=>({...f,nome:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,boxSizing:"border-box"}}/></label>
              <label style={{fontSize:13}}>Objetivo (R$)<input type="number" value={form.objetivo||""} onChange={e=>setForm(f=>({...f,objetivo:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,boxSizing:"border-box"}}/></label>
              <label style={{fontSize:13}}>Valor atual (R$)<input type="number" value={form.atual||""} onChange={e=>setForm(f=>({...f,atual:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,boxSizing:"border-box"}}/></label>
            </>}
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:4}}>
              <button onClick={closeModal} style={{padding:"8px 16px",borderRadius:8,border:"0.5px solid var(--color-border-secondary)",background:"transparent",cursor:"pointer",fontSize:13}}>Cancelar</button>
              <button onClick={modal==="transacao"?saveTransacao:modal==="fatura"?saveFatura:modal==="investimento"?saveInvestimento:saveMeta}
                style={{padding:"8px 16px",borderRadius:8,background:COLORS.receita,color:"#fff",border:"none",cursor:"pointer",fontSize:13,fontWeight:500}}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
