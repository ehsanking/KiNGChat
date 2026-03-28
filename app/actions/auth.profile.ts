"use server";

// Compatibility layer for legacy imports. Re-export session-safe wrappers.
export { getUserProfile, updateUserProfile, getPublicUserProfile } from './profile.actions';
export { getPublicSettings } from './auth';
