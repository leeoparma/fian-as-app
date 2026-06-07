import { useState, useEffect, useRef } from "react";

const D = {
  bg:"#0a0e1a", bg2:"#0f1629", bg3:"#151d35", card:"#111827", card2:"#1a2235",
  border:"#1e2d4a", border2:"#253352", green:"#00d084", green2:"#00ff9d",
  red:"#ff4757", blue:"#3b82f6", blue2:"#60a5fa", gold:"#f59e0b", purple:"#8b5cf6",
  text:"#f1f5f9", text2:"#94a3b8", text3:"#64748b",
};
const CORES = [D.green,D.blue,D.purple,D.gold,D.red,"#06b6d4","#ec4899"];
const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const CAT_D = ["Alimentação","Transporte","Saúde","Lazer","Moradia","Educação","Outros"];
const CAT_R = ["Salário","Freelance","Investimentos","Outros"];
const TIPOS_INV = ["Ações","FII","ETF","Cripto","Renda Fixa","Tesouro Direto","Outros"];
const hoje = new Date();
const MES = hoje.getMonth();
const ANO = hoje.getFullYear();
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,5);
const fmtM = (v,cur="R$") => cur+" "+Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});

// Dados demo
const DEMO = {
  transacoes:[
    {id:"t1",tipo:"receita",descricao:"Salário",valor:8500,categoria:"Salário",data:"2026-06-05",bancoId:"b1"},
    {id:"t2",tipo:"despesa",descricao:"Aluguel",valor:2200,categoria:"Moradia",data:"2026-06-05",bancoId:"b1"},
    {id:"t3",tipo:"despesa",descricao:"Supermercado",valor:650,categoria:"Alimentação",data:"2026-06-06",bancoId:"b2"},
    {id:"t4",tipo:"receita",descricao:"Freelance",valor:1200,categoria:"Freelance",data:"2026-06-04",bancoId:"b2"},
    {id:"t5",tipo:"despesa",descricao:"Uber",valor:180,categoria:"Transporte",data:"2026-06-03",bancoId:"b1"},
    {id:"t6",tipo:"despesa",descricao:"Academia",valor:120,categoria:"Saúde",data:"2026-06-02",bancoId:"b1"},
  ],
  faturas:[{id:"f1",cartao:"Nubank",valor:1850,vencimento:"2026-06-15",mes:MES,bancoId:"b1"}],
  investimentos:[
    {id:"i1",tipo:"Ações",ticker:"PETR4",descricao:"Petrobras",quantidade:100,precoMedio:36.5,valorInvestido:3650,valorAtual:3920,lucro:270,data:"2025-01-10"},
    {id:"i2",tipo:"FII",ticker:"HGLG11",descricao:"CSHG Logística",quantidade:20,precoMedio:148,valorInvestido:2960,valorAtual:3100,lucro:140,data:"2025-03-15"},
    {id:"i3",tipo:"Renda Fixa",descricao:"CDB Nubank 102% CDI",valorInvestido:10000,valorAtual:10525,lucro:525,indice:"CDI",pctIndice:102,rfTipo:"pct",data:"2025-06-01"},
    {id:"i4",tipo:"Cripto",ticker:"BTC",descricao:"Bitcoin",quantidade:0.05,precoMedio:280000,valorInvestido:14000,valorAtual:16800,lucro:2800,data:"2024-11-01"},
  ],
  metas:[
    {id:"m1",nome:"Reserva de emergência",objetivo:30000,atual:18500,prazo:"2026-12-31"},
    {id:"m2",nome:"Viagem Austrália",objetivo:15000,atual:6200,prazo:"2027-03-01"},
  ],
  bancos:[
    {id:"b1",nome:"Nubank",tipo:"digital",saldoInicial:5200,limite:8000},
    {id:"b2",nome:"Itaú",tipo:"corrente",saldoInicial:3100,limite:5000},
  ],
  orcamentos:[
    {id:"o1",categoria:"Alimentação",valor:800},
    {id:"o2",categoria:"Transporte",valor:300},
    {id:"o3",categoria:"Lazer",valor:500},
  ],
  recorrencias:[{id:"r1",tipo:"despesa",descricao:"Netflix",valor:45.90,categoria:"Assinatura",dia:10,bancoId:"b1"}],
  dividendos:[{id:"d1",ticker:"HGLG11",valor:62,data:"2026-06-10",tipo:"Rendimento FII"}],
  catD:[...CAT_D],catR:[...CAT_R],
};

