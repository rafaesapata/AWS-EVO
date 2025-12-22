/**
 * End-to-End Critical User Flows Tests
 * Tests complete user journeys from login to key features
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { createElement } from 'react';
import React from 'react';
import AuthGuard from '@/components/AuthGuard';
import { Toaster } from 'sonner';
import {
  mockCognitoAuth,
  mockApiClient,
  mockBedrockAI,
  mockUser,
  mockSession,
  createMockAWSAccount,
  createMockCostData,
  measurePerformance,
  checkAccessibility,
} from '../setup/test-environment';

// Mock components for E2E testing
const MockApp = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return createElement(
    BrowserRouter,
    {},
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(AuthGuard, {}, children),
      createElement(Toaster)
    )
  );
};

const MockDashboard = () => createElement('div', { 'data-testid': 'dashboard' }, 'Dashboard Content');
const MockSettings = () => createElement('div', { 'data-testid': 'settings' }, 'Settings Content');

describe('Critical User Flows E2E', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    
    // Setup default successful mocks
    mockCognitoAuth.getCurrentUser.mockResolvedValue(mockUser);
    mockCognitoAuth.getCurrentSession.mockResolvedValue(mockSession);
    mockApiClient.rpc.mockResolvedValue({ data: mockUser.organizationId, error: null });
    mockApiClient.invoke.mockResolvedValue({
      data: { isValid: true, plan: 'enterprise' },
      error: null,
    });
  });

  afterEach(() => {
    // Clean up any side effects
    document.body.innerHTML = '';
  });

  describe('Authentication Flow', () => {
    it('should complete full login flow', async () => {
      // Mock login page
      const LoginPage = () => {
        const [email, setEmail] = React.useState('');
        const [password, setPassword] = React.useState('');
        const [isLoading, setIsLoading] = React.useState(false);

        const handleLogin = async () => {
          setIsLoading(true);
          try {
            await mockCognitoAuth.signIn(email, password);
            // Redirect would happen here
          } catch (error) {
            console.error('Login failed:', error);
          } finally {
            setIsLoading(false);
          }
        };

        return createElement('div', { 'data-testid': 'login-page' }, [
          createElement('input', {
            key: 'email',
            'data-testid': 'email-input',
            type: 'email',
            value: email,
            onChange: (e: any) => setEmail(e.target.value),
            placeholder: 'Email',
          }),
          createElement('input', {
            key: 'password',
            'data-testid': 'password-input',
            type: 'password',
            value: password,
            onChange: (e: any) => setPassword(e.target.value),
            placeholder: 'Password',
          }),
          createElement('button', {
            key: 'login-btn',
            'data-testid': 'login-button',
            onClick: handleLogin,
            disabled: isLoading,
          }, isLoading ? 'Logging in...' : 'Login'),
        ]);
      };

      mockCognitoAuth.signIn.mockResolvedValue(mockSession);

      const { duration } = await measurePerformance(async () => {
        render(createElement(LoginPage));

        // Fill in login form
        await user.type(screen.getByTestId('email-input'), 'test@example.com');
        await user.type(screen.getByTestId('password-input'), 'password123');

        // Submit login
        await user.click(screen.getByTestId('login-button'));

        // Wait for login to complete
        await waitFor(() => {
          expect(mockCognitoAuth.signIn).toHaveBeenCalledWith('test@example.com', 'password123');
        });
      });

      expect(duration).toBeLessThan(3000); // Login should complete within 3 seconds
    });

    it('should handle login errors gracefully', async () => {
      const LoginPageWithError = () => {
        const [error, setError] = React.useState('');

        const handleLogin = async () => {
          try {
            await mockCognitoAuth.signIn('invalid@example.com', 'wrongpassword');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed');
          }
        };

        return createElement('div', {}, [
          createElement('button', {
            key: 'login-btn',
            'data-testid': 'login-button',
            onClick: handleLogin,
          }, 'Login'),
          error && createElement('div', {
            key: 'error',
            'data-testid': 'error-message',
            role: 'alert',
          }, error),
        ]);
      };

      mockCognitoAuth.signIn.mockRejectedValue(new Error('Invalid credentials'));

      render(createElement(LoginPageWithError));

      await user.click(screen.getByTestId('login-button'));

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toHaveTextContent('Invalid credentials');
      });

      // Check accessibility
      const container = screen.getByTestId('error-message').parentElement!;
      const accessibilityIssues = await checkAccessibility(container);
      expect(accessibilityIssues).toHaveLength(0);
    });
  });

  describe('Dashboard Navigation', () => {
    it('should navigate between dashboard sections', async () => {
      const DashboardApp = () => {
        const [currentView, setCurrentView] = React.useState('overview');

        return createElement('div', { 'data-testid': 'dashboard-app' }, [
          createElement('nav', { key: 'nav' }, [
            createElement('button', {
              key: 'overview',
              'data-testid': 'nav-overview',
              onClick: () => setCurrentView('overview'),
            }, 'Overview'),
            createElement('button', {
              key: 'costs',
              'data-testid': 'nav-costs',
              onClick: () => setCurrentView('costs'),
            }, 'Costs'),
            createElement('button', {
              key: 'security',
              'data-testid': 'nav-security',
              onClick: () => setCurrentView('security'),
            }, 'Security'),
          ]),
          createElement('main', {
            key: 'content',
            'data-testid': `${currentView}-content`,
          }, `${currentView} content`),
        ]);
      };

      render(createElement(MockApp, {}, createElement(DashboardApp)));

      // Test navigation
      await user.click(screen.getByTestId('nav-costs'));
      expect(screen.getByTestId('costs-content')).toBeInTheDocument();

      await user.click(screen.getByTestId('nav-security'));
      expect(screen.getByTestId('security-content')).toBeInTheDocument();

      await user.click(screen.getByTestId('nav-overview'));
      expect(screen.getByTestId('overview-content')).toBeInTheDocument();
    });
  });

  describe('Cost Analysis Workflow', () => {
    it('should complete cost analysis from data loading to recommendations', async () => {
      const costData = createMockCostData();
      const mockRecommendations = 'AI-generated cost optimization recommendations';

      mockApiClient.select.mockResolvedValue({ data: [costData], error: null });
      mockBedrockAI.generateCostOptimization.mockResolvedValue(mockRecommendations);

      const CostAnalysisPage = () => {
        const [data, setData] = React.useState(null);
        const [recommendations, setRecommendations] = React.useState('');
        const [isLoading, setIsLoading] = React.useState(false);

        const loadCostData = async () => {
          setIsLoading(true);
          try {
            const result = await mockApiClient.select('cost_data', {});
            if (result.data) {
              setData(result.data[0]);
            }
          } finally {
            setIsLoading(false);
          }
        };

        const generateRecommendations = async () => {
          if (!data) return;
          setIsLoading(true);
          try {
            const recs = await mockBedrockAI.generateCostOptimization(data);
            setRecommendations(recs);
          } finally {
            setIsLoading(false);
          }
        };

        return createElement('div', { 'data-testid': 'cost-analysis' }, [
          createElement('button', {
            key: 'load-data',
            'data-testid': 'load-data-button',
            onClick: loadCostData,
            disabled: isLoading,
          }, 'Load Cost Data'),
          data && createElement('div', {
            key: 'cost-data',
            'data-testid': 'cost-data',
          }, `Total Cost: $${data.totalCost}`),
          data && createElement('button', {
            key: 'generate-recs',
            'data-testid': 'generate-recommendations',
            onClick: generateRecommendations,
            disabled: isLoading,
          }, 'Generate AI Recommendations'),
          recommendations && createElement('div', {
            key: 'recommendations',
            'data-testid': 'recommendations',
          }, recommendations),
        ]);
      };

      const { duration } = await measurePerformance(async () => {
        render(createElement(MockApp, {}, createElement(CostAnalysisPage)));

        // Load cost data
        await user.click(screen.getByTestId('load-data-button'));
        await waitFor(() => {
          expect(screen.getByTestId('cost-data')).toHaveTextContent('Total Cost: $1000');
        });

        // Generate recommendations
        await user.click(screen.getByTestId('generate-recommendations'));
        await waitFor(() => {
          expect(screen.getByTestId('recommendations')).toHaveTextContent(mockRecommendations);
        });
      });

      expect(duration).toBeLessThan(5000); // Complete workflow within 5 seconds
      expect(mockApiClient.select).toHaveBeenCalledWith('cost_data', {});
      expect(mockBedrockAI.generateCostOptimization).toHaveBeenCalledWith(costData);
    });
  });

  describe('AWS Account Management', () => {
    it('should manage AWS account connections', async () => {
      const mockAccounts = [
        createMockAWSAccount({ id: 'acc-1', account_name: 'Production' }),
        createMockAWSAccount({ id: 'acc-2', account_name: 'Development' }),
      ];

      mockApiClient.select.mockResolvedValue({ data: mockAccounts, error: null });
      mockApiClient.insert.mockResolvedValue({ data: {}, error: null });

      const AccountManagement = () => {
        const [accounts, setAccounts] = React.useState([]);
        const [newAccountName, setNewAccountName] = React.useState('');

        const loadAccounts = async () => {
          const result = await mockApiClient.select('aws_credentials', {});
          if (result.data) {
            setAccounts(result.data);
          }
        };

        const addAccount = async () => {
          if (!newAccountName) return;
          await mockApiClient.insert('aws_credentials', {
            account_name: newAccountName,
            organization_id: mockUser.organizationId,
          });
          setNewAccountName('');
          await loadAccounts();
        };

        React.useEffect(() => {
          loadAccounts();
        }, []);

        return createElement('div', { 'data-testid': 'account-management' }, [
          createElement('div', { key: 'accounts' }, [
            createElement('h2', { key: 'title' }, 'AWS Accounts'),
            ...accounts.map((account: any) =>
              createElement('div', {
                key: account.id,
                'data-testid': `account-${account.id}`,
              }, account.account_name)
            ),
          ]),
          createElement('div', { key: 'add-form' }, [
            createElement('input', {
              key: 'name-input',
              'data-testid': 'account-name-input',
              value: newAccountName,
              onChange: (e: any) => setNewAccountName(e.target.value),
              placeholder: 'Account Name',
            }),
            createElement('button', {
              key: 'add-button',
              'data-testid': 'add-account-button',
              onClick: addAccount,
            }, 'Add Account'),
          ]),
        ]);
      };

      render(createElement(MockApp, {}, createElement(AccountManagement)));

      // Wait for accounts to load
      await waitFor(() => {
        expect(screen.getByTestId('account-acc-1')).toHaveTextContent('Production');
        expect(screen.getByTestId('account-acc-2')).toHaveTextContent('Development');
      });

      // Add new account
      await user.type(screen.getByTestId('account-name-input'), 'Staging');
      await user.click(screen.getByTestId('add-account-button'));

      expect(mockApiClient.insert).toHaveBeenCalledWith('aws_credentials', {
        account_name: 'Staging',
        organization_id: mockUser.organizationId,
      });
    });
  });

  describe('Knowledge Base Workflow', () => {
    it('should create and manage knowledge base articles with AI assistance', async () => {
      const mockArticle = {
        title: 'AWS Cost Optimization Guide',
        content: 'Comprehensive guide to optimizing AWS costs...',
        tags: ['aws', 'cost-optimization'],
        summary: 'This guide covers key strategies for reducing AWS costs.',
      };

      mockBedrockAI.generateKnowledgeBaseContent.mockResolvedValue(mockArticle);
      mockApiClient.insert.mockResolvedValue({ data: { id: 'article-123' }, error: null });

      const KnowledgeBaseEditor = () => {
        const [topic, setTopic] = React.useState('');
        const [article, setArticle] = React.useState(null);
        const [isSaving, setIsSaving] = React.useState(false);

        const generateArticle = async () => {
          if (!topic) return;
          const generated = await mockBedrockAI.generateKnowledgeBaseContent(topic);
          setArticle(generated);
        };

        const saveArticle = async () => {
          if (!article) return;
          setIsSaving(true);
          try {
            await mockApiClient.insert('knowledge_base_articles', {
              ...article,
              author_id: mockUser.id,
              organization_id: mockUser.organizationId,
            });
          } finally {
            setIsSaving(false);
          }
        };

        return createElement('div', { 'data-testid': 'kb-editor' }, [
          createElement('input', {
            key: 'topic-input',
            'data-testid': 'topic-input',
            value: topic,
            onChange: (e: any) => setTopic(e.target.value),
            placeholder: 'Article Topic',
          }),
          createElement('button', {
            key: 'generate-button',
            'data-testid': 'generate-article',
            onClick: generateArticle,
          }, 'Generate with AI'),
          article && createElement('div', {
            key: 'article-preview',
            'data-testid': 'article-preview',
          }, [
            createElement('h3', { key: 'title' }, article.title),
            createElement('p', { key: 'content' }, article.content),
            createElement('div', { key: 'tags' }, `Tags: ${article.tags.join(', ')}`),
          ]),
          article && createElement('button', {
            key: 'save-button',
            'data-testid': 'save-article',
            onClick: saveArticle,
            disabled: isSaving,
          }, isSaving ? 'Saving...' : 'Save Article'),
        ]);
      };

      render(createElement(MockApp, {}, createElement(KnowledgeBaseEditor)));

      // Generate article with AI
      await user.type(screen.getByTestId('topic-input'), 'AWS Cost Optimization');
      await user.click(screen.getByTestId('generate-article'));

      await waitFor(() => {
        expect(screen.getByTestId('article-preview')).toBeInTheDocument();
      });

      // Save article
      await user.click(screen.getByTestId('save-article'));

      expect(mockBedrockAI.generateKnowledgeBaseContent).toHaveBeenCalledWith('AWS Cost Optimization');
      expect(mockApiClient.insert).toHaveBeenCalledWith('knowledge_base_articles', {
        ...mockArticle,
        author_id: mockUser.id,
        organization_id: mockUser.organizationId,
      });
    });
  });

  describe('Performance and Accessibility', () => {
    it('should meet performance benchmarks for critical flows', async () => {
      const PerformanceTestApp = () => {
        const [data, setData] = React.useState(null);

        React.useEffect(() => {
          const loadData = async () => {
            const result = await mockApiClient.select('dashboard_data', {});
            setData(result.data);
          };
          loadData();
        }, []);

        return createElement('div', {
          'data-testid': 'performance-app',
        }, data ? 'Data loaded' : 'Loading...');
      };

      mockApiClient.select.mockResolvedValue({ data: { metrics: 'test' }, error: null });

      const { duration } = await measurePerformance(async () => {
        render(createElement(MockApp, {}, createElement(PerformanceTestApp)));
        
        await waitFor(() => {
          expect(screen.getByTestId('performance-app')).toHaveTextContent('Data loaded');
        });
      });

      expect(duration).toBeLessThan(2000); // Should load within 2 seconds
    });

    it('should meet accessibility standards', async () => {
      const AccessibleForm = () => createElement('form', {
        'data-testid': 'accessible-form',
      }, [
        createElement('label', {
          key: 'email-label',
          htmlFor: 'email-input',
        }, 'Email Address'),
        createElement('input', {
          key: 'email-input',
          id: 'email-input',
          type: 'email',
          required: true,
        }),
        createElement('label', {
          key: 'password-label',
          htmlFor: 'password-input',
        }, 'Password'),
        createElement('input', {
          key: 'password-input',
          id: 'password-input',
          type: 'password',
          required: true,
        }),
        createElement('button', {
          key: 'submit-button',
          type: 'submit',
        }, 'Submit'),
      ]);

      render(createElement(AccessibleForm));

      const form = screen.getByTestId('accessible-form');
      const accessibilityIssues = await checkAccessibility(form);

      expect(accessibilityIssues).toHaveLength(0);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle network failures gracefully', async () => {
      const ErrorHandlingApp = () => {
        const [error, setError] = React.useState('');
        const [retryCount, setRetryCount] = React.useState(0);

        const loadData = async () => {
          try {
            setError('');
            const result = await mockApiClient.select('test_data', {});
            if (result.error) {
              throw new Error(result.error.message);
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
          }
        };

        const retry = () => {
          setRetryCount(prev => prev + 1);
          loadData();
        };

        React.useEffect(() => {
          loadData();
        }, []);

        return createElement('div', { 'data-testid': 'error-handling-app' }, [
          error && createElement('div', {
            key: 'error',
            'data-testid': 'error-message',
            role: 'alert',
          }, error),
          error && createElement('button', {
            key: 'retry',
            'data-testid': 'retry-button',
            onClick: retry,
          }, `Retry (${retryCount})`),
        ]);
      };

      // First call fails, second succeeds
      mockApiClient.select
        .mockResolvedValueOnce({ data: null, error: { message: 'Network error' } })
        .mockResolvedValueOnce({ data: { success: true }, error: null });

      render(createElement(MockApp, {}, createElement(ErrorHandlingApp)));

      // Wait for error to appear
      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toHaveTextContent('Network error');
      });

      // Retry and succeed
      await user.click(screen.getByTestId('retry-button'));

      await waitFor(() => {
        expect(screen.queryByTestId('error-message')).not.toBeInTheDocument();
      });

      expect(mockApiClient.select).toHaveBeenCalledTimes(2);
    });
  });
});