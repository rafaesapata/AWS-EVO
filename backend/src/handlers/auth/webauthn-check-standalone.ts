/**
 * Standalone Auth Handler
 * Handles WebAuthn check and forgot password functionality without requiring authentication
 */

import { PrismaClient } from '@prisma/client';
import { 
  CognitoIdentityProviderClient, 
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand
} from '@aws-sdk/client-cognito-identity-provider';

interface CheckRequest {
  email: string;
}

interface CheckResponse {
  hasWebAuthn: boolean;
  credentialsCount: number;
}

interface ForgotPasswordRequest {
  action: 'request' | 'confirm';
  email: string;
  confirmationCode?: string;
  newPassword?: string;
}

// Initialize clients
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

const cognitoClient = new CognitoIdentityProviderClient({ region: 'us-east-1' });

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidPassword(password: string): boolean {
  const minLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  
  return minLength && hasUpper && hasLower && hasNumber && hasSpecial;
}

export async function handler(event: any): Promise<any> {
  console.log('🔐 Auth handler called', { 
    httpMethod: event.httpMethod,
    body: event.body 
  });

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: ''
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    
    // Check if this is a forgot password request
    if (body.action === 'request' || body.action === 'confirm') {
      return await handleForgotPassword(body, event);
    }
    
    // Otherwise, handle WebAuthn check
    return await handleWebAuthnCheck(body);

  } catch (error: any) {
    console.error('🔐 Auth handler error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
}

async function handleWebAuthnCheck(body: CheckRequest): Promise<any> {
  const { email } = body;

  console.log('🔐 Checking WebAuthn for email:', email);

  if (!email) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Email is required' })
    };
  }

  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email }
  });

  console.log('🔐 User lookup result:', { 
    email, 
    userFound: !!user, 
    userId: user?.id 
  });

  if (!user) {
    // User not found - no WebAuthn
    const response: CheckResponse = {
      hasWebAuthn: false,
      credentialsCount: 0
    };

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(response)
    };
  }

  // Check for WebAuthn credentials
  const webauthnCredentials = await prisma.webAuthnCredential.findMany({
    where: { user_id: user.id }
  });

  console.log('🔐 WebAuthn credentials found:', {
    userId: user.id,
    credentialsCount: webauthnCredentials.length,
    credentials: webauthnCredentials.map(c => ({
      id: c.id,
      device_name: c.device_name,
      created_at: c.created_at
    }))
  });

  const response: CheckResponse = {
    hasWebAuthn: webauthnCredentials.length > 0,
    credentialsCount: webauthnCredentials.length
  };

  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(response)
  };
}

