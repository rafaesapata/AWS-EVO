import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { Globe } from "lucide-react";

interface GeoData {
  country: string;
  blockedRequests: number;
}

interface WafGeoDistributionProps {
  geoDistribution: GeoData[];
  isLoading: boolean;
}

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  CN: 'China',
  RU: 'Russia',
  BR: 'Brazil',
  IN: 'India',
  DE: 'Germany',
  FR: 'France',
  GB: 'United Kingdom',
  JP: 'Japan',
  KR: 'South Korea',
  NL: 'Netherlands',
  UA: 'Ukraine',
  VN: 'Vietnam',
  ID: 'Indonesia',
  TH: 'Thailand',
  PH: 'Philippines',
  MY: 'Malaysia',
  SG: 'Singapore',
  AU: 'Australia',
  CA: 'Canada',
  MX: 'Mexico',
  AR: 'Argentina',
  CL: 'Chile',
  CO: 'Colombia',
  PE: 'Peru',
  ZA: 'South Africa',
  EG: 'Egypt',
  NG: 'Nigeria',
  KE: 'Kenya',
  IR: 'Iran',
  PK: 'Pakistan',
  BD: 'Bangladesh',
  TR: 'Turkey',
  SA: 'Saudi Arabia',
  AE: 'UAE',
  IL: 'Israel',
  PL: 'Poland',
  IT: 'Italy',
  ES: 'Spain',
  PT: 'Portugal',
  SE: 'Sweden',
  NO: 'Norway',
  FI: 'Finland',
  DK: 'Denmark',
  CZ: 'Czech Republic',
  AT: 'Austria',
  CH: 'Switzerland',
  BE: 'Belgium',
  IE: 'Ireland',
  RO: 'Romania',
  HU: 'Hungary',
  GR: 'Greece',
};

const getCountryName = (code: string) => {
  return COUNTRY_NAMES[code] || code;
};

const COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
  '#f43f5e',
];

export function WafGeoDistribution({ geoDistribution, isLoading }: WafGeoDistributionProps) {
  const { t } = useTranslation();

  const chartData = geoDistribution.slice(0, 10).map((item, index) => ({
    country: item.country,
    name: getCountryName(item.country),
    value: item.blockedRequests,
    color: COLORS[index % COLORS.length],
  }));

  const total = geoDistribution.reduce((sum, item) => sum + item.blockedRequests, 0);

  return (
    <Card className="glass border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          {t('waf.geoDistribution')}
        </CardTitle>
        <CardDescription>{t('waf.geoDistributionDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
            <Globe className="h-12 w-12 mb-4 opacity-50" />
            <p>{t('waf.noGeoData')}</p>
          </div>
        ) : (
          <>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <XAxis type="number" hide />
                  <YAxis 
                    type="category" 
                    dataKey="country" 
                    width={40}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value: number) => [value.toLocaleString(), t('waf.blockedRequests')]}
                    labelFormatter={(label) => getCountryName(label)}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Country List */}
            <ScrollArea className="h-[100px] mt-4">
              <div className="space-y-2">
                {chartData.map((item, index) => (
                  <div key={item.country} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: item.color }}
                      />
                      <span>{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {((item.value / total) * 100).toFixed(1)}%
                      </span>
                      <span className="font-medium">{item.value.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  );
}
