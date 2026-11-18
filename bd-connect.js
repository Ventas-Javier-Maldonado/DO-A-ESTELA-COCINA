/* Barrio Digital: puente aislado y verificación de permisos por API de Supabase.
   Publica solamente publishable key, nunca service_role ni contraseñas.
   La aplicación cliente NO sustituye la validación RLS del servidor. */
window.BD = (() => {
  'use strict';
  const cfg=window.BD_CONFIG, BASE=cfg.supabaseUrl.replace(/\/$/,''), BIZ=cfg.negocioId;
  const TIMEOUT=10000, SESSION_KEY='bd_estela_session_v14';
  let session=null;
  try{session=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null')}catch(_e){}
  const query=(table,items)=>'/rest/v1/'+table+'?'+new URLSearchParams(items).toString();
  async function call(path,options={}){
    const controller=new AbortController(),tm=setTimeout(()=>controller.abort(),TIMEOUT);
    const headers={'apikey':cfg.publishableKey,'Content-Type':'application/json',...options.headers};
    if(session?.access_token)headers.Authorization='Bearer '+session.access_token;
    try{
      const res=await fetch(BASE+path,{...options,headers,signal:controller.signal,cache:'no-store'});
      const raw=await res.text();let data=null;
      try{data=raw?JSON.parse(raw):null}catch(_e){data=raw}
      if(!res.ok){throw Error(typeof data==='object' ? (data?.msg||data?.message||data?.error_description||data?.error||'HTTP '+res.status):'HTTP '+res.status)}
      return data;
    } finally{clearTimeout(tm)}
  }
  async function publicProducts(){
    const rows=await call(query('bd_productos',{select:'id,codigo,nombre,categoria,descripcion,precio,imagen_url,activo,disponible',negocio_id:'eq.'+BIZ,activo:'eq.true',order:'codigo.asc'}));
    if(!Array.isArray(rows))throw Error('Respuesta inesperada del catálogo');
    return rows;
  }
  async function publicPromotions(){
    return call(query('bd_promociones_flash',{select:'id,producto_id,titulo,descripcion,precio_promocion,imagen_url,inicia_en,termina_en,activa',negocio_id:'eq.'+BIZ,activa:'eq.true',order:'termina_en.asc'}));
  }
  const EMAIL_ALIAS={admin:'admin@gmail.com',cajera:'cajera@gmail.com',mesera1:'mesera1@gmail.com',mesera2:'mesero2@gmail.com'};
  async function identity(){
    if(!session?.access_token)return null;
    return call('/auth/v1/user');
  }
  async function roleFor(user){
    const own='eq.'+user.id, biz='eq.'+BIZ;
    const admin=await call(query('bd_administradores',{select:'usuario_id,rol,activo',usuario_id:own,negocio_id:biz,activo:'eq.true'}));
    if(admin?.some(a=>['administrador','propietario'].includes(a.rol))){
      return {role:'Administrador',permissions:['*'],user:user.id,verified:true,owner:admin.some(a=>a.rol==='propietario')};
    }
    const links=await call(query('bd_restaurante_accesos',{select:'nombre_usuario,estado,requiere_cambio_clave',usuario_id:own,negocio_id:biz}));
    const link=links?.[0];
    if(!link)throw Error('Este usuario no está vinculado con Doña Estela.');
    if(link.estado!=='activo')throw Error('La cuenta todavía está invitada o suspendida. No tiene acceso operativo.');
    if(link.requiere_cambio_clave)throw Error('Debes completar el cambio inicial de contraseña antes de operar.');
    const staff=await call(query('bd_restaurante_personal',{select:'rol,activo',usuario_id:own,negocio_id:biz}));
    if(!staff?.[0]?.activo)throw Error('El propietario no ha activado este empleado.');
    const p=await call(query('bd_restaurante_permisos',{select:'permiso,habilitado',usuario_id:own,negocio_id:biz,habilitado:'eq.true'}));
    const permitted=(p||[]).map(x=>x.permiso);
    if(!permitted.length)throw Error('El propietario todavía no ha autorizado funciones para esta cuenta.');
    return {role:staff[0].rol==='caja'?'Cajera':'Mesera',permissions:permitted,user:user.id,verified:true,owner:false};
  }
  async function signIn(name,password){
    const identifier=String(name||'').trim().toLowerCase(),email=EMAIL_ALIAS[identifier]||identifier;
    if(!email.includes('@'))throw Error('Escribe tu usuario autorizado o correo.');
    // Limpia sesiones anteriores; credenciales personales solo en memoria de la petición.
    session=null;try{sessionStorage.removeItem(SESSION_KEY)}catch(_e){}
    const auth=await call('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});
    session={access_token:auth.access_token,refresh_token:auth.refresh_token,expires_at:Date.now()+(auth.expires_in||3600)*1000};
    try{
      const user=await identity(),role=await roleFor(user);
      sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));return role;
    }catch(e){await signOut();throw e}
  }
  async function signOut(){const t=session?.access_token;session=null;try{sessionStorage.removeItem(SESSION_KEY)}catch(_e){}if(t){try{await fetch(BASE+'/auth/v1/logout',{method:'POST',headers:{apikey:cfg.publishableKey,Authorization:'Bearer '+t}})}catch(_e){}}}
  async function patchProduct(p){
    if(!session?.access_token)throw Error('Inicia sesión primero.');
    return call(query('bd_productos',{id:'eq.'+p.remoteId,negocio_id:'eq.'+BIZ}),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({nombre:p.name,categoria:p.cat,descripcion:p.description,precio:p.price,activo:p.active,disponible:p.active&&p.price!==null})});
  }
  async function resetPassword(email){
    const redirect=cfg.publicMenuUrl;
    return call('/auth/v1/recover',{method:'POST',body:JSON.stringify({email,redirect_to:redirect})});
  }
  return {cfg,publicProducts,publicPromotions,identity,signIn,signOut,patchProduct,resetPassword,roleFor};
})();
