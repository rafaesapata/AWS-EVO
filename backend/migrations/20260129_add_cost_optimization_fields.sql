-- Migration: Add missing fields to cost_optimizations table
-- Date: 2026-01-29
-- Description: Adds fields to store complete optimization data instead of estimates

-- Add new columns to cost_optimizations table
ALTER TABLE cost_optimizations 
ADD COLUMN IF NOT EXISTS resource_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS current_cost FLOAT,
ADD COLUMN IF NOT EXISTS optimized_cost FLOAT,
ADD COLUMN IF NOT EXISTS savings_percentage FLOAT,
ADD COLUMN IF NOT EXISTS recommendation TEXT,
ADD COLUMN IF NOT EXISTS details TEXT,
ADD COLUMN IF NOT EXISTS priority VARCHAR(20),
ADD COLUMN IF NOT EXISTS effort VARCHAR(20),
ADD COLUMN IF NOT EXISTS category VARCHAR(100);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_cost_optimizations_optimization_type ON cost_optimizations(optimization_type);
CREATE INDEX IF NOT EXISTS idx_cost_optimizations_priority ON cost_optimizations(priority);

-- Comment explaining the change
COMMENT ON COLUMN cost_optimizations.current_cost IS 'Current monthly cost of the resource';
COMMENT ON COLUMN cost_optimizations.optimized_cost IS 'Estimated cost after optimization';
COMMENT ON COLUMN cost_optimizations.savings_percentage IS 'Percentage of savings (0-100)';
COMMENT ON COLUMN cost_optimizations.recommendation IS 'Detailed recommendation text';
COMMENT ON COLUMN cost_optimizations.details IS 'Additional details about the optimization';
COMMENT ON COLUMN cost_optimizations.priority IS 'Priority level: high, medium, low';
COMMENT ON COLUMN cost_optimizations.effort IS 'Implementation effort: low, medium, high';
COMMENT ON COLUMN cost_optimizations.category IS 'Category: Idle Resources, Modernization, Right-sizing, etc.';
