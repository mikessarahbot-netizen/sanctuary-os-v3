import { describe, expect, it } from "vitest";
import {
  CommunityInitialMigrationIndexNames,
  CommunityInitialMigrationTableNames,
  CommunityInitialSchemaMigration,
  CommunitySqlMigrations,
  SqlMigrationArtifactSchema,
  calculateSqlMigrationChecksum
} from "./index.js";

describe("Community initial migration artifact", () => {
  it("defines a valid SQL artifact with a stable checksum", () => {
    expect(SqlMigrationArtifactSchema.parse(CommunityInitialSchemaMigration)).toEqual(
      CommunityInitialSchemaMigration
    );
    expect(CommunityInitialSchemaMigration.transactional).toBe(true);
    expect(CommunityInitialSchemaMigration.checksum).toBe(
      calculateSqlMigrationChecksum(CommunityInitialSchemaMigration)
    );
    expect(CommunityInitialSchemaMigration.checksum).toMatch(/^fnv1a32:[0-9a-f]{8}$/u);
  });

  it("declares the community tables and indexes with tenant scope", () => {
    expect(CommunityInitialSchemaMigration.requiredTables).toEqual([
      ...CommunityInitialMigrationTableNames
    ]);
    expect(CommunityInitialSchemaMigration.requiredIndexes).toEqual([
      ...CommunityInitialMigrationIndexNames
    ]);
    expect(CommunityInitialSchemaMigration.tenantScopedTables).toEqual([
      ...CommunityInitialMigrationTableNames
    ]);
  });

  it("creates each table and index in the forward SQL", () => {
    for (const table of CommunityInitialMigrationTableNames) {
      expect(CommunityInitialSchemaMigration.upSql).toContain(`CREATE TABLE ${table} (`);
    }
    for (const index of CommunityInitialMigrationIndexNames) {
      expect(CommunityInitialSchemaMigration.upSql).toContain(index);
    }
  });

  it("leads every table primary key with tenant_id", () => {
    expect(CommunityInitialSchemaMigration.upSql).toContain("PRIMARY KEY (tenant_id, member_id)");
    expect(CommunityInitialSchemaMigration.upSql).toContain(
      "PRIMARY KEY (tenant_id, household_ref)"
    );
    expect(CommunityInitialSchemaMigration.upSql).toContain("PRIMARY KEY (tenant_id, group_id)");
    expect(CommunityInitialSchemaMigration.upSql).toContain(
      "PRIMARY KEY (tenant_id, membership_id)"
    );
    expect(CommunityInitialSchemaMigration.upSql).toContain(
      "PRIMARY KEY (tenant_id, attendance_id)"
    );
    expect(CommunityInitialSchemaMigration.upSql).toContain("PRIMARY KEY (tenant_id, message_id)");
    expect(CommunityInitialSchemaMigration.upSql).toContain(
      "PRIMARY KEY (tenant_id, recipient_id)"
    );
    expect(CommunityInitialSchemaMigration.upSql).toContain("PRIMARY KEY (tenant_id, summary_id)");
  });

  it("enforces the schema version and enum constraints", () => {
    expect(CommunityInitialSchemaMigration.upSql).toContain("schema_version = 'community.v1'");
    expect(CommunityInitialSchemaMigration.upSql).toContain(
      "status IN ('active', 'inactive', 'visitor', 'archived')"
    );
    expect(CommunityInitialSchemaMigration.upSql).toContain(
      "kind IN ('small-group', 'serving-team', 'ministry', 'class', 'other')"
    );
    expect(CommunityInitialSchemaMigration.upSql).toContain(
      "role_in_group IN ('leader', 'co-leader', 'member', 'guest')"
    );
    expect(CommunityInitialSchemaMigration.upSql).toContain(
      "status IS NULL OR status IN ('present', 'absent', 'excused')"
    );
    expect(CommunityInitialSchemaMigration.upSql).toContain("channel IN ('sms', 'email', 'push')");
    expect(CommunityInitialSchemaMigration.upSql).toContain(
      "status IN ('draft', 'reviewed', 'confirmed', 'queued', 'sent', 'failed', 'canceled')"
    );
    expect(CommunityInitialSchemaMigration.upSql).toContain("origin IN ('human', 'ai-drafted')");
    expect(CommunityInitialSchemaMigration.upSql).toContain(
      "send_status IN ('pending', 'sent', 'delivered', 'failed', 'suppressed')"
    );
    expect(CommunityInitialSchemaMigration.upSql).toContain("scope_kind IN ('member', 'segment')");
  });

  it("enforces boolean, count, and headcount-xor-member constraints", () => {
    expect(CommunityInitialSchemaMigration.upSql).toContain("archived IN (0, 1)");
    expect(CommunityInitialSchemaMigration.upSql).toContain("active IN (0, 1)");
    expect(CommunityInitialSchemaMigration.upSql).toContain("confirmed IN (0, 1)");
    expect(CommunityInitialSchemaMigration.upSql).toContain("headcount IS NULL OR headcount > 0");
    expect(CommunityInitialSchemaMigration.upSql).toContain(
      "(member_ref IS NOT NULL AND status IS NOT NULL AND headcount IS NULL)"
    );
    expect(CommunityInitialSchemaMigration.upSql).toContain("attendance_streak >= 0");
    expect(CommunityInitialSchemaMigration.upSql).toContain("serving_count >= 0");
    expect(CommunityInitialSchemaMigration.upSql).toContain("comms_response_count >= 0");
    expect(CommunityInitialSchemaMigration.upSql).toContain("window_end >= window_start");
  });

  it("gates send-eligible statuses behind a recorded confirmation", () => {
    expect(CommunityInitialSchemaMigration.upSql).toContain(
      "status NOT IN ('confirmed', 'queued', 'sent') OR confirmed = 1"
    );
    expect(CommunityInitialSchemaMigration.upSql).toContain(
      "confirmed_by_ref IS NOT NULL AND confirmation_reason IS NOT NULL AND confirmed_at IS NOT NULL"
    );
    expect(CommunityInitialSchemaMigration.upSql).toContain("subject IS NULL OR channel = 'email'");
  });

  it("scopes engagement summaries to one of member or segment", () => {
    expect(CommunityInitialSchemaMigration.upSql).toContain(
      "(scope_kind = 'member' AND member_ref IS NOT NULL AND segment_ref IS NULL)"
    );
    expect(CommunityInitialSchemaMigration.upSql).toContain(
      "(scope_kind = 'segment' AND segment_ref IS NOT NULL AND member_ref IS NULL)"
    );
  });

  it("stores contact data only as opaque channel refs (no raw PII columns)", () => {
    // Strictest-privacy module: contact data is an opaque channel-ref + consent
    // blob; no raw contact value (phone/email/address) is ever a column.
    expect(CommunityInitialSchemaMigration.upSql).toContain("contact_channel_refs_json TEXT");

    const declarationLines = CommunityInitialSchemaMigration.upSql
      .split("\n")
      .filter((line) => /^\s*[a-z_]+\s+(TEXT|INTEGER|REAL)\b/u.test(line));

    expect(declarationLines.length).toBeGreaterThan(0);

    for (const line of declarationLines) {
      const columnName = line.trim().split(/\s+/u)[0] ?? "";
      expect(columnName).not.toMatch(/phone/u);
      expect(columnName).not.toMatch(/email/u);
      expect(columnName).not.toMatch(/address/u);
    }
  });

  it("drops every index and table in the rollback SQL", () => {
    for (const index of CommunityInitialMigrationIndexNames) {
      expect(CommunityInitialSchemaMigration.downSql).toContain(`DROP INDEX IF EXISTS ${index}`);
    }
    for (const table of CommunityInitialMigrationTableNames) {
      expect(CommunityInitialSchemaMigration.downSql).toContain(`DROP TABLE IF EXISTS ${table}`);
    }
  });

  it("is included in the ordered Community migration list", () => {
    expect(CommunitySqlMigrations).toEqual([CommunityInitialSchemaMigration]);
  });
});

