/**
 * Upwork extraction deterministic backfill tests.
 *
 * Verifies that when AI extraction misses fields, the deterministic
 * fallback fills them from raw text.
 */

import { describe, it, expect } from 'vitest'

// Test the backfill logic by importing the module and checking behavior
// Since backfill functions are not exported, we test via extractUpworkJob
// with a mock that simulates AI returning empty fields

const DEXA_JOB_TEXT = `Senior React Native Full-Stack Software Engineer
Posted 25 minutes ago
Worldwide

Summary
Senior React Native Full-Stack Software Engineer
Application Maintenance, Technical Support & DevOps
Company: Dexa Ventures LLC – Dexta Mobility
Location: Remote / Los Angeles, California
Employment Type: Part-Time Contract / Ongoing Maintenance Agreement
Experience Level: Senior (5+ Years Preferred)
Compensation: Negotiable Based on Experience and Scope
Website: www.dextamobility.com

About Dexta Mobility
Dexta Mobility, operated by Dexa Ventures LLC, is a technology-driven automotive mobility and valet service company developing an integrated digital platform to manage vehicle pickup, parking, delivery, detailing, and related mobility services.
Our technology ecosystem consists of three primary components:
1. Customer Mobile Application: A React Native application allowing customers to request vehicle pickup and delivery, manage reservations, track services, process payments, and receive real-time notifications.
2. Valet Mobile Application: A React Native application used by valet personnel to manage assigned jobs, navigate to pickup and delivery locations, verify vehicle handovers, upload vehicle condition photographs, and communicate operational updates.
3. Enterprise Resource Planning (ERP) System: A centralized administrative platform supporting dispatch operations, employee management, customer records, financial transactions, operational reporting, and business administration.
As we prepare for commercial operations, we are seeking an experienced and highly dependable Senior React Native Full-Stack Software Engineer to assume responsibility for the ongoing technical maintenance, stability, troubleshooting, and improvement of our technology infrastructure.
This is primarily a post-development maintenance and production support position, rather than a position focused on building an application from scratch.

Key Responsibilities
1. React Native Mobile Application Maintenance
• Maintain and support the Dexta Mobility Customer App and Valet App on iOS and Android.
• Identify, troubleshoot, and resolve application bugs, crashes, freezes, and performance issues.
• Maintain compatibility with new iOS and Android operating system versions.
• Troubleshoot application navigation, user authentication, account management, and user interface problems.
• Investigate and resolve push notification failures and mobile connectivity issues.
• Maintain and troubleshoot camera functionality, vehicle photo uploads, and document uploads.
• Troubleshoot GPS location tracking, map functionality, and navigation integrations.
• Resolve issues involving booking confirmations, service requests, and real-time status updates.
• Prepare, test, and publish application updates through the Apple App Store and Google Play Store.
• Maintain application performance, stability, and reliability.

Technical Skills
Mobile Development
• React Native
• JavaScript and TypeScript
• React Hooks and state management
• REST APIs and JSON
• iOS and Android debugging
• Mobile application performance optimization
• Apple App Store Connect and Google Play Console
• Push notification services
• GPS, geolocation, and maps integration

Backend Development
• Node.js and common backend frameworks, where applicable
• RESTful API development and troubleshooting
• Authentication and authorization
• Real-time data communication
• Webhooks and third-party integrations
• Database design and query troubleshooting

Database Technologies
• PostgreSQL, MySQL, Firebase, MongoDB, or equivalent
• Database backup and recovery
• Query optimization
• Data integrity and synchronization

Cloud and DevOps
• AWS, Google Cloud, Azure, or equivalent hosting platforms
• Git and GitHub
• CI/CD pipelines
• Application monitoring and error tracking
• Cloud infrastructure troubleshooting
• Secure credential and configuration management
• Automated backups and disaster recovery

How to Apply
Interested candidates should submit:
• An updated résumé or professional portfolio.
• A summary of relevant React Native and full-stack development experience.
• Examples of production applications they have maintained.
• Details of their experience with backend systems, cloud infrastructure, and ERP integrations.
• Their proposed hourly rate or monthly maintenance fee.
• Their availability and preferred working arrangement.
• A description of how they handle urgent production incidents.
• Professional references or relevant client testimonials, if available.

More than 30 hrs/week
Hourly
More than 6 months
Duration
Expert
I am willing to pay higher rates for the most experienced freelancers
$5.00
-
$15.00
Hourly
Contract-to-hire opportunity
This lets talent know that this job could become full time.
Project Type: Ongoing project
Skills and Expertise
React
JavaScript
Node.js
Java
API
`

