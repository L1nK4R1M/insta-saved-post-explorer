# CODEX_IMPLEMENTATION_ORDER.md

> Plan directeur de développement pour l’API, le worker global, Hermes/MCP et Places.  
> Ce document ordonne les briefs existants. Il ne remplace pas leurs contrats détaillés.

## 1. Objectif

Faire évoluer le dépôt existant sans le reconstruire et sans développer Places sur des fondations encore ambiguës.

La règle de livraison est :

```text
une phase = un périmètre limité = des tests = une preuve = une revue
```

Codex ne doit pas développer plusieurs phases en parallèle lorsqu’elles partagent le schéma, l’authentification ou les contrats API.

## 2. Architecture finale verrouillée

```text
Insta Post Explorer
├── Next.js sur Vercel
│   ├── UI existante
│   ├── section Places
│   ├── routes internes existantes
│   └── API externe /api/v1
├── PostgreSQL unique
├── Cloudflare R2 unique
├── worker VPS unique
│   ├── infrastructure partagée
│   └── handlers par domaine
└── serveur MCP unique
    ├── client API partagé
    └── outils par domaine
```

Places n’est pas un microservice autonome. C’est un domaine de la même application.

## 3. Documents et autorité

| Ordre | Document | Rôle |
| --- | --- | --- |
| 1 | `AGENTS.md` | règles globales et interdictions |
| 2 | `api-places-phase-0-audit.md` | état réel observé et blocages |
| 3 | `CODEX_IMPLEMENTATION_ORDER.md` | ordre des phases et gates |
| 4 | `CODEX_API_READY_ARCHITECTURE.md` | contrat de l’API externe V1 |
| 5 | `CODEX_PLACES_EXTENSION.md` | contrat fonctionnel et technique Places |

Le rapport d’audit reste une photographie de l’état initial. Les décisions d’architecture consolidées dans `AGENTS.md` et ce document ont priorité pour les travaux futurs.

## 4. Séquence de livraison

### Phase A. Stabilisation de la bibliothèque existante

**But :** éliminer les incohérences qui rendraient l’API externe trompeuse.

**Travaux autorisés :**

- partager les prédicats SQL entre liste, comptage et aléatoire ;
- appliquer auteur, année, collection, thème, type, tags et texte de façon cohérente ;
- ajouter des tests PostgreSQL ciblés ;
- confirmer que l’index plein texte existant n’est pas dupliqué ;
- ne pas réécrire le tri date en mémoire sans mesure.

**Gate de sortie A :**

- mêmes filtres sur liste, total et random ;
- tests ciblés verts ;
- aucun changement de comportement UI non demandé.

### Phase B. Provenance des collections Instagram

**But :** rendre la collection `Lieux` fiable comme source d’éligibilité.

**Travaux autorisés :**

- ajouter une provenance explicite aux collections ;
- transporter les appartenances dans import et synchronisation ;
- préserver les collections manuelles existantes ;
- synchroniser `CollectionPost` de façon idempotente ;
- documenter le comportement lors d’un renommage ou retrait côté Instagram.

**Gate de sortie B :**

- un fixture importé dans `Lieux` crée la relation attendue ;
- un second import ne crée aucun doublon ;
- un simple slug local `lieux` ne suffit pas à déclencher Places sans provenance vérifiée.

### Phase C. Identité média R2 et isolation worker

**But :** permettre à un worker restreint de lire uniquement un média autorisé.

**Travaux autorisés :**

- stocker ou dériver une clé R2 canonique ;
- conserver MIME, taille et fingerprint/version utile ;
- distinguer médias réparables et médias analysables ;
- créer un rôle PostgreSQL limité ;
- garantir `ownerId` dans les tables et requêtes accessibles au worker ;
- unifier ou documenter les variables `R2_BUCKET_NAME` et worker.

**Gate de sortie C :**

- aucune URL arbitraire n’est acceptée ;
- le worker ne peut lire qu’un objet R2 connu et autorisé ;
- les médias historiques incomplets sont signalés, pas devinés ;
- l’isolation propriétaire est testée.

### Phase D. API externe V1 en lecture

**But :** exposer la bibliothèque à Hermes et au futur MCP sans dupliquer la logique.

**Travaux autorisés :**

- authentification Bearer SHA-256 ;
- contrats et erreurs stables ;
- routes posts, détail, tags, collections, auteurs et stats ;
- OpenAPI ou documentation de contrat ;
- rate-limit compatible avec le déploiement choisi ;
- test réel de `deploy:check` en CI.

**Gate de sortie D :**

- routes historiques inchangées ;
- `/api/v1` protégé et testé ;
- services `src/server` réutilisés ;
- aucun accès direct MCP/Hermes à PostgreSQL.

### Phase E. Fondation du worker global

**But :** créer un seul processus asynchrone réutilisable sur le VPS.

**Nom et emplacement :**

```text
services/worker
insta-post-explorer-worker
```

**Travaux autorisés :**

- configuration partagée ;
- client PostgreSQL limité ;
- client R2 lecture seule ;
- dispatcher de handlers ;
- claim transactionnel ;
- lease et heartbeat ;
- retry borné ;
- healthcheck ;
- workdir temporaire ;
- cleanup `finally`, au démarrage et janitor ;
- Dockerfile et Docker Compose uniques.

**Gate de sortie E :**

