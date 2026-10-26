-- Armada has its own rating, like a separate variant rating.
ALTER TABLE users
  ADD COLUMN armada_rating integer NOT NULL DEFAULT 1000,
  ADD COLUMN armada_games  integer NOT NULL DEFAULT 0;
CREATE INDEX users_armada_rating ON users (armada_rating DESC);

ALTER TABLE games ADD COLUMN mode text NOT NULL DEFAULT 'standard';
ALTER TABLE rating_history ADD COLUMN mode text NOT NULL DEFAULT 'standard';
CREATE INDEX rating_history_user_mode_at ON rating_history (user_id, mode, at);
