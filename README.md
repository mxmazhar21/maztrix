# Maztrix

Mon app de suivi streetlifting / calisthénie : séance du jour, validation des séries, chrono de repos,
chrono handstand et courbes de progression. Web-app installable (PWA), 100 % hors ligne une fois installée.
HTML, CSS et JavaScript simples : pas de framework, pas de npm, rien à compiler.

## Tester en local (sur le Mac)

```sh
cd maztrix
python3 -m http.server 8765
```

Puis ouvrir <http://localhost:8765> dans Chrome. (Le port 8000 est déjà pris par mon autre projet.)

- Simuler un autre jour : <http://localhost:8765/index.html?date=2026-10-26>
- Tests automatiques : <http://localhost:8765/tests.html> (mes données sont mises de côté pendant le test puis remises).
- Vue iPhone dans Chrome : `⌘⌥I` puis `⌘⇧M`.

Ouvrir `index.html` en double-cliquant ne marche pas : il faut passer par le serveur.

## Publier gratuitement sur GitHub Pages

Le service worker (hors ligne) exige le HTTPS : GitHub Pages le fournit.

1. Créer un dépôt sur GitHub (par exemple `maztrix`).
2. Envoyer le **contenu** du dossier `maztrix/` à la racine du dépôt (`index.html` doit être à la racine).
3. Sur GitHub : **Settings → Pages → Build and deployment → Deploy from a branch**, branche `main`, dossier `/ (root)`.
4. Après une minute, l'app est en ligne sur `https://<mon-pseudo>.github.io/maztrix/`.

## Installer sur l'iPhone

1. Ouvrir l'adresse GitHub Pages dans **Safari** (pas Chrome).
2. **Partager → « Sur l'écran d'accueil »**.
3. Lancer l'app une fois avec du réseau : elle se met en cache, puis marche sans réseau et sans le Mac.

Mes données restent sur le téléphone, dans l'app installée (séparées de Safari).
**Exporter une sauvegarde de temps en temps** : Réglages → Exporter mes données → Enregistrer dans Fichiers.

## Mettre l'app à jour après une modification

L'app est servie depuis le cache du téléphone. Après avoir modifié un fichier :

1. Dans `sw.js`, changer le numéro : `const CACHE = 'maztrix-v4';` → `'maztrix-v5'`.
2. Envoyer les fichiers sur GitHub.
3. Sur l'iPhone, ouvrir l'app avec du réseau, la fermer et la rouvrir.

Sans ce changement de numéro, l'iPhone (et Chrome) continuent d'afficher l'ancienne version.

## Nouveau cycle : changer de programme

**Méthode simple (recommandée)**

1. Réglages → **Copier le prompt**.
2. Le coller dans une conversation avec Claude, coller mon nouveau programme à la fin.
3. Vérifier le tableau récapitulatif qu'il rend, enregistrer le JSON dans un fichier `programme.json`.
4. Réglages → **Importer un programme.json**. L'app vérifie le fichier avant de l'accepter.

Mon historique est gardé : les courbes continuent tant que les exercices gardent le même `id`
(le prompt contient la liste des `id` déjà utilisés).

**Méthode à la main** : remplacer `data/programme.json`, puis changer le numéro dans `sw.js` (voir plus haut).
Format d'un exercice :

```json
{ "id": "traction-lestee", "role": "top", "nom": "Traction lestée — top set", "type": "leste",
  "series": 1, "reps": 2, "chargeKg": 45, "chargeTexte": "+45 kg, RPE 8–9", "reposMin": 240, "reposMax": 300 }
```

- `type` : `leste`, `charge`, `reps`, `tenue` ou `course`.
- `reps`, ou `dureeMin` / `dureeMax` en **secondes** (tenues, course).
- `reposMin` / `reposMax` en **secondes** (`null` s'il n'y a pas de repos).
- `chargeKg` : nombre, ou `null` si la charge n'est pas chiffrée (« léger », « S2 + 2,5 kg »).
- Séances rangées dans l'ordre des dates, date au format `AAAA-MM-JJ`.

À savoir : la suggestion d'ouverture du Test PR (selon le ressenti du single de la S3) est propre au cycle +52,5
(`conseilOuverture` dans `js/app.js`).

## Mes photos (facultatif)

1. Déposer les photos dans `assets/img/` (par exemple `seance.jpg` et `chrono.jpg`).
2. En haut de `css/style.css`, remplacer `none` :
   ```css
   --photo-seance: url('../assets/img/seance.jpg');
   --photo-chrono: url('../assets/img/chrono.jpg');
   ```
3. Ajouter les deux fichiers à la liste `FICHIERS` de `sw.js` (pour le hors ligne) et changer le numéro de version.

L'app les passe en noir et blanc contrasté avec un fondu vers le noir. Sans photo, rien ne change.

## Icônes

`sh assets/icons/generer-icones.sh` régénère `icon-180.png`, `icon-192.png` et `icon-512.png`
à partir de `assets/icons/icone.html` (utilise Chrome et `sips`, déjà sur le Mac).

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | la page, la présentation et le chrono de repos |
| `css/style.css` | tout le style (couleurs en haut du fichier) |
| `js/app.js` | écrans et actions : séance, chrono, programme, progrès, réglages |
| `js/store.js` | sauvegarde dans le téléphone (localStorage, clé `maztrix-v1`) |
| `js/timer.js` | chrono de repos, bip, écran allumé |
| `js/charts.js` | graphiques SVG |
| `js/program.js` | lecture du programme et formats d'affichage |
| `data/programme.json` | le programme |
| `sw.js`, `manifest.json` | hors ligne et installation |
| `tests.html` | tests automatiques |
