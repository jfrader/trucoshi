ALTER TABLE "UserStats" ADD COLUMN "elo" INTEGER NOT NULL DEFAULT 1000;

UPDATE "UserStats"
SET "elo" = LEAST(
  1200,
  GREATEST(
    800,
    1000 + ROUND(
      CASE
        WHEN ("win" + "loss") = 0 THEN 0
        ELSE (("win"::double precision / ("win" + "loss")::double precision) - 0.5) * 400
      END
    )::integer
  )
);
