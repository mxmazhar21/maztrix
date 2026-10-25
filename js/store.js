// store.js — sauvegarde de toutes mes données dans le localStorage du téléphone.
//
// Forme des données :
// {
//   reglages: { pdcKg, son, decompte },
//   seances: { "S2-lundi": { date, debut, fin, terminee, echauffement: { 0: true },
//              exercices: { 0: { id, type, role, series: { 0: { statut, reps, duree, chargeKg, rpe, ressenti, note, t } } } } } },
//   repos: { finA, plage, suivant, seanceId } | null   (chrono de repos en cours)
//   tentatives: [ { exId, date, duree, t } ]            (écran CHRONO, durée en secondes)
//   programme: { … }                                    (seulement si j'ai importé un programme.json)
// }

const CLE = 'maztrix-v1'; // changer le numéro si la forme des données change un jour

function vide() {
  return { reglages: { pdcKg: 69, son: true, decompte: false }, seances: {}, repos: null, tentatives: [] };
}

function lire() {
  const brut = localStorage.getItem(CLE);
  try {
    return { ...vide(), ...JSON.parse(brut) };
  } catch {
    // Données illisibles : on les met de côté au lieu de les écraser.
    localStorage.setItem(CLE + '-illisible', brut);
    return vide();
  }
}

export const etat = lire();

export function sauver() {
  localStorage.setItem(CLE, JSON.stringify(etat));
}

// Remplace toutes mes données (import d'une sauvegarde).
export function remplacer(donnees) {
  for (const cle of Object.keys(etat)) delete etat[cle];
  Object.assign(etat, vide(), donnees);
  sauver();
}

export function effacerTout() {
  localStorage.removeItem(CLE);
}

// Demande à iOS de ne pas effacer mes données quand le stockage est plein.
export function demanderPersistance() {
  navigator.storage?.persist?.();
}

// Parcourt toutes les séries enregistrées, toutes séances confondues.
function* toutesLesSeries() {
  for (const [seanceId, log] of Object.entries(etat.seances))
    for (const ex of Object.values(log.exercices))
      for (const serie of Object.values(ex.series)) yield { seanceId, ex, serie };
}

// Dernière charge enregistrée pour un exercice (sert à pré-remplir "S2 + 2,5 kg"…).
export function derniereCharge(exId) {
  let t = -1, kg;
  for (const { ex, serie } of toutesLesSeries())
    if (ex.id === exId && serie.chargeKg != null && (serie.t ?? 0) > t) { t = serie.t ?? 0; kg = serie.chargeKg; }
  return kg;
}

// Valeur qui compte pour les records : charge (lesté, charge), reps (PDC) ou secondes (tenue, course).
export function valeur(type, serie) {
  if (serie.statut !== 'fait' && serie.statut !== 'partiel') return undefined;
  if (type === 'leste' || type === 'charge') return serie.chargeKg;
  if (type === 'reps') return serie.reps;
  return serie.duree;
}

// Meilleure valeur de tous les temps pour un exercice, en ignorant une séance.
export function meilleur(exId, saufSeanceId) {
  let m;
  for (const { seanceId, ex, serie } of toutesLesSeries()) {
    if (seanceId === saufSeanceId || ex.id !== exId) continue;
    const v = valeur(ex.type, serie);
    if (v != null && (m == null || v > m)) m = v;
  }
  return m;
}

// Record personnel : séances + tentatives de l'écran CHRONO.
export function recordPerso(exId) {
  const valeurs = etat.tentatives.filter(t => t.exId === exId).map(t => t.duree);
  const m = meilleur(exId);
  if (m != null) valeurs.push(m);
  return valeurs.length ? Math.max(...valeurs) : undefined;
}

// Séries réussies d'un exercice regroupées par jour, pour les courbes : [{ date, series: [...] }]
export function seriesParDate(exId) {
  const parDate = {};
  for (const { seanceId, ex, serie } of toutesLesSeries())
    if (ex.id === exId && valeur(ex.type, serie) != null) (parDate[etat.seances[seanceId].date] ??= []).push(serie);
  for (const t of etat.tentatives)
    if (t.exId === exId) (parDate[t.date] ??= []).push({ statut: 'fait', duree: t.duree });
  return Object.keys(parDate).sort().map(date => ({ date, series: parDate[date] }));
}
