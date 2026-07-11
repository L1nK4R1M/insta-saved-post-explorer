UPDATE "posts"
SET "main_theme" = 'Cuisine'
WHERE lower("main_theme") IN ('cusine', 'cuisne');
