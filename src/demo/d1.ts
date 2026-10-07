import type { Database, SqlValue } from "sql.js";

// sql.js（ブラウザで動く SQLite）を Cloudflare D1 と同じ呼び出し方で使えるようにする。
// お試し版で、本物の API（src/worker）をそのままブラウザ内で動かすためのもの

type Row = Record<string, unknown>;

const norm = (v: unknown): SqlValue =>
  v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : (v as SqlValue);

class Statement {
  constructor(
    private db: Database,
    private sql: string,
    private params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new Statement(this.db, this.sql, params);
  }

  execSync() {
    const stmt = this.db.prepare(this.sql);
    try {
      stmt.bind(this.params.map(norm));
      const rows: Row[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as Row);
      return { results: rows, success: true, meta: { changes: this.db.getRowsModified() } };
    } finally {
      stmt.free();
    }
  }

  async first<T = Row>(column?: string): Promise<T | null> {
    const row = this.execSync().results[0];
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }

  async all<T = Row>() {
    return this.execSync() as { results: T[]; success: boolean; meta: { changes: number } };
  }

  async run() {
    return this.execSync();
  }
}

export function createD1(db: Database) {
  return {
    prepare: (sql: string) => new Statement(db, sql),
    // D1 の batch と同じく、まとめて成功するか、まとめて取り消されるか
    async batch(stmts: Statement[]) {
      db.exec("BEGIN");
      try {
        const results = stmts.map((s) => s.execSync());
        db.exec("COMMIT");
        return results;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
