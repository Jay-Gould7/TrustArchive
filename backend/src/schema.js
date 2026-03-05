const { getPool } = require("./db");

async function currentDatabase(conn) {
  const [rows] = await conn.query("SELECT DATABASE() AS db");
  const db = rows?.[0]?.db ? String(rows[0].db) : "";
  if (!db) throw new Error("未选择数据库（请检查 MYSQL_DATABASE）");
  return db;
}

async function hasColumn(conn, db, table, column) {
  const [rows] = await conn.execute(
    `SELECT 1 AS ok
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [db, table, column]
  );
  return Boolean(rows && rows.length);
}

async function ensureColumn(conn, db, table, column, columnDefSql) {
  const exists = await hasColumn(conn, db, table, column);
  if (exists) return false;
  await conn.execute(`ALTER TABLE \`${table}\` ADD COLUMN ${columnDefSql}`);
  return true;
}

async function ensureSchema() {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    const db = await currentDatabase(conn);
    await conn.execute(
      `CREATE TABLE IF NOT EXISTS user_trust_scores (
        user_address VARCHAR(42) PRIMARY KEY,
        sbt_count INT NOT NULL DEFAULT 0,
        base_score DECIMAL(10,2) NOT NULL DEFAULT 0,
        behavior_score DECIMAL(10,2) NOT NULL DEFAULT 0,
        stability_score DECIMAL(10,2) NOT NULL DEFAULT 0,
        risk_penalty DECIMAL(10,2) NOT NULL DEFAULT 0,
        bonus_score DECIMAL(10,2) NOT NULL DEFAULT 0,
        total_score DECIMAL(10,2) NOT NULL DEFAULT 0,
        trust_level CHAR(1) NOT NULL DEFAULT 'C',
        onchain_level CHAR(1) NULL,
        onchain_value VARCHAR(66) NULL,
        onchain_updated_at DATETIME NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    await ensureColumn(conn, db, "user_trust_scores", "base_score", "`base_score` DECIMAL(10,2) NOT NULL DEFAULT 0");
    await ensureColumn(
      conn,
      db,
      "user_trust_scores",
      "behavior_score",
      "`behavior_score` DECIMAL(10,2) NOT NULL DEFAULT 0"
    );
    await ensureColumn(
      conn,
      db,
      "user_trust_scores",
      "stability_score",
      "`stability_score` DECIMAL(10,2) NOT NULL DEFAULT 0"
    );
    await ensureColumn(conn, db, "user_trust_scores", "risk_penalty", "`risk_penalty` DECIMAL(10,2) NOT NULL DEFAULT 0");
    await ensureColumn(conn, db, "user_trust_scores", "bonus_score", "`bonus_score` DECIMAL(10,2) NOT NULL DEFAULT 0");
    await ensureColumn(conn, db, "user_trust_scores", "total_score", "`total_score` DECIMAL(10,2) NOT NULL DEFAULT 0");
    await ensureColumn(conn, db, "user_trust_scores", "trust_level", "`trust_level` CHAR(1) NOT NULL DEFAULT 'C'");
    await ensureColumn(conn, db, "user_trust_scores", "onchain_level", "`onchain_level` CHAR(1) NULL");
    await ensureColumn(conn, db, "user_trust_scores", "onchain_value", "`onchain_value` VARCHAR(66) NULL");
    await ensureColumn(conn, db, "user_trust_scores", "onchain_updated_at", "`onchain_updated_at` DATETIME NULL");
    await ensureColumn(
      conn,
      db,
      "user_trust_scores",
      "updated_at",
      "`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
    );
    await ensureColumn(conn, db, "user_trust_scores", "created_at", "`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");

    await conn.execute(
      `CREATE TABLE IF NOT EXISTS verification_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_address VARCHAR(42) NOT NULL,
        cid VARCHAR(128) NOT NULL,
        issuer_address VARCHAR(42) NOT NULL DEFAULT '',
        issuer_name VARCHAR(255) NOT NULL DEFAULT '',
        is_success TINYINT(1) NOT NULL,
        reason VARCHAR(64) NOT NULL DEFAULT '',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user (user_address),
        INDEX idx_cid (cid)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    await ensureColumn(conn, db, "verification_logs", "user_address", "`user_address` VARCHAR(42) NOT NULL");
    await ensureColumn(conn, db, "verification_logs", "cid", "`cid` VARCHAR(128) NOT NULL DEFAULT ''");
    await ensureColumn(conn, db, "verification_logs", "issuer_address", "`issuer_address` VARCHAR(42) NOT NULL DEFAULT ''");
    await ensureColumn(conn, db, "verification_logs", "issuer_name", "`issuer_name` VARCHAR(255) NOT NULL DEFAULT ''");
    await ensureColumn(conn, db, "verification_logs", "is_success", "`is_success` TINYINT(1) NOT NULL DEFAULT 0");
    await ensureColumn(conn, db, "verification_logs", "reason", "`reason` VARCHAR(64) NOT NULL DEFAULT ''");
    await ensureColumn(conn, db, "verification_logs", "created_at", "`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");

    await conn.execute(
      `CREATE TABLE IF NOT EXISTS safe_link_creations (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_address VARCHAR(42) NOT NULL,
        cid VARCHAR(128) NOT NULL,
        expires_at BIGINT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_cid (cid),
        INDEX idx_user (user_address)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    await ensureColumn(conn, db, "safe_link_creations", "user_address", "`user_address` VARCHAR(42) NOT NULL");
    await ensureColumn(conn, db, "safe_link_creations", "cid", "`cid` VARCHAR(128) NOT NULL DEFAULT ''");
    await ensureColumn(conn, db, "safe_link_creations", "expires_at", "`expires_at` BIGINT NOT NULL DEFAULT 0");
    await ensureColumn(conn, db, "safe_link_creations", "created_at", "`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");

    await conn.execute(
      `CREATE TABLE IF NOT EXISTS share_health_rate (
        user_address VARCHAR(42) PRIMARY KEY,
        total_links INT NOT NULL DEFAULT 0,
        expired_links INT NOT NULL DEFAULT 0,
        health_rate DECIMAL(6,4) NOT NULL DEFAULT 1.0000,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    await ensureColumn(conn, db, "share_health_rate", "total_links", "`total_links` INT NOT NULL DEFAULT 0");
    await ensureColumn(conn, db, "share_health_rate", "expired_links", "`expired_links` INT NOT NULL DEFAULT 0");
    await ensureColumn(conn, db, "share_health_rate", "health_rate", "`health_rate` DECIMAL(6,4) NOT NULL DEFAULT 1.0000");
    await ensureColumn(
      conn,
      db,
      "share_health_rate",
      "updated_at",
      "`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
    );

    await conn.execute(
      `CREATE TABLE IF NOT EXISTS sync_state (
        id VARCHAR(64) PRIMARY KEY,
        last_block BIGINT NOT NULL DEFAULT 0,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );

    await conn.execute(
      `CREATE TABLE IF NOT EXISTS sbt_mint_events (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        source VARCHAR(32) NOT NULL,
        tx_hash VARCHAR(66) NOT NULL,
        log_index INT NOT NULL,
        block_number BIGINT NOT NULL DEFAULT 0,
        user_address VARCHAR(42) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_event (source, tx_hash, log_index),
        INDEX idx_user (user_address)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );

    await conn.execute(
      `CREATE TABLE IF NOT EXISTS trust_requirements (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        institution_id VARCHAR(42) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        secret_contact_encrypted VARCHAR(1024) NOT NULL,
        status ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
        application_count INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_institution_status_created (institution_id, status, created_at),
        KEY idx_status_created (status, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    await ensureColumn(conn, db, "trust_requirements", "institution_id", "`institution_id` VARCHAR(42) NOT NULL");
    await ensureColumn(conn, db, "trust_requirements", "title", "`title` VARCHAR(255) NOT NULL");
    await ensureColumn(conn, db, "trust_requirements", "description", "`description` TEXT NOT NULL");
    await ensureColumn(
      conn,
      db,
      "trust_requirements",
      "secret_contact_encrypted",
      "`secret_contact_encrypted` VARCHAR(1024) NOT NULL"
    );
    await ensureColumn(conn, db, "trust_requirements", "status", "`status` VARCHAR(16) NOT NULL DEFAULT 'OPEN'");
    await ensureColumn(conn, db, "trust_requirements", "application_count", "`application_count` INT NOT NULL DEFAULT 0");
    await ensureColumn(conn, db, "trust_requirements", "created_at", "`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
    await ensureColumn(
      conn,
      db,
      "trust_requirements",
      "updated_at",
      "`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
    );

    await conn.execute(
      `CREATE TABLE IF NOT EXISTS trust_file_shares (
        share_id VARCHAR(32) NOT NULL,
        cid VARCHAR(128) NOT NULL,
        expire_at DATETIME NOT NULL,
        max_views INT NOT NULL,
        current_views INT NOT NULL DEFAULT 0,
        created_by VARCHAR(42) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (share_id),
        KEY idx_created_by_created (created_by, created_at),
        KEY idx_expire_at (expire_at),
        KEY idx_cid (cid)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    await ensureColumn(conn, db, "trust_file_shares", "cid", "`cid` VARCHAR(128) NOT NULL");
    await ensureColumn(conn, db, "trust_file_shares", "expire_at", "`expire_at` DATETIME NOT NULL");
    await ensureColumn(conn, db, "trust_file_shares", "max_views", "`max_views` INT NOT NULL");
    await ensureColumn(conn, db, "trust_file_shares", "current_views", "`current_views` INT NOT NULL DEFAULT 0");
    await ensureColumn(conn, db, "trust_file_shares", "created_by", "`created_by` VARCHAR(42) NOT NULL");
    await ensureColumn(conn, db, "trust_file_shares", "created_at", "`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");

    await conn.execute(
      `CREATE TABLE IF NOT EXISTS trust_verify_tickets (
        ticket VARCHAR(128) NOT NULL,
        user_address VARCHAR(42) NOT NULL,
        sbt_token_id VARCHAR(80) NOT NULL,
        expire_at DATETIME NOT NULL,
        max_verify_times INT NOT NULL,
        used_times INT NOT NULL DEFAULT 0,
        scope_json JSON NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (ticket),
        KEY idx_user_expire (user_address, expire_at),
        KEY idx_expire_at (expire_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    await ensureColumn(conn, db, "trust_verify_tickets", "user_address", "`user_address` VARCHAR(42) NOT NULL");
    await ensureColumn(conn, db, "trust_verify_tickets", "sbt_token_id", "`sbt_token_id` VARCHAR(80) NOT NULL");
    await ensureColumn(conn, db, "trust_verify_tickets", "expire_at", "`expire_at` DATETIME NOT NULL");
    await ensureColumn(conn, db, "trust_verify_tickets", "max_verify_times", "`max_verify_times` INT NOT NULL");
    await ensureColumn(conn, db, "trust_verify_tickets", "used_times", "`used_times` INT NOT NULL DEFAULT 0");
    await ensureColumn(conn, db, "trust_verify_tickets", "scope_json", "`scope_json` JSON NOT NULL");
    await ensureColumn(conn, db, "trust_verify_tickets", "created_at", "`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");

    await conn.execute(
      `CREATE TABLE IF NOT EXISTS trust_applications (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        requirement_id BIGINT UNSIGNED NOT NULL,
        user_address VARCHAR(42) NOT NULL,
        normal_file_share_id VARCHAR(32) DEFAULT NULL,
        sbt_verify_ticket VARCHAR(128) DEFAULT NULL,
        sbt_verify_tickets_json JSON NULL,
        status ENUM('PENDING','PASSED','REJECTED') NOT NULL DEFAULT 'PENDING',
        institution_contact_encrypted VARCHAR(1024) DEFAULT NULL,
        reviewed_at DATETIME NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_requirement_status_created (requirement_id, status, created_at),
        KEY idx_user_created (user_address, created_at),
        KEY idx_status_created (status, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    await ensureColumn(conn, db, "trust_applications", "requirement_id", "`requirement_id` BIGINT UNSIGNED NOT NULL DEFAULT 0");
    await ensureColumn(conn, db, "trust_applications", "user_address", "`user_address` VARCHAR(42) NOT NULL");
    await ensureColumn(conn, db, "trust_applications", "normal_file_share_id", "`normal_file_share_id` VARCHAR(32) DEFAULT NULL");
    await ensureColumn(conn, db, "trust_applications", "sbt_verify_ticket", "`sbt_verify_ticket` VARCHAR(128) DEFAULT NULL");
    await ensureColumn(conn, db, "trust_applications", "sbt_verify_tickets_json", "`sbt_verify_tickets_json` JSON NULL");
    await ensureColumn(conn, db, "trust_applications", "status", "`status` VARCHAR(16) NOT NULL DEFAULT 'PENDING'");
    await ensureColumn(
      conn,
      db,
      "trust_applications",
      "institution_contact_encrypted",
      "`institution_contact_encrypted` VARCHAR(1024) DEFAULT NULL"
    );
    await ensureColumn(conn, db, "trust_applications", "reviewed_at", "`reviewed_at` DATETIME NULL");
    await ensureColumn(
      conn,
      db,
      "trust_applications",
      "updated_at",
      "`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
    );
    await ensureColumn(conn, db, "trust_applications", "created_at", "`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");

    await conn.execute(
      `CREATE TABLE IF NOT EXISTS trust_audit_logs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        actor_type ENUM('USER','INSTITUTION','API') NOT NULL,
        actor_id VARCHAR(128) NOT NULL,
        action_type VARCHAR(64) NOT NULL,
        target_id VARCHAR(128) NOT NULL DEFAULT '',
        result ENUM('SUCCESS','FAILED') NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_actor_time (actor_type, actor_id, created_at),
        KEY idx_action_time (action_type, created_at),
        KEY idx_target_time (target_id, created_at),
        KEY idx_result_time (result, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    await ensureColumn(conn, db, "trust_audit_logs", "actor_type", "`actor_type` VARCHAR(16) NOT NULL");
    await ensureColumn(conn, db, "trust_audit_logs", "actor_id", "`actor_id` VARCHAR(128) NOT NULL");
    await ensureColumn(conn, db, "trust_audit_logs", "action_type", "`action_type` VARCHAR(64) NOT NULL");
    await ensureColumn(conn, db, "trust_audit_logs", "target_id", "`target_id` VARCHAR(128) NOT NULL DEFAULT ''");
    await ensureColumn(conn, db, "trust_audit_logs", "result", "`result` VARCHAR(16) NOT NULL");
    await ensureColumn(conn, db, "trust_audit_logs", "created_at", "`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");

    await conn.execute(
      `CREATE TABLE IF NOT EXISTS trust_wallets (
        wallet_address VARCHAR(42) NOT NULL,
        role ENUM('USER','INSTITUTION') NOT NULL,
        balance DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (wallet_address)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    await ensureColumn(conn, db, "trust_wallets", "wallet_address", "`wallet_address` VARCHAR(42) NOT NULL");
    await ensureColumn(conn, db, "trust_wallets", "role", "`role` VARCHAR(24) NOT NULL");
    await ensureColumn(conn, db, "trust_wallets", "balance", "`balance` DECIMAL(18,4) NOT NULL DEFAULT 0.0000");
    await ensureColumn(
      conn,
      db,
      "trust_wallets",
      "updated_at",
      "`updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
    );

    await conn.execute(
      `CREATE TABLE IF NOT EXISTS trust_treasury_deposits (
        tx_hash VARCHAR(66) NOT NULL,
        log_index INT NOT NULL,
        block_number BIGINT NOT NULL DEFAULT 0,
        wallet_address VARCHAR(42) NOT NULL,
        amount_raw VARCHAR(80) NOT NULL,
        amount DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (tx_hash, log_index),
        KEY idx_wallet_time (wallet_address, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );

    await conn.execute(
      `CREATE TABLE IF NOT EXISTS trust_billing_ledger (
        action_id VARCHAR(80) NOT NULL,
        wallet_address VARCHAR(42) NOT NULL,
        role ENUM('USER','INSTITUTION') NOT NULL,
        action_type VARCHAR(64) NOT NULL,
        amount DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
        status ENUM('DEBITED','REFUNDED') NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (action_id),
        KEY idx_wallet_time (wallet_address, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );

    await conn.execute(
      `CREATE TABLE IF NOT EXISTS trust_platform_revenue (
        id VARCHAR(32) NOT NULL,
        balance DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );

    await conn.execute(
      `CREATE TABLE IF NOT EXISTS users (
        wallet_address VARCHAR(42) NOT NULL,
        public_key VARCHAR(140) NULL,
        password_envelope TEXT NULL,
        password_salt VARCHAR(64) NULL,
        password_kdf_iters INT NOT NULL DEFAULT 120000,
        recovery_envelope TEXT NULL,
        encrypted_mnemonic TEXT NULL,
        recovery_salt VARCHAR(64) NULL,
        recovery_kdf_iters INT NOT NULL DEFAULT 120000,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (wallet_address)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    await ensureColumn(conn, db, "users", "public_key", "`public_key` VARCHAR(140) NULL");
    await ensureColumn(conn, db, "users", "password_envelope", "`password_envelope` TEXT NULL");
    await ensureColumn(conn, db, "users", "password_salt", "`password_salt` VARCHAR(64) NULL");
    await ensureColumn(conn, db, "users", "password_kdf_iters", "`password_kdf_iters` INT NOT NULL DEFAULT 120000");
    await ensureColumn(conn, db, "users", "recovery_envelope", "`recovery_envelope` TEXT NULL");
    await ensureColumn(conn, db, "users", "encrypted_mnemonic", "`encrypted_mnemonic` TEXT NULL");
    await ensureColumn(conn, db, "users", "recovery_salt", "`recovery_salt` VARCHAR(64) NULL");
    await ensureColumn(conn, db, "users", "recovery_kdf_iters", "`recovery_kdf_iters` INT NOT NULL DEFAULT 120000");

    await conn.execute(
      `CREATE TABLE IF NOT EXISTS trust_share_access_tokens (
        token VARCHAR(80) NOT NULL,
        share_id VARCHAR(32) NOT NULL,
        cid VARCHAR(128) NOT NULL,
        expire_at DATETIME NOT NULL,
        max_uses INT NOT NULL DEFAULT 1,
        used_times INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (token),
        KEY idx_share_expire (share_id, expire_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
  } finally {
    conn.release();
  }
}

module.exports = {
  ensureSchema
};
