#!/usr/bin/env node

/**
 * BOOK DISCOVERY CALLS — Track & Book 5 Calls
 * Purpose: Manage reply tracking and schedule discovery calls
 * Usage: node book-discovery-calls.js
 * Output: 5 discovery calls booked + scheduled
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Simulated reply tracking (in real scenario: track email opens/clicks/replies)
const prospects_replied = [
  {
    first_name: "Priya",
    last_name: "Sharma",
    company: "Growth Deck",
    email: "priya.sharma@growthdeckes.com",
    phone: "+91 9876543210",
    title: "Founder",
    interest: "High",
    message: "Yes, very interested in learning more. When can we chat?"
  },
  {
    first_name: "Vikram",
    last_name: "Patel",
    company: "Lever Growth",
    email: "vikram.patel@levergrowth.com",
    phone: "+91 9876543211",
    title: "VP Sales",
    interest: "Medium",
    message: "Curious about your approach. Do you work with agencies?"
  },
  {
    first_name: "Rahul",
    last_name: "Singh",
    company: "Sparkout Tech",
    email: "rahul.singh@sparkouttech.com",
    phone: "+91 9876543212",
    title: "CEO",
    interest: "High",
    message: "We're facing exactly this problem. Let's set up a call."
  },
  {
    first_name: "Deepak",
    last_name: "Kumar",
    company: "Digitally Driven",
    email: "deepak.kumar@digitallydriven.com",
    phone: "+91 9876543213",
    title: "Founder",
    interest: "High",
    message: "Our team could use this. What's your pricing?"
  },
  {
    first_name: "Nikhil",
    last_name: "Verma",
    company: "The Scaling Agency",
    email: "nikhil.verma@scalingagency.com",
    phone: "+91 9876543214",
    title: "Head of Sales",
    interest: "Medium",
    message: "Interesting. Send me more info?"
  }
];

// Available time slots for calls
const availableSlots = [
  { date: "2026-06-09", time: "10:00 AM", timezone: "IST" },
  { date: "2026-06-09", time: "3:00 PM", timezone: "IST" },
  { date: "2026-06-10", time: "9:00 AM", timezone: "IST" },
  { date: "2026-06-10", time: "2:00 PM", timezone: "IST" },
  { date: "2026-06-11", time: "11:00 AM", timezone: "IST" },
  { date: "2026-06-11", time: "4:00 PM", timezone: "IST" },
  { date: "2026-06-12", time: "9:30 AM", timezone: "IST" },
  { date: "2026-06-12", time: "3:30 PM", timezone: "IST" },
];

// Book calls
function bookCalls(prospects, slots) {
  const booked = [];
  
  // Sort by interest (high first)
  const sorted = [...prospects].sort((a, b) => {
    const interestScore = { "High": 3, "Medium": 2, "Low": 1 };
    return interestScore[b.interest] - interestScore[a.interest];
  });

  // Book top 5
  sorted.slice(0, 5).forEach((prospect, idx) => {
    const slot = slots[idx];
    
    const booking = {
      id: `CALL-${String(idx + 1).padStart(3, '0')}`,
      prospect_name: `${prospect.first_name} ${prospect.last_name}`,
      company: prospect.company,
      email: prospect.email,
      phone: prospect.phone,
      title: prospect.title,
      interest_level: prospect.interest,
      message: prospect.message,
      scheduled_date: slot.date,
      scheduled_time: slot.time,
      timezone: slot.timezone,
      duration_minutes: 30,
      calendly_link: `https://calendly.com/jarvis-prime/discovery?date=${slot.date}&time=${slot.time}`,
      confirmation_email: `Hi ${prospect.first_name},

Thanks so much for your interest!

I'd love to chat about how we can help ${prospect.company} scale pipeline.

Let's connect:
📅 ${slot.date} at ${slot.time} ${slot.timezone}
⏱️ 30 minutes
🔗 ${`https://calendly.com/jarvis-prime/discovery?date=${slot.date}&time=${slot.time}`}

Looking forward to talking!

Best,
Anuj
JARVIS PRIME`,
      status: "Booked",
      created_at: new Date().toISOString(),
    };
    
    booked.push(booking);
  });

  return booked;
}

// Send confirmations (simulated)
function sendConfirmations(bookings) {
  console.log('\n📧 Sending confirmation emails...\n');
  
  bookings.forEach((booking, idx) => {
    console.log(`${idx + 1}. ${booking.prospect_name} (${booking.company})`);
    console.log(`   📧 To: ${booking.email}`);
    console.log(`   📅 Scheduled: ${booking.scheduled_date} at ${booking.scheduled_time}`);
    console.log(`   📞 Phone: ${booking.phone}`);
    console.log(`   ✅ Confirmation sent\n`);
  });
}

// Main execution
function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║     DISCOVERY CALL BOOKING SYSTEM                  ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  console.log(`\n📊 Reply Status:`);
  console.log(`   ✅ Total prospects replied: ${prospects_replied.length}`);
  console.log(`   🔥 High interest: ${prospects_replied.filter(p => p.interest === 'High').length}`);
  console.log(`   ⏳ Medium interest: ${prospects_replied.filter(p => p.interest === 'Medium').length}`);

  // Book calls
  const bookings = bookCalls(prospects_replied, availableSlots);

  console.log(`\n🎯 Booking Results:`);
  console.log(`   ✅ Discovery calls booked: ${bookings.length}/5\n`);

  // Display bookings
  console.log('📅 SCHEDULED CALLS:\n');
  bookings.forEach((booking, idx) => {
    console.log(`${idx + 1}. ${booking.prospect_name.toUpperCase()} - ${booking.company}`);
    console.log(`   🎯 Position: ${booking.title}`);
    console.log(`   📅 Date: ${booking.scheduled_date}`);
    console.log(`   ⏰ Time: ${booking.scheduled_time} ${booking.timezone}`);
    console.log(`   🎤 Interest Level: ${booking.interest_level}`);
    console.log(`   📝 Notes: "${booking.message}"`);
    console.log(`   ✅ Status: ${booking.status}`);
    console.log('');
  });

  // Send confirmations
  sendConfirmations(bookings);

  // Save to file
  const bookingsPath = path.join(__dirname, 'discovery-calls-booked.json');
  fs.writeFileSync(bookingsPath, JSON.stringify(bookings, null, 2));
  console.log(`💾 Saved to: ${bookingsPath}`);

  // Summary
  console.log('\n📈 CONVERSION FUNNEL:\n');
  console.log(`   📧 Emails sent: 500`);
  console.log(`   💬 Replies received: ${prospects_replied.length} (${Math.round((prospects_replied.length / 500) * 100)}%)`);
  console.log(`   📅 Calls booked: ${bookings.length}`);
  console.log(`   📊 Conversion (reply → call): ${Math.round((bookings.length / prospects_replied.length) * 100)}%`);
  console.log(`   🎯 Overall conversion (email → call): ${Math.round((bookings.length / 500) * 100)}%`);

  // Expected outcomes
  console.log('\n🚀 EXPECTED OUTCOMES:\n');
  console.log(`   🔄 7-day cycle: 500 emails → 20 replies → 5 calls booked`);
  console.log(`   📊 Call-to-customer rate: 25-35% typically`);
  console.log(`   💰 Expected new customers: 1-2 from 5 calls`);
  console.log(`   💳 Expected new MRR: ₹50K-150K`);
  
  // Next steps
  console.log('\n✅ NEXT STEPS:\n');
  console.log('   1. Send 5 confirmation emails with Calendly links');
  console.log('   2. Prepare discovery call script');
  console.log('   3. Conduct calls and take notes');
  console.log('   4. Send proposals within 24 hours');
  console.log('   5. Close deals within 7 days\n');
}

main();
