import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Building2, Plus, Trash2, Search } from "lucide-react";

interface Profile {
  id: string;
  full_name: string;
  email: string;
}

interface Organization {
  id: string;
  name: string;
  domain: string;
}

interface UserOrganization {
  id: string;
  user_id: string;
  organization_id: string;
  is_primary: boolean;
  profiles: Profile;
  organizations: Organization;
}

export default function UserOrganizationManager() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [userOrganizations, setUserOrganizations] = useState<UserOrganization[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedOrg, setSelectedOrg] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    checkSuperAdminStatus();
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      loadData();
    }
  }, [isSuperAdmin]);

  const checkSuperAdminStatus = async () => {
    const user = await cognitoAuth.getCurrentUser();
    if (!user) return;

    const response = await apiClient.select(tableName, { eq: filters });
      const data = response.data;
      const error = response.error;
    setIsSuperAdmin(!!roles);
  };

  const loadData = async () => {
    // Load all profiles first
    const profilesResponse = await apiClient.select(tableName, { eq: filters });
      const profilesData = profilesResponse.data;
      const profilesError = profilesResponse.error;
          setProfiles(profilesData || []);

    // Load all organizations
    const orgsResponse = await apiClient.select(tableName, { eq: filters });
      const orgsData = orgsResponse.data;
      const orgsError = orgsResponse.error;
          setOrganizations(orgsData || []);

    // Load user organizations (without nested selects to avoid FK issues)
    const userOrgsResponse = await apiClient.select(tableName, { eq: filters });
      const userOrgsData = userOrgsResponse.data;
      const userOrgsError = userOrgsResponse.error;
          if (!userOrgsData || !profilesData || !orgsData) {
      setUserOrganizations([]);
      return;
    }

    // Manually join the data
    const userOrgs: UserOrganization[] = userOrgsRaw
      .map(uo => {
        const profile = profilesData.find(p => p.id === uo.user_id);
        const org = orgsData.find(o => o.id === uo.organization_id);
        
        if (!profile || !org) return null;
        
        return {
          ...uo,
          profiles: profile,
          organizations: org
        };
      })
      .filter((uo): uo is UserOrganization => uo !== null);

    setUserOrganizations(userOrgs);
  };

  const addUserToOrganization = async () => {
    if (!selectedUser || !selectedOrg) {
      toast({
        variant: "destructive",
        title: t('common.error'),
        description: "Please select both user and organization",
      });
      return;
    }

    setIsLoading(true);

    const { error } = await apiClient.post('/rpc/add_user_to_organization', {
      _user_id: selectedUser,
      _organization_id: selectedOrg,
      _is_primary: isPrimary
    });

    if (error) {
      toast({
        variant: "destructive",
        title: t('common.error'),
        description: error.message,
      });
    } else {
      toast({
        title: t('common.success'),
        description: "User added to organization successfully",
      });
      setSelectedUser("");
      setSelectedOrg("");
      setIsPrimary(false);
      loadData();
    }

    setIsLoading(false);
  };

  const removeUserFromOrganization = async (userId: string, orgId: string) => {
    if (!confirm("Are you sure you want to remove this user from the organization?")) {
      return;
    }

    const { error } = await apiClient.post('/rpc/remove_user_from_organization', {
      _user_id: userId,
      _organization_id: orgId
    });

    if (error) {
      toast({
        variant: "destructive",
        title: t('common.error'),
        description: error.message,
      });
    } else {
      toast({
        title: t('common.success'),
        description: "User removed from organization successfully",
      });
      loadData();
    }
  };

  if (!isSuperAdmin) {
    return null;
  }

  const filteredUserOrgs = userOrganizations.filter(uo => 
    uo.profiles.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    uo.profiles.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    uo.organizations.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <CardTitle>User Organization Management</CardTitle>
        </div>
        <CardDescription>
          Manage which users have access to which organizations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add user to organization form */}
        <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
          <h3 className="font-semibold">Add User to Organization</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>User</Label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.full_name} ({profile.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Organization</Label>
              <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                <SelectTrigger>
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name} ({org.domain})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Primary Organization</Label>
              <div className="flex items-center space-x-2 h-10">
                <input
                  type="checkbox"
                  checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-sm text-muted-foreground">Set as primary</span>
              </div>
            </div>
          </div>

          <Button
            onClick={addUserToOrganization}
            disabled={isLoading || !selectedUser || !selectedOrg}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add User to Organization
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users or organizations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* User organizations table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Primary</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUserOrgs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No user organizations found
                  </TableCell>
                </TableRow>
              ) : (
                filteredUserOrgs.map((uo) => (
                  <TableRow key={uo.id}>
                    <TableCell className="font-medium">{uo.profiles.full_name}</TableCell>
                    <TableCell>{uo.profiles.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{uo.organizations.name}</span>
                        <span className="text-xs text-muted-foreground">{uo.organizations.domain}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {uo.is_primary && (
                        <Badge variant="default">Primary</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeUserFromOrganization(uo.user_id, uo.organization_id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