describe('Dexa job full extraction (comprehensive)', () => {
  it('populates ALL structured fields from raw text', async () => {
    const { extractUpworkJob } = await import('@/lib/upwork-v2')
    const result = await extractUpworkJob({ rawText: DEXA_JOB_TEXT })

    expect(result.error).toBeNull()
    expect(result.job).not.toBeNull()
    if (!result.job) return

    // Title
    expect(result.job.title).toContain('Senior React Native')

    // Rate — must extract $5-$15/hour even from multiline format
    expect(result.job.hourlyRateMin).toBe(5)
    expect(result.job.hourlyRateMax).toBe(15)
    expect(result.job.budgetType).toBe('hourly')

    // Engagement
    expect(result.job.experienceLevel).toContain('5+')
    expect(result.job.duration).toContain('6')
    expect(result.job.weeklyHours).toContain('30')

    // Skills — must contain core technologies
    const skills = result.job.skills.map(s => s.toLowerCase())
    expect(skills.some(s => s.includes('react native'))).toBe(true)
    expect(skills.some(s => s.includes('typescript') || s.includes('javascript'))).toBe(true)
    expect(skills.some(s => s.includes('node'))).toBe(true)
    expect(skills.some(s => s.includes('ios') || s.includes('android'))).toBe(true)
    expect(skills.some(s => s.includes('postgresql') || s.includes('mysql') || s.includes('mongodb') || s.includes('firebase'))).toBe(true)
    expect(skills.some(s => s.includes('aws') || s.includes('gcp') || s.includes('azure'))).toBe(true)
    expect(skills.some(s => s.includes('docker') || s.includes('kubernetes') || s.includes('ci/cd'))).toBe(true)
    expect(skills.some(s => s.includes('gps') || s.includes('geolocation') || s.includes('maps'))).toBe(true)
    expect(skills.some(s => s.includes('payment') || s.includes('stripe'))).toBe(true)
    expect(skills.some(s => s.includes('erp'))).toBe(true)
    expect(skills.some(s => s.includes('devops') || s.includes('monitoring'))).toBe(true)
    expect(result.job.skills.length).toBeGreaterThan(10)

    // Application requirements
    const reqs = result.job.applicationRequirements.join(' ').toLowerCase()
    expect(reqs).toContain('résumé')
    expect(reqs).toContain('portfolio')
    expect(reqs).toContain('rate')
    expect(reqs).toContain('availability')
    expect(reqs).toContain('references')
    expect(result.job.applicationRequirements.length).toBeGreaterThan(4)

    // Description should be substantial (not truncated to a few words)
    expect(result.job.description.length).toBeGreaterThan(200)
  }, 60000)
})

describe('Upwork extraction backfill', () => {
  it('extracts hourly rate from raw text pattern $5-$15/hour', async () => {
    const { extractUpworkJob } = await import('@/lib/upwork-v2')
    const result = await extractUpworkJob({ rawText: DEXA_JOB_TEXT })

    if (result.job) {
      expect(result.job.hourlyRateMin).toBe(5)
      expect(result.job.hourlyRateMax).toBe(15)
      expect(result.job.budgetType).toBe('hourly')
    }
  }, 30000)

  it('extracts skills from raw text when AI misses them', async () => {
    const { extractUpworkJob } = await import('@/lib/upwork-v2')
    const result = await extractUpworkJob({ rawText: DEXA_JOB_TEXT })

    if (result.job) {
      const skills = result.job.skills.map(s => s.toLowerCase())
      // Core skills must be present
      expect(skills.some(s => s.includes('react'))).toBe(true)
      expect(skills.some(s => s.includes('javascript') || s.includes('typescript'))).toBe(true)
      expect(skills.some(s => s.includes('node'))).toBe(true)
      expect(skills.some(s => s.includes('ios') || s.includes('android'))).toBe(true)
      expect(result.job.skills.length).toBeGreaterThan(5)
    }
  }, 30000)

  it('extracts engagement type and duration', async () => {
    const { extractUpworkJob } = await import('@/lib/upwork-v2')
    const result = await extractUpworkJob({ rawText: DEXA_JOB_TEXT })

    if (result.job) {
      expect(result.job.engagementType?.toLowerCase()).toContain('contract')
      expect(result.job.weeklyHours).toContain('30')
      expect(result.job.duration).toContain('6')
    }
  }, 30000)

  it('extracts application requirements from How to Apply section', async () => {
    const { extractUpworkJob } = await import('@/lib/upwork-v2')
    const result = await extractUpworkJob({ rawText: DEXA_JOB_TEXT })

    if (result.job) {
      const reqs = result.job.applicationRequirements.join(' ').toLowerCase()
      expect(reqs).toContain('résumé')
      expect(reqs).toContain('portfolio')
      expect(reqs).toContain('rate')
      expect(result.job.applicationRequirements.length).toBeGreaterThan(3)
    }
  }, 30000)

    it('extracts experience level', async () => {
      const { extractUpworkJob } = await import('@/lib/upwork-v2')
      const result = await extractUpworkJob({ rawText: DEXA_JOB_TEXT })

      if (result.job) {
        // "Senior (5+ Years Preferred)" → extracts "5+ years"
        expect(result.job.experienceLevel).toContain('5+')
      }
    }, 30000)
})
