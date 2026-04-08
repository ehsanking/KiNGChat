'use server';

/**
 * @deprecated Legacy profile barrel.
 * Migration guide:
 * - Import profile operations from `profile.actions.ts`.
 * - Import key lookup from `keys.actions.ts`.
 */

export { getPublicUserProfile, getSelfUserProfile, updateUserProfile } from './profile.actions';
export { getUserPublicKeys } from './keys.actions';
