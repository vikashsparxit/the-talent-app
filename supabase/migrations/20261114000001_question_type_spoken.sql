-- Spoken-answer questions: new question_type value.
--
-- Run manually after review. Not applied automatically.
-- Run this file on its own, BEFORE 20261114000002_assessment_media.sql:
-- ALTER TYPE ... ADD VALUE cannot be used in the same transaction as
-- statements that reference the new value.
--
-- Rollback: Postgres cannot drop an enum value. Leave it in place (unused is
-- harmless), or recreate the type without it once no question uses 'spoken'.

ALTER TYPE public.question_type ADD VALUE IF NOT EXISTS 'spoken';
