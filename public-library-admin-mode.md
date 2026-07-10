# Plan — bibliothèque publique et mode administrateur

## Objectif

Rendre la consultation publique tout en réservant les imports et mutations à un
administrateur authentifié uniquement par mot de passe.

## Lots

- [x] Autoriser publiquement la bibliothèque, la recherche, les filtres et le détail.
- [x] Remplacer le formulaire e-mail/mot de passe par un accès administrateur par mot de passe.
- [x] Ajouter le bouton Admin près du sélecteur de thème et afficher l'état de session.
- [x] Interdire côté API et masquer côté UI l'import, l'édition des tags et la suppression aux visiteurs.
- [x] Simplifier le détail aux champs Thème, Likes et Commentaires.
- [x] Extraire Likes et Commentaires depuis les légendes importées.
- [x] Préserver les paragraphes et retours à la ligne des légendes.
- [x] Couvrir les parcours visiteur et administrateur par tests unitaires et E2E.
- [x] Exécuter lint, TypeScript, tests, build et review sécurité/accessibilité.

## Décisions

- Les routes de lecture restent publiques; les routes de mutation exigent une session admin.
- Le mot de passe n'est jamais stocké en clair et les erreurs restent génériques.
- Likes et Commentaires sont des valeurs dérivées de la légende, sans migration de données.
- Une valeur absente est affichée comme indisponible plutôt que comme zéro.
