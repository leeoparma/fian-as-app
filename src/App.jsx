import { useState, useEffect, useRef, useCallback } from "react";

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
const TABS = ["Dashboard","Receitas & Despesas","Cartão","Investimentos","Metas","NFs para IR","Análise"];

function fmt(v) { return "R$ " + Number(v).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}); }

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

// ---- BRAPI cotações ----
async function fetchCotacao(ticker) {
  try {
    const t = ticker.includes(":") ? ticker.split(":")[1] : ticker;
    const res = await fetch(`https://brapi.dev/api/quote/${t}?range=1d&interval=1d&fundamental=false`);
    const data = await res.json();
    if (data?.results?.[0]) {
      const r = data.results[0];
      return {
        preco: r.regularMarketPrice,
        variacao: r.regularMarketChangePercent,
        nome: r.longName || r.shortName || t,
      };
    }
  } catch {}
  return null;
}

// ---- TradingView ----
function TVWidget({ type, config }) {
  const uid = useRef("tv_" + type + "_" + Math.random().toString(36).slice(2,7));
  useEffect(() => {
    const el = document.getElementById(uid.current);
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
  return <div id={uid.current} style={{minHeight: config.height||400,borderRadius:8,overflow:"hidden"}}><div style={{display:"flex",alignItems:"center",justifyContent:"center",height:200,fontSize:13,color:"var(--color-text-tertiary)"}}>Carregando...</div></div>;
}
function TVFundamentals() {
  return <TVWidget type="financials" config={{symbol:"BMFBOVESPA:PETR4",colorTheme:"light",isTransparent:false,largeChartUrl:"",displayMode:"regular",width:"100%",height:490,locale:"pt_BR"}}/>;
}
function TVScreener() {
  return <TVWidget type="screener" config={{width:"100%",height:490,defaultColumn:"overview",defaultScreen:"most_capitalized",market:"brazil",showToolbar:true,colorTheme:"light",locale:"pt_BR"}}/>;
}

function ChartModal({ ticker, onClose }) {
  const cid = "tv_chart_" + ticker.replace(/[^a-z0-9]/gi,"_");
  const sym = /^[A-Z]{1,5}$/.test(ticker) ? ticker : "BMFBOVESPA:"+ticker;
  useEffect(() => {
    const el = document.getElementById(cid);
    if (!el) return;
    el.innerHTML = "";
    const s = document.createElement("script");
    s.src = "https://s3.tradingview.com/tv.js"; s.async = true;
    s.onload = () => { if (window.TradingView) new window.TradingView.widget({container_id:cid,symbol:sym,interval:"D",locale:"pt_BR",theme:"light",style:"1",width:"100%",height:440,toolbar_bg:"#f1f3f6",allow_symbol_change:true,hide_side_toolbar:false,save_image:false}); };
    el.appendChild(s);
    return () => { el.innerHTML = ""; };
  }, [ticker]);
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"var(--color-background-primary)",borderRadius:14,padding:"1rem",width:"min(95vw,700px)",boxSizing:"border-box"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <span style={{fontSize:15,fontWeight:500}}>{ticker}</span>
          <button onClick={onClose} style={{border:"none",background:"none",cursor:"pointer",fontSize:20,color:"var(--color-text-tertiary)"}}>✕</button>
        </div>
        <div id={cid} style={{borderRadius:8,overflow:"hidden",minHeight:440,background:"var(--color-background-secondary)",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <span style={{fontSize:13,color:"var(--color-text-tertiary)"}}>Carregando gráfico...</span>
        </div>
        <p style={{fontSize:11,color:"var(--color-text-tertiary)",marginTop:6,textAlign:"center"}}>Gráfico fornecido pelo TradingView</p>
      </div>
    </div>
  );
}

// ---- NF VIEWER MODAL ----
function NFModal({ transacao, onClose }) {
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"var(--color-background-primary)",borderRadius:14,padding:"1.25rem",width:"min(95vw,560px)",boxSizing:"border-box"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div>
            <p style={{margin:0,fontSize:15,fontWeight:500,color:"var(--color-text-primary)"}}>{transacao.descricao}</p>
            <p style={{margin:"2px 0 0",fontSize:12,color:"var(--color-text-tertiary)"}}>{transacao.categoria} · {transacao.data} · {fmt(transacao.valor)}</p>
          </div>
          <button onClick={onClose} style={{border:"none",background:"none",cursor:"pointer",fontSize:20,color:"var(--color-text-tertiary)"}}>✕</button>
        </div>
        {transacao.nfImage ? (
          <img src={transacao.nfImage} alt="Nota Fiscal" style={{width:"100%",borderRadius:8,border:"0.5px solid var(--color-border-tertiary)"}}/>
        ) : (
          <div style={{height:200,display:"flex",alignItems:"center",justifyContent:"center",background:"var(--color-background-secondary)",borderRadius:8,color:"var(--color-text-tertiary)",fontSize:13}}>Nenhuma imagem anexada</div>
        )}
        {transacao.nfImage && (
          <a href={transacao.nfImage} download={`NF_${transacao.descricao}_${transacao.data}.jpg`} style={{display:"block",marginTop:10,textAlign:"center",fontSize:13,color:COLORS.investimento}}>⬇ Baixar imagem</a>
        )}
      </div>
    </div>
  );
}

// ---- ABA NFS PARA IR ----
function NFsTab({ transacoes }) {
  const [filtro, setFiltro] = useState("");
  const [viewNF, setViewNF] = useState(null);
  const comNF = transacoes.filter(t => t.nfImage);
  const filtradas = comNF.filter(t =>
    !filtro || t.descricao.toLowerCase().includes(filtro.toLowerCase()) ||
    t.categoria.toLowerCase().includes(filtro.toLowerCase())
  );
  const totalComNF = comNF.reduce((a,b)=>a+b.valor,0);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
      {viewNF && <NFModal transacao={viewNF} onClose={()=>setViewNF(null)}/>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10}}>
        <MetricCard label="Notas anexadas" value={comNF.length} color={COLORS.investimento}/>
        <MetricCard label="Total com NF" value={fmt(totalComNF)} color={COLORS.receita}/>
        <MetricCard label="Sem NF" value={transacoes.length - comNF.length} color="var(--color-text-tertiary)"/>
      </div>
      <Card>
        <p style={{fontSize:13,fontWeight:500,margin:"0 0 10px",color:"var(--color-text-primary)"}}>Todas as Notas Fiscais</p>
        <input value={filtro} onChange={e=>setFiltro(e.target.value)} placeholder="Buscar por descrição ou categoria..." style={{width:"100%",fontSize:13,padding:"7px 10px",boxSizing:"border-box",marginBottom:12}}/>
        {filtradas.length===0 && <p style={{fontSize:13,color:"var(--color-text-tertiary)"}}>Nenhuma nota fiscal encontrada. Anexe imagens nas transações.</p>}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filtradas.sort((a,b)=>b.data.localeCompare(a.data)).map(t=>(
            <div key={t.id} onClick={()=>setViewNF(t)} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",background:"var(--color-background-secondary)",borderRadius:10,cursor:"pointer",border:"0.5px solid var(--color-border-tertiary)",transition:"border-color .15s"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor="var(--color-border-primary)"}
              onMouseLeave={e=>e.currentTarget.style.borderColor="var(--color-border-tertiary)"}>
              <img src={t.nfImage} alt="NF" style={{width:48,height:48,objectFit:"cover",borderRadius:6,border:"0.5px solid var(--color-border-tertiary)"}}/>
              <div style={{flex:1}}>
                <p style={{margin:0,fontSize:14,fontWeight:500,color:"var(--color-text-primary)"}}>{t.descricao}</p>
                <p style={{margin:0,fontSize:12,color:"var(--color-text-tertiary)"}}>{t.categoria} · {t.data}</p>
              </div>
              <div style={{textAlign:"right"}}>
                <p style={{margin:0,fontSize:14,fontWeight:500,color:t.tipo==="receita"?COLORS.receita:COLORS.despesa}}>{t.tipo==="receita"?"+":"-"}{fmt(t.valor)}</p>
                <span style={{fontSize:11,color:COLORS.investimento}}>ver NF →</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ---- WATCHLIST COM COTAÇÕES REAIS ----
function WatchlistCard({ w, cotacoes, onChart, onRemove }) {
  const cot = cotacoes[w.ticker];
  const preco = cot?.preco ?? w.preco;
  const variacao = cot?.variacao;
  return (
    <div onClick={()=>onChart(w.ticker)} style={{background:"var(--color-background-secondary)",borderRadius:10,padding:"10px 12px",cursor:"pointer",border:"0.5px solid var(--color-border-tertiary)",transition:"border-color .15s",position:"relative"}}
      onMouseEnter={e=>e.currentTarget.style.borderColor="var(--color-border-primary)"}
      onMouseLeave={e=>e.currentTarget.style.borderColor="var(--color-border-tertiary)"}>
      <button onClick={e=>{e.stopPropagation();onRemove(w.ticker);}} style={{position:"absolute",top:6,right:6,border:"none",background:"none",cursor:"pointer",fontSize:12,color:"var(--color-text-tertiary)"}}>✕</button>
      <p style={{margin:"0 0 2px",fontSize:13,fontWeight:500,color:COLORS.investimento}}>{w.ticker}</p>
      <p style={{margin:"0 0 4px",fontSize:11,color:"var(--color-text-tertiary)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{cot?.nome||w.nome}</p>
      <p style={{margin:"0 0 2px",fontSize:16,fontWeight:500,color:"var(--color-text-primary)"}}>{preco!=null?"R$ "+Number(preco).toFixed(2):"—"}</p>
      {variacao!=null && (
        <span style={{fontSize:11,background:variacao>=0?"#E1F5EE":"#FAECE7",color:variacao>=0?COLORS.receita:COLORS.despesa,borderRadius:4,padding:"2px 6px",fontWeight:500}}>
          {variacao>=0?"▲":"▼"} {Math.abs(variacao).toFixed(2)}%
        </span>
      )}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>
        {w.pl!=null&&<span style={{fontSize:10,background:"#E6F1FB",color:"#0C447C",borderRadius:4,padding:"2px 5px"}}>P/L {Number(w.pl).toFixed(1)}</span>}
        {w.dy!=null&&<span style={{fontSize:10,background:"#E1F5EE",color:"#085041",borderRadius:4,padding:"2px 5px"}}>DY {Number(w.dy).toFixed(1)}%</span>}
      </div>
      {cot && <p style={{margin:"6px 0 0",fontSize:10,color:"var(--color-text-tertiary)"}}>Cotação via brapi.dev · clique p/ gráfico</p>}
    </div>
  );
}

// ---- ANÁLISE ----
function AnaliseTab({ investimentos }) {
  const [tickerInput, setTickerInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [watchlist, setWatchlist] = useState([]);
  const [cotacoes, setCotacoes] = useState({});
  const [watchInput, setWatchInput] = useState("");
  const [chartTicker, setChartTicker] = useState(null);
  const [watchLoading, setWatchLoading] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const watchLoaded = useRef(false);
  const intervalRef = useRef(null);

  const atualizarCotacoes = useCallback(async (lista) => {
    if (!lista || lista.length === 0) return;
    setAtualizando(true);
    const novas = {};
    await Promise.all(lista.map(async w => {
      const c = await fetchCotacao(w.ticker);
      if (c) novas[w.ticker] = c;
    }));
    setCotacoes(prev => ({...prev, ...novas}));
    setAtualizando(false);
  }, []);

  useEffect(() => {
    (async () => {
      try { const r = await window.storage.get("watchlist"); if (r) { const wl = JSON.parse(r.value); setWatchlist(wl); setTimeout(()=>atualizarCotacoes(wl), 500); } } catch {}
      watchLoaded.current = true;
    })();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (watchlist.length > 0) {
      intervalRef.current = setInterval(() => atualizarCotacoes(watchlist), 60000); // atualiza a cada 1 min
    }
  }, [watchlist]);

  useEffect(() => {
    if (!watchLoaded.current) return;
    window.storage.set("watchlist", JSON.stringify(watchlist)).catch(()=>{});
  }, [watchlist]);

  async function addToWatchlist() {
    const t = watchInput.trim().toUpperCase();
    if (!t || watchlist.find(w => w.ticker === t)) { setWatchInput(""); return; }
    setWatchLoading(true);
    const base = { ticker: t, nome: t, setor:"—", preco:null, pl:null, dy:null, roe:null };
    const cot = await fetchCotacao(t);
    if (cot) { base.nome = cot.nome; base.preco = cot.preco; setCotacoes(prev=>({...prev,[t]:cot})); }
    setWatchlist(prev => [...prev, base]);
    setWatchInput(""); setWatchLoading(false);
  }

  const [calcForm, setCalcForm] = useState({preco_compra:"",preco_atual:"",quantidade:""});
  const [simForm, setSimForm] = useState({inicial:"",aporte:"",taxa:"",meses:""});
  const [simResultado, setSimResultado] = useState(null);
  const [calcResultado, setCalcResultado] = useState(null);
  const [alocSugest, setAlocSugest] = useState(null);
  const [alocLoading, setAlocLoading] = useState(false);

  function calcRentabilidade() {
    const pc=parseFloat(calcForm.preco_compra),pa=parseFloat(calcForm.preco_atual),qt=parseFloat(calcForm.quantidade);
    if (!pc||!pa||!qt) return;
    setCalcResultado({ investido:pc*qt, atual:pa*qt, lucro:(pa-pc)*qt, rentPct:((pa-pc)/pc)*100 });
  }

  function simularJuros() {
    const ini=parseFloat(simForm.inicial)||0,ap=parseFloat(simForm.aporte)||0,taxa=parseFloat(simForm.taxa)||0,meses=parseInt(simForm.meses)||0;
    if (meses<=0) return;
    let saldo=ini; const pontos=[];
    for(let i=0;i<=meses;i++) { if(i>0) saldo=saldo*(1+taxa/100)+ap; if(i%Math.max(1,Math.floor(meses/12))===0||i===meses) pontos.push({mes:i,saldo:Math.round(saldo)}); }
    setSimResultado({ saldo:Math.round(saldo), totalAportado:Math.round(ini+ap*meses), jurosGanhos:Math.round(saldo-(ini+ap*meses)), pontos });
  }

  async function sugerirAlocacao() {
    if (investimentos.length===0) { setErro("Adicione investimentos primeiro."); return; }
    setAlocLoading(true); setErro("");
    const resumo = investimentos.map(i=>`${i.tipo}: R$${i.valor}`).join(", ");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:800,
          messages:[{role:"user",content:`Minha carteira: ${resumo}. Retorne SOMENTE JSON sem markdown: {"analise":"2 frases","sugestao":[{"tipo":"","pct_atual":0,"pct_ideal":0,"acao":""}]}`}]
        })
      });
      const data=await res.json();
      const text=data.content.filter(b=>b.type==="text").map(b=>b.text).join("");
      setAlocSugest(JSON.parse(text.replace(/```json|```/g,"").trim()));
    } catch { setErro("Erro ao gerar sugestão."); }
    setAlocLoading(false);
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:"1.25rem"}}>
      {chartTicker && <ChartModal ticker={chartTicker} onClose={()=>setChartTicker(null)}/>}

      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <p style={{fontSize:14,fontWeight:500,margin:0,color:"var(--color-text-primary)"}}>Carteira de acompanhamento</p>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {atualizando && <span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>Atualizando...</span>}
            <button onClick={()=>atualizarCotacoes(watchlist)} style={{fontSize:12,padding:"4px 10px",borderRadius:6,border:"0.5px solid var(--color-border-secondary)",background:"transparent",cursor:"pointer",color:"var(--color-text-secondary)"}}>↻ Atualizar</button>
          </div>
        </div>
        <p style={{fontSize:12,color:"var(--color-text-tertiary)",margin:"0 0 10px"}}>Cotações via brapi.dev · atualiza a cada 1 min</p>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <input value={watchInput} onChange={e=>setWatchInput(e.target.value.toUpperCase())}
            onKeyDown={e=>e.key==="Enter"&&addToWatchlist()} placeholder="Ex: PETR4, VALE3, AAPL..."
            style={{flex:1,fontSize:13,padding:"7px 10px"}}/>
          <button onClick={addToWatchlist} disabled={watchLoading} style={{padding:"7px 16px",borderRadius:8,background:COLORS.investimento,color:"#fff",border:"none",cursor:"pointer",fontSize:13,fontWeight:500,opacity:watchLoading?0.6:1}}>{watchLoading?"...":"+ Adicionar"}</button>
        </div>
        {watchlist.length===0 && <p style={{fontSize:13,color:"var(--color-text-tertiary)"}}>Nenhum ativo adicionado ainda.</p>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:8}}>
          {watchlist.map(w=>(
            <WatchlistCard key={w.ticker} w={w} cotacoes={cotacoes}
              onChart={t=>setChartTicker(t)}
              onRemove={t=>setWatchlist(prev=>prev.filter(x=>x.ticker!==t))}/>
          ))}
        </div>
      </Card>

      <Card>
        <p style={{fontSize:14,fontWeight:500,margin:"0 0 4px",color:"var(--color-text-primary)"}}>Indicadores fundamentalistas</p>
        <p style={{fontSize:12,color:"var(--color-text-tertiary)",margin:"0 0 10px"}}>Dados reais do TradingView</p>
        <TVFundamentals />
      </Card>

      <Card>
        <p style={{fontSize:14,fontWeight:500,margin:"0 0 4px",color:"var(--color-text-primary)"}}>Screener de ações</p>
        <p style={{fontSize:12,color:"var(--color-text-tertiary)",margin:"0 0 10px"}}>Filtre e compare ativos</p>
        <TVScreener />
      </Card>

      <Card>
        <p style={{fontSize:14,fontWeight:500,margin:"0 0 10px",color:"var(--color-text-primary)"}}>Calcular rentabilidade</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8,marginBottom:10}}>
          <label style={{fontSize:12,color:"var(--color-text-secondary)"}}>Preço de compra (R$)<input type="number" value={calcForm.preco_compra} onChange={e=>setCalcForm(f=>({...f,preco_compra:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,fontSize:13,padding:"6px 8px",boxSizing:"border-box"}}/></label>
          <label style={{fontSize:12,color:"var(--color-text-secondary)"}}>Preço atual (R$)<input type="number" value={calcForm.preco_atual} onChange={e=>setCalcForm(f=>({...f,preco_atual:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,fontSize:13,padding:"6px 8px",boxSizing:"border-box"}}/></label>
          <label style={{fontSize:12,color:"var(--color-text-secondary)"}}>Quantidade<input type="number" value={calcForm.quantidade} onChange={e=>setCalcForm(f=>({...f,quantidade:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,fontSize:13,padding:"6px 8px",boxSizing:"border-box"}}/></label>
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

      <Card>
        <p style={{fontSize:14,fontWeight:500,margin:"0 0 10px",color:"var(--color-text-primary)"}}>Simular juros compostos</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,marginBottom:10}}>
          <label style={{fontSize:12,color:"var(--color-text-secondary)"}}>Valor inicial (R$)<input type="number" value={simForm.inicial} onChange={e=>setSimForm(f=>({...f,inicial:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,fontSize:13,padding:"6px 8px",boxSizing:"border-box"}}/></label>
          <label style={{fontSize:12,color:"var(--color-text-secondary)"}}>Aporte mensal (R$)<input type="number" value={simForm.aporte} onChange={e=>setSimForm(f=>({...f,aporte:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,fontSize:13,padding:"6px 8px",boxSizing:"border-box"}}/></label>
          <label style={{fontSize:12,color:"var(--color-text-secondary)"}}>Taxa mensal (%)<input type="number" value={simForm.taxa} onChange={e=>setSimForm(f=>({...f,taxa:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,fontSize:13,padding:"6px 8px",boxSizing:"border-box"}}/></label>
          <label style={{fontSize:12,color:"var(--color-text-secondary)"}}>Período (meses)<input type="number" value={simForm.meses} onChange={e=>setSimForm(f=>({...f,meses:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,fontSize:13,padding:"6px 8px",boxSizing:"border-box"}}/></label>
        </div>
        <button onClick={simularJuros} style={{padding:"7px 16px",borderRadius:8,background:COLORS.meta,color:"#fff",border:"none",cursor:"pointer",fontSize:13,fontWeight:500}}>Simular</button>
        {simResultado && (
          <div style={{marginTop:12}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,marginBottom:12}}>
              <MetricCard label="Patrimônio final" value={fmt(simResultado.saldo)} color={COLORS.receita}/>
              <MetricCard label="Total aportado" value={fmt(simResultado.totalAportado)}/>
              <MetricCard label="Juros ganhos" value={fmt(simResultado.jurosGanhos)} color={COLORS.investimento}/>
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

      <Card>
        <p style={{fontSize:14,fontWeight:500,margin:"0 0 4px",color:"var(--color-text-primary)"}}>Sugestão de alocação (IA)</p>
        <p style={{fontSize:12,color:"var(--color-text-tertiary)",margin:"0 0 10px"}}>Análise via Claude AI</p>
        <button onClick={sugerirAlocacao} disabled={alocLoading} style={{padding:"7px 16px",borderRadius:8,background:COLORS.cartao,color:"#fff",border:"none",cursor:"pointer",fontSize:13,fontWeight:500,opacity:alocLoading?0.6:1}}>{alocLoading?"Analisando...":"Analisar carteira"}</button>
        {erro&&<p style={{fontSize:13,color:COLORS.despesa,marginTop:8}}>{erro}</p>}
        {alocSugest && (
          <div style={{marginTop:12}}>
            <p style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:12}}>{alocSugest.analise}</p>
            {alocSugest.sugestao.map((s,i)=>(
              <div key={i} style={{background:"var(--color-background-secondary)",borderRadius:8,padding:"10px 12px",marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
                  <span style={{fontWeight:500}}>{s.tipo}</span>
                  <span style={{color:"var(--color-text-secondary)"}}>{s.pct_atual}% → <strong style={{color:COLORS.investimento}}>{s.pct_ideal}%</strong></span>
                </div>
                <p style={{margin:0,fontSize:12,color:"var(--color-text-tertiary)"}}>{s.acao}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---- MODAL TRANSAÇÃO COM FOTO NF + LANÇAMENTO RÁPIDO ----
function ModalTransacao({ form, setForm, onSave, onClose }) {
  const [modo, setModo] = useState(form.editId ? "completo" : "rapido");
  const [analisandoNF, setAnalisandoNF] = useState(false);
  const fileRef = useRef();

  const origens = ["Conta Corrente","Cartão de Crédito","Dinheiro","Pix","Outro"];

  async function handleImgNF(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target.result;
      setForm(f=>({...f, nfImage: base64}));
      // IA analisa a NF automaticamente
      setAnalisandoNF(true);
      try {
        const imgData = base64.split(",")[1];
        const mediaType = file.type || "image/jpeg";
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:400,
            messages:[{role:"user",content:[
              {type:"image",source:{type:"base64",media_type:mediaType,data:imgData}},
              {type:"text",text:`Analise esta nota fiscal/cupom fiscal. Retorne SOMENTE JSON sem markdown: {"descricao":"nome do estabelecimento ou produto principal","valor":número,"categoria":"uma de: Alimentação,Transporte,Saúde,Lazer,Moradia,Educação,Outros","data":"YYYY-MM-DD se visível, senão hoje ${new Date().toISOString().slice(0,10)}"}`}
            ]}]
          })
        });
        const data = await res.json();
        const text = data.content.filter(b=>b.type==="text").map(b=>b.text).join("");
        const obj = JSON.parse(text.replace(/```json|```/g,"").trim());
        setForm(f=>({...f, descricao:obj.descricao||f.descricao, valor:obj.valor||f.valor, categoria:obj.categoria||f.categoria, data:obj.data||f.data}));
      } catch {}
      setAnalisandoNF(false);
    };
    reader.readAsDataURL(file);
  }

  const inputStyle = {display:"block",width:"100%",marginTop:4,boxSizing:"border-box",fontSize:13,padding:"6px 8px"};

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"var(--color-background-primary)",borderRadius:14,padding:"1.5rem",width:360,maxHeight:"90vh",overflowY:"auto",boxSizing:"border-box",display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <h3 style={{margin:0,fontSize:16,fontWeight:500}}>{form.editId?"Editar transação":"Nova transação"}</h3>
          {!form.editId && (
            <div style={{display:"flex",gap:4}}>
              <button onClick={()=>setModo("rapido")} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:"none",cursor:"pointer",background:modo==="rapido"?COLORS.receita:"var(--color-background-secondary)",color:modo==="rapido"?"#fff":"var(--color-text-secondary)"}}>⚡ Rápido</button>
              <button onClick={()=>setModo("completo")} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:"none",cursor:"pointer",background:modo==="completo"?COLORS.receita:"var(--color-background-secondary)",color:modo==="completo"?"#fff":"var(--color-text-secondary)"}}>📋 Completo</button>
            </div>
          )}
        </div>

        {/* MODO RÁPIDO */}
        {modo==="rapido" && (
          <>
            <p style={{margin:"-4px 0 0",fontSize:12,color:"var(--color-text-tertiary)"}}>Caiu na conta ou no cartão? Lance em segundos.</p>
            <label style={{fontSize:13}}>Tipo
              <select value={form.tipo||"despesa"} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} style={{display:"block",width:"100%",marginTop:4}}>
                <option value="despesa">Despesa</option>
                <option value="receita">Receita</option>
              </select>
            </label>
            <label style={{fontSize:13}}>Origem
              <select value={form.origem||"Conta Corrente"} onChange={e=>setForm(f=>({...f,origem:e.target.value}))} style={{display:"block",width:"100%",marginTop:4}}>
                {origens.map(o=><option key={o}>{o}</option>)}
              </select>
            </label>
            <label style={{fontSize:13}}>Valor (R$)<input type="number" value={form.valor||""} onChange={e=>setForm(f=>({...f,valor:e.target.value}))} placeholder="0,00" style={inputStyle}/></label>
            <label style={{fontSize:13}}>Descrição (opcional)<input value={form.descricao||""} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} placeholder="Ex: Supermercado, Salário..." style={inputStyle}/></label>
            <label style={{fontSize:13}}>Categoria
              <select value={form.categoria||""} onChange={e=>setForm(f=>({...f,categoria:e.target.value}))} style={{display:"block",width:"100%",marginTop:4}}>
                {(form.tipo==="receita"?CATEGORIAS_RECEITA:CATEGORIAS_DESPESA).map(c=><option key={c}>{c}</option>)}
              </select>
            </label>
          </>
        )}

        {/* MODO COMPLETO */}
        {modo==="completo" && (
          <>
            <label style={{fontSize:13}}>Tipo
              <select value={form.tipo||"despesa"} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} style={{display:"block",width:"100%",marginTop:4}}>
                <option value="despesa">Despesa</option>
                <option value="receita">Receita</option>
              </select>
            </label>
            <label style={{fontSize:13}}>Origem
              <select value={form.origem||"Conta Corrente"} onChange={e=>setForm(f=>({...f,origem:e.target.value}))} style={{display:"block",width:"100%",marginTop:4}}>
                {origens.map(o=><option key={o}>{o}</option>)}
              </select>
            </label>
            <label style={{fontSize:13}}>Descrição<input value={form.descricao||""} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} style={inputStyle}/></label>
            <label style={{fontSize:13}}>Valor (R$)<input type="number" value={form.valor||""} onChange={e=>setForm(f=>({...f,valor:e.target.value}))} style={inputStyle}/></label>
            <label style={{fontSize:13}}>Categoria
              <select value={form.categoria||""} onChange={e=>setForm(f=>({...f,categoria:e.target.value}))} style={{display:"block",width:"100%",marginTop:4}}>
                {(form.tipo==="receita"?CATEGORIAS_RECEITA:CATEGORIAS_DESPESA).map(c=><option key={c}>{c}</option>)}
              </select>
            </label>
            <label style={{fontSize:13}}>Data<input type="date" value={form.data||new Date().toISOString().slice(0,10)} onChange={e=>setForm(f=>({...f,data:e.target.value}))} style={inputStyle}/></label>

            {/* FOTO DA NF */}
            <div style={{borderTop:"0.5px solid var(--color-border-tertiary)",paddingTop:12}}>
              <p style={{margin:"0 0 6px",fontSize:13,fontWeight:500,color:"var(--color-text-primary)"}}>📎 Nota Fiscal</p>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleImgNF} style={{display:"none"}}/>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>fileRef.current.click()} style={{flex:1,padding:"8px",borderRadius:8,border:"0.5px dashed var(--color-border-secondary)",background:"var(--color-background-secondary)",cursor:"pointer",fontSize:12,color:"var(--color-text-secondary)"}}>
                  {form.nfImage?"🖼 Trocar imagem":"📷 Tirar foto / Anexar NF"}
                </button>
                {form.nfImage && <button onClick={()=>setForm(f=>({...f,nfImage:null}))} style={{padding:"8px 12px",borderRadius:8,border:"0.5px solid var(--color-border-secondary)",background:"transparent",cursor:"pointer",fontSize:12,color:COLORS.despesa}}>✕</button>}
              </div>
              {analisandoNF && <p style={{fontSize:12,color:COLORS.investimento,marginTop:6}}>✨ IA analisando a NF e preenchendo campos...</p>}
              {form.nfImage && !analisandoNF && (
                <img src={form.nfImage} alt="NF" style={{width:"100%",borderRadius:8,marginTop:8,border:"0.5px solid var(--color-border-tertiary)"}}/>
              )}
            </div>
          </>
        )}

        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:4}}>
          <button onClick={onClose} style={{padding:"8px 16px",borderRadius:8,border:"0.5px solid var(--color-border-secondary)",background:"transparent",cursor:"pointer",fontSize:13}}>Cancelar</button>
          <button onClick={onSave} style={{padding:"8px 16px",borderRadius:8,background:COLORS.receita,color:"#fff",border:"none",cursor:"pointer",fontSize:13,fontWeight:500}}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

// ---- APP PRINCIPAL ----
export default function App() {
  const [tab, setTab] = useState(0);
  const [data, setData] = useState(INITIAL);
  const [mesFiltro, setMesFiltro] = useState(mesAtual);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const loaded = useRef(false);

  useEffect(() => {
    (async () => {
      try { const r = await window.storage.get("financas_data"); if (r) setData(JSON.parse(r.value)); } catch {}
      loaded.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    window.storage.set("financas_data", JSON.stringify(data)).catch(()=>{});
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
    const t={
      id:form.editId||Date.now(),tipo:form.tipo||"despesa",
      descricao:form.descricao||(form.origem?"Lançamento via "+form.origem:"Sem descrição"),
      valor:parseFloat(form.valor)||0,categoria:form.categoria||"Outros",
      data:form.data||new Date().toISOString().slice(0,10),
      origem:form.origem||"",nfImage:form.nfImage||null
    };
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
          <button key={t} onClick={()=>setTab(i)} style={{padding:"6px 14px",borderRadius:20,fontSize:13,cursor:"pointer",border:tab===i?"none":"0.5px solid var(--color-border-secondary)",background:tab===i?COLORS.receita:"transparent",color:tab===i?"#fff":"var(--color-text-secondary)",fontWeight:tab===i?500:400}}>{t}</button>
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
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:"var(--color-text-secondary)"}}>{c.cat}</span><span style={{fontWeight:500}}>{fmt(c.total)}</span></div>
                <MiniBar valor={c.total} total={totalDespesas} cor={[COLORS.despesa,"#7F77DD","#378ADD","#1D9E75","#BA7517","#D85A30","#888780"][i%7]}/>
              </div>
            ))}
          </Card>
          <Card>
            <p style={{fontSize:13,fontWeight:500,marginBottom:10,color:"var(--color-text-primary)"}}>Receitas por categoria</p>
            {catReceitas.length===0&&<p style={{fontSize:13,color:"var(--color-text-tertiary)"}}>Nenhuma receita neste mês.</p>}
            {catReceitas.map((c,i)=>(
              <div key={c.cat} style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:"var(--color-text-secondary)"}}>{c.cat}</span><span style={{fontWeight:500}}>{fmt(c.total)}</span></div>
                <MiniBar valor={c.total} total={totalReceitas} cor={[COLORS.receita,"#378ADD","#7F77DD","#BA7517"][i%4]}/>
              </div>
            ))}
          </Card>
          {tiposInvest.length>0&&(
            <Card>
              <p style={{fontSize:13,fontWeight:500,marginBottom:10,color:"var(--color-text-primary)"}}>Carteira de investimentos</p>
              {tiposInvest.map((t,i)=>(
                <div key={t.tipo} style={{marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:"var(--color-text-secondary)"}}>{t.tipo}</span><span style={{fontWeight:500}}>{fmt(t.total)} ({totalInvest>0?Math.round(t.total/totalInvest*100):0}%)</span></div>
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
              <div style={{width:36,height:36,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",background:t.tipo==="receita"?"#E1F5EE":"#FAECE7",fontSize:18,flexShrink:0}}>{t.tipo==="receita"?"↑":"↓"}</div>
              <div style={{flex:1,minWidth:0}}>
                <p style={{margin:0,fontSize:14,fontWeight:500,color:"var(--color-text-primary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.descricao}</p>
                <p style={{margin:0,fontSize:12,color:"var(--color-text-tertiary)"}}>
                  {t.categoria} · {t.data}
                  {t.origem&&<span style={{marginLeft:6,background:"var(--color-background-secondary)",borderRadius:4,padding:"1px 5px"}}>{t.origem}</span>}
                  {t.nfImage&&<span style={{marginLeft:6,color:COLORS.investimento,fontSize:11}}>📎 NF</span>}
                </p>
              </div>
              <span style={{fontWeight:500,color:t.tipo==="receita"?COLORS.receita:COLORS.despesa,fontSize:15,flexShrink:0}}>{t.tipo==="receita"?"+":"-"}{fmt(t.valor)}</span>
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
          {faturasMes.length>0&&<div style={{background:"var(--color-background-secondary)",borderRadius:8,padding:"0.75rem 1rem",fontSize:14}}><span style={{color:"var(--color-text-secondary)"}}>Total: </span><strong>{fmt(totalFaturas)}</strong></div>}
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
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:"var(--color-text-secondary)"}}>{t.tipo}</span><span style={{fontWeight:500}}>{fmt(t.total)} ({totalInvest>0?Math.round(t.total/totalInvest*100):0}%)</span></div>
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
                <p style={{margin:0,fontSize:14,fontWeight:500}}>{inv.descricao||inv.tipo}</p>
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
                  <span style={{fontSize:12,color:"var(--color-text-tertiary)"}}>Atualizar:</span>
                  <input type="number" defaultValue={m.atual} onBlur={e=>atualizarMeta(m.id,e.target.value)} style={{width:100,fontSize:13,padding:"4px 8px"}}/>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* NFs PARA IR */}
      {tab===5&&<NFsTab transacoes={data.transacoes}/>}

      {/* ANÁLISE */}
      {tab===6&&<AnaliseTab investimentos={data.investimentos}/>}

      {/* MODAIS */}
      {modal==="transacao" && (
        <ModalTransacao form={form} setForm={setForm} onSave={saveTransacao} onClose={closeModal}/>
      )}
      {modal==="fatura"&&(
        <div onClick={closeModal} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--color-background-primary)",borderRadius:14,padding:"1.5rem",width:340,boxSizing:"border-box",display:"flex",flexDirection:"column",gap:12}}>
            <h3 style={{margin:0,fontSize:16,fontWeight:500}}>{form.editId?"Editar fatura":"Nova fatura"}</h3>
            <label style={{fontSize:13}}>Cartão<select value={form.cartao||""} onChange={e=>setForm(f=>({...f,cartao:e.target.value}))} style={{display:"block",width:"100%",marginTop:4}}>{CARTOES.map(c=><option key={c}>{c}</option>)}</select></label>
            <label style={{fontSize:13}}>Valor (R$)<input type="number" value={form.valor||""} onChange={e=>setForm(f=>({...f,valor:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,boxSizing:"border-box"}}/></label>
            <label style={{fontSize:13}}>Vencimento<input type="date" value={form.vencimento||""} onChange={e=>setForm(f=>({...f,vencimento:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,boxSizing:"border-box"}}/></label>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={closeModal} style={{padding:"8px 16px",borderRadius:8,border:"0.5px solid var(--color-border-secondary)",background:"transparent",cursor:"pointer",fontSize:13}}>Cancelar</button>
              <button onClick={saveFatura} style={{padding:"8px 16px",borderRadius:8,background:COLORS.receita,color:"#fff",border:"none",cursor:"pointer",fontSize:13,fontWeight:500}}>Salvar</button>
            </div>
          </div>
        </div>
      )}
      {modal==="investimento"&&(
        <div onClick={closeModal} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--color-background-primary)",borderRadius:14,padding:"1.5rem",width:340,boxSizing:"border-box",display:"flex",flexDirection:"column",gap:12}}>
            <h3 style={{margin:0,fontSize:16,fontWeight:500}}>{form.editId?"Editar aporte":"Novo aporte"}</h3>
            <label style={{fontSize:13}}>Tipo<select value={form.tipo||""} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} style={{display:"block",width:"100%",marginTop:4}}>{TIPOS_INVESTIMENTO.map(t=><option key={t}>{t}</option>)}</select></label>
            <label style={{fontSize:13}}>Descrição<input value={form.descricao||""} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,boxSizing:"border-box"}}/></label>
            <label style={{fontSize:13}}>Valor (R$)<input type="number" value={form.valor||""} onChange={e=>setForm(f=>({...f,valor:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,boxSizing:"border-box"}}/></label>
            <label style={{fontSize:13}}>Data<input type="date" value={form.data||new Date().toISOString().slice(0,10)} onChange={e=>setForm(f=>({...f,data:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,boxSizing:"border-box"}}/></label>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={closeModal} style={{padding:"8px 16px",borderRadius:8,border:"0.5px solid var(--color-border-secondary)",background:"transparent",cursor:"pointer",fontSize:13}}>Cancelar</button>
              <button onClick={saveInvestimento} style={{padding:"8px 16px",borderRadius:8,background:COLORS.receita,color:"#fff",border:"none",cursor:"pointer",fontSize:13,fontWeight:500}}>Salvar</button>
            </div>
          </div>
        </div>
      )}
      {modal==="meta"&&(
        <div onClick={closeModal} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"var(--color-background-primary)",borderRadius:14,padding:"1.5rem",width:340,boxSizing:"border-box",display:"flex",flexDirection:"column",gap:12}}>
            <h3 style={{margin:0,fontSize:16,fontWeight:500}}>{form.editId?"Editar meta":"Nova meta"}</h3>
            <label style={{fontSize:13}}>Nome<input value={form.nome||""} onChange={e=>setForm(f=>({...f,nome:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,boxSizing:"border-box"}}/></label>
            <label style={{fontSize:13}}>Objetivo (R$)<input type="number" value={form.objetivo||""} onChange={e=>setForm(f=>({...f,objetivo:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,boxSizing:"border-box"}}/></label>
            <label style={{fontSize:13}}>Valor atual (R$)<input type="number" value={form.atual||""} onChange={e=>setForm(f=>({...f,atual:e.target.value}))} style={{display:"block",width:"100%",marginTop:4,boxSizing:"border-box"}}/></label>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={closeModal} style={{padding:"8px 16px",borderRadius:8,border:"0.5px solid var(--color-border-secondary)",background:"transparent",cursor:"pointer",fontSize:13}}>Cancelar</button>
              <button onClick={saveMeta} style={{padding:"8px 16px",borderRadius:8,background:COLORS.receita,color:"#fff",border:"none",cursor:"pointer",fontSize:13,fontWeight:500}}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
