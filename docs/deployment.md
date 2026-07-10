# Déploiement Vercel et PostgreSQL

## Principe de release

Le build Vercel exécute `npm ci`, le préflight des secrets, `prisma generate`,
puis `next build`. Il
n'exécute jamais de migration. Les migrations sont une étape de release séparée,
protégée par un environnement GitHub et déclenchée manuellement avec le workflow
`Database release`.

La séquence attendue est :

1. La CI GitHub passe sur la pull request.
2. Le workflow `Database release` est exécuté pour `preview` sur le commit à
   tester, avec la base Preview isolée de Production.
3. Vercel construit ou redéploie la Preview après cette migration.
4. Les smoke tests, l'accessibilité et l'import en lots sont validés sur Preview.
5. Les migrations de production sont revues comme rétrocompatibles.
6. Le workflow `Database release` est exécuté pour `production` par un
   approbateur de l'environnement GitHub.
7. La Preview déjà validée est promue manuellement vers Production dans Vercel.
8. Les smoke tests de production sont exécutés, puis la release est annotée.

La branche `main` est la Production Branch Vercel et doit être protégée contre
les pushes directs. Les branches de travail et `develop` produisent des
Previews. La migration de production est appliquée après validation de la PR et
avant son merge vers `main`. Exiger la CI et les Deployment Checks avant le
merge; une promotion manuelle d'une Preview validée reste possible depuis le
Dashboard.

## Configuration Vercel

- Root Directory : racine du dépôt applicatif (`insta-saved-post-explorer` si le
  dépôt parent est connecté par erreur).
- Framework Preset : Next.js.
- Install Command : défini dans `vercel.json` avec `npm ci`.
- Build Command : défini dans `vercel.json` avec
  `npm run deploy:check && npm run db:generate && npm run build`.
- Node.js : 24, identique à la CI.
- Preview et Production doivent utiliser des bases ou branches Neon distinctes.
- La région Vercel doit être choisie près de la région PostgreSQL. Ne pas fixer
  une région dans le dépôt avant de connaître l'emplacement de la base.

Les headers de `vercel.json` bloquent l'embarquement, les objets, le MIME
sniffing et les permissions navigateur inutiles. La CSP est volontairement
partielle : elle protège `base-uri`, `form-action`, `frame-ancestors` et
`object-src`, sans définir `script-src` ni `style-src`. Une CSP stricte placée
ici casserait le script d'initialisation injecté par `next-themes` ou imposerait
`unsafe-inline`. Une CSP complète doit être ajoutée plus tard avec un nonce
généré par requête et testée dans les trois thèmes.

## Variables Vercel

Configurer des valeurs distinctes pour Preview et Production :

| Variable | Portée | Usage |
| --- | --- | --- |
| `DATABASE_URL` | Preview, Production | URL PostgreSQL poolée pour le trafic applicatif serverless. |
| `AUTH_SECRET` | Preview, Production | Secret aléatoire de session, distinct par environnement. |
| `ADMIN_EMAIL` | Preview, Production | Compte administrateur autorisé. |
| `ADMIN_PASSWORD_HASH` | Preview, Production | Hash du mot de passe, jamais le mot de passe brut. |
| `APP_OWNER_ID` | Preview, Production | Identifiant stable du propriétaire des données. |
| `NEXT_PUBLIC_APP_URL` | Preview, Production | URL canonique; en Preview préférer une URL de branche stable. |
| `IMPORT_MAX_BYTES` | Preview, Production | Limite applicative; ne remplace pas la limite Vercel par requête. |
| `MEDIA_HOST_ALLOWLIST` | Preview, Production | Domaines média HTTPS supplémentaires, séparés par des virgules. |

`DATABASE_DIRECT_URL` est un secret de release. Il doit être stocké dans les
environnements GitHub `preview` et `production`, pas exposé au runtime Vercel.
L'environnement GitHub `production` doit exiger une approbation manuelle et
limiter les branches autorisées.

Le schéma Prisma lit volontairement uniquement `DATABASE_URL`. Au runtime
Vercel, cette valeur est l'URL poolée. Le workflow de release injecte le secret
GitHub `DATABASE_DIRECT_URL` sous le nom `DATABASE_URL` uniquement pendant
`prisma migrate deploy`; la connexion directe n'est donc pas exposée aux
Functions.

## GitHub Actions et secrets

La CI utilise PostgreSQL 16 éphémère et ne dépend d'aucun secret externe. Elle
valide les migrations, Prisma Client, ESLint, TypeScript, Vitest et le build. Le
job Playwright s'active automatiquement dès qu'un fichier de test existe dans
`tests/e2e`.

Ressources à créer avant une release distante :

- projet Vercel connecté au bon dépôt et à la bonne Root Directory;
- branches Git protégées `develop` et `main`, avec `main` comme Production
  Branch Vercel;
- projet Neon/PostgreSQL avec une base Production et une branche/base Preview;
- environnements GitHub `preview` et `production`;
- secret GitHub `DATABASE_DIRECT_URL` dans chacun de ces environnements;
- variables Vercel listées ci-dessus dans leurs portées respectives;
- règles de protection et approbateurs pour l'environnement Production;
- Deployment Checks Vercel requis avant promotion.

Le endpoint `GET /api/health` est public et ne retourne aucun secret. Il répond
`200` uniquement quand la configuration d'authentification est valide et que
PostgreSQL répond; sinon il répond `503`. Utiliser ce endpoint pour les smoke
tests et la supervision.

## Import et limite de 4,5 Mo

Vercel impose 4,5 Mo maximum au corps d'une requête **et** d'une réponse de
Function. Cette limite n'est pas configurable dans `vercel.json`.

Le fichier JSON complet est lu et normalisé dans un Web Worker navigateur. Il
n'est jamais envoyé en une requête unique. Le client envoie des lots :

- 100 à 250 posts;
- moins de 1 Mo de JSON sérialisé par requête;
- numéro de lot et clé d'idempotence;
- reprise à partir du dernier lot confirmé;
- validation Zod répétée côté serveur;
- réponse compacte avec compteurs et erreurs plafonnées.

La limite serveur recommandée par lot est 1 000 000 octets. Une marge importante
reste ainsi disponible sous la limite Vercel pour les en-têtes et l'enveloppe.
Tout `413 FUNCTION_PAYLOAD_TOO_LARGE` indique un défaut de découpage client ou
une réponse trop volumineuse, pas une valeur à augmenter côté Vercel.

## Commandes de vérification locale

Sous PowerShell avec une politique qui bloque `npm.ps1`, utiliser `npm.cmd` :

```powershell
npm.cmd ci
npm.cmd run db:generate
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Ne jamais lancer `prisma migrate dev`, `prisma db push` ou un seed contre
Production. `prisma migrate deploy` est la seule commande de migration de
release.
