import { z } from "zod";

// Sign in with a mobile number or email. A username still works while people
// move over (the backend tries it last, and asks for a mobile or email when two
// accounts share it), so anything of three characters or more is accepted.
// The field stays `username`: that is the key POST /api/auth/login reads.
export const loginSchema = z.object({
  username: z
    .string()
    .min(1, "Enter your mobile number or email")
    .refine((v) => v.trim().length >= 3, {
      message: "Enter a valid mobile number or email",
    }),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type LoginFormData = z.infer<typeof loginSchema>;
