export const config = {
  appName: 'Project Journal',
  dataRepoName: 'project-journal-data',
  authBrokerUrl: '',
  apiVersion: '2026-03-10',
  schemaVersion: 3
};

export function validateConfig() {
  const errors = [];
  if (!/^[A-Za-z0-9_.-]+$/.test(config.dataRepoName)) {
    errors.push('dataRepoName contains unsupported characters.');
  }
  if (config.authBrokerUrl && !/^https:\/\/[A-Za-z0-9.-]+/.test(config.authBrokerUrl)) {
    errors.push('authBrokerUrl must be an HTTPS URL.');
  }
  return errors;
}
