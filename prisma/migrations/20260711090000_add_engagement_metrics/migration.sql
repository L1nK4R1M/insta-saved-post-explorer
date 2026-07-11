ALTER TABLE "posts"
ADD COLUMN "likes_count" INTEGER,
ADD COLUMN "comments_count" INTEGER;

UPDATE "posts"
SET
  "likes_count" = CASE
    WHEN lower("caption") ~ '^[0-9]+([.,][0-9]+)?[km]? likes,' THEN
      round(
        CASE WHEN (regexp_match(lower("caption"), '^([0-9]+(?:[.,][0-9]+)?)([km]?) likes,'))[2] = ''
          THEN regexp_replace((regexp_match(lower("caption"), '^([0-9]+(?:[.,][0-9]+)?)([km]?) likes,'))[1], '[.,]', '', 'g')::numeric
          ELSE replace((regexp_match(lower("caption"), '^([0-9]+(?:[.,][0-9]+)?)([km]?) likes,'))[1], ',', '.')::numeric
        END
        * CASE (regexp_match(lower("caption"), '^([0-9]+(?:[.,][0-9]+)?)([km]?) likes,'))[2]
            WHEN 'k' THEN 1000 WHEN 'm' THEN 1000000 ELSE 1 END
      )::integer
    ELSE NULL
  END,
  "comments_count" = CASE
    WHEN lower("caption") ~ 'likes, [0-9]+([.,][0-9]+)?[km]? comments' THEN
      round(
        CASE WHEN (regexp_match(lower("caption"), 'likes, ([0-9]+(?:[.,][0-9]+)?)([km]?) comments'))[2] = ''
          THEN regexp_replace((regexp_match(lower("caption"), 'likes, ([0-9]+(?:[.,][0-9]+)?)([km]?) comments'))[1], '[.,]', '', 'g')::numeric
          ELSE replace((regexp_match(lower("caption"), 'likes, ([0-9]+(?:[.,][0-9]+)?)([km]?) comments'))[1], ',', '.')::numeric
        END
        * CASE (regexp_match(lower("caption"), 'likes, ([0-9]+(?:[.,][0-9]+)?)([km]?) comments'))[2]
            WHEN 'k' THEN 1000 WHEN 'm' THEN 1000000 ELSE 1 END
      )::integer
    ELSE NULL
  END;

CREATE INDEX "posts_owner_likes_count_id_idx" ON "posts"("owner_id", "likes_count", "id");
CREATE INDEX "posts_owner_comments_count_id_idx" ON "posts"("owner_id", "comments_count", "id");
