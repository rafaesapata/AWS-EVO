/**
 * Standalone WebAuthn Check Handler
 * Checks if a user has WebAuthn credentials without requiring authentication
 */

import { PrismaClient } from '@prisma/client';

interface CheckRequest {
  email: string;
}

interface CheckResponse {
  hasWebAuthn: boolean;
  credentialsCount: number;
}

// Initialize Prisma client
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

export async function handler(event: any): Promise<any> {
  console.log('🔐 WebAuthn check handler called', { 
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
    const body: CheckRequest = event.body ? JSON.parse(event.body) : {};
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

  } catch (error: any) {
    console.error('🔐 WebAuthn check error:', error);
    
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