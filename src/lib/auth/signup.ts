export type SignupFailureCode = "email_already_registered";

export type SignupFailure = {
  ok: false;
  message: string;
  code?: SignupFailureCode;
};

export function existingEmailSignupFailure(data: {
  user: { identities?: unknown[] | null } | null;
}): SignupFailure | null {
  if (!data.user || data.user.identities?.length !== 0) return null;

  return signupEmailAlreadyRegisteredFailure();
}

export function existingEmailSignupFailureFromError(error: {
  code?: string | null;
  message?: string | null;
}): SignupFailure | null {
  const isExistingEmail =
    error.code === "user_already_exists" ||
    error.code === "email_exists" ||
    error.message === "User already registered";

  return isExistingEmail ? signupEmailAlreadyRegisteredFailure() : null;
}

function signupEmailAlreadyRegisteredFailure(): SignupFailure {
  return {
    ok: false,
    code: "email_already_registered",
    message: "Email sudah terdaftar. Silakan login menggunakan email tersebut.",
  };
}
