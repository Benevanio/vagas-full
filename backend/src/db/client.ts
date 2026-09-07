import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  // Limita só a espera por uma conexão. Sem isso, com o banco fora do ar,
  // qualquer `connect()` (inclusive o do /ready) fica pendurado para sempre.
  // Não é `statement_timeout`: cortar query em andamento globalmente quebraria
  // consultas legítimas mais longas e é decisão que merece card próprio.
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle(pool, { schema });

export { pool };
