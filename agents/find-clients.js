#!/usr/bin/env node

/**
 * JARVIS PRIME — Find & Score Ideal Clients
 * 
 * Purpose: Read prospect CSV, score with ICP scorer, identify hot leads
 * Usage: node find-clients.js
 * Output: Qualified leads ranked by fit score
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scoreICP } from './src/lib/icp-scorer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Parse CSV file
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  const rows = lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx];
    });
    return row;
  });
  
  return rows;
}

// Read prospects
function loadProspects() {
  const verifiedPath = path.join(__dirname, 'src', 'prospects-verified.csv');
  const fullPath = path.join(__dirname, 'src', 'prospects-full.csv');
  
  try {
    if (fs.existsSync(verifiedPath)) {
      console.log(`${colors.blue}📂 Loading verified prospects...${colors.reset}\n`);
      return parseCSV(verifiedPath);
    } else if (fs.existsSync(fullPath)) {
      console.log(`${colors.blue}📂 Loading full prospects...${colors.reset}\n`);
      return parseCSV(fullPath);
    }
  } catch (err) {
    console.error(`${colors.red}❌ Error reading prospects:${colors.reset}`, err.message);
    return [];
  }
  
  return [];
}

// Convert prospect data to lead format for ICP scorer
function prospectToLead(prospect) {
  return {
    name: `${prospect.first_name || ''} ${prospect.last_name || ''}`.trim(),
    company: prospect.company || '',
    email: prospect.email || '',
    phone: prospect.phone || '',
    revenue: prospect.revenue || '',
    message: prospect.message || prospect.title || `${prospect.title || 'Professional'} at ${prospect.company || 'company'}`,
  };
}

// Score all prospects
function scoreProspects(prospects) {
  console.log(`${colors.cyan}🔍 Scoring ${prospects.length} prospects...${colors.reset}\n`);
  
  const scored = prospects.map(prospect => {
    const lead = prospectToLead(prospect);
    const result = scoreICP(lead);
    
    return {
      ...prospect,
      ...result,
      fullName: `${prospect.first_name} ${prospect.last_name}`,
    };
  });
  
  return scored;
}

// Filter qualified leads
function filterQualified(scored) {
  return scored.filter(lead => lead.qualified);
}

// Sort by score (highest first)
function sortByScore(leads) {
  return [...leads].sort((a, b) => b.score - a.score);
}

// Display results
function displayResults(scored) {
  const qualified = filterQualified(scored);
  const hot = qualified.filter(l => l.hot);
  const sorted = sortByScore(qualified);
  
  console.log(`${colors.bright}${colors.green}═══════════════════════════════════════════════════════════${colors.reset}\n`);
  console.log(`${colors.bright}PROSPECT SCORING RESULTS${colors.reset}\n`);
  console.log(`${colors.bright}${colors.green}═══════════════════════════════════════════════════════════${colors.reset}\n`);
  
  console.log(`${colors.cyan}Total Prospects:${colors.reset} ${scored.length}`);
  console.log(`${colors.green}Qualified:${colors.reset} ${qualified.length} (${Math.round((qualified.length/scored.length)*100)}%)`);
  console.log(`${colors.yellow}HOT Leads:${colors.reset} ${hot.length} 🔥\n`);
  
  if (hot.length > 0) {
    console.log(`${colors.bright}${colors.yellow}🔥 HOT LEADS (Priority 1 - Reach Out Immediately)${colors.reset}\n`);
    
    hot.slice(0, 10).forEach((lead, idx) => {
      console.log(`${colors.yellow}${idx + 1}.${colors.reset} ${colors.bright}${lead.fullName}${colors.reset}`);
      console.log(`   Company: ${lead.company}`);
      console.log(`   Title: ${lead.title}`);
      console.log(`   Email: ${lead.email}`);
      console.log(`   Score: ${colors.yellow}${lead.score}/25${colors.reset} ${lead.hot ? '🔥' : ''}`);
      console.log(`   Reasons: ${lead.reasons.join(' | ')}`);
      console.log(`   LinkedIn: ${lead.linkedin_url}`);
      console.log('');
    });
  }
  
  if (sorted.length > hot.length) {
    console.log(`${colors.bright}${colors.green}✅ QUALIFIED LEADS (Priority 2 - Follow Up)${colors.reset}\n`);
    
    sorted.filter(l => !l.hot).slice(0, 10).forEach((lead, idx) => {
      console.log(`${colors.green}${idx + 1}.${colors.reset} ${lead.fullName}`);
      console.log(`   Company: ${lead.company}`);
      console.log(`   Title: ${lead.title}`);
      console.log(`   Email: ${lead.email}`);
      console.log(`   Score: ${colors.green}${lead.score}/25${colors.reset}`);
      console.log('');
    });
  }
  
  console.log(`${colors.bright}${colors.green}═══════════════════════════════════════════════════════════${colors.reset}\n`);
  
  // Export to file
  exportResults(sorted, qualified);
}

// Export results to JSON and CSV
function exportResults(sorted, qualified) {
  const timestamp = new Date().toISOString().slice(0, 10);
  
  // Export qualified leads
  const jsonPath = path.join(__dirname, `qualified-leads-${timestamp}.json`);
  const csvPath = path.join(__dirname, `qualified-leads-${timestamp}.csv`);
  
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(sorted, null, 2)
  );
  
  // CSV export
  const csvContent = [
    ['First Name', 'Last Name', 'Company', 'Title', 'Email', 'Score', 'Qualified', 'Hot', 'LinkedIn'].join(','),
    ...sorted.map(l => [
      l.first_name,
      l.last_name,
      l.company,
      l.title,
      l.email,
      l.score,
      l.qualified ? 'YES' : 'NO',
      l.hot ? 'YES' : 'NO',
      l.linkedin_url,
    ].map(v => `"${v || ''}"`).join(','))
  ].join('\n');
  
  fs.writeFileSync(csvPath, csvContent);
  
  console.log(`${colors.green}✅ Results exported:${colors.reset}`);
  console.log(`   • ${jsonPath}`);
  console.log(`   • ${csvPath}\n`);
}

// Main execution
function main() {
  console.log(`\n${colors.bright}${colors.cyan}╔════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║   JARVIS PRIME — Find & Score Clients     ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚════════════════════════════════════════════╝${colors.reset}\n`);
  
  const prospects = loadProspects();
  
  if (prospects.length === 0) {
    console.error(`${colors.red}❌ No prospects found. Check CSV files.${colors.reset}`);
    process.exit(1);
  }
  
  const scored = scoreProspects(prospects);
  const timestamp = new Date().toISOString().slice(0, 10);
  displayResults(scored);
  
  // Summary for next steps
  const qualified = filterQualified(scored);
  const hot = qualified.filter(l => l.hot);
  
  console.log(`${colors.bright}NEXT STEPS:${colors.reset}\n`);
  console.log(`1. ${colors.cyan}🎯 Contact HOT leads (${hot.length}) → Use sequences from OUTREACH_SEQUENCES.md${colors.reset}`);
  console.log(`2. ${colors.yellow}📧 Follow up with QUALIFIED leads (${qualified.length - hot.length}) → Week 2${colors.reset}`);
  console.log(`3. ${colors.blue}📊 Track responses in dashboard${colors.reset}`);
  console.log(`4. ${colors.green}🚀 Book strategy calls → Convert to customers${colors.reset}\n`);
  
  console.log(`${colors.cyan}💡 Tip: Use qualified-leads-${timestamp}.csv in your email tool${colors.reset}\n`);
}

main();
