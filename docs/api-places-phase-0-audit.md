# Audit de préparation API V1 et Places — phase 0

Date de l’audit initial : 21 juillet 2026  
Décision produit corrigée : 22 juillet 2026  
Périmètre : audit statique du dépôt, sans modification fonctionnelle, sans migration et sans interrogation de la base de production.

## Amendement prioritaire

L’audit initial supposait que Places utiliserait une collection Instagram `Lieux` comme source d’éligibilité. Cette hypothèse était fondée sur une compréhension incorrecte du besoin produit et est annulée.

Places cible exclusivement les posts dont `Post.mainTheme`, après normalisation commune, correspond à :

```text
Voyages
Restaurant
```

Conséquences :

- aucune collection Instagram n’est requise pour Places ;
- aucune provenance de collection n’est requise pour Places ;
- `Collection` et `CollectionPost` ne participent pas au déclenchement des analyses ;
- il ne faut pas créer une collection `Lieux` pour répondre à ce besoin ;
- la synchronisation des collections Instagram reste une amélioration indépendante éventuelle, pas une gate Places ;
- les documents `AGENTS.md`, `CODEX_IMPLEMENTATION_ORDER.md` et `CODEX_PLACES_EXTENSION.md` définissent le contrat actuel.

## Verdict mis à jour

L’application actuelle constitue un bon socle monolithique pour la bibliothèque Instagram : les routes réutilisent les services serveur, les lectures sont limitées au propriétaire configuré, les médias multiples sont normalisés et la recherche plein texte dispose déjà de son index GIN.

Elle n’est toutefois pas prête à exposer l’API V1 ni à démarrer l’analyse Places profonde en sécurité. L’ordre recommandé est :

1. stabiliser les filtres de recherche existants ;
2. centraliser et tester l’éligibilité `Voyages` ou `Restaurant` ;
3. rendre l’identité des objets R2 exploitable par un worker restreint ;
4. renforcer les contraintes de propriétaire avant tout accès PostgreSQL direct par le worker ;
5. stabiliser l’API externe V1 ;
6. créer le worker global ;
7. créer ensuite le domaine Places, l’interface, l’analyse profonde et les outils MCP.

## Références autoritaires

Lire dans cet ordre :

1. [`AGENTS.md`](../AGENTS.md)
2. [`CODEX_IMPLEMENTATION_ORDER.md`](./CODEX_IMPLEMENTATION_ORDER.md)
3. [`CODEX_API_READY_ARCHITECTURE.md`](./CODEX_API_READY_ARCHITECTURE.md)
4. [`CODEX_PLACES_EXTENSION.md`](./CODEX_PLACES_EXTENSION.md)

Ce rapport décrit principalement l’état observé. Les documents ci-dessus définissent les décisions futures.

## Architecture actuelle

| Domaine | État actuel | Évaluation |
| --- | --- | --- |
| Application | Next.js 16, React 19, TypeScript strict, Prisma/PostgreSQL | Socle compatible |
| Services | Logique de bibliothèque principalement dans `src/server/library.ts` | Source de vérité à réutiliser |
| Routes web | Routes historiques sous `/api/*`, lecture publique et session admin pour les écritures | À préserver sans rupture |
| API externe | Aucun dossier `/api/v1`, aucun contrat V1, aucune clé Bearer dédiée | Absent, bloquant API |
| Propriétaire | `APP_OWNER_ID` appliqué par les services principaux | Correct au niveau applicatif, incomplet pour un worker direct |
| Recherche | Filtres typés, curseurs, recherche PostgreSQL et fallback local | Incohérences à corriger |
| Thèmes | `Post.mainTheme` existe et est indexé par propriétaire | Bonne source d’éligibilité Places |
| Collections | Gestion manuelle et relation plusieurs-à-plusieurs | Domaine indépendant de Places |
| Médias | `PostMedia` avec type, URL, `sourcePath`, miniature et position | Suffisant pour l’affichage, incomplet pour un worker |
| R2 | Upload signé/direct, validation de clé et taille | Bon socle d’écriture, contrat lecture worker absent |
| Places | Aucun modèle, service, endpoint, feature flag, worker ou UI | Entièrement à construire |
| Déploiement | Preflight Vercel pour DB, auth, propriétaire et R2 | Variables API/Places absentes |

## Constats détaillés

### P0 — L’API externe V1 n’existe pas

Il n’existe ni `src/app/api/v1`, ni `src/auth/api-key.ts`, ni contrats sous `src/contracts/api`, ni tests V1.

L’authentification existante utilise une session administrateur par cookie. Elle ne doit pas être détournée pour Hermes ou MCP. La V1 doit ajouter l’authentification Bearer SHA-256 prévue par le brief, sans modifier le fonctionnement de la session web.

`EXTERNAL_API_KEY_SHA256` est absent de `.env.example` et de `scripts/vercel-preflight.mjs`. Le format d’erreur actuel est différent du contrat V1 attendu. Un adaptateur V1 séparé évitera une rupture des routes existantes.

