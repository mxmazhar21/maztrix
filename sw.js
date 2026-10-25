// sw.js — service worker : garde l'app en cache pour qu'elle marche sans réseau.
//
// IMPORTANT : après avoir modifié un fichier de l'app, change le numéro (maztrix-v2, v3…)
// sinon l'iPhone continue d'utiliser les anciens fichiers gardés en cache.
const CACHE = 'maztrix-v2';

const FICHIERS = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/app.js',
  'js/store.js',
  'js/timer.js',
  'js/charts.js',
  'js/program.js',
  'data/programme.json',
  'assets/fonts/anton.woff2',
  'assets/fonts/inter.woff2',
  'assets/icons/icon-180.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
];

// Installation : on télécharge tous les fichiers dans le cache.
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

// Activation : on supprime les caches des anciennes versions.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(noms => Promise.all(noms.filter(nom => nom !== CACHE).map(nom => caches.delete(nom))))
      .then(() => self.clients.claim()),
  );
});

// Cache d'abord, réseau ensuite. ignoreSearch : index.html?date=… sert le même fichier.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(rep => rep || fetch(e.request)));
});
