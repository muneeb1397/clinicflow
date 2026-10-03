import { z } from 'zod';

export const intakeZodSchema = z.object({
  symptoms: z.array(z.string()).min(1, 'At least one symptom is required'),
  duration: z.string().min(1, 'Duration of symptoms is required'),
  history: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
  meds: z.array(z.string()).default([]),
});

export function validateIntakeData(data) {
  try {
    const parsed = intakeZodSchema.parse(data);
    return { success: true, data: parsed };
  } catch (err) {
    return { success: false, errors: err.errors };
  }
}
