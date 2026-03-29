const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

export const PASSWORD_POLICY_MESSAGE =
  'Password must be at least 8 characters long and include uppercase, lowercase, number, and a special character.';

export const isPasswordPolicyCompliant = (password: string) => PASSWORD_REGEX.test(password);
