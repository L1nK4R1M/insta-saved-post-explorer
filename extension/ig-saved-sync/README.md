# Insta Saved Sync 4.2.6

Extension Chrome MV3 associée à Insta Post Explorer. Elle conserve les fonctions
d’export locales de la version 3.4 et ajoute le pont de synchronisation avec
`https://insta-saved-post-explorer.vercel.app` et la Preview develop stable
`https://insta-saved-post-explorer-git-develop-l1nk4r1ms-projects.vercel.app`.
Les autres déploiements Vercel restent volontairement bloqués.

La base PostgreSQL reste la source de vérité. Après une synchronisation web
réussie, l’extension aligne son index local sur les identifiants appariés de
la base et les posts acceptés pendant cette synchronisation. Une installation
neuve peut donc repartir d’une archive locale vide sans faux « à jour ».

Chargez ce dossier comme extension non empaquetée. Le fichier `manifest.json` doit
rester à la racine du dossier sélectionné.

L’onglet **Work from file** accepte les exports JSON/CSV et permet de limiter le
téléchargement par type de post, période et compte avant de lancer les médias.
