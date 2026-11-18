// Service worker: solo en HTTPS o localhost; no funciona desde file://.
if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost')) {
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
}
