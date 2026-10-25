// charts.js — courbes de progression en SVG, dessinées à la main (sans bibliothèque).

const L = 343, H = 200; // taille de dessin ; le SVG s'étire à la largeur de l'écran
const M = { haut: 18, droite: 14, bas: 26, gauche: 44 }; // marges pour les libellés

const jourMois = d => d.slice(8) + '/' + d.slice(5, 7); // "2026-10-26" → "26/10"

// series : [{ nom, points: [{ date: 'AAAA-MM-JJ', y }] }]  (2 séries max : la 2e est en pointillés)
// objectif : { y, texte } → ligne horizontale ; format : y → texte affiché ("+45 kg"…)
export function courbe({ series, objectif, format }) {
  const tous = series.flatMap(s => s.points);
  if (!tous.length) return '<p class="exo-infos">Pas encore de données pour cet exercice.</p>';

  // Échelles : x = temps réel entre la première et la dernière date, y = valeurs (+ objectif).
  const temps = d => new Date(d + 'T12:00').getTime();
  let x0 = Math.min(...tous.map(p => temps(p.date))), x1 = Math.max(...tous.map(p => temps(p.date)));
  if (x0 === x1) { x0 -= 864e5; x1 += 864e5; } // un seul jour : le point est centré
  const valeurs = tous.map(p => p.y).concat(objectif ? [objectif.y] : []);
  const bas = Math.min(...valeurs), haut = Math.max(...valeurs);
  const marge = (haut - bas) * 0.12 || Math.max(1, Math.abs(haut) * 0.12);
  const y0 = bas >= 0 ? Math.max(0, bas - marge) : bas - marge, y1 = haut + marge;
  const X = t => M.gauche + ((t - x0) / (x1 - x0)) * (L - M.gauche - M.droite);
  const Y = v => H - M.bas - ((v - y0) / (y1 - y0)) * (H - M.haut - M.bas);

  // Grille discrète : une ligne au plus bas et au plus haut des données.
  const graduations = [...new Set([bas, Math.max(...tous.map(p => p.y))])].map(v => `
    <line class="g-grille" x1="${M.gauche}" x2="${L - M.droite}" y1="${Y(v)}" y2="${Y(v)}"/>
    <text class="g-texte" x="${M.gauche - 6}" y="${Y(v) + 4}" text-anchor="end">${format(v)}</text>`).join('');

  const dates = [...new Set(tous.map(p => p.date))].sort();
  const axeX = [dates[0], dates.at(-1)].filter((d, k, t) => t.indexOf(d) === k).map((d, k, t) => `
    <text class="g-texte" x="${X(temps(d))}" y="${H - 6}" text-anchor="${t.length === 1 ? 'middle' : k ? 'end' : 'start'}">${jourMois(d)}</text>`).join('');

  const lignes = series.map((s, n) => {
    if (!s.points.length) return '';
    const pts = s.points.map(p => [X(temps(p.date)), Y(p.y), p]);
    const dernier = pts.at(-1);
    return `
      <polyline class="g-ligne g-s${n}" points="${pts.map(([x, y]) => `${x},${y}`).join(' ')}"/>
      ${pts.map(([x, y, p]) => `<circle class="g-point g-s${n}" cx="${x}" cy="${y}" r="4"><title>${jourMois(p.date)} — ${s.nom} : ${format(p.y)}</title></circle>`).join('')}
      ${n === 0 ? `<text class="g-valeur" x="${dernier[0]}" y="${dernier[1] - 10}" text-anchor="${dernier[0] > L - 60 ? 'end' : 'middle'}">${format(dernier[2].y)}</text>` : ''}`;
  }).join('');

  // L'objectif est nommé dans la légende (un texte dans le graphique chevaucherait les valeurs).
  const ligneObjectif = objectif ? `
    <line class="g-objectif" x1="${M.gauche}" x2="${L - M.droite}" y1="${Y(objectif.y)}" y2="${Y(objectif.y)}"/>` : '';

  const legende = series.length > 1 || objectif ? `
    <p class="g-legende">${series.map((s, n) => `<span><i class="g-s${n}"></i>${s.nom}</span>`).join('')}
      ${objectif ? `<span><i class="g-obj"></i>${objectif.texte}</span>` : ''}</p>` : '';

  // Tableau des valeurs : lisible sans la couleur, et les chiffres exacts.
  const lignesTableau = dates.map(d => `<tr><td>${jourMois(d)}</td>${series.map(s => {
    const p = s.points.find(q => q.date === d);
    return `<td>${p ? format(p.y) : '—'}</td>`;
  }).join('')}</tr>`).reverse().join('');

  return `
    ${legende}
    <svg class="graphique" viewBox="0 0 ${L} ${H}" role="img" aria-label="${series.map(s => s.nom).join(', ')} dans le temps">
      ${graduations}${ligneObjectif}${lignes}${axeX}
    </svg>
    <details class="g-tableau">
      <summary>Voir les valeurs</summary>
      <table><thead><tr><th>Date</th>${series.map(s => `<th>${s.nom}</th>`).join('')}</tr></thead>
      <tbody>${lignesTableau}</tbody></table>
    </details>`;
}
