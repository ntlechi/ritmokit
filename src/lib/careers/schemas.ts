import { z } from "zod";

export const jobShiftWindowSchema = z.enum([
  "MIDI",
  "SOIR",
  "FERMETURE",
  "WEEKEND",
]);

export const jobApplySchema = z
  .object({
    locationId: z.string().uuid(),
    fullName: z.string().min(1).max(120),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().max(40).optional(),
    neighborhood: z.string().min(1).max(120),
    availableShifts: z.array(jobShiftWindowSchema).min(1),
    commuteMinutes: z.number().int().nonnegative().max(240),
    yearsExperience: z.number().nonnegative().max(50).default(0),
    /** Legacy wire field — accepted for API compat, ignored by RitmoKit. */
    hasFoodPermit: z.boolean().default(false),
    speaksFrench: z.boolean().default(true),
    notes: z.string().max(2000).optional(),
    /** When true, store application locally only (no external push). */
    dryRun: z.boolean().optional(),
  })
  .strict();

export type JobApplyInput = z.infer<typeof jobApplySchema>;

/** Legacy external application wire format (careers API compat). */
export const legacyApplicationWireSchema = z
  .object({
    id: z.string().uuid(),
    locationId: z.string().uuid(),
    locationSlug: z.string().optional(),
    site: z.enum(["charlesbourg", "saint-roch"]).optional(),
    fullName: z.string(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    neighborhood: z.string(),
    availableShifts: z.array(
      z.enum(["midi", "soir", "fermeture", "weekend"])
    ),
    commuteMinutes: z.number().int().nonnegative(),
    yearsExperience: z.number().nonnegative(),
    hasFoodPermit: z.boolean(),
    speaksFrench: z.boolean(),
    notes: z.string().nullable().optional(),
    status: z.string().optional(),
    createdAt: z.string().datetime().optional(),
  })
  .strict();

export type LegacyApplicationWire = z.infer<typeof legacyApplicationWireSchema>;

export const triageCandidateSchema = z.object({
  candidateId: z.string().min(1),
  score: z.number().optional(),
  reasons: z.array(z.string()).default([]),
});

export const triageResultSchema = z
  .object({
    applicationIds: z.array(z.string().uuid()).min(1),
    traceId: z.string().optional(),
    summary: z.string().optional(),
    shortlisted: z.array(triageCandidateSchema),
    rejected: z.array(
      z.object({
        candidateId: z.string().min(1),
        reasons: z.array(z.string()).default([]),
      }),
    ),
  })
  .strict();

/** Synchronous triage report payload (careers API compat). */
export const triageReportSchema = z
  .object({
    report: z
      .object({
        payload: z
          .object({
            summary: z.unknown().optional(),
            shortlisted: z.array(triageCandidateSchema).optional(),
            rejected: z
              .array(
                z.object({
                  candidateId: z.string().min(1),
                  reasons: z.array(z.string()).default([]),
                }),
              )
              .optional(),
          })
          .passthrough()
          .optional(),
        context: z
          .object({
            traceId: z.string().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
