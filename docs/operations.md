# Opérations et runbook

## Contrôles après déploiement

Exécuter d'abord sur Preview, puis répéter après promotion en Production :

1. Ouvrir la bibliothèque sans session et vérifier la navigation publique.
2. Ouvrir le bouton Admin et vérifier la connexion par mot de passe.
3. Charger la bibliothèque, rechercher, filtrer en ET/OU et ouvrir un détail.
4. Passer entre les thèmes clair, sombre et système sans flash d'hydratation.
5. Importer une petite fixture, puis la réimporter pour vérifier l'idempotence.
6. Tester un lot invalide et confirmer que les erreurs n'exposent ni secret ni
   trace serveur.
7. Contrôler les logs Vercel, le taux d'erreur et la latence PostgreSQL.

## Migration de base

- Les migrations sont versionnées dans `prisma/migrations` et relues avant la
  release.
- Exécuter le workflow `Database release` sur Preview avant Production.
- Saisir exactement `MIGRATE`; l'environnement GitHub fournit sa connexion
  directe.
- Le workflow est sérialisé par environnement pour éviter deux migrations
  concurrentes.
- Les migrations doivent suivre expand/migrate/contract : ajout rétrocompatible,
  migration des données hors requête web, puis retrait dans une release future.

En cas d'échec, ne pas relancer aveuglément. Lire l'étape fautive, vérifier
`_prisma_migrations`, l'état Neon et la compatibilité du SQL. Corriger avec une
nouvelle migration. Ne jamais éditer une migration déjà appliquée et ne jamais
utiliser `db push` en Production.

## Rollback applicatif

Si la nouvelle version échoue mais que la migration est rétrocompatible :

1. Utiliser l'Instant Rollback Vercel vers le dernier déploiement sain.
2. Vérifier login, lecture et import sur la version restaurée.
3. Geler les promotions et ouvrir un incident.

Ne pas tenter un rollback SQL automatique. Pour une migration destructive, la
restauration dépend du snapshot/point-in-time recovery Neon et doit être testée
sur une branche isolée avant toute action sur Production.

## Incident import `413`

1. Identifier si le corps de requête ou la réponse dépasse 4,5 Mo dans les logs.
2. Relever le nombre d'items et la taille sérialisée du lot sans journaliser son
   contenu.
3. Réduire dynamiquement le lot sous 1 Mo et reprendre avec la même clé
   d'idempotence.
4. Vérifier que le rapport d'erreurs est plafonné et paginé.
5. Ne pas contourner la limite en encodant le fichier en base64, ce qui augmente
   sa taille.

## Saturation PostgreSQL

Signaux : timeouts Prisma, trop de connexions, latence p95 élevée.

1. Confirmer que le runtime utilise l'URL poolée et non l'URL directe.
2. Vérifier la région Vercel et la région Neon.
3. Rechercher les transactions longues, N+1 et lots d'import trop grands.
4. Suspendre temporairement les imports avant de réduire le trafic de lecture.
5. Utiliser l'URL directe uniquement pour migrations et administration.

## Rotation des secrets

- Tourner `AUTH_SECRET` provoque l'invalidation des sessions existantes; annoncer
  cette conséquence.
- Tourner les identifiants PostgreSQL dans Neon, mettre à jour Vercel et GitHub,
  créer une Preview, puis promouvoir après validation.
- Ne jamais afficher une valeur de secret dans un log, une issue ou une sortie
  de workflow.
- Redéployer après toute modification de variable Vercel : les déploiements déjà
  créés ne reçoivent pas les nouvelles valeurs.

## Sauvegarde et observabilité

Avant Production, documenter dans l'espace d'équipe :

- rétention et point-in-time recovery disponibles sur le plan Neon choisi;
- propriétaire des alertes Vercel et PostgreSQL;
- seuils de taux d'erreur, p95 et saturation des connexions;
- procédure trimestrielle de restauration vers une branche isolée;
- durée de rétention des logs et règles excluant captions, mots de passe, URLs de
  connexion et contenu JSON importé.

## État actuel de l'outillage

Au 10 juillet 2026, la machine de travail possède Node.js `v24.13.1`, mais :

- la commande `vercel` est absente;
- `.vercel/project.json` est absent, donc le dépôt n'est lié à aucun projet;
- `VERCEL_TOKEN`, `VERCEL_ORG_ID` et `VERCEL_PROJECT_ID` sont absents de
  l'environnement;
- `DATABASE_DIRECT_URL` est absent de l'environnement.

L'authentification locale Vercel ne peut donc pas être testée. Aucun
`vercel link`, `vercel whoami`, build distant, déploiement ou promotion n'a été
exécuté.

Il manque encore, hors dépôt : le projet Vercel, son identifiant d'organisation
et de projet, l'authentification d'un opérateur, les bases Preview/Production,
les secrets d'environnement et les approbateurs de Production.

## Worker global Phase E

Le worker normal démarre avec un registre vide en Phase E : il expose uniquement
les probes internes et n'émet aucune requête de claim tant qu'un vrai handler
n'est pas livré dans une PR séparée.

Contrôles opérateur avant démarrage :

1. vérifier `WORKER_OWNER_ID`, le login PostgreSQL restreint et le credential R2
   GetObject-only distinct du web ;
2. vérifier `20260726131000_phase_e_worker_queue` et ses grants versionnés ;
3. exécuter `docker compose -f services/worker/docker-compose.yml config` et
   confirmer l'absence de `ports` ;
4. vérifier l'UID `10001:10001`, `healthy`, les capacités supprimées et
   `no-new-privileges` ;
5. ne jamais exécuter le smoke sur une base partagée. Il exige `NODE_ENV=test`
   et un nom finissant par `_test`, ou `WORKER_SMOKE_CONFIRM=EPHEMERAL`.

Récupération : une readiness 503 conduit à vérifier le DSN restreint sans
l'afficher. Un lease expiré est repris atomiquement et l'ancien claimant ne peut
plus finaliser. SIGTERM/SIGINT bloque les nouveaux claims, borne le travail
courant, arrête les timers et nettoie le workdir. Le janitor ne supprime que les
enfants directs de `WORKER_TEMP_ROOT` et les liens suspects.

Alertes, dashboards, sauvegardes, firewall et VPS/Coolify restent des gates
opérateur non exécutées dans la PR Phase E.
