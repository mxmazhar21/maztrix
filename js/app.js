// app.js — point d'entrée : présentation, onglets, accueil → semaine → jour → séance.
import {
  chargerProgramme, erreurProgramme, toutesLesSeances, seanceDuJour, prochaineSeance, dateISO, jourCourt,
  nombre, chargeTexteCourt, dureeTexte, reposTexte, repsTexte,
} from './program.js';
import {
  etat, sauver, remplacer, effacerTout, demanderPersistance, derniereCharge, valeur, meilleur, recordPerso, seriesParDate,
} from './store.js';
import { demarrerRepos, afficherRepos, arreterRepos, preparerSon, ecranAllume, bip } from './timer.js';
import { courbe } from './charts.js';

// Pour tester un autre jour : index.html?date=2026-10-26
const dateForcee = new URLSearchParams(location.search).get('date');
let aujourdhui = dateForcee || dateISO();

const prog = await chargerProgramme();
const seances = toutesLesSeances(prog);
let onglet = 'seance';
let semaineId = null; // semaine ouverte (null = accueil)
let ouverteId = null; // séance ouverte (null = liste)
const annulations = []; // états précédents, pour « Annuler la dernière action »

// Exercices de type tenue, sans doublon : ce sont les choix de l'écran CHRONO.
const tenues = [...new Map(seances.flatMap(s => s.exercices)
  .filter(ex => ex.type === 'tenue').map(ex => [ex.id, ex.nom])).entries()];
let chronoExId = tenues[0]?.[0];
let progresExId = 'traction-lestee';
let chrono = null; // { departA, dernierChiffre } pendant un décompte ou une tentative
let retourSerie = null; // { seanceId, i, j } quand le chrono a été ouvert depuis une série
let animation;
let ecranAffiche = ''; // pour le fondu entre deux écrans

// Un repos était en cours quand l'app a été fermée : on rouvre directement cette séance.
if (etat.repos?.seanceId) ouvrir(etat.repos.seanceId, false);

const vue = document.getElementById('vue');

const STATUTS = [['fait', 'Fait'], ['partiel', 'Partiel'], ['rate', 'Raté'], ['saute', 'Sauté']];
const RESSENTIS = ['RAPIDE', 'DUR', 'GRIND'];

// --- Rendu --------------------------------------------------------------

function rendre() {
  for (const b of document.querySelectorAll('[data-onglet]'))
    b.toggleAttribute('aria-current', b.dataset.onglet === onglet);
  const vues = { seance: vueSeance, programme: vueProgramme, chrono: vueChrono, progres: vueProgres, reglages: vueReglages };
  vue.innerHTML = vues[onglet]();
  vue.dataset.vue = onglet; // choisit la photo d'en-tête (css)
  const ecran = [onglet, semaineId, ouverteId, !!retourSerie].join('|');
  if (ecran !== ecranAffiche) {
    ecranAffiche = ecran;
    vue.classList.remove('entree');
    void vue.offsetWidth; // relance l'animation
    vue.classList.add('entree');
  }
  cancelAnimationFrame(animation);
  if (onglet === 'chrono' && chrono) animer();
  ecranAllume(seanceActive() || !!chrono);
}

// Une séance est « active » quand elle est commencée et pas terminée : l'écran reste allumé.
function seanceActive() {
  const log = etat.seances[ouverteId];
  return !!log && !log.terminee;
}

// Protège le texte que je tape (notes) avant de l'insérer dans la page.
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const retour = (texte, action = 'retour') => `<button class="retour" data-action="${action}">‹ ${texte}</button>`;

// À faire / En cours / Faite / Partielle
function statutSeance(s) {
  const log = etat.seances[s.id];
  if (!log) return 'À faire';
  if (!log.terminee) return 'En cours';
  const complete = s.exercices.every((ex, i) => ex.optionnel ||
    Array.from({ length: ex.series }, (_, j) => log.exercices[i]?.series[j]?.statut).every(st => st === 'fait'));
  return complete ? 'Faite' : 'Partielle';
}

function vueSeance() {
  if (ouverteId) return vueUneSeance();
  if (semaineId) return vueSemaine();
  return vueAccueil();
}

function vueAccueil() {
  const duJour = seanceDuJour(seances, aujourdhui);
  const prochaine = prochaineSeance(seances, aujourdhui);
  const cible = duJour ?? prochaine;
  const semaines = prog.semaines.map(sem => {
    const faites = sem.seances.filter(s => etat.seances[s.id]?.terminee).length;
    const debut = jourCourt(sem.seances[0].date).split(' ')[1];
    const fin = jourCourt(sem.seances.at(-1).date).split(' ')[1];
    return `
      <button class="ligne" data-action="semaine" data-id="${sem.id}">
        <span class="ligne-sur">${debut === fin ? debut : `${debut} → ${fin}`}</span>
        <span class="ligne-titre">${sem.nom}</span>
        <span class="ligne-statut">${faites}/${sem.seances.length} faites</span>
      </button>`;
  }).join('');
  return `
    <header class="tete">
      <p class="surtitre">${jourCourt(aujourdhui)}</p>
      <h1 class="titre">${duJour ? duJour.titre : 'Repos'}</h1>
      ${cible ? `<button class="bouton primaire" data-action="ouvrir" data-id="${cible.id}">
          ${duJour ? 'Commencer la séance du jour' : `Prochaine : ${jourCourt(cible.date)} — ${cible.titre}`}</button>`
        : `<p class="consigne">Programme terminé.</p>`}
    </header>
    <h2 class="section">Semaines</h2>
    ${semaines}`;
}

function vueSemaine() {
  const sem = prog.semaines.find(x => x.id === semaineId);
  const jours = seances.filter(s => s.semaine.id === semaineId).map(s => `
    <button class="ligne" data-action="ouvrir" data-id="${s.id}">
      <span class="ligne-sur">${jourCourt(s.date)}${s.date === aujourdhui ? ' · Aujourd\'hui' : ''}</span>
      <span class="ligne-titre">${s.titre}</span>
      <span class="ligne-statut">${statutSeance(s)}</span>
    </button>`).join('');
  return `
    ${retour('Accueil')}
    <header class="tete"><h1 class="titre">${sem.nom}</h1></header>
    ${jours}`;
}

