/**
 * The MITRE ATT&CK techniques the timeline may use. Passed to the model as a schema enum,
 * and re-checked in code, so a technique ID that isn't on this list can never reach the UI.
 * Scoped to what this system's logs can actually show (Linux auth/sudo/auditd + log tampering).
 */
import type { MitreTechnique } from "../../evidence/src/aiReport.ts";
export type { MitreTechnique };

function technique(id: string, name: string, tactic: string): MitreTechnique {
  return { id, name, tactic, url: `https://attack.mitre.org/techniques/${id.replace(".", "/")}/` };
}

export const MITRE_TECHNIQUES: MitreTechnique[] = [
  technique("T1110", "Brute Force", "Credential Access"),
  technique("T1078", "Valid Accounts", "Initial Access"),
  technique("T1021.004", "Remote Services: SSH", "Lateral Movement"),
  technique("T1059.004", "Command and Scripting Interpreter: Unix Shell", "Execution"),
  technique("T1548.003", "Abuse Elevation Control Mechanism: Sudo and Sudo Caching", "Privilege Escalation"),
  technique("T1098", "Account Manipulation", "Persistence"),
  technique("T1003.008", "OS Credential Dumping: /etc/passwd and /etc/shadow", "Credential Access"),
  technique("T1070.002", "Indicator Removal: Clear Linux or Mac System Logs", "Defense Evasion"),
  technique("T1565.001", "Data Manipulation: Stored Data Manipulation", "Impact"),
  technique("T1562.001", "Impair Defenses: Disable or Modify Tools", "Defense Evasion"),
];

const BY_ID = new Map(MITRE_TECHNIQUES.map((t) => [t.id, t]));

export function lookupTechnique(id: unknown): MitreTechnique | null {
  return typeof id === "string" ? BY_ID.get(id) ?? null : null;
}

export const TECHNIQUE_IDS = MITRE_TECHNIQUES.map((t) => t.id);
