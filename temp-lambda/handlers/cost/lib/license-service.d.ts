/**
 * License Service - External License Validation
 * Integrates with external license validation API
 */
interface ExternalLicense {
    license_key: string;
    product_type: string;
    status: string;
    total_seats: number;
    used_seats: number;
    available_seats: number;
    valid_from: string;
    valid_until: string;
    is_expired: boolean;
    has_available_seats: boolean;
    is_trial: boolean;
    days_remaining: number;
}
interface ExternalLicenseResponse {
    valid: boolean;
    customer_id: string;
    total_licenses: number;
    licenses: ExternalLicense[];
    error?: string;
}
interface SyncResult {
    success: boolean;
    organizationId: string;
    customerId: string;
    licensesFound: number;
    licensesSynced: number;
    errors: string[];
}
export declare function fetchExternalLicenses(customerId: string): Promise<ExternalLicenseResponse>;
export declare function syncOrganizationLicenses(organizationId: string): Promise<SyncResult>;
export declare function syncAllOrganizationLicenses(): Promise<SyncResult[]>;
export declare function assignSeat(licenseId: string, userId: string, assignedBy?: string): Promise<{
    success: boolean;
    error?: string;
}>;
export declare function revokeSeat(licenseId: string, userId: string): Promise<{
    success: boolean;
    error?: string;
}>;
export declare function hasValidLicense(organizationId: string): Promise<boolean>;
export declare function getLicenseSummary(organizationId: string): Promise<{
    hasLicense: boolean;
    customerId: any;
    lastSync: any;
    syncStatus: any;
    licenses: any;
}>;
export {};
//# sourceMappingURL=license-service.d.ts.map