export const config = {
  appName: 'Project Journal',
  dataRepoName: 'project-journal-data',
  apiVersion: '2026-03-10',
  schemaVersion: 3
};

export function validateConfig() {
  const errors = [];
  if (!/^[A-Za-z0-9_.-]+$/.test(config.dataRepoName)) {
    errors.push('dataRepoName contains unsupported characters.');
  }
  return errors;
}
