// Local adapter: secrets are read from environment variables loaded by dev.js.
// Production deployments should inject a workload identity backed by Vault/Secret Manager.
export class EnvironmentSecretProvider {
  constructor(environment = process.env) {
    this.environment = environment;
  }

  getSecret(reference) {
    const value = this.environment[reference];
    if (!value) throw new Error(`Missing secret reference: ${reference}`);
    return value;
  }
}

export const secretProvider = new EnvironmentSecretProvider();
