# Audit de préparation API V1 et Places — phase 0

Date : 21 juillet 2026  
Branche : `codex/phase-0-api-places-audit`  
Périmètre : audit statique du dépôt, sans modification fonctionnelle, sans migration et sans interrogation de la base de production.

## Verdict

L'application actuelle constitue un bon socle monolithique pour la bibliothèque Instagram : les routes réutilisent les services serveur, les lectures sont limitées au propriétaire configuré, les médias multiples sont normalisés et la recherche plein texte dispose déjà de son index GIN.

Elle n'est toutefois pas prête à exposer l'API V1 ni à démarrer Places en sécurité. L'ordre recommandé est :

1. stabiliser l'API externe V1 et les filtres de recherche ;
2. synchroniser la provenance des collections Instagram, notamment `Lieux` ;
3. rendre l'identité des objets R2 exploitable par un worker restreint ;
4. renforcer les contraintes de propriétaire avant tout accès PostgreSQL direct par le worker ;
5. seulement ensuite créer le domaine Places et sa queue.

Le verrou principal pour Places est concret : une collection applicative nommée `Lieux` peut être créée manuellement, mais l'import et la synchronisation actuels ne transportent pas l'appartenance aux collections Instagram. Elle ne constitue donc pas encore une source d'éligibilité fiable.

## Références autoritaires

- [Architecture API V1](./CODEX_API_READY_ARCHITECTURE.md)
- [Extension Places](./CODEX_PLACES_EXTENSION.md)

Le dépôt ne contient pas de fichier `AGENTS.md`. Cette absence a été signalée avant l'audit et la lecture des deux documents ci-dessus a été confirmée comme suffisante.

## Architecture actuelle

| Domaine | État actuel | Évaluation |
| --- | --- | --- |
| Application | Next.js 16, React 19, TypeScript strict, Prisma/PostgreSQL | Socle compatible |
| Services | La logique de bibliothèque se trouve principalement dans `src/server/library.ts` | Bonne source de vérité à réutiliser |
| Routes web | Routes historiques sous `/api/*`, publiques en lecture et session admin pour les écritures | À préserver sans rupture |
| API externe | Aucun dossier `/api/v1`, aucun contrat V1, aucune clé Bearer dédiée | Absent, bloquant API |
| Propriétaire | `APP_OWNER_ID` appliqué par les services principaux | Correct au niveau applicatif, incomplet au niveau relationnel |
| Recherche | Filtres typés, curseurs, recherche PostgreSQL et fallback local | Deux incohérences à corriger |
| Collections | `Collection` et `CollectionPost`, gestion manuelle, collection système `Favoris` | Pas de provenance Instagram |
| Médias | `PostMedia` avec type, URL, `sourcePath`, miniature et position | Suffisant pour l'affichage, incomplet pour un worker |
| R2 | Upload signé/direct, validation de clé, contrôle de taille, URL publique | Bon socle d'écriture ; aucun contrat worker en lecture seule |
| Places | Aucun modèle, service, endpoint, feature flag, worker ou UI | Entièrement à construire |
| Déploiement | Préflight Vercel pour DB, auth, propriétaire et R2 | Variables API/Places absentes |

## Constats détaillés

### P0 — L'API externe V1 n'existe pas

Il n'existe ni `src/app/api/v1`, ni `src/auth/api-key.ts`, ni contrats sous `src/contracts/api`, ni tests V1. Les routes de lecture historiques telles que `src/app/api/posts/route.ts`, `authors`, `tags`, `collections` et `stats` restent publiques pour le site.

L'authentification existante est une session administrateur par cookie. Elle ne doit pas être détournée pour Hermes ou MCP. La V1 doit ajouter l'authentification Bearer SHA-256 prévue par le brief, sans modifier le fonctionnement de la session web.

`EXTERNAL_API_KEY_SHA256` est absent de `.env.example` et de `scripts/vercel-preflight.mjs`. Le format d'erreur actuel de `src/server/http.ts` est plat (`{ "error": "CODE" }`) alors que la V1 demande un objet stable avec `code` et `message`. Un adaptateur V1 séparé évitera une rupture des routes existantes.

Aucune politique de limitation de débit n'est implémentée. Une limite en mémoire locale ne serait pas fiable sur plusieurs instances Vercel ; la stratégie doit être explicitement choisie avant publication externe.

### P0 — La collection Instagram `Lieux` n'est pas une donnée fiable

Le schéma prend en charge une relation plusieurs-à-plusieurs entre les posts et les collections, mais `Collection` ne conserve que `name`, `slug`, `isSystem` et `isPublic`. Il n'existe aucun identifiant de collection Instagram, aucune provenance et aucun horodatage de synchronisation.