function Card({children,style,glow}){
  return <div style={{background:D.card,border:`1px solid ${D.border}`,borderRadius:14,padding:"1rem 1.1rem",...(glow?{boxShadow:`0 0 20px ${D.green}22`}:{}),...style}}>{children}</div>;
}
function MetricCard({label,value,color,sub,icon}){
  return <div style={{background:D.card2,border:`1px solid ${D.border}`,borderRadius:12,padding:"0.9rem"}}>
    <div style={{display:"flex",justifyContent:"space-between"}}><p style={{margin:0,fontSize:10,color:D.text3,textTransform:"uppercase",letterSpacing:"0.5px"}}>{label}</p>{icon&&<span style={{fontSize:14}}>{icon}</span>}</div>
    <p style={{margin:"5px 0 0",fontSize:20,fontWeight:700,color:color||D.text}}>{value}</p>
    {sub&&<p style={{margin:"2px 0 0",fontSize:10,color:D.text3}}>{sub}</p>}
  </div>;
}
function Btn({children,onClick,color,disabled,style,outline,sm}){
  const c=color||D.green;
  return <button onClick={onClick} disabled={disabled} style={{padding:sm?"4px 10px":"8px 16px",borderRadius:8,fontSize:sm?11:13,fontWeight:600,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1,transition:"all .15s",...(outline?{background:"transparent",border:`1px solid ${c}`,color:c}:{background:c,border:"none",color:c===D.green||c===D.gold?"#000":"#fff"}),...style}}>{children}</button>;
}
function Badge({children,color}){const c=color||D.green;return <span style={{fontSize:10,background:c+"22",color:c,borderRadius:20,padding:"2px 8px",fontWeight:600,border:`1px solid ${c}44`}}>{children}</span>;}
function MiniBar({valor,total,cor}){const p=total>0?Math.min(100,(valor/total)*100):0;return <div style={{background:D.bg3,borderRadius:4,height:5,marginTop:4,overflow:"hidden"}}><div style={{width:p+"%",background:cor,borderRadius:4,height:5,transition:"width .5s",boxShadow:`0 0 6px ${cor}88`}}/></div>;}

function PieChart({slices}){
  let cum=0;const total=slices.reduce((a,b)=>a+b.v,0);
  if(!total)return null;
  const paths=slices.filter(s=>s.v>0).map(s=>{const pct=s.v/total,start=cum,end=cum+pct;cum=end;const x1=Math.cos(2*Math.PI*start-Math.PI/2),y1=Math.sin(2*Math.PI*start-Math.PI/2),x2=Math.cos(2*Math.PI*end-Math.PI/2),y2=Math.sin(2*Math.PI*end-Math.PI/2);return{d:`M0,0 L${x1},${y1} A1,1,0,${pct>0.5?1:0},1,${x2},${y2}Z`,color:s.color,label:s.label,pct:Math.round(pct*100)};});
  return <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
    <svg viewBox="-1.15 -1.15 2.3 2.3" style={{width:100,height:100,flexShrink:0}}>{paths.map((p,i)=><path key={i} d={p.d} fill={p.color} stroke={D.bg2} strokeWidth="0.04"/>)}</svg>
    <div style={{display:"flex",flexDirection:"column",gap:5}}>{paths.map((p,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:11}}><div style={{width:8,height:8,borderRadius:2,background:p.color,flexShrink:0}}/><span style={{color:D.text2,flex:1}}>{p.label}</span><span style={{color:p.color,fontWeight:600}}>{p.pct}%</span></div>)}</div>
  </div>;
}

