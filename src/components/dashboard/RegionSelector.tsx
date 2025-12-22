import { useState } from "react";
import { Check, X, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const AWS_REGIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-east-2", label: "US East (Ohio)" },
  { value: "us-west-1", label: "US West (N. California)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "af-south-1", label: "Africa (Cape Town)" },
  { value: "ap-east-1", label: "Asia Pacific (Hong Kong)" },
  { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
  { value: "ap-northeast-2", label: "Asia Pacific (Seoul)" },
  { value: "ap-northeast-3", label: "Asia Pacific (Osaka)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
  { value: "ca-central-1", label: "Canada (Central)" },
  { value: "eu-central-1", label: "Europe (Frankfurt)" },
  { value: "eu-west-1", label: "Europe (Ireland)" },
  { value: "eu-west-2", label: "Europe (London)" },
  { value: "eu-west-3", label: "Europe (Paris)" },
  { value: "eu-north-1", label: "Europe (Stockholm)" },
  { value: "eu-south-1", label: "Europe (Milan)" },
  { value: "me-south-1", label: "Middle East (Bahrain)" },
  { value: "sa-east-1", label: "South America (São Paulo)" },
];

interface RegionSelectorProps {
  selectedRegions: string[];
  onChange: (regions: string[]) => void;
}

export const RegionSelector = ({ selectedRegions, onChange }: RegionSelectorProps) => {
  const [open, setOpen] = useState(false);

  const handleSelect = (regionValue: string) => {
    if (selectedRegions.includes(regionValue)) {
      onChange(selectedRegions.filter((r) => r !== regionValue));
    } else {
      onChange([...selectedRegions, regionValue]);
    }
  };

  const handleRemove = (regionValue: string) => {
    onChange(selectedRegions.filter((r) => r !== regionValue));
  };

  return (
    <div className="space-y-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Adicionar Região
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0 bg-background border-border z-50" align="start">
          <Command className="bg-background">
            <CommandInput placeholder="Buscar região..." className="border-0" />
            <CommandList className="max-h-[300px]">
              <CommandEmpty>Nenhuma região encontrada.</CommandEmpty>
              <CommandGroup>
                {AWS_REGIONS.map((region) => (
                  <CommandItem
                    key={region.value}
                    value={region.value}
                    onSelect={() => {
                      handleSelect(region.value);
                    }}
                    className="cursor-pointer hover:bg-muted"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedRegions.includes(region.value) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="font-medium">{region.value}</span>
                      <span className="text-xs text-muted-foreground">{region.label}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedRegions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedRegions.map((regionValue) => {
            const region = AWS_REGIONS.find((r) => r.value === regionValue);
            return (
              <Badge
                key={regionValue}
                variant="secondary"
                className="pl-3 pr-2 py-1 gap-2"
              >
                <span className="text-sm">{regionValue}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 p-0 hover:bg-transparent"
                  onClick={() => handleRemove(regionValue)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
};
