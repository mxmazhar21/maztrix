// program.js — lecture du programme (data/programme.json) et petits formats d'affichage.
import { etat } from './store.js';

// Charge le programme : celui importé dans les réglages s'il existe, sinon data/programme.json.
export async function chargerProgramme() {
  if (etat.programme) return etat.programme;
  const rep = await fetch('data/programme.json');
  return rep.json();
}

const TYPES = ['leste', 'charge', 'reps', 'tenue', 'course'];

// Vérifie un programme.json importé. Renvoie le problème trouvé, ou null s'il est bon.
export function erreurProgramme(p) {
  if (!Array.isArray(p?.semaines) || !p.semaines.length) return 'il manque la liste "semaines".';
  for (const sem of p.semaines) {
    if (typeof sem.id !== 'string' || typeof sem.nom !== 'string' || !Array.isArray(sem.seances))
      return `semaine mal formée (${sem.id ?? '?'}).`;
    for (const s of sem.seances) {
      if (typeof s.id !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.date) || typeof s.titre !== 'string' || !Array.isArray(s.exercices))
        return `séance mal formée (${s.id ?? '?'}) : il faut id, date "AAAA-MM-JJ", titre et exercices.`;
      for (const ex of s.exercices)
        if (typeof ex.id !== 'string' || typeof ex.nom !== 'string' || !TYPES.includes(ex.type) || !(ex.series >= 1))
          return `exercice mal formé dans ${s.id} (${ex.nom ?? '?'}) : il faut id, nom, type (${TYPES.join(', ')}) et series.`;
    }
  }
  return null;
}

// Toutes les séances à la suite, chacune avec sa semaine (s.semaine.nom…).
// Le JSON doit lister les séances dans l'ordre des dates.
export function toutesLesSeances(prog) {
  return prog.semaines.flatMap(sem => sem.seances.map(s => ({ ...s, semaine: sem })));
}

export const seanceDuJour = (seances, iso) => seances.find(s => s.date === iso) ?? null;
export const prochaineSeance = (seances, iso) => seances.find(s => s.date > iso) ?? null;

// Date du jour en "AAAA-MM-JJ", en heure locale (toISOString donnerait l'heure UTC).
export function dateISO(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

// "2026-10-26" → "lundi 26/10"
export function jourCourt(iso) {
  const [a, m, j] = iso.split('-').map(Number);
  return `${JOURS[new Date(a, m - 1, j).getDay()]} ${String(j).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

// 37.5 → "37,5"
export const nombre = n => String(n).replace('.', ',');

// Charge affichée en gros : lesté → "+45 kg" (0 → "PDC"), charge → "32,5 kg".
export function chargeTexteCourt(type, kg) {
  if (kg == null) return '—';
  if (type === 'leste') return kg === 0 ? 'PDC' : `+${nombre(kg)} kg`;
  return `${nombre(kg)} kg`;
}

// Durée en secondes → "45–60 s" ou "4–5 min".
export function dureeTexte(a, b = a) {
  const enMin = a >= 120 && a % 60 === 0 && b % 60 === 0;
  const f = x => (enMin ? x / 60 : x);
  return (a === b ? f(a) : `${f(a)}–${f(b)}`) + (enMin ? ' min' : ' s');
}

export const reposTexte = ex => (ex.reposMin == null ? '—' : dureeTexte(ex.reposMin, ex.reposMax));

// Prescription : "3×3", "4×2 + 1×max", "8 × 10–20 s", "20–25 min", "6 tentatives".
export function repsTexte(ex) {
  if (ex.derniereSerieMax) return `${ex.series - 1}×${ex.reps} + 1×max`;
  if (ex.reps) return `${ex.series}×${ex.reps}`;
  if (ex.type === 'course') return dureeTexte(ex.dureeMin, ex.dureeMax);
  if (ex.dureeMin) return `${ex.series} × ${dureeTexte(ex.dureeMin, ex.dureeMax)}`;
  return `${ex.series} tentatives`;
}