function vueUneSeance() {
  const s = seances.find(x => x.id === ouverteId);
  const log = etat.seances[s.id];
  return `
    ${retour(s.semaine.nom)}
    <header class="tete">
      <p class="surtitre">${s.semaine.nom} · ${jourCourt(s.date)}</p>
      <h1 class="titre">${s.titre}</h1>
      ${s.consigne ? `<p class="consigne">${s.consigne}</p>` : ''}
    </header>
    ${log?.terminee ? recap(s, log) : ''}
    ${conseilOuverture(s)}
    ${echauffement(s, log)}
    ${s.exercices.map((ex, i) => carte(s, ex, i, log)).join('')}
    <div class="barre-fin">
      <button class="bouton" data-action="annuler" ${annulations.length ? '' : 'disabled'}>Annuler la dernière action</button>
      <button class="bouton primaire" data-action="terminer">Terminer la séance</button>
    </div>`;
}

function echauffement(s, log) {
  if (!s.echauffement?.length) return '';
  const coches = s.echauffement.filter((_, k) => log?.echauffement[k]).length;
  return `
    <details class="echauffement">
      <summary>Échauffement <span class="compte">${coches}/${s.echauffement.length}</span></summary>
      ${s.echauffement.map((t, k) => `
        <label class="coche"><input type="checkbox" data-champ="echauffement" data-k="${k}" ${log?.echauffement[k] ? 'checked' : ''}> ${t}</label>`).join('')}
    </details>`;
}

const avecCharge = ex => ex.type === 'leste' || ex.type === 'charge';

// Charge proposée : la prescrite si elle est chiffrée, sinon la dernière que j'ai faite.
const chargeProposee = ex => ex.chargeKg ?? derniereCharge(ex.id);

function carte(s, ex, i, log) {
  const gros = ex.chargeKg != null ? chargeTexteCourt(ex.type, ex.chargeKg) : '';
  const infos = [ex.chargeTexte !== gros && ex.chargeTexte, `Repos ${reposTexte(ex)}`].filter(Boolean).join(' · ');
  const series = Array.from({ length: ex.series }, (_, j) => ligneSerie(ex, i, j, log?.exercices[i]?.series[j] ?? {}));
  return `
    <article class="exo${ex.optionnel ? ' optionnel' : ''}">
      <h2 class="exo-nom">${ex.nom}${ex.optionnel ? ' <span class="tag">Optionnel</span>' : ''}</h2>
      <p class="exo-presc"><span>${repsTexte(ex)}</span>${gros ? `<span>${gros}</span>` : ''}</p>
      <p class="exo-infos">${infos}</p>
      ${ex.consigne ? `<p class="exo-consigne">${ex.consigne}</p>` : ''}
      ${conseilBackoff(s, ex, log)}
      <ol class="series">${series.join('')}</ol>
    </article>`;
}

// Difficulté de la série, sur l'échelle RPE 6 à 10 (RPE 8 = 2 reps en réserve).
const MOTS = { 6: 'Facile', 7: 'Moyen', 8: 'Dur', 9: 'Très dur', 10: 'Max' };
const difficulteTexte = v => `${MOTS[Math.floor(v)]} · ${nombre(10 - v)} en réserve`;

function barreDifficulte(r, d) {
  const v = r.rpe ?? 6;
  return `
    <label class="difficulte${r.rpe == null ? ' non-note' : ''}" data-niv="${Math.floor(v)}" style="--p:${(v - 6) * 25}%">
      <span class="difficulte-tete"><span>Difficulté</span>
        <strong class="difficulte-texte">${r.rpe == null ? 'Glisse pour noter' : difficulteTexte(v)}</strong></span>
      <input type="range" min="6" max="10" step="0.5" value="${v}" data-champ="rpe" ${d}>
    </label>`;
}

function ligneSerie(ex, i, j, r) {
  const d = `data-i="${i}" data-j="${j}"`;
  const max = ex.derniereSerieMax && j === ex.series - 1;
  const cible = max ? 'max' : ex.reps ? `${ex.reps} reps` : ex.dureeMin ? dureeTexte(ex.dureeMin, ex.dureeMax) : '';

  // Champ « réalisé » : reps (partiel ou série max) ou durée (tenue, course).
  let realise = '';
  if (ex.type === 'tenue')
    realise = champ('Secondes', 'duree', r.duree ?? (r.statut === 'partiel' ? '' : ex.dureeMin ?? ''), d)
      + `<button class="vers-chrono" data-action="vers-chrono" ${d}>Chrono</button>`;
  else if (ex.type === 'course')
    realise = champ('Minutes', 'dureeMinutes', r.duree != null ? r.duree / 60 : ex.dureeMin / 60, d);
  else if (r.statut === 'partiel' || max)
    realise = champ('Reps réalisées', 'reps', r.reps ?? '', d);

  const charge = avecCharge(ex) ? `
    <div class="stepper">
      <button data-action="charge" data-v="-2.5" ${d} aria-label="Moins 2,5 kg">−</button>
      <label><span>${ex.type === 'leste' ? 'Lest kg' : 'Charge kg'}</span>
        <input data-champ="chargeKg" ${d} inputmode="decimal" value="${nombre(r.chargeKg ?? chargeProposee(ex) ?? '')}"></label>
      <button data-action="charge" data-v="2.5" ${d} aria-label="Plus 2,5 kg">+</button>
    </div>` : '';

  const ressenti = ex.role === 'top' || ex.role === 'single' ? `
    <div class="ressentis">${RESSENTIS.map(v =>
      `<button data-action="ressenti" data-v="${v}" ${d} aria-pressed="${r.ressenti === v}">${v}</button>`).join('')}</div>` : '';

  return `
    <li id="serie-${i}-${j}" class="serie${r.statut ? ' etat-' + r.statut : ''}">
      <div class="serie-tete"><span>Série ${j + 1}</span><span class="cible">${cible}</span></div>
      <div class="statuts">${STATUTS.map(([v, l]) =>
        `<button class="st-${v}" data-action="statut" data-v="${v}" ${d} aria-pressed="${r.statut === v}">${l}</button>`).join('')}</div>
      ${charge}
      ${realise ? `<div class="champs">${realise}</div>` : ''}
      ${barreDifficulte(r, d)}
      ${ressenti}
      <input class="note" data-champ="note" ${d} value="${esc(r.note ?? '')}" placeholder="Note">
    </li>`;
}

