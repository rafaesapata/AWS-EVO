-- Add ticket_type column to remediation_tickets
ALTER TABLE remediation_tickets 
ADD COLUMN ticket_type text NOT NULL DEFAULT 'improvement';

-- Add check constraint for valid ticket types
ALTER TABLE remediation_tickets 
ADD CONSTRAINT valid_ticket_type 
CHECK (ticket_type IN ('security', 'improvement', 'cost_optimization'));

-- Add compliance_check_id column to link tickets to compliance checks
ALTER TABLE remediation_tickets 
ADD COLUMN compliance_check_id uuid REFERENCES compliance_checks(id);

-- Create index for better performance
CREATE INDEX idx_remediation_tickets_compliance_check 
ON remediation_tickets(compliance_check_id);