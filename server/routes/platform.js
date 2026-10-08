import { Router } from "../http.js";
import crypto from "node:crypto";
import { pool } from "../db.js";
import { decryptForUser } from "../crypto.js";
import { provisionHubFinanceOwner } from "../hubAccess.js";

const router = Router();
const MAX_SKEW_MS = 5 * 60 * 1000;

function canonicalMessage(req, timestamp) {
  const pathname = new URL(req.originalUrl, "http://v79.internal").pathname;
  const body = req.method === "GET" ? "" : JSON.stringify(req.body ?? {});
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  return [req.method.toUpperCase(), pathname, String(timestamp), bodyHash].join("\n");
}

function safeEqualHex(a, b) {
  try {
    const left = Buffer.from(String(a), "hex");
    const right = Buffer.from(String(b), "hex");
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

router.use((req, res, next) => {
  const secret = String(process.env.V79_PLATFORM_SHARED_SECRET || "");
  const timestamp = req.get("x-v79-timestamp");
  const signature = req.get("x-v79-signature");
  const serviceId = req.get("x-v79-service-id");

  if (secret.length < 32) {
    return res.status(503).json({ error: "V79 platform integration is not configured." });
  }
  if (serviceId !== "v79-hub" || !timestamp || !signature) {
    return res.status(401).json({ error: "Invalid V79 platform credentials." });
  }

  const when = Number(timestamp);
  if (!Number.isFinite(when) || Math.abs(Date.now() - when) > MAX_SKEW_MS) {
    return res.status(401).json({ error: "Expired V79 platform request." });
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(canonicalMessage(req, timestamp))
    .digest("hex");

  if (!safeEqualHex(expected, signature)) {
    return res.status(401).json({ error: "Invalid V79 platform signature." });
  }
  next();
});

function sumTransactions(transactions, predicate) {
  return transactions.reduce((total, item) => predicate(item) ? total + Number(item.amount || 0) : total, 0);
}

router.post("/provision", async (req, res) => {
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const organization = body.organization && typeof body.organization === "object" && !Array.isArray(body.organization)
    ? body.organization : {};
  const user = body.user && typeof body.user === "object" && !Array.isArray(body.user) ? body.user : {};
  const organizationId = String(organization.id || "").trim();
  const organizationName = String(organization.name || "").trim();
  const organizationSlug = String(organization.slug || "").trim();
  const hubUserId = String(user.id || "").trim();
  const email = String(user.email || "").trim().toLowerCase();
  const name = String(user.name || email.split("@")[0] || "").trim();

  if (
    body.role !== "owner" ||
    !/^[A-Za-z0-9._:-]{8,180}$/.test(organizationId) ||
    organizationName.length < 1 || organizationName.length > 180 ||
    !/^[a-z0-9][a-z0-9-]{0,99}$/.test(organizationSlug) ||
    !/^[A-Za-z0-9._:-]{8,180}$/.test(hubUserId) ||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ||
    name.length < 1 || name.length > 255
  ) {
    return res.status(400).json({ error: "Invalid FFPRO provisioning request." });
  }

  try {
    const financeOwner = await provisionHubFinanceOwner({
      user: { id: hubUserId, email, name },
      organization: { id: organizationId, name: organizationName, slug: organizationSlug },
      role: "owner",
      entitlement: { product: "ffpro", enabled: true, access: "owner" },
    });

    if (
      String(financeOwner?.hub_user_id || "") !== hubUserId ||
      String(financeOwner?.hub_organization_id || "") !== organizationId ||
      financeOwner?.hub_finance_owner !== true
    ) {
      throw new Error("FFPRO provisioned identity mismatch.");
    }

    res.setHeader("Cache-Control", "no-store");
    return res.json({
      provisioned: true,
      organizationId,
      ownerHubUserId: hubUserId,
      financeUserId: financeOwner.id,
    });
  } catch (error) {
    console.warn("[platform] FFPRO provisioning denied:", error?.message || error);
    return res.status(409).json({ error: "FFPRO workspace provisioning could not be completed." });
  }
});

router.get("/summary/:userId", async (req, res) => {
  const subject = String(req.params.userId || "").trim();
  if (!/^[A-Za-z0-9._:@-]{1,180}$/.test(subject)) {
    return res.status(400).json({ error: "Invalid FFPRO subject identifier." });
  }

  try {
    const userResult = await pool.query(
      "SELECT id, email, username, display_name, avatar_url, hub_organization_id " +
      "FROM users " +
      "WHERE (hub_organization_id = $1 AND hub_finance_owner = TRUE) OR id::text = $1 " +
      "ORDER BY CASE WHEN hub_organization_id = $1 AND hub_finance_owner = TRUE THEN 0 ELSE 1 END " +
      "LIMIT 1",
      [subject]
    );
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: "FFPRO user not found." });

    const dataResult = await pool.query(
      "SELECT ciphertext, iv, auth_tag, version, updated_at FROM user_data WHERE user_id = $1",
      [user.id]
    );

    let data = {};
    let dataVersion = 0;
    let updatedAt = null;
    if (dataResult.rows[0]) {
      const row = dataResult.rows[0];
      data = decryptForUser(user.id, {
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.auth_tag,
      });
      dataVersion = Number(row.version || 0);
      updatedAt = row.updated_at || null;
    }

    const transactions = Array.isArray(data.transactions) ? data.transactions : [];
    const now = new Date();
    const monthPrefix = now.toISOString().slice(0, 7);
    const yearPrefix = now.toISOString().slice(0, 4);
    const isMonth = item => typeof item.date === "string" && item.date.startsWith(monthPrefix);
    const isYear = item => typeof item.date === "string" && item.date.startsWith(yearPrefix);

    const monthIncome = sumTransactions(transactions, item => isMonth(item) && item.type === "income");
    const monthExpenses = sumTransactions(transactions, item => isMonth(item) && item.type === "expense");
    const yearIncome = sumTransactions(transactions, item => isYear(item) && item.type === "income");
    const yearExpenses = sumTransactions(transactions, item => isYear(item) && item.type === "expense");

    res.json({
      product: "ffpro",
      subjectId: user.id,
      account: {
        email: user.email,
        displayName: user.display_name || user.username || user.email,
      },
      metrics: {
        transactionCount: transactions.length,
        currentMonthIncome: monthIncome,
        currentMonthExpenses: monthExpenses,
        currentMonthNet: monthIncome - monthExpenses,
        yearToDateIncome: yearIncome,
        yearToDateExpenses: yearExpenses,
        yearToDateNet: yearIncome - yearExpenses,
        savingGoals: Array.isArray(data.savingGoals) ? data.savingGoals.length : 0,
        investmentGoals: Array.isArray(data.investmentGoals) ? data.investmentGoals.length : 0,
        budgets: data.categoryBudgets && typeof data.categoryBudgets === "object" ? Object.keys(data.categoryBudgets).length : 0,
      },
      dataVersion,
      dataUpdatedAt: updatedAt,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[platform] FFPRO summary failed:", error?.message || error);
    res.status(500).json({ error: "Unable to build FFPRO platform summary." });
  }
});


router.get("/admin/stats", async (_req, res) => {
  try {
    const [total, hubManaged, hubOrganizations, savedData, active30d] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS count FROM users"),
      pool.query("SELECT COUNT(*)::int AS count FROM users WHERE hub_organization_id IS NOT NULL"),
      pool.query("SELECT COUNT(DISTINCT hub_organization_id)::int AS count FROM users WHERE hub_organization_id IS NOT NULL"),
      pool.query("SELECT COUNT(*)::int AS count FROM user_data"),
      pool.query("SELECT COUNT(*)::int AS count FROM users WHERE last_login_at >= NOW() - INTERVAL '30 days'"),
    ]);

    res.json({
      totalAccounts: Number(total.rows[0]?.count || 0),
      hubManagedAccounts: Number(hubManaged.rows[0]?.count || 0),
      hubOrganizations: Number(hubOrganizations.rows[0]?.count || 0),
      accountsWithSavedData: Number(savedData.rows[0]?.count || 0),
      activeAccounts30d: Number(active30d.rows[0]?.count || 0),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[platform-admin] FFPRO stats failed:", error?.message || error);
    res.status(500).json({ error: "Unable to build FFPRO platform statistics." });
  }
});

router.get("/admin/accounts", async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT u.id, u.email, u.username, u.display_name, u.created_at, u.last_login_at, " +
      "u.hub_organization_id, u.hub_finance_owner, d.version AS data_version, d.updated_at AS data_updated_at " +
      "FROM users u LEFT JOIN user_data d ON d.user_id = u.id ORDER BY u.created_at DESC"
    );

    res.json(result.rows.map(user => ({
      id: user.id,
      email: user.email,
      displayName: user.display_name || user.username || user.email,
      createdAt: user.created_at || null,
      lastLoginAt: user.last_login_at || null,
      hubOrganizationId: user.hub_organization_id || null,
      hubManaged: Boolean(user.hub_organization_id),
      hubFinanceOwner: Boolean(user.hub_finance_owner),
      hasSavedData: user.data_version !== null && user.data_version !== undefined,
      dataVersion: user.data_version === null || user.data_version === undefined ? null : Number(user.data_version),
      dataUpdatedAt: user.data_updated_at || null,
    })));
  } catch (error) {
    console.error("[platform-admin] FFPRO accounts failed:", error?.message || error);
    res.status(500).json({ error: "Unable to list FFPRO platform accounts." });
  }
});

export default router;