La chaîne actuelle confirme l'écart :

- `src/lib/import/normalize.ts` ne déclare aucun champ ni alias de collection ;
- `src/server/import-posts.ts` persiste posts, médias et tags, mais aucune collection ;
- `src/app/api/sync/posts/route.ts` n'accepte aucune appartenance à une collection ;
- la migration `20260714090000_add_collections` crée et rétroalimente uniquement `Favoris` depuis le tag du même nom ;
- l'extension sait cibler une collection Instagram dans certains flux, mais la synchronisation web standard ne transmet pas cette information à l'application.

Conséquence : Places ne doit pas encore créer de jobs à partir du simple nom ou slug `lieux`.

Correction préalable recommandée : ajouter une provenance explicite à `Collection` (`source`, `externalId`, `lastSyncedAt` ou équivalent), transporter les appartenances dans le contrat d'import/synchronisation et prouver par test que la collection Instagram cible alimente la relation `CollectionPost` de manière idempotente.

### P1 — Les filtres de pertinence ne sont pas cohérents

`queryRelevantPosts()` applique thème, type, auteur, année, collection, tags et texte. En revanche :

- `countRelevantPosts()` omet l'auteur, l'année et la collection ;
- `getRandomRelevantPost()` omet ces mêmes filtres dans sa sélection ;
- le chemin aléatoire sans pertinence omet aussi l'auteur, l'année et la collection.

Le fallback mémoire applique ces filtres, ce qui peut masquer le défaut hors base de données. Les conséquences sont un `totalFiltered` erroné, des pages annoncées sans résultats et un bouton Découverte susceptible de sortir du périmètre actif.

La correction doit construire un filtre partagé utilisé par la liste, le comptage et les deux chemins aléatoires, avec des tests PostgreSQL ciblés.

### P1 — L'index plein texte existe déjà

La migration initiale crée `posts_search_text_fts_idx` avec l'expression `to_tsvector('simple', "search_text")`, ainsi qu'un index trigramme. Aucun nouvel index équivalent ne doit être ajouté.

Le tri `newest`/`oldest` charge actuellement tous les identifiants candidats puis trie en mémoire sur `savedAt ?? createdAt`. Le brief demande explicitement de conserver cette dette en V1 tant qu'une mesure ne justifie pas une réécriture SQL.

### P1 — Les références R2 ne suffisent pas à garantir une analyse reproductible

`PostMedia` stocke `url`, `sourcePath`, `thumbnailUrl`, `type` et `position`. Les chemins d'upload sont déterministes et assainis ; la synchronisation vérifie la clé attendue et la taille de l'objet. Ces garanties sont adaptées à l'affichage et à l'import actuel.

Pour Places, il manque toutefois une identité de stockage autoritaire et durable : clé R2 complète, type MIME vérifié, taille, ETag/version ou checksum, et date de contrôle. Comme `sourcePath` est nullable, certains médias historiques peuvent aussi n'être représentés que par une URL.

Le worker ne devra jamais télécharger une URL arbitraire. Une analyse profonde doit être autorisée uniquement pour un objet R2 connu en base et situé sous le préfixe permis. Les lignes historiques sans identité R2 pourront rester éligibles à l'analyse de métadonnées, puis être signalées comme « média à réparer » pour l'analyse profonde.

Le nom de variable diffère entre l'application (`R2_BUCKET_NAME`) et le brief worker (`R2_BUCKET`). Il faut soit l'unifier, soit documenter explicitement le mapping.

### P1 — L'isolation par propriétaire doit être renforcée avant le worker

`Post`, `Collection`, `Tag`, `ImportJob` et `SyncJob` possèdent `ownerId`, et les services vérifient correctement le propriétaire dans les principaux chemins. En revanche, `CollectionPost`, `PostMedia` et `PostTag` héritent seulement du propriétaire par relation. Aucune politique PostgreSQL RLS n'est présente.

Cette convention reste acceptable avec un seul processus applicatif contrôlant toutes les écritures. Elle devient plus risquée lorsqu'un worker VPS réclame directement des jobs en PostgreSQL.

Toutes les tables Places de premier niveau et tous les jobs devront inclure `ownerId`. Les relations critiques devront garantir le même propriétaire par contraintes composites ou par une vue/rôle PostgreSQL strictement limité. Le claim, le lease et les index d'idempotence devront eux aussi inclure le propriétaire.

### P1 — Le domaine Places est absent, conformément à l'état attendu avant phase 1

Aucun modèle `Place`, lien post-lieu, preuve, job, enum, repository, feature flag, route, dépendance cartographique, service Python, dossier `services/` ou déploiement worker n'est présent.

