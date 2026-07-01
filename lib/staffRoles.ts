/**
 * Roles allowed to use the TL (team-leader) dashboard.
 * Team leaders all carry the `admin` role, so access is gated to admin only.
 * "Team leader" is a soft, non-auth attribute (see user_team_lead_tags) used for
 * dropdown filtering — it is NOT an access-control role.
 */
export function isStaffRole(role: string | null | undefined): boolean {
  return role === 'admin';
}