- un job factice est réclamé et terminé ;
- un lease expiré est repris ;
- aucun fichier temporaire ne reste après succès ou exception ;
- aucun port du worker n’est public.

### Phase F. Domaine Places sans analyse vidéo profonde

**But :** valider le modèle métier et l’UX avec les données peu coûteuses.

**Travaux autorisés :**

- modèles Place, lien post-lieu, preuve et job ;
- analyse de caption, hashtags et localisation exportée ;
- résolution géographique officielle ;
- niveaux EXACT, PROBABLE, APPROXIMATE et UNKNOWN ;
- revue et correction humaine ;
- endpoints Places ;
- statistiques uniques par pays et continent.

**Gate de sortie F :**

- aucun modèle ne persiste directement des coordonnées inventées ;
- les doublons de lieu sont contrôlés ;
- les corrections humaines sont protégées ;
- `UNKNOWN` ne crée aucun point ;
- les statistiques comptent les lieux canoniques uniques.

### Phase G. Interface Places 2D et navigation contextuelle

**But :** fournir une première expérience complète avant le globe et l’analyse vidéo.

**Travaux autorisés :**

- bouton Places dans la navigation desktop et mobile ;
- `/places` avec cartes de statistiques ;
- carte 2D, liste, filtres et clusters ;
- répartition pays et continents ;
- bouton `Voir dans Places` sur les posts localisés ;
- deep links `postId`, `placeId`, pays et continent ;
- panneau de détail et file Review.

**Gate de sortie G :**

- navigation et historique navigateur fonctionnels ;
- un post ouvre son lieu ciblé ;
- plusieurs lieux cadrent correctement la carte ;
- les performances restent acceptables sur le volume réel.

### Phase H. Analyse vidéo profonde dans le handler Places

**But :** améliorer la couverture uniquement lorsque les métadonnées sont insuffisantes.

**Travaux autorisés :**

- FFprobe et FFmpeg ;
- extraction limitée de keyframes ;
- OCR ;
- transcription ;
- analyse multimodale ;
- scoring déterministe ;
- arrêt anticipé ;
- limites de coût et durée ;
- preuve textuelle et timestamp uniquement.

**Gate de sortie H :**

- zéro frame, audio ou vidéo temporaire après chaque job ;
- aucun artefact intermédiaire dans R2 ou PostgreSQL ;
- prompt injection testée ;
- pilote manuel de 30 à 50 posts ;
- coût moyen et taux de précision mesurés.

### Phase I. Globe 3D

**But :** ajouter la vue immersive sans dupliquer la logique métier.

**Travaux autorisés :**

- projection globe du moteur cartographique retenu ;
- sélection synchronisée avec Map, List et Review ;
- agrégats pays/continents ;
- `fly-to` ;
- rendu progressif et réduction de mouvement accessible.

**Gate de sortie I :**

- même source de données que la carte 2D ;
- aucun second service backend pour le globe ;
- comportement stable sur desktop et fallback mobile raisonnable.

### Phase J. MCP et Hermes

**But :** exposer tous les domaines par un seul adaptateur MCP.

**Nom et emplacement :**

```text
services/mcp
insta-post-explorer-mcp
```

**Travaux autorisés :**

- client `/api/v1` partagé ;
- outils Posts, Collections, Search et Analytics ;
- ajout des outils Places ;
- scopes et confirmations pour les commandes sensibles ;
- intégration unique dans Hermes.

**Gate de sortie J :**

- un seul serveur MCP déployé ;
- aucun accès DB ou R2 depuis MCP ;
- outils de lecture stables ;
- correction, fusion, rejet et analyse profonde demandent confirmation ;
- documentation Hermes unique.

## 5. Dépendances entre phases

```text
A -> D
B -> F
C -> E -> H
D -> F -> G -> I
D -> J
F -> J pour les outils Places
```

Codex peut préparer une branche de documentation à tout moment, mais ne doit pas implémenter une phase dont une dépendance n’est pas validée.

## 6. Découpage des pull requests

PR recommandées :

1. `fix/library-filter-consistency`
2. `feat/instagram-collection-provenance`
3. `feat/r2-media-identity`
4. `feat/external-api-v1`
5. `feat/global-worker-foundation`
6. `feat/places-domain`
7. `feat/places-map-ui`
8. `feat/places-deep-analysis`
9. `feat/places-globe-ui`
10. `feat/unified-mcp-server`

Une PR ne doit pas contenir plusieurs migrations indépendantes ou une refonte générale du dépôt.

## 7. Format de compte rendu Codex

Avant chaque PR, Codex doit produire :

```text
Phase active
Gate d’entrée vérifiée
Fichiers modifiés
Contrats ajoutés ou modifiés
Migrations
Tests ajoutés
Commandes exécutées
Résultats
Risques restants
Prochaine gate
```

Toute déviation du plan doit être explicitement expliquée avant modification.

## 8. Définition de terminé globale

Le programme API + Places + MCP n’est terminé que lorsque :

- toutes les gates A à J sont validées ;
- un seul worker et un seul MCP sont déployés ;
- l’application existante reste fonctionnelle ;
- les contrats API sont documentés ;
- les données `Lieux` et R2 ont une provenance vérifiable ;
- les migrations disposent d’une procédure de retour ou de forward recovery ;
- lint, typecheck, tests, build et E2E ciblés passent ;
- le pilote Places a été vérifié manuellement ;
- les documents reflètent le code livré.
