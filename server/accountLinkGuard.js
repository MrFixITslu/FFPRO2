export function assertFinanceAccountAvailable(user, hubUserId, hubOrganizationId) {
  if (user.hub_user_id && user.hub_user_id !== hubUserId) {
    throw new Error('This FFPRO account is already linked to another Hub identity.');
  }
  if (user.hub_organization_id && user.hub_organization_id !== hubOrganizationId) {
    throw new Error('This FFPRO account is already linked to another V79 organisation.');
  }
}
