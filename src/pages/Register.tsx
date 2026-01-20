import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Building2, Mail, Lock, User, Phone, MapPin, 
  Eye, EyeOff, ArrowLeft, ArrowRight, Check, Loader2,
  Hash
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import evoLogo from "@/assets/evo-logo.png";
import { getVersionString } from "@/lib/version";
import { apiClient } from "@/integrations/aws/api-client";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";

// Country type
type Country = 'BR' | 'US';

// Brazilian states
const BR_STATES = [
  { value: 'AC', label: 'Acre' }, { value: 'AL', label: 'Alagoas' },
  { value: 'AP', label: 'Amapá' }, { value: 'AM', label: 'Amazonas' },
  { value: 'BA', label: 'Bahia' }, { value: 'CE', label: 'Ceará' },
  { value: 'DF', label: 'Distrito Federal' }, { value: 'ES', label: 'Espírito Santo' },
  { value: 'GO', label: 'Goiás' }, { value: 'MA', label: 'Maranhão' },
  { value: 'MT', label: 'Mato Grosso' }, { value: 'MS', label: 'Mato Grosso do Sul' },
  { value: 'MG', label: 'Minas Gerais' }, { value: 'PA', label: 'Pará' },
  { value: 'PB', label: 'Paraíba' }, { value: 'PR', label: 'Paraná' },
  { value: 'PE', label: 'Pernambuco' }, { value: 'PI', label: 'Piauí' },
  { value: 'RJ', label: 'Rio de Janeiro' }, { value: 'RN', label: 'Rio Grande do Norte' },
  { value: 'RS', label: 'Rio Grande do Sul' }, { value: 'RO', label: 'Rondônia' },
  { value: 'RR', label: 'Roraima' }, { value: 'SC', label: 'Santa Catarina' },
  { value: 'SP', label: 'São Paulo' }, { value: 'SE', label: 'Sergipe' },
  { value: 'TO', label: 'Tocantins' }
];

// US states
const US_STATES = [
  { value: 'AL', label: 'Alabama' }, { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' }, { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' }, { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' }, { value: 'DE', label: 'Delaware' },
  { value: 'FL', label: 'Florida' }, { value: 'GA', label: 'Georgia' },
  { value: 'HI', label: 'Hawaii' }, { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' }, { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' }, { value: 'KS', label: 'Kansas' },
  { value: 'KY', label: 'Kentucky' }, { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' }, { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' }, { value: 'MI', label: 'Michigan' },
  { value: 'MN', label: 'Minnesota' }, { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' }, { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' }, { value: 'NV', label: 'Nevada' },
  { value: 'NH', label: 'New Hampshire' }, { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' }, { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' }, { value: 'ND', label: 'North Dakota' },
  { value: 'OH', label: 'Ohio' }, { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' }, { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' }, { value: 'SC', label: 'South Carolina' },
  { value: 'SD', label: 'South Dakota' }, { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' }, { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' }, { value: 'VA', label: 'Virginia' },
  { value: 'WA', label: 'Washington' }, { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' }, { value: 'WY', label: 'Wyoming' }
];

// Validation functions
const validateCNPJ = (cnpj: string): boolean => {
  const cleaned = cnpj.replace(/\D/g, '');
  if (cleaned.length !== 14) return false;
  if (/^(\d)\1+$/.test(cleaned)) return false;
  
  let sum = 0;
  let weight = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (let i = 0; i < 12; i++) sum += parseInt(cleaned[i]) * weight[i];
  let digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (parseInt(cleaned[12]) !== digit) return false;
  
  sum = 0;
  weight = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (let i = 0; i < 13; i++) sum += parseInt(cleaned[i]) * weight[i];
  digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return parseInt(cleaned[13]) === digit;
};

const validateEIN = (ein: string): boolean => {
  const cleaned = ein.replace(/\D/g, '');
  return cleaned.length === 9;
};

const formatCNPJ = (value: string): string => {
  const cleaned = value.replace(/\D/g, '').slice(0, 14);
  return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    .replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})$/, '$1.$2.$3/$4-$5')
    .replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})$/, '$1.$2.$3/$4')
    .replace(/^(\d{2})(\d{3})(\d{0,3})$/, '$1.$2.$3')
    .replace(/^(\d{2})(\d{0,3})$/, '$1.$2')
    .replace(/^(\d{0,2})$/, '$1');
};

const formatEIN = (value: string): string => {
  const cleaned = value.replace(/\D/g, '').slice(0, 9);
  if (cleaned.length > 2) return `${cleaned.slice(0, 2)}-${cleaned.slice(2)}`;
  return cleaned;
};

