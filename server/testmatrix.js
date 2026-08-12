/**
 * Test matrix coverage.
 *
 * The evaluation team's matrix states, for each mission profile, how many
 * data points that profile requires. Coverage is the count of runs actually
 * logged against the profile measured against that requirement, so the
 * report can say which profiles are complete and which still owe sorties
 * rather than reporting only what happened to be flown.
 *
 * Runs logged without a profile are counted separately as unassigned. They
 * are not spread across profiles: guessing which line of the matrix a run
 * belonged to would manufacture coverage that was never demonstrated.
 */

/** @returns {string} Coverage status label for a profile. */
function statusFor(achieved, required) {
  if (achieved === 0) {
    return "not started";
  }
  if (achieved >= required) {
    return "complete";
  }
  return "short";
}

/**
 * @param {object[]} profiles Test profiles with their target lines.
 * @param {object[]} engagements Engagement rows for the period.
 * @returns {{ rows: object[], unassigned: number, complete: number, total: number }}
 */
export function buildMatrixCoverage(profiles, engagements) {
  const counts = new Map();
  for (const row of engagements) {
    if (row.test_profile_id === null || row.test_profile_id === undefined) {
      continue;
    }
    const key = String(row.test_profile_id);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const rows = profiles.map((profile) => {
    const achieved = counts.get(String(profile.id)) || 0;
    const required = profile.dataPointsRequired;
    return {
      ...profile,
      achieved,
      required,
      remaining: Math.max(required - achieved, 0),
      status: statusFor(achieved, required),
    };
  });
  const assigned = [...counts.values()].reduce((sum, value) => sum + value, 0);
  return {
    rows,
    unassigned: engagements.length - assigned,
    complete: rows.filter((row) => row.status === "complete").length,
    total: rows.length,
  };
}