const champ = (libelle, nom, val, d) =>
  `<label class="champ"><span>${libelle}</span><input data-champ="${nom}" ${d} inputmode="numeric" value="${val}"></label>`;

// Règle : top set en GRIND → −2,5 kg sur les back-off du jour.
function conseilBackoff(s, ex, log) {
  if (ex.role !== 'backoff' || !log) return '';
  const grind = s.exercices.some((t, k) => t.id === ex.id && t.role === 'top' &&
    Object.values(log.exercices[k]?.series ?? {}).some(r => r.ressenti === 'GRIND'));
  return grind ? `<p class="conseil">Top set en GRIND : −2,5 kg conseillé, soit ${chargeTexteCourt(ex.type, ex.chargeKg - 2.5)}.</p>` : '';
}

// Règle d'ouverture du Test PR, selon le ressenti du top single de la S3.
// shortcut: ids et charges propres au cycle +52,5 ; à adapter si un prochain cycle a un autre test.
function conseilOuverture(s) {
  if (s.id !== 'TEST-lundi') return '';
  const top = Object.values(etat.seances['S3-lundi']?.exercices ?? {}).find(e => e.role === 'top');
  const ressenti = Object.values(top?.series ?? {}).find(r => r.ressenti)?.ressenti;
  const textes = {
    RAPIDE: 'Single S3 rapide : tentative 1 à +52,5 kg.',
    DUR: 'Single S3 dur : tentative 1 à +50 kg, puis +52,5 kg.',
    GRIND: 'Single S3 en GRIND : tentative 1 à +50 kg, puis +52,5 kg.',
  };
  return `<p class="conseil">${textes[ressenti] ?? 'Ressenti du single S3 non noté. ' + (prog.regles?.[1] ?? '')}</p>`;
}

function recap(s, log) {
  const n = { fait: 0, partiel: 0, rate: 0, saute: 0 };
  const meilleurs = {}; // meilleure valeur de chaque exercice dans cette séance
  for (const e of Object.values(log.exercices))
    for (const r of Object.values(e.series)) {
      if (r.statut) n[r.statut]++;
      const v = valeur(e.type, r);
      if (v != null && !(meilleurs[e.id]?.v >= v)) meilleurs[e.id] = { v, type: e.type };
    }
  const unite = (type, v) => (type === 'reps' ? `${v} reps` : type === 'tenue' || type === 'course' ? dureeTexte(v) : chargeTexteCourt(type, v));
  const records = Object.entries(meilleurs)
    .filter(([id, { v }]) => { const avant = meilleur(id, s.id); return avant != null && v > avant; })
    .map(([id, { v, type }]) => `<li>${s.exercices.find(e => e.id === id).nom} : ${unite(type, v)}</li>`);
  return `
    <section class="recap">
      <h2 class="exo-nom">Séance terminée</h2>
      <div class="recap-chiffres">
        <p><strong>${n.fait}</strong>faites</p><p><strong>${n.partiel}</strong>partielles</p>
        <p><strong>${n.rate}</strong>ratées</p><p><strong>${n.saute}</strong>sautées</p>
      </div>
      ${records.length ? `<p>Records battus</p><ul>${records.join('')}</ul>` : '<p class="exo-infos">Aucun record battu.</p>'}
    </section>`;
}

// --- Écran CHRONO (handstand et tenues) ----------------------------------

// 12345 ms → "12,3" ; 65400 ms → "1:05,4"
function chronoTexte(ms) {
  const dixiemes = Math.floor(ms / 100);
  const s = Math.floor(dixiemes / 10) % 60, m = Math.floor(dixiemes / 600);
  return m ? `${m}:${String(s).padStart(2, '0')},${dixiemes % 10}` : `${s},${dixiemes % 10}`;
}

const secondes = v => (Number.isFinite(v) && v > 0 ? `${nombre(v)} s` : '—');

function vueChrono() {
  if (!chronoExId) return `<p class="vide">Aucun exercice de tenue dans le programme.</p>`;
  const duJour = etat.tentatives.filter(t => t.exId === chronoExId && t.date === aujourdhui);
  const s = retourSerie && seances.find(x => x.id === retourSerie.seanceId);
  const libelle = !chrono ? 'Démarrer' : Date.now() < chrono.departA ? 'Annuler' : 'Arrêter';
  return `
    ${s ? `${retour(s.titre, 'retour-seance')}
      <p class="conseil">Le temps ira dans : ${s.exercices[retourSerie.i].nom} — série ${retourSerie.j + 1}</p>`
      : `<header class="tete"><h1 class="titre">Chrono</h1></header>`}
    <label class="champ"><span>Exercice</span>
      <select id="chrono-exo" ${chrono || s ? 'disabled' : ''}>${tenues.map(([id, nom]) =>
        `<option value="${id}" ${id === chronoExId ? 'selected' : ''}>${nom}</option>`).join('')}</select>
    </label>
    <div id="chrono-temps" class="chrono-temps">${chronoTexte(0)}</div>
    <p class="chrono-record">Record ${secondes(recordPerso(chronoExId))} · Aujourd'hui ${secondes(Math.max(...duJour.map(t => t.duree)))}</p>
    <button id="chrono-bouton" class="bouton chrono-bouton${chrono ? ' en-cours' : ''}">${libelle}</button>
    <label class="interrupteur-ligne reglage">Décompte 3-2-1
      <input type="checkbox" class="interrupteur" data-champ="decompte" ${etat.reglages.decompte ? 'checked' : ''}></label>
    <h2 class="section">Tentatives du jour</h2>
    ${duJour.length
      ? `<ol class="tentatives">${duJour.map((t, k) => `<li><span>#${k + 1}</span><strong>${secondes(t.duree)}</strong></li>`).reverse().join('')}</ol>`
      : `<p class="exo-infos">Aucune tentative aujourd'hui.</p>`}`;
}

