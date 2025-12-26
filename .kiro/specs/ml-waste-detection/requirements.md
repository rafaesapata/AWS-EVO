# ML-Powered Waste Detection 2.0 - Requirements Specification

## Overview

ML-Powered Waste Detection 2.0 is an advanced feature that uses machine learning algorithms to analyze AWS resource utilization patterns and identify waste opportunities. The system collects real CloudWatch metrics, applies ML models to detect underutilized resources, and provides actionable recommendations with confidence scores.

## Current Implementation Status

### ✅ Implemented Features

1. **ML Analysis Library** (`backend/src/lib/ml-analysis/`)
   - Statistical analysis functions (mean, stdDev, percentile)
   - Utilization pattern analysis (peak hours, weekday patterns)
   - ML classification algorithm with confidence scoring
   - Auto-scaling configuration recommendations

2. **Cost Pricing Module** (`backend/src/lib/cost/pricing.ts`)
   - EC2, RDS, Lambda, ElastiCache pricing tables
   - Downsize recommendation mapping
   - Cost calculation functions

3. **Enhanced ML Waste Detection Lambda** (`ml-waste-detection.ts`)
   - Multi-resource analysis (EC2, RDS, Lambda)
   - 7-day CloudWatch metrics collection
   - ML-based classification (terminate, downsize, auto-scale, optimize)
   - Results saved to `resource_utilization_ml` table
   - Confidence scoring based on data quality

4. **Database Schema**
   - `ResourceUtilizationML` model in Prisma schema
   - `resource_utilization_ml` table created in PostgreSQL
   - Proper indexes for organization_id, aws_account_id, recommendation_type

5. **Frontend Dashboard** (`MLWasteDetection.tsx`)
   - Summary cards (Potential Savings, Downsize Opportunities, Auto-Scaling Ready)
   - ML Optimization Recommendations list with utilization patterns
   - Auto-scaling configuration display
   - Implementation complexity badges

6. **Query Table Lambda**
   - Updated with `resource_utilization_ml` table mapping
   - Proper field mapping for aws_account_id

### ❌ Future Enhancements (Not Critical)

1. **Advanced ML Models**
   - Time-series forecasting for workload prediction
   - Seasonal pattern detection
   - Anomaly detection using z-score

2. **Additional Resource Types**
   - ECS services analysis
   - ElastiCache clusters analysis
   - API Gateway analysis

3. **Enhanced Visualizations**
   - Utilization pattern charts
   - Weekly/daily pattern graphs
   - Cost trend visualization

---

## User Stories

### US-001: Resource Utilization Analysis
**As a** cloud administrator  
**I want to** analyze resource utilization patterns using ML  
**So that** I can identify underutilized resources and optimize costs

**Acceptance Criteria:**
- [ ] System collects CloudWatch metrics for EC2, RDS, Lambda, ECS, ElastiCache
- [ ] ML model analyzes 7-day utilization patterns
- [ ] System identifies idle, underutilized, and oversized resources
- [ ] Confidence score (0-100%) provided for each recommendation
- [ ] Results stored in `resource_utilization_ml` table

### US-002: Downsize Recommendations
**As a** cloud administrator  
**I want to** receive specific downsize recommendations  
**So that** I can right-size my resources without manual analysis

**Acceptance Criteria:**
- [ ] System recommends specific instance types for downsizing
- [ ] Recommendations include current vs recommended size
- [ ] Estimated monthly savings calculated accurately
- [ ] Implementation complexity rating provided (low/medium/high)
- [ ] Recommendations consider peak usage patterns

### US-003: Auto-Scaling Suggestions
**As a** cloud administrator  
**I want to** receive auto-scaling configuration suggestions  
**So that** I can implement dynamic scaling based on usage patterns

**Acceptance Criteria:**
- [ ] System identifies resources eligible for auto-scaling
- [ ] Suggested min/max capacity based on historical patterns
- [ ] Target CPU/memory thresholds recommended
- [ ] Scale-in/scale-out policies suggested
- [ ] Estimated cost impact of auto-scaling provided

### US-004: Utilization Pattern Visualization
**As a** cloud administrator  
**I want to** see utilization patterns for each resource  
**So that** I can understand usage behavior before making changes

