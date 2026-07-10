# Checklist manuelle Vercel

Cette checklist complète les fichiers déjà préparés dans le dépôt. Les valeurs
secrètes ne doivent jamais être commitées.

## 1. Base PostgreSQL

1. Depuis le projet Vercel `insta-saved-post-explorer`, ouvrir **Storage** puis
   créer ou connecter une base PostgreSQL compatible Prisma, par exemple Neon.
2. Créer deux bases ou branches isolées : **Preview** et **Production**.
3. Pour chacune, relever :
   - l'URL poolée, destinée à `DATABASE_URL` dans Vercel;
   - l'URL directe, destinée à `DATABASE_DIRECT_URL` dans GitHub.
4. Choisir la région Vercel la plus proche de la région PostgreSQL.

## 2. Secrets d'authentification

Générer un secret différent pour Preview et Production :

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Générer le hash bcrypt du mot de passe administrateur :

```powershell
node -e "require('bcryptjs').hash('REMPLACER_PAR_UN_MOT_DE_PASSE_FORT', 12).then(console.log)"
```

Conserver le mot de passe dans un gestionnaire de mots de passe. Seul le hash
est enregistré dans Vercel.

## 3. Variables Vercel

Dans **Project > Settings > Environment Variables**, créer les valeurs suivantes
pour **Preview** puis **Production** :

| Nom | Valeur |
| --- | --- |
| `DATABASE_URL` | URL PostgreSQL poolée de l'environnement |
| `AUTH_SECRET` | Secret aléatoire de l'environnement |
| `ADMIN_EMAIL` | Adresse autorisée |
| `ADMIN_PASSWORD_HASH` | Hash bcrypt généré |
| `APP_OWNER_ID` | Identifiant stable, par exemple `karim` |
| `IMPORT_MAX_BYTES` | `1000000` |
| `MEDIA_HOST_ALLOWLIST` | Vide, sauf CDN supplémentaire maîtrisé |
| `NEXT_PUBLIC_APP_URL` | URL HTTPS canonique de l'environnement |

Ne pas créer `AUTH_DISABLED` sur Vercel. Ne pas ajouter
`DATABASE_DIRECT_URL` au projet Vercel.

Après toute modification de variable, redéployer la Preview : les variables ne
sont pas injectées rétroactivement dans les déploiements existants.

## 4. Configuration du projet Vercel

Dans **Settings > General** :

1. Framework Preset : **Next.js**.
2. Root Directory : la racine du dépôt. Si le dépôt parent est connecté,
   sélectionner `insta-saved-post-explorer`.
3. Node.js Version : **24.x**.
4. Install Command : `npm ci`.
5. Build Command :
   `npm run deploy:check && npm run db:generate && npm run build`.
6. Production Branch : `main`.

Dans **Settings > Git** :

1. conserver les Preview Deployments pour les pull requests;
2. exiger les checks GitHub avant le merge;
3. activer Vercel Authentication sur les Previews contenant de vraies données.

## 5. Environnements GitHub

Dans **GitHub > Repository > Settings > Environments** :

1. créer `preview` et `production`;
2. ajouter dans chacun un secret `DATABASE_DIRECT_URL` avec l'URL directe
   correspondante;
3. exiger un approbateur pour `production`;
4. limiter `production` à la branche `main`.

Protéger `develop` et `main` dans **Rules > Rulesets** :

- pull request obligatoire;
- workflow **CI** obligatoire;
- au moins une approbation pour `main`;
- aucun push direct vers `main`.

## 6. Première Preview

1. Pousser la branche de fonctionnalité et ouvrir une PR vers `develop`.
2. Attendre la CI GitHub et le build Vercel.
3. Appliquer la migration Preview :
   - si le workflow **Database release** est déjà présent sur la branche par
     défaut, le lancer avec l'environnement `preview` et la confirmation
     `MIGRATE`;
   - pour la toute première release, avant que ce workflow soit sur `main`,
     exécuter localement la procédure de bootstrap ci-dessous avec l'URL
     **directe Preview**.
4. Redéployer la Preview après la migration.
5. Vérifier :

```text
https://URL-DE-PREVIEW/api/health
```

La réponse attendue est :

```json
{
  "status": "ok",
  "database": "connected",
  "authentication": "configured"
}
```

Tester ensuite la connexion, un import JSON, la recherche, les thèmes, l'ajout
et la suppression d'un tag, puis la suppression d'une publication de test.

Bootstrap de migration initiale sous PowerShell :

```powershell
$env:DATABASE_URL="<URL_POSTGRESQL_DIRECTE_PREVIEW>"
npm.cmd ci
npm.cmd run db:generate
npm.cmd run db:deploy
Remove-Item Env:DATABASE_URL
```

Vérifier très attentivement l'hôte et le nom de base avant d'exécuter cette
commande. Ne jamais lancer `db:migrate`, `prisma migrate dev`, `db:seed` ou
`prisma db push` sur une base distante de release.

## 7. Mise en production

1. Ouvrir et faire approuver la PR de `develop` vers `main`.
2. Vérifier que les migrations sont rétrocompatibles.
3. Appliquer la migration Production :
   - pour les releases suivantes, exécuter **Database release** sur le commit à
     livrer avec l'environnement `production` et la confirmation `MIGRATE`;
   - pour la première release uniquement, si le workflow n'est pas encore
     disponible sur `main`, répéter la commande de bootstrap avec l'URL
     **directe Production**, après double vérification et juste avant le merge.
4. Après succès, merger la PR vers `main`.
5. Attendre le déploiement Vercel Production.
6. Vérifier `/api/health`, la page de login et un parcours de lecture.
7. Consulter les Runtime Logs Vercel et vérifier l'absence de réponses 5xx.

Une fois cette première release mergée, le workflow `Database release` est
présent sur `main` et doit remplacer définitivement la commande locale.

## 8. Sécurité après la première mise en ligne

Avant une exposition publique, créer une règle **Vercel Firewall > Rate
Limiting** pour `POST /api/auth/login`, par exemple 5 tentatives par minute et
par adresse IP. Conserver également la protection Vercel des Previews.

Configurer une supervision HTTP sur `/api/health` et une alerte sur les erreurs
5xx. Planifier la rotation de `AUTH_SECRET`, du mot de passe administrateur et
des identifiants PostgreSQL.
