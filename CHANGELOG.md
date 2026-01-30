# EVO Platform - Changelog

## Version 2.1.0 (November 24, 2024)

### 🚨 Critical Fixes
- Fixed critical login error: "Database error granting user" issue
- Added password visibility toggle for all password fields
- Improved security with maintained secure password handling

### 📚 Knowledge Base System - Complete Overhaul
- 9 new tables with complete organization isolation
- AI-powered features: auto tag suggestions, smart summaries, writing improvements
- Multi-format export: PDF, Markdown, HTML, Confluence
- Analytics dashboard with engagement metrics
- Full-text search with tsvector

### 🛡️ Security & Isolation
- Complete RLS policies on all new tables
- Organization-scoped data access
- Edge function security with proper validation

---

## Version 2.0.0 (November 24, 2025)

### 🚀 Major Features

#### Threat Detection & Security
- AWS GuardDuty integration with real-time threat detection
- IAM Behavioral Analysis (ML-Powered) using Google Gemini
- Lateral Movement Detection (AI-Powered)

#### Cost Optimization 2.0
- ML-Based Waste Detection with Google Gemini 2.5 Flash
- Advanced Resource Optimization with pattern-based recommendations
- Auto-scaling configuration generation

#### Collaboration & Team Features
- Resource Comments System with @mentions
- Knowledge Base with categorized articles
- Runbooks with execution tracking
- Report Templates with scheduled delivery
- Error Knowledge Base

#### Infrastructure & Performance
- Enhanced Infrastructure Topology with VPC grouping
- Dashboard Layout Customization (Drag & Drop)
- Virtual Scrolling for large data tables
- Lazy Loading with code splitting

### 🔒 Security Enhancements
- Comprehensive RLS policies on all tables
- Session-based cache isolation
- User role verification on sensitive operations

### 📊 New Database Tables
- guardduty_findings, iam_behavior_analysis, lateral_movement_detections
- resource_utilization_ml, resource_comments, mention_notifications
- knowledge_base_articles, runbooks, report_templates
- error_knowledge_base, dashboard_layouts

### 🔧 New Edge Functions
- guardduty-scan, ml-waste-detection
- iam-behavior-analysis, lateral-movement-detection

---

For detailed information, see the steering documentation in `.kiro/steering/`.
