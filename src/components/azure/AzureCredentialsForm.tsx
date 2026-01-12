/**
 * Azure Credentials Form
 * 
 * Form for adding/editing Azure Service Principal credentials.
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Eye, EyeOff, HelpCircle, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiClient } from '@/integrations/aws/api-client';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

// Validation schema
const azureCredentialsSchema = z.object({
  tenantId: z.string()
    .min(36, 'Tenant ID must be a valid GUID')
    .max(36, 'Tenant ID must be a valid GUID')
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid Tenant ID format'),
  clientId: z.string()
    .min(36, 'Client ID must be a valid GUID')
    .max(36, 'Client ID must be a valid GUID')
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid Client ID format'),
  clientSecret: z.string()
    .min(1, 'Client Secret is required'),
  subscriptionId: z.string()
    .min(36, 'Subscription ID must be a valid GUID')
    .max(36, 'Subscription ID must be a valid GUID')
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid Subscription ID format'),
  subscriptionName: z.string().optional(),
  regions: z.array(z.string()).optional(),
});

type AzureCredentialsFormData = z.infer<typeof azureCredentialsSchema>;

interface AzureCredentialsFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  initialData?: Partial<AzureCredentialsFormData>;
  mode?: 'create' | 'edit';
}

export function AzureCredentialsForm({ 
  onSuccess, 
  onCancel, 
  initialData,
  mode = 'create' 
}: AzureCredentialsFormProps) {
  const { t } = useTranslation();
  const [showSecret, setShowSecret] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    message?: string;
    subscriptionName?: string;
  } | null>(null);

  const form = useForm<AzureCredentialsFormData>({
    resolver: zodResolver(azureCredentialsSchema),
    defaultValues: {
      tenantId: initialData?.tenantId || '',
      clientId: initialData?.clientId || '',
      clientSecret: initialData?.clientSecret || '',
      subscriptionId: initialData?.subscriptionId || '',
      subscriptionName: initialData?.subscriptionName || '',
      regions: initialData?.regions || ['eastus', 'westus2', 'westeurope'],
    },
  });

  const validateCredentials = async () => {
    const values = form.getValues();
    
    // Validate form first
    const isValid = await form.trigger(['tenantId', 'clientId', 'clientSecret', 'subscriptionId']);
    if (!isValid) return;

    setIsValidating(true);
    setValidationResult(null);

    try {
      const result = await apiClient.invoke<any>('validate-azure-credentials', {
        body: {
          tenantId: values.tenantId,
          clientId: values.clientId,
          clientSecret: values.clientSecret,
          subscriptionId: values.subscriptionId,
        },
      });

      if (result.error) {
        setValidationResult({
          valid: false,
          message: result.error.message || 'Validation failed',
        });
        return;
      }

      const data = result.data?.data || result.data;
      if (data?.valid) {
        setValidationResult({
          valid: true,
          subscriptionName: data.subscriptionName,
        });
        // Auto-fill subscription name if found
        if (data.subscriptionName && !values.subscriptionName) {
          form.setValue('subscriptionName', data.subscriptionName);
        }
      } else {
        setValidationResult({
          valid: false,
          message: data?.error || 'Invalid credentials',
        });
      }
    } catch (err: any) {
      setValidationResult({
        valid: false,
        message: err.message || 'Validation failed',
      });
    } finally {
      setIsValidating(false);
    }
  };

  const onSubmit = async (data: AzureCredentialsFormData) => {
    try {
      const result = await apiClient.invoke<any>('save-azure-credentials', {
        body: {
          tenantId: data.tenantId,
          clientId: data.clientId,
          clientSecret: data.clientSecret,
          subscriptionId: data.subscriptionId,
          subscriptionName: data.subscriptionName,
          regions: data.regions,
        },
      });

      if (result.error) {
        toast.error(result.error.message || 'Failed to save credentials');
        return;
      }

      toast.success(t('azure.credentialsSaved', 'Azure credentials saved successfully'));
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save credentials');
    }
  };

  const FieldHelp = ({ text }: { text: string }) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
        </TooltipTrigger>
        <TooltipContent className="max-w-[300px]">
          <p>{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Tenant ID */}
        <FormField
          control={form.control}
          name="tenantId"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center gap-2">
                <FormLabel>{t('azure.tenantId', 'Tenant ID (Directory ID)')}</FormLabel>
                <FieldHelp text="Found in Azure Portal > Azure Active Directory > Overview" />
              </div>
              <FormControl>
                <Input 
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" 
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Client ID */}
        <FormField
          control={form.control}
          name="clientId"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center gap-2">
                <FormLabel>{t('azure.clientId', 'Client ID (Application ID)')}</FormLabel>
                <FieldHelp text="Found in Azure Portal > App Registrations > Your App > Overview" />
              </div>
              <FormControl>
                <Input 
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" 
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Client Secret */}
        <FormField
          control={form.control}
          name="clientSecret"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center gap-2">
                <FormLabel>{t('azure.clientSecret', 'Client Secret')}</FormLabel>
                <FieldHelp text="Created in Azure Portal > App Registrations > Your App > Certificates & secrets" />
              </div>
              <FormControl>
                <div className="relative">
                  <Input 
                    type={showSecret ? 'text' : 'password'}
                    placeholder="Enter client secret" 
                    {...field} 
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Subscription ID */}
        <FormField
          control={form.control}
          name="subscriptionId"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center gap-2">
                <FormLabel>{t('azure.subscriptionId', 'Subscription ID')}</FormLabel>
                <FieldHelp text="Found in Azure Portal > Subscriptions > Your Subscription" />
              </div>
              <FormControl>
                <Input 
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" 
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Subscription Name (optional) */}
        <FormField
          control={form.control}
          name="subscriptionName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('azure.subscriptionName', 'Subscription Name')} ({t('common.optional', 'optional')})</FormLabel>
              <FormControl>
                <Input 
                  placeholder="My Azure Subscription" 
                  {...field} 
                />
              </FormControl>
              <FormDescription>
                {t('azure.subscriptionNameHelp', 'A friendly name to identify this subscription')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Validation Result */}
        {validationResult && (
          <Alert variant={validationResult.valid ? 'default' : 'destructive'}>
            <div className="flex items-center gap-2">
              {validationResult.valid ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                {validationResult.valid 
                  ? t('azure.credentialsValid', 'Credentials validated successfully') + 
                    (validationResult.subscriptionName ? ` - ${validationResult.subscriptionName}` : '')
                  : validationResult.message
                }
              </AlertDescription>
            </div>
          </Alert>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={validateCredentials}
            disabled={isValidating}
          >
            {isValidating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('azure.validateCredentials', 'Validate Credentials')}
          </Button>
          
          <div className="flex-1" />
          
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t('common.cancel', 'Cancel')}
            </Button>
          )}
          
          <Button 
            type="submit" 
            disabled={form.formState.isSubmitting || (validationResult !== null && !validationResult.valid)}
          >
            {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'create' 
              ? t('azure.addCredentials', 'Add Azure Credentials')
              : t('azure.updateCredentials', 'Update Credentials')
            }
          </Button>
        </div>
      </form>
    </Form>
  );
}