**Acceptance Criteria:**
- [ ] Average CPU utilization displayed
- [ ] Average memory utilization displayed
- [ ] Peak hours identified and displayed
- [ ] Weekly/daily patterns visualized
- [ ] Real metrics badge shown when using actual CloudWatch data

### US-005: Multi-Resource Type Support
**As a** cloud administrator  
**I want to** analyze all major AWS resource types  
**So that** I have comprehensive waste detection coverage

**Acceptance Criteria:**
- [ ] EC2 instances analyzed (CPU, memory, network)
- [ ] RDS instances analyzed (connections, CPU, storage)
- [ ] Lambda functions analyzed (invocations, duration, errors)
- [ ] ECS services analyzed (CPU, memory utilization)
- [ ] ElastiCache clusters analyzed (CPU, connections)
- [ ] Load Balancers analyzed (request count, latency)

### US-006: Waste Type Classification
**As a** cloud administrator  
**I want to** see waste classified by type  
**So that** I can prioritize remediation efforts

**Acceptance Criteria:**
- [ ] Idle resources identified (< 1% utilization)
- [ ] Underutilized resources identified (< 20% utilization)
- [ ] Oversized resources identified (can be downsized)
- [ ] Zombie resources identified (no activity for 7+ days)
- [ ] Orphaned resources identified (unattached volumes, unused IPs)

### US-007: Cost Impact Analysis
**As a** cloud administrator  
**I want to** see accurate cost impact for each recommendation  
**So that** I can prioritize high-value optimizations

**Acceptance Criteria:**
- [ ] Current monthly cost calculated per resource
- [ ] Estimated savings calculated per recommendation
- [ ] Total potential savings aggregated
- [ ] Savings breakdown by resource type
- [ ] Savings breakdown by region

---

## Technical Requirements

### TR-001: Database Schema Updates

Create `resource_utilization_ml` table with the following structure:

```sql
CREATE TABLE resource_utilization_ml (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  aws_account_id UUID NOT NULL,
  resource_id VARCHAR(255) NOT NULL,
  resource_name VARCHAR(255),
  resource_type VARCHAR(50) NOT NULL,
  region VARCHAR(50) NOT NULL,
  
  -- Current state
  current_size VARCHAR(50),
  current_monthly_cost DECIMAL(10,2),
  
  -- ML Analysis results
  recommendation_type VARCHAR(50), -- 'terminate', 'downsize', 'auto-scale', 'optimize'
  recommended_size VARCHAR(50),
  potential_monthly_savings DECIMAL(10,2),
  ml_confidence DECIMAL(5,4), -- 0.0000 to 1.0000
  
  -- Utilization patterns (JSONB)
  utilization_patterns JSONB,
  -- Example: {
  --   "avgCpuUsage": 12.5,
  --   "avgMemoryUsage": 45.2,
  --   "peakHours": [9, 10, 11, 14, 15],
  --   "weekdayPattern": [15, 18, 20, 22, 18, 5, 3],
  --   "hasRealMetrics": true
  -- }
  
  -- Auto-scaling configuration
  auto_scaling_eligible BOOLEAN DEFAULT false,
  auto_scaling_config JSONB,
  -- Example: {
  --   "min_capacity": 1,
  --   "max_capacity": 5,
  --   "target_cpu": 70,
  --   "scale_in_cooldown": 300,
  --   "scale_out_cooldown": 60
  -- }
  
  -- Metadata
  implementation_complexity VARCHAR(20), -- 'low', 'medium', 'high'
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, aws_account_id, resource_id)
);

CREATE INDEX idx_resource_utilization_ml_org ON resource_utilization_ml(organization_id);
CREATE INDEX idx_resource_utilization_ml_account ON resource_utilization_ml(aws_account_id);
CREATE INDEX idx_resource_utilization_ml_type ON resource_utilization_ml(recommendation_type);
```

### TR-002: ML Analysis Algorithm

Implement statistical analysis for waste detection:

1. **Data Collection** (7-day window)
   - Collect CloudWatch metrics every 5 minutes
   - Calculate hourly averages
   - Identify peak and off-peak periods

