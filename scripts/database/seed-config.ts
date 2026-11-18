export function seedConfiguration(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.NODE_ENV === "production" && environment.ALLOW_SEED_IN_PRODUCTION !== "true") {
    throw new Error(
      "Para carregar a apresentação em produção, defina ALLOW_SEED_IN_PRODUCTION=true apenas durante a execução do seed.",
    );
  }
  const password = environment.SEED_PASSWORD;
  if (!password || password.length < 8 || password.length > 128) {
    throw new Error("Defina SEED_PASSWORD com 8 a 128 caracteres para as contas da apresentação.");
  }
  return { password };
}
