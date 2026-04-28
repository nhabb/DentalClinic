-- Enable fuzzy-matching extensions for patient name search
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;  -- soundex(), levenshtein(), metaphone()
CREATE EXTENSION IF NOT EXISTS pg_trgm;         -- similarity(), word_similarity(), trigram operators
