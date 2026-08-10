// ============================================================================
// Fotos de NF: fila local (IndexedDB) + upload para o Supabase Storage.
//
// POR QUE ESTE ARQUIVO EXISTE
// Até 08/08/2026 a foto da nota fiscal era um data-URL base64 guardado DENTRO
// de `transacoes[].nfImg`, ou seja, dentro da coluna `data` de `profiles`.
// Como `supa.load()` faz `select=data` sem filtro, todo carregamento de perfil
// baixava todas as fotos. Em 28-29/06/2026 UMA foto de 2,82MB era 99,2% do
// payload e cada boot custava 2,13MB — a causa raiz do estouro de egress de
// 29/06-11/07. Agora a imagem vive no Storage e o perfil guarda só `nfPath`.
//
// POR QUE IndexedDB E NÃO localStorage
// A cota de localStorage é ~5MB e é lá que mora o `all_profiles`. Enfileirar
// uma foto de 2,8MB lá dentro encheria o mesmo armazenamento do perfil: uma
// falha de quota corromperia os dados financeiros para salvar uma imagem.
// IndexedDB tem cota de outra ordem e é isolado disso.
// ============================================================================
const DB="nf_fila",STORE="pendentes",BUCKET="nf";
let _cfg=null;
export function configurarNf(cfg){_cfg=cfg;} // {url,key,getToken}

function abrir(){
  return new Promise((ok,err)=>{
    if(typeof indexedDB==="undefined")return err(new Error("sem IndexedDB"));
    const r=indexedDB.open(DB,1);
    r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:"chave"});};
    r.onsuccess=()=>ok(r.result);
    r.onerror=()=>err(r.error||new Error("IndexedDB indisponível"));
  });
}
function tx(db,modo,fn){
  return new Promise((ok,err)=>{
    const t=db.transaction(STORE,modo),s=t.objectStore(STORE);
    const req=fn(s);
    t.oncomplete=()=>ok(req?req.result:undefined);
    t.onerror=()=>err(t.error);
    t.onabort=()=>err(t.error||new Error("transação abortada"));
  });
}
const chaveDe=(uid,perfil,txId)=>`${uid}|${perfil}|${txId}`;

// Enfileira ANTES de qualquer limpeza do payload. Se isto falhar, quem chama
// NÃO pode remover a foto do perfil — perder a nota fiscal do usuário em
// silêncio é pior do que um payload gordo por mais um ciclo.
export async function enfileirar(uid,fotos){
  if(!fotos?.length)return 0;
  const db=await abrir();
  try{
    await tx(db,"readwrite",s=>{
      for(const f of fotos)s.put({chave:chaveDe(uid,f.perfil,f.txId),uid,perfil:f.perfil,txId:f.txId,dataUrl:f.dataUrl,ts:Date.now()});
    });
    return fotos.length;
  }finally{db.close();}
}
export async function listarPendentes(uid){
  const db=await abrir();
  try{const todos=await tx(db,"readonly",s=>s.getAll());return (todos||[]).filter(x=>x.uid===uid);}
  finally{db.close();}
}
export async function removerPendente(uid,perfil,txId){
  const db=await abrir();
  try{await tx(db,"readwrite",s=>s.delete(chaveDe(uid,perfil,txId)));}
  finally{db.close();}
}

function dataUrlParaBlob(du){
  const [cab,b64]=String(du).split(",");
  const mt=(cab.match(/data:([^;]+)/)||[])[1]||"image/jpeg";
  const bin=atob(b64||"");
  const buf=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)buf[i]=bin.charCodeAt(i);
  return new Blob([buf],{type:mt});
}
export const caminhoDe=(uid,perfil,txId,mt="image/jpeg")=>`${uid}/${perfil}/${txId}.${mt==="image/png"?"png":"jpg"}`;

// Sobe a imagem e devolve o PATH (nunca a URL: URL assinada expira e viraria
// dado podre gravado no banco).
export async function subir(uid,perfil,txId,dataUrl){
  if(!_cfg)throw new Error("nfstore não configurado");
  const blob=dataUrlParaBlob(dataUrl);
  const path=caminhoDe(uid,perfil,txId,blob.type);
  const t=await _cfg.getToken();
  const r=await fetch(`${_cfg.url}/storage/v1/object/${BUCKET}/${path}`,{
    method:"POST",
    headers:{apikey:_cfg.key,Authorization:`Bearer ${t}`,"Content-Type":blob.type,"x-upsert":"true"},
    body:blob,
  });
  if(!r.ok){const e=new Error("upload NF HTTP "+r.status);e.status=r.status;throw e;}
  return path;
}
// URL assinada, gerada só quando o usuário ABRE a foto. É isto que troca
// "todo boot baixa todas as fotos" por "só a foto que você clicou".
export async function urlAssinada(path,segundos=3600){
  if(!_cfg||!path)return null;
  const t=await _cfg.getToken();
  const r=await fetch(`${_cfg.url}/storage/v1/object/sign/${BUCKET}/${path}`,{
    method:"POST",
    headers:{apikey:_cfg.key,Authorization:`Bearer ${t}`,"Content-Type":"application/json"},
    body:JSON.stringify({expiresIn:segundos}),
  });
  if(!r.ok)return null;
  const j=await r.json();
  return j?.signedURL?`${_cfg.url}/storage/v1${j.signedURL}`:null;
}

// Drena a fila: sobe cada pendente e devolve os paths para quem chamar gravar
// no perfil. Não grava nada sozinho — quem conhece o `all_profiles` é o App.
export async function drenar(uid){
  const pend=await listarPendentes(uid).catch(()=>[]);
  const ok=[],falhou=[];
  for(const p of pend){
    try{
      const path=await subir(uid,p.perfil,p.txId,p.dataUrl);
      await removerPendente(uid,p.perfil,p.txId);
      ok.push({perfil:p.perfil,txId:p.txId,nfPath:path});
    }catch(e){falhou.push({perfil:p.perfil,txId:p.txId,erro:e?.status||e?.message});}
  }
  return {ok,falhou};
}
