#!/usr/bin/env node
/**
 * JARVIS PRIME — Email Verifier
 * Checks deliverability of all emails in prospects.csv
 * Uses DNS MX lookup + SMTP handshake (no API key needed)
 *
 * Run: node src/tools/email-verifier.js
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dns from "dns/promises";
import net from "net";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = join(__dirname, "../prospects.csv");
const VERIFIED_PATH = join(__dirname, "../prospects-verified.csv");

const TIMEOUT = 5000;

async function checkMX(domain) {
  try {
    const records = await dns.resolveMx(domain);
    return records.sort((a, b) => a.priority - b.priority)[0]?.exchange;
  } catch {
    return null;
  }
}

async function smtpVerify(email, mxHost) {
  return new Promise((resolve) => {
    const socket = net.createConnection(25, mxHost);
    let stage = 0;
    let result = { valid: false, reason: "unknown" };

    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ valid: false, reason: "timeout" });
    }, TIMEOUT);

    socket.on("data", (data) => {
      const response = data.toString();
      const code = parseInt(response.substring(0, 3));

      if (stage === 0 && code === 220) {
        socket.write(`HELO jarvis-prime.in\r\n`);
        stage = 1;
      } else if (stage === 1 && code === 250) {
        socket.write(`MAIL FROM:<verify@jarvis-prime.in>\r\n`);
        stage = 2;
      } else if (stage === 2 && code === 250) {
        socket.write(`RCPT TO:<${email}>\r\n`);
        stage = 3;
      } else if (stage === 3) {
        result = { 
          valid: code === 250, 
          reason: code === 250 ? "deliverable" : `rejected (${code})`
        };
        socket.write(`QUIT\r\n`);
        socket.destroy();
        clearTimeout(timer);
        resolve(result);
      }
    });

    socket.on("error", () => {
      clearTimeout(timer);
      resolve({ valid: false, reason: "connection_failed" });
    });
  });
}

async function verifyEmail(email) {
  const domain = email.split("@")[1];
  if (!domain) return { email, valid: false, reason: "invalid_format" };

  const mxHost = await checkMX(domain);
  if (!mxHost) return { email, valid: false, reason: "no_mx_records" };

  const result = await smtpVerify(email, mxHost);
  return { email, mxHost, ...result };
}

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   JARVIS PRIME — Email Verifier              ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  const csv = readFileSync(CSV_PATH, "utf8").trim();
  const lines = csv.split("\n");
  const header = lines[0];
  const rows = lines.slice(1).filter(l => l.trim());

  console.log(`📋 Found ${rows.length} prospects to verify\n`);

  const validRows = [header];
  const results = { valid: 0, invalid: 0, risky: 0 };

  for (let i = 0; i < rows.length; i++) {
    const cols = rows[i].split(",");
    const email = cols[3];
    process.stdout.write(`[${i + 1}/${rows.length}] ${email.padEnd(40)} `);

    const result = await verifyEmail(email);

    if (result.valid) {
      console.log("✅ VALID");
      validRows.push(rows[i]);
      results.valid++;
    } else if (result.reason === "timeout" || result.reason === "connection_failed") {
      console.log(`⚠️  RISKY (${result.reason})`);
      results.risky++;
      // Keep risky ones — they might still work
      validRows.push(rows[i]);
    } else {
      console.log(`❌ INVALID (${result.reason})`);
      results.invalid++;
    }

    // Small delay to be polite
    await new Promise(r => setTimeout(r, 500));
  }

  writeFileSync(VERIFIED_PATH, validRows.join("\n"));

  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║   RESULTS                                    ║`);
  console.log(`╠══════════════════════════════════════════════╣`);
  console.log(`║  ✅ Valid:    ${String(results.valid).padEnd(31)}║`);
  console.log(`║  ⚠️  Risky:    ${String(results.risky).padEnd(31)}║`);
  console.log(`║  ❌ Invalid:  ${String(results.invalid).padEnd(31)}║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);
  console.log(`📍 Verified list saved to: ${VERIFIED_PATH}\n`);
  console.log(`To use verified list, run:`);
  console.log(`  cp ${VERIFIED_PATH} ${CSV_PATH}\n`);
}

main().catch(console.error);
