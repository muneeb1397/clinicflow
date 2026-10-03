import mongoose from 'mongoose';
import { seedDB } from './seed.js';
import { routeMessage, processAgentMessage } from './services/agentService.js';
import { AgentTrace } from './models/AgentTrace.js';
import { Appointment } from './models/Appointment.js';

const testDataset = [
  // Book (6)
  { message: "Book an appointment with Dr. Sarah tomorrow morning.", expectedIntent: "book" },
  { message: "I'd like to schedule a visit with a cardiologist.", expectedIntent: "book" },
  { message: "Can I reserve a slot for Dr. Michael Chen?", expectedIntent: "book" },
  { message: "I need to see a pediatrics doctor next Monday.", expectedIntent: "book" },
  { message: "Please book me an open slot.", expectedIntent: "book" },
  { message: "Schedule consultation for Dr. Emily Rodriguez.", expectedIntent: "book" },

  // Reschedule (5)
  { message: "I need to reschedule my appointment to next week.", expectedIntent: "reschedule" },
  { message: "Can I move my appointment to Friday?", expectedIntent: "reschedule" },
  { message: "Change my slot with Dr. Chen.", expectedIntent: "reschedule" },
  { message: "I would like to postpone my booking.", expectedIntent: "reschedule" },
  { message: "Can we change appointment time?", expectedIntent: "reschedule" },

  // Intake (6)
  { message: "My symptoms include severe headache and nausea.", expectedIntent: "intake" },
  { message: "I have a persistent cough and fever for 3 days.", expectedIntent: "intake" },
  { message: "Logging my medical history: asthma and hypertension.", expectedIntent: "intake" },
  { message: "I have shortness of breath when walking.", expectedIntent: "intake" },
  { message: "My stomach hurts after eating.", expectedIntent: "intake" },
  { message: "Here are my symptom details for intake.", expectedIntent: "intake" },

  // Insurance (6)
  { message: "Check if my BlueCross policy BC-987654 is covered.", expectedIntent: "insurance" },
  { message: "What is my insurance copay for Aetna?", expectedIntent: "insurance" },
  { message: "Validate my Cigna insurance policy CIG-456789.", expectedIntent: "insurance" },
  { message: "Is UnitedHealth insurance accepted at your clinic?", expectedIntent: "insurance" },
  { message: "Check policy status for UH-112233.", expectedIntent: "insurance" },
  { message: "Does my insurance cover pediatric visits?", expectedIntent: "insurance" },

  // Other (7)
  { message: "What is the parking situation at the clinic?", expectedIntent: "other" },
  { message: "Hello, how are you today?", expectedIntent: "other" },
  { message: "Where is the clinic located?", expectedIntent: "other" },
  { message: "What are your opening hours?", expectedIntent: "other" },
  { message: "Can I bring my dog to the clinic?", expectedIntent: "other" },
  { message: "Who is the President of the United States?", expectedIntent: "other" },
  { message: "What is the weather outside?", expectedIntent: "other" }
];

async function runRouterBenchmark() {
  console.log('====================================================');
  console.log('  Step 4 & Step 5: Router & Multi-Agent Benchmark');
  console.log('====================================================');

  await seedDB();
  await AgentTrace.deleteMany({}); // clear past traces for clean test

  let correctCount = 0;
  const testSessionId = `test-benchmark-${Date.now()}`;

  console.log(`\nEvaluating ${testDataset.length} test messages...\n`);

  for (let i = 0; i < testDataset.length; i++) {
    const { message, expectedIntent } = testDataset[i];
    const result = await routeMessage(message, testSessionId);
    
    const isCorrect = result.intent === expectedIntent;
    if (isCorrect) correctCount++;

    const statusSymbol = isCorrect ? '✅' : '❌';
    console.log(
      `[${String(i + 1).padStart(2, '0')}/30] ${statusSymbol} Msg: "${message}" -> Classified: ${result.intent} (expected: ${expectedIntent}, conf: ${result.confidence})`
    );
  }

  const accuracyPct = ((correctCount / testDataset.length) * 100).toFixed(1);
  console.log(`\n----------------------------------------------------`);
  console.log(`Router Classification Accuracy: ${correctCount}/${testDataset.length} (${accuracyPct}%)`);
  console.log(`----------------------------------------------------`);

  if (correctCount < 27) {
    console.error(`❌ Accuracy threshold (90%) not met. Got ${accuracyPct}%`);
    process.exit(1);
  } else {
    console.log(`✅ Step 5 Router Accuracy check PASSED! (${accuracyPct}% >= 90%)`);
  }

  // Verify trace logging
  const traceCount = await AgentTrace.countDocuments({ sessionId: testSessionId });
  console.log(`Agent traces logged for session: ${traceCount}`);
  if (traceCount !== testDataset.length) {
    throw new Error(`Expected ${testDataset.length} traces in DB, found ${traceCount}`);
  }
  console.log('✅ Check: Every router hand-off was logged to agent_traces');

  // Verify Step 4 check 1: "Book Dr. X tomorrow morning" creates real appointment in Atlas/MongoDB
  console.log('\n--- Testing Step 4 Functional Loop Checks ---');
  const appointmentCountBefore = await Appointment.countDocuments();

  const bookingAgentResponse = await processAgentMessage({
    message: 'Book Dr. Sarah tomorrow morning',
    sessionId: testSessionId,
  });
  console.log('Booking agent response:', bookingAgentResponse);

  const appointmentCountAfter = await Appointment.countDocuments();
  if (appointmentCountAfter <= appointmentCountBefore) {
    throw new Error('Appointment was not created in database by booking request!');
  }
  console.log('✅ Check: "Book Dr. X" created a real appointment in MongoDB database');

  // Verify Step 4 check 2: "What's wrong with my chest pain?" is refused & redirected
  const safetyResponse = await processAgentMessage({
    message: "What's wrong with my chest pain?",
    sessionId: testSessionId,
  });
  console.log('Safety check response:', safetyResponse);

  if (
    safetyResponse.intent !== 'safety_refusal' ||
    !safetyResponse.reply.includes('cannot provide medical advice')
  ) {
    throw new Error('Safety check failed: Medical diagnosis prompt was not refused!');
  }
  console.log('✅ Check: Medical advice prompt was properly refused and redirected');

  console.log('\n🎉 ALL STEP 4 & STEP 5 CHECKS PASSED SUCCESSFULLY!');
  await mongoose.connection.close();
}

runRouterBenchmark().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
