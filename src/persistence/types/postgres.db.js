import pg from 'pg';
import { config } from '../../shared/config.js'; // Assumindo que sua config tem dados do banco

const { Pool } = pg;

// Configuração do Pool de conexões
const pool = new Pool({
  user: config.db.postgres.user,
  host: config.db.postgres.host,
  database: config.db.postgres.database,
  password: config.db.postgres.password,
  port: config.db.postgres.port || 5432,
});

class PostgresAdapter {
  constructor(name) {
    this.name = name; // Ex: "Session", "AccessToken", "Client"
  }

  // Método estático para testar conexão na inicialização (opcional, mas bom pra debug)
  static async connect() {
    const client = await pool.connect();
    client.release();
    console.log("Conectado ao PostgreSQL com sucesso!");
    return PostgresAdapter; // Retorna a própria classe para ser instanciada pelo provider
  }

  // Busca um registro pelo ID
  async find(id) {
    const query = `
      SELECT payload FROM oidc_store 
      WHERE id = $1 AND (expires_at IS NULL OR expires_at > NOW())
    `;
    const res = await pool.query(query, [id]);
    
    if (res.rows.length === 0) return undefined;
    
    const row = res.rows[0];
    // O node-oidc-provider espera datas como Epoch (números), o JSONB mantém isso, então ok.
    return row.payload; 
  }

  // Busca por ID do Usuário (Session)
  async findByUid(uid) {
    const query = `
      SELECT payload FROM oidc_store 
      WHERE uid = $1 AND (expires_at IS NULL OR expires_at > NOW()) 
      LIMIT 1
    `;
    const res = await pool.query(query, [uid]);
    return res.rows[0] ? res.rows[0].payload : undefined;
  }

  // Busca por User Code (Device Flow)
  async findByUserCode(userCode) {
    const query = `
      SELECT payload FROM oidc_store 
      WHERE user_code = $1 AND (expires_at IS NULL OR expires_at > NOW()) 
      LIMIT 1
    `;
    const res = await pool.query(query, [userCode]);
    return res.rows[0] ? res.rows[0].payload : undefined;
  }

  // Salva ou Atualiza (Upsert)
  async upsert(id, payload, expiresIn) {
    // Calculamos a data de expiração para a coluna SQL (facilita o cleanup job)
    const expiresAt = expiresIn ? new Date(Date.now() + (expiresIn * 1000)) : null;

    // Extraímos campos auxiliares para indexação
    const grantId = payload.grantId;
    const userCode = payload.userCode;
    const uid = payload.uid;

    const query = `
      INSERT INTO oidc_store (id, type, payload, grant_id, user_code, uid, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE 
      SET payload = $3, 
          grant_id = $4, 
          user_code = $5, 
          uid = $6, 
          expires_at = $7
    `;

    await pool.query(query, [
      id, 
      this.name, 
      payload, 
      grantId, 
      userCode, 
      uid, 
      expiresAt
    ]);
  }

  // Consome o código (marca como usado)
  async consume(id) {
    // Atualiza o JSONB setando 'consumed' e atualiza coluna auxiliar
    const query = `
      UPDATE oidc_store 
      SET payload = jsonb_set(payload, '{consumed}', to_jsonb(EXTRACT(EPOCH FROM NOW()))),
          consumed_at = NOW()
      WHERE id = $1
    `;
    await pool.query(query, [id]);
  }

  // Deleta um registro específico
  async destroy(id) {
    const query = 'DELETE FROM oidc_store WHERE id = $1';
    await pool.query(query, [id]);
  }

  // Revoga tudo relacionado a um Grant (Logout ou Revogação de Consentimento)
  async revokeByGrantId(grantId) {
    const query = 'DELETE FROM oidc_store WHERE grant_id = $1';
    await pool.query(query, [grantId]);
  }

  async findClientByJwksUri(jwksUri) {
    // Buscamos dentro do JSONB se existe algum registro do tipo 'Client' 
    // que tenha o campo 'jwks_uri' igual ao solicitado.
    const query = `
      SELECT payload FROM oidc_store 
      WHERE type = 'Client' 
      AND payload->>'jwks_uri' = $1
      LIMIT 1
    `;
    const result = await pool.query(query, [jwksUri]);
    return result.rows[0] ? result.rows[0].payload : undefined;
  }
}

//rotina de limpeza DELETE FROM oidc_store WHERE expires_at < NOW();

export default PostgresAdapter;