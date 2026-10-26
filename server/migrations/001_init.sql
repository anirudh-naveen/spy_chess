CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text NOT NULL,
  email         text NOT NULL,
  pass_hash     text NOT NULL,
  rating        integer NOT NULL DEFAULT 1000,
  games_played  integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username_lower ON users (lower(username));
CREATE UNIQUE INDEX users_email_lower ON users (lower(email));
CREATE INDEX users_rating ON users (rating DESC);

-- Players are referenced by player id: a user uuid, or a "g_..." guest id.
CREATE TABLE games (
  id            text PRIMARY KEY,
  rated         boolean NOT NULL,
  status        text NOT NULL,            -- waiting | setup | play | over
  creator       text,
  white         text,
  black         text,
  white_name    text,
  black_name    text,
  white_user    uuid REFERENCES users(id),
  black_user    uuid REFERENCES users(id),
  setup_white   jsonb,
  setup_black   jsonb,
  moves         jsonb NOT NULL DEFAULT '[]',
  clocks        jsonb,
  -- Live-game bookkeeping (seats, deadlines, clock start, draw offer), so a game survives a restart.
  runtime       jsonb,
  result        jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz
);
CREATE INDEX games_status ON games (status) WHERE status <> 'over';
CREATE INDEX games_white_user ON games (white_user, ended_at DESC);
CREATE INDEX games_black_user ON games (black_user, ended_at DESC);

CREATE TABLE rating_history (
  user_id   uuid NOT NULL REFERENCES users(id),
  game_id   text NOT NULL REFERENCES games(id),
  before    integer NOT NULL,
  after     integer NOT NULL,
  at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_id)
);
CREATE INDEX rating_history_user_at ON rating_history (user_id, at);

CREATE TABLE marks (
  game_id   text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player    text NOT NULL,
  piece_id  text NOT NULL,
  guess     text NOT NULL,
  PRIMARY KEY (game_id, player, piece_id)
);
