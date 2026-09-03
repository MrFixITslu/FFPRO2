import { Router } from 'express';

const router = Router();

const EFFECTIVE_DATE = 'September 1, 2026';
const COMPANY_NAME = 'Vision79 Digital';
const APP_NAME = 'Fire Finance Pro';
const CONTACT_EMAIL = 'vision79slu@gmail.com';

const pageShell = (title, bodyHtml) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title} — ${APP_NAME}</title>
<meta name="robots" content="index, follow" />
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    background: #f8fafc;
    color: #1e293b;
    line-height: 1.65;
  }
  .wrap { max-width: 760px; margin: 0 auto; padding: 48px 24px 96px; }
  header.page-header {
    display: flex; align-items: center; gap: 12px; margin-bottom: 8px;
  }
  header.page-header .logo {
    width: 36px; height: 36px; border-radius: 10px;
    background: linear-gradient(135deg, #4f46e5, #6366f1);
    display: flex; align-items: center; justify-content: center;
    color: white; font-weight: 800; font-size: 16px; flex-shrink: 0;
  }
  header.page-header .brand { font-weight: 800; font-size: 15px; color: #334155; }
  h1 { font-size: 28px; font-weight: 800; margin: 24px 0 4px; color: #0f172a; letter-spacing: -0.02em; }
  .effective-date { font-size: 13px; color: #64748b; margin-bottom: 36px; }
  h2 { font-size: 18px; font-weight: 700; margin: 36px 0 12px; color: #1e293b; }
  h3 { font-size: 14px; font-weight: 700; margin: 20px 0 8px; color: #334155; text-transform: uppercase; letter-spacing: 0.03em; }
  p, li { font-size: 14.5px; color: #334155; }
  ul, ol { padding-left: 22px; }
  li { margin-bottom: 6px; }
  a { color: #4f46e5; }
  .callout {
    background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 12px;
    padding: 14px 18px; font-size: 13.5px; color: #3730a3; margin: 16px 0;
  }
  .callout strong { color: #312e81; }
  footer { margin-top: 56px; padding-top: 24px; border-top: 1px solid #e2e8f0; font-size: 12.5px; color: #94a3b8; }
  .toc { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 22px; margin: 24px 0 40px; }
  .toc h3 { margin-top: 0; }
  .toc ol { margin: 0; padding-left: 20px; }
  .toc a { text-decoration: none; font-size: 13.5px; }
  .toc li { margin-bottom: 4px; }
</style>
</head>
<body>
  <div class="wrap">
    <header class="page-header">
      <div class="logo">V79</div>
      <div class="brand">${COMPANY_NAME}</div>
    </header>
    ${bodyHtml}
    <footer>
      ${APP_NAME} is developed and operated by ${COMPANY_NAME}, Castries, Saint Lucia.<br />
      Questions about this document? Contact <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.
    </footer>
  </div>
</body>
</html>`;

router.get('/terms', (_req, res) => {
  const html = pageShell('Terms of Service', `
    <h1>Terms of Service</h1>
    <p class="effective-date">Effective date: ${EFFECTIVE_DATE}</p>

    <p>These Terms of Service ("Terms") govern your access to and use of ${APP_NAME} (the "Service"), provided by ${COMPANY_NAME} ("we", "us", "our"). By creating an account or otherwise using the Service, you agree to these Terms. If you don't agree, please don't use the Service.</p>

    <div class="toc">
      <h3>Contents</h3>
      <ol>
        <li><a href="#eligibility">Eligibility &amp; accounts</a></li>
        <li><a href="#description">What the Service is (and isn't)</a></li>
        <li><a href="#data-you-enter">Data you enter</a></li>
        <li><a href="#simulated-features">Simulated / demonstration features</a></li>
        <li><a href="#acceptable-use">Acceptable use</a></li>
        <li><a href="#collaboration">Shared plans &amp; collaboration</a></li>
        <li><a href="#ip">Intellectual property</a></li>
        <li><a href="#disclaimer">No financial advice; disclaimer of warranties</a></li>
        <li><a href="#liability">Limitation of liability</a></li>
        <li><a href="#termination">Suspension &amp; termination</a></li>
        <li><a href="#changes">Changes to the Service or these Terms</a></li>
        <li><a href="#law">Governing law</a></li>
        <li><a href="#contact">Contact</a></li>
      </ol>
    </div>

    <h2 id="eligibility">1. Eligibility &amp; accounts</h2>
    <p>You must be able to form a binding contract to use the Service. You're responsible for the accuracy of the information you provide, for keeping your login credentials confidential, and for all activity that happens under your account. Tell us right away if you suspect unauthorized access to your account.</p>
    <p>You can create an account with an email/password, or sign in using a supported third-party provider (currently Google; other providers may be added or removed over time).</p>

    <h2 id="description">2. What the Service is (and isn't)</h2>
    <p>${APP_NAME} is a personal/business finance planning and tracking tool. It helps you record transactions, track budgets, plan events, and organize related tasks and documents. It is a record-keeping and organizational tool — it is not a bank, a payment processor, a broker-dealer, or a licensed financial institution, and it does not move, hold, or have custody of your money.</p>

    <h2 id="data-you-enter">3. Data you enter</h2>
    <p>Financial figures, balances, transactions, and similar records shown in the Service reflect what you (or your organization) manually enter or import. We do not independently verify this information against your actual bank, credit union, or investment accounts unless a specific feature explicitly states that it connects to a live third-party financial data provider. You're responsible for checking figures against your own official account statements before relying on them for any decision.</p>

    <h2 id="simulated-features">4. Simulated / demonstration features</h2>
    <p>Certain features (for example, "Bank Sync" account linking) may currently operate in a simulated or demonstration mode using AI-generated sample data rather than a live connection to a real financial institution. Where a feature operates this way, it is intended for organizational and illustrative purposes only, and any transactions it produces are not real bank activity. We may replace simulated features with genuine third-party integrations in the future, at which point these Terms and our Privacy Policy will be updated accordingly.</p>

    <h2 id="acceptable-use">5. Acceptable use</h2>
    <p>You agree not to: (a) use the Service for any unlawful purpose; (b) attempt to gain unauthorized access to any account, system, or network related to the Service; (c) upload malicious code or interfere with the Service's operation; (d) scrape or bulk-extract data from the Service without our written permission; or (e) use the Service to store or transmit content that infringes someone else's rights or violates applicable law.</p>

    <h2 id="collaboration">6. Shared plans &amp; collaboration</h2>
    <p>Some features let you share a project or event plan with other account holders (for example, inviting a collaborator to a shared budget). If you share a plan, the people you invite will be able to see and, depending on their assigned role, edit the data within that shared plan. You're responsible for only inviting people you intend to give that access to.</p>

    <h2 id="ip">7. Intellectual property</h2>
    <p>The Service, including its software, design, and branding, is owned by ${COMPANY_NAME} and protected by applicable intellectual property laws. You retain ownership of the data you enter into the Service. You grant us a limited license to host, store, and process that data solely to operate and improve the Service for you.</p>

    <h2 id="disclaimer">8. No financial advice; disclaimer of warranties</h2>
    <p>Nothing in the Service constitutes financial, legal, investment, or tax advice. Projections, budgets, and summaries are tools to help you organize your own thinking — always confirm important decisions with a qualified professional and your own official records. The Service is provided "as is" and "as available," without warranties of any kind, express or implied, including warranties of merchantability, fitness for a particular purpose, or non-infringement.</p>

    <h2 id="liability">9. Limitation of liability</h2>
    <p>To the maximum extent permitted by law, ${COMPANY_NAME} will not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits, data, or goodwill, arising from your use of (or inability to use) the Service, even if advised of the possibility of such damages. Our total liability for any claim relating to the Service is limited to the amount you paid us (if any) for the Service in the twelve months before the claim arose.</p>

    <h2 id="termination">10. Suspension &amp; termination</h2>
    <p>We may suspend or terminate your access to the Service if you violate these Terms or if we reasonably believe doing so is necessary to protect the Service or other users. You may stop using the Service, and request deletion of your account and data, at any time (see our <a href="/privacy">Privacy Policy</a> for how).</p>

    <h2 id="changes">11. Changes to the Service or these Terms</h2>
    <p>We may update the Service or these Terms from time to time. If we make material changes, we'll update the effective date above and, where appropriate, provide additional notice. Continued use of the Service after changes take effect means you accept the updated Terms.</p>

    <h2 id="law">12. Governing law</h2>
    <p>These Terms are governed by the laws of Saint Lucia, without regard to conflict-of-law principles, unless applicable local law in your jurisdiction requires otherwise.</p>

    <h2 id="contact">13. Contact</h2>
    <p>Questions about these Terms? Reach us at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
  `);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

router.get('/privacy', (_req, res) => {
  const html = pageShell('Privacy Policy', `
    <h1>Privacy Policy</h1>
    <p class="effective-date">Effective date: ${EFFECTIVE_DATE}</p>

    <p>This Privacy Policy explains what information ${APP_NAME} ("the Service"), operated by ${COMPANY_NAME}, collects, how we use it, and the choices you have. By using the Service, you agree to the practices described here.</p>

    <div class="toc">
      <h3>Contents</h3>
      <ol>
        <li><a href="#collect">Information we collect</a></li>
        <li><a href="#google-api">Google account &amp; Gmail data</a></li>
        <li><a href="#use">How we use information</a></li>
        <li><a href="#sharing">How we share information</a></li>
        <li><a href="#security">How we protect information</a></li>
        <li><a href="#retention">Data retention</a></li>
        <li><a href="#rights">Your choices &amp; rights</a></li>
        <li><a href="#cookies">Cookies &amp; sessions</a></li>
        <li><a href="#children">Children's privacy</a></li>
        <li><a href="#international">International users</a></li>
        <li><a href="#changes">Changes to this policy</a></li>
        <li><a href="#contact">Contact</a></li>
      </ol>
    </div>

    <h2 id="collect">1. Information we collect</h2>
    <h3>Account information</h3>
    <ul>
      <li>Email address, and a securely hashed password if you register directly.</li>
      <li>If you sign in with Google (or another supported provider), your name, email address, and profile photo as provided by that provider.</li>
    </ul>
    <h3>Financial &amp; planning data you enter</h3>
    <ul>
      <li>Transactions, budgets, categories, recurring expenses/income, saving goals, linked-account labels (e.g. bank/institution names you choose to record), investment holdings you enter, and event/project planning data (tasks, checklists, logs, and messages within a shared plan).</li>
    </ul>
    <h3>Technical information</h3>
    <ul>
      <li>Session identifiers (via a secure cookie) used to keep you signed in.</li>
      <li>Basic request metadata (e.g. timestamps, general error logs) used for security and reliability — we do not sell or use this for advertising.</li>
    </ul>

    <h2 id="google-api">2. Google account &amp; Gmail data</h2>
    <p>When you sign in with Google or connect your Gmail account, we request only the minimum scopes necessary to provide the features you explicitly choose to use. Access to Gmail is strictly optional and is used solely to power the <strong>Executive Inbox Briefing &amp; Planning Notifications</strong>, which displays unread emails related to planning tasks, invoices, and milestones directly on your dashboard.</p>
    <div class="callout">
      <strong>Google API Services User Data Policy.</strong> ${APP_NAME}'s use and transfer of information received from Google APIs to any other app will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements. Specifically:
      <ul>
        <li>Gmail data is used solely to display planning-related email notifications, sender details, subject headers, snippets, and task links within the Service to the user who granted access — it is never used to serve advertising.</li>
        <li>Gmail data is never sold, transferred, or shared with third parties for purposes unrelated to providing or improving this specific feature.</li>
        <li>Gmail data is never used to train generalized artificial intelligence (AI) or machine learning (ML) models.</li>
        <li>Humans will not read your email data unless you provide explicit affirmative consent for specific messages, doing so is necessary for security purposes (such as investigating abuse or bugs), or as required by law.</li>
        <li>You can disconnect your Google account and revoke access at any time directly within the application via the "Disconnect Gmail" control or through your <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">Google Account permissions page</a>, which immediately terminates all access and clears stored tokens.</li>
      </ul>
    </div>

    <h2 id="use">3. How we use information</h2>
    <ul>
      <li>To provide, maintain, and secure the Service (e.g. authenticating you, saving your data, syncing shared plans).</li>
      <li>To power features you opt into, such as AI-assisted budgeting suggestions or planning-email notifications.</li>
      <li>To communicate with you about your account (e.g. password reset emails, collaboration invites).</li>
      <li>To detect, prevent, and respond to fraud, abuse, or security issues.</li>
    </ul>
    <p>We do not sell your personal information, and we do not use your financial data or Gmail data for advertising.</p>

    <h2 id="sharing">4. How we share information</h2>
    <p>We share information only in these limited circumstances:</p>
    <ul>
      <li><strong>With people you invite</strong> to a shared plan — they can see the shared plan's contents according to their assigned role.</li>
      <li><strong>Service providers</strong> who help us operate the Service (e.g. hosting infrastructure, an AI provider used for optional in-app AI features, or an email delivery provider for transactional emails like invites and password resets), bound by confidentiality and data-protection obligations.</li>
      <li><strong>When required by law</strong>, or to protect the rights, safety, or property of ${COMPANY_NAME}, our users, or the public.</li>
      <li><strong>With your direction</strong> — for example, if you explicitly connect a third-party integration in the future.</li>
    </ul>

    <h2 id="security">5. How we protect information</h2>
    <p>Your financial data is encrypted at rest using industry-standard authenticated encryption, with a key derived uniquely per account, so that access to the stored data alone is not sufficient to read it. Passwords are stored using a one-way cryptographic hash — we never store your plaintext password. Data in transit is protected using HTTPS/TLS. No method of storage or transmission is 100% secure, but we work to apply appropriate technical and organizational safeguards.</p>

    <h2 id="retention">6. Data retention</h2>
    <p>We retain your account and planning data for as long as your account is active. If you delete your account, we delete or irreversibly anonymize your personal data within a reasonable period, except where we're required to retain certain records by law or for legitimate security purposes (e.g. abuse-prevention logs).</p>

    <h2 id="rights">7. Your choices &amp; rights</h2>
    <ul>
      <li><strong>Access &amp; correction:</strong> you can view and edit most of your data directly within the Service.</li>
      <li><strong>Deletion:</strong> you can request deletion of your account and associated data at any time by contacting us at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</li>
      <li><strong>Revoking Google access:</strong> you can disconnect Google/Gmail access at any time from your <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">Google Account permissions page</a>.</li>
      <li><strong>Portability:</strong> you can request an export of your data in a common format.</li>
    </ul>
    <p>Depending on where you live, you may have additional rights under local law (for example, under GDPR or similar regimes). Contact us to exercise any of these rights.</p>

    <h2 id="cookies">8. Cookies &amp; sessions</h2>
    <p>We use a single essential session cookie to keep you signed in securely. We do not use third-party advertising or tracking cookies.</p>

    <h2 id="children">9. Children's privacy</h2>
    <p>The Service is not directed to children, and we do not knowingly collect personal information from children under 16. If you believe a child has provided us with personal information, please contact us so we can remove it.</p>

    <h2 id="international">10. International users</h2>
    <p>${COMPANY_NAME} is based in Saint Lucia. If you use the Service from another country, your information will be processed in the location(s) where our infrastructure operates, which may have different data protection laws than your own country.</p>

    <h2 id="changes">11. Changes to this policy</h2>
    <p>We may update this Privacy Policy from time to time. If we make material changes, we'll update the effective date above and, where appropriate, provide additional notice within the Service.</p>

    <h2 id="contact">12. Contact</h2>
    <p>Questions about this Privacy Policy or your data? Reach us at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
  `);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

export default router;