// Rafraîchit l'affichage ; le temps vient toujours de l'heure de départ (juste même en arrière-plan).
function animer() {
  const el = document.getElementById('chrono-temps');
  if (!chrono || !el) return;
  const ms = Date.now() - chrono.departA;
  if (ms < 0) {
    const chiffre = Math.ceil(-ms / 1000); // décompte 3, 2, 1
    el.textContent = chiffre;
    if (chiffre !== chrono.dernierChiffre) {
      chrono.dernierChiffre = chiffre;
      bip(1);
    }
  } else {
    if (chrono.dernierChiffre) { // fin du décompte : top départ
      chrono.dernierChiffre = 0;
      bip(1);
      document.getElementById('chrono-bouton').textContent = 'Arrêter';
    }
    el.textContent = chronoTexte(ms);
  }
  animation = requestAnimationFrame(animer);
}

function toucherZone() {
  if (!chrono) {
    preparerSon();
    chrono = { departA: Date.now() + (etat.reglages.decompte ? 3000 : 0) };
    return rendre();
  }
  const ms = Date.now() - chrono.departA;
  chrono = null;
  if (ms <= 0) return rendre(); // arrêté pendant le décompte : rien n'est enregistré

  const duree = Math.round(ms / 100) / 10;
  etat.tentatives.push({ exId: chronoExId, date: aujourdhui, duree, t: Date.now() });
  sauver();
  if (!retourSerie) return rendre();

  // Ouvert depuis une série : le temps part dans la série, puis retour à la séance.
  const { i, j } = retourSerie;
  const s = seances.find(x => x.id === retourSerie.seanceId);
  retourSerie = null;
  onglet = 'seance';
  modifier(s, log => (serieDe(log, s.exercices[i], i, j).duree = Math.round(duree)));
  document.getElementById(`serie-${i}-${j}`)?.scrollIntoView({ block: 'center' });
}

// Le bouton réagit dès que le doigt le touche (pas au relâché) : le temps est plus juste.
vue.addEventListener('pointerdown', e => {
  if (!e.target.closest('#chrono-bouton')) return;
  e.preventDefault();
  toucherZone();
});

// --- Écran PROGRAMME (lecture) ----------------------------------------------

function vueProgramme() {
  const regles = (prog.regles ?? []).map(r => `<li>${r}</li>`).join('');
  const semaines = prog.semaines.map(sem => `
    <h2 class="section">${sem.nom}</h2>
    ${seances.filter(s => s.semaine.id === sem.id).map(s => `
      <button class="ligne" data-action="ouvrir" data-id="${s.id}">
        <span class="ligne-sur">${jourCourt(s.date)}</span>
        <span class="ligne-titre">${s.titre}</span>
        <span class="ligne-statut">${statutSeance(s)}</span>
        <span class="ligne-detail">${s.exercices.map(ex => `${ex.nom} · ${repsTexte(ex)} · ${ex.chargeTexte}`).join('<br>')}</span>
      </button>`).join('')}`).join('');
  return `
    <header class="tete">
      ${prog.objectif ? `<p class="surtitre">Objectif ${prog.objectif}</p>` : ''}
      <h1 class="titre">Programme</h1>
    </header>
    ${regles ? `<details class="echauffement"><summary>Règles du programme</summary><ul class="regles">${regles}</ul></details>` : ''}
    ${semaines}`;
}

// --- Écran PROGRÈS ------------------------------------------------------------

// Tous les exercices connus : ceux du programme, plus ceux d'anciens cycles présents dans l'historique.
function exercicesConnus() {
  const connus = new Map();
  for (const ex of seances.flatMap(s => s.exercices))
    if (!connus.has(ex.id)) connus.set(ex.id, { nom: ex.nom.split(' — ')[0], type: ex.type });
  for (const e of Object.values(etat.seances).flatMap(log => Object.values(log.exercices)))
    if (!connus.has(e.id)) connus.set(e.id, { nom: e.nom ?? e.id, type: e.type });
  return connus;
}

const arrondi = v => Math.round(v * 10) / 10;
const enLest = v => chargeTexteCourt('leste', arrondi(v));
const enKg = v => `${nombre(arrondi(v))} kg`;
const FORMATS = {
  leste: enLest,
  charge: enKg,
  reps: v => `${v} reps`,
  tenue: v => `${nombre(v)} s`,
  course: v => `${nombre(Math.round(v / 60))} min`,
};

// Calculs sur les séries d'un jour : la plus grande valeur, ou la somme.
const plusGrand = f => series => { const v = series.map(f).filter(Number.isFinite); return v.length ? Math.max(...v) : undefined; };
const somme = f => series => { const v = series.map(f).filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) : undefined; };

// 1RM estimé (Epley) sur PDC + lest, ramené en lest pour être comparable à l'objectif.
function unRmEnLest(r) {
  if (!(r.reps > 0) || r.chargeKg == null) return undefined;
  const pdc = etat.reglages.pdcKg;
  return (pdc + r.chargeKg) * (r.reps === 1 ? 1 : 1 + r.reps / 30) - pdc;
}

