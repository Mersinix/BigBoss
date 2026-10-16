// A Maintenance sub-skill selection must stay qualified by its parent competency — the
// same sub-skill label (e.g. "Installation", "Entretien", "Réparation") legitimately
// exists under several different parent competencies in the admin-managed taxonomy
// (maintenanceSubCompetencies), and selecting it under one parent must never select it
// under another. Storing a bare sub-skill name in maintenanceProfiles.subSkills was the
// root cause of a real bug: `selectedSubSkills.includes(sub.name)` matched by name alone,
// so checking "Installation" under one competency made it appear checked under every
// other competency that also has an "Installation" sub-skill.
//
// Fix: every saved/selected sub-skill is a composite key "<competency>::<subSkill>" —
// the parent relationship travels with the selection itself instead of being
// reconstructed (ambiguously) by name lookup. Both client and server import these two
// functions — never hand-roll the "::" join/split anywhere else.
const SEPARATOR = "::";

export function encodeMaintenanceSubSkillKey(competencyName: string, subSkillName: string): string {
  return `${competencyName}${SEPARATOR}${subSkillName}`;
}

export function decodeMaintenanceSubSkillKey(key: string): { competency: string; subSkill: string } | null {
  const idx = key.indexOf(SEPARATOR);
  if (idx === -1) return null;
  return { competency: key.slice(0, idx), subSkill: key.slice(idx + SEPARATOR.length) };
}