`UNKNOWN` doit rester un résultat d'analyse ou un état de revue. Il ne doit pas créer un faux lieu canonique ni une coordonnée arbitraire.

### P1 — Les gates de déploiement et l'observabilité doivent être étendus

Vercel exécute bien `deploy:check` avant le build, mais la CI lance directement lint, types, tests et build. Elle ne prouve donc pas aujourd'hui que le preflight de production réussira. Son `ADMIN_PASSWORD_HASH` de test n'est par ailleurs pas un hash bcrypt valide pour ce contrôle. L'ajout de `EXTERNAL_API_KEY_SHA256` devra s'accompagner d'un test CI réel du preflight avec des valeurs factices valides.

Le healthcheck actuel couvre PostgreSQL et l'état de l'authentification. Places exigera en plus des signaux séparés pour la profondeur de queue, les jobs bloqués, les leases expirés, la disponibilité du worker, les erreurs R2/provider, la durée, l'espace temporaire et le coût. Le worker ne doit pas exposer de port public ; son healthcheck Docker et les alertes de l'hôte suffisent.

La documentation CSP est également désynchronisée de `vercel.json` à propos de `script-src` et `style-src`. Cette dette n'empêche pas l'audit, mais doit être corrigée avant de présenter la documentation de déploiement Places comme autoritaire.

### P2 — La stratégie de migration doit être clarifiée

Le dépôt utilise des migrations SQL Prisma explicites. `.env.example` déclare `DATABASE_DIRECT_URL`, mais le datasource Prisma n'utilise pas actuellement `directUrl`. Il faut vérifier si `DATABASE_URL` est poolée en production avant la migration Places et configurer le canal direct si nécessaire.

Les migrations existantes n'ont pas de script de rollback. Pour Places, il faut préparer avant application soit un rollback SQL revu, soit une procédure documentée de restauration/forward recovery compatible avec Neon.

### P2 — La couverture actuelle ne protège pas les requêtes SQL concernées

Les tests couvrent le parsing de requête, le fallback mémoire, les routes auteurs/collections et les principaux parcours UI. Les E2E de bibliothèque utilisent cependant les données fallback et ne détectent pas les omissions SQL ci-dessus.

La prochaine phase doit ajouter des tests de base ciblés pour : auteur + année + collection en pertinence, comptage, random normal, random pertinent, pagination et isolation `ownerId`.

## Décisions d'architecture

### Décisions retenues

1. **API d'abord.** L'API V1 générique doit être stable avant le contrat Places et avant Hermes/MCP.
2. **Services serveur comme source de vérité.** Les routes `/api/v1` restent de fins adaptateurs. Les Server Components peuvent appeler les services sans boucle HTTP ; les composants clients et clients externes passent par les routes appropriées.
3. **Une architecture d'authentification, plusieurs capacités.** La clé V1 initiale reste en lecture seule. Les futures commandes Places ne doivent pas devenir accessibles à cette clé. Le mécanisme devra évoluer vers des capacités/scopes ou réutiliser la session admin pour les actions humaines, sans créer un système d'identité parallèle.
4. **Provenance avant analyse.** Aucun job Places n'est créé tant que l'identité de la collection `Lieux` et celle du média R2 ne sont pas vérifiables.
5. **Worker hors Vercel.** FFmpeg, OCR, transcription et analyse multimodale restent sur le VPS ; seules les données structurées persistantes reviennent en PostgreSQL.
6. **Queue PostgreSQL.** Redis n'est pas introduit en V1. Le worker utilise un rôle dédié, le claim transactionnel, un lease et un heartbeat.
7. **Artefacts temporaires.** Frames, audio et médias de travail ne sont jamais renvoyés vers R2 et sont supprimés par `finally`, nettoyage au démarrage et janitor.

### Décisions à prendre avant les phases concernées

| Décision | Échéance | Recommandation |
| --- | --- | --- |
| Limitation de débit Vercel | Avant exposition API V1 | Privilégier une capacité plateforme ou un stockage distribué ; éviter une Map locale |
| Autorisation des commandes Places | Avant API Places | Session admin pour l'UI humaine et clé à scopes pour les clients de confiance |
| Pagination Places `page/page_size` ou curseur | Avant contrat Places | Préférer un curseur pour les grandes listes ; accepter `page` seulement si le besoin UI le justifie |
| Fournisseur carte et géocodage | Avant UI/pipeline | Choisir séparément affichage cartographique et résolution ; l'IA ne fournit jamais les coordonnées finales |
| Identité R2 canonique | Avant worker | Stocker la clé complète et un fingerprint vérifiable ; refuser les URL externes |
| Rôle PostgreSQL worker | Avant worker | Accès minimal aux jobs, médias autorisés et tables Places, sans privilège admin |
| Politique de restauration | Avant migration Places | Snapshot/backup vérifié plus procédure de rollback ou forward recovery |
| Logs et alertes | Avant pilote VPS | Logs structurés sans secrets/médias, métriques queue/cleanup/coût et alertes sur jobs bloqués |