const formatPhoneBR = (value: string): string => {
  const cleaned = value.replace(/\D/g, '').slice(0, 11);
  if (cleaned.length > 10) return cleaned.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  if (cleaned.length > 6) return cleaned.replace(/^(\d{2})(\d{4})(\d{0,4})$/, '($1) $2-$3');
  if (cleaned.length > 2) return cleaned.replace(/^(\d{2})(\d{0,5})$/, '($1) $2');
  return cleaned;
};

const formatPhoneUS = (value: string): string => {
  const cleaned = value.replace(/\D/g, '').slice(0, 10);
  if (cleaned.length > 6) return cleaned.replace(/^(\d{3})(\d{3})(\d{0,4})$/, '($1) $2-$3');
  if (cleaned.length > 3) return cleaned.replace(/^(\d{3})(\d{0,3})$/, '($1) $2');
  return cleaned;
};

const formatZipCodeBR = (value: string): string => {
  const cleaned = value.replace(/\D/g, '').slice(0, 8);
  if (cleaned.length > 5) return cleaned.replace(/^(\d{5})(\d{0,3})$/, '$1-$2');
  return cleaned;
};

const formatZipCodeUS = (value: string): string => {
  const cleaned = value.replace(/\D/g, '').slice(0, 9);
  if (cleaned.length > 5) return cleaned.replace(/^(\d{5})(\d{0,4})$/, '$1-$2');
  return cleaned;
};

