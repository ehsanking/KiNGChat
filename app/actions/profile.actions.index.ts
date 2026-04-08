'use server';

/**
 * @deprecated Legacy profile index.
 * Migration guide:
 * - Import from `profile.actions.ts`.
 */

export { getUserProfile, getPublicUserProfile, updateUserProfile } from './profile.actions';