Une limitation de débit locale en mémoire ne serait pas fiable sur plusieurs instances Vercel. La stratégie doit être explicitement choisie avant publication externe.

### P0 — L’éligibilité Places doit être centralisée

Le schéma possède déjà :

```text
Post.mainTheme
posts_owner_main_theme_idx
```

Le besoin Places ne requiert donc pas de nouvelle relation de collection. Il requiert un prédicat métier partagé :

```text
isPlacesEligibleTheme(mainTheme)
```

Ce prédicat doit :

- accepter `Voyages` ;
- accepter `Restaurant` ;
- utiliser la normalisation commune insensible à la casse et aux accents ;
- refuser les valeurs nulles et les thèmes voisins ;
- être utilisé par l’API, l’UI, les statistiques, le worker et MCP ;
- être revérifié par le worker au moment de l’exécution.

Le thème est une gate d’éligibilité, pas une preuve géographique.

### P1 — Les filtres de pertinence ne sont pas cohérents

`queryRelevantPosts()` applique thème, type, auteur, année, collection, tags et texte. En revanche, les chemins de comptage et de sélection aléatoire n’appliquent pas tous les mêmes filtres.

Le fallback mémoire applique ces filtres, ce qui peut masquer le défaut hors base de données. Les conséquences sont :

- un `totalFiltered` erroné ;
- des pages annoncées sans résultats ;
- un résultat Découverte susceptible de sortir du périmètre actif.

La correction doit construire un filtre partagé utilisé par la liste, le comptage et les chemins aléatoires, avec des tests PostgreSQL ciblés.

### P1 — L’index plein texte existe déjà

La migration initiale crée `posts_search_text_fts_idx` sur `to_tsvector('simple', search_text)`, ainsi qu’un index trigramme. Aucun nouvel index équivalent ne doit être ajouté.

Le tri `newest` et `oldest` charge actuellement les identifiants candidats puis trie en mémoire sur `savedAt ?? createdAt`. Cette dette doit rester inchangée tant qu’une mesure ne justifie pas une réécriture SQL.

### P1 — Les références R2 ne suffisent pas à garantir une analyse reproductible

`PostMedia` stocke `url`, `sourcePath`, `thumbnailUrl`, `type` et `position`.

Pour Places, il manque une identité de stockage autoritaire et durable :

- clé R2 complète ;
- type MIME vérifié ;
- taille ;
- ETag, version ou checksum ;
- date de contrôle.

Le worker ne doit jamais télécharger une URL arbitraire. Une analyse profonde est autorisée uniquement pour un objet R2 connu en base et situé sous le préfixe permis.

Les médias historiques sans identité R2 peuvent rester éligibles à l’analyse de texte, puis être signalés comme média à réparer pour l’analyse profonde.

Le nom de variable doit être unifié autour de `R2_BUCKET_NAME` ou documenté explicitement.

### P1 — L’isolation par propriétaire doit être renforcée avant le worker

`Post`, `Collection`, `Tag`, `ImportJob` et `SyncJob` possèdent `ownerId`. Les relations secondaires héritent parfois du propriétaire uniquement par relation.

Cette convention est acceptable avec un processus applicatif contrôlé, mais plus risquée lorsqu’un worker VPS réclame directement des jobs en PostgreSQL.

Toutes les tables Places de premier niveau et tous les jobs doivent inclure `ownerId`. Le claim, le lease et les index d’idempotence doivent inclure le propriétaire. Le rôle PostgreSQL du worker doit être strictement limité.

### P1 — Le domaine Places est absent

Aucun modèle `Place`, lien post-lieu, preuve, job, enum, repository, feature flag, route, dépendance cartographique, service worker ou UI Places n’est présent.

`UNKNOWN` doit rester un résultat d’analyse ou un état de revue. Il ne doit pas créer un faux lieu canonique ni une coordonnée arbitraire.

### P1 — Les gates de déploiement et l’observabilité doivent être étendues

Vercel exécute `deploy:check` avant le build, mais la CI doit également prouver le preflight de production avec des valeurs factices valides lorsque les nouvelles variables deviennent obligatoires.

Places exigera des signaux pour :

- profondeur de queue ;
- jobs bloqués ;
- leases expirés ;
- disponibilité du worker ;
- erreurs R2 et providers ;
- durée ;
- espace temporaire ;
- coût.

Le worker ne doit exposer aucun port public.

### P2 — La stratégie de migration doit être clarifiée

Le dépôt utilise des migrations SQL Prisma explicites. `.env.example` déclare `DATABASE_DIRECT_URL`, mais le datasource Prisma n’utilise pas encore `directUrl`.

Avant une migration Places, vérifier si `DATABASE_URL` est poolée en production et configurer le canal direct si nécessaire.