export default function Register() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  
  // Form data
  const [country, setCountry] = useState<Country>('BR');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Company data
  const [companyName, setCompanyName] = useState('');
  const [taxId, setTaxId] = useState(''); // CNPJ for BR, EIN/ITIN for US
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  
  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Update language based on country
  useEffect(() => {
    if (country === 'BR' && i18n.language !== 'pt') {
      i18n.changeLanguage('pt');
    } else if (country === 'US' && i18n.language !== 'en') {
      i18n.changeLanguage('en');
    }
  }, [country, i18n]);

  const states = country === 'BR' ? BR_STATES : US_STATES;

  const validateStep1 = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!fullName || fullName.length < 3) {
      newErrors.fullName = t('register.errors.fullNameRequired', 'Full name must have at least 3 characters');
    }
    
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = t('register.errors.invalidEmail', 'Invalid email');
    }
    
    const phoneClean = phone.replace(/\D/g, '');
    if (country === 'BR' && (phoneClean.length < 10 || phoneClean.length > 11)) {
      newErrors.phone = t('register.errors.invalidPhoneBR', 'Invalid phone number');
    } else if (country === 'US' && phoneClean.length !== 10) {
      newErrors.phone = t('register.errors.invalidPhoneUS', 'Invalid phone number');
    }
    
    if (!password || password.length < 12) {
      newErrors.password = t('register.errors.passwordLength', 'Password must have at least 12 characters');
    } else if (!/[A-Z]/.test(password)) {
      newErrors.password = t('register.errors.passwordUppercase', 'Password must contain an uppercase letter');
    } else if (!/[a-z]/.test(password)) {
      newErrors.password = t('register.errors.passwordLowercase', 'Password must contain a lowercase letter');
    } else if (!/[0-9]/.test(password)) {
      newErrors.password = t('register.errors.passwordNumber', 'Password must contain a number');
    } else if (!/[^A-Za-z0-9]/.test(password)) {
      newErrors.password = t('register.errors.passwordSpecial', 'Password must contain a special character');
    }
    
    if (password !== confirmPassword) {
      newErrors.confirmPassword = t('register.errors.passwordMismatch', 'Passwords do not match');
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!companyName || companyName.length < 2) {
      newErrors.companyName = t('register.errors.companyNameRequired', 'Company name is required');
    }
    
    if (country === 'BR') {
      if (!taxId || !validateCNPJ(taxId)) {
        newErrors.taxId = t('register.errors.invalidCNPJ', 'Invalid CNPJ');
      }
    } else {
      if (!taxId || !validateEIN(taxId)) {
        newErrors.taxId = t('register.errors.invalidEIN', 'Invalid EIN');
      }
    }
    
    if (!street) newErrors.street = t('register.errors.streetRequired', 'Street is required');
    if (!number) newErrors.number = t('register.errors.numberRequired', 'Number is required');
    if (!city) newErrors.city = t('register.errors.cityRequired', 'City is required');
    if (!state) newErrors.state = t('register.errors.stateRequired', 'State is required');
    
    const zipClean = zipCode.replace(/\D/g, '');
    if (country === 'BR' && zipClean.length !== 8) {
      newErrors.zipCode = t('register.errors.invalidZipBR', 'Invalid CEP');
    } else if (country === 'US' && (zipClean.length !== 5 && zipClean.length !== 9)) {
      newErrors.zipCode = t('register.errors.invalidZipUS', 'Invalid ZIP code');
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNextStep = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    }
  };

  const handlePrevStep = () => {
    if (step === 2) setStep(1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateStep2()) return;
    
    if (!acceptTerms) {
      toast({
        variant: "destructive",
        title: t('register.errors.termsRequired', 'Terms required'),
        description: t('register.errors.acceptTerms', 'You must accept the terms of service'),
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Call self-register API
      const result = await apiClient.invokePublic('self-register', {
        body: {
          country,
          fullName,
          email,
          phone: phone.replace(/\D/g, ''),
          password,
          company: {
            name: companyName,
            taxId: taxId.replace(/\D/g, ''),
            address: {
              street,
              number,
              complement,
              neighborhood: country === 'BR' ? neighborhood : undefined,
              city,
              state,
              zipCode: zipCode.replace(/\D/g, ''),
              country
            }
          }
        }
      });

      if (result.error) {
        throw new Error(result.error.message || 'Registration failed');
      }

      // Auto-login after successful registration
      toast({
        title: t('register.success.title', 'Account created!'),
        description: t('register.success.description', 'Your trial account has been created. Logging you in...'),
      });

      // Sign in with the new credentials
      const session = await cognitoAuth.signIn(email, password);
      
      if (session && 'user' in session) {
        setTimeout(() => navigate("/app"), 1000);
      } else {
        // If auto-login fails, redirect to login page
        setTimeout(() => navigate("/auth"), 2000);
      }
      
    } catch (error: any) {
      console.error('Registration error:', error);
      
      let errorMessage = t('register.errors.generic', 'An error occurred. Please try again.');
      
      if (error.message?.includes('email already exists') || error.message?.includes('UsernameExistsException')) {
        errorMessage = t('register.errors.emailExists', 'This email is already registered');
      } else if (error.message?.includes('company already exists')) {
        errorMessage = t('register.errors.companyExists', 'A company with this tax ID is already registered');
      } else if (error.message?.includes('license')) {
        errorMessage = t('register.errors.licenseError', 'Error creating trial license. Please contact support.');
      }
      
      toast({
        variant: "destructive",
        title: t('register.errors.title', 'Registration failed'),
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTaxIdChange = (value: string) => {
    if (country === 'BR') {
      setTaxId(formatCNPJ(value));
    } else {
      setTaxId(formatEIN(value));
    }
  };

  const handlePhoneChange = (value: string) => {
    if (country === 'BR') {
      setPhone(formatPhoneBR(value));
    } else {
      setPhone(formatPhoneUS(value));
    }
  };

  const handleZipCodeChange = (value: string) => {
    if (country === 'BR') {
      setZipCode(formatZipCodeBR(value));
    } else {
      setZipCode(formatZipCodeUS(value));
    }
  };

  const handleCountryChange = (newCountry: Country) => {
    setCountry(newCountry);
    // Reset fields that have different formats
    setTaxId('');
    setPhone('');
    setZipCode('');
    setState('');
    setNeighborhood('');
  };

  return (
    <div className="min-h-screen animated-gradient flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6 animate-fade-in">
          <div className="inline-flex items-center justify-center mb-2">
            <img src={evoLogo} alt="EVO Cloud Intelligence" className="h-12" />
          </div>
          <p className="text-sm text-muted-foreground">
            {t('register.subtitle', 'Start your free trial')}
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-6 gap-2">
          <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            {step > 1 ? <Check className="h-4 w-4" /> : '1'}
          </div>
          <div className={`w-16 h-1 ${step > 1 ? 'bg-primary' : 'bg-muted'}`} />
          <div className={`flex items-center justify-center w-8 h-8 rounded-full ${step >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            2
          </div>
        </div>

        <Card className="animate-scale-in relative overflow-hidden border-2 border-primary/20 hover:border-primary/40 transition-all duration-500">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 pointer-events-none" />
          
          <CardHeader className="pb-4 relative z-10">
            <CardTitle className="text-xl">
              {step === 1 
                ? t('register.step1.title', 'Personal Information')
                : t('register.step2.title', 'Company Information')
              }
            </CardTitle>
            <CardDescription>
              {step === 1 
                ? t('register.step1.description', 'Enter your personal details')
                : t('register.step2.description', 'Enter your company details')
              }
            </CardDescription>
          </CardHeader>

          <CardContent className="relative z-10">
            <form onSubmit={step === 2 ? handleSubmit : (e) => { e.preventDefault(); handleNextStep(); }}>
              {/* Country Selector - Always visible */}
              <div className="mb-6">
                <Label className="text-sm font-medium mb-2 block">
                  {t('register.country', 'Country')}
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant={country === 'BR' ? 'default' : 'outline'}
                    className={`h-12 ${country === 'BR' ? 'bg-gradient-primary' : ''}`}
                    onClick={() => handleCountryChange('BR')}
                  >
                    <span className="mr-2">🇧🇷</span>
                    Brasil
                  </Button>
                  <Button
                    type="button"
                    variant={country === 'US' ? 'default' : 'outline'}
                    className={`h-12 ${country === 'US' ? 'bg-gradient-primary' : ''}`}
                    onClick={() => handleCountryChange('US')}
                  >
                    <span className="mr-2">🇺🇸</span>
                    United States
                  </Button>
                </div>
              </div>

              {step === 1 && (
                <div className="space-y-4">
                  {/* Full Name */}
                  <div className="space-y-2">
                    <Label htmlFor="fullName">{t('register.fullName', 'Full Name')} *</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="fullName"
                        type="text"
                        placeholder={t('register.fullNamePlaceholder', 'John Doe')}
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className={`pl-10 ${errors.fullName ? 'border-destructive' : ''}`}
                        disabled={isLoading}
                      />
                    </div>
                    {errors.fullName && <p className="text-xs text-destructive">{errors.fullName}</p>}
                  </div>

                  {/* Email */}
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('register.email', 'Corporate Email')} *</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder={t('register.emailPlaceholder', 'you@company.com')}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={`pl-10 ${errors.email ? 'border-destructive' : ''}`}
                        disabled={isLoading}
                      />
                    </div>
                    {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                  </div>

                  {/* Phone */}
                  <div className="space-y-2">
                    <Label htmlFor="phone">{t('register.phone', 'Phone')} *</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="phone"
                        type="tel"
                        placeholder={country === 'BR' ? '(11) 99999-9999' : '(555) 123-4567'}
                        value={phone}
                        onChange={(e) => handlePhoneChange(e.target.value)}
                        className={`pl-10 ${errors.phone ? 'border-destructive' : ''}`}
                        disabled={isLoading}
                      />
                    </div>
                    {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
                  </div>

                  {/* Password */}
                  <div className="space-y-2">
                    <Label htmlFor="password">{t('register.password', 'Password')} *</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`pl-10 pr-10 ${errors.password ? 'border-destructive' : ''}`}
                        disabled={isLoading}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                    <p className="text-xs text-muted-foreground">
                      {t('register.passwordHint', 'Min 12 chars, uppercase, lowercase, number, special char')}
                    </p>
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">{t('register.confirmPassword', 'Confirm Password')} *</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="••••••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={`pl-10 pr-10 ${errors.confirmPassword ? 'border-destructive' : ''}`}
                        disabled={isLoading}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
                  </div>

                  <Button type="submit" className="w-full bg-gradient-primary mt-4">
                    {t('register.next', 'Next')}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  {/* Company Name */}
                  <div className="space-y-2">
                    <Label htmlFor="companyName">{t('register.companyName', 'Company Name')} *</Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="companyName"
                        type="text"
                        placeholder={t('register.companyNamePlaceholder', 'Acme Inc.')}
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className={`pl-10 ${errors.companyName ? 'border-destructive' : ''}`}
                        disabled={isLoading}
                      />
                    </div>
                    {errors.companyName && <p className="text-xs text-destructive">{errors.companyName}</p>}
                  </div>

                  {/* Tax ID (CNPJ / EIN) */}
                  <div className="space-y-2">
                    <Label htmlFor="taxId">
                      {country === 'BR' ? 'CNPJ' : 'EIN (Employer Identification Number)'} *
                    </Label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="taxId"
                        type="text"
                        placeholder={country === 'BR' ? '00.000.000/0000-00' : '00-0000000'}
                        value={taxId}
                        onChange={(e) => handleTaxIdChange(e.target.value)}
                        className={`pl-10 ${errors.taxId ? 'border-destructive' : ''}`}
                        disabled={isLoading}
                      />
                    </div>
                    {errors.taxId && <p className="text-xs text-destructive">{errors.taxId}</p>}
                  </div>

                  {/* Address */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="street">{t('register.street', 'Street')} *</Label>
                      <Input
                        id="street"
                        type="text"
                        placeholder={country === 'BR' ? 'Av. Paulista' : '123 Main St'}
                        value={street}
                        onChange={(e) => setStreet(e.target.value)}
                        className={errors.street ? 'border-destructive' : ''}
                        disabled={isLoading}
                      />
                      {errors.street && <p className="text-xs text-destructive">{errors.street}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="number">{t('register.number', 'Number')} *</Label>
                      <Input
                        id="number"
                        type="text"
                        placeholder="1000"
                        value={number}
                        onChange={(e) => setNumber(e.target.value)}
                        className={errors.number ? 'border-destructive' : ''}
                        disabled={isLoading}
                      />
                      {errors.number && <p className="text-xs text-destructive">{errors.number}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="complement">{t('register.complement', 'Complement')}</Label>
                      <Input
                        id="complement"
                        type="text"
                        placeholder={country === 'BR' ? 'Sala 101' : 'Suite 100'}
                        value={complement}
                        onChange={(e) => setComplement(e.target.value)}
                        disabled={isLoading}
                      />
                    </div>
                    {country === 'BR' && (
                      <div className="space-y-2">
                        <Label htmlFor="neighborhood">{t('register.neighborhood', 'Neighborhood')}</Label>
                        <Input
                          id="neighborhood"
                          type="text"
                          placeholder="Bela Vista"
                          value={neighborhood}
                          onChange={(e) => setNeighborhood(e.target.value)}
                          disabled={isLoading}
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="city">{t('register.city', 'City')} *</Label>
                      <Input
                        id="city"
                        type="text"
                        placeholder={country === 'BR' ? 'São Paulo' : 'New York'}
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className={errors.city ? 'border-destructive' : ''}
                        disabled={isLoading}
                      />
                      {errors.city && <p className="text-xs text-destructive">{errors.city}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">{t('register.state', 'State')} *</Label>
                      <Select value={state} onValueChange={setState} disabled={isLoading}>
                        <SelectTrigger className={errors.state ? 'border-destructive' : ''}>
                          <SelectValue placeholder={t('register.selectState', 'Select state')} />
                        </SelectTrigger>
                        <SelectContent>
                          {states.map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.state && <p className="text-xs text-destructive">{errors.state}</p>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="zipCode">{country === 'BR' ? 'CEP' : 'ZIP Code'} *</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="zipCode"
                        type="text"
                        placeholder={country === 'BR' ? '01310-100' : '10001'}
                        value={zipCode}
                        onChange={(e) => handleZipCodeChange(e.target.value)}
                        className={`pl-10 ${errors.zipCode ? 'border-destructive' : ''}`}
                        disabled={isLoading}
                      />
                    </div>
                    {errors.zipCode && <p className="text-xs text-destructive">{errors.zipCode}</p>}
                  </div>

                  {/* Terms */}
                  <div className="flex items-start space-x-2 pt-2">
                    <Checkbox
                      id="terms"
                      checked={acceptTerms}
                      onCheckedChange={(checked) => setAcceptTerms(checked as boolean)}
                      disabled={isLoading}
                    />
                    <label htmlFor="terms" className="text-sm text-muted-foreground leading-tight">
                      {t('register.acceptTerms', 'I accept the')}{' '}
                      <Link to="/terms" target="_blank" className="text-primary hover:underline">
                        {t('register.termsOfService', 'Terms of Service')}
                      </Link>
                      {' '}{t('register.and', 'and')}{' '}
                      <Link to="/privacy" target="_blank" className="text-primary hover:underline">
                        {t('register.privacyPolicy', 'Privacy Policy')}
                      </Link>
                    </label>
                  </div>

                  <div className="flex gap-3 mt-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={handlePrevStep}
                      disabled={isLoading}
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      {t('register.back', 'Back')}
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 bg-gradient-primary"
                      disabled={isLoading || !acceptTerms}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t('register.creating', 'Creating...')}
                        </>
                      ) : (
                        <>
                          {t('register.createAccount', 'Create Account')}
                          <Check className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-4 space-y-2">
          <p className="text-sm text-muted-foreground">
            {t('register.alreadyHaveAccount', 'Already have an account?')}{' '}
            <Link to="/auth" className="text-primary hover:underline font-medium">
              {t('register.login', 'Login')}
            </Link>
          </p>
          <p className="text-xs text-muted-foreground/60 font-mono">
            EVO {getVersionString()}
          </p>
        </div>
      </div>
    </div>
  );
}