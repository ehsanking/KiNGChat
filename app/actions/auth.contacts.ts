"use server";

// Compatibility layer for legacy imports. Re-export session-safe wrappers.
export { getContacts, addContact, removeContact } from './contacts.actions';
