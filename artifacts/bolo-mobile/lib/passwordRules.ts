// THE PASSWORD CHECKLIST, build 19. Owner, 2026-08-29: "password should
// have a criteria met checkboxes as the user types the password. The minimum
// criteria needs to be met, show X in red for things not met, and a green
// and checkmark if it's met while they type."
//
// THREE RULES, and the first is the only one Clerk enforces server-side
// (its default policy is a minimum of eight characters; a breached password
// is refused too, which no client can check). The letter and number rules
// are ours, stricter than Clerk by design: a password that passes here
// passes Clerk's length rule, never the other way round, so the checklist
// can never say yes to something the server then refuses for length.
//
// Pure, so the sign-up and set-password screens and their tests share one
// definition. The drawing lives in components/PasswordChecklist.tsx.

export type PasswordRule = {
  key: 'length' | 'letter' | 'number';
  label: string;
  test: (password: string) => boolean;
};

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    key: 'length',
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (p) => p.length >= PASSWORD_MIN_LENGTH,
  },
  { key: 'letter', label: 'A letter', test: (p) => /\p{L}/u.test(p) },
  { key: 'number', label: 'A number', test: (p) => /\d/.test(p) },
];

export type PasswordCheck = { key: PasswordRule['key']; label: string; met: boolean };

export function checkPassword(password: string): PasswordCheck[] {
  return PASSWORD_RULES.map((r) => ({ key: r.key, label: r.label, met: r.test(password) }));
}

export function passwordMeetsAll(password: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(password));
}

/** The first unmet rule, worded for an error line, or null when all are met. */
export function passwordProblem(password: string): string | null {
  const unmet = PASSWORD_RULES.find((r) => !r.test(password));
  if (!unmet) return null;
  return unmet.key === 'length'
    ? `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
    : `Password needs ${unmet.label.toLowerCase()}.`;
}
