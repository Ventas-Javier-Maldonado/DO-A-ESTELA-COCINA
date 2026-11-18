/* Carga pública de catálogo y ofertas desde Barrio Digital. Si falla la red,
   conserva la demostración local y NO afirma que los pedidos se hayan sincronizado. */
(async function initBarrioDigital(){
  if(!window.BD)return;
  try{
    const rows=await BD.publicProducts();
    if(rows.length){
      const byId=new Map(data.products.map(p=>[p.id,p]));
      const products=[];
      for(const item of rows){
        const match=/^DE-(\d+)$/i.exec(String(item.codigo||''));
        if(!match)continue;const id=Number(match[1]);
        const original=byId.get(id)||{};
        if(item.disponible===false||item.precio===null)continue;
        products.push({...original,id,remoteId:item.id,cat:item.categoria,name:item.nombre,
          price:Number(item.precio),description:item.descripcion||'',
          imagen_url:item.imagen_url||'',active:true,available:true});
      }
      // Los tres platos sin precio confirmado permanecen visibles solo para consulta.
      for(const id of [21,35,36])if(byId.has(id)&&!products.some(x=>x.id===id)){
        const old=byId.get(id);products.push({...old,id,active:true,available:false,price:null});
      }
      products.sort((a,b)=>a.id-b.id);
      data.products=products;
      window.BD_CATALOGO_ESTADO='conectado';
      if(s.view==='menu')render();
    } else {window.BD_CATALOGO_ESTADO='sin resultados: verificar RLS';console.warn('Barrio Digital: catálogo público sin resultados. Manteniendo demo.');}
  }catch(error){window.BD_CATALOGO_ESTADO='sin conexión';console.warn('Barrio Digital: catálogo local de respaldo',error.message)}
  try{
    const promos=await BD.publicPromotions();
    const loaded=[];
    for(const [i,p] of (promos||[]).entries()){
      const prod=data.products.find(x=>x.remoteId===p.producto_id);
      if(!prod)continue;
      loaded.push({id:10000000+i,remoteId:p.id,productId:prod.id,
        price:Number(p.precio_promocion),start:p.inicia_en,end:p.termina_en,
        limit:99999,used:0,enabled:p.activa,notify:false});
    }
    // Solo las promociones confirmadas por el servidor sustituyen muestras locales.
    if(loaded.length){data.flashPromos=loaded;if(s.view==='menu')render();}
  }catch(error){console.warn('Promociones remotas no disponibles:',error.message)}
})();
