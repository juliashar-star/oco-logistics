const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AuthInputError = { field: string; message: string };

export function validateRegistration(input: {
  email: string;
  password: string;
  companyName: string;
}): AuthInputError[] {
  const errors: AuthInputError[] = [];

  if (!input.companyName.trim()) {
    errors.push({ field: "companyName", message: "Укажите название компании" });
  }

  if (!input.email.trim()) {
    errors.push({ field: "email", message: "Укажите email" });
  } else if (!EMAIL_RE.test(input.email.trim())) {
    errors.push({ field: "email", message: "Некорректный email" });
  }

  if (!input.password) {
    errors.push({ field: "password", message: "Укажите пароль" });
  } else if (input.password.length < 8) {
    errors.push({
      field: "password",
      message: "Пароль — минимум 8 символов",
    });
  }

  return errors;
}

export function validateLogin(input: {
  email: string;
  password: string;
}): AuthInputError[] {
  const errors: AuthInputError[] = [];

  if (!input.email.trim()) {
    errors.push({ field: "email", message: "Укажите email" });
  }

  if (!input.password) {
    errors.push({ field: "password", message: "Укажите пароль" });
  }

  return errors;
}

export function validateForgotPassword(input: { email: string }): AuthInputError[] {
  const errors: AuthInputError[] = [];

  if (!input.email.trim()) {
    errors.push({ field: "email", message: "Укажите email" });
  } else if (!EMAIL_RE.test(input.email.trim())) {
    errors.push({ field: "email", message: "Некорректный email" });
  }

  return errors;
}

export function validateUserProfile(input: {
  name?: string;
  warehouseAddress?: string;
}): AuthInputError[] {
  const errors: AuthInputError[] = [];

  if (input.name !== undefined && input.name.length > 100) {
    errors.push({ field: "name", message: "Имя — не более 100 символов" });
  }

  if (input.warehouseAddress !== undefined && input.warehouseAddress.length > 500) {
    errors.push({
      field: "warehouseAddress",
      message: "Адрес склада — не более 500 символов",
    });
  }

  return errors;
}

export function validateChangePassword(input: {
  currentPassword: string;
  newPassword: string;
}): AuthInputError[] {
  const errors: AuthInputError[] = [];

  if (!input.currentPassword) {
    errors.push({ field: "currentPassword", message: "Укажите текущий пароль" });
  }

  if (!input.newPassword) {
    errors.push({ field: "newPassword", message: "Укажите новый пароль" });
  } else if (input.newPassword.length < 8) {
    errors.push({
      field: "newPassword",
      message: "Пароль — минимум 8 символов",
    });
  }

  return errors;
}

export function validateResetPassword(input: {
  token: string;
  password: string;
}): AuthInputError[] {
  const errors: AuthInputError[] = [];

  if (!input.token.trim()) {
    errors.push({ field: "token", message: "Недействительная ссылка" });
  }

  if (!input.password) {
    errors.push({ field: "password", message: "Укажите пароль" });
  } else if (input.password.length < 8) {
    errors.push({
      field: "password",
      message: "Пароль — минимум 8 символов",
    });
  }

  return errors;
}
