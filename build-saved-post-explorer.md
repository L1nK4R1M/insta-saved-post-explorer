# Plan de livraison — Saved Post Explorer

## Objectif

Livrer une application Next.js complète pour importer, rechercher, filtrer et administrer des publications Instagram sauvegardées, selon le design D « Mosaïque », avec thèmes clair, sombre et système.

## Lots

- [x] Concevoir et valider la direction UI/UX D avec déclinaisons responsive et thématiques.
- [x] Mettre en place Next.js, TypeScript strict, Tailwind, Radix UI et Prisma/PostgreSQL.
- [x] Implémenter l’import JSON idempotent, la normalisation, la recherche et les filtres.
- [x] Protéger l’application et les API par une session administrateur isolée par propriétaire.
- [x] Ajouter l’administration des tags et la suppression des publications.
- [x] Ajouter les tests unitaires, E2E, visuels et la validation sur PostgreSQL réel.
- [x] Préparer les migrations, le seed, la CI et la configuration Vercel.
- [x] Relancer les gates finales après intégration des derniers retours QA.
- [ ] Déployer après fourniture d’un projet Vercel, d’une base PostgreSQL distante et des secrets.

## Critères de sortie

- `npm run lint`, `npm run typecheck`, `npm run test` et `npm run build` réussissent.
- Les E2E bibliothèque réussissent en mode local de test.
- Les E2E auth/import réussissent avec authentification réelle et PostgreSQL jetable.
- Aucune vulnérabilité npm de production n’est signalée.
- Le déploiement reste bloqué tant que les accès Vercel et la base de production ne sont pas disponibles.