const loadNodeSqlite = async (): Promise<typeof import("node:sqlite") | undefined> => {
  try {
    return await import("node:sqlite");
  } catch {
    return undefined;
  }
};

const nodeSqlite = await loadNodeSqlite();
const liveIt = nodeSqlite === undefined ? it.skip : it;

describe("Community initial migration smoke", () => {
  it("reports whether the in-process SQLite engine is available", () => {
    expect(nodeSqlite === undefined || typeof nodeSqlite.DatabaseSync === "function").toBe(true);
  });

  liveIt("applies, enforces constraints, and rolls back against node:sqlite", () => {
    if (nodeSqlite === undefined) {
      throw new Error("node:sqlite is unavailable.");
    }

    const database = new nodeSqlite.DatabaseSync(":memory:");
    const insertMemberSql = `INSERT INTO members
      (tenant_id, member_id, display_name, status, schema_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const insertMessageSql = `INSERT INTO communication_messages
      (tenant_id, message_id, channel, body_template, audience_json, status, origin, confirmed, confirmed_by_ref, confirmation_reason, confirmed_at, created_by_ref, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    try {
      database.exec(CommunityInitialSchemaMigration.upSql);

      database
        .prepare(insertMemberSql)
        .run("tenant_1", "member_1", "Visitor 1", "active", "community.v1", "t", "t");

      // A confirmed message carrying its confirmation metadata is accepted.
      database
        .prepare(insertMessageSql)
        .run(
          "tenant_1",
          "message_1",
          "sms",
          "Hi {{name}}",
          '{"kind":"explicit","memberRefs":["member_1"]}',
          "confirmed",
          "human",
          1,
          "actor_1",
          "Approved for send",
          "t",
          "actor_1",
          "t",
          "t"
        );

      // An unknown member schema version must be rejected by the CHECK constraint.
      expect(() =>
        database
          .prepare(insertMemberSql)
          .run("tenant_1", "member_bad", "Visitor 2", "active", "community.v2", "t", "t")
      ).toThrow();

      // A queued message without a recorded confirmation must be rejected — the
      // human-confirmation gate is enforced in the schema, not just the service.
      expect(() =>
        database
          .prepare(insertMessageSql)
          .run(
            "tenant_1",
            "message_bad_queued",
            "sms",
            "Hi {{name}}",
            '{"kind":"explicit","memberRefs":["member_1"]}',
            "queued",
            "human",
            0,
            null,
            null,
            null,
            "actor_1",
            "t",
            "t"
          )
      ).toThrow();

      database.exec(CommunityInitialSchemaMigration.downSql);

      const remaining = database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'members'")
        .all();
      expect(remaining).toEqual([]);
    } finally {
      database.close();
    }
  });
});
