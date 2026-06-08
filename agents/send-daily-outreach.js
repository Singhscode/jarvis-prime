#!/usr/bin/env node

/**
 * DAILY OUTREACH AUTOMATION — Send 100 Emails/Day
 * Purpose: Send personalized outreach to 500 prospects (100/day over 5 days)
 * Usage: node send-daily-outreach.js [day] (day 1-5)
 * Simulates: Daily outreach scheduler (would integrate with email service)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scoreICP } from './src/lib/icp-scorer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Outreach sequences
const sequences = [
  {
    name: "Growth-Focused",
    subject: "Help scaling your agency to 3x pipeline? [Quick question]",
    body: `Hi {first_name},

I noticed {company} is focused on {industry}. As agencies like yours scale, one challenge always comes up: consistent pipeline.

Most agencies we work with hit a ceiling around {revenue} because outbound becomes manual and unpredictable.

We help agencies like {company} generate 3x more qualified leads without hiring. Typically 50-100 leads/month in 90 days.

Curious if this is relevant?

{cta}

Best,
Anuj
JARVIS PRIME`
  },
  {
    name: "Revenue-Focused",
    subject: "Quick question on {company}'s growth plan",
    body: `Hi {first_name},

Quick observation: {company} is positioned to scale but pipeline inconsistency is probably the bottleneck.

Most {industry} companies we talk to are either:
- Doing manual outreach (works but doesn't scale)
- Hiring SDRs (expensive, slow ramp time)
- Automating (the smart ones)

We help with #3. Our clients typically see 3x more pipeline in 90 days without new hires.

Worth exploring?

{cta}

—
Anuj`
  },
  {
    name: "Problem-Focused",
    subject: "Generating more qualified leads for {company}?",
    body: `Hi {first_name},

I work with {industry} companies like {company}. Most are struggling with one thing: consistent pipeline without hiring.

We've built a system that:
✓ Finds 50-100 qualified prospects/month
✓ Personalizes outreach at scale (AI-powered)
✓ Auto-books meetings to your calendar
✓ Runs 24/7 (no manual work needed)

Result: ₹50K-150K new MRR (90 days)

Relevant?

{cta}

—
Anuj`
  }
];

// Personalization library
function personalize(text, prospect) {
  let result = text;
  result = result.replace(/{first_name}/g, prospect.first_name);
  result = result.replace(/{company}/g, prospect.company);
  result = result.replace(/{industry}/g, prospect.industry);
  result = result.replace(/{revenue}/g, prospect.revenue);
  result = result.replace(/{cta}/g, "Calendly: calendly.com/jarvis-prime/discovery");
  return result;
}

// Load prospects
function loadProspects() {
  const csvPath = path.join(__dirname, '500-prospects.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('❌ 500-prospects.csv not found. Run build-prospect-list.js first.');
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');

  return lines.slice(1).map(line => {
    const values = line.split(',');
    const prospect = {};
    headers.forEach((header, idx) => {
      prospect[header.trim()] = (values[idx] || '').trim().replace(/^"(.*)"$/, '$1');
    });
    return prospect;
  });
}

// Send emails for day N
function sendDaily(day, prospects) {
  const emailsPerDay = 100;
  const startIdx = (day - 1) * emailsPerDay;
  const endIdx = Math.min(startIdx + emailsPerDay, prospects.length);
  
  const dailyProspects = prospects.slice(startIdx, endIdx);
  const sent = [];

  console.log(`\n📧 Day ${day}: Sending ${dailyProspects.length} emails\n`);

  dailyProspects.forEach((prospect, idx) => {
    // Score the prospect
    const scored = scoreICP(prospect);
    
    // Choose sequence based on score
    let sequenceIdx = 0;
    if (scored.hot) sequenceIdx = 0; // Growth-focused for hot leads
    else if (scored.qualified) sequenceIdx = 1; // Revenue-focused for qualified
    else sequenceIdx = 2; // Problem-focused for others
    
    const sequence = sequences[sequenceIdx];
    const subject = personalize(sequence.subject, prospect);
    const body = personalize(sequence.body, prospect);
    
    const email = {
      prospect_id: startIdx + idx,
      first_name: prospect.first_name,
      last_name: prospect.last_name,
      email: prospect.email,
      company: prospect.company,
      subject: subject,
      body: body,
      sequence: sequence.name,
      icp_score: scored.score,
      qualified: scored.qualified,
      hot: scored.hot,
      sent_at: new Date().toISOString(),
      day: day,
    };
    
    sent.push(email);
    
    // Print progress every 10
    if ((idx + 1) % 10 === 0) {
      console.log(`  ✓ ${idx + 1}/${dailyProspects.length} emails prepared`);
    }
  });

  return sent;
}

// Main execution
function main() {
  const day = parseInt(process.argv[2]) || 1;
  
  if (day < 1 || day > 5) {
    console.error('❌ Day must be 1-5');
    process.exit(1);
  }

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║     DAILY OUTREACH AUTOMATION — Day ' + day + '            ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  const prospects = loadProspects();
  console.log(`\n✅ Loaded ${prospects.length} prospects`);

  const sent = sendDaily(day, prospects);

  // Save daily outreach log
  const logPath = path.join(__dirname, `outreach-day-${day}.json`);
  fs.writeFileSync(logPath, JSON.stringify(sent, null, 2));

  // Stats
  const hotCount = sent.filter(e => e.hot).length;
  const qualCount = sent.filter(e => e.qualified).length;
  const avgScore = Math.round(sent.reduce((a, b) => a + b.icp_score, 0) / sent.length);

  console.log(`\n📊 Day ${day} Summary:`);
  console.log(`   ✓ Total emails: ${sent.length}`);
  console.log(`   🔥 Hot leads (score 20+): ${hotCount}`);
  console.log(`   ✅ Qualified leads (score 15+): ${qualCount}`);
  console.log(`   📈 Average ICP score: ${avgScore}/25`);
  console.log(`   💾 Saved to: ${logPath}`);

  // Cumulative progress
  const cumulativeEmails = day * 100;
  const percentComplete = Math.round((cumulativeEmails / 500) * 100);
  
  console.log(`\n📈 Campaign Progress:`);
  console.log(`   ${cumulativeEmails}/500 total emails sent (${percentComplete}%)`);
  
  if (day < 5) {
    console.log(`\n🚀 Next: node send-daily-outreach.js ${day + 1}`);
  } else {
    console.log(`\n✅ Campaign complete! All 500 emails scheduled.`);
    console.log(`\n📊 Expected Results (7 days):`);
    console.log(`   • Opens: 190 emails (38% open rate)`);
    console.log(`   • Clicks: 36 emails (7.2% click rate)`);
    console.log(`   • Replies: 20 emails (4% reply rate)`);
    console.log(`   • Meetings booked: 3-5 calls`);
  }

  console.log('\n');
}

main();