async function handleForgotPassword(body: ForgotPasswordRequest, event: any): Promise<any> {
  const { action, email, confirmationCode, newPassword } = body;

  console.log('🔐 Forgot password request:', { action, email });

  if (!action || !email) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Missing required fields: action and email' })
    };
  }

  if (!isValidEmail(email)) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Invalid email format' })
    };
  }

  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID;

  if (!userPoolId || !clientId) {
    console.error('Cognito configuration missing', { userPoolId: !!userPoolId, clientId: !!clientId });
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Authentication service not configured' })
    };
  }

  if (action === 'request') {
    // Verificar se o usuário existe no banco de dados
    const user = await prisma.user.findUnique({
      where: { email }
    });

    let userProfile = null;
    if (user) {
      userProfile = await prisma.profile.findFirst({
        where: { user_id: user.id },
        include: {
          organization: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });
    }

    if (!user) {
      // Por segurança, não revelamos se o usuário existe ou não
      console.log('🔐 Password reset requested for non-existent user:', email);
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: 'Se o email existir em nosso sistema, você receberá instruções para redefinir sua senha.'
        })
      };
    }

    try {
      // Solicitar reset de senha no Cognito
      await cognitoClient.send(new ForgotPasswordCommand({
        ClientId: clientId,
        Username: email
      }));

      // Registrar evento de segurança
      const organizationId = userProfile?.organization_id || process.env.SYSTEM_ORGANIZATION_ID || 'system';
      
      await prisma.securityEvent.create({
        data: {
          organization_id: organizationId,
          event_type: 'PASSWORD_RESET_REQUESTED',
          severity: 'INFO',
          description: 'Password reset requested',
          metadata: { 
            email,
            userId: user.id,
            requestIp: event.requestContext?.identity?.sourceIp || event.headers?.['x-forwarded-for']?.split(',')[0],
            userAgent: event.headers?.['user-agent']
          }
        }
      });

      console.log('✅ Password reset email sent:', { email, userId: user.id });

      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: 'Se o email existir em nosso sistema, você receberá instruções para redefinir sua senha.'
        })
      };

    } catch (cognitoError: any) {
      console.error('❌ Cognito forgot password error:', { email, error: cognitoError });

      // Tratar erros específicos do Cognito
      if (cognitoError.name === 'UserNotFoundException') {
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: 'Se o email existir em nosso sistema, você receberá instruções para redefinir sua senha.'
          })
        };
      }

      if (cognitoError.name === 'LimitExceededException') {
        return {
          statusCode: 429,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ error: 'Muitas tentativas. Tente novamente mais tarde.' })
        };
      }

      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Erro interno do servidor' })
      };
    }

  } else if (action === 'confirm') {
    if (!confirmationCode || !newPassword) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Missing required fields: confirmationCode and newPassword' })
      };
    }

    if (!isValidPassword(newPassword)) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: 'A senha deve ter pelo menos 8 caracteres e incluir: maiúscula, minúscula, número e caractere especial'
        })
      };
    }

    try {
      // Confirmar reset de senha no Cognito
      await cognitoClient.send(new ConfirmForgotPasswordCommand({
        ClientId: clientId,
        Username: email,
        ConfirmationCode: confirmationCode,
        Password: newPassword
      }));

      // Buscar usuário para logging
      const user = await prisma.user.findUnique({
        where: { email }
      });

      let userProfile = null;
      if (user) {
        userProfile = await prisma.profile.findFirst({
          where: { user_id: user.id },
          include: {
            organization: true
          }
        });

        const organizationId = userProfile?.organization_id || process.env.SYSTEM_ORGANIZATION_ID || 'system';
        
        // Registrar evento de segurança
        await prisma.securityEvent.create({
          data: {
            organization_id: organizationId,
            event_type: 'PASSWORD_RESET_COMPLETED',
            severity: 'INFO',
            description: 'Password reset completed successfully',
            metadata: { 
              email,
              userId: user.id,
              requestIp: event.requestContext?.identity?.sourceIp || event.headers?.['x-forwarded-for']?.split(',')[0],
              userAgent: event.headers?.['user-agent']
            }
          }
        });
      }

      console.log('✅ Password reset completed:', email);

      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: 'Senha redefinida com sucesso. Você pode fazer login com sua nova senha.'
        })
      };

    } catch (cognitoError: any) {
      console.error('❌ Cognito confirm forgot password error:', { email, error: cognitoError });

      if (cognitoError.name === 'CodeMismatchException') {
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ error: 'Código de confirmação inválido' })
        };
      }

      if (cognitoError.name === 'ExpiredCodeException') {
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ error: 'Código de confirmação expirado. Solicite um novo código.' })
        };
      }

      if (cognitoError.name === 'InvalidPasswordException') {
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ error: 'Senha não atende aos requisitos de segurança' })
        };
      }

      if (cognitoError.name === 'LimitExceededException') {
        return {
          statusCode: 429,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ error: 'Muitas tentativas. Tente novamente mais tarde.' })
        };
      }

      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Erro ao redefinir senha' })
      };
    }

  } else {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Invalid action. Must be "request" or "confirm"' })
    };
  }
}