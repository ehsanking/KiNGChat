export type RegisterV2Input = {
  username: string;
  password: string;
  confirmPassword: string;
  agreementPublicKey: string;
  signingPublicKey: string;
  signedPreKey: string;
  signedPreKeySig: string;
  recoveryQuestion: string;
  recoveryAnswer: string;
  captchaToken?: string;
  email?: string;
};

export async function registerUserWithBundleV2(input: RegisterV2Input) {
  const response = await fetch('/api/e2ee/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return response.json();
}