function ScoreCard({data}){
  const txMes=data.transacoes.filter(t=>{const d=new Date(t.data);return d.getMonth()===MES&&d.getFullYear()===ANO;});
  const r=txMes.filter(t=>t.tipo==="receita").reduce((a,b)=>a+b.valor,0);
  const d=txMes.filter(t=>t.tipo==="despesa").reduce((a,b)=>a+b.valor,0);
  const inv=data.investimentos.reduce((a,b)=>a+(b.valorAtual||0),0);
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
    <div><p style={{margin:0,fontSize:17,fontWeight:700,color:cor}}>{label}</p><p style={{margin:"2px 0 0",fontSize:11,color:D.text3}}>Score de saúde financeira</p><p style={{margin:"6px 0 0",fontSize:11,color:D.text3}}>Com dados reais, a IA analisa seu perfil completo</p></div>
  </div>;
}

const TABS = ["Dashboard","Bancos","Lançamentos","Cartão","Investimentos","Metas","Análise"];

function BancoCard({b,sc,si}){
  const [exp,setExp]=useState(false);
  return <Card><div style={{display:"flex",justifyContent:"space-between"}}><div><p style={{margin:"0 0 2px",fontSize:14,fontWeight:700,color:D.blue}}>🏦 {b.nome}</p><p style={{margin:0,fontSize:10,color:D.text3,textTransform:"capitalize"}}>{b.tipo}</p></div><span style={{fontSize:11}}>📄 ✏️ 🗑</span></div><p style={{margin:"10px 0 2px",fontSize:10,color:D.text3}}>Saldo conta</p><p style={{margin:"0 0 8px",fontSize:20,fontWeight:700,color:sc>=0?D.green:D.red}}>{fmtM(sc)}</p><div style={{display:"flex",justifyContent:"space-between",padding:"5px 8px",background:D.bg3,borderRadius:7,cursor:"pointer"}} onClick={()=>setExp(e=>!e)}><span style={{fontSize:10,color:D.text3}}>Invest: <strong style={{color:D.blue}}>{fmtM(si)}</strong></span><span style={{fontSize:9,color:D.text3}}>{exp?"▲":"▼"}</span></div>{exp&&<div style={{marginTop:6,fontSize:11,color:D.text3}}>Nenhum invest. vinculado neste demo.</div>}{b.limite>0&&<p style={{margin:"6px 0 0",fontSize:10,color:D.text3}}>Limite: {fmtM(b.limite)}</p>}</Card>;
}