2. **Pattern Analysis**
   - Calculate mean, median, std deviation
   - Identify daily patterns (business hours vs off-hours)
   - Identify weekly patterns (weekday vs weekend)
   - Detect anomalies using z-score

3. **Classification Rules**
   - **Terminate**: avg < 1%, max < 5%, no connections for 7 days
   - **Downsize**: avg < 30%, peak < 60%, consistent pattern
   - **Auto-scale**: high variance (std > 20%), predictable peaks
   - **Optimize**: specific inefficiencies (wrong instance family)

4. **Confidence Calculation**
   - Based on data completeness (% of expected datapoints)
   - Based on pattern consistency (low variance = high confidence)
   - Based on analysis duration (more days = higher confidence)

### TR-003: Lambda Handler Updates

Update `ml-waste-detection.ts` to:

1. Analyze multiple resource types (EC2, RDS, Lambda, ECS)
2. Collect 7-day CloudWatch metrics
3. Apply ML classification algorithm
4. Calculate auto-scaling recommendations
5. Save results to `resource_utilization_ml` table
6. Return structured response matching frontend expectations

### TR-004: API Response Format

```typescript
interface MLWasteDetectionResponse {
  success: boolean;
  analyzed_resources: number;
  total_monthly_savings: number;
  recommendations: Array<{
    id: string;
    resource_id: string;
    resource_name: string;
    resource_type: string;
    region: string;
    current_size: string;
    recommended_size: string | null;
    recommendation_type: 'terminate' | 'downsize' | 'auto-scale' | 'optimize';
    potential_monthly_savings: number;
    ml_confidence: number;
    utilization_patterns: {
      avgCpuUsage: number;
      avgMemoryUsage: number;
      peakHours: number[];
      hasRealMetrics: boolean;
    };
    auto_scaling_eligible: boolean;
    auto_scaling_config: {
      min_capacity: number;
      max_capacity: number;
      target_cpu: number;
    } | null;
    implementation_complexity: 'low' | 'medium' | 'high';
    analyzed_at: string;
  }>;
  summary: {
    by_type: Record<string, { count: number; savings: number }>;
    by_region: Record<string, { count: number; savings: number }>;
    by_recommendation: Record<string, number>;
  };
}
```

---

## Implementation Tasks

### Phase 1: Database & Schema (Priority: High)
- [ ] Add `ResourceUtilizationML` model to Prisma schema
- [ ] Run migration to create table
- [ ] Update `query-table` Lambda with new table mapping

### Phase 2: Enhanced ML Analysis (Priority: High)
- [ ] Refactor `ml-waste-detection.ts` with new algorithm
- [ ] Add multi-resource type support
- [ ] Implement pattern analysis functions
- [ ] Add auto-scaling recommendation logic
- [ ] Save results to new table

### Phase 3: Frontend Updates (Priority: Medium)
- [ ] Update query to use correct table/fields
- [ ] Add utilization pattern charts
- [ ] Add auto-scaling configuration display
- [ ] Add implementation complexity badges

### Phase 4: Testing & Validation (Priority: High)
- [ ] Test with real AWS accounts
- [ ] Validate cost calculations
- [ ] Verify confidence scores accuracy
- [ ] Performance testing (stay under 29s timeout)

---

## Dependencies

- CloudWatch metrics collection (implemented via `fetch-cloudwatch-metrics`)
- AWS credentials management (implemented)
- Prisma ORM (implemented)
- React Query for frontend data fetching (implemented)

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| API Gateway 29s timeout | High | Process one account/region at a time, use pagination |
| Inaccurate cost estimates | Medium | Use AWS Pricing API or maintain updated cost tables |
| False positives | Medium | Require minimum 7-day data, use conservative thresholds |
| Missing CloudWatch data | Low | Handle gracefully, show "insufficient data" status |

---

## References

- #[[file:backend/src/handlers/cost/ml-waste-detection.ts]]
- #[[file:backend/src/handlers/cost/waste-detection-v2.ts]]
- #[[file:backend/src/handlers/monitoring/fetch-cloudwatch-metrics.ts]]
- #[[file:src/pages/MLWasteDetection.tsx]]
- #[[file:backend/prisma/schema.prisma]]
