import { Router } from "../http.js";
import crypto from "node:crypto";
import { pool } from "../db.js";
import { decryptForUser } from "../crypto.js";

const router = Router();
const MAX_SKEW_MS = 5 * 60 * 1000;

function canonicalMessage(req, timestamp) {
  const pathname = new URL(req.originalUrl, "http://v79.internal").pathname;
  const bodyHash = crypto.createHash("sha256").update("").digest("hex");
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

router.get("/summary/:userId", async (req, res) => {
  const subject = String(req.params.userId || "").trim();
  if (!/^[A-Za-z0-9._:@-]{1,180}$/.test(subject)) {
    return res.status(400).json({ error: "Invalid FFPRO subject identifier." });
  }

  try {
    const isUuid = /^[0-9a-fA-F-]{36}$/.test(subject);
    const userResult = await pool.query(
      isUuid
        ? "SELECT id, email, username, display_name, avatar_url, hub_organization_id FROM users WHERE id = $1"
        : "SELECT id, email, username, display_name, avatar_url, hub_organization_id FROM users WHERE hub_organization_id = $1 AND hub_finance_owner=TRUE LIMIT 1",
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

export default router;
