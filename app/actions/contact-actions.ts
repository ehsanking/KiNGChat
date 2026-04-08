'use server';

/**
 * @deprecated Legacy contacts barrel.
 * Migration guide:
 * - Import contact operations from `contacts.actions.ts`.
 * - Import search from `search.actions.ts`.
 */

export { addContact, removeContact, getContacts } from './contacts.actions';
export { searchUsers } from './search.actions';