export default function App() {
  const [tab,setTab]=useState(0);
  const [mes,setMes]=useState(MES);
  const [data]=useState(DEMO);
  const [grafico,setGrafico]=useState("barras");

  const txMes=data.transacoes.filter(t=>{const d=new Date(t.data);return d.getMonth()===mes&&d.getFullYear()===ANO;});
  const totR=txMes.filter(t=>t.tipo==="receita").reduce((a,b)=>a+b.valor,0);
  const totD=txMes.filter(t=>t.tipo==="despesa").reduce((a,b)=>a+b.valor,0);
  const totInv=data.investimentos.reduce((a,b)=>a+(b.valorAtual||0),0);
  const totLucro=data.investimentos.reduce((a,b)=>a+(b.lucro||0),0);
  function saldoBanco(b){const txs=data.transacoes.filter(t=>t.bancoId===b.id);return (b.saldoInicial||0)+txs.filter(t=>t.tipo==="receita").reduce((a,x)=>a+x.valor,0)-txs.filter(t=>t.tipo==="despesa").reduce((a,x)=>a+x.valor,0);}
  const totBancos=data.bancos.reduce((a,b)=>a+saldoBanco(b),0);
  const patrimonioLiq=totBancos+totInv;
  const tiposI=TIPOS_INV.map(t=>({t,v:data.investimentos.filter(i=>i.tipo===t).reduce((a,b)=>a+(b.valorAtual||0),0)})).filter(x=>x.v>0);
  const catPieD=CAT_D.map((c,i)=>({label:c,v:txMes.filter(t=>t.tipo==="despesa"&&t.categoria===c).reduce((a,b)=>a+b.valor,0),color:CORES[i%CORES.length]})).filter(x=>x.v>0);

  const ultimos6=Array.from({length:6},(_,i)=>{const d=new Date(ANO,MES-5+i,1),m=d.getMonth(),a=d.getFullYear();const txs=data.transacoes.filter(t=>{const td=new Date(t.data);return td.getMonth()===m&&td.getFullYear()===a;});return{label:MESES[m],r:txs.filter(t=>t.tipo==="receita").reduce((a,b)=>a+b.valor,0),d:txs.filter(t=>t.tipo==="despesa").reduce((a,b)=>a+b.valor,0)};});

  return (
    <div style={{fontFamily:"system-ui,sans-serif",background:D.bg,minHeight:"100vh",color:D.text,padding:"0.75rem 0.75rem 3rem"}}>
      <style>{`*{box-sizing:border-box;} input,select{background:${D.bg3};color:${D.text};border:1px solid ${D.border2};border-radius:8px;padding:7px 10px;font-size:13px;} ::-webkit-scrollbar{width:3px;height:3px} ::-webkit-scrollbar-thumb{background:${D.border2};border-radius:2px}`}</style>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem",padding:"0.75rem 1rem",background:D.card,borderRadius:14,border:`1px solid ${D.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20,filter:`drop-shadow(0 0 8px ${D.green})`}}>💰</span>
          <div><p style={{margin:0,fontSize:14,fontWeight:800,color:D.text}}>Controle Financeiro</p><p style={{margin:0,fontSize:9,color:D.green}}>● Preview — dados demo</p></div>
        </div>
        <div style={{display:"flex",gap:4}}>
          <span style={{padding:"4px 12px",borderRadius:20,fontSize:11,background:D.green,color:"#000",fontWeight:700}}>🇧🇷 Brasil</span>
          <span style={{padding:"4px 12px",borderRadius:20,fontSize:11,border:`1px solid ${D.border}`,color:D.text3}}>🇦🇺 Austrália</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:2,marginBottom:"1rem",background:D.card,borderRadius:12,padding:4,border:`1px solid ${D.border}`,overflowX:"auto"}}>
        {TABS.map((t,i)=><button key={t} onClick={()=>setTab(i)} style={{padding:"6px 12px",borderRadius:9,fontSize:11,cursor:"pointer",border:"none",background:tab===i?D.green:"transparent",color:tab===i?"#000":D.text3,fontWeight:tab===i?700:400,whiteSpace:"nowrap",flexShrink:0}}>{t}</button>)}
      </div>

      {/* Filtro mês */}
      {(tab===0||tab===2||tab===3)&&<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:"1rem"}}>
        <span style={{fontSize:11,color:D.text3}}>Mês:</span>
        <select value={mes} onChange={e=>setMes(+e.target.value)} style={{width:"auto",padding:"4px 8px",fontSize:12}}>
          {MESES.map((m,i)=><option key={m} value={i}>{m} {ANO}</option>)}
        </select>
      </div>}

      {/* DASHBOARD */}
      {tab===0&&<div style={{display:"flex",flexDirection:"column",gap:"0.9rem"}}>
        <Card glow style={{background:`linear-gradient(135deg,${D.bg3},${D.card2})`,border:`1px solid ${D.green}33`}}>
          <p style={{fontSize:10,color:D.text3,textTransform:"uppercase",letterSpacing:"1px",marginBottom:6}}>Patrimônio Líquido Total</p>
          <p style={{fontSize:32,fontWeight:800,color:D.green,letterSpacing:"-1px",textShadow:`0 0 20px ${D.green}66`}}>{fmtM(patrimonioLiq)}</p>
          <p style={{fontSize:11,color:D.text3,marginTop:4}}>Bancos + Investimentos</p>
        </Card>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8}}>
          <MetricCard label="Receitas" value={fmtM(totR)} color={D.green} icon="↑"/>
          <MetricCard label="Despesas" value={fmtM(totD)} color={D.red} icon="↓"/>
          <MetricCard label="Saldo Bancos" value={fmtM(totBancos)} color={D.green} icon="🏦"/>
          <MetricCard label="Investimentos" value={fmtM(totInv)} color={D.blue} icon="📈"/>
        </div>
        <Card><ScoreCard data={data}/></Card>
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:6}}>
            <p style={{fontSize:13,fontWeight:700,color:D.text}}>Evolução financeira</p>
            <div style={{display:"flex",gap:3}}>
              {[["barras","📊"],["pizza","🥧"],["invest","📈"]].map(([v,l])=><button key={v} onClick={()=>setGrafico(v)} style={{padding:"3px 9px",borderRadius:14,fontSize:10,cursor:"pointer",border:grafico===v?`1px solid ${D.green}`:`1px solid ${D.border}`,background:grafico===v?D.green+"22":"transparent",color:grafico===v?D.green:D.text3}}>{l}</button>)}
            </div>
          </div>
          {grafico==="barras"&&<div>
            <div style={{display:"flex",gap:5,alignItems:"flex-end",height:100}}>
              {ultimos6.map((d,i)=>{const max=Math.max(...ultimos6.map(x=>Math.max(x.r,x.d)),1);return <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <div style={{width:"100%",display:"flex",gap:1,alignItems:"flex-end",height:80}}>
                  <div style={{flex:1,background:D.green,borderRadius:"2px 2px 0 0",height:Math.max(2,(d.r/max)*80)+"px",boxShadow:`0 0 6px ${D.green}66`}}/>
                  <div style={{flex:1,background:D.red,borderRadius:"2px 2px 0 0",height:Math.max(2,(d.d/max)*80)+"px",boxShadow:`0 0 6px ${D.red}66`}}/>
                </div>
                <span style={{fontSize:8,color:D.text3}}>{d.label}</span>
              </div>;})}
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:8}}><span style={{fontSize:10,color:D.green}}>● Receitas</span><span style={{fontSize:10,color:D.red}}>● Despesas</span></div>
          </div>}
          {grafico==="pizza"&&<PieChart slices={catPieD}/>}
          {grafico==="invest"&&<PieChart slices={tiposI.map((x,i)=>({label:x.t,v:x.v,color:CORES[i%CORES.length]}))}/>}
        </Card>
        {data.orcamentos?.length>0&&<Card>
          <p style={{fontSize:13,fontWeight:700,color:D.text,marginBottom:10}}>🎯 Orçamento mensal</p>
          {data.orcamentos.map(orc=>{const gasto=txMes.filter(t=>t.tipo==="despesa"&&t.categoria===orc.categoria).reduce((a,b)=>a+b.valor,0);const pct=orc.valor>0?Math.min(100,(gasto/orc.valor)*100):0;const cor=pct>90?D.red:pct>70?D.gold:D.green;return <div key={orc.id} style={{marginBottom:10}}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}><span style={{color:D.text2}}>{orc.categoria}</span><span style={{color:cor,fontWeight:600}}>{fmtM(gasto)} / {fmtM(orc.valor)}</span></div><div style={{background:D.bg3,borderRadius:4,height:5,overflow:"hidden"}}><div style={{width:pct+"%",background:cor,height:5,borderRadius:4,boxShadow:`0 0 5px ${cor}88`}}/></div></div>;})}
        </Card>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8}}>
          {data.bancos.map(b=>{const s=saldoBanco(b);return <Card key={b.id}><p style={{margin:0,fontSize:11,color:D.blue,fontWeight:600}}>🏦 {b.nome}</p><p style={{margin:"4px 0 0",fontSize:18,fontWeight:700,color:s>=0?D.green:D.red}}>{fmtM(s)}</p></Card>;})}
        </div>
      </div>}

      {/* BANCOS */}
      {tab===1&&<div style={{display:"flex",flexDirection:"column",gap:"0.9rem"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10}}>
          {data.bancos.map(b=>{const sc=saldoBanco(b),si=data.investimentos.filter(i=>i.bancoId===b.id).reduce((a,x)=>a+(x.valorAtual||0),0);return <BancoCard key={b.id} b={b} sc={sc} si={si}/>;})}
        </div>
        <Card><p style={{fontSize:13,fontWeight:700,color:D.text,marginBottom:8}}>↔ Transferência entre bancos</p><p style={{fontSize:12,color:D.text3}}>Funcional no app completo — debita de um banco e credita no outro automaticamente.</p></Card>
      </div>}

      {/* LANÇAMENTOS */}
      {tab===2&&<div style={{display:"flex",flexDirection:"column",gap:"0.75rem"}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <Btn sm>+ Lançamento</Btn>
          <Btn sm color={D.gold} outline>🎯 Orçamento</Btn>
          <Btn sm color={D.purple} outline>🔄 Recorrência</Btn>
        </div>
        <Card><p style={{fontSize:12,fontWeight:700,color:D.text,marginBottom:6}}>🔄 Recorrentes ativos</p>{data.recorrencias.map(r=><div key={r.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 10px",background:D.bg3,borderRadius:7,fontSize:12}}><span style={{color:D.text2}}>{r.descricao} <span style={{color:D.text3,fontSize:10}}>dia {r.dia}</span></span><span style={{color:D.red,fontWeight:700}}>-{fmtM(r.valor)}</span></div>)}</Card>
        {txMes.sort((a,b)=>b.data.localeCompare(a.data)).map(t=><Card key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"0.75rem 1rem"}}>
          <div style={{width:36,height:36,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",background:t.tipo==="receita"?D.green+"22":D.red+"22",fontSize:16,flexShrink:0}}>{t.tipo==="receita"?"↑":"↓"}</div>
          <div style={{flex:1,minWidth:0}}><p style={{margin:0,fontSize:13,fontWeight:600,color:D.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.descricao}</p><p style={{margin:0,fontSize:10,color:D.text3}}>{t.categoria} · {t.data} · 🏦 {data.bancos.find(b=>b.id===t.bancoId)?.nome||""}</p></div>
          <span style={{fontWeight:700,color:t.tipo==="receita"?D.green:D.red,fontSize:14,flexShrink:0}}>{t.tipo==="receita"?"+":"-"}{fmtM(t.valor)}</span>
        </Card>)}
      </div>}

      {/* CARTÃO */}
      {tab===3&&<div style={{display:"flex",flexDirection:"column",gap:"0.9rem"}}>
        <Btn sm color={D.purple} style={{alignSelf:"flex-start"}}>+ Nova fatura</Btn>
        {data.faturas.filter(f=>f.mes===mes).map(f=><Card key={f.id} style={{border:`1px solid ${D.purple}33`}}>
          <p style={{margin:"0 0 4px",fontSize:13,fontWeight:700,color:D.purple}}>{f.cartao}</p>
          <p style={{margin:"0 0 2px",fontSize:20,fontWeight:700,color:D.text}}>{fmtM(f.valor)}</p>
          <p style={{margin:0,fontSize:11,color:D.text3}}>📅 Vence: {f.vencimento}</p>
          <p style={{margin:"2px 0 0",fontSize:11,color:D.blue}}>🏦 {data.bancos.find(b=>b.id===f.bancoId)?.nome} — débito automático</p>
        </Card>)}
      </div>}

      {/* INVESTIMENTOS */}
      {tab===4&&<div style={{display:"flex",flexDirection:"column",gap:"0.9rem"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
          <Btn sm color={D.blue}>+ Novo ativo</Btn>
          <div style={{display:"flex",gap:10,fontSize:12}}><span style={{color:D.text3}}>Total: <strong style={{color:D.blue}}>{fmtM(totInv)}</strong></span><span style={{color:D.text3}}>Lucro: <strong style={{color:totLucro>=0?D.green:D.red}}>{fmtM(totLucro)}</strong></span></div>
        </div>
        {data.dividendos.length>0&&<Card style={{border:`1px solid ${D.gold}44`}}><p style={{fontSize:12,fontWeight:700,color:D.gold,marginBottom:6}}>💰 Dividendos em {MESES[MES]}</p><p style={{fontSize:20,fontWeight:700,color:D.gold}}>{fmtM(data.dividendos.reduce((a,b)=>a+b.valor,0))}</p><div style={{display:"flex",gap:5,marginTop:6}}>{data.dividendos.map(d=><Badge key={d.id} color={D.gold}>{d.ticker} {fmtM(d.valor)}</Badge>)}</div></Card>}
        <Card><p style={{fontSize:12,fontWeight:700,color:D.text,marginBottom:10}}>Distribuição</p><PieChart slices={tiposI.map((x,i)=>({label:x.t,v:x.v,color:CORES[i%CORES.length]}))}/></Card>
        {data.investimentos.map(inv=>{const custo=inv.valorInvestido||0,atual=inv.valorAtual||custo,lucro=inv.lucro||0,lpct=custo>0?(lucro/custo*100):0;return <Card key={inv.id} style={{border:`1px solid ${lucro>0?D.green+"33":lucro<0?D.red+"33":D.border}`}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
            <div style={{flex:1}}>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>{inv.ticker&&<span style={{fontSize:14,fontWeight:700,color:D.blue,cursor:"pointer"}}>{inv.ticker}</span>}<span style={{fontSize:12,color:D.text2}}>{inv.descricao}</span><Badge color={D.purple}>{inv.tipo}</Badge></div>
              {inv.tipo!=="Renda Fixa"?<p style={{margin:"3px 0 0",fontSize:10,color:D.text3}}>{inv.quantidade} un. · PM: {fmtM(inv.precoMedio)}</p>:<p style={{margin:"3px 0 0",fontSize:10,color:D.text3}}>102% CDI</p>}
            </div>
            <span style={{fontSize:14,color:D.green}}>🔄</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:6,marginTop:10}}>
            <MetricCard label="Investido" value={fmtM(custo)}/>
            <MetricCard label="Atual" value={fmtM(atual)} color={D.blue}/>
            <MetricCard label="Lucro" value={fmtM(lucro)} color={lucro>=0?D.green:D.red} sub={lpct.toFixed(1)+"%"}/>
          </div>
        </Card>;})}
      </div>}

      {/* METAS */}
      {tab===5&&<div style={{display:"flex",flexDirection:"column",gap:"0.9rem"}}>
        <Btn sm style={{alignSelf:"flex-start"}}>+ Nova meta</Btn>
        {data.metas.map(m=>{const p=m.objetivo>0?Math.min(100,Math.round(m.atual/m.objetivo*100)):0;const cor=p>=100?D.green:p>=60?D.blue:p>=30?D.gold:D.red;const falta=Math.max(0,m.objetivo-m.atual);const meses=m.prazo?Math.max(1,Math.ceil((new Date(m.prazo)-new Date())/(1000*60*60*24*30))):null;return <Card key={m.id} style={{border:`1px solid ${cor}33`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
            <div><p style={{margin:0,fontSize:14,fontWeight:700,color:D.text}}>🎯 {m.nome}</p>{m.prazo&&<p style={{margin:"2px 0 0",fontSize:10,color:D.text3}}>Prazo: {m.prazo}</p>}</div>
            <span style={{fontSize:20,fontWeight:800,color:cor}}>{p}%</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:5,color:D.text2}}><span>{fmtM(m.atual)}</span><span style={{color:D.text3}}>{fmtM(m.objetivo)}</span></div>
          <div style={{background:D.bg3,borderRadius:8,height:10,overflow:"hidden"}}><div style={{width:p+"%",background:`linear-gradient(90deg,${cor},${cor}cc)`,height:10,borderRadius:8,boxShadow:`0 0 8px ${cor}88`}}/></div>
          {meses&&falta>0&&<p style={{fontSize:10,color:D.text3,marginTop:5}}>Faltam {fmtM(falta)} · Sugerido: {fmtM(falta/meses)}/mês</p>}
        </Card>;})}
      </div>}

      {/* ANÁLISE */}
      {tab===6&&<div style={{display:"flex",flexDirection:"column",gap:"0.9rem"}}>
        <Card>
          <p style={{fontSize:13,fontWeight:700,color:D.text,marginBottom:8}}>⚖️ Nota de risco da carteira</p>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:56,height:56,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:D.gold+"22",border:`2px solid ${D.gold}`,fontSize:20,fontWeight:700,color:D.gold}}>7</div>
            <div><p style={{margin:0,fontSize:14,fontWeight:700,color:D.text}}>Moderado</p><p style={{margin:"2px 0 0",fontSize:11,color:D.text3}}>Carteira equilibrada com boa diversificação</p></div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4,marginTop:10}}>{["Exposição a Cripto (alto risco)","Concentração em Petróleo","Baixa renda fixa para emergências"].map((r,i)=><div key={i} style={{fontSize:11,color:D.text3,padding:"4px 10px",background:D.bg3,borderRadius:6,borderLeft:`2px solid ${D.gold}`}}>⚠️ {r}</div>)}</div>
        </Card>
        <Card>
          <p style={{fontSize:13,fontWeight:700,color:D.text,marginBottom:8}}>Watchlist</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8}}>
            {[{ticker:"PETR4",nome:"Petrobras",cat:"Petróleo",preco:39.20,pl:4.1,dy:12.3},{ticker:"HGLG11",nome:"CSHG Log.",cat:"FII",preco:155,pl:null,dy:8.9},{ticker:"ITUB4",nome:"Itaú",cat:"Banco",preco:34.5,pl:8.2,dy:5.1}].map(w=><div key={w.ticker} style={{background:D.bg3,borderRadius:10,padding:"10px 12px",border:`1px solid ${D.border}`,cursor:"pointer"}}>
              <p style={{margin:"0 0 1px",fontSize:12,fontWeight:700,color:D.green}}>{w.ticker}</p>
              <p style={{margin:"0 0 3px",fontSize:10,color:D.text3}}>{w.nome}</p>
              <Badge color={D.blue}>{w.cat}</Badge>
              <p style={{margin:"4px 0",fontSize:14,fontWeight:700,color:D.text}}>R$ {w.preco.toFixed(2)}</p>
              <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{w.pl&&<Badge color={D.blue}>P/L {w.pl}</Badge>}<Badge color={D.gold}>DY {w.dy}%</Badge></div>
            </div>)}
          </div>
        </Card>
        <Card>
          <p style={{fontSize:13,fontWeight:700,color:D.text,marginBottom:8}}>🔔 Alertas recentes</p>
          {[{ticker:"HGLG11",titulo:"Rendimento declarado",resumo:"HGLG11 declarou rendimento de R$ 1,10/cota para pagamento em 15/06.",tipo:"dividendo"},{ticker:"PETR4",titulo:"Resultados 1T26",resumo:"Petrobras reportou lucro de R$ 28bi no 1T26, acima das expectativas.",tipo:"resultado"}].map((n,i)=><div key={i} style={{background:D.bg3,borderRadius:8,padding:"8px 12px",marginBottom:6,borderLeft:`3px solid ${n.tipo==="dividendo"?D.green:D.blue}`}}><div style={{display:"flex",gap:6,marginBottom:2}}><span>{n.tipo==="dividendo"?"💰":"📊"}</span><span style={{fontSize:12,fontWeight:600,color:D.text}}>{n.titulo}</span><Badge color={D.green}>{n.ticker}</Badge></div><p style={{margin:0,fontSize:11,color:D.text2}}>{n.resumo}</p></div>)}
        </Card>
        <Card style={{border:`1px solid ${D.border}`}}>
          <p style={{fontSize:13,fontWeight:700,color:D.text,marginBottom:4}}>TradingView</p>
          <p style={{fontSize:11,color:D.text3,marginBottom:10}}>No app completo, os widgets de gráficos e screener carregam aqui em tempo real.</p>
          <div style={{background:D.bg3,borderRadius:10,height:120,display:"flex",alignItems:"center",justifyContent:"center",border:`1px dashed ${D.border2}`}}><p style={{color:D.text3,fontSize:12}}>📊 Gráfico TradingView (disponível no Vercel)</p></div>
        </Card>
      </div>}
    </div>
  );
}
