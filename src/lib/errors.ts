export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  invalidCredentials: () =>
    new AppError(401, "invalid_credentials", "RUT o contraseña incorrectos"),
  inactiveAccount: () => new AppError(401, "inactive_account", "Cuenta inactiva"),
  clientLoginUnavailable: () =>
    new AppError(403, "client_login_unavailable", "Login de cliente no disponible en este MVP"),
  unauthorized: () => new AppError(401, "unauthorized", "Autenticacion requerida"),
  forbidden: (message = "No tiene permisos para esta accion") =>
    new AppError(403, "forbidden", message),
  invalidRut: (rut: string) => new AppError(400, "invalid_rut", `RUT invalido: ${rut}`),
  duplicateRutOrEmail: () =>
    new AppError(409, "duplicate_user", "Ya existe un usuario con ese RUT o correo"),
  notFound: (what: string) => new AppError(404, "not_found", `${what} no encontrado`),
  invalidTransition: (desde: string, hacia: string) =>
    new AppError(409, "invalid_transition", `No se puede pasar de '${desde}' a '${hacia}'`),
  wrongPassword: () => new AppError(401, "wrong_password", "Contraseña actual incorrecta"),
  emailEnUso: () => new AppError(409, "email_en_uso", "Ese correo ya esta en uso por otro usuario"),
  notAssignedConductor: () =>
    new AppError(403, "not_assigned_conductor", "No es el conductor asignado a esta encomienda"),
  retiroNoRequerido: () =>
    new AppError(409, "retiro_no_requerido", "Esta encomienda no tiene direccion de retiro"),
  posicionDemasiadoFrecuente: () =>
    new AppError(429, "posicion_demasiado_frecuente", "Esperá al menos 1 segundo entre envios de posicion"),
};
