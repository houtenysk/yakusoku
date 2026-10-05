-- LINE ユーザー。id は LINE の userId（ID トークンの sub）
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  picture_url TEXT,
  -- 罰金の送り先として表示する PayPay ID（任意）
  paypay_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 飲み会プール。罰金の積立先で、約束はどれかのプールに属する
CREATE TABLE pools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- お金を実際に預かる幹事
  holder_id TEXT NOT NULL REFERENCES users(id),
  invite_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE pool_members (
  pool_id TEXT NOT NULL REFERENCES pools(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (pool_id, user_id)
);
CREATE INDEX pool_members_user ON pool_members(user_id);

-- 約束。doer（やる側）が守れなかったら penalty_amount をプールに入れる
CREATE TABLE promises (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL REFERENCES pools(id),
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  doer_id TEXT NOT NULL REFERENCES users(id),
  checker_id TEXT NOT NULL REFERENCES users(id),
  penalty_amount INTEGER NOT NULL,
  -- once: 1 回きり / weekly: 判定のたびに 1 週間後の回を自動で作る
  cadence TEXT NOT NULL CHECK (cadence IN ('once', 'weekly')),
  first_due_at TEXT NOT NULL,
  -- pending: 相手の同意待ち / active: 有効 / ended: 終了 / cancelled: 不成立・取り消し
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'ended', 'cancelled')),
  created_by TEXT NOT NULL REFERENCES users(id),
  doer_agreed_at TEXT,
  checker_agreed_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX promises_pool ON promises(pool_id);

-- 約束の各回
CREATE TABLE rounds (
  id TEXT PRIMARY KEY,
  promise_id TEXT NOT NULL REFERENCES promises(id),
  seq INTEGER NOT NULL,
  due_at TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('pending', 'pass', 'fail')),
  score INTEGER,
  note TEXT NOT NULL DEFAULT '',
  judged_at TEXT,
  UNIQUE (promise_id, seq)
);

-- 帳簿。お金そのものは扱わず、誰が誰にいくら払うべきか・払ったかだけを記録する
CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL REFERENCES pools(id),
  -- penalty: 罰金（user_id → プール）/ expense: プールからの支出（幹事が記録）
  kind TEXT NOT NULL CHECK (kind IN ('penalty', 'expense')),
  promise_id TEXT REFERENCES promises(id),
  round_id TEXT UNIQUE REFERENCES rounds(id),
  -- penalty なら払う人、expense なら記録した幹事
  user_id TEXT NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  memo TEXT NOT NULL DEFAULT '',
  -- unpaid: 未払い（ツケ）/ reported: 支払い報告済み / confirmed: 幹事が受け取り確認済み / void: 取り消し
  -- expense は記録した時点で confirmed
  status TEXT NOT NULL CHECK (status IN ('unpaid', 'reported', 'confirmed', 'void')),
  reported_at TEXT,
  confirmed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX ledger_pool ON ledger_entries(pool_id);