## Plan d'exécution recommandé

Chaque phase doit rester sur une branche dédiée et franchir ses propres tests avant fusion dans `develop`.

### Phase A — API externe V1

Branche proposée : `codex/phase-1-external-api-v1`

1. partager les filtres SQL et corriger comptage/random ;
2. ajouter les tests de régression PostgreSQL ;
3. ajouter la clé Bearer SHA-256 avec comparaison constante ;
4. ajouter l'adaptateur d'erreurs et les en-têtes V1 ;
5. créer les six routes V1 comme adaptateurs des services ;
6. mettre en place la limitation de débit ;
7. mettre à jour environnement, preflight et documentation ;
8. exécuter le preflight aussi en CI avec des secrets factices valides ;
9. valider lint, types, tests, build et contrats.

### Phase B — Provenance des collections et contrat média

Branche proposée : `codex/phase-1b-places-input-contract`

1. étendre `Collection` avec sa provenance Instagram ;
2. transporter les appartenances pendant import et synchronisation ;
3. ajouter les métadonnées R2 autoritaires ;
4. rétroalimenter et inventorier les médias non réparables ;
5. prouver l'idempotence et l'éligibilité exacte de `Lieux`.

### Phase C — Fondation Places

Branche proposée : `codex/phase-2-places-foundation`

Ajouter feature flag, enums, tables normalisées, contraintes de propriétaire, coordonnées, déduplication, jobs idempotents, lease/indexes, audit de fusion, repositories et tests de domaine.

### Phase D — API Places

Branche proposée : `codex/phase-3-places-api`

Ajouter lectures, statistiques, unresolved/nearby, création idempotente des jobs et commandes confirm/correct/reject/merge avec autorisations explicites et tests de contrat.

### Phase E — Worker sûr sans IA

Branche proposée : `codex/phase-4-places-worker-foundation`

Créer le service Python, le rôle PostgreSQL, le claim/lease/heartbeat, le téléchargement R2 limité, le workdir, les trois couches de nettoyage et leurs tests. Aucun provider IA ne doit être ajouté avant réussite des tests de suppression.

Le conteneur devra fonctionner en utilisateur non-root, avec filesystem en lecture seule hors volume temporaire, sans port publié, et produire des logs structurés expurgés de tout secret ou contenu média.

### Phases F à I

1. pipeline métadonnées puis escalade OCR/transcription/multimodal ;
2. UI Places responsive, carte, revue et globe ;
3. clients Hermes/MCP avec confirmation des actions ;
4. déploiement VPS puis pilote humain de 30 à 50 posts avant analyse complète.

## Entrées manuelles qui seront nécessaires

Rien de manuel n'est requis pour cet audit. Les prochaines phases demanderont progressivement :

- le stockage sécurisé de la clé API brute et de son hash dans Vercel ;
- le choix du fournisseur de carte et du fournisseur de résolution géographique ;
- les accès au VPS et sa politique firewall/backup ;
- la création de credentials R2 dédiés en lecture seule ;
- la création d'un rôle PostgreSQL worker limité ;
- le choix des providers IA, modèles, budgets et seuils d'escalade ;
- une validation humaine du pilote `Lieux`.

## Critères de sortie de la phase 0

- les deux briefs ont été lus et comparés au dépôt ;
- le schéma, les routes, services, collections, médias R2, déploiement et tests ont été inventoriés ;
- les écarts sont classés et les dépendances ordonnées ;
- aucune migration, aucun endpoint et aucun comportement utilisateur n'a été modifié ;
- la prochaine phase peut démarrer sur une branche séparée avec un périmètre testable.

## Validation de la base existante

Les contrôles ont été exécutés depuis le checkout principal, qui possède les dépendances installées et porte le même code applicatif que la branche d'audit :

- `npm run typecheck` : réussi ;
- `npm run test` : 23 fichiers et 113 tests réussis ;
- `npm run build` : réussi, 22 pages générées ;
- `git diff --check` sur le rapport : réussi ;
- `npm run lint` : bloqué uniquement par quatre avertissements dans le dossier utilisateur non suivi `.tmp/ig-saved-exporter-3.4.0` (variables inutilisées). Aucun fichier hors périmètre n'a été modifié pour masquer cette dette locale.
