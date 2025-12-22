import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Shield, Lock, AlertCircle } from "lucide-react";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ChangePassword() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [mustChange, setMustChange] = useState(false);
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    checkPasswordChangeRequired();
  }, []);

  const checkPasswordChangeRequired = async () => {
    try {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      // Check if user has temporary password or force password change attribute
      const userAttributes = await cognitoAuth.getUserAttributes();
      const forcePasswordChange = userAttributes['custom:force_password_change'];
      
      if (forcePasswordChange === 'true' || user.challengeName === 'NEW_PASSWORD_REQUIRED') {
        setMustChange(true);
      }
    } catch (error) {
      console.error('Error checking password status:', error);
    }
  };

  const validatePassword = (password: string): string[] => {
    const errors: string[] = [];
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    if (!/[!@#$%^&*]/.test(password)) {
      errors.push('Password must contain at least one special character (!@#$%^&*)');
    }

    return errors;
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate new password
      const validationErrors = validatePassword(formData.newPassword);
      if (validationErrors.length > 0) {
        throw new Error(validationErrors.join('\n'));
      }

      // Check if passwords match
      if (formData.newPassword !== formData.confirmPassword) {
        throw new Error('New passwords do not match');
      }

      // Check if new password is different from current
      if (formData.newPassword === formData.currentPassword) {
        throw new Error('New password must be different from current password');
      }

      await cognitoAuth.changePassword(formData.currentPassword, formData.newPassword);

      // Update user attributes to remove force password change flag
      const user = await cognitoAuth.getCurrentUser();
      if (user) {
        await cognitoAuth.updateUserAttributes({
          'custom:force_password_change': 'false',
          'custom:last_password_change': new Date().toISOString()
        });

        // Log the password change via API
        await apiClient.invoke('log-audit', {
          action: 'PASSWORD_CHANGE',
          resourceType: 'user',
          resourceId: user.username,
          details: { forced: mustChange }
        });
      }

      toast({
        title: t('common.success'),
        description: 'Password changed successfully'
      });

      // Redirect to main app
      navigate('/app');

    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center animated-gradient p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 rounded-xl bg-gradient-primary">
              <Shield className="w-8 h-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-center">
            {mustChange ? 'Change Required Password' : 'Change Password'}
          </CardTitle>
          <CardDescription className="text-center">
            {mustChange 
              ? 'You must change your temporary password before continuing' 
              : 'Update your password to keep your account secure'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mustChange && (
            <Alert className="mb-4 border-yellow-500/50 bg-yellow-500/10">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-700 dark:text-yellow-400">
                For security reasons, you must change your temporary password.
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">
                Current Password *
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="currentPassword"
                  type="password"
                  placeholder="Enter current password"
                  value={formData.currentPassword}
                  onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                  required
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">
                New Password *
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="Enter new password"
                  value={formData.newPassword}
                  onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                  required
                  className="pl-10"
                />
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Password must contain:</p>
                <ul className="list-disc list-inside pl-2">
                  <li>At least 8 characters</li>
                  <li>One uppercase letter</li>
                  <li>One lowercase letter</li>
                  <li>One number</li>
                  <li>One special character (!@#$%^&*)</li>
                </ul>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">
                Confirm New Password *
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm new password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  required
                  className="pl-10"
                />
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Changing Password...' : 'Change Password'}
            </Button>

            {!mustChange && (
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/app')}
                className="w-full"
              >
                Cancel
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}