Préparer une procédure documentée de rollback, restauration ou forward recovery compatible avec Neon.

### P2 — La couverture actuelle ne protège pas les requêtes SQL concernées

Les tests couvrent le parsing de requête, le fallback mémoire, plusieurs routes et les principaux parcours UI. Les E2E de bibliothèque utilisent cependant des données fallback et ne détectent pas les omissions SQL.

Ajouter des tests de base ciblés pour :

- auteur + année + collection en pertinence ;
- comptage ;
- random normal ;
- random pertinent ;
- pagination ;
- isolation `ownerId` ;
- éligibilité `Voyages` et `Restaurant`.

## Décisions d’architecture retenues

1. **API d’abord.** L’API V1 générique doit être stable avant Hermes/MCP et avant les commandes Places externes.
2. **Services serveur comme source de vérité.** Les routes `/api/v1` restent de fins adaptateurs.
3. **Une architecture d’authentification, plusieurs capacités.** La clé V1 initiale reste en lecture seule ; les actions sensibles utilisent des scopes ou la session admin.
4. **Thème avant analyse.** Aucun job automatique Places n’est créé si `mainTheme` n’est pas `Voyages` ou `Restaurant` après normalisation.
5. **Aucune dépendance de collection.** Places ne requiert pas de provenance de collection Instagram.
6. **Worker unique hors Vercel.** FFmpeg, OCR, transcription et analyse multimodale restent sur le VPS.
7. **MCP unique.** Les outils Places étendent le serveur MCP global.
8. **Queue PostgreSQL.** Redis n’est pas introduit en V1.
9. **Artefacts temporaires.** Frames, audio et médias de travail ne sont jamais renvoyés vers R2.

## Décisions à prendre avant les phases concernées

| Décision | Échéance | Recommandation |
| --- | --- | --- |
| Limitation de débit Vercel | Avant exposition API V1 | Utiliser une capacité distribuée, pas une Map locale |
| Autorisation des commandes Places | Avant API Places | Session admin pour l’UI et clé à scopes pour les clients de confiance |
| Pagination Places | Avant contrat Places | Préférer un curseur |
| Fournisseur carte et géocodage | Avant UI et pipeline | Séparer affichage et résolution ; l’IA ne fournit pas les coordonnées finales |
| Identité R2 canonique | Avant worker | Stocker la clé complète et un fingerprint vérifiable |
| Rôle PostgreSQL worker | Avant worker | Accès minimal aux jobs, médias autorisés et tables Places |
| Politique de restauration | Avant migration Places | Snapshot vérifié et procédure de retour ou forward recovery |
| Logs et alertes | Avant pilote VPS | Logs structurés, métriques queue, cleanup et coût |

## Plan d’exécution recommandé

Le détail autoritaire se trouve dans `CODEX_IMPLEMENTATION_ORDER.md`.

Résumé :

1. corriger la cohérence des filtres ;
2. centraliser l’éligibilité `Voyages` ou `Restaurant` ;
3. établir l’identité média R2 et l’isolation worker ;
4. créer l’API V1 ;
5. créer le worker global ;
6. créer le domaine Places metadata-first ;
7. créer la carte 2D et la navigation ;
8. ajouter l’analyse profonde ;
9. ajouter le globe 3D ;
10. étendre le MCP global et Hermes.

## Entrées manuelles nécessaires ultérieurement

- stockage sécurisé de la clé API brute et de son hash dans Vercel ;
- choix du fournisseur de carte et du fournisseur de résolution géographique ;
- accès au VPS et politique firewall/backup ;
- credentials R2 dédiés en lecture seule ;
- rôle PostgreSQL worker limité ;
- choix des providers IA, modèles, budgets et seuils ;
- validation humaine d’un pilote de 30 à 50 posts répartis entre `Voyages` et `Restaurant`.

## Critères de sortie de la phase 0

- les briefs ont été comparés au dépôt ;
- le schéma, les routes, services, thèmes, médias R2, déploiement et tests ont été inventoriés ;
- l’hypothèse de collection `Lieux` a été retirée du contrat produit ;
- les écarts sont classés et les dépendances ordonnées ;
- aucune migration, aucun endpoint et aucun comportement utilisateur n’a été modifié ;
- la prochaine phase peut démarrer sur une branche séparée avec un périmètre testable.

## Validation de la base existante lors de l’audit initial

Les contrôles exécutés sur le checkout de l’audit initial avaient donné :

- `npm run typecheck` : réussi ;
- `npm run test` : 23 fichiers et 113 tests réussis ;
- `npm run build` : réussi, 22 pages générées ;
- `git diff --check` sur le rapport : réussi ;
- `npm run lint` : bloqué uniquement par quatre avertissements dans un dossier utilisateur non suivi `.tmp/ig-saved-exporter-3.4.0`.

Ces résultats historiques ne remplacent pas les validations fraîches requises pour chaque future phase.
