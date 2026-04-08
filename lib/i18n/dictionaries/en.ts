/**
 * English translations (source of truth).
 *
 * This dictionary defines the canonical keys used throughout the app.
 * All other locale dictionaries should mirror this structure.
 */

const en = {
  common: {
    loading: 'Loading...',
    error: 'An error occurred',
    retry: 'Try again',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    confirm: 'Confirm',
    back: 'Back',
    close: 'Close',
    search: 'Search',
    noResults: 'No results found',
    send: 'Send',
    logout: 'Log out',
    settings: 'Settings',
  },
  auth: {
    login: 'Log in',
    register: 'Create account',
    username: 'Username',
    password: 'Password',
    confirmPassword: 'Confirm password',
    forgotPassword: 'Forgot your password?',
    recoverAccount: 'Recover account',
    twoFactorCode: 'Two-factor code',
    loginSuccess: 'Logged in successfully',
    loginFailed: 'Invalid credentials',
    registerSuccess: 'Account created successfully',
    passwordPolicy: 'At least 8 characters with uppercase, lowercase, number, and special character.',
  },
  chat: {
    newMessage: 'New message',
    typeMessage: 'Type a message...',
    encrypted: 'Messages are end-to-end encrypted',
    noConversations: 'No conversations yet',
    contacts: 'Contacts',
    groups: 'Groups',
    channels: 'Channels',
    createGroup: 'Create group',
    typing: 'is typing...',
    delivered: 'Delivered',
    read: 'Read',
    sent: 'Sent',
    failed: 'Failed to send',
    retry: 'Tap to retry',
    connectionLost: 'Connection lost. Reconnecting...',
    e2eeEncrypted: 'End-to-end encrypted',
    e2eeKeysPending: 'Encryption keys not yet exchanged',
    e2eeGroupNotSupported: 'Group messages are not yet end-to-end encrypted',
    verifyContact: 'Verify contact',
    safetyNumberChanged: 'Security keys for this contact have changed. Verify their identity.',
  },
  admin: {
    dashboard: 'Admin Dashboard',
    users: 'Users',
    reports: 'Reports',
    settings: 'Settings',
    auditLogs: 'Audit Logs',
    ban: 'Ban',
    unban: 'Unban',
    approve: 'Approve',
  },
  profile: {
    editProfile: 'Edit profile',
    displayName: 'Display name',
    bio: 'Bio',
    profilePhoto: 'Profile photo',
  },
  errors: {
    somethingWentWrong: 'Something went wrong',
    unauthorized: 'You are not authorized to perform this action',
    connectionError: 'Connection error. Please check your network.',
    sessionExpired: 'Your session has expired. Please log in again.',
  },
  theme: {
    light: 'Light',
    dark: 'Dark',
    system: 'System',
  },
} as const;

type StringLeaves<T> = {
  [K in keyof T]: T[K] extends string ? string : StringLeaves<T[K]>;
};

export type TranslationDictionary = StringLeaves<typeof en>;
export default en;
