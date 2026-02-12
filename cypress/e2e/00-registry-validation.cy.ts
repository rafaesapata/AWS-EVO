/**
 * Registry Validation - Ensures ALL 203+ lambdas are registered
 * This test validates the registry itself before running domain tests
 */
import { ALL_LAMBDAS, HTTP_LAMBDAS, INTERNAL_LAMBDAS, PUBLIC_LAMBDAS } from '../support/lambda-registry';

describe('Lambda Registry Validation', () => {
  it('should have at least 200 lambdas registered', () => {
    expect(ALL_LAMBDAS.length).to.be.gte(200);
  });

  it('should have no duplicate lambda names', () => {
    const names = ALL_LAMBDAS.map(l => l.name);
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
    expect(duplicates, `Duplicate lambdas: ${duplicates.join(', ')}`).to.have.length(0);
  });

  it('should have HTTP lambdas with API routes', () => {
    expect(HTTP_LAMBDAS.length).to.be.gte(149);
  });

  it('should have internal lambdas without API routes', () => {
    expect(INTERNAL_LAMBDAS.length).to.be.gte(40);
  });

  it('should have public lambdas without auth', () => {
    const publicNames = PUBLIC_LAMBDAS.map(l => l.name);
    expect(publicNames).to.include('self-register');
    expect(publicNames).to.include('forgot-password');
    expect(publicNames).to.include('get-executive-dashboard-public');
    expect(publicNames).to.include('cloudformation-webhook');
    expect(publicNames).to.include('log-frontend-error');
    expect(publicNames).to.include('websocket-connect');
    expect(publicNames).to.include('websocket-disconnect');
  });

  it('every lambda should have required fields', () => {
    ALL_LAMBDAS.forEach(l => {
      expect(l.name, `Lambda missing name`).to.be.a('string').and.not.be.empty;
      expect(l.type, `${l.name} missing type`).to.be.oneOf(['http', 'internal']);
      expect(l.auth, `${l.name} missing auth`).to.be.oneOf(['cognito', 'none']);
      expect(l.domain, `${l.name} missing domain`).to.be.a('string').and.not.be.empty;
      expect(l.safe, `${l.name} missing safe`).to.be.a('boolean');
    });
  });

  it('should cover all 8 domains', () => {
    const domains = [...new Set(ALL_LAMBDAS.map(l => l.domain))].sort();
    expect(domains).to.include.members(['auth', 'security', 'cloud', 'cost', 'monitoring', 'operations', 'ai', 'integrations']);
  });

  it('all public lambdas should have auth: none', () => {
    PUBLIC_LAMBDAS.forEach(l => {
      expect(l.auth, `${l.name} is public but auth is not 'none'`).to.eq('none');
    });
  });

  it('internal lambdas should not have duplicate names', () => {
    const internalNames = INTERNAL_LAMBDAS.map(l => l.name);
    const dupes = internalNames.filter((n, i) => internalNames.indexOf(n) !== i);
    expect(dupes, `Duplicate internal lambdas: ${dupes.join(', ')}`).to.have.length(0);
  });
});