// Un graphique par unité (jamais deux échelles sur un même graphique).
const GRAPHIQUES = {
  leste: [{ titre: 'Lest max et 1RM estimé', format: enLest,
    series: [['Lest max', plusGrand(r => r.chargeKg)], ['1RM estimé', plusGrand(unRmEnLest)]] }],
  charge: [
    { titre: 'Charge max', format: enKg, series: [['Charge max', plusGrand(r => r.chargeKg)]] },
    { titre: 'Volume (charge × reps)', format: enKg, series: [['Volume', somme(r => r.chargeKg * r.reps)]] },
  ],
  reps: [{ titre: 'Total de reps', format: FORMATS.reps, series: [['Total de reps', somme(r => r.reps)]] }],
  tenue: [{ titre: 'Meilleure tenue', format: FORMATS.tenue, series: [['Meilleure tenue', plusGrand(r => r.duree)]] }],
  course: [{ titre: 'Durée', format: FORMATS.course, series: [['Durée', plusGrand(r => r.duree)]] }],
};

function vueProgres() {
  const connus = exercicesConnus();
  if (!connus.has(progresExId)) progresExId = connus.keys().next().value;
  const { type } = connus.get(progresExId);
  const jours = seriesParDate(progresExId);
  // shortcut: l'objectif du programme s'applique aux tractions lestées ; à généraliser si un cycle vise un autre exercice.
  const objectif = progresExId === 'traction-lestee' && prog.objectifKg != null
    ? { y: prog.objectifKg, texte: `Objectif ${enLest(prog.objectifKg)}` } : null;

  const graphiques = GRAPHIQUES[type].map(g => `
    <section class="exo">
      <h2 class="exo-nom">${g.titre}</h2>
      ${courbe({
        format: g.format,
        objectif: g.series.length > 1 ? objectif : null,
        series: g.series.map(([nom, f]) => ({
          nom,
          points: jours.map(j => ({ date: j.date, y: f(j.series) })).filter(p => p.y != null),
        })),
      })}
      ${type === 'leste' ? `<p class="exo-infos">1RM estimé : formule d'Epley sur PDC (${nombre(etat.reglages.pdcKg)} kg) + lest, exprimé en lest.</p>` : ''}
    </section>`).join('');

  const records = [...connus].map(([id, ex]) => [ex, recordPerso(id)]).filter(([, v]) => v != null)
    .map(([ex, v]) => `<li><span>${ex.nom}</span><strong>${FORMATS[ex.type](v)}</strong></li>`).join('');

  return `
    <header class="tete"><h1 class="titre">Progrès</h1></header>
    <label class="champ"><span>Exercice</span>
      <select id="progres-exo">${[...connus].map(([id, ex]) =>
        `<option value="${id}" ${id === progresExId ? 'selected' : ''}>${ex.nom}</option>`).join('')}</select>
    </label>
    ${graphiques}
    <h2 class="section">Records personnels</h2>
    ${records ? `<ul class="tentatives">${records}</ul>` : `<p class="exo-infos">Aucun record pour l'instant.</p>`}`;
}

// --- Réglages ------------------------------------------------------------------

function vueReglages() {
  const r = etat.reglages;
  return `
    <header class="tete"><h1 class="titre">Réglages</h1></header>
    <section class="exo">
      <label class="champ"><span>Poids de corps (kg)</span>
        <input data-reglage="pdcKg" inputmode="decimal" value="${nombre(r.pdcKg)}"></label>
      <label class="interrupteur-ligne reglage">Bip à la fin du repos
        <input type="checkbox" class="interrupteur" data-reglage="son" ${r.son ? 'checked' : ''}></label>
    </section>
    <section class="exo">
      <h2 class="exo-nom">Sauvegarde</h2>
      <button class="bouton" data-action="exporter">Exporter mes données</button>
      <label class="bouton">Importer une sauvegarde
        <input class="cache" type="file" accept=".json,application/json" data-fichier="sauvegarde"></label>
    </section>
    <section class="exo">
      <h2 class="exo-nom">Programme</h2>
      <p class="exo-infos">Actuel : ${prog.nom ?? 'sans nom'}${etat.programme ? ' (importé)' : ''}. Mon historique est gardé quand je change de programme.</p>
      <label class="bouton">Importer un programme.json
        <input class="cache" type="file" accept=".json,application/json" data-fichier="programme"></label>
      <p class="exo-infos">Pour un nouveau cycle : copie ce prompt, colle ton programme à la fin et donne-le à Claude.
        Il te rendra un programme.json à importer ici.</p>
      <button class="bouton" data-action="copier-prompt">Copier le prompt</button>
      <details class="g-tableau"><summary>Voir le prompt</summary>
        <textarea id="prompt-programme" class="prompt" readonly rows="14">${esc(promptProgramme())}</textarea>
      </details>
    </section>
    <section class="exo">
      <h2 class="exo-nom">Réinitialiser</h2>
      <button class="bouton danger" data-action="reinitialiser">Effacer toutes mes données</button>
    </section>`;
}

// Prompt à donner à Claude avec un nouveau programme, pour recevoir un programme.json au bon format.
// La liste des id vient de l'app : les graphiques continuent d'un cycle à l'autre.
function promptProgramme() {
  const ids = [...exercicesConnus()].map(([id, ex]) => `- ${id} : ${ex.nom} (${ex.type})`).join('\n');
  return `Convertis mon nouveau programme d'entraînement (collé à la fin) en fichier programme.json pour mon app Maztrix.

RÈGLES
- Ne change aucune valeur : séries, reps, charges, repos et consignes sont recopiés tels quels.
- Si une information est ambiguë, pose-moi la question avant de produire le fichier.
- Réponds avec le JSON complet dans un seul bloc de code (et en fichier programme.json téléchargeable si tu peux), puis un tableau récapitulatif semaine / jour / exercice / séries×reps / charge / repos pour que je vérifie.

FORMAT DU FICHIER
{
  "version": 1,
  "nom": "Nom du cycle",
  "objectif": "+55 kg le 14/12",
  "objectifKg": 55,
  "regles": ["Règle 1", "Règle 2"],
  "semaines": [
    { "id": "S1", "nom": "Semaine 1", "seances": [
      { "id": "S1-lundi", "date": "2026-11-23", "titre": "Force traction", "consigne": "Facile, RPE 6–7",
        "echauffement": ["Traction PDC ×5", "Traction +15 kg ×3"],
        "exercices": [ … ] }
    ] }
  ]
}
- objectifKg : lest visé aux tractions lestées (ligne d'objectif du graphique), ou null.
- regles : notes du programme affichées dans l'onglet PROGRAMME ([] s'il n'y en a pas).

SÉANCES
- id unique (ex. "S1-lundi"), date au format "AAAA-MM-JJ", séances rangées dans l'ordre des dates.
- Les jours de repos n'ont pas de séance : ne les mets pas.
- Ce qui est entre parenthèses dans un titre va dans "consigne" : « Traction (facile, RPE 6–7) » → titre "Traction", consigne "Facile, RPE 6–7".
- echauffement : une ligne par étape ([] s'il n'y en a pas). « Identique au mardi » → recopie la liste complète.

EXERCICES
- id : identifiant stable, en minuscules avec des tirets. Réutilise EXACTEMENT un id de la liste plus bas quand c'est le même exercice, sinon mes graphiques de progression ne se suivent pas. Nouvel exercice → nouvel id.
- nom : nom affiché.
- type :
  "leste" = traction ou dips avec lest (chargeKg = lest ; 0 = poids du corps),
  "charge" = machine, barre, haltère, poulie,
  "reps" = poids du corps compté en répétitions,
  "tenue" = compté en secondes (handstand, front lever…),
  "course" = course à pied.
- series : nombre de séries.
- reps : répétitions par série. OU dureeMin / dureeMax : durée en SECONDES (« 10–20 s » → 10 / 20 ; « 20–25 min » → 1200 / 1500). Sans durée ni reps (« 6 tentatives ») : ni l'un ni l'autre.
- derniereSerieMax : true si la dernière série est « max » (« 4×2 + 1×max » → series 5, reps 2).
- chargeKg : nombre si la charge est chiffrée (« +45 kg » → 45 ; « 32,5 kg » → 32.5), sinon null (« léger », « S2 + 2,5 kg », « RPE 8 »).
- chargeTexte : la charge exactement comme écrite (« +45 kg, RPE 8–9 », « PDC », « Léger »).
- reposMin / reposMax : repos en SECONDES (« 4–5 min » → 240 / 300 ; « 90 s » → 90 / 90 ; pas de repos → null / null).
- consigne : texte facultatif (« Descente 3 s »).
- optionnel : true si l'exercice est optionnel.
- role (tractions lestées uniquement) : "top" (top set ou top single), "backoff", "single" (singles d'un test). L'app propose le ressenti RAPIDE / DUR / GRIND sur top et single, et −2,5 kg sur les back-off si le top set est GRIND.
- Deux exercices sur une même ligne (« curl poignet + curl inversé 2×15 chacun ») → deux exercices séparés.

Exemple :
{ "id": "traction-lestee", "role": "top", "nom": "Traction lestée — top set", "type": "leste", "series": 1, "reps": 2, "chargeKg": 45, "chargeTexte": "+45 kg, RPE 8–9", "reposMin": 240, "reposMax": 300 }

ID DÉJÀ UTILISÉS DANS MON APP
${ids}

MON PROGRAMME
[colle ton programme ici]`;
}

async function copierPrompt(bouton) {
  const texte = document.getElementById('prompt-programme');
  try {
    await navigator.clipboard.writeText(texte.value);
    bouton.textContent = 'Prompt copié';
  } catch {
    // Copie refusée : on ouvre le texte sélectionné pour le copier à la main.
    texte.closest('details').open = true;
    texte.select();
  }
}

// Fichier de sauvegarde : partage iOS (« Enregistrer dans Fichiers »), sinon téléchargement.
async function exporter() {
  const nom = `maztrix-sauvegarde-${dateISO()}.json`;
  const fichier = new File([JSON.stringify(etat, null, 2)], nom, { type: 'application/json' });
  if (navigator.canShare?.({ files: [fichier] })) {
    try {
      return await navigator.share({ files: [fichier] });
    } catch (e) {
      if (e.name === 'AbortError') return; // partage annulé
    }
  }
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(fichier);
  lien.download = nom;
  lien.click();
  setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
}

async function importer(champ) {
  const fichier = champ.files[0];
  champ.value = ''; // pour pouvoir réimporter le même fichier
  if (!fichier) return;
  let donnees;
  try {
    donnees = JSON.parse(await fichier.text());
  } catch {
    return alert('Ce fichier n\'est pas un JSON lisible.');
  }
  if (champ.dataset.fichier === 'programme') {
    const erreur = erreurProgramme(donnees);
    if (erreur) return alert(`Programme refusé : ${erreur}`);
    if (!confirm(`Remplacer le programme actuel par « ${donnees.nom ?? 'sans nom'} » ? Mon historique est gardé.`)) return;
    etat.programme = donnees;
    sauver();
  } else {
    if (typeof donnees?.seances !== 'object' || typeof donnees?.reglages !== 'object')
      return alert('Ce fichier n\'est pas une sauvegarde Maztrix.');
    if (!confirm('Remplacer toutes mes données actuelles par cette sauvegarde ?')) return;
    remplacer(donnees);
  }
  location.reload();
}

// --- Actions ------------------------------------------------------------

// Modifie le journal de la séance ouverte, en gardant l'état d'avant pour « Annuler ».
function modifier(s, fn, rerendre = true) {
  annulations.push({ id: s.id, avant: JSON.stringify(etat.seances[s.id] ?? null) });
  const log = (etat.seances[s.id] ??= { date: aujourdhui, debut: Date.now(), echauffement: {}, exercices: {} });
  fn(log);
  sauver();
  if (rerendre) rendre();
  else document.querySelector('[data-action="annuler"]').disabled = false;
}

function serieDe(log, ex, i, j) {
  // Le nom est gardé pour les graphiques, même si un prochain programme n'a plus cet exercice.
  const e = (log.exercices[i] ??= { id: ex.id, nom: ex.nom.split(' — ')[0], type: ex.type, role: ex.role ?? null, series: {} });
  return (e.series[j] ??= {});
}

// Nom de la prochaine série pas encore validée, pour l'écran de repos.
function prochaineSerie(s, i, j) {
  const log = etat.seances[s.id];
  for (let a = i; a < s.exercices.length; a++)
    for (let b = a === i ? j + 1 : 0; b < s.exercices[a].series; b++)
      if (!log.exercices[a]?.series[b]?.statut) return `${s.exercices[a].nom} — série ${b + 1}/${s.exercices[a].series}`;
  return null;
}

function ouvrir(id, redessiner = true) {
  ouverteId = id;
  semaineId = seances.find(s => s.id === id).semaine.id;
  annulations.length = 0;
  if (redessiner) {
    rendre();
    scrollTo(0, 0);
  }
}

document.querySelector('.onglets').addEventListener('click', choisirOnglet);
document.querySelector('.barre-haut').addEventListener('click', choisirOnglet);
function choisirOnglet(e) {
  const b = e.target.closest('[data-onglet]');
  if (!b) return;
  // Re-taper SÉANCE alors qu'on y est déjà ramène à l'accueil.
  if (b.dataset.onglet === 'seance' && onglet === 'seance') ouverteId = semaineId = null;
  if (b.dataset.onglet !== 'chrono') retourSerie = null;
  onglet = b.dataset.onglet;
  rendre();
  scrollTo(0, 0);
}

vue.addEventListener('click', e => {
  if (e.target.closest('#chrono-bouton') && e.detail === 0) return toucherZone(); // clavier / VoiceOver
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const s = seances.find(x => x.id === ouverteId);
  const i = Number(b.dataset.i), j = Number(b.dataset.j), v = b.dataset.v;
  const ex = s?.exercices[i];

  switch (b.dataset.action) {
    case 'semaine':
      semaineId = b.dataset.id;
      rendre();
      scrollTo(0, 0);
      break;

    case 'ouvrir':
      onglet = 'seance'; // aussi depuis l'écran PROGRAMME
      ouvrir(b.dataset.id);
      break;

    case 'exporter':
      exporter();
      break;

    case 'copier-prompt':
      copierPrompt(b);
      break;

    case 'reinitialiser':
      if (!confirm('Effacer toutes mes données (séances, chronos, réglages) ?')) break;
      if (!confirm('Vraiment ? C\'est définitif. Pense à exporter une sauvegarde avant.')) break;
      effacerTout();
      location.reload();
      break;

    case 'vers-chrono':
      retourSerie = { seanceId: s.id, i, j };
      chronoExId = ex.id;
      onglet = 'chrono';
      rendre();
      scrollTo(0, 0);
      break;

    case 'retour-seance': {
      const { i: a, j: c } = retourSerie;
      retourSerie = null;
      onglet = 'seance';
      rendre();
      document.getElementById(`serie-${a}-${c}`)?.scrollIntoView({ block: 'center' });
      break;
    }

    case 'retour':
      if (ouverteId) ouverteId = null;
      else semaineId = null;
      annulations.length = 0;
      rendre();
      scrollTo(0, 0);
      break;

    case 'statut': {
      preparerSon();
      let repos = false;
      modifier(s, log => {
        const r = serieDe(log, ex, i, j);
        if (r.statut === v) return void delete r.statut; // 2e tap sur le même bouton = effacer
        r.statut = v;
        r.t = Date.now();
        // On fige les valeurs pré-remplies affichées.
        if (avecCharge(ex)) r.chargeKg ??= chargeProposee(ex);
        const max = ex.derniereSerieMax && j === ex.series - 1;
        if (v === 'fait' && ex.reps && !max) r.reps ??= ex.reps;
        if (v === 'fait' && ex.dureeMin) r.duree ??= ex.dureeMin;
        repos = v !== 'saute'; // une série ratée se récupère aussi : repos puis série suivante
      });
      const suivant = repos && ex.reposMin != null && prochaineSerie(s, i, j);
      if (suivant) {
        annulations.at(-1).repos = true;
        demarrerRepos(ex.reposMin, ex.reposMax !== ex.reposMin ? reposTexte(ex) : '', suivant, s.id);
      }
      break;
    }

    case 'charge':
      modifier(s, log => {
        const r = serieDe(log, ex, i, j);
        r.chargeKg = Math.max(0, (r.chargeKg ?? chargeProposee(ex) ?? 0) + Number(v));
      });
      break;

    case 'ressenti':
      modifier(s, log => {
        const r = serieDe(log, ex, i, j);
        r.ressenti = r.ressenti === v ? undefined : v;
      });
      break;

    case 'annuler': {
      const a = annulations.pop();
      const avant = JSON.parse(a.avant);
      if (avant) etat.seances[a.id] = avant;
      else delete etat.seances[a.id];
      if (a.repos) arreterRepos();
      sauver();
      rendre();
      break;
    }

    case 'terminer':
      modifier(s, log => {
        log.terminee = true;
        log.fin = Date.now();
      });
      arreterRepos();
      scrollTo(0, 0);
      break;
  }
});

// Champs texte, cases et barres : on enregistre sans redessiner la page, sinon le tap suivant
// (sur FAIT par exemple) tomberait sur un bouton qui vient d'être remplacé.
vue.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'progres-exo') {
    progresExId = el.value;
    return rendre();
  }
  if (el.id === 'chrono-exo') {
    chronoExId = el.value;
    return rendre();
  }
  if (el.dataset.fichier) return importer(el);
  if (el.dataset.reglage === 'son') {
    etat.reglages.son = el.checked;
    return sauver();
  }
  if (el.dataset.reglage === 'pdcKg') {
    const kg = Number(el.value.trim().replace(',', '.'));
    if (kg >= 30 && kg <= 250) {
      etat.reglages.pdcKg = kg;
      sauver();
    } else el.value = nombre(etat.reglages.pdcKg); // valeur impossible : on remet l'ancienne
    return;
  }
  const nom = el.dataset.champ;
  if (!nom) return;
  if (nom === 'decompte') {
    etat.reglages.decompte = el.checked;
    return sauver();
  }
  const s = seances.find(x => x.id === ouverteId);

  if (nom === 'echauffement') {
    modifier(s, log => (log.echauffement[el.dataset.k] = el.checked), false);
    const log = etat.seances[s.id];
    el.closest('details').querySelector('.compte').textContent =
      `${s.echauffement.filter((_, k) => log.echauffement[k]).length}/${s.echauffement.length}`;
    return;
  }

  const i = Number(el.dataset.i), j = Number(el.dataset.j);
  const texte = el.value.trim();
  const n = texte === '' ? undefined : Number(texte.replace(',', '.'));
  // La barre de difficulté peut envoyer deux fois la même valeur (doigt + navigateur).
  if (nom === 'rpe' && etat.seances[s.id]?.exercices[i]?.series[j]?.rpe === n) return;
  modifier(s, log => {
    const r = serieDe(log, s.exercices[i], i, j);
    if (nom === 'note') r.note = texte;
    else if (nom === 'dureeMinutes') r.duree = Number.isFinite(n) ? Math.round(n * 60) : undefined;
    else r[nom] = Number.isFinite(n) ? n : undefined;
  }, false);
});

// --- Barre de difficulté -------------------------------------------------------
// Sur iPhone, une barre native ne bouge que si on attrape le curseur :
// ici on peut taper ou glisser n'importe où sur la barre.

function majDifficulte(barre) {
  const v = Number(barre.value);
  const bloc = barre.closest('.difficulte');
  bloc.classList.remove('non-note');
  bloc.dataset.niv = Math.floor(v);
  bloc.style.setProperty('--p', `${(v - 6) * 25}%`);
  bloc.querySelector('.difficulte-texte').textContent = difficulteTexte(v);
}

function placerDifficulte(barre, x) {
  const { left, width } = barre.getBoundingClientRect();
  const v = 6 + Math.round(Math.min(1, Math.max(0, (x - left) / width)) * 8) / 2;
  if (Number(barre.value) === v && !barre.closest('.non-note')) return;
  barre.value = v;
  majDifficulte(barre);
}

let barreTouchee = null;
vue.addEventListener('pointerdown', e => {
  barreTouchee = e.target.matches('input[type="range"]') ? e.target : null;
});
vue.addEventListener('pointermove', e => {
  if (barreTouchee) placerDifficulte(barreTouchee, e.clientX);
});
vue.addEventListener('pointerup', e => {
  if (!barreTouchee) return;
  placerDifficulte(barreTouchee, e.clientX);
  barreTouchee.dispatchEvent(new Event('change', { bubbles: true }));
  barreTouchee = null;
});
vue.addEventListener('pointercancel', () => (barreTouchee = null)); // le doigt faisait défiler la page
vue.addEventListener('input', e => {
  if (e.target.type === 'range') majDifficulte(e.target); // clavier / VoiceOver
});

// --- Page de présentation : glisser pour ouvrir ------------------------------

const intro = document.getElementById('intro');
const piste = intro.querySelector('.glisser');
const poignee = intro.querySelector('.glisser-poignee');
let departX = null;
const course = () => piste.clientWidth - poignee.offsetWidth - 8; // 4 px de marge de chaque côté

document.getElementById('intro-objectif').textContent = prog.objectif ? `Objectif ${prog.objectif}` : '';

function placerPoignee(x) {
  poignee.style.transform = `translateX(${x}px)`;
  piste.style.setProperty('--avance', x / course());
}

poignee.addEventListener('pointerdown', e => {
  departX = e.clientX;
  poignee.setPointerCapture(e.pointerId);
  piste.classList.add('tire');
});
poignee.addEventListener('pointermove', e => {
  if (departX != null) placerPoignee(Math.min(course(), Math.max(0, e.clientX - departX)));
});
function lacher(e) {
  if (departX == null) return;
  const arrive = e.type === 'pointerup' && e.clientX - departX >= course() * 0.9;
  departX = null;
  piste.classList.remove('tire');
  if (arrive) return ouvrirApp();
  placerPoignee(0); // pas assez loin : la poignée revient
}
poignee.addEventListener('pointerup', lacher);
poignee.addEventListener('pointercancel', lacher);
poignee.addEventListener('click', e => {
  if (e.detail === 0) ouvrirApp(); // activé au clavier ou avec VoiceOver
});

function ouvrirApp() {
  intro.classList.add('ferme');
  setTimeout(() => (intro.hidden = true), 150);
}

// Retour au premier plan : le chrono se recalcule et on récupère le Wake Lock.
// Si l'app est restée ouverte depuis la veille, l'accueil passe au nouveau jour.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const date = dateForcee || dateISO();
  if (date !== aujourdhui) {
    aujourdhui = date;
    if (!ouverteId) rendre();
  }
  afficherRepos();
  ecranAllume(seanceActive());
});

// Service worker : l'app marche ensuite hors ligne (il faut un serveur http(s), pas un fichier ouvert directement).
navigator.serviceWorker?.register('sw.js').catch(() => {
  // Échec (ex. page ouverte en file://) : l'app marche quand même, seulement pas hors ligne.
});

// iOS n'applique le style :active (retour visuel au toucher) que si la page écoute touchstart.
document.addEventListener('touchstart', () => {}, { passive: true });

demanderPersistance();
rendre();
afficherRepos(); // un repos était en cours avant la fermeture de l'app
