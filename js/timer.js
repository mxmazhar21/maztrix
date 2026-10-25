// timer.js — chrono de repos, bip de fin et écran maintenu allumé.
import { etat, sauver } from './store.js';

// Secondes restantes, calculées depuis l'heure de fin (finA) et pas en comptant les secondes :
// le chrono reste juste même si l'iPhone a mis l'app en pause (écran verrouillé, arrière-plan).
export function restant(finA, maintenant = Date.now()) {
  return Math.max(0, Math.ceil((finA - maintenant) / 1000));
}

// 95 → "1:35"
export const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// --- Son ---------------------------------------------------------------
let audio;

// iOS n'autorise le son qu'après un tap : à appeler dans un clic (bouton FAIT…).
export function preparerSon() {
  audio ??= new AudioContext();
  audio.resume();
}

// Bips courts (3 par défaut, 1 pour le décompte du chrono).
export function bip(nombre = 3) {
  if (!etat.reglages.son || !audio) return;
  for (let k = 0; k < nombre; k++) {
    const t = audio.currentTime + k * 0.25;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.15);
  }
}

function flash() {
  const el = document.getElementById('flash');
  el.classList.add('on');
  setTimeout(() => el.classList.remove('on'), 150);
}

// --- Chrono de repos ----------------------------------------------------
const ecran = document.getElementById('repos');
let intervalle;

export function demarrerRepos(secondes, plage, suivant, seanceId) {
  etat.repos = { finA: Date.now() + secondes * 1000, plage, suivant, seanceId };
  sauver();
  afficherRepos();
}

// Affiche le repos en cours (aussi appelé au lancement de l'app et au retour d'arrière-plan).
export function afficherRepos() {
  if (!etat.repos) return;
  document.getElementById('repos-plage').textContent = etat.repos.plage;
  document.getElementById('repos-suivant').textContent = etat.repos.suivant;
  ecran.hidden = false;
  clearInterval(intervalle);
  intervalle = setInterval(tic, 250); // ne sert qu'à rafraîchir l'affichage
  tic();
}

function tic() {
  const s = restant(etat.repos.finA);
  document.getElementById('repos-temps').textContent = mmss(s);
  if (s === 0) {
    arreterRepos();
    bip();
    flash();
  }
}

export function arreterRepos() {
  clearInterval(intervalle);
  ecran.hidden = true;
  if (etat.repos) {
    etat.repos = null;
    sauver();
  }
}

ecran.addEventListener('click', e => {
  const action = e.target.closest('[data-repos]')?.dataset.repos;
  if (!action) return;
  if (action === 'passer') return arreterRepos();
  etat.repos.finA += Number(action) * 1000;
  sauver();
  tic();
});

// --- Écran allumé (Wake Lock) ----------------------------------------------
let verrou = null;

export async function ecranAllume(actif) {
  try {
    if (actif && !verrou && document.visibilityState === 'visible' && navigator.wakeLock) {
      verrou = await navigator.wakeLock.request('screen');
      verrou.addEventListener('release', () => (verrou = null)); // iOS le relâche en arrière-plan
    } else if (!actif && verrou) {
      await verrou.release();
    }
  } catch {
    // Refusé (mode économie d'énergie…) : l'écran s'éteindra normalement, rien de grave.
  }
}